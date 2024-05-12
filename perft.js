// Import the necessary module to work with command line arguments
const process = require("process");
require("./board-pieces.js");
require("./board-moves.js");
const { History } = require("./history.js");
const BoardData = require("./board-data.js");

let data = undefined;
let fen_hash = undefined;

function stats(depth, stat) {
  setTimeout(function stats2() {
    console.log("" + depth + ": " + stat);
  }, 100);
}

// Function to extract command line arguments
function getCommandLineArguments() {
  const args = process.argv.slice(2); // This removes the first two default arguments
  if (args.length !== 2) {
    console.error("Usage: node program.js <depth> <fen>");
    process.exit(1);
  }

  const depth = parseInt(args[0]);
  const fen = args[1];
  fen_hash = fen;

  if (isNaN(depth)) {
    console.error("Depth must be an integer.");
    process.exit(1);
  }

  return { depth, fen };
}

function testMoves(depth, callbackStats) {
  console.log("Start test move calculation:");
  maxDepth = depth;
  for (let depth = 1; depth < maxDepth + 1; depth++) {
    const startTime = performance.now();
    const numPositions = data.testMoves(depth);
    const diffTime = Math.round(performance.now() - startTime);
    console.log(
      "Depth: " +
        depth +
        " ply Result: " +
        numPositions +
        " Time " +
        diffTime +
        " ms"
    );
    callbackStats(depth, numPositions);
  }
}

// Main function to execute the program logic
function main() {
  const { depth, fen } = getCommandLineArguments();
  console.log(`Depth: ${depth}`);
  console.log(`FEN: ${fen}`);

  data = new BoardData(new History(), fen);
  testMoves(stats);
}

// Run the main function
main();
