// Check if the code is running in Node.js
if (typeof window === "undefined") {
  // Use dynamic import in Node.js
  import("./bit-board.js")
    .then((pkg) => {
      BitBoard = pkg.BitBoard;
    })
    .catch((err) => {
      console.error("Failed to load the board module:", err);
    });
}
class BoardData {
  constructor(history, fen) {
    this.check = false;
    this.checkMate = false;
    this.debuggingIndexes = [];
    this.history = history;
    this.castlingOptions = new Set(["K", "Q", "k", "q"]);
    this.castlingRookStartIndexes = {
      [Piece.WHITE]: { long: 56, short: 63 },
      [Piece.BLACK]: { long: 0, short: 7 },
    };
    this.squares = new Array(64).fill(0);
    this.piecesCache = {};
    this.kingIndexes = {};
    this.selectedIndex = NOT_SELECTED;
    this.halfMoveCounter = 0;
    this.nextFullMoveCounter = 1;
    this.resetHalfMoveCounter();
    this.legalMoves = undefined;
    this.opponentLegalMoves = undefined;
    this.legalMovesForSelectedIndex = [];
    this.currentEnPassantTarget = undefined;
    this.hashCache = {};
    this.result = undefined;
    this.positionRepetitionLimit = 3;
    this.positionRepetitionCounts = new Map();
    this.resetSquares(fen);
    this.recordCurrentPositionForRepetition();
  }

  newHash(color) {
    const cachedHash = this.hashCache[color];
    if (cachedHash !== undefined) {
      return cachedHash;
    }
    const enPassantFile =
      this.currentEnPassantTarget !== undefined
        ? this.indexToGrid(this.currentEnPassantTarget).gridX
        : undefined;
    const hash = new BitBoard(
      this.squares,
      enPassantFile,
      this.currentCastlingRights(),
      color
    ).zobristHash;
    this.hashCache[color] = hash;
    return hash;
  }

  invalidateHash() {
    this.hashCache = {};
  }

  repetitionKey(hash) {
    return hash.toString();
  }

  repetitionCountForHash(hash) {
    return this.positionRepetitionCounts.get(this.repetitionKey(hash)) || 0;
  }

  recordCurrentPositionForRepetition() {
    const hash = this.newHash(this.legalMoves.color);
    this.addPositionToRepetition(hash);
    return hash;
  }

  addPositionToRepetition(hash) {
    const key = this.repetitionKey(hash);
    this.positionRepetitionCounts.set(
      key,
      (this.positionRepetitionCounts.get(key) || 0) + 1
    );
  }

  removePositionFromRepetition(hash) {
    if (hash === undefined) return;
    const key = this.repetitionKey(hash);
    const count = this.positionRepetitionCounts.get(key) || 0;
    if (count <= 1) {
      this.positionRepetitionCounts.delete(key);
    } else {
      this.positionRepetitionCounts.set(key, count - 1);
    }
  }

  previewHashAfterMove(move) {
    const previewMove = move.clone();
    const newColor = previewMove.color ^ Piece.COLOR_MASK;
    const selectedIndex = this.selectedIndex;
    const check = this.check;
    const checkMate = this.checkMate;
    const result = this.result;

    this.makeMove(previewMove, false);
    const hash = this.newHash(newColor);
    this.undoMove(previewMove);

    this.selectedIndex = selectedIndex;
    this.check = check;
    this.checkMate = checkMate;
    this.result = result;
    return hash;
  }

  isMoveInvalidByRepetition(move, limit = this.positionRepetitionLimit) {
    if (!limit || limit < 2) return false;
    const hash = this.previewHashAfterMove(move);
    return this.repetitionCountForHash(hash) + 1 >= limit;
  }

  removeMovesInvalidByRepetition() {
    const moves = this.legalMoves.moves;
    if (moves.length === 0) return;

    const validMoves = [];
    for (const move of moves) {
      if (this.isMoveInvalidByRepetition(move)) {
        move.repetitionInvalid = true;
      } else {
        validMoves.push(move);
      }
    }
    this.legalMoves.moves = validMoves;
    if (validMoves.length === 0) {
      this.result =
        "DRAW - repeated position " + this.positionRepetitionLimit + " times";
    }
  }

  enPassantFileForHash(enPassantTarget = this.currentEnPassantTarget) {
    return enPassantTarget !== undefined
      ? this.indexToGrid(enPassantTarget).gridX
      : undefined;
  }

