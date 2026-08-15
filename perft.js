const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { performance } = require("perf_hooks");

const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function usage() {
  console.error('Usage: node perft.js [--profile] [--nodes-only] <depth> "<fen>"');
  console.error(`Example: node perft.js 3 "${START_FEN}"`);
  console.error(`Example: node perft.js --profile 3 "${START_FEN}"`);
  console.error(`Example: node perft.js --nodes-only 3 "${START_FEN}"`);
  process.exit(1);
}

function getCommandLineArguments() {
  const args = process.argv.slice(2);
  const profile = args.includes("--profile");
  const nodesOnly = args.includes("--nodes-only");
  const positionalArgs = args.filter(
    (arg) => arg !== "--profile" && arg !== "--nodes-only"
  );

  if (positionalArgs.length < 1 || positionalArgs.length > 2) {
    usage();
  }

  const depth = parseInt(positionalArgs[0], 10);
  const fen = positionalArgs[1] || START_FEN;

  if (Number.isNaN(depth) || depth < 0) {
    console.error("Depth must be a non-negative integer.");
    usage();
  }

  return { depth, fen, profile, nodesOnly };
}

function createEngineContext() {
  const context = vm.createContext({
    console,
    performance,
    setTimeout,
    clearTimeout,
    window: {},
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
    { filename: "perft-node-globals.js" }
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
    "zobrist.js",
    "bit-board.js",
    "board-moves.js",
    "board-data.js",
  ].forEach((fileName) => loadBrowserScript(context, fileName));

  vm.runInContext("prepareDirectionOffsets();", context, {
    filename: "perft-setup.js",
  });
}

function installProfiler(context) {
  vm.runInContext(
    `
      var perftProfiler = {
        metrics: Object.create(null),
        wrap(prototype, methodName, label) {
          const original = prototype && prototype[methodName];
          if (typeof original !== "function") {
            throw new Error("Cannot profile missing method: " + label);
          }

          const metrics = this.metrics;
          prototype[methodName] = function () {
            const startTime = performance.now();
            try {
              return original.apply(this, arguments);
            } finally {
              const elapsedMs = performance.now() - startTime;
              const metric =
                metrics[label] ||
                (metrics[label] = { label, calls: 0, totalMs: 0 });
              metric.calls++;
              metric.totalMs += elapsedMs;
            }
          };
        },
        report(totalMs) {
          return Object.values(this.metrics)
            .map((metric) => ({
              label: metric.label,
              calls: metric.calls,
              totalMs: Math.round(metric.totalMs * 10) / 10,
              avgMs:
                Math.round((metric.totalMs / Math.max(metric.calls, 1)) * 1000) /
                1000,
              percent:
                Math.round((metric.totalMs / Math.max(totalMs, 0.001)) * 1000) /
                10,
            }))
            .sort((left, right) => right.totalMs - left.totalMs);
        },
      };

      perftProfiler.wrap(BoardData.prototype, "setLegalMovesFor", "BoardData.setLegalMovesFor");
      perftProfiler.wrap(BoardData.prototype, "setLegalMovesForPerft", "BoardData.setLegalMovesForPerft");
      perftProfiler.wrap(BoardData.prototype, "setLegalMovesForSearch", "BoardData.setLegalMovesForSearch");
      perftProfiler.wrap(BoardData.prototype, "makeMove", "BoardData.makeMove");
      perftProfiler.wrap(BoardData.prototype, "undoMove", "BoardData.undoMove");
      perftProfiler.wrap(BoardData.prototype, "isIndexAttackedByColor", "BoardData.isIndexAttackedByColor");
      perftProfiler.wrap(LegalMoves.prototype, "generateMoves", "LegalMoves.generateMoves");
      perftProfiler.wrap(LegalMoves.prototype, "limitingMovementPinnedPieces", "LegalMoves.limitingMovementPinnedPieces");
      perftProfiler.wrap(LegalMoves.prototype, "removePseudoIllegalMovesForMyKing", "LegalMoves.removePseudoIllegalMovesForMyKing");
      perftProfiler.wrap(Move.prototype, "makeMove", "Move.makeMove");
    `,
    context,
    { filename: "perft-profiler.js" }
  );
}

function runPerft(context, depth, fen, profile, nodesOnly) {
  context.perftDepth = depth;
  context.perftFen = fen;
  context.perftProfile = profile;
  context.perftNodesOnly = nodesOnly;

  return vm.runInContext(
    `
      const data = new BoardData(new History(), perftFen);
      game.color = data.legalMoves.color;
      if (perftNodesOnly) {
        data.setLegalMovesForPerft(game.color);
      } else {
        data.setLegalMovesFor(game.color);
      }

      const startTime = performance.now();
      const stats =
        perftDepth === 0
          ? new MoveGeneratorStats(1)
          : perftNodesOnly
            ? data.testMovesNodesOnly(perftDepth)
            : data.testMoves(perftDepth);
      const elapsedMs = Math.round((performance.now() - startTime) * 10) / 10;

      ({
        stats: stats.toString(),
        nodes: stats.nodes,
        elapsedMs,
        profile: perftProfile ? perftProfiler.report(elapsedMs) : undefined,
        finalFen: data.calculatedFen(),
      });
    `,
    context,
    { filename: "perft-run.js" }
  );
}

function main() {
  const { depth, fen, profile, nodesOnly } = getCommandLineArguments();
  const context = createEngineContext();

  loadEngine(context);
  if (profile) {
    installProfiler(context);
  }

  console.log(`Depth: ${depth}`);
  console.log(`FEN: ${fen}`);
  if (nodesOnly) {
    console.log("Mode: nodes-only");
  }
  console.log("Start test move calculation:");

  const result = runPerft(context, depth, fen, profile, nodesOnly);

  console.log(`${depth}: ${result.stats}`);
  console.log(`Nodes: ${result.nodes}`);
  console.log(`Time: ${result.elapsedMs} ms`);
  console.log(
    `NPS: ${Math.round((result.nodes / Math.max(result.elapsedMs, 0.001)) * 1000)}`
  );
  if (result.profile) {
    console.log("Profile:");
    for (const metric of result.profile) {
      console.log(
        [
          metric.label.padEnd(48),
          String(metric.calls).padStart(8) + " calls",
          String(metric.totalMs).padStart(10) + " ms",
          String(metric.avgMs).padStart(8) + " ms/call",
          String(metric.percent).padStart(6) + "%",
        ].join("  ")
      );
    }
  }
  console.log(`Final FEN: ${result.finalFen}`);
}

main();
