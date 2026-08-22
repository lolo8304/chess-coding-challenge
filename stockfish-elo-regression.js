const {
  createEngineContext,
  loadEngine,
  runInEngine,
} = require("./stockfish-elo.js");

const TESTS = [
  {
    name: "bridge accepts promotion-check capture reply",
    fen: "r1b2rk1/pp2qPp1/2p5/2n5/2Q5/4P3/PPP1KPPP/R1B4R b - - 0 1",
    move: "f8f7",
    expectedLegalMoves: ["f8f7", "e7f7", "g8h8", "g8h7"],
    expectedAfterFen:
      "r1b3k1/pp2qrp1/2p5/2n5/2Q5/4P3/PPP1KPPP/R1B4R w - - 0 1",
  },
  {
    name: "bridge strips invalid castling rights before Stockfish handoff",
    fen: "1rb4r/pppp1ppp/3k4/6P1/P3P3/2P3P1/2PK1P2/R4B1R w KQ - 3 2",
    move: "f1c4",
    expectedStartFen:
      "1rb4r/pppp1ppp/3k4/6P1/P3P3/2P3P1/2PK1P2/R4B1R w - - 3 2",
    expectedLegalMovesExclude: ["d2c2"],
    expectedAfterFen:
      "1rb4r/pppp1ppp/3k4/6P1/P1B1P3/2P3P1/2PK1P2/R6R b - - 4 3",
  },
];

function assertEqual(failures, label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label}: expected ${expected}, got ${actual}`);
  }
}

let didNotifyResult = false;

function notifyResult(success) {
  didNotifyResult = true;
  process.stderr.write(success ? "\u0007\u0007" : "\u0007\u0007\u0007\u0007");
}

process.on("exit", (code) => {
  if (!didNotifyResult) notifyResult(code === 0);
});

function runBridgeTest(test) {
  const context = createEngineContext();
  loadEngine(context);

  const snapshot = runInEngine(
    context,
    `StockfishHarness.createPosition(${JSON.stringify(test.fen)}, 3)`
  );
  const afterSnapshot = runInEngine(
    context,
    `StockfishHarness.applyUciMove(${JSON.stringify(test.move)})`
  );
  return {
    ...test,
    actualStartFen: snapshot.fen,
    actualLegalMoves: snapshot.legalMoves,
    actualAfterFen: afterSnapshot.fen,
  };
}

function checkResult(result) {
  const failures = [];
  if (result.expectedStartFen !== undefined) {
    assertEqual(
      failures,
      "start FEN",
      result.actualStartFen,
      result.expectedStartFen
    );
  }
  if (result.expectedAfterFen !== undefined) {
    assertEqual(
      failures,
      "after FEN",
      result.actualAfterFen,
      result.expectedAfterFen
    );
  }
  if (result.expectedLegalMoves !== undefined) {
    assertEqual(
      failures,
      "legal moves",
      result.actualLegalMoves.join(","),
      result.expectedLegalMoves.join(",")
    );
  }
  if (result.expectedLegalMovesExclude !== undefined) {
    for (const move of result.expectedLegalMovesExclude) {
      if (result.actualLegalMoves.includes(move)) {
        failures.push(`legal moves: expected ${move} to be excluded`);
      }
    }
  }
  return failures;
}

function main() {
  let failed = 0;
  for (const test of TESTS) {
    const result = runBridgeTest(test);
    const failures = checkResult(result);
    if (failures.length > 0) {
      failed++;
      console.error(`FAIL ${result.name}`);
      console.error(`  FEN: ${result.fen}`);
      for (const failure of failures) {
        console.error(`  ${failure}`);
      }
    } else {
      console.log(`PASS ${result.name}: ${result.move}`);
    }
  }

  if (failed > 0) {
    notifyResult(false);
    console.error(`${failed} Stockfish Elo bridge regression test(s) failed.`);
    process.exit(1);
  }
  notifyResult(true);
  console.log(`${TESTS.length} Stockfish Elo bridge regression test(s) passed.`);
}

main();