  hashAfterMove(
    oldHash,
    undoPiecesAtIndex,
    oldColor,
    newColor,
    oldCastlingRights,
    newCastlingRights,
    oldEnPassantFile,
    newEnPassantFile
  ) {
    let hash = oldHash;
    const zobrist = ZobristHash();
    const oldPiecesByIndex = {};
    const changedIndexes = [];

    for (let i = 0; i < undoPiecesAtIndex.length; i++) {
      const undoPiece = undoPiecesAtIndex[i];
      if (!Object.prototype.hasOwnProperty.call(oldPiecesByIndex, undoPiece.index)) {
        oldPiecesByIndex[undoPiece.index] = undoPiece.piece;
        changedIndexes.push(undoPiece.index);
      }
    }

    for (let i = 0; i < changedIndexes.length; i++) {
      const index = changedIndexes[i];
      const oldPiece = oldPiecesByIndex[index];
      const newPiece = this.squares[index];
      if (oldPiece > Piece.None) {
        hash ^= zobrist.zobristTable[oldPiece][index];
      }
      if (newPiece > Piece.None) {
        hash ^= zobrist.zobristTable[newPiece][index];
      }
    }

    if (oldColor !== newColor) {
      hash ^= zobrist.sideToMoveKeyForBlack;
    }
    hash = this.xorCastlingRights(hash, oldCastlingRights);
    hash = this.xorCastlingRights(hash, newCastlingRights);
    hash = this.xorEnPassantFile(hash, oldEnPassantFile);
    hash = this.xorEnPassantFile(hash, newEnPassantFile);
    return hash;
  }

  xorCastlingRights(hash, castlingRights) {
    const zobrist = ZobristHash();
    if (castlingRights.has("K")) hash ^= zobrist.castlingKeys.K;
    if (castlingRights.has("Q")) hash ^= zobrist.castlingKeys.Q;
    if (castlingRights.has("k")) hash ^= zobrist.castlingKeys.k;
    if (castlingRights.has("q")) hash ^= zobrist.castlingKeys.q;
    return hash;
  }

  xorEnPassantFile(hash, enPassantFile) {
    if (enPassantFile !== undefined) {
      hash ^= ZobristHash().enPassantKeys[enPassantFile];
    }
    return hash;
  }

  currentCastlingRights() {
    const rights = new Set();
    this.addCastlingRightIfAvailable(rights, "K", Piece.WHITE, "short");
    this.addCastlingRightIfAvailable(rights, "Q", Piece.WHITE, "long");
    this.addCastlingRightIfAvailable(rights, "k", Piece.BLACK, "short");
    this.addCastlingRightIfAvailable(rights, "q", Piece.BLACK, "long");
    return rights;
  }

  addCastlingRightIfAvailable(rights, right, color, side) {
    const kingPiece = Piece.KING | color;
    if (this.history.hasMoved(kingPiece)) return;

    const rookStartIndex = this.castlingRookStartIndexes[color][side];
    if (rookStartIndex === undefined) return;
    const rookPiece = Piece.ROOK | color;
    if (this.getPiece(rookStartIndex) !== rookPiece) return;
    if (this.history.hasMovedFromIndex(rookPiece, rookStartIndex)) return;

    rights.add(right);
  }

  zobristHash() {
    return ZobristHash.computeHash(this.squares, this.color);
  }

  selectCellIndex(index) {
    this.selectedIndex = index;
  }

  checkPiece(piece) {
    if (piece && piece > 0 && piece < 8) {
      var e = new Error();
      console.log(e.stack);
      console.log("!!!!!!!!!!!!!!!!!!!! piece " + piece);
    }
  }
  getPiece(index) {
    return this.squares[index];
  }

  setPiece(index, piece) {
    /*verbose > 1 &&
      console.log(
        "SET " +
          index +
          " = " +
          piece +
          " (" +
          PieceNames[piece & Piece.COLOR_MASK] +
          " " +
          PieceNames[piece & Piece.PIECES_MASK] +
          " " +
          toFenChar(piece) +
          ")"
      );
      */
    return this.setPieceInternal(index, piece);
  }

  setPieceInternal(index, piece) {
    const oldPiece = this.getPiece(index);
    this.checkPiece(piece);
    this.squares[index] = piece;
    this.updatePiecesCache(index, oldPiece, piece);
    this.updateKingIndexes(index, oldPiece, piece);
    this.invalidateHash();
    return oldPiece;
  }

  getPiecesCacheByColor(color) {
    return Object.keys(this.piecesCache)
      .filter((key) => (parseInt(key) & color) > 0)
      .map((key) => {
        return { piece: parseInt(key), indexes: this.piecesCache[key] };
      });
  }

  getPiecesCache(piece) {
    return (piece > 0 ? this.piecesCache[`${piece}`] : undefined) || [];
  }

  updatePiecesCache(index, oldPiece, piece) {
    if (oldPiece > 0) {
      const indexesPerPiece = this.piecesCache[oldPiece];
      if (indexesPerPiece === undefined) {
        this.piecesCache[oldPiece] = [];
      } else {
        const itemIndex = indexesPerPiece.indexOf(index);
        if (itemIndex !== -1) {
          indexesPerPiece[itemIndex] =
            indexesPerPiece[indexesPerPiece.length - 1];
          indexesPerPiece.pop();
        }
      }
    }
    if (piece > 0) {
      let indexesPerPiece = this.piecesCache[piece];
      if (indexesPerPiece === undefined) {
        this.piecesCache[piece] = [index];
      } else {
        this.piecesCache[piece].push(index);
      }
    }
  }

