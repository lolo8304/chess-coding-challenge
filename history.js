class History {
  constructor(historyInit) {
    this.movesHistory = historyInit || [];
  }
  lastMove() {
    return this.movesHistory.length > 0
      ? this.movesHistory[this.movesHistory.length - 1]
      : undefined;
  }
  storeMove(move) {
    this.movesHistory.push(move);
  }
  undoLastMove() {
    const lastMove = this.lastMove();
    return lastMove && lastMove.undoMove ? this.movesHistory.pop() : undefined;
  }
  hasMoved(piece) {
    return this.movesHistory.find((x) => x.piece === piece) != undefined;
  }
  hasMovedFromIndex(piece, index) {
    return (
      this.movesHistory.find((x) => x.piece === piece && x.from === index) !=
      undefined
    );
  }
}
