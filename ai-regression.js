const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { performance } = require("perf_hooks");

const ENGINE_FILES = [
  "board-pieces.js",
  "history.js",
  "zobrist-keys.js",
  "zobrist.js",
  "bit-board.js",
  "board-moves.js",
  "board-data.js",
  "transposition-table.js",
  "computerplayers.js",
];

const TESTS = [
  {
    name: "white capture keeps search state local",
    fen: "k7/4q3/8/8/8/8/8/4R2K w - - 0 1",
    depth: 3,
    expectedMove: "e1e7",
    initialGameColor: "black",
  },
  {
    name: "principal variation reports searched line",
    fen: "k7/4q3/8/8/8/8/8/4R2K w - - 0 1",
    depth: 3,
    directSearch: true,
    expectedMove: "e1e7",
    expectedPrincipalVariationFirst: "e1e7",
    expectedPrincipalVariationMinLength: 1,
    initialGameColor: "black",
  },
  {
    name: "stale castling move is rejected",
    fen: "r1bk3r/pppp1ppp/4p3/4P3/4NbqN/P2P2P1/1PQ3BP/R3K2R w - - 4 3",
    staleMoveFen:
      "r1bk3r/pppp1ppp/4p3/4P3/4NbqN/P2P2P1/1PQ3BP/R3K2R w KQkq - 4 3",
    staleMove: "e1g1",
    depth: 3,
    expectIllegalMove: true,
    expectedLegalMoves: 40,
    initialGameColor: "black",
  },
  {
    name: "forced reply while in check",
    fen: "4k3/8/8/8/8/8/4q3/3RK3 w - - 0 1",
    depth: 3,
    expectedMove: "e1e2",
    expectedLegalMoves: 1,
    initialGameColor: "black",
  },
  {
    name: "invalid castling rights do not produce illegal AI castle",
    fen: "1rbqkb1r/pppp1ppp/2n5/2PNpn2/1P1P4/P3PNP1/1Q2KPBP/R6R w KQk - 2 2",
    depth: 3,
    expectedMove: "b2c2",
    expectedLegalMoves: 46,
    expectedMadeMove: true,
    initialGameColor: "black",
  },
  {
    name: "invalid black castling rights do not produce zero-distance castle",
    fen: "Q1b3kr/5p1p/p2bq1p1/1pp5/8/4P3/PPP1P1PP/R3KB1R b KQk - 1 1",
    depth: 3,
    expectedMove: "d6e7",
    expectedLegalMoves: 32,
    expectedMadeMove: true,
    initialGameColor: "white",
  },
  {
    name: "invalid white castling rights from d1 do not produce castle",
    fen: "r1b1k2r/ppnp1ppp/3bp3/8/2R1P3/3P4/P2N2PP/3K3R w Kkq - 2 2",
    depth: 3,
    expectedMove: "d1e2",
    expectedLegalMoves: 28,
    expectedMadeMove: true,
    initialGameColor: "black",
  },
  {
    name: "invalid white castling rights from d2 are stripped for Stockfish",
    fen: "1rb4r/pppp1ppp/3k4/6P1/P3P3/2P3P1/2PK1P2/R4B1R w KQ - 3 2",
    depth: 3,
    expectedSerializedFen:
      "1rb4r/pppp1ppp/3k4/6P1/P3P3/2P3P1/2PK1P2/R4B1R w - - 3 2",
    expectedLegalMoves: 33,
    expectedAnyMove: true,
    expectedMadeMove: true,
    initialGameColor: "black",
  },
  {
    name: "ai move remains legal after search from rook check",
    fen: "r1b1RQ2/pp1p4/2k4p/2p5/5P2/8/r3K1P1/8 w - - 22 12",
    depth: 4,
    expectedMove: "e2f3",
    expectedLegalMoves: 6,
    expectedMadeMove: true,
    initialGameColor: "white",
  },
  {
    name: "black capture keeps search state local",
    fen: "4r2k/8/8/8/8/8/4Q3/K7 b - - 0 1",
    depth: 3,
    expectedMove: "e8e2",
    initialGameColor: "white",
  },
  {
    name: "white promotes to queen",
    fen: "8/P7/k7/8/8/8/8/4K3 w - - 0 1",
    depth: 3,
    expectedMove: "a7a8q",
    expectedLegalMoves: 9,
    initialGameColor: "black",
  },
  {
    name: "black promotes to queen",
    fen: "8/8/8/8/8/8/p7/4K2k b - - 0 1",
    depth: 3,
    expectedMove: "a2a1q",
    expectedLegalMoves: 7,
    initialGameColor: "white",
  },
  {
    name: "white forced king escape",
    fen: "7k/8/8/8/8/8/6q1/6K1 w - - 0 1",
    depth: 3,
    expectedMove: "g1g2",
    expectedLegalMoves: 1,
    initialGameColor: "black",
  },
  {
    name: "terminal no legal moves stays stable",
    fen: "7k/5Q2/7K/8/8/8/8/8 b - - 0 1",
    depth: 3,
    expectedMove: undefined,
    expectedLegalMoves: 0,
    initialGameColor: "white",
  },
  {
    name: "white rook captures through castling-right position",
    fen: "r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1",
    depth: 3,
    expectedMove: "a1a8",
    expectedLegalMoves: 26,
    initialGameColor: "black",
  },
  {
    name: "black rook captures through castling-right position",
    fen: "r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1",
    depth: 3,
    expectedMove: "a8a1",
    expectedLegalMoves: 26,
    initialGameColor: "white",
  },
  {
    name: "quiescence stand-pat cutoff preserves state",
    fen: "8/8/8/8/8/8/8/4K2k w - - 0 1",
    depth: 3,
    quiescenceOnly: true,
    alpha: -Infinity,
    beta: -999999,
    maximizingPlayer: true,
    expectedMove: undefined,
    expectedCount: 1,
    expectedCutOffs: 1,
    initialGameColor: "black",
  },
  {
    name: "immediate timeout preserves search state",
    fen: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
    depth: 7,
    timeoutOnly: true,
    timeLimitMilliseconds: 0,
    expectedMove: undefined,
    expectedLegalMoves: 20,
    expectedCount: 0,
    expectedCutOffs: 0,
    expectedCompletedDepth: 0,
    expectedTimedOut: true,
    initialGameColor: "black",
  },
];

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
    { filename: "ai-regression-globals.js" }
  );

  return context;
}

