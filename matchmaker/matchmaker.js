#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { performance } = require("perf_hooks");

const DEFAULTS = {
  gamesPerColor: 500,
  depth: 4,
  seed: 42,
  maxPlies: 160,
  fairPositions: "fair_positions.txt",
};

const ENGINE_FILES = [
  "board-pieces.js",
  "history.js",
  "zobrist-keys.js",
  "zobrist.js",
  "bit-board.js",
  "transposition-table.js",
  "board-moves.js",
  "board-data.js",
  "computerplayers.js",
];

function usage(exitCode = 1) {
  console.error(`Usage: ./matchmaker/matchmaker.sh <version-a> <version-b> [options]

Runs version A against version B from random fair positions. It plays N games
with A as white and N games with A as black, then reports results from A's
perspective.

Options:
  --games <n>          Games per color (default: ${DEFAULTS.gamesPerColor})
  --depth <n>          Search depth for both versions (default: ${DEFAULTS.depth})
  --seed <n>           Seed for fair-position sampling (default: ${DEFAULTS.seed})
  --max-plies <n>      Draw after this many half-moves (default: ${DEFAULTS.maxPlies})
  --positions <file>   Fair positions file (default: ${DEFAULTS.fairPositions})
  --summary <file>     Summary output file (default: matchmaker/results/*.txt)
  --compact <file>     Compact comparison log (default: matchmaker/results/summary.txt)
  --v                  Print one line per game

Example:
  ./matchmaker/matchmaker.sh 1 2 --games 50 --depth 4 --seed 42
`);
  process.exit(exitCode);
}

