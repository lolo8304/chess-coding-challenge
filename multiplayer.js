const Multiplayer = {
  apiUrl: defaultChessApiUrl(),
  apiKey: "vpFJPgzELLUXHhgJ2234cTBtoPvamwU4",
  userName: undefined,
  currentGame: undefined,
  playerId: undefined,
  color: undefined,
  events: undefined,
  gamesListSocket: undefined,
  suppressNextLocalMove: false,
  connectedGamesStorageKey: "chessConnectedGames",
  playerIdStorageKey: "chessPlayerId",
  finishReported: false,
  registrationPromise: undefined,
  enabled: false,

  init() {
    this.userName =
      typeof ensureChessUserName === "function"
        ? ensureChessUserName()
        : "Player1";
    this.renderUserName();
    this.registrationPromise = this.registerUserName().catch((error) => {
      this.setStatus(`Player registration failed: ${error.message}`);
      this.registrationPromise = undefined;
      return undefined;
    });
  },

  isOnlineGame() {
    return Boolean(this.currentGame && this.playerId && this.color);
  },

  isOnlineMode() {
    return this.enabled || this.isOnlineGame();
  },

  isWaitingForOpponent() {
    return this.isOnlineGame() && this.currentGame?.status === "waiting";
  },

  shouldShowGamePicker() {
    return (
      this.isOnlineMode() &&
      (!this.currentGame || this.currentGame.status === "waiting")
    );
  },

  canMove(color) {
    if (!this.isOnlineGame()) return true;
    const engineColor = this.color === "white" ? Piece.WHITE : Piece.BLACK;
    return (
      this.currentGame?.status === "active" &&
      engineColor === color &&
      this.currentGame?.turn === this.color
    );
  },

  headers() {
    return {
      "content-type": "application/json",
      "x-api-key": this.apiKey,
    };
  },

  async request(path, options = {}) {
    const response = await fetch(`${this.apiUrl}${path}`, {
      ...options,
      headers: {
        ...this.headers(),
        ...(options.headers || {}),
      },
    });
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text || `HTTP ${response.status}`);
    }
    return response.json();
  },

  async refreshGames() {
    this.setStatus("Loading games...");
    if (this.shouldShowGamePicker()) {
      this.connectGamesList();
    }
    try {
      const games = await this.request(this.gamesPath());
      const rememberedGames = await this.loadRememberedUnfinishedGames();
      const gameCount = this.renderGames(games, rememberedGames);
      this.setStatus(
        gameCount ? "Choose a waiting game." : "No games."
      );
    } catch (error) {
      this.setStatus(`Game server error: ${error.message}`);
    }
  },

  async registerUserName() {
    for (let attempt = 0; attempt < 20; attempt++) {
      let playerId = window.localStorage.getItem(this.playerIdStorageKey);
      let userName = this.userName || ensureChessUserName();
      if (!playerId || !userName) {
        userName = this.resetStoredPlayerPair();
        playerId = undefined;
      }
      const result = await this.request("/players/register", {
        method: "POST",
        body: JSON.stringify({
          name: userName,
          playerId: playerId || undefined,
        }),
      }).catch((error) => {
        if (!String(error.message).includes("409")) {
          throw error;
        }
        return undefined;
      });
      if (result?.player) {
        if (
          playerId &&
          (result.player.id !== playerId || result.player.name !== userName)
        ) {
          this.resetStoredPlayerPair();
          continue;
        }
        this.userName = result.player.name;
        window.localStorage.setItem(this.playerIdStorageKey, result.player.id);
        if (typeof setChessUserName === "function") {
          setChessUserName(result.player.name);
        }
        this.renderUserName();
        return result.player;
      }
      this.resetStoredPlayerPair();
      this.renderUserName();
    }
    throw new Error("Could not register a unique player name");
  },

  resetStoredPlayerPair() {
    window.localStorage.removeItem(this.playerIdStorageKey);
    this.userName =
      typeof generateChessUserName === "function" &&
      typeof setChessUserName === "function"
        ? setChessUserName(generateChessUserName())
        : `Player${Math.floor(Math.random() * 8889) + 1111}`;
    return this.userName;
  },

  async ensureRegistered() {
    const registeredPlayer = this.registrationPromise
      ? await this.registrationPromise
      : undefined;
    if (registeredPlayer) {
      return registeredPlayer;
    }
    this.registrationPromise = this.registerUserName();
    return this.registrationPromise;
  },

  async createGame() {
    await this.ensureRegistered();
    this.enabled = true;
    this.setStatus("Creating game...");
    const fen = game?.board?.data?.calculatedFen?.() || FEN_start;
    try {
      const result = await this.request("/games", {
        method: "POST",
        body: JSON.stringify({ playerName: this.userName, fen }),
      });
      this.joinLocal(result.game, result.playerId, "white");
      await this.refreshGames();
    } catch (error) {
      this.setStatus(`Create failed: ${error.message}`);
    }
  },

  async startOnlineGame() {
    this.enabled = true;
    await this.ensureRegistered();
    setComputerMode("human-vs-human", true);
    this.renderCurrentGame();
    this.connectGamesList();
    await this.refreshGames();
    if (!this.isOnlineGame()) {
      this.setStatus("Choose a game or start a new one.");
    }
  },

  async joinGame(gameId) {
    await this.ensureRegistered();
    this.setStatus("Joining game...");
    try {
      this.closeEvents();
      const result = await this.request(`/games/${gameId}/join`, {
        method: "POST",
        body: JSON.stringify({ playerName: this.userName }),
      });
      this.joinLocal(result.game, result.playerId, "black");
    } catch (error) {
      this.setStatus(`Join failed: ${error.message}`);
    }
  },

  joinLocal(gameData, playerId, color) {
    this.enabled = true;
    this.playerId = playerId;
    this.color = color;
    this.finishReported = gameData.status === "finished";
    this.rememberConnection(gameData.id, playerId, color);
    setComputerMode("human-vs-human", true);
    this.applyPlayerTypesForConnection(color);
    this.applyGame(gameData);
    this.connectEvents(gameData.id);
    if (this.shouldShowGamePicker()) {
      this.connectGamesList();
    } else {
      this.closeGamesList();
    }
    this.renderCurrentGame();
    this.setStatus(`Joined as ${color}.`);
  },

  leaveGame() {
    this.closeEvents();
    this.closeGamesList();
    this.enabled = false;
    this.currentGame = undefined;
    this.playerId = undefined;
    this.color = undefined;
    this.finishReported = false;
    this.renderCurrentGame();
    this.setStatus("Not connected.");
  },

  applyPlayerTypesForConnection(color) {
    if (
      typeof game === "undefined" ||
      !game?.setPlayerTypes ||
      typeof PlayerType === "undefined"
    ) {
      return;
    }
    if (color === "white") {
      game.setPlayerTypes(PlayerType.HUMAN, PlayerType.CONNECTED_PLAYER);
    } else {
      game.setPlayerTypes(PlayerType.CONNECTED_PLAYER, PlayerType.HUMAN);
    }
  },

  connectEvents(gameId) {
    this.closeEvents();
    const url = `${this.apiUrl}/games/${gameId}/events?apiKey=${encodeURIComponent(
      this.apiKey
    )}`;
    this.events = new EventSource(url);
    this.events.addEventListener("game", (event) => {
      this.applyGame(JSON.parse(event.data));
    });
    this.events.onerror = () => {
      this.setStatus("Waiting for game server updates...");
    };
  },

  closeEvents() {
    if (this.events) {
      this.events.close();
      this.events = undefined;
    }
  },

  connectGamesList() {
    if (!this.shouldShowGamePicker() || this.gamesListSocket) return;
    if (typeof WebSocket === "undefined") return;
    const socket = new WebSocket(this.gamesListUrl());
    socket.onmessage = (event) => {
      this.applyGamesListMessage(event.data);
    };
    socket.onclose = () => {
      if (this.gamesListSocket === socket) {
        this.gamesListSocket = undefined;
      }
    };
    socket.onerror = () => {
      this.setStatus("Waiting for live game list...");
    };
    this.gamesListSocket = socket;
  },

  closeGamesList() {
    if (this.gamesListSocket) {
      this.gamesListSocket.close();
      this.gamesListSocket = undefined;
    }
  },

  gamesListUrl() {
    const url = new URL(this.apiUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/games/ws";
    url.search = "";
    url.searchParams.set("apiKey", this.apiKey);
    return url.toString();
  },

  gamesPath() {
    const params = new URLSearchParams();
    if (this.playerId) {
      params.set("playerId", this.playerId);
    }
    if (this.userName) {
      params.set("playerName", this.userName);
    }
    const query = params.toString();
    return query ? `/games?${query}` : "/games";
  },

  async applyGamesListMessage(data) {
    try {
      const message = JSON.parse(data);
      if (message.type !== "games" || !Array.isArray(message.games)) return;
      const games = await this.request(this.gamesPath()).catch(() => message.games);
      const rememberedGames = await this.loadRememberedUnfinishedGames();
      const gameCount = this.renderGames(games, rememberedGames);
      if (this.shouldShowGamePicker()) {
        this.setStatus(
          gameCount ? "Choose a waiting game." : "No games."
        );
      }
    } catch (error) {
      this.setStatus(`Live game list error: ${error.message}`);
    }
  },

  async resumeGame(gameId) {
    const rememberedConnection = this.connectedGames().find(
      (game) => game.id === gameId
    );
    try {
      this.closeEvents();
      const gameData = await this.request(`/games/${gameId}`);
      if (gameData.status === "finished") {
        this.forgetConnection(gameId);
        this.setStatus("Game is already finished.");
        await this.refreshGames();
        return;
      }
      const connection =
        rememberedConnection || this.connectionForGame(gameData);
      if (!connection) {
        this.setStatus("Game connection not found.");
        return;
      }
      this.joinLocal(gameData, connection.playerId, connection.color);
    } catch (error) {
      this.setStatus(`Resume failed: ${error.message}`);
    }
  },

  async publishMove(move, fen) {
    if (!this.isOnlineGame() || this.suppressNextLocalMove) return;
    try {
      const result = await this.request(`/games/${this.currentGame.id}/moves`, {
        method: "POST",
        body: JSON.stringify({
          playerId: this.playerId,
          move,
          fen,
        }),
      });
      this.applyGame(result.game);
    } catch (error) {
      this.setStatus(`Move sync failed: ${error.message}`);
    }
  },

  async resign(reason = "resignation") {
    if (!this.isOnlineGame()) return false;
    try {
      const result = await this.request(`/games/${this.currentGame.id}/resign`, {
        method: "POST",
        body: JSON.stringify({
          playerId: this.playerId,
          reason,
        }),
      });
      this.applyGame(result.game);
      return true;
    } catch (error) {
      this.setStatus(`Resign failed: ${error.message}`);
      return false;
    }
  },

  async win(reason = "win") {
    return this.finish("win", reason);
  },

  async lose(reason = "loss") {
    return this.finish("lose", reason);
  },

  async finish(action, reason) {
    if (!this.isOnlineGame() || this.finishReported) return false;
    this.finishReported = true;
    try {
      const result = await this.request(
        `/games/${this.currentGame.id}/${action}`,
        {
          method: "POST",
          body: JSON.stringify({
            playerId: this.playerId,
            reason,
          }),
        }
      );
      this.applyGame(result.game);
      return true;
    } catch (error) {
      this.finishReported = false;
      this.setStatus(`${action} failed: ${error.message}`);
      return false;
    }
  },

  reportLocalFinishedGame(resultText) {
    if (!this.isOnlineGame() || this.finishReported || !resultText) return;
    if (resultText.startsWith("CHECK MATE")) {
      this.win("checkmate");
    }
  },

  applyGame(gameData) {
    const oldGame = this.currentGame;
    const oldFen = oldGame?.fen;
    this.currentGame = gameData;
    this.finishReported = gameData.status === "finished";
    if (typeof setGamePhase === "function") {
      setGamePhase(this.phaseForGame(gameData));
    }
    if (gameData.fen && gameData.fen !== oldFen) {
      this.suppressNextLocalMove = true;
      try {
        const appliedMove = this.applyTransferredMove(gameData, oldGame);
        if (!appliedMove) {
          loadFenIntoGame(gameData.fen);
          this.applyPlayerTypesForConnection(this.color);
        }
      } finally {
        this.suppressNextLocalMove = false;
      }
    }
    if (
      gameData.status === "finished" &&
      typeof game !== "undefined" &&
      game?.board?.data
    ) {
      game.board.data.result = this.finishedText(gameData);
    }
    if (gameData.status === "finished" && typeof setGamePhase === "function") {
      setGamePhase("end");
    }
    if (this.shouldShowGamePicker()) {
      this.connectGamesList();
    } else {
      this.closeGamesList();
    }
    this.renderCurrentGame();
  },

  applyTransferredMove(gameData, oldGame) {
    const latestMove = gameData.moves?.[gameData.moves.length - 1];
    if (!latestMove) return false;
    if (latestMove.playerId === this.playerId) {
      return (
        typeof game !== "undefined" &&
        game?.board?.data?.calculatedFen?.() === gameData.fen
      );
    }
    if ((oldGame?.moves?.length || 0) >= gameData.moves.length) return false;
    if (
      typeof game === "undefined" ||
      !game?.board?.data?.legalMoves?.moves
    ) {
      return false;
    }

    const movePayload = latestMove.move;
    const legalMove = game.board.data.legalMoves.moves.find(
      (move) =>
        move.from === movePayload.from &&
        move.to === movePayload.to &&
        (movePayload.promotion === undefined ||
          movePayload.promotion === 0 ||
          move.promotionPiece === movePayload.promotion)
    );
    if (!legalMove) return false;

    game.makeMove(legalMove, 0, false);
    this.applyPlayerTypesForConnection(this.color);
    return game.board.data.calculatedFen() === gameData.fen;
  },

  phaseForGame(gameData) {
    if (gameData.status === "active") return "play";
    if (gameData.status === "finished") return "end";
    return "waiting";
  },

  finishedText(gameData) {
    const winner = gameData.winner || "unknown";
    const reason = gameData.finishReason || "finished";
    return `${winner.toUpperCase()} won - ${reason}`;
  },

  renderUserName() {
    ["multiplayerUser", "multiplayerModeName"].forEach((id) => {
      const userElement = document.getElementById(id);
      if (userElement) {
        userElement.textContent = this.userName;
      }
    });
  },

  renderCurrentGame() {
    const currentElement = document.getElementById("multiplayerCurrent");
    const playNamesElement = document.getElementById("playPlayerNames");
    if (!this.currentGame) {
      if (currentElement) {
        currentElement.textContent = "No online game.";
      }
      if (playNamesElement) {
        playNamesElement.textContent = "";
        playNamesElement.classList.remove("active");
      }
      const select = document.getElementById("onlineGamesSelect");
      if (select) {
        select.classList.remove("active");
      }
      const newGameButton = document.getElementById("onlineNewGameButton");
      if (newGameButton) {
        newGameButton.classList.toggle("active", this.isOnlineMode());
      }
      return;
    }
    const white = this.currentGame.players.white?.name || "Waiting";
    const black = this.currentGame.players.black?.name || "Waiting";
    const isWaitingForOpponent = this.currentGame.status === "waiting";
    const isFinished = this.currentGame.status === "finished";
    const whiteLabel = this.color === "white" ? `${white} (white)` : white;
    const blackLabel = this.color === "black" ? `${black} (black)` : black;
    const label = isWaitingForOpponent
      ? `${this.userName || white} - waiting ...`
      : isFinished
      ? `${whiteLabel} vs ${blackLabel} - ${this.finishedText(this.currentGame)}`
      : `${whiteLabel} vs ${blackLabel}`;
    if (currentElement) {
      currentElement.textContent =
        isWaitingForOpponent || isFinished
          ? `${this.currentGame.id} | ${label}`
          : `${this.currentGame.id} | ${label} | ${this.currentGame.turn} to move`;
    }
    if (playNamesElement) {
      playNamesElement.textContent = label;
      playNamesElement.title = label;
      playNamesElement.classList.add("active");
    }
    const select = document.getElementById("onlineGamesSelect");
    if (select) {
      select.classList.toggle("active", this.shouldShowGamePicker());
    }
    const newGameButton = document.getElementById("onlineNewGameButton");
    if (newGameButton) {
      newGameButton.classList.toggle("active", this.shouldShowGamePicker());
    }
  },

  renderGames(games, rememberedGames = []) {
    const list = document.getElementById("multiplayerGames");
    const select = document.getElementById("onlineGamesSelect");
    const connectedIds = new Set(this.connectedGames().map((game) => game.id));
    const resumableServerGames = games.filter(
      (gameData) =>
        gameData.id !== this.currentGame?.id &&
        gameData.status !== "finished" &&
        this.isPlayerInGame(gameData)
    );
    const joinableGames = games.filter(
      (gameData) =>
        gameData.id !== this.currentGame?.id &&
        !connectedIds.has(gameData.id) &&
        gameData.status === "waiting" &&
        !gameData.players.black &&
        (!gameData.players.white?.id ||
          gameData.players.white.id !== this.playerId) &&
        gameData.players.white?.name !== this.userName
    );
    const rememberedById = new Map(
      [...rememberedGames, ...resumableServerGames]
        .filter((gameData) => gameData.id !== this.currentGame?.id)
        .map((gameData) => [gameData.id, gameData])
    );
    const dropdownEntries = [
      ...joinableGames.map((gameData) => ({
        type: "join",
        game: gameData,
        label: `Join ${gameData.players.white?.name || "White"}`,
      })),
      ...[...rememberedById.values()].map((gameData) => ({
        type: "resume",
        game: gameData,
        label: this.resumeLabel(gameData),
      })),
    ];

    if (list) {
      list.innerHTML = "";
    }
    if (select) {
      select.innerHTML = "";
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = dropdownEntries.length ? "Games" : "No games";
      select.appendChild(placeholder);
      select.classList.toggle("active", this.shouldShowGamePicker());
    }

    dropdownEntries.forEach((entry) => {
      if (select) {
        const option = document.createElement("option");
        option.value = `${entry.type}:${entry.game.id}`;
        option.textContent = entry.label;
        select.appendChild(option);
      }
      if (!list) return;
      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = entry.label;
      button.onclick = () =>
        entry.type === "resume"
          ? this.resumeGame(entry.game.id)
          : this.joinGame(entry.game.id);
      item.appendChild(button);
      list.appendChild(item);
    });
    return dropdownEntries.length;
  },

  async loadRememberedUnfinishedGames() {
    const connections = this.connectedGames();
    const games = [];
    for (const connection of connections) {
      try {
        const gameData = await this.request(`/games/${connection.id}`);
        if (gameData.status === "finished") {
          this.forgetConnection(connection.id);
        } else {
          games.push(gameData);
        }
      } catch (error) {
        this.forgetConnection(connection.id);
      }
    }
    return games;
  },

  connectedGames() {
    try {
      return JSON.parse(
        window.localStorage.getItem(this.connectedGamesStorageKey) || "[]"
      );
    } catch (error) {
      return [];
    }
  },

  rememberConnection(id, playerId, color) {
    const connections = this.connectedGames().filter((game) => game.id !== id);
    connections.push({ id, playerId, color });
    window.localStorage.setItem(
      this.connectedGamesStorageKey,
      JSON.stringify(connections)
    );
  },

  forgetConnection(id) {
    const connections = this.connectedGames().filter((game) => game.id !== id);
    window.localStorage.setItem(
      this.connectedGamesStorageKey,
      JSON.stringify(connections)
    );
  },

  resumeLabel(gameData) {
    const white = gameData.players.white?.name || "White";
    const black = gameData.players.black?.name || "Waiting";
    const state = gameData.status === "active" ? "active" : "waiting";
    return `Resume ${white} vs ${black} (${state})`;
  },

  isPlayerInGame(gameData) {
    return Boolean(this.connectionForGame(gameData));
  },

  connectionForGame(gameData) {
    const colors = ["white", "black"];
    const color = colors.find((candidateColor) => {
      const player = gameData.players?.[candidateColor];
      return (
        player &&
        ((this.playerId && player.id === this.playerId) ||
          (this.userName && player.name === this.userName))
      );
    });
    if (!color) {
      return undefined;
    }
    return {
      id: gameData.id,
      playerId: gameData.players[color].id,
      color,
    };
  },

  setStatus(message) {
    const status = document.getElementById("multiplayerStatus");
    if (status) {
      status.textContent = message;
    }
  },
};

function defaultChessApiUrl() {
  const hostname =
    typeof window === "undefined" ? undefined : window.location?.hostname;
  if (hostname === "localhost" || hostname === "127.0.0.1") {
    return "http://localhost:3000";
  }
  return "https://chess-game-server-red.vercel.app";
}

function setupMultiplayer() {
  Multiplayer.init();
}

function startOnlineHumanVsHuman() {
  Multiplayer.startOnlineGame();
}

function createOnlineGame() {
  Multiplayer.createGame();
}

function refreshOnlineGames() {
  Multiplayer.refreshGames();
}

function joinSelectedOnlineGame(gameId) {
  if (!gameId) {
    return;
  }
  const [action, id] = gameId.split(":");
  if (action === "resume") {
    Multiplayer.resumeGame(id);
  } else if (action === "join") {
    Multiplayer.joinGame(id);
  } else {
    Multiplayer.joinGame(gameId);
  }
}

function leaveOnlineGame() {
  Multiplayer.leaveGame();
}