function loadBrowserScript(context, fileName) {
  const filePath = path.join(__dirname, fileName);
  const source = fs.readFileSync(filePath, "utf8");
  vm.runInContext(source, context, { filename: fileName });
}

function loadEngine(context) {
  for (const fileName of ENGINE_FILES) {
    loadBrowserScript(context, fileName);
  }
  vm.runInContext("prepareDirectionOffsets();", context, {
    filename: "ai-regression-setup.js",
  });
}

function colorExpression(colorName) {
  if (colorName === "white") return "Piece.WHITE";
  if (colorName === "black") return "Piece.BLACK";
  return "data.legalMoves.color";
}

function runSearchTest(test) {
  const context = createEngineContext();
  loadEngine(context);
  context.aiSearchTest = test;

  return vm.runInContext(
    `
      (() => {
        setCalculationDepth(aiSearchTest.depth);
        TranspositionTableSingleton = undefined;

        const data = new BoardData(new History(), aiSearchTest.fen);
        const turn = data.legalMoves.color;
        data.setLegalMovesForSearch(turn);

        game.color = ${colorExpression(test.initialGameColor)};
        const gameColorBefore = game.color;
        const fenBefore = data.calculatedFen();
        const hashBefore = data.newHash(turn).toString();
        const legalMovesBefore = data.legalMoves.moves.length;

        let result;
        if (aiSearchTest.expectIllegalMove) {
          const staleData = new BoardData(new History(), aiSearchTest.staleMoveFen);
          const staleTurn = staleData.legalMoves.color;
          staleData.setLegalMovesFor(staleTurn);
          const staleMove = staleData.legalMoves.moves.find(
            (move) => move.toCoordinateNotation() === aiSearchTest.staleMove
          );
          let illegalMoveRejected = false;
          try {
            data.makeMove(staleMove, true);
          } catch (error) {
            illegalMoveRejected = error.message.startsWith("Illegal move ");
          }
          result = {
            bestMove: undefined,
            illegalMoveRejected,
          };
        } else if (aiSearchTest.quiescenceOnly) {
          const evaluator = new Evaluator(
            TranspositionTableInstance(),
            data,
            turn
          );
          result = evaluator.searchAlphaBetaPruningCapturesOnly(
            aiSearchTest.alpha,
            aiSearchTest.beta,
            aiSearchTest.maximizingPlayer,
            0,
            turn
          );
        } else if (aiSearchTest.timeoutOnly) {
          const evaluator = new Evaluator(
            TranspositionTableInstance(),
            data,
            turn
          );
          result = evaluator.searchAlphaBetaPruningAll(
            aiSearchTest.depth,
            -Infinity,
            Infinity,
            true,
            aiSearchTest.timeLimitMilliseconds
          );
        } else if (aiSearchTest.directSearch) {
          const evaluator = new Evaluator(
            TranspositionTableInstance(),
            data,
            turn
          );
          result = evaluator.searchAlphaBetaPruningAll(
            aiSearchTest.depth,
            -Infinity,
            Infinity,
            true
          );
        } else {
          const player = evaluators.newPlayerOn("alpha-beta", data, turn);
          const move = player.chooseMove();
          result = { bestMove: move };
        }

        const fenAfter = data.calculatedFen();
        const hashAfter = data.newHash(turn).toString();
        let madeMove = undefined;
        let makeMoveError = undefined;
        if (aiSearchTest.expectedMadeMove) {
          try {
            data.makeMove(result.bestMove, true);
            madeMove = true;
            data.undoMove(result.bestMove);
            data.setLegalMovesFor(turn);
          } catch (error) {
            madeMove = false;
            makeMoveError = error.message;
          }
        }

        return {
          name: aiSearchTest.name,
          fen: aiSearchTest.fen,
          expectedMove: aiSearchTest.expectedMove,
          expectedAnyMove: aiSearchTest.expectedAnyMove,
          actualMove: result.bestMove && result.bestMove.toCoordinateNotation(),
          expectedLegalMoves: aiSearchTest.expectedLegalMoves,
          expectedCount: aiSearchTest.expectedCount,
          actualCount: result.count,
          expectedCutOffs: aiSearchTest.expectedCutOffs,
          actualCutOffs: result.cutOffs,
          expectedPrincipalVariationFirst:
            aiSearchTest.expectedPrincipalVariationFirst,
          actualPrincipalVariationFirst:
            result.principalVariation &&
            result.principalVariation[0] &&
            result.principalVariation[0].toCoordinateNotation(),
          expectedPrincipalVariationMinLength:
            aiSearchTest.expectedPrincipalVariationMinLength,
          actualPrincipalVariationLength: result.principalVariation
            ? result.principalVariation.length
            : undefined,
          expectedIllegalMoveRejected: aiSearchTest.expectIllegalMove
            ? true
            : undefined,
          actualIllegalMoveRejected: result.illegalMoveRejected,
          expectedCompletedDepth: aiSearchTest.expectedCompletedDepth,
          actualCompletedDepth: result.completedDepth,
          expectedTimedOut: aiSearchTest.expectedTimedOut,
          actualTimedOut: result.timedOut,
          expectedMadeMove: aiSearchTest.expectedMadeMove,
          actualMadeMove: madeMove,
          expectedSerializedFen: aiSearchTest.expectedSerializedFen,
          makeMoveError,
          legalMovesBefore,
          turn,
          legalMovesColorAfter: data.legalMoves.color,
          gameColorBefore,
          gameColorAfter: game.color,
          fenBefore,
          fenAfter,
          hashBefore,
          hashAfter,
        };
      })();
    `,
    context,
    { filename: "ai-regression-run.js" }
  );
}

