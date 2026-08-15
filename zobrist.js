// Check if the code is running in Node.js
if (typeof window === "undefined") {
  // Use dynamic import in Node.js
  import("./board-pieces.js")
    .then((pkg) => {
      Piece = pkg.Piece;
    })
    .catch((err) => {
      console.error("Failed to load the board module:", err);
    });
}

class Zobrist {
  constructor() {
    if (typeof ZOBRIST_KEYS === "undefined") {
      throw new Error("zobrist-keys.js must be loaded before zobrist.js");
    }
    this.zobristTable = ZOBRIST_KEYS.zobristTable;
    this.castlingKeys = ZOBRIST_KEYS.castlingKeys;
    this.enPassantKeys = ZOBRIST_KEYS.enPassantKeys;
    this.sideToMoveKeyForBlack = ZOBRIST_KEYS.sideToMoveKeyForBlack;
  }

  // Compute the initial Zobrist hash for a board position
  computeHash(board, sideToMove, castlingRights, enPassantFile) {
    let hash = 0n;

    // XOR pieces
    for (let square = 0; square < 64; square++) {
      const piece = board[square];
      if (piece > 0) {
        hash ^= this.zobristTable[piece][square];
      }
    }

    // XOR side to move
    if (sideToMove === Piece.BLACK) {
      hash ^= this.sideToMoveKeyForBlack;
    }

    // XOR castling rights
    hash = this.updateCastlingRights(hash, castlingRights);

    // XOR en passant file (if any)
    if (enPassantFile !== undefined) {
      hash ^= this.enPassantKeys[enPassantFile];
    }

    return hash;
  }

  // Update castling rights in the hash (adds or removes keys based on the Set)
  updateCastlingRights(hash, castlingRights) {
    for (const right of ["K", "Q", "k", "q"]) {
      if (castlingRights.has(right)) {
        hash ^= this.castlingKeys[right];
      }
    }
    return hash;
  }

  // Update en passant square in the hash
  updateEnPassant(hash, enPassantFile) {
    if (enPassantFile !== undefined) {
      hash ^= this.enPassantKeys[enPassantFile];
    }
    return hash;
  }

  // Incrementally update the hash for a move
  updateHash(
    hash,
    fromSquare,
    toSquare,
    piece,
    capturedPiece,
    sideToMove,
    castlingRights,
    enPassantFile
  ) {
    // Toggle side to move
    if (sideToMove === Piece.BLACK) {
      hash ^= this.sideToMoveKeyForBlack;
    }
    const zobristPieceTable = this.zobristTable[piece]
    // Remove the piece from the original square
    hash ^= zobristPieceTable[fromSquare];

    // Add the piece to the destination square
    hash ^= zobristPieceTable[toSquare];

    // Remove captured piece, if any
    if (capturedPiece !== undefined) {
      hash ^= this.zobristTable[capturedPiece][toSquare];
    }

    // Update castling rights
    hash = this.updateCastlingRights(hash, castlingRights);

    // Update en passant square
    hash = this.updateEnPassant(hash, enPassantFile);

    return hash;
  }

  // Undo a move in the hash
  undoHash(
    hash,
    fromSquare,
    toSquare,
    piece,
    capturedPiece,
    sideToMove,
    castlingRights,
    enPassantFile
  ) {
    // Revert en passant square
    hash = this.updateEnPassant(hash, enPassantFile);

    // Revert castling rights
    hash = this.updateCastlingRights(hash, castlingRights);

    // Toggle side to move back
    if (sideToMove === Piece.BLACK) {
      hash ^= this.sideToMoveKeyForBlack;
    }

    // Add the piece back to the original square
    hash ^= this.zobristTable[piece][fromSquare];

    // Remove the piece from the destination square
    hash ^= this.zobristTable[piece][toSquare];

    // Restore captured piece, if any
    if (capturedPiece !== undefined) {
      hash ^= this.zobristTable[capturedPiece][toSquare];
    }

    return hash;
  }
}

let ZobristInstance = undefined;

function ZobristHash() {
  if (!ZobristInstance) {
    ZobristInstance = new Zobrist();
  }
  return ZobristInstance;
}