  updateKingIndexes(index, oldPiece, piece) {
    if ((piece & Piece.PIECES_MASK) === Piece.KING) {
      this.kingIndexes[piece & Piece.COLOR_MASK] = index;
    }

    if (
      (oldPiece & Piece.PIECES_MASK) === Piece.KING &&
      this.kingIndexes[oldPiece & Piece.COLOR_MASK] === index
    ) {
      this.kingIndexes[oldPiece & Piece.COLOR_MASK] = undefined;
    }
  }

  // rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq e6 0 1
  resetSquares(fen) {
    if (!fen) {
      fen = FEN_start;
    }
    const fenParts = fen.split(" ");
    const fenboard = fenParts[0];
    const startColor = fenParts[1] === "w" ? Piece.WHITE : Piece.BLACK;
    const castlingOptionsString = fenParts[2] === "-" ? "" : fenParts[2];
    this.currentEnPassantTarget =
      fenParts[3] === "-" ? undefined : this.algebraicToIndex(fenParts[3]);
    this.halfMoveCounter = +fenParts[4];
    this.nextFullMoveCounter = +fenParts[5];
    this.castlingOptions = new Set(
      castlingOptionsString.replaceAll(" ", "").replaceAll("-", "").split("")
    );

    let yIndex = 0;
    let xIndex = 0;
    for (let i = 0; i < fenboard.length; i++) {
      const symbol = fenboard.charCodeAt(i);
      if (symbol === 47) {
        // char / == 47
        yIndex++;
        xIndex = 0;
      } else if (symbol <= 57) {
        // char 9 = 57
        xIndex += symbol - 48;
      } else {
        const pieceColor = symbol >= 97 ? Piece.BLACK : Piece.WHITE;
        const pieceType = FEN_Pieces[String.fromCharCode(symbol).toLowerCase()];
        this.setPiece(yIndex * ROW_CELLS + xIndex, pieceType | pieceColor);
        xIndex++;
      }
    }
    this.setCastlingRookStartIndexes(castlingOptionsString);
    this.legalMoves = new LegalMoves(startColor, this);
    this.opponentLegalMoves = new LegalMoves(
      startColor ^ Piece.COLOR_MASK,
      this
    );
  }

  setCastlingRookStartIndexes(castlingOptionsString) {
    this.castlingRookStartIndexes = {
      [Piece.WHITE]: { long: undefined, short: undefined },
      [Piece.BLACK]: { long: undefined, short: undefined },
    };

    for (const char of castlingOptionsString) {
      if (char === "K") {
        this.setStandardCastlingRookStartIndex(Piece.WHITE, "short", 63);
      } else if (char === "Q") {
        this.setStandardCastlingRookStartIndex(Piece.WHITE, "long", 56);
      } else if (char === "k") {
        this.setStandardCastlingRookStartIndex(Piece.BLACK, "short", 7);
      } else if (char === "q") {
        this.setStandardCastlingRookStartIndex(Piece.BLACK, "long", 0);
      } else if ("A" <= char && char <= "H") {
        this.setChess960CastlingRookStartIndex(Piece.WHITE, char);
      } else if ("a" <= char && char <= "h") {
        this.setChess960CastlingRookStartIndex(Piece.BLACK, char);
      }
    }
  }

  setStandardCastlingRookStartIndex(color, side, rookIndex) {
    const standardKingIndex = color === Piece.WHITE ? 60 : 4;
    if (this.getKingPosition(color) !== standardKingIndex) return;
    this.castlingRookStartIndexes[color][side] = rookIndex;
  }

  setChess960CastlingRookStartIndex(color, fileChar) {
    const file = fileChar.toLowerCase().charCodeAt(0) - 97;
    const rank = color === Piece.WHITE ? 7 : 0;
    const rookIndex = rank * 8 + file;
    const kingIndex = this.getKingPosition(color);

    if (rookIndex < kingIndex) {
      this.castlingRookStartIndexes[color].long = rookIndex;
    } else {
      this.castlingRookStartIndexes[color].short = rookIndex;
    }
  }

