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
    this.squares = new Array(64).fill(0);
    this.piecesCache = {};
    this.selectedIndex = NOT_SELECTED;
    this.halfMoveCounter = 0;
    this.nextFullMoveCounter = 1;
    this.resetHalfMoveCounter();
    this.legalMoves = undefined;
    this.opponentLegalMoves = undefined;
    this.legalMovesForSelectedIndex = [];
    this.resetSquares(fen);
    this.result = undefined;
  }

  newHash(color) {
    const lastMove = this.history.lastMove();
    const enPassantFile =
      lastMove && lastMove.enPassantTarget
        ? this.indexToGrid(lastMove.enPassantTarget).gridX
        : undefined;
    return new BitBoard(
      this.squares,
      enPassantFile,
      this.castlingOptions,
      color
    ).zobristHash;
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
      let indexesPerPiece = this.piecesCache[oldPiece];
      if (indexesPerPiece === undefined) {
        this.piecesCache[oldPiece] = [];
      } else {
        this.piecesCache[oldPiece] = indexesPerPiece.filter(
          (item) => item !== index
        );
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

  // rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq e6 0 1
  resetSquares(fen) {
    if (!fen) {
      fen = FEN_start;
    }
    const fenParts = fen.split(" ");
    const fenboard = fenParts[0];
    const startColor = fenParts[1] === "w" ? Piece.WHITE : Piece.BLACK;
    const castlingOptionsString = fenParts[2] === "-" ? "" : fenParts[2];
    //const enPassantTarget = fenParts[3]  //TODO: not implemented yet
    this.halfMoveCounter = +fenParts[4];
    this.nextFullMoveCounter = +fenParts[5];
    const castlingOptions = {
      w: {
        long: castlingOptionsString.includes("Q"),
        short: castlingOptionsString.includes("K"),
      },
      b: {
        long: castlingOptionsString.includes("q"),
        short: castlingOptionsString.includes("k"),
      },
    };
    this.castlingOptions = new Set(
      castlingOptionsString.replaceAll(" ", "").replaceAll("-", "").split("")
    );
    if (!castlingOptions["w"].long) {
      this.history.storeMove(
        new Move(
          this,
          CastlingPositionsWhite[0],
          CastlingPositionsWhite[0],
          false
        )
      );
    }
    if (!castlingOptions["w"].short) {
      this.history.storeMove(
        new Move(
          this,
          CastlingPositionsWhite[1],
          CastlingPositionsWhite[1],
          false
        )
      );
    }
    if (!castlingOptions["b"].long) {
      this.history.storeMove(
        new Move(
          this,
          CastlingPositionsBlack[0],
          CastlingPositionsBlack[0],
          false
        )
      );
    }
    if (!castlingOptions["b"].short) {
      this.history.storeMove(
        new Move(
          this,
          CastlingPositionsBlack[1],
          CastlingPositionsBlack[1],
          false
        )
      );
    }

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
    this.legalMoves = new LegalMoves(startColor, this);
    this.opponentLegalMoves = new LegalMoves(
      startColor ^ Piece.COLOR_MASK,
      this
    );
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

    const lastMove = this.history.lastMove();
    let enPassantString =
      lastMove && lastMove.enPassantTarget
        ? this.indexToAlgebraic(lastMove.enPassantTarget)
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

    if (this.selectedIndex != NOT_SELECTED) {
      this.legalMovesForSelectedIndex = this.legalMoves.getMovesFrom(
        this.selectedIndex
      );
    } else {
      this.legalMovesForSelectedIndex = [];
    }
    if (this.legalMoves.moves.length === 0) {
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

  isLegalEnPassant(targetEnPassant) {
    const lastMove = this.history.lastMove();
    return (
      lastMove &&
      lastMove.isEnPassantAttackable() &&
      lastMove.to === targetEnPassant
    );
  }

  getKingPosition(color) {
    return this.anyOfPiece(Piece.KING | color);
  }

  resetHalfMoveCounter() {
    this.halfMoveCounter = 0;
    this.nextFullMoveCounter = Math.floor(this.halfMoveCounter / 2) + 1;
  }

  incHalfMoveCounter() {
    this.halfMoveCounter++;
    this.nextFullMoveCounter = Math.floor(this.halfMoveCounter / 2) + 1;
  }
  isFinished() {
    return this.result != undefined;
  }
  isNotFinished() {
    return this.result === undefined;
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
    lastMove.undoLastMove();
    this.check = false;
    this.checkMate = false;
    this.result = undefined;
  }

  makeMove(move, withHalfMoves) {
    this.history.storeMove(move);
    move.makeMove();
    this.selectCellIndex(NOT_SELECTED);
    if (withHalfMoves) {
      if (move.pieceOnly === Piece.PAWN || move.isHit) {
        this.resetHalfMoveCounter();
      } else {
        this.incHalfMoveCounter();
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
        move.isCheck ? 1 : 0,
        0,
        0,
        0
      );
    }
    const moves = [...this.data.legalMoves.moves];
    let numPositions = new MoveGeneratorStats();
    //depth > 0 && console.log("  ".repeat(depth) + depth + " Test for " + moves.length + " moves");
    for (const move of moves) {
      this.data.makeMove(move, false);
      const newColor = this.color ^ Piece.COLOR_MASK;
      this.data.setLegalMovesFor(newColor);
      game.color = newColor;
      redraw();

      const inc = this.testMoves(depth - 1, move);
      numPositions.add(inc);

      depth === this.maxDepth &&
        console.log(move.toCoordinateNotation() + ": " + inc);

      this.data.undoMove(move);
      this.data.setLegalMovesFor(this.color);
      game.color = this.color;
      redraw();
    }
    return numPositions;
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    BoardData,
    MoveGeneratorStats,
    MoveGeneratorTest,
  };
}
