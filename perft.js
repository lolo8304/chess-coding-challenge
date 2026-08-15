const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { performance } = require("perf_hooks");

const START_FEN =
  "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";

function usage() {
  console.error('Usage: node perft.js <depth> "<fen>"');
  console.error(`Example: node perft.js 3 "${START_FEN}"`);
  process.exit(1);
}

function getCommandLineArguments() {
  const args = process.argv.slice(2);
  if (args.length < 1 || args.length > 2) {
    usage();
  }

  const depth = parseInt(args[0], 10);
  const fen = args[1] || START_FEN;

  if (Number.isNaN(depth) || depth < 0) {
    console.error("Depth must be a non-negative integer.");
    usage();
  }

  return { depth, fen };
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

function runPerft(context, depth, fen) {
  context.perftDepth = depth;
  context.perftFen = fen;

  return vm.runInContext(
    `
      const data = new BoardData(new History(), perftFen);
      game.color = data.legalMoves.color;
      data.setLegalMovesFor(game.color);

      const startTime = performance.now();
      const stats =
        perftDepth === 0 ? new MoveGeneratorStats(1) : data.testMoves(perftDepth);
      const elapsedMs = Math.round((performance.now() - startTime) * 10) / 10;

      ({
        stats: stats.toString(),
        nodes: stats.nodes,
        elapsedMs,
        finalFen: data.calculatedFen(),
      });
    `,
    context,
    { filename: "perft-run.js" }
  );
}

function main() {
  const { depth, fen } = getCommandLineArguments();
  const context = createEngineContext();

  loadEngine(context);

  console.log(`Depth: ${depth}`);
  console.log(`FEN: ${fen}`);
  console.log("Start test move calculation:");

  const result = runPerft(context, depth, fen);

  console.log(`${depth}: ${result.stats}`);
  console.log(`Nodes: ${result.nodes}`);
  console.log(`Time: ${result.elapsedMs} ms`);
  console.log(`Final FEN: ${result.finalFen}`);
}

main();