  calculatedFen() {
    let fen = "";
    let emptyCount = 0;

    for (let i = 0; i < 64; i++) {
      const piece = this.getPiece(i);
      const pieceOnly = piece & Piece.PIECES_MASK;
      const color = piece & Piece.COLOR_MASK;

      if (pieceOnly === 0) {
        emptyCount++;
      } else {
        if (emptyCount > 0) {
          fen += emptyCount;
          emptyCount = 0;
        }
        let fenChar = PieceShortNamesLower[pieceOnly];
        if (color === 8) {
          fenChar = fenChar.toUpperCase();
        }
        fen += fenChar;
      }

      if ((i + 1) % 8 === 0) {
        if (emptyCount > 0) {
          fen += emptyCount;
          emptyCount = 0;
        }
        if (i !== 63) {
          fen += "/";
        }
      }
    }

    const turn = this.legalMoves.color === 8 ? "w" : "b";
    const oppositeTurn = this.legalMoves.color === 8 ? "b" : "w";
    const castlingOptions = {};
    castlingOptions[turn] = this.legalMoves.getCastlingOptions(
      this.getKingPosition(this.legalMoves.color),
      this.legalMoves.color
    );
    castlingOptions[oppositeTurn] = this.opponentLegalMoves.getCastlingOptions(
      this.getKingPosition(this.opponentLegalMoves.color),
      this.opponentLegalMoves.color
    );

    let castlingString =
      (castlingOptions["w"].short ? "K" : "") +
      (castlingOptions["w"].long ? "Q" : "") +
      (castlingOptions["b"].short ? "k" : "") +
      (castlingOptions["b"].long ? "q" : "");
    if (castlingString === "") {
      castlingString = "-";
    }

    let enPassantString =
      this.currentEnPassantTarget !== undefined
        ? this.indexToAlgebraic(this.currentEnPassantTarget)
        : "-";

    // Example: , no en passant, and default half/full move counters.
    const finalFenString =
      fen +
      " " +
      turn +
      " " +
      castlingString +
      " " +
      enPassantString +
      " " +
      this.halfMoveCounter +
      " " +
      this.nextFullMoveCounter;
    return finalFenString;
  }

  setLegalMovesFor(color) {
    this.check = false;
    const opponentColor = color ^ Piece.COLOR_MASK;
    this.debuggingIndexes = [];
    const oldLegalMoves = this.legalMoves;
    const opponentLegalMoves = this.opponentLegalMoves;

    // swtich color: some calculations need to opposite but this is now the
    //this.opponentLegalMoves = this.legalMoves

    const newLegalMoves = this.newLegalMovesFor(color);
    if (oldLegalMoves.color != color || !newLegalMoves.eq(oldLegalMoves)) {
      this.legalMoves = newLegalMoves;
      this.opponentLegalMoves = this.newLegalMovesFor(opponentColor);
      if (verbose >= 2) {
        console.log("Moves " + PieceNames[color]);
        console.table(this.legalMoves.moves);
        console.log("Moves " + PieceNames[opponentColor]);
        console.table(this.opponentLegalMoves.moves);
      }
    }
    this.legalMoves.limitingMovementPinnedPieces();
    const movesToCheckForMe = this.getMovesAsIamUnderCheck();
    if (movesToCheckForMe.length > 0) {
      this.check = true;
      this.legalMoves.removePseudoIllegalMoves(movesToCheckForMe);
    }
    const movesToCheckFromMe = this.getMovesAsIamOfferingCheck();
    if (movesToCheckFromMe.length > 0) {
      this.check = true;
      this.legalMoves.removePseudoIllegalMoves(movesToCheckFromMe);
    }
    this.legalMoves.removePseudoIllegalMovesForMyKing(color);
    this.removeMovesInvalidByRepetition();

    if (this.selectedIndex != NOT_SELECTED) {
      this.legalMovesForSelectedIndex = this.legalMoves.getMovesFrom(
        this.selectedIndex
      );
    } else {
      this.legalMovesForSelectedIndex = [];
    }
    if (this.legalMoves.moves.length === 0 && this.result === undefined) {
      this.checkMate = true;
      if (this.check) {
        this.result =
          "CHECK MATE: " + PieceNames[this.opponentLegalMoves.color];
      } else {
        this.result = "STALEMATE: " + PieceNames[this.opponentLegalMoves.color];
      }
    }
    //for (const move of this.opponentLegalMoves.moves) {
    //  this.debuggingIndexes.push(move);
    //}
  }

  newLegalMovesFor(color) {
    const newLegalMove = new LegalMoves(color, this);
    newLegalMove.moves = newLegalMove.generateMoves(color);
    return newLegalMove;
  }

  setLegalMovesForPerft(color) {
    const legalMoves = this.newLegalMovesForPerft(color);
    this.legalMoves = legalMoves;
    return legalMoves;
  }

  setLegalMovesForSearch(color) {
    const legalMoves = this.newLegalMovesForPerft(color);
    this.legalMoves = legalMoves;
    this.check = this.isKingInCheck(color);
    this.checkMate = false;
    this.result = undefined;
    return legalMoves;
  }

  newLegalMovesForPerft(color) {
    const legalMoves = new LegalMoves(color, this);
    const pseudoMoves = legalMoves.generateMoves(color);
    const filteredMoves = [];
    for (const move of pseudoMoves) {
      if (!this.doesMoveExposeKing(move, color)) {
        filteredMoves.push(move);
      }
    }
    legalMoves.moves = filteredMoves;
    return legalMoves;
  }

