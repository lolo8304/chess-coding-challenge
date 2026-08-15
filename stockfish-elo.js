const fs = require("fs");
const path = require("path");
const vm = require("vm");
const readline = require("readline");
const { spawn } = require("child_process");
const { performance } = require("perf_hooks");

const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function usage(exitCode = 1) {
  console.error(`Usage: node stockfish-elo.js [options]

Options:
  --stockfish <path>        Stockfish binary path (default: stockfish)
  --games <n>               Number of games to play (default: 2)
  --engine-depth <n>        Your AI search depth, 1-7 (default: 4)
  --stockfish-elo <n>       Stockfish limited Elo opponent (default: 1320)
  --stockfish-movetime <ms> Stockfish time per move (default: 100)
  --max-plies <n>           Stop each game after this many half-moves (default: 160)
  --fen "<fen>"             Starting FEN (default: normal chess start)
  --save-games <file>       Write replay commands, UCI moves, and FENs to a file
  --save-pgn <file>         Write games as PGN for chess GUIs
  --v                       Print game, ply, move, and FEN debug details
  --vv                      Also print raw Stockfish UCI traffic

Example:
  node stockfish-elo.js --stockfish /opt/homebrew/bin/stockfish --games 10 --engine-depth 4 --stockfish-elo 1400 --v
  node stockfish-elo.js --games 2 --save-games stockfish-games.txt
  node stockfish-elo.js --games 2 --save-pgn stockfish-games.pgn

Install Stockfish first if needed:
  brew install stockfish
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const options = {
    stockfish: "stockfish",
    games: 2,
    engineDepth: 4,
    stockfishElo: 1320,
    stockfishMoveTimeMs: 100,
    maxPlies: 160,
    fen: START_FEN,
    saveGames: undefined,
    savePgn: undefined,
    verbose: 0,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];
    switch (arg) {
      case "--stockfish":
        options.stockfish = value;
        i++;
        break;
      case "--games":
        options.games = parsePositiveInt(value, "--games");
        i++;
        break;
      case "--engine-depth":
        options.engineDepth = parsePositiveInt(value, "--engine-depth");
        i++;
        break;
      case "--stockfish-elo":
        options.stockfishElo = parsePositiveInt(value, "--stockfish-elo");
        i++;
        break;
      case "--stockfish-movetime":
        options.stockfishMoveTimeMs = parsePositiveInt(
          value,
          "--stockfish-movetime"
        );
        i++;
        break;
      case "--max-plies":
        options.maxPlies = parsePositiveInt(value, "--max-plies");
        i++;
        break;
      case "--fen":
        options.fen = value;
        i++;
        break;
      case "--save-games":
        options.saveGames = value;
        i++;
        break;
      case "--save-pgn":
        options.savePgn = value;
        i++;
        break;
      case "--v":
        options.verbose = Math.max(options.verbose, 1);
        break;
      case "--vv":
        options.verbose = Math.max(options.verbose, 2);
        break;
      case "--help":
      case "-h":
        usage(0);
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        usage();
    }
  }

  if (options.engineDepth < 1 || options.engineDepth > 7) {
    throw new Error("--engine-depth must be between 1 and 7.");
  }
  return options;
}

function parsePositiveInt(value, optionName) {
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive integer.`);
  }
  return parsed;
}

function createEngineContext() {
  const context = vm.createContext({
    console,
    performance,
    setTimeout,
    clearTimeout,
    window: { confirm: () => false },
    random: (max) => Math.random() * max,
  });

  vm.runInContext(
    `
      var ROW_CELLS = 8;
      var COL_CELLS = 8;
      var verbose = 0;
      var game = { color: undefined };
      function redraw() {}
    `,
    context,
    { filename: "stockfish-elo-node-globals.js" }
  );

  return context;
}

function loadBrowserScript(context, fileName) {
  const filePath = path.join(__dirname, fileName);
  const source = fs.readFileSync(filePath, "utf8");
  vm.runInContext(source, context, { filename: fileName });
}

