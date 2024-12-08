

function alphaBeta(bitboard, depth, alpha, beta, tt) {
  // Compute Zobrist hash for the current position
  const hash = bitboard.zobristHash;

  // Check the transposition table
  const storedEval = tt.use(hash, alpha, beta, depth);
  if (storedEval !== null) {
    return storedEval; // Use stored evaluation if bounds are valid
  }

  // If depth is zero, return static evaluation of the position
  if (depth === 0) {
    const eval = staticEvaluation(bitboard);
    tt.store(hash, depth, eval, "EXACT"); // Store exact evaluation
    return eval;
  }

  let bestEval = -Infinity;

  // Generate all legal moves
  const moves = generateLegalMoves(bitboard);

  for (const move of moves) {
    // Make the move
    const newPosition = makeMove(bitboard, move);

    // Recursively search the resulting position
    const eval = -alphaBeta(newPosition, depth - 1, -beta, -alpha, tt);

    // Undo the move
    undoMove(bitboard, move);

    // Update best evaluation
    bestEval = Math.max(bestEval, eval);

    // Update alpha
    alpha = Math.max(alpha, eval);

    // Prune if alpha exceeds beta
    if (alpha >= beta) {
      break;
    }
  }

  // Store the result in the transposition table
  if (bestEval <= alpha) {
    tt.store(hash, depth, bestEval, "UPPERBOUND");
  } else if (bestEval >= beta) {
    tt.store(hash, depth, bestEval, "LOWERBOUND");
  } else {
    tt.store(hash, depth, bestEval, "EXACT");
  }

  return bestEval;
}
