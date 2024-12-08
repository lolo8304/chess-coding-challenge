// Check if the code is running in Node.js
if (typeof window === "undefined") {
  // Use dynamic import in Node.js
  import("./zobrist.js")
    .then((pkg) => {
      ZobristHash = pkg.ZobristHash;
    })
    .catch((err) => {
      console.error("Failed to load the board module:", err);
    });
}
class BitBoard {
  constructor(squares, enPassantFile, castlingRights, color) {
    this.squares = squares;
    this.enPassantFile = enPassantFile || undefined;
    this.castlingRights = castlingRights || new Set(["K", "Q", "k", "q"]);
    this.colorToMove = color;
    if (this.colorToMove === undefined) throw new Error("Color is not defined for bitboard")
    this.halfMoveCounter = 0;
    this.nextFullMoveCounter = 1;
    this.zobristHash = ZobristHash().computeHash(
      this.squares,
      this.colorToMove,
      this.castlingRights,
      this.enPassantFile
    );
    //console.log("Zobrist-Hash=" + this.zobristHash);
  }
}