  indexToGrid(index) {
    return {
      gridY: Math.floor(index / ROW_CELLS),
      gridX: index % ROW_CELLS,
    };
  }
  indexToAlgebraic(index) {
    const grid = this.indexToGrid(index);
    const file = "abcdefgh"[grid.gridX];
    const rank = 1 + Math.floor(7 - grid.gridY);
    return `${file}${rank}`;
  }
  algebraicToIndex(square) {
    const file = square.charCodeAt(0) - 97;
    const rank = Number(square[1]);
    return (8 - rank) * 8 + file;
  }

  getMovesAsIamUnderCheck() {
    return this.opponentLegalMoves.getMovesToMyKing();
  }
  getMovesAsIamOfferingCheck() {
    return this.legalMoves.getMovesToMyKing();
  }

  indexesOfPiece(piece) {
    if (piece === 0) return [];
    return this.getPiecesCache(piece);
  }
  anyOfPiece(piece) {
    if (piece === 0) return undefined;
    const currentIndexes = this.getPiecesCache(piece);
    return currentIndexes && currentIndexes.length > 0
      ? currentIndexes[0]
      : undefined;
  }

  debugIndexColor(index) {
    //return this.debugIndexColorAll(index)
    return this.debugIndexColorTarget(index);
  }

  debugIndexColorAll(index) {
    const found = this.debuggingIndexes.find(
      (x) => x.from === index || x.to === index || x?.enPassant === index
    );
    if (!found) return undefined;
    if (found.from === index) return "blue";
    if (found.to === index) return "cyan";
    if (found.enPassant === index) return "orange";
    return "black";
  }

  debugIndexColorTarget(index) {
    const found = this.debuggingIndexes.find((x) => x.to === index);
    if (!found) return undefined;
    if (found.to === index) return "red";
    return "black";
  }

  isLegalEnPassant(targetEnPassant, targetIndex) {
    return this.currentEnPassantTarget === targetIndex;
  }

  getKingPosition(color) {
    const kingIndex = this.kingIndexes[color];
    const kingPiece = Piece.KING | color;
    if (kingIndex !== undefined && this.squares[kingIndex] === kingPiece) {
      return kingIndex;
    }

    for (let index = 0; index < this.squares.length; index++) {
      if (this.squares[index] === kingPiece) {
        this.kingIndexes[color] = index;
        return index;
      }
    }
    this.kingIndexes[color] = undefined;
    return undefined;
  }

  isKingInCheck(color) {
    return this.isIndexAttackedByColor(
      this.getKingPosition(color),
      color ^ Piece.COLOR_MASK
    );
  }

  isKingMoveTargetAttacked(move, attackingColor) {
    const squares = this.squares;
    const previousKingIndex = this.kingIndexes[move.color];
    const oldFromPiece = squares[move.from];
    const oldToPiece = squares[move.to];
    let attacked;

    if (move.castlingKingTargetIndex) {
      const rookStartIndex = move.castlingRookStartIndex;
      const rookTargetIndex = move.castlingRookTargetIndex;
      const oldRookStartPiece = squares[rookStartIndex];
      const oldRookTargetPiece = squares[rookTargetIndex];
      const rookPiece = squares[rookStartIndex];

      try {
        squares[move.from] = Piece.None;
        if (rookStartIndex !== move.from) {
          squares[rookStartIndex] = Piece.None;
        }
        squares[move.to] = move.piece;
        squares[rookTargetIndex] = rookPiece;
        this.kingIndexes[move.color] = move.to;

        attacked = this.isIndexAttackedByColor(move.to, attackingColor);
      } finally {
        squares[move.from] = oldFromPiece;
        squares[move.to] = oldToPiece;
        squares[rookStartIndex] = oldRookStartPiece;
        squares[rookTargetIndex] = oldRookTargetPiece;
        this.kingIndexes[move.color] = previousKingIndex;
      }
    } else {
      try {
        squares[move.to] = move.piece;
        squares[move.from] = Piece.None;
        this.kingIndexes[move.color] = move.to;

        attacked = this.isIndexAttackedByColor(move.to, attackingColor);
      } finally {
        squares[move.from] = oldFromPiece;
        squares[move.to] = oldToPiece;
        this.kingIndexes[move.color] = previousKingIndex;
      }
    }
    return attacked;
  }