function loadEngine(context) {
  [
    "board-pieces.js",
    "history.js",
    "zobrist-keys.js",
    "zobrist.js",
    "bit-board.js",
    "transposition-table.js",
    "board-moves.js",
    "board-data.js",
    "computerplayers.js",
  ].forEach((fileName) => loadBrowserScript(context, fileName));

  vm.runInContext(
    `
      prepareDirectionOffsets();
      const StockfishHarness = {
        createPosition(fen, depth) {
          setCalculationDepth(depth);
          TranspositionTableReset();
          this.data = new BoardData(new History(), fen);
          game.color = this.data.legalMoves.color;
          this.data.setLegalMovesFor(game.color);
          this.data.setLegalMovesFor(game.color);
          return this.snapshot();
        },
        snapshot() {
          return {
            fen: this.data.calculatedFen(),
            color: game.color === Piece.WHITE ? "w" : "b",
            result: this.data.result,
            legalMoves: this.data.legalMoves.moves.map((move) =>
              move.toCoordinateNotation()
            ),
          };
        },
        chooseAiMove() {
          if (this.data.isFinished()) return undefined;
          const player = evaluators.newPlayerOff(
            "alpha-beta",
            this.data,
            game.color
          );
          const move = player.bestMove(this.data.legalMoves);
          return move ? move.toCoordinateNotation() : undefined;
        },
        applyUciMove(uciMove) {
          const move = this.data.legalMoves.moves.find(
            (candidate) => candidate.toCoordinateNotation() === uciMove
          );
          if (!move) {
            throw new Error(
              "Illegal move " +
                uciMove +
                " for position " +
                this.data.calculatedFen() +
                ". Legal moves: " +
                this.data.legalMoves.moves
                  .map((candidate) => candidate.toCoordinateNotation())
                  .join(", ")
            );
          }
          const sanPrefix = this.moveSanPrefix(move);
          this.data.makeMove(move, true);
          game.color = game.color ^ Piece.COLOR_MASK;
          this.data.setLegalMovesFor(game.color);
          const snapshot = this.snapshot();
          snapshot.san = sanPrefix + this.moveSanSuffix(game.color);
          return snapshot;
        },
        moveSanPrefix(move) {
          if (move.castlingKingTargetIndex) {
            return move.to > move.from ? "O-O" : "O-O-O";
          }

          const pieceType = move.pieceOnly;
          const pieceLetter =
            pieceType === Piece.PAWN ? "" : toPieceNotation(pieceType).toUpperCase();
          const targetSquare = this.data.indexToAlgebraic(move.to);
          const capture = move.isHit || move.enPassant !== undefined;
          let disambiguation = "";

          if (pieceType !== Piece.PAWN) {
            const sameTargetMoves = this.data.legalMoves.moves.filter(
              (candidate) =>
                candidate !== move &&
                candidate.pieceOnly === pieceType &&
                candidate.color === move.color &&
                candidate.to === move.to
            );
            if (sameTargetMoves.length > 0) {
              const fromSquare = this.data.indexToAlgebraic(move.from);
              const sameFile = sameTargetMoves.some(
                (candidate) =>
                  this.data.indexToAlgebraic(candidate.from)[0] === fromSquare[0]
              );
              const sameRank = sameTargetMoves.some(
                (candidate) =>
                  this.data.indexToAlgebraic(candidate.from)[1] === fromSquare[1]
              );
              if (!sameFile) {
                disambiguation = fromSquare[0];
              } else if (!sameRank) {
                disambiguation = fromSquare[1];
              } else {
                disambiguation = fromSquare;
              }
            }
          } else if (capture) {
            disambiguation = this.data.indexToAlgebraic(move.from)[0];
          }

          const promotion =
            move.promotionPiece > Piece.None
              ? "=" + toPieceNotation(move.promotionPiece).toUpperCase()
              : "";

          return pieceLetter + disambiguation + (capture ? "x" : "") + targetSquare + promotion;
        },
        moveSanSuffix(colorToMove) {
          if (this.data.isKingInCheck(colorToMove)) {
            return this.data.legalMoves.moves.length === 0 ? "#" : "+";
          }
          return "";
        },
      };
    `,
    context,
    { filename: "stockfish-elo-harness.js" }
  );
}

function runInEngine(context, expression) {
  return vm.runInContext(expression, context, { filename: "stockfish-elo-run.js" });
}

class UciEngine {
  constructor(command, verbose = 0) {
    this.command = command;
    this.verbose = verbose;
    this.lines = [];
    this.waiters = [];
    this.closed = false;
  }