function assertEqual(failures, label, actual, expected) {
  if (actual !== expected) {
    failures.push(`${label}: expected ${expected}, got ${actual}`);
  }
}

function checkResult(result) {
  const failures = [];
  if (result.expectedAnyMove) {
    if (!result.actualMove) {
      failures.push("best move: expected any legal move, got undefined");
    }
  } else {
    assertEqual(failures, "best move", result.actualMove, result.expectedMove);
  }
  if (result.expectedSerializedFen !== undefined) {
    assertEqual(
      failures,
      "serialized FEN",
      result.fenBefore,
      result.expectedSerializedFen
    );
  }
  assertEqual(failures, "final FEN", result.fenAfter, result.fenBefore);
  assertEqual(failures, "final hash", result.hashAfter, result.hashBefore);
  assertEqual(
    failures,
    "legal move color",
    result.legalMovesColorAfter,
    result.turn
  );
  assertEqual(
    failures,
    "global game color",
    result.gameColorAfter,
    result.gameColorBefore
  );
  if (result.expectedLegalMoves !== undefined) {
    assertEqual(
      failures,
      "legal move count",
      result.legalMovesBefore,
      result.expectedLegalMoves
    );
  }
  if (result.expectedCount !== undefined) {
    assertEqual(failures, "node count", result.actualCount, result.expectedCount);
  }
  if (result.expectedCutOffs !== undefined) {
    assertEqual(
      failures,
      "cutoff count",
      result.actualCutOffs,
      result.expectedCutOffs
    );
  }
  if (result.expectedPrincipalVariationFirst !== undefined) {
    assertEqual(
      failures,
      "principal variation first move",
      result.actualPrincipalVariationFirst,
      result.expectedPrincipalVariationFirst
    );
  }
  if (
    result.expectedPrincipalVariationMinLength !== undefined &&
    result.actualPrincipalVariationLength <
      result.expectedPrincipalVariationMinLength
  ) {
    failures.push(
      `principal variation length: expected at least ${result.expectedPrincipalVariationMinLength}, got ${result.actualPrincipalVariationLength}`
    );
  }
  if (result.expectedIllegalMoveRejected !== undefined) {
    assertEqual(
      failures,
      "illegal move rejected",
      result.actualIllegalMoveRejected,
      result.expectedIllegalMoveRejected
    );
  }
  if (result.expectedCompletedDepth !== undefined) {
    assertEqual(
      failures,
      "completed depth",
      result.actualCompletedDepth,
      result.expectedCompletedDepth
    );
  }
  if (result.expectedTimedOut !== undefined) {
    assertEqual(
      failures,
      "timed out",
      result.actualTimedOut,
      result.expectedTimedOut
    );
  }
  if (result.expectedMadeMove !== undefined) {
    assertEqual(
      failures,
      "AI move accepted by makeMove",
      result.actualMadeMove,
      result.expectedMadeMove
    );
    if (result.makeMoveError) {
      failures.push(`makeMove error: ${result.makeMoveError}`);
    }
  }
  return failures;
}

function main() {
  let failed = 0;
  for (const test of TESTS) {
    const result = runSearchTest(test);
    const failures = checkResult(result);
    if (failures.length > 0) {
      failed++;
      console.error(`FAIL ${result.name}`);
      console.error(`  FEN: ${result.fen}`);
      for (const failure of failures) {
        console.error(`  ${failure}`);
      }
    } else {
      console.log(
        `PASS ${result.name}: ${result.actualMove} at depth ${test.depth}`
      );
    }
  }

  if (failed > 0) {
    console.error(`${failed} AI regression test(s) failed.`);
    process.exit(1);
  }
  console.log(`${TESTS.length} AI regression test(s) passed.`);
}

main();