  doesMoveExposeKing(move, color) {
    const squares = this.squares;
    const previousKingIndex = this.kingIndexes[color];
    const oldFromPiece = squares[move.from];
    const oldToPiece = squares[move.to];
    const oldEnPassantPiece =
      move.enPassant !== undefined ? squares[move.enPassant] : undefined;
    let exposesKing = false;

    if (move.castlingKingTargetIndex) {
      const rookStartIndex = move.castlingRookStartIndex;
      const rookTargetIndex = move.castlingRookTargetIndex;
      const oldRookStartPiece = squares[rookStartIndex];
      const oldRookTargetPiece = squares[rookTargetIndex];
      const rookPiece = squares[rookStartIndex];

      try {
        squares[move.from] = Piece.None;
        if (rookStartIndex !== move.from) {
          squares[rookStartIndex] = Piece.None;
        }
        squares[move.to] = move.piece;
        squares[rookTargetIndex] = rookPiece;
        if (move.pieceOnly === Piece.KING) {
          this.kingIndexes[color] = move.to;
        }

        exposesKing = this.isIndexAttackedByColor(
          this.getKingPosition(color),
          color ^ Piece.COLOR_MASK
        );
      } finally {
        squares[move.from] = oldFromPiece;
        squares[move.to] = oldToPiece;
        squares[rookStartIndex] = oldRookStartPiece;
        squares[rookTargetIndex] = oldRookTargetPiece;
        this.kingIndexes[color] = previousKingIndex;
      }
      return exposesKing;
    }

    try {
      squares[move.to] =
        move.promotionPiece > Piece.None ? move.promotionPiece : move.piece;
      squares[move.from] = Piece.None;
      if (move.enPassant !== undefined) {
        squares[move.enPassant] = Piece.None;
      }
      if (move.pieceOnly === Piece.KING) {
        this.kingIndexes[color] = move.to;
      }

      exposesKing = this.isIndexAttackedByColor(
        this.getKingPosition(color),
        color ^ Piece.COLOR_MASK
      );
    } finally {
      squares[move.from] = oldFromPiece;
      squares[move.to] = oldToPiece;
      if (move.enPassant !== undefined) {
        squares[move.enPassant] = oldEnPassantPiece;
      }
      this.kingIndexes[color] = previousKingIndex;
    }

    return exposesKing;
  }

  isIndexAttackedByColor(targetIndex, attackingColor) {
    if (targetIndex === undefined) return false;
    const squares = this.squares;
    const pawnPiece = Piece.PAWN | attackingColor;
    const pawnAttackers = pawnAttackersByColor[attackingColor][targetIndex];
    for (let i = 0; i < pawnAttackers.length; i++) {
      if (squares[pawnAttackers[i]] === pawnPiece) {
        return true;
      }
    }

    const knightPiece = Piece.KNIGHT | attackingColor;
    const knightTargets = knightAttackTargets[targetIndex];
    for (let i = 0; i < knightTargets.length; i++) {
      if (squares[knightTargets[i]] === knightPiece) {
        return true;
      }
    }

    const kingPiece = Piece.KING | attackingColor;
    const kingTargets = kingAttackTargets[targetIndex];
    for (let i = 0; i < kingTargets.length; i++) {
      if (squares[kingTargets[i]] === kingPiece) {
        return true;
      }
    }

    const rookPiece = Piece.ROOK | attackingColor;
    const bishopPiece = Piece.BISHOP | attackingColor;
    const queenPiece = Piece.QUEEN | attackingColor;
    for (let directionIndex = 0; directionIndex < 4; directionIndex++) {
      const ray = rayTargets[targetIndex][directionIndex];
      for (let distance = 0; distance < ray.length; distance++) {
        const index = ray[distance];
        const piece = squares[index];
        if (piece === Piece.None) continue;
        if (piece === rookPiece || piece === queenPiece) return true;
        break;
      }
    }
    for (let directionIndex = 4; directionIndex < 8; directionIndex++) {
      const ray = rayTargets[targetIndex][directionIndex];
      for (let distance = 0; distance < ray.length; distance++) {
        const index = ray[distance];
        const piece = squares[index];
        if (piece === Piece.None) continue;
        if (piece === bishopPiece || piece === queenPiece) return true;
        break;
      }
    }

    return false;
  }

  resetHalfMoveCounter() {
    this.halfMoveCounter = 0;
    this.nextFullMoveCounter = Math.floor(this.halfMoveCounter / 2) + 1;
  }

  incHalfMoveCounter() {
    this.halfMoveCounter++;
    this.nextFullMoveCounter = Math.floor(this.halfMoveCounter / 2) + 1;
  }
  hasClockExpired() {
    if (
      typeof game === "undefined" ||
      !game ||
      typeof game.remainingMilliseconds !== "function"
    ) {
      return false;
    }
    return (
      game.remainingMilliseconds(Piece.BLACK) <= 0 ||
      game.remainingMilliseconds(Piece.WHITE) <= 0
    );
  }
  isFinished() {
    return this.result !== undefined || this.hasClockExpired();
  }
  isNotFinished() {
    return !this.isFinished();
  }