  start() {
    this.process = spawn(this.command, [], { stdio: ["pipe", "pipe", "pipe"] });
    this.process.on("error", (error) => {
      this.rejectWaiters(error);
    });
    this.process.on("exit", (code, signal) => {
      this.closed = true;
      this.rejectWaiters(
        new Error(`Stockfish exited unexpectedly: code=${code}, signal=${signal}`)
      );
    });
    this.process.stderr.on("data", (chunk) => {
      const message = chunk.toString().trim();
      if (message) console.error(`[stockfish stderr] ${message}`);
    });

    const reader = readline.createInterface({ input: this.process.stdout });
    reader.on("line", (line) => this.handleLine(line));
  }

  handleLine(line) {
    if (this.verbose >= 2) {
      console.log(`[uci <] ${line}`);
    }
    if (line.trim()) {
      this.lines.push(line);
    }
    for (let i = 0; i < this.waiters.length; i++) {
      const waiter = this.waiters[i];
      const match = waiter.predicate(line);
      if (match) {
        clearTimeout(waiter.timeout);
        this.waiters.splice(i, 1);
        waiter.resolve({ line, match });
        return;
      }
    }
  }

  send(command) {
    if (this.verbose >= 2) {
      console.log(`[uci >] ${command}`);
    }
    this.process.stdin.write(command + "\n");
  }

