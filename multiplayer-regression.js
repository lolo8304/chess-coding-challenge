const fs = require("fs");
const path = require("path");
const vm = require("vm");

function loadScript(file, context) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, file), "utf8"), context, {
    filename: file,
  });
}

function loadScripts(files, context) {
  files.forEach((file) => loadScript(file, context));
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const storage = new Map();
const elements = new Map();

function makeElement() {
  const element = {
    children: [],
    classNames: new Set(),
    textContent: "",
    value: "",
    appendChild(child) {
      this.children.push(child);
    },
    classList: {
      add(name) {
        this.owner.classNames.add(name);
      },
      remove(name) {
        this.owner.classNames.delete(name);
      },
      toggle(name, enabled) {
        if (enabled) {
          this.owner.classNames.add(name);
        } else {
          this.owner.classNames.delete(name);
        }
      },
    },
  };
  Object.defineProperty(element, "innerHTML", {
    set(value) {
      this.children = [];
      this.textContent = value;
    },
    get() {
      return this.textContent;
    },
  });
  return element;
}

function elementForId(id) {
  if (!elements.has(id)) {
    const element = makeElement();
    element.classList.owner = element;
    elements.set(id, element);
  }
  return elements.get(id);
}

function createRealEngineContext() {
  const realStorage = new Map();
  const realElements = new Map();
  const realDocument = {
    getElementById(id) {
      if (!realElements.has(id)) {
        const element = makeElement();
        element.classList.owner = element;
        realElements.set(id, element);
      }
      return realElements.get(id);
    },
    createElement() {
      const element = makeElement();
      element.classList.owner = element;
      return element;
    },
    querySelectorAll() {
      return [];
    },
    getElementsByTagName() {
      return [];
    },
  };
  const realContext = vm.createContext({
    console,
    performance: require("perf_hooks").performance,
    setTimeout,
    clearTimeout,
    CENTER: "CENTER",
    color: (...values) => values,
    fill: () => {},
    rect: () => {},
    text: () => {},
    textAlign: () => {},
    textSize: () => {},
    random: (max) => Math.random() * max,
    window: {
      document: realDocument,
      location: { hash: "" },
      localStorage: {
        getItem: (key) => realStorage.get(key),
        setItem: (key, value) => realStorage.set(key, value),
        removeItem: (key) => realStorage.delete(key),
      },
    },
    document: realDocument,
    EventSource: function EventSource() {
      this.addEventListener = () => {};
      this.close = () => {};
    },
  });
  vm.runInContext(
    `
      var ROW_CELLS = 8;
      var COL_CELLS = 8;
      var verbose = 0;
      var fen_hash = "";
      var game;
      function redraw() {}
      function setGamePhase() {}
      function setActiveComputerMode() {}
      function setupFen() {}
    `,
    realContext,
    { filename: "real-engine-globals.js" }
  );
  loadScripts(
    [
      "board-pieces.js",
      "history.js",
      "zobrist-keys.js",
      "zobrist.js",
      "bit-board.js",
      "board-moves.js",
      "board-data.js",
      "transposition-table.js",
      "computerplayers.js",
      "board.js",
      "game.js",
      "multiplayer.js",
    ],
    realContext
  );
  vm.runInContext(
    `
      globalThis.__Multiplayer = Multiplayer;
      boardSetupStatic();
      game = new Game(400, 400, 5, 55, 5, FEN_start);
    `,
    realContext,
    { filename: "real-engine-setup.js" }
  );
  return realContext;
}

const context = vm.createContext({
  console,
  URL,
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval,
  FEN_start: "start-fen",
  Piece: { WHITE: 8, BLACK: 16, None: 0 },
  setComputerMode: () => {},
  setGamePhase: () => {},
  loadFenIntoGame: () => {},
  PlayerType: {
    HUMAN: "HUMAN",
    AI: "AI",
    CONNECTED_PLAYER: "CONNECTED_PLAYER",
    CONNECTED_HUMAN: "CONNECTED_PLAYER",
  },
  EventSource: function EventSource() {
    this.addEventListener = () => {};
    this.close = () => {};
  },
  window: {
    location: { hostname: "chess-coding-challenge.vercel.app" },
    localStorage: {
      getItem: (key) => storage.get(key),
      setItem: (key, value) => storage.set(key, value),
      removeItem: (key) => storage.delete(key),
    },
  },
  document: {
    getElementById: elementForId,
    createElement: () => {
      const element = makeElement();
      element.classList.owner = element;
      return element;
    },
  },
});

loadScript("names.js", context);
vm.runInContext(
  "globalThis.__names = SwissGermanEnglishFirstNames; globalThis.__getChessUserName = getChessUserName; globalThis.__ensureChessUserName = ensureChessUserName;",
  context
);

assert(
  context.__names.length === 100,
  "Expected exactly 100 first names"
);

const userName = context.__getChessUserName();
assert(
  /[A-Za-z]+[1-9][0-9]{3}$/.test(userName),
  "Expected name suffix from 1111 to 9999"
);
const suffix = Number(userName.match(/([0-9]+)$/)[1]);
assert(suffix >= 1111 && suffix <= 9999, "Expected suffix range 1111-9999");
assert(
  context.__getChessUserName() === userName,
  "Expected username to persist in localStorage"
);
assert(
  context.__ensureChessUserName() === userName,
  "Expected board startup username selection to reuse the chosen name"
);

loadScript("multiplayer.js", context);
vm.runInContext("globalThis.__Multiplayer = Multiplayer;", context);

assert(
  context.__Multiplayer.apiUrl === "https://chess-game-server-red.vercel.app",
  "Expected production browsers to use the hosted game server API"
);
context.window.location.hostname = "localhost";
assert(
  context.defaultChessApiUrl() === "http://localhost:3000",
  "Expected localhost browsers to use the local game server API"
);
context.__Multiplayer.apiUrl = context.defaultChessApiUrl();

const now = Date.now();
function createdMinutesAgo(minutes) {
  return new Date(now - minutes * 60 * 1000).toISOString();
}

context.__Multiplayer.currentGame = {
  id: "game-1",
  status: "active",
  turn: "white",
};
context.__Multiplayer.playerId = "player-1";
context.__Multiplayer.color = "white";

let appliedPlayerTypes;
context.game = {
  setPlayerTypes: (whiteType, blackType) => {
    appliedPlayerTypes = [whiteType, blackType];
  },
};
context.__Multiplayer.applyPlayerTypesForConnection("black");
assert(
  appliedPlayerTypes[0] === "CONNECTED_PLAYER" &&
    appliedPlayerTypes[1] === "HUMAN",
  "Expected joining as black to keep black human and white connected"
);

let transferredMoveApplied = false;
let fallbackFenLoaded = false;
const transferredFen =
  "rnbqkbnr/pppp1ppp/8/4p3/8/8/PPPPPPPP/RNBQKBNR b KQkq e6 0 1";
context.loadFenIntoGame = () => {
  fallbackFenLoaded = true;
};
context.game = {
  setPlayerTypes: (whiteType, blackType) => {
    appliedPlayerTypes = [whiteType, blackType];
  },
  board: {
    data: {
      legalMoves: {
        moves: [{ from: 12, to: 28, promotionPiece: 0 }],
      },
      calculatedFen: () =>
        transferredMoveApplied ? transferredFen : "old-fen",
    },
  },
  makeMove: (move) => {
    transferredMoveApplied = move.from === 12 && move.to === 28;
  },
};
context.__Multiplayer.currentGame = {
  id: "game-transfer",
  status: "active",
  fen: "old-fen",
  moves: [],
};
context.__Multiplayer.playerId = "black-player";
context.__Multiplayer.color = "black";
context.__Multiplayer.applyGame({
  id: "game-transfer",
  status: "active",
  turn: "black",
  fen: transferredFen,
  players: {
    white: { name: "WhitePlayer" },
    black: { name: "BlackPlayer" },
  },
  moves: [
    {
      playerId: "white-player",
      move: { from: 12, to: 28, promotion: 0 },
    },
  ],
});
assert(
  transferredMoveApplied,
  "Expected transferred server move to be applied locally"
);
assert(
  !fallbackFenLoaded,
  "Expected legal transferred moves to avoid FEN reload fallback"
);

transferredMoveApplied = false;
fallbackFenLoaded = false;
const blackTransferredFen =
  "rnbqkbnr/pppp1ppp/8/4p3/6P1/8/PPPPPP1P/RNBQKBNR w KQkq - 0 2";
context.game = {
  setPlayerTypes: (whiteType, blackType) => {
    appliedPlayerTypes = [whiteType, blackType];
  },
  board: {
    data: {
      legalMoves: {
        moves: [{ from: 52, to: 36, promotionPiece: 0 }],
      },
      calculatedFen: () =>
        transferredMoveApplied ? blackTransferredFen : transferredFen,
    },
  },
  makeMove: (move) => {
    transferredMoveApplied = move.from === 52 && move.to === 36;
  },
};
context.__Multiplayer.currentGame = {
  id: "game-transfer",
  status: "active",
  turn: "black",
  fen: transferredFen,
  players: {
    white: { name: "WhitePlayer" },
    black: { name: "BlackPlayer" },
  },
  moves: [
    {
      playerId: "white-player",
      move: { from: 12, to: 28, promotion: 0 },
    },
  ],
};
context.__Multiplayer.playerId = "white-player";
context.__Multiplayer.color = "white";
context.__Multiplayer.applyGame({
  id: "game-transfer",
  status: "active",
  turn: "white",
  fen: blackTransferredFen,
  players: {
    white: { name: "WhitePlayer" },
    black: { name: "BlackPlayer" },
  },
  moves: [
    {
      playerId: "white-player",
      move: { from: 12, to: 28, promotion: 0 },
    },
    {
      playerId: "black-player",
      move: { from: 52, to: 36, promotion: 0 },
    },
  ],
});
assert(
  transferredMoveApplied,
  "Expected black transferred server move to be applied on the white client"
);
assert(
  !fallbackFenLoaded,
  "Expected black transferred moves to avoid FEN reload fallback"
);
assert(
  !context.__Multiplayer.suppressNextLocalMove,
  "Expected transfer suppression to be reset after remote move handling"
);

context.__Multiplayer.currentGame = {
  id: "game-1",
  status: "active",
  turn: "white",
};
context.__Multiplayer.playerId = "player-1";
context.__Multiplayer.color = "white";

assert(
  context.__Multiplayer.canMove(context.Piece.WHITE),
  "White should move when the active online game is waiting for white"
);
assert(
  !context.__Multiplayer.canMove(context.Piece.BLACK),
  "Black should not move on white's online turn"
);

context.__Multiplayer.currentGame.turn = "black";
assert(
  !context.__Multiplayer.canMove(context.Piece.WHITE),
  "White should not move on black's online turn"
);

context.__Multiplayer.currentGame.status = "waiting";
assert(
  context.__Multiplayer.isWaitingForOpponent(),
  "Expected waiting online games to report waiting for opponent"
);
assert(
  !context.__Multiplayer.canMove(context.Piece.WHITE),
  "Expected waiting online games to block moves before opponent joins"
);

const joinableCount = context.__Multiplayer.renderGames([
  {
    id: "game-1",
    players: { white: { name: "OwnGame1" } },
  },
  {
    id: "game-2",
    status: "waiting",
    createdAt: createdMinutesAgo(30),
    players: { white: { name: "OtherGame2" } },
  },
  {
    id: "game-3",
    status: "active",
    createdAt: createdMinutesAgo(10),
    players: {
      white: { name: "ConnectedWhite" },
      black: { name: "ConnectedBlack" },
    },
  },
]);
const select = elementForId("onlineGamesSelect");
assert(joinableCount === 1, "Expected current game to be excluded");
assert(select.children.length === 2, "Expected placeholder and one game option");
assert(
  select.children[1].value === "join:game-2",
  "Expected dropdown to list the joinable game"
);
assert(
  select.children[1].textContent === "Join OtherGame2 - 30m",
  "Expected dropdown label to include compact age text"
);
assert(
  select.classNames.has("active"),
  "Expected dropdown while waiting for an opponent"
);

context.__Multiplayer.currentGame = {
  id: "game-1",
  status: "active",
  turn: "white",
  players: {
    white: { name: "OwnGame1" },
    black: { name: "OtherGame2" },
  },
};
context.__Multiplayer.color = "black";
context.__Multiplayer.gameSocket = { close() {} };
context.__Multiplayer.renderCurrentGame();
assert(
  !select.classNames.has("active"),
  "Expected dropdown to be hidden after an opponent connects"
);
assert(
  elementForId("playPlayerNames").children[0].className ===
    "connection-status-dot connected",
  "Expected active online games to show a green connection dot"
);
assert(
  elementForId("playPlayerNames").children[1].textContent ===
    "OwnGame1 (white)",
  "Expected player names to be displayed once the game starts"
);

context.__Multiplayer.gameSocket = undefined;
context.__Multiplayer.gamePollingTimer = { close() {} };
context.__Multiplayer.renderCurrentGame();
assert(
  elementForId("playPlayerNames").children[0].className ===
    "connection-status-dot connected polling-leading" &&
    elementForId("playPlayerNames").children[1].className ===
      "connection-status-dot connected",
  "Expected polling online games to show two green connection dots"
);
assert(
  elementForId("playPlayerNames").children[2].textContent ===
    "OwnGame1 (white)",
  "Expected polling online games to display player names after both dots"
);
context.__Multiplayer.gamePollingTimer = undefined;

context.__Multiplayer.currentGame.status = "paused";
context.__Multiplayer.renderCurrentGame();
assert(
  elementForId("playPlayerNames").children[0].className ===
    "connection-status-dot disconnected",
  "Expected paused online games to show a red connection dot"
);
assert(
  elementForId("playPlayerNames").children[1].textContent ===
    "OwnGame1 (white) - paused",
  "Expected paused online games to display the paused state"
);

context.__Multiplayer.gamePollingTimer = { close() {} };
context.__Multiplayer.renderCurrentGame();
assert(
  elementForId("playPlayerNames").children[0].className ===
    "connection-status-dot disconnected polling-leading" &&
    elementForId("playPlayerNames").children[1].className ===
      "connection-status-dot disconnected",
  "Expected paused polling online games to show two red connection dots"
);
assert(
  elementForId("playPlayerNames").children[2].textContent ===
    "OwnGame1 (white) - paused",
  "Expected paused polling online games to display player names after both dots"
);
context.__Multiplayer.gamePollingTimer = undefined;

let appliedOnlineStatus;
let appliedPhase;
context.game = {
  setOnlineStatus(status) {
    appliedOnlineStatus = status;
  },
};
context.setGamePhase = (phase) => {
  appliedPhase = phase;
};
context.__Multiplayer.currentGame = {
  id: "game-paused",
  status: "active",
  fen: "same-fen",
  players: {
    white: { name: "OwnGame1" },
    black: { name: "OtherGame2" },
  },
  moves: [],
};
context.__Multiplayer.applyGame({
  id: "game-paused",
  status: "paused",
  fen: "same-fen",
  players: {
    white: { name: "OwnGame1" },
    black: { name: "OtherGame2" },
  },
  moves: [],
});
assert(appliedOnlineStatus === "paused", "Expected paused status on the game");
assert(appliedPhase === "paused", "Expected paused games to set paused phase");
assert(context.__Multiplayer.isPaused(), "Expected multiplayer to report paused");

let pauseRequest;
context.__Multiplayer.currentGame = {
  id: "game-1",
  status: "active",
  turn: "white",
  players: {
    white: { name: "OwnGame1" },
    black: { name: "OtherGame2" },
  },
};
context.__Multiplayer.playerId = "player-1";
context.__Multiplayer.request = (path, options = {}) => {
  pauseRequest = { path, body: JSON.parse(options.body) };
  return Promise.resolve({ game: { status: "paused" } });
};
context.__Multiplayer.leaveGame();
assert(
  pauseRequest?.path === "/games/game-1/pause",
  "Expected leaving an active online game to pause it on the server"
);
assert(
  pauseRequest.body.playerId === "player-1",
  "Expected pause requests to include the local player id"
);

context.__Multiplayer.currentGame = {
  id: "game-1",
  status: "finished",
  turn: "white",
  players: {
    white: { name: "OwnGame1" },
    black: { name: "OtherGame2" },
  },
};
context.__Multiplayer.color = "black";
context.__Multiplayer.currentGame.winner = "white";
context.__Multiplayer.currentGame.finishReason = "resignation";
context.__Multiplayer.renderCurrentGame();
assert(
  elementForId("playPlayerNames").children[1].textContent ===
    "OwnGame1 (white) - WHITE won - resignation",
  "Expected finished online games to display winner and reason"
);

context.__Multiplayer.rememberConnection("game-4", "player-white", "white");
context.__Multiplayer.rememberConnection("game-5", "player-own-white", "white");
const resumeCount = context.__Multiplayer.renderGames(
  [
    {
      id: "game-2",
      status: "waiting",
      createdAt: createdMinutesAgo(10),
      players: { white: { name: "OtherGame2" } },
    },
    {
      id: "game-5",
      status: "waiting",
      createdAt: createdMinutesAgo(30),
      players: { white: { name: "OwnStartedGame" } },
    },
    {
      id: "old-game",
      status: "waiting",
      createdAt: createdMinutesAgo(25 * 60),
      players: { white: { name: "OldGame" } },
    },
  ],
  [
    {
      id: "game-4",
      status: "active",
      createdAt: createdMinutesAgo(120),
      players: {
        white: { name: "SavedWhite" },
        black: { name: "SavedBlack" },
      },
    },
    {
      id: "game-5",
      status: "waiting",
      createdAt: createdMinutesAgo(30),
      players: {
        white: { name: "OwnStartedGame" },
      },
    },
  ]
);
assert(resumeCount === 3, "Expected joinable and remembered unfinished games");
assert(
  select.children[1].value === "join:game-2",
  "Expected newest connection to be first in the dropdown"
);
assert(
  select.children[2].value === "resume:game-5",
  "Expected own started games to be resumed, not joined"
);
assert(
  select.children[2].textContent === "Resume Waiting - 30m",
  "Expected waiting resume dropdown labels not to show the local player"
);
assert(
  select.children[3].value === "resume:game-4",
  "Expected older remembered unfinished games after newer connections"
);
assert(
  select.children[3].textContent === "Resume SavedBlack (black) - 2h",
  "Expected resume dropdown labels to show only the opponent"
);
assert(
  !select.children.some((child) => child.value === "join:old-game"),
  "Expected games older than 24h to be excluded from the dropdown"
);

context.__Multiplayer.request = async () => ({
  game: {
    id: "game-3",
    status: "active",
    turn: "black",
    fen: "start-fen",
    players: {
      white: { name: "Lara1" },
      black: { name: "David1" },
    },
  },
  playerId: "player-black",
  color: "white",
});

(async () => {
  let refreshPauseRequest;
  storage.set(
    context.__Multiplayer.connectedGamesStorageKey,
    JSON.stringify([
      { id: "refresh-game", playerId: "player-refresh", color: "white" },
    ])
  );
  context.__Multiplayer.request = async (path, options = {}) => {
    if (path === "/games/refresh-game") {
      return {
        id: "refresh-game",
        status: "active",
        turn: "white",
        fen: "refresh-fen",
        createdAt: createdMinutesAgo(1),
        players: {
          white: { id: "player-refresh", name: "LocalWhite" },
          black: { id: "player-opponent", name: "RemoteBlack" },
        },
        moves: [],
      };
    }
    if (path === "/games/refresh-game/pause") {
      refreshPauseRequest = { path, body: JSON.parse(options.body) };
      return { game: { id: "refresh-game", status: "paused" } };
    }
    throw new Error(`unexpected request ${path}`);
  };
  await context.__Multiplayer.pauseRememberedActiveGames();
  assert(
    refreshPauseRequest?.path === "/games/refresh-game/pause",
    "Expected remembered active games to be paused after a page refresh"
  );
  assert(
    refreshPauseRequest.body.playerId === "player-refresh",
    "Expected refresh pause requests to use the remembered player id"
  );

  let resumeRequest;
  context.__Multiplayer.rememberConnection("paused-game", "player-white", "white");
  context.__Multiplayer.request = async (path, options = {}) => {
    if (path === "/games/paused-game") {
      return {
        id: "paused-game",
        status: "paused",
        turn: "white",
        fen: "paused-fen",
        createdAt: createdMinutesAgo(15),
        players: {
          white: { id: "player-white", name: "SavedWhite" },
          black: { id: "player-black", name: "SavedBlack" },
        },
        moves: [],
      };
    }
    if (path === "/games/paused-game/resume") {
      resumeRequest = { path, body: JSON.parse(options.body) };
      return {
        game: {
          id: "paused-game",
          status: "active",
          turn: "white",
          fen: "paused-fen",
          createdAt: createdMinutesAgo(15),
          players: {
            white: { id: "player-white", name: "SavedWhite" },
            black: { id: "player-black", name: "SavedBlack" },
          },
          moves: [],
        },
      };
    }
    throw new Error(`unexpected request ${path}`);
  };
  await context.__Multiplayer.resumeGame("paused-game");
  assert(
    resumeRequest?.path === "/games/paused-game/resume",
    "Expected reconnecting to a paused game to resume it on the server"
  );
  assert(
    resumeRequest.body.playerId === "player-white",
    "Expected resume requests to include the remembered player id"
  );

  let registrationCalls = 0;
  context.__Multiplayer.userName = userName;
  context.__Multiplayer.request = async (path) => {
    if (path === "/players/register") {
      registrationCalls++;
      if (registrationCalls === 1) {
        throw new Error('{"statusCode":409}');
      }
      return { player: { id: "registered-player", name: "Lara2222" } };
    }
    return {
      game: {
        id: "game-3",
        status: "active",
        turn: "black",
        fen: "start-fen",
        players: {
          white: { name: "Lara1" },
          black: { name: "David1" },
        },
      },
      playerId: "player-black",
      color: "white",
    };
  };

  const registered = await context.__Multiplayer.registerUserName();
  assert(
    registered.name === "Lara2222",
    "Expected conflicting player names to be regenerated and registered"
  );
  assert(
    storage.get("chessPlayerId") === "registered-player",
    "Expected registered player id to be stored"
  );

  storage.delete("chessPlayerId");
  storage.set("chessUserName", "OnlyName2222");
  context.__Multiplayer.userName = "OnlyName2222";
  context.__Multiplayer.request = async (path, options) => {
    if (path === "/players/register") {
      const body = JSON.parse(options.body);
      assert(
        body.name !== "OnlyName2222",
        "Expected missing player id to force a fresh registration pair"
      );
      return { player: { id: "fresh-player", name: body.name } };
    }
    throw new Error("unexpected request");
  };
  const freshFromMissingId = await context.__Multiplayer.registerUserName();
  assert(
    freshFromMissingId.id === "fresh-player",
    "Expected fresh player id when one local field is missing"
  );

  storage.set("chessUserName", "Mismatch3333");
  storage.set("chessPlayerId", "local-player");
  context.__Multiplayer.userName = "Mismatch3333";
  let mismatchCalls = 0;
  context.__Multiplayer.request = async (path, options) => {
    if (path === "/players/register") {
      mismatchCalls++;
      const body = JSON.parse(options.body);
      if (mismatchCalls === 1) {
        return { player: { id: "other-player", name: body.name } };
      }
      assert(
        body.name !== "Mismatch3333" && body.playerId === undefined,
        "Expected mismatched server pair to be discarded and registered fresh"
      );
      return { player: { id: "fresh-mismatch-player", name: body.name } };
    }
    throw new Error("unexpected request");
  };
  const freshFromMismatch = await context.__Multiplayer.registerUserName();
  assert(
    freshFromMismatch.id === "fresh-mismatch-player",
    "Expected fresh player id when server pair does not match local storage"
  );

  context.__Multiplayer.registrationPromise = Promise.resolve({
    id: "fresh-mismatch-player",
    name: "Mismatch3333",
  });
  let renameRequest;
  context.__Multiplayer.request = async (path, options) => {
    if (path === "/players/rename") {
      renameRequest = { path, body: JSON.parse(options.body) };
      return { player: { id: "fresh-mismatch-player", name: "Rename5555" } };
    }
    throw new Error("unexpected request");
  };
  const renamed = await context.__Multiplayer.editUserName("Rename");
  assert(
    renameRequest?.path === "/players/rename" &&
      renameRequest.body.playerId === "fresh-mismatch-player" &&
      renameRequest.body.name === "Rename",
    "Expected edited user names to be delegated to the API rename endpoint"
  );
  assert(
    renamed.name === "Rename5555",
    "Expected edited user name to use the API-selected name"
  );
  assert(
    storage.get("chessPlayerId") === "fresh-mismatch-player" &&
      storage.get("chessUserName") === renamed.name,
    "Expected edited user name and player id to be stored"
  );

  let createdByModeStart = false;
  context.__Multiplayer.currentGame = undefined;
  context.__Multiplayer.playerId = undefined;
  context.__Multiplayer.color = undefined;
  context.__Multiplayer.registrationPromise = Promise.resolve(freshFromMismatch);
  context.__Multiplayer.request = async (path, options = {}) => {
    if (path === "/games" && options.method === "POST") {
      createdByModeStart = true;
    }
    if (path === "/games" || path.startsWith("/games?")) {
      return [];
    }
    throw new Error(`unexpected request ${path}`);
  };
  await context.__Multiplayer.startOnlineGame();
  assert(
    !createdByModeStart,
    "Expected online mode startup not to create a server game"
  );
  assert(
    context.__Multiplayer.enabled,
    "Expected online mode startup to enable multiplayer controls"
  );
  assert(
    elementForId("onlineNewGameButton").classNames.has("active"),
    "Expected NEW GAME button to show after entering online mode"
  );
  assert(
    elementForId("onlineGamesSelect").classNames.has("active"),
    "Expected game dropdown to show after entering online mode"
  );
  assert(
    context.__Multiplayer.gamesListPollingTimer,
    "Expected online mode to use game-list polling when WebSocket is unavailable"
  );
  context.__Multiplayer.closeGamesList();

  let openedGamesListUrl;
  let gamesListSocket;
  context.WebSocket = function WebSocket(url) {
    openedGamesListUrl = url;
    gamesListSocket = this;
    this.close = () => {
      this.closed = true;
    };
  };
  context.__Multiplayer.gamesListSocket = undefined;
  context.__Multiplayer.currentGame = undefined;
  context.__Multiplayer.playerId = undefined;
  context.__Multiplayer.color = undefined;
  storage.set(context.__Multiplayer.connectedGamesStorageKey, "[]");
  context.__Multiplayer.request = async (path) => {
    if (path === "/games") {
      return [];
    }
    throw new Error(`unexpected request ${path}`);
  };
  await context.__Multiplayer.startOnlineGame();
  assert(
    openedGamesListUrl.startsWith(
      "ws://localhost:3000/games/ws?apiKey=vpFJPgzELLUXHhgJ2234cTBtoPvamwU4"
    ),
    "Expected online mode to open the live games list WebSocket"
  );
  await context.__Multiplayer.applyGamesListMessage(
    JSON.stringify({
      type: "games",
      games: [
        {
          id: "live-game",
          status: "waiting",
          createdAt: createdMinutesAgo(5),
          players: { white: { name: "RemoteWhite" } },
        },
      ],
    })
  );
  assert(
    elementForId("onlineGamesSelect").children[1].value === "join:live-game",
    "Expected live WebSocket game list to populate the dropdown"
  );
  context.__Multiplayer.applyGame({
    id: "live-game",
    status: "active",
    turn: "white",
    fen: "start-fen",
    players: {
      white: { name: "RemoteWhite" },
      black: { name: "LocalBlack" },
    },
    moves: [],
  });
  assert(
    gamesListSocket.closed,
    "Expected live games list WebSocket to close once a game is connected"
  );

  const originalSocketTimeout = context.__Multiplayer.socketKeepAliveTimeoutMs;
  const originalSocketCheck = context.__Multiplayer.socketKeepAliveCheckMs;
  const originalSocketDelay = context.__Multiplayer.socketReconnectDelayMs;
  const originalSocketMaxReconnects =
    context.__Multiplayer.socketMaxReconnectAttempts;
  const originalPollingInterval = context.__Multiplayer.pollingIntervalMs;
  context.__Multiplayer.socketKeepAliveTimeoutMs = 5;
  context.__Multiplayer.socketKeepAliveCheckMs = 1;
  context.__Multiplayer.socketReconnectDelayMs = 1;
  context.__Multiplayer.socketMaxReconnectAttempts = 20;
  const staleGameSockets = [];
  context.WebSocket = function WebSocket(url) {
    this.url = url;
    this.close = () => {
      this.closed = true;
    };
    staleGameSockets.push(this);
  };
  context.__Multiplayer.currentGame = {
    id: "stale-game",
    status: "active",
    turn: "white",
  };
  context.__Multiplayer.connectGameUpdates("stale-game");
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert(
    staleGameSockets.length >= 2,
    "Expected stale game update WebSocket to reconnect"
  );
  assert(
    staleGameSockets[0].closed,
    "Expected stale game update WebSocket to be closed"
  );
  context.__Multiplayer.closeGameUpdates();

  const staleListSockets = [];
  context.WebSocket = function WebSocket(url) {
    this.url = url;
    this.close = () => {
      this.closed = true;
    };
    staleListSockets.push(this);
  };
  context.__Multiplayer.enabled = true;
  context.__Multiplayer.currentGame = undefined;
  context.__Multiplayer.playerId = undefined;
  context.__Multiplayer.color = undefined;
  context.__Multiplayer.connectGamesList();
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert(
    staleListSockets.length >= 2,
    "Expected stale games list WebSocket to reconnect"
  );
  assert(
    staleListSockets[0].closed,
    "Expected stale games list WebSocket to be closed"
  );
  context.__Multiplayer.closeGamesList();

  context.__Multiplayer.socketMaxReconnectAttempts = 1;
  context.__Multiplayer.pollingIntervalMs = 5;

  let gamePollRequested = false;
  const closedBeforeOpenGameSockets = [];
  context.WebSocket = function WebSocket(url) {
    this.url = url;
    this.close = () => {
      this.closed = true;
    };
    closedBeforeOpenGameSockets.push(this);
    const socket = this;
    setTimeout(() => socket.onclose && socket.onclose(), 0);
  };
  context.__Multiplayer.currentGame = {
    id: "fallback-game",
    status: "active",
    turn: "white",
    fen: "fallback-before",
    players: {
      white: { name: "LocalWhite" },
      black: { name: "RemoteBlack" },
    },
    moves: [],
  };
  context.__Multiplayer.request = async (path) => {
    if (path === "/games/fallback-game") {
      gamePollRequested = true;
      return {
        ...context.__Multiplayer.currentGame,
        fen: "fallback-before",
      };
    }
    throw new Error(`unexpected request ${path}`);
  };
  context.__Multiplayer.connectGameUpdates("fallback-game");
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert(
    closedBeforeOpenGameSockets.length >= 2,
    "Expected game updates to try WebSocket before polling fallback"
  );
  assert(
    gamePollRequested && context.__Multiplayer.gamePollingTimer,
    "Expected game updates to fall back to polling after failed WebSockets"
  );
  context.__Multiplayer.closeGameUpdates();

  const closedBeforeOpenListSockets = [];
  context.WebSocket = function WebSocket(url) {
    this.url = url;
    this.close = () => {
      this.closed = true;
    };
    closedBeforeOpenListSockets.push(this);
    const socket = this;
    setTimeout(() => socket.onclose && socket.onclose(), 0);
  };
  context.__Multiplayer.enabled = true;
  context.__Multiplayer.currentGame = undefined;
  context.__Multiplayer.playerId = undefined;
  context.__Multiplayer.color = undefined;
  context.__Multiplayer.request = async (path) => {
    return [];
  };
  context.__Multiplayer.connectGamesList();
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert(
    closedBeforeOpenListSockets.length >= 2,
    "Expected game list to try WebSocket before polling fallback"
  );
  assert(
    context.__Multiplayer.gamesListPollingTimer,
    "Expected game list to fall back to polling after failed WebSockets"
  );
  context.__Multiplayer.closeGamesList();

  context.__Multiplayer.socketKeepAliveTimeoutMs = originalSocketTimeout;
  context.__Multiplayer.socketKeepAliveCheckMs = originalSocketCheck;
  context.__Multiplayer.socketReconnectDelayMs = originalSocketDelay;
  context.__Multiplayer.socketMaxReconnectAttempts = originalSocketMaxReconnects;
  context.__Multiplayer.pollingIntervalMs = originalPollingInterval;

  let explicitCreateRequest;
  context.game = {
    board: {
      data: {
        calculatedFen: () => "explicit-create-fen",
      },
    },
  };
  context.__Multiplayer.request = async (path, options = {}) => {
    if (path === "/games" && options.method === "POST") {
      explicitCreateRequest = JSON.parse(options.body);
      return {
        game: {
          id: "explicit-game",
          status: "waiting",
          turn: "white",
          fen: explicitCreateRequest.fen,
          players: { white: { id: "fresh-mismatch-player", name: "Creator" } },
          moves: [],
        },
        playerId: "fresh-mismatch-player",
        color: "white",
      };
    }
    if (path === "/games") {
      return [];
    }
    throw new Error(`unexpected request ${path}`);
  };
  await context.__Multiplayer.createGame();
  assert(
    explicitCreateRequest?.fen === "explicit-create-fen",
    "Expected only explicit NEW GAME action to create a server game"
  );

  context.__Multiplayer.request = async () => ({
    game: {
      id: "game-3",
      status: "active",
      turn: "black",
      fen: "start-fen",
      players: {
        white: { name: "Lara1" },
        black: { name: "David1" },
      },
    },
    playerId: "player-black",
    color: "white",
  });
  context.__Multiplayer.registrationPromise = Promise.resolve(registered);
  await context.__Multiplayer.joinGame("game-3");
  assert(
    context.__Multiplayer.color === "black",
    "Expected joining an existing game to set local human color to black"
  );
  assert(
    context.__Multiplayer.canMove(context.Piece.BLACK),
    "Expected the joined player to move as black when it is black's turn"
  );
  assert(
    !context.__Multiplayer.canMove(context.Piece.WHITE),
    "Expected the joined player not to move white pieces"
  );

  let blackMoveRequest;
  context.__Multiplayer.currentGame = {
    id: "game-black-post",
    status: "active",
    turn: "black",
    fen: "before-black",
    players: {
      white: { name: "Lara1" },
      black: { name: "David1" },
    },
    moves: [],
  };
  context.__Multiplayer.playerId = "player-black";
  context.__Multiplayer.color = "black";
  context.__Multiplayer.suppressNextLocalMove = false;
  context.__Multiplayer.request = async (path, options) => {
    blackMoveRequest = {
      path,
      body: JSON.parse(options.body),
    };
    return {
      game: {
        ...context.__Multiplayer.currentGame,
        turn: "white",
        fen: "after-black",
        moves: [
          {
            playerId: "player-black",
            move: { from: 52, to: 36, promotion: 0 },
          },
        ],
      },
    };
  };
  await context.__Multiplayer.publishMove(
    { from: 52, to: 36, promotion: 0 },
    "after-black"
  );
  assert(
    blackMoveRequest.path === "/games/game-black-post/moves",
    "Expected black move to be posted to the game moves endpoint"
  );
  assert(
    blackMoveRequest.body.playerId === "player-black",
    "Expected black move to be posted with the black player id"
  );
  assert(
    blackMoveRequest.body.fen === "after-black",
    "Expected black move to include the resulting FEN"
  );

  const realContext = createRealEngineContext();
  let realBlackMoveRequest;
  realContext.__Multiplayer.request = async (path, options) => {
    realBlackMoveRequest = {
      path,
      body: JSON.parse(options.body),
    };
    return {
      game: {
        ...realContext.__Multiplayer.currentGame,
        turn: "white",
        fen: realBlackMoveRequest.body.fen,
        moves: [
          ...(realContext.__Multiplayer.currentGame.moves || []),
          {
            playerId: realBlackMoveRequest.body.playerId,
            move: realBlackMoveRequest.body.move,
            fen: realBlackMoveRequest.body.fen,
          },
        ],
      },
    };
  };
  vm.runInContext(
    `
      __Multiplayer.currentGame = {
        id: "real-game",
        status: "active",
        turn: "white",
        fen: FEN_start,
        players: {
          white: { name: "WhitePlayer" },
          black: { name: "BlackPlayer" },
        },
        moves: [],
      };
      __Multiplayer.playerId = "black-player";
      __Multiplayer.color = "black";
      __Multiplayer.applyPlayerTypesForConnection("black");

      __Multiplayer.applyGame({
        id: "real-game",
        status: "paused",
        turn: "white",
        fen: FEN_start,
        players: {
          white: { name: "WhitePlayer" },
          black: { name: "BlackPlayer" },
        },
        moves: [],
      });
      if (!game.isPaused()) throw new Error("Expected the real game to know it is paused");
      __Multiplayer.applyGame({
        id: "real-game",
        status: "active",
        turn: "white",
        fen: FEN_start,
        players: {
          white: { name: "WhitePlayer" },
          black: { name: "BlackPlayer" },
        },
        moves: [],
      });
      if (game.isPaused()) throw new Error("Expected the real game to resume from paused");

      const realWhiteMove = game.board.data.legalMoves.moves.find(
        (move) => move.toCoordinateNotation() === "e2e4"
      );
      __Multiplayer.applyGame({
        id: "real-game",
        status: "active",
        turn: "black",
        fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
        players: {
          white: { name: "WhitePlayer" },
          black: { name: "BlackPlayer" },
        },
        moves: [
          {
            playerId: "white-player",
            move: {
              from: realWhiteMove.from,
              to: realWhiteMove.to,
              promotion: 0,
            },
            fen: "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
          },
        ],
      });
      const realBlackMove = game.board.data.legalMoves.moves.find(
        (move) => move.toCoordinateNotation() === "e7e5"
      );
      if (!realBlackMove) throw new Error("Expected e7e5 to be legal");
      game.makeMove(realBlackMove, 0, false);
    `,
    realContext,
    { filename: "real-black-move-regression.js" }
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert(
    realBlackMoveRequest?.path === "/games/real-game/moves",
    "Expected the real black engine move to call the moves API"
  );
  assert(
    realBlackMoveRequest.body.playerId === "black-player",
    "Expected the real black engine move to use the black player id"
  );
  assert(
    realBlackMoveRequest.body.move.notation === "e7e5",
    "Expected the real black engine move payload to include e7e5"
  );
  console.log("multiplayer regression ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