  undoMove(move) {
    const lastMove = this.history.undoLastMove();
    if (!lastMove) {
      throw Error(
        "Cannot undo move: " + move + " because these is no move to undo"
      );
    }
    if (!lastMove.eq(move)) {
      throw Error(
        "Cannot undo move: " +
          move +
          " because last move is not the same " +
          lastMove
      );
    }
    const undoMove = lastMove.undoMove;
    lastMove.undoLastMove();
    if (undoMove) {
      this.halfMoveCounter = undoMove.halfMoveCounter;
      this.nextFullMoveCounter = undoMove.nextFullMoveCounter;
      this.currentEnPassantTarget = undoMove.currentEnPassantTarget;
      this.removePositionFromRepetition(undoMove.repetitionHash);
    }
    this.hashCache = undoMove?.hashCache || {};
    this.check = false;
    this.checkMate = false;
    this.result = undefined;
  }

  legalMoveFor(move) {
    if (!this.legalMoves || this.legalMoves.color !== move.color) {
      this.setLegalMovesFor(move.color);
    }
    return this.legalMoves.moves.find((legalMove) => legalMove.eq(move));
  }

  assertLegalMove(move) {
    const legalMove = this.legalMoveFor(move);
    if (legalMove) return legalMove;
    const legalMoveList = this.legalMoves.moves
      .map((legalMove) => legalMove.toCoordinateNotation())
      .join(", ");
    throw new Error(
      "Illegal move " +
        move.toCoordinateNotation() +
        " for position " +
        this.calculatedFen() +
        ". Legal moves: " +
        legalMoveList
    );
  }

  makeMove(move, withHalfMoves) {
    if (withHalfMoves) {
      move = this.assertLegalMove(move);
    }
    const oldColor = move.color;
    const newColor = oldColor ^ Piece.COLOR_MASK;
    const oldHash = this.newHash(oldColor);
    const previousHashCache = { ...this.hashCache };
    const oldCastlingRights = this.currentCastlingRights();
    const oldEnPassantFile = this.enPassantFileForHash();

    this.history.storeMove(move);
    move.makeMove();
    move.undoMove.hashCache = previousHashCache;
    move.undoMove.halfMoveCounter = this.halfMoveCounter;
    move.undoMove.nextFullMoveCounter = this.nextFullMoveCounter;
    move.undoMove.currentEnPassantTarget = this.currentEnPassantTarget;
    this.currentEnPassantTarget = move.isEnPassantAttackable()
      ? move.enPassantTarget
      : undefined;
    const newHash = this.hashAfterMove(
      oldHash,
      move.undoMove.undoPiecesAtIndex,
      oldColor,
      newColor,
      oldCastlingRights,
      this.currentCastlingRights(),
      oldEnPassantFile,
      this.enPassantFileForHash()
    );
    this.hashCache = {};
    this.hashCache[newColor] = newHash;
    this.selectCellIndex(NOT_SELECTED);
    if (withHalfMoves) {
      move.undoMove.repetitionHash = newHash;
      const repetitionCount = this.repetitionCountForHash(newHash) + 1;
      this.addPositionToRepetition(newHash);
      if (move.pieceOnly === Piece.PAWN || move.isHit) {
        this.resetHalfMoveCounter();
      } else {
        this.incHalfMoveCounter();
      }
      if (repetitionCount >= this.positionRepetitionLimit) {
        this.result =
          "DRAW - repeated position " +
          this.positionRepetitionLimit +
          " times";
      }
      if (this.halfMoveCounter === 100) {
        const confirmed = window.confirm(
          "50 move rule - confirm to offer DRAW?"
        );
        if (confirmed) {
          this.result = "DRAW - agreed by 50-move rule ";
        }
      }
      if (this.halfMoveCounter === 150) {
        this.result = "DRAW - forced by 75-move rule";
      }
    }
  }

  testMoves(maxDepth) {
    const oldVerbose = verbose;
    verbose = 0;
    const numPositions = new MoveGeneratorTest(
      this,
      this.legalMoves.color,
      maxDepth
    ).testMoves(maxDepth);
    verbose = oldVerbose;
    return numPositions;
  }

  testMovesNodesOnly(maxDepth) {
    const oldVerbose = verbose;
    verbose = 0;
    const nodes = new MoveGeneratorNodesOnly(
      this,
      this.legalMoves.color,
      maxDepth
    ).testMoves(maxDepth);
    verbose = oldVerbose;
    return new MoveGeneratorStats(nodes);
  }

  opponentPawnCanAttackIndex(color, targetIndex) {
    const directionOffsetY = (color & Piece.WHITE) > 0 ? -1 : 1;
    const opponentPawnPieceIndexes = this.getPiecesCache(
      Piece.PAWN | (color ^ Piece.COLOR_MASK)
    );
    for (const index of opponentPawnPieceIndexes) {
      // check if index
      const grid = this.indexToGrid(index);
      grid.gridX--;
      grid.gridY += directionOffsetY;
      if (this.isValidGrid(grid)) {
        const gridIndex = grid.gridY * 8 + grid.gridX;
        if (gridIndex === targetIndex) return true;
      }
      grid.gridX += 2;
      if (this.isValidGrid(grid)) {
        const gridIndex = grid.gridY * 8 + grid.gridX;
        if (gridIndex === targetIndex) return true;
      }
    }
    return false;
  }
  isValidGrid(grid) {
    return (
      grid.gridX >= 0 && grid.gridX < 8 && grid.gridY >= 0 && grid.gridY < 8
    );
  }
}