  waitFor(predicate, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        reject,
        timeout: setTimeout(() => {
          this.waiters = this.waiters.filter((item) => item !== waiter);
          reject(new Error("Timed out waiting for Stockfish."));
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  rejectWaiters(error) {
    while (this.waiters.length > 0) {
      const waiter = this.waiters.pop();
      clearTimeout(waiter.timeout);
      waiter.reject(error);
    }
  }

  async initialize(stockfishElo) {
    this.start();
    this.send("uci");
    await this.waitFor((line) => line === "uciok");
    this.send("setoption name UCI_LimitStrength value true");
    this.send(`setoption name UCI_Elo value ${stockfishElo}`);
    this.send("isready");
    await this.waitFor((line) => line === "readyok");
  }

  async newGame() {
    this.send("ucinewgame");
    this.send("isready");
    await this.waitFor((line) => line === "readyok");
  }

  async bestMove(fen, moveTimeMs) {
    this.lines = [];
    this.send(`position fen ${fen}`);
    this.send(`go movetime ${moveTimeMs}`);
    const { match } = await this.waitFor((line) => /^bestmove\s+(\S+)/.exec(line));
    return match[1] === "(none)" ? undefined : match[1];
  }

  quit() {
    if (!this.closed) {
      this.process.stdin.end("quit\n");
    }
  }
}

async function playGame(context, stockfish, options, aiColor) {
  await stockfish.newGame();
  let snapshot = runInEngine(
    context,
    `StockfishHarness.createPosition(${JSON.stringify(options.fen)}, ${options.engineDepth})`
  );
  const moves = [];
  const turns = [];

  logVerbose(
    options,
    `Start game: AI=${aiColor === "w" ? "white" : "black"}, FEN=${snapshot.fen}`
  );

  for (let ply = 0; ply < options.maxPlies; ply++) {
    if (snapshot.result || snapshot.legalMoves.length === 0) {
      logVerbose(
        options,
        `Stop before ply ${ply + 1}: result=${snapshot.result || "no legal moves"}`
      );
      break;
    }

    const aiToMove = snapshot.color === aiColor;
    logVerbose(
      options,
      [
        `Ply ${ply + 1}`,
        `turn=${snapshot.color === "w" ? "white" : "black"}`,
        `player=${aiToMove ? "AI" : "Stockfish"}`,
        `legalMoves=${snapshot.legalMoves.length}`,
        `FEN=${snapshot.fen}`,
      ].join(" | ")
    );

    const startTime = performance.now();
    const beforeFen = snapshot.fen;
    const move = aiToMove
      ? runInEngine(context, "StockfishHarness.chooseAiMove()")
      : await stockfish.bestMove(snapshot.fen, options.stockfishMoveTimeMs);
    const elapsedMs = Math.round((performance.now() - startTime) * 10) / 10;

    if (!move) break;
    logVerbose(
      options,
      `${aiToMove ? "AI" : "Stockfish"} move: ${move} (${elapsedMs} ms)`
    );
    snapshot = runInEngine(
      context,
      `StockfishHarness.applyUciMove(${JSON.stringify(move)})`
    );
    turns.push({
      ply: ply + 1,
      color: beforeFen.split(" ")[1],
      player: aiToMove ? "AI" : "Stockfish",
      move,
      san: snapshot.san || move,
      elapsedMs,
      beforeFen,
      afterFen: snapshot.fen,
    });
    logVerbose(options, `After move FEN: ${snapshot.fen}`);
    moves.push(move);
  }

  const result = classifyResult(snapshot, aiColor, moves.length, options.maxPlies);
  return {
    aiColor,
    result,
    score: scoreForAi(result),
    plies: moves.length,
    finalFen: snapshot.fen,
    moves,
    turns,
  };
}

function logVerbose(options, message) {
  if (options.verbose >= 1) {
    console.log(`[debug] ${message}`);
  }
}

function classifyResult(snapshot, aiColor, plies, maxPlies) {
  const result = snapshot.result || "";
  if (result.startsWith("CHECK MATE")) {
    const winner = result.includes("WHITE") ? "w" : "b";
    return winner === aiColor ? "win" : "loss";
  }
  if (result.startsWith("STALEMATE") || result.startsWith("DRAW")) {
    return "draw";
  }
  if (snapshot.legalMoves.length === 0) {
    return "draw";
  }
  if (plies >= maxPlies) {
    return "draw";
  }
  return "draw";
}

function scoreForAi(result) {
  if (result === "win") return 1;
  if (result === "loss") return 0;
  return 0.5;
}

function estimateElo(opponentElo, score, games) {
  if (games === 0) return undefined;
  const rawScoreRate = score / games;
  const scoreRate = Math.min(0.99, Math.max(0.01, rawScoreRate));
  const diff = -400 * Math.log10(1 / scoreRate - 1);
  return {
    elo: Math.round(opponentElo + diff),
    scoreRate: rawScoreRate,
    diff: Math.round(diff),
  };
}

function writeGameReplayFile(options, results) {
  if (!options.saveGames) return;

  const lines = [];
  lines.push("# Chess Coding Challenge AI vs Stockfish replay");
  lines.push(`# Stockfish Elo: ${options.stockfishElo}`);
  lines.push(`# AI depth: ${options.engineDepth}`);
  lines.push(`# Stockfish movetime: ${options.stockfishMoveTimeMs} ms`);
  lines.push(`# Start FEN: ${options.fen}`);
  lines.push("");

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    lines.push(`Game ${i + 1}`);
    lines.push(`AI color: ${result.aiColor === "w" ? "white" : "black"}`);
    lines.push(`Result for AI: ${result.result}`);
    lines.push(`Final FEN: ${result.finalFen}`);
    lines.push("");
    lines.push("Stockfish CLI replay:");
    lines.push(`position fen ${options.fen} moves ${result.moves.join(" ")}`);
    lines.push("d");
    lines.push("");
    lines.push("Move list:");
    lines.push(formatMoveList(result.moves));
    lines.push("");
    lines.push("FEN after each move:");
    lines.push(`0. ${options.fen}`);
    for (const turn of result.turns) {
      lines.push(
        `${turn.ply}. ${turn.player} ${turn.move} ${turn.san} (${turn.elapsedMs} ms): ${turn.afterFen}`
      );
    }
    lines.push("");
  }

  fs.writeFileSync(options.saveGames, lines.join("\n"), "utf8");
}

function writePgnFile(options, results) {
  if (!options.savePgn) return;

  const lines = [];
  const now = new Date();
  const utcDate =
    now.getUTCFullYear() +
    "." +
    String(now.getUTCMonth() + 1).padStart(2, "0") +
    "." +
    String(now.getUTCDate()).padStart(2, "0");

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const white = result.aiColor === "w" ? "Chess Coding Challenge AI" : "Stockfish";
    const black = result.aiColor === "b" ? "Chess Coding Challenge AI" : "Stockfish";
    const pgnResult = pgnResultFor(result);

    lines.push(`[Event "Chess Coding Challenge AI vs Stockfish"]`);
    lines.push(`[Site "Local"]`);
    lines.push(`[Date "${utcDate}"]`);
    lines.push(`[Round "${i + 1}"]`);
    lines.push(`[White "${white}"]`);
    lines.push(`[Black "${black}"]`);
    lines.push(`[Result "${pgnResult}"]`);
    lines.push(`[WhiteElo "${result.aiColor === "w" ? "?" : options.stockfishElo}"]`);
    lines.push(`[BlackElo "${result.aiColor === "b" ? "?" : options.stockfishElo}"]`);
    lines.push(`[TimeControl "-"]`);
    lines.push(`[PlyCount "${result.plies}"]`);
    if (options.fen !== START_FEN) {
      lines.push(`[SetUp "1"]`);
      lines.push(`[FEN "${options.fen}"]`);
    }
    lines.push("");
    lines.push(formatPgnMovetext(result.turns, pgnResult));
    lines.push("");
  }

  fs.writeFileSync(options.savePgn, lines.join("\n"), "utf8");
}

function pgnResultFor(result) {
  if (result.result === "draw") return "1/2-1/2";
  if (result.result === "win") {
    return result.aiColor === "w" ? "1-0" : "0-1";
  }
  if (result.result === "loss") {
    return result.aiColor === "w" ? "0-1" : "1-0";
  }
  return "*";
}

function formatPgnMovetext(turns, result) {
  if (turns.length === 0) return result;

  const tokens = [];
  for (const turn of turns) {
    const moveNumber = Math.floor((turn.ply + 1) / 2);
    if (turn.color === "w") {
      tokens.push(`${moveNumber}.`);
    } else if (turn.ply === 1) {
      tokens.push(`${moveNumber}...`);
    }
    tokens.push(turn.san || turn.move);
  }
  tokens.push(result);
  return wrapPgnLine(tokens);
}

function wrapPgnLine(tokens) {
  const lines = [];
  let line = "";
  for (const token of tokens) {
    if (line.length === 0) {
      line = token;
    } else if (line.length + token.length + 1 > 80) {
      lines.push(line);
      line = token;
    } else {
      line += " " + token;
    }
  }
  if (line.length > 0) lines.push(line);
  return lines.join("\n");
}

function formatMoveList(moves) {
  if (moves.length === 0) return "-";
  const parts = [];
  for (let i = 0; i < moves.length; i += 2) {
    const moveNumber = Math.floor(i / 2) + 1;
    const whiteMove = moves[i];
    const blackMove = moves[i + 1];
    parts.push(`${moveNumber}. ${whiteMove}${blackMove ? " " + blackMove : ""}`);
  }
  return parts.join(" ");
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const context = createEngineContext();
  loadEngine(context);

  if (options.verbose) {
    console.log(
      `[debug] Options: stockfish=${options.stockfish}, games=${options.games}, engineDepth=${options.engineDepth}, stockfishElo=${options.stockfishElo}, stockfishMoveTimeMs=${options.stockfishMoveTimeMs}, maxPlies=${options.maxPlies}, verbose=${options.verbose}`
    );
  }

  const stockfish = new UciEngine(options.stockfish, options.verbose);
  await stockfish.initialize(options.stockfishElo);

  const results = [];
  try {
    for (let gameNumber = 1; gameNumber <= options.games; gameNumber++) {
      const aiColor = gameNumber % 2 === 1 ? "w" : "b";
      const result = await playGame(context, stockfish, options, aiColor);
      results.push(result);
      console.log(
        [
          `Game ${gameNumber}/${options.games}`,
          `AI ${aiColor === "w" ? "white" : "black"}`,
          result.result,
          `score=${result.score}`,
          `plies=${result.plies}`,
        ].join(" | ")
      );
    }
  } finally {
    stockfish.quit();
  }

  const score = results.reduce((sum, result) => sum + result.score, 0);
  const estimate = estimateElo(options.stockfishElo, score, results.length);
  writeGameReplayFile(options, results);
  writePgnFile(options, results);

  console.log("");
  console.log(`Opponent Stockfish Elo: ${options.stockfishElo}`);
  console.log(`AI score: ${score}/${results.length} (${Math.round(estimate.scoreRate * 100)}%)`);
  console.log(`Estimated AI Elo: ${estimate.elo} (${estimate.diff >= 0 ? "+" : ""}${estimate.diff} vs opponent)`);
  if (options.saveGames) {
    console.log(`Replay file: ${options.saveGames}`);
  }
  if (options.savePgn) {
    console.log(`PGN file: ${options.savePgn}`);
  }
  console.log("");
  console.log(
    "Note: this is a rough match-performance estimate. Use more games and multiple Stockfish Elo levels for a more stable number."
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