function parsePositiveInt(value, optionName) {
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive integer.`);
  }
  return parsed;
}

function parseArgs(argv) {
  const positional = [];
  const options = {
    gamesPerColor: DEFAULTS.gamesPerColor,
    depth: DEFAULTS.depth,
    seed: DEFAULTS.seed,
    maxPlies: DEFAULTS.maxPlies,
    fairPositions: DEFAULTS.fairPositions,
    summary: undefined,
    compact: undefined,
    verbose: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];
    switch (arg) {
      case "--games":
        options.gamesPerColor = parsePositiveInt(value, "--games");
        i++;
        break;
      case "--depth":
        options.depth = parsePositiveInt(value, "--depth");
        i++;
        break;
      case "--seed":
        options.seed = parsePositiveInt(value, "--seed");
        i++;
        break;
      case "--max-plies":
        options.maxPlies = parsePositiveInt(value, "--max-plies");
        i++;
        break;
      case "--positions":
        options.fairPositions = value;
        i++;
        break;
      case "--summary":
        options.summary = value;
        i++;
        break;
      case "--compact":
        options.compact = value;
        i++;
        break;
      case "--v":
        options.verbose = true;
        break;
      case "--help":
      case "-h":
        usage(0);
        break;
      default:
        if (arg.startsWith("--")) {
          throw new Error(`Unknown option: ${arg}`);
        }
        positional.push(arg);
        break;
    }
  }

  if (positional.length !== 2) {
    usage();
  }

  return {
    ...options,
    versionA: parsePositiveInt(positional[0], "version-a"),
    versionB: parsePositiveInt(positional[1], "version-b"),
  };
}

function createRng(seed) {
  let state = seed >>> 0;
  return function rng() {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function readFairPositions(rootDir, fairPositionsPath) {
  const filePath = path.resolve(rootDir, fairPositionsPath);
  const lines = fs
    .readFileSync(filePath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));

  const positions = [];
  for (let i = 0; i < lines.length; i += 2) {
    const opening = lines[i];
    const fen = lines[i + 1];
    if (!opening || !fen) {
      throw new Error(`Incomplete opening/FEN pair near line ${i + 1}.`);
    }
    positions.push({ opening, fen });
  }

  if (positions.length === 0) {
    throw new Error(`No fair positions found in ${filePath}`);
  }
  return positions;
}

function resolveVersion(versionNumber) {
  const versionsDir = path.join(__dirname, "versions");
  if (!fs.existsSync(versionsDir)) {
    throw new Error(
      "No matchmaker versions exist yet. Run ./matchmaker/make-version.sh <name> first."
    );
  }

  const prefix = `${versionNumber}-`;
  const matches = fs
    .readdirSync(versionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith(prefix))
    .map((entry) => entry.name);

  if (matches.length === 0) {
    throw new Error(`Version ${versionNumber} was not found in matchmaker/versions.`);
  }
  if (matches.length > 1) {
    throw new Error(`Version ${versionNumber} is ambiguous: ${matches.join(", ")}`);
  }

  const versionDir = path.join(versionsDir, matches[0]);
  for (const fileName of ENGINE_FILES) {
    const filePath = path.join(versionDir, fileName);
    if (!fs.existsSync(filePath)) {
      throw new Error(`Version ${matches[0]} is missing ${fileName}`);
    }
  }
  return { number: versionNumber, label: matches[0], dir: versionDir };
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
    { filename: "matchmaker-globals.js" }
  );
  return context;
}

function loadBrowserScript(context, version, fileName) {
  const filePath = path.join(version.dir, fileName);
  const source = fs.readFileSync(filePath, "utf8");
  vm.runInContext(source, context, { filename: `${version.label}/${fileName}` });
}

function loadEngine(version) {
  const context = createEngineContext();
  for (const fileName of ENGINE_FILES) {
    loadBrowserScript(context, version, fileName);
  }
  vm.runInContext(
    `
      prepareDirectionOffsets();
      const MatchmakerHarness = {
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
          this.data.makeMove(move, true);
          game.color = game.color ^ Piece.COLOR_MASK;
          this.data.setLegalMovesFor(game.color);
          return this.snapshot();
        },
      };
    `,
    context,
    { filename: `${version.label}/matchmaker-harness.js` }
  );
  return context;
}

function runInEngine(context, expression) {
  return vm.runInContext(expression, context, { filename: "matchmaker-run.js" });
}

function createPosition(context, fen, depth) {
  return runInEngine(
    context,
    `MatchmakerHarness.createPosition(${JSON.stringify(fen)}, ${depth})`
  );
}

function chooseMove(context) {
  return runInEngine(context, "MatchmakerHarness.chooseAiMove()");
}

function applyMove(context, move) {
  return runInEngine(
    context,
    `MatchmakerHarness.applyUciMove(${JSON.stringify(move)})`
  );
}

function classifyResult(snapshot, versionAColor, plies, maxPlies) {
  const result = snapshot.result || "";
  if (result.startsWith("CHECK MATE")) {
    const winner = result.includes("WHITE") ? "w" : "b";
    return winner === versionAColor ? "win" : "loss";
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

function playGame(versionAContext, versionBContext, gameOptions) {
  let snapshotA = createPosition(versionAContext, gameOptions.fen, gameOptions.depth);
  let snapshotB = createPosition(versionBContext, gameOptions.fen, gameOptions.depth);
  const moves = [];

  for (let ply = 0; ply < gameOptions.maxPlies; ply++) {
    if (snapshotA.result || snapshotA.legalMoves.length === 0) break;

    const activeContext =
      snapshotA.color === gameOptions.versionAColor
        ? versionAContext
        : versionBContext;
    const move = chooseMove(activeContext);
    if (!move) break;

    snapshotA = applyMove(versionAContext, move);
    snapshotB = applyMove(versionBContext, move);
    if (snapshotA.fen !== snapshotB.fen) {
      throw new Error(
        `Versions diverged after ${move}: A=${snapshotA.fen}, B=${snapshotB.fen}`
      );
    }
    moves.push(move);
  }

  return {
    result: classifyResult(
      snapshotA,
      gameOptions.versionAColor,
      moves.length,
      gameOptions.maxPlies
    ),
    plies: moves.length,
    finalFen: snapshotA.fen,
    opening: gameOptions.opening,
    startFen: gameOptions.fen,
    versionAColor: gameOptions.versionAColor,
  };
}

function percent(count, total) {
  return total === 0 ? "0.0%" : `${((count / total) * 100).toFixed(1)}%`;
}

function scorePercent(stats) {
  const total = stats.wins + stats.draws + stats.losses;
  const score = stats.wins + stats.draws * 0.5;
  return total === 0 ? "0.0%" : `${((score / total) * 100).toFixed(1)}%`;
}

function defaultSummaryPath(rootDir, options, versionA, versionB) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(
    rootDir,
    "matchmaker",
    "results",
    `${stamp}-v${versionA.number}-vs-v${versionB.number}.txt`
  );
}

function defaultCompactSummaryPath(rootDir) {
  return path.join(rootDir, "matchmaker", "results", "summary.txt");
}

function formatSummary(options, versionA, versionB, stats, elapsedMs, summaryPath) {
  const total = stats.wins + stats.draws + stats.losses;
  return [
    "Matchmaker summary",
    `Version A: ${versionA.label}`,
    `Version B: ${versionB.label}`,
    `Perspective: ${versionA.label}`,
    `Games per color: ${options.gamesPerColor}`,
    `Total games: ${total}`,
    `Depth: ${options.depth}`,
    `Seed: ${options.seed}`,
    `Max plies: ${options.maxPlies}`,
    `Fair positions: ${options.fairPositions}`,
    "",
    `Wins: ${stats.wins} (${percent(stats.wins, total)})`,
    `Draws: ${stats.draws} (${percent(stats.draws, total)})`,
    `Losses: ${stats.losses} (${percent(stats.losses, total)})`,
    `Score: ${scorePercent(stats)}`,
    "",
    `A as white: ${stats.asWhite.wins}-${stats.asWhite.draws}-${stats.asWhite.losses}`,
    `A as black: ${stats.asBlack.wins}-${stats.asBlack.draws}-${stats.asBlack.losses}`,
    `Elapsed: ${(elapsedMs / 1000).toFixed(1)} s`,
    `Summary file: ${path.relative(process.cwd(), summaryPath)}`,
    "",
  ].join("\n");
}

function formatCompactSummaryLine(timestamp, versionA, versionB, stats) {
  return [
    timestamp,
    versionA.label,
    versionB.label,
    stats.wins,
    stats.draws,
    stats.losses,
  ].join(", ");
}

function appendCompactSummary(summaryPath, timestamp, versionA, versionB, stats) {
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  if (!fs.existsSync(summaryPath) || fs.statSync(summaryPath).size === 0) {
    fs.writeFileSync(summaryPath, "timestamp, v1, v2, win, draw, loss\n", "utf8");
  }
  fs.appendFileSync(
    summaryPath,
    formatCompactSummaryLine(timestamp, versionA, versionB, stats) + "\n",
    "utf8"
  );
}

function recordResult(stats, color, result) {
  if (result === "win") stats.wins++;
  else if (result === "loss") stats.losses++;
  else stats.draws++;

  const colorStats = color === "w" ? stats.asWhite : stats.asBlack;
  if (result === "win") colorStats.wins++;
  else if (result === "loss") colorStats.losses++;
  else colorStats.draws++;
}

function runMatch(options, versionA, versionB, positions) {
  const rng = createRng(options.seed);
  const versionAContext = loadEngine(versionA);
  const versionBContext = loadEngine(versionB);
  const stats = {
    wins: 0,
    draws: 0,
    losses: 0,
    asWhite: { wins: 0, draws: 0, losses: 0 },
    asBlack: { wins: 0, draws: 0, losses: 0 },
  };

  for (const versionAColor of ["w", "b"]) {
    for (let gameIndex = 0; gameIndex < options.gamesPerColor; gameIndex++) {
      const position = positions[Math.floor(rng() * positions.length)];
      const result = playGame(versionAContext, versionBContext, {
        opening: position.opening,
        fen: position.fen,
        depth: options.depth,
        maxPlies: options.maxPlies,
        versionAColor,
      });
      recordResult(stats, versionAColor, result.result);
      if (options.verbose) {
        const colorName = versionAColor === "w" ? "white" : "black";
        console.log(
          [
            `game=${gameIndex + 1}/${options.gamesPerColor}`,
            `a=${colorName}`,
            `result=${result.result}`,
            `plies=${result.plies}`,
            `opening=${result.opening}`,
          ].join(" | ")
        );
      }
    }
  }

  return stats;
}

function main() {
  const rootDir = path.resolve(__dirname, "..");
  const options = parseArgs(process.argv.slice(2));
  const versionA = resolveVersion(options.versionA);
  const versionB = resolveVersion(options.versionB);
  const positions = readFairPositions(rootDir, options.fairPositions);
  const summaryPath = options.summary
    ? path.resolve(rootDir, options.summary)
    : defaultSummaryPath(rootDir, options, versionA, versionB);
  const compactSummaryPath = options.compact
    ? path.resolve(rootDir, options.compact)
    : defaultCompactSummaryPath(rootDir);

  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });

  const timestamp = new Date().toISOString();
  const startMs = performance.now();
  const stats = runMatch(options, versionA, versionB, positions);
  const elapsedMs = performance.now() - startMs;
  const summary = formatSummary(
    options,
    versionA,
    versionB,
    stats,
    elapsedMs,
    summaryPath
  );

  fs.writeFileSync(summaryPath, summary, "utf8");
  appendCompactSummary(compactSummaryPath, timestamp, versionA, versionB, stats);
  process.stdout.write(summary);
}

main();