class MoveGeneratorStats {
  constructor(
    nodes,
    captures,
    ep,
    castles,
    promotions,
    checks,
    discoveryChecks,
    doubleChecks,
    checkmates
  ) {
    this.nodes = nodes || 0;
    this.captures = captures || 0;
    this.ep = ep || 0;
    this.castles = castles || 0;
    this.promotions = promotions || 0;
    this.checks = checks || 0;
    this.discoveryChecks = discoveryChecks || 0;
    this.doubleChecks = doubleChecks || 0;
    this.checkmates = checkmates || 0;
  }
  add(stat) {
    this.nodes += stat.nodes;
    this.captures += stat.captures;
    this.ep += stat.ep;
    this.castles += stat.castles;
    this.promotions += stat.promotions;
    this.checks += stat.checks;
    this.discoveryChecks += stat.discoveryChecks;
    this.doubleChecks += stat.doubleChecks;
    this.checkmates += stat.checkmates;
  }
  toString() {
    return (
      "Nodes=" +
      this.nodes +
      ", hits=" +
      this.captures +
      ", ep=" +
      this.ep +
      ", castles=" +
      this.castles +
      ", prom=" +
      this.promotions +
      ", checks=" +
      this.checks
    );
  }
}

class MoveGeneratorTest {
  constructor(data, color, maxDepth) {
    this.data = data;
    this.color = color;
    this.maxDepth = maxDepth;
  }
  testMoves(depth, move) {
    if (depth === 0) {
      return new MoveGeneratorStats(
        1,
        move.isHit ? 1 : 0,
        move.enPassant ? 1 : 0,
        move.castlingKingTargetIndex ? 1 : 0,
        move.promotionPiece ? 1 : 0,
        this.data.isKingInCheck(this.data.legalMoves.color) ? 1 : 0,
        0,
        0,
        0
      );
    }
    const moves = [...this.data.legalMoves.moves];
    let numPositions = new MoveGeneratorStats();
    //depth > 0 && console.log("  ".repeat(depth) + depth + " Test for " + moves.length + " moves");
    for (const move of moves) {
      const rootMoveStartTime =
        depth === this.maxDepth ? performance.now() : undefined;
      this.data.makeMove(move, false);
      const newColor = move.color ^ Piece.COLOR_MASK;
      this.data.setLegalMovesFor(newColor);
      game.color = newColor;
      redraw();

      const inc = this.testMoves(depth - 1, move);
      numPositions.add(inc);

      if (depth === this.maxDepth) {
        const rootMoveElapsedMs =
          Math.round((performance.now() - rootMoveStartTime) * 10) / 10;
        const rootMoveNps = Math.round(
          (inc.nodes / Math.max(rootMoveElapsedMs, 0.001)) * 1000
        );
        console.log(
          move.toCoordinateNotation() +
            ": " +
            inc +
            ", time=" +
            rootMoveElapsedMs +
            " ms, nps=" +
            rootMoveNps
        );
      }

      this.data.undoMove(move);
      this.data.setLegalMovesFor(move.color);
      game.color = move.color;
      redraw();
    }
    return numPositions;
  }
}

class MoveGeneratorNodesOnly {
  constructor(data, color, maxDepth) {
    this.data = data;
    this.color = color;
    this.maxDepth = maxDepth;
  }

  testMoves(depth) {
    if (depth === 0) {
      return 1;
    }
    if (depth === 1) {
      return this.data.legalMoves.moves.length;
    }

    const moves = [...this.data.legalMoves.moves];
    let nodes = 0;
    for (const move of moves) {
      const rootMoveStartTime =
        depth === this.maxDepth ? performance.now() : undefined;
      this.data.makeMove(move, false);
      const newColor = move.color ^ Piece.COLOR_MASK;
      this.data.setLegalMovesForPerft(newColor);
      game.color = newColor;
      redraw();

      const inc = this.testMoves(depth - 1);
      nodes += inc;

      if (depth === this.maxDepth) {
        const rootMoveElapsedMs =
          Math.round((performance.now() - rootMoveStartTime) * 10) / 10;
        const rootMoveNps = Math.round(
          (inc / Math.max(rootMoveElapsedMs, 0.001)) * 1000
        );
        console.log(
          move.toCoordinateNotation() +
            ": Nodes=" +
            inc +
            ", time=" +
            rootMoveElapsedMs +
            " ms, nps=" +
            rootMoveNps
        );
      }

      this.data.undoMove(move);
      this.data.setLegalMovesForPerft(move.color);
      game.color = move.color;
      redraw();
    }
    return nodes;
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    BoardData,
    MoveGeneratorStats,
    MoveGeneratorTest,
    MoveGeneratorNodesOnly,
  };
}
