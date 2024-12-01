class UndoMove {
  constructor() {
    this.undoPiecesAtIndex = [];
  }
  addUndoPiece(index, piece) {
    this.undoPiecesAtIndex.push({ index, piece });
  }
}

class Move {
  constructor(
    board,
    from,
    to,
    isHit = false,
    enPassant = undefined,
    enPassantTarget = undefined,
    castlingKingTargetIndex = undefined,
    castlingRookStartIndex = undefined,
    castlingRookTargetIndex = undefined
  ) {
    this.board = board;
    this.calculateFromAndTo(from, to);
    this.isHit = isHit ? true : undefined;
    this.isCheck =
      isHit && (this.targetPiece & Piece.PIECES_MASK) === Piece.KING;
    this.enPassant = enPassant; // enPassant
    this.enPassantTarget = enPassantTarget;
    this.castlingKingTargetIndex = castlingKingTargetIndex; // castling king - king position
    this.castlingRookStartIndex = castlingRookStartIndex; // castling king - rook position start
    this.castlingRookTargetIndex = castlingRookTargetIndex; // castling king - rook position target
    this.undoMove = undefined;
    this.promotionPiece = Piece.None;
    this.moveScoreGuess = 0;
    this.randomScoreGuess = 0;
  }
  calculateFromAndTo(from, to) {
    this.from = from;
    this.to = to;
    this.color = this.board.getPiece(from) & Piece.COLOR_MASK;
    this.colorName = PieceNames[this.board.getPiece(from) & Piece.COLOR_MASK];
    this.pieceName = PieceNames[this.board.getPiece(from) & Piece.PIECES_MASK];
    this.piece = this.board.getPiece(from);
    this.pieceOnly = this.piece & Piece.PIECES_MASK;
    this.targetPiece = this.board.getPiece(to);
    this.targetPieceOnly = this.targetPiece & Piece.PIECES_MASK;
    this.targetColor = this.targetPiece & Piece.COLOR_MASK;
  }

  clone() {
    return new Move(
      this.board,
      this.from,
      this.to,
      this.isHit,
      this.enPassant,
      this.enPassantTarget,
      this.castlingKingTargetIndex,
      this.castlingRookStartIndex,
      this.castlingRookTargetIndex
    );
  }

  eq(other) {
    return (
      other?.from === this.from &&
      other?.to === this.to &&
      other?.promotionPiece === this.promotionPiece &&
      other?.isHit === this.isHit
    );
  }
  eqFromTo(other) {
    return (
      other?.from === this.from &&
      other?.to === this.to &&
      other?.promotionPiece === this.promotionPiece
    );
  }

  isEnPassantAttackable() {
    return (
      (this.piece & Piece.PIECES_MASK) === Piece.PAWN &&
      Math.abs(this.from - this.to) === 16 // 2 move
    );
  }

  getIndexes() {
    if (this.pieceOnly === Piece.KNIGHT) {
      return [this.from, this.to];
    }
    const gridFrom = this.board.indexToGrid(this.from);
    const gridTo = this.board.indexToGrid(this.to);
    const diff = {
      gridY: gridTo.gridY - gridFrom.gridY,
      gridX: gridTo.gridX - gridFrom.gridX,
    };
    const sign = {
      gridY: Math.sign(diff.gridY),
      gridX: Math.sign(diff.gridX),
    };
    const newGrid = {
      gridY: gridFrom.gridY,
      gridX: gridFrom.gridX,
    };
    const indexes = [];
    let counter = 0;
    while (newGrid.gridY != gridTo.gridY || newGrid.gridX != gridTo.gridX) {
      const index = newGrid.gridY * ROW_CELLS + newGrid.gridX;
      indexes.push(index);
      newGrid.gridY += sign.gridY;
      newGrid.gridX += sign.gridX;
      counter++;
      if (counter > 8) {
        throw Error("Looping ");
      }
    }
    const index = newGrid.gridY * ROW_CELLS + newGrid.gridX;
    indexes.push(index);
    return indexes;
  }

  toCoordinateNotation() {
    const sourceSquare = this.board.indexToAlgebraic(this.from);
    const targetSquare = this.board.indexToAlgebraic(this.to);
    if (this.promotionPiece > 0) {
      return sourceSquare + targetSquare + toPieceNotation(this.promotionPiece);
    } else {
      return sourceSquare + targetSquare;
    }
  }

  toAlgebraicNotation() {
    if (this.castlingRookTargetIndex && this.castlingRookStartIndex) {
      const isLong =
        Math.abs(this.castlingKingTargetIndex - this.castlingRookStartIndex) ===
        3;
      return isLong ? "O-O-O" : "O-O";
    }
    const sourcePieceNotation = toPieceNotation(this.piece);
    const targetPieceNotation = toPieceNotation(this.targetPiece);
    const sourceSquare = this.board.indexToAlgebraic(this.from);
    const targetSquare = this.board.indexToAlgebraic(this.to);
    const hitString = this.isHit ? "x" : "";
    const checkString = this.isCheck ? "+" : "";
    const enPassantString = this.enPassant ? "e.p." : "";
    const sourceString =
      sourcePieceNotation +
      hitString +
      sourceSquare +
      enPassantString +
      checkString;
    const targetString =
      targetPieceNotation +
      hitString +
      targetSquare +
      enPassantString +
      checkString;
    return targetSquare;
  }

  setPiece(index, piece) {
    const oldPiece = this.board.setPiece(index, piece);
    this.undoMove.addUndoPiece(index, oldPiece);
  }

  undoLastMove() {
    if (this.undoMove) {
      for (const indexAndPiece of this.undoMove.undoPiecesAtIndex) {
        this.board.setPieceInternal(indexAndPiece.index, indexAndPiece.piece);
      }
      this.undoMove = undefined;
    }
  }

  makeMove() {
    this.undoMove = new UndoMove();
    let toPiece = this.board.getPiece(this.from);
    if (this.promotionPiece > 0) {
      toPiece = this.promotionPiece;
    }
    this.setPiece(this.to, toPiece);
    this.setPiece(this.from, Piece.None);
    if (this.enPassant) {
      this.setPiece(this.enPassant, Piece.None);
    }
    if (this.castlingKingTargetIndex) {
      this.setPiece(
        this.castlingRookTargetIndex,
        this.board.getPiece(this.castlingRookStartIndex)
      );
      this.setPiece(this.castlingRookStartIndex, Piece.None);
    }
  }

  isPartOf(listOfMoves) {
    return listOfMoves.find((x) => x.eqFromTo(this)) !== undefined;
  }
}

class LegalMoves {
  constructor(color, boardData) {
    this.boardData = boardData;
    this.color = color;
    this.moves = [];
    this.checkAttackIndexes = [];
    this.checkAttackOnPinnedPieces = [];
  }

  eq(other) {
    if (this.moves.length != other?.moves.length) return false;
    for (let i = 0; i < this.moves.length; i++) {
      const move = this.moves[i];
      const otherMove = other.moves[i];
      if (!move.eq(otherMove)) return false;
    }
    return true;
  }

  getCheckMovesTo(index) {
    return this.moves.filter((x) => x.to === index && x.isCheck);
  }
  getMovesTo(index) {
    return this.moves.filter((x) => x.to === index);
  }

  getMovesTo(index) {
    return this.moves.filter((x) => x.to === index);
  }
  getMovesFrom(index) {
    return this.moves.filter((x) => x.from === index);
  }

  hasAnyMoveFromIndex(index) {
    return this.moves.find((x) => x.from === index) != undefined;
  }
  hasAnyMoveToIndex(index) {
    return this.moves.find((x) => x.to === index) != undefined;
  }
  addMoveTo(move, newMoves) {
    if (0 <= move.to && move.to < 64) {
      newMoves.push(move);
    }
  }
  addMove(move) {
    if (0 <= move.to && move.to < 64) {
      this.moves.push(move);
    }
  }

  addMove(move, newMoves) {
    if (0 <= move.to && move.to < 64) {
      if (newMoves) {
        newMoves.push(move);
      } else {
        this.moves.push(move);
      }
    }
  }

  hasMoveForMyKing() {
    return this.getMovesToMyKing().length > 0;
  }

  getMovesToMyKing() {
    const opponentColor = this.color ^ Piece.COLOR_MASK;
    const index = this.boardData.getKingPosition(opponentColor);
    return this.getMovesTo(index);
  }

  getMovesOfMyKing() {
    const index = this.boardData.getKingPosition(this.color);
    verbose === 2 &&
      console.log("Index of my KING (" + PieceNames[this.color] + ")=" + index);
    return this.getMovesFrom(index);
  }

  generateMoveForPieceFromIndex(newMoves, index, piece, color) {
    if (isSlidingPiece(piece)) {
      this.generateSlidingMoves(newMoves, index, piece, color);
    } else if (isKing(piece)) {
      this.generateKingMoves(newMoves, index, piece, color);
      this.generateCastlingKings(newMoves, index, piece, color);
    } else if (isKnight(piece)) {
      this.generateKnightMoves(newMoves, index, piece, color);
    } else if (isPawn(piece)) {
      const pawnMoves = [];
      this.generatePawnMoves(pawnMoves, index, piece, color);
      this.generatePawnPromotions(pawnMoves, color);
      newMoves.push(...pawnMoves);
    }
  }

  generateMoves(color) {
    color = color || this.color;
    const newMoves = [];
    const pieces = this.boardData.getPiecesCacheByColor(color); // [ {piece: <int>, indexes: [ int, int ]} ]
    for (const pieceAndIndexes of pieces) {
      for (const index of pieceAndIndexes.indexes) {
        const piece = pieceAndIndexes.piece;
        this.generateMoveForPieceFromIndex(newMoves, index, piece, color);
      }
    }
    return newMoves;
  }

  getCastlingOptions(kingPiece, color) {
    if (this.boardData.history.hasMoved(kingPiece))
      return { long: false, short: false };
    const rookPiece = Piece.ROOK | color;
    const rookPositions =
      color === Piece.WHITE ? CastlingPositionsWhite : CastlingPositionsBlack;

    const rookLongPiece = this.boardData.getPiece(rookPositions[0]);
    const rookLongStillThere =
      (rookLongPiece & Piece.PIECES_MASK) === Piece.ROOK &&
      (rookLongPiece & Piece.COLOR_MASK) === color;
    const rookLongMoved =
      !rookLongStillThere ||
      this.boardData.history.hasMovedFromIndex(rookPiece, rookPositions[0]);
    const rookShortPiece = this.boardData.getPiece(rookPositions[1]);
    const rookShortStillThere =
      (rookShortPiece & Piece.PIECES_MASK) === Piece.ROOK &&
      (rookShortPiece & Piece.COLOR_MASK) === color;
    const rookShortMoved =
      !rookShortStillThere ||
      this.boardData.history.hasMovedFromIndex(rookPiece, rookPositions[1]);
    return { long: !rookLongMoved, short: !rookShortMoved };
  }

  myLegalMoves(color) {
    if (this.boardData.legalMoves.color === color) {
      return this.boardData.legalMoves;
    } else {
      return this.boardData.opponentLegalMoves;
    }
  }

  myOpponentLegalMoves(color) {
    if (this.boardData.legalMoves.color === color) {
      return this.boardData.opponentLegalMoves;
    } else {
      return this.boardData.legalMoves;
    }
  }

  generateCastlingKings(newMoves, startIndex, piece, color) {
    if (this.boardData.history.hasMoved(piece)) return;
    const rookPositions =
      color === Piece.WHITE ? CastlingPositionsWhite : CastlingPositionsBlack;

    const castlingOptions = this.getCastlingOptions(piece, color);
    const longPossible = castlingOptions.long;
    const shortPossible = castlingOptions.short;

    if (longPossible) {
      const targetIndex = rookPositions[0] + 2;
      let isEmpty = true;
      for (let index = rookPositions[0] + 1; index < startIndex; index++) {
        const shouldBeEmptyPiece = this.boardData.getPiece(index);
        if (shouldBeEmptyPiece != 0) {
          isEmpty = false;
          break;
        }
        // is empty - check now if attack opponent attacks this index - only for index where king is moving
        if (targetIndex <= index && index < startIndex) {
          if (this.myOpponentLegalMoves(color).moves.length === 0) {
            verbose === 2 && console.log("Opponent moves = empty");
          }
          if (this.myOpponentLegalMoves(color).hasAnyMoveToIndex(index)) {
            verbose === 1 &&
              console.log("Castling not allowed due to attack on " + index);
            isEmpty = false;
            break;
          }
        }
      }
      if (
        isEmpty &&
        this.myOpponentLegalMoves(color).hasAnyMoveToIndex(startIndex)
      ) {
        isEmpty = false;
        verbose === 1 &&
          console.log(
            "Castling not allowed due because King " +
              startIndex +
              " is in check"
          );
      }
      if (isEmpty) {
        const newMove = new Move(
          this.boardData,
          startIndex,
          targetIndex,
          false,
          undefined,
          undefined,
          targetIndex,
          rookPositions[0],
          targetIndex + 1
        );
        this.addMoveTo(newMove, newMoves);
        if (startIndex === 4) {
          verbose === 1 &&
            console.log(
              "Castling allowed for King " +
                startIndex +
                " for target " +
                targetIndex
            );
          verbose === 1 && console.log(newMove);
        }
      }
    }

    if (shortPossible) {
      let isEmpty = true;
      const targetIndex = startIndex + 2;
      for (let index = startIndex + 1; index < rookPositions[1]; index++) {
        const shouldBeEmptyPiece = this.boardData.getPiece(index);
        if (shouldBeEmptyPiece != 0) {
          isEmpty = false;
          break;
        }
        // is empty - check now if attack opponent attacks this index - only for index where king is moving
        if (startIndex < index && index <= targetIndex) {
          if (this.myOpponentLegalMoves(color).hasAnyMoveToIndex(index)) {
            verbose === 2 &&
              console.log("Castling not allowed due to attack on " + index);
            isEmpty = false;
            break;
          }
        }
      }
      if (
        isEmpty &&
        this.myOpponentLegalMoves(color).hasAnyMoveToIndex(startIndex)
      ) {
        isEmpty = false;
        verbose === 2 &&
          console.log(
            "Castling not allowed due because King " +
              startIndex +
              " is in check"
          );
      }
      if (isEmpty) {
        const newMove = new Move(
          this.boardData,
          startIndex,
          targetIndex,
          false,
          undefined,
          undefined,
          targetIndex,
          rookPositions[1],
          targetIndex - 1
        );
        this.addMoveTo(newMove, newMoves);
      }
    }
  }

  generateKingMoves(newMoves, startIndex, piece, color) {
    const oppositeColor = color ^ Piece.COLOR_MASK;
    for (let i = 0; i < directionOffsets.length; i++) {
      const targetIndex = startIndex + directionOffsets[i];
      const grid = this.boardData.indexToGrid(startIndex);
      const targetGrid = this.boardData.indexToGrid(targetIndex);
      if (
        (grid.gridX === 0 && targetGrid.gridX == 7) ||
        (grid.gridX === 7 && targetGrid.gridX === 0) ||
        (grid.gridY === 0 && targetGrid.gridY === 7) ||
        (grid.gridY === 7 && targetGrid.gridY === 0)
      ) {
        // no moves allowed over edges
      } else {
        const pieceOnTargetIndex = this.boardData.getPiece(targetIndex);
        const pieceOnTargetIndexColor = pieceOnTargetIndex & Piece.COLOR_MASK;
        if (pieceOnTargetIndexColor === color) {
          // skip
        } else if (pieceOnTargetIndexColor === oppositeColor) {
          this.addMoveTo(
            new Move(this.boardData, startIndex, targetIndex, true),
            newMoves
          );
        } else {
          this.addMoveTo(
            new Move(this.boardData, startIndex, targetIndex, false),
            newMoves
          );
        }
      }
    }
  }
  generateKnightMoves(newMoves, startIndex, piece, color) {
    //
    const knightsDirectionOffsetsYX = [
      [-2, -1],
      [-2, 1],
      [2, -1],
      [2, 1],
      [-1, -2],
      [-1, 2],
      [1, -2],
      [1, 2],
    ];
    const oppositeColor = color ^ Piece.COLOR_MASK;
    const grid = this.boardData.indexToGrid(startIndex);
    for (let i = 0; i < knightsDirectionOffsetsYX.length; i++) {
      const knightsGridDiff = knightsDirectionOffsetsYX[i];
      const newY = grid.gridY + knightsGridDiff[0];
      const newX = grid.gridX + knightsGridDiff[1];
      if (0 <= newY && newY < 8 && 0 <= newX && newX < 8) {
        const targetIndex = newY * 8 + newX;
        const pieceOnTargetIndex = this.boardData.getPiece(targetIndex);
        const pieceOnTargetIndexColor = pieceOnTargetIndex & Piece.COLOR_MASK;
        if (pieceOnTargetIndexColor === color) {
          // skip
        } else if (pieceOnTargetIndexColor === oppositeColor) {
          this.addMoveTo(
            new Move(this.boardData, startIndex, targetIndex, true),
            newMoves
          );
        } else {
          this.addMoveTo(
            new Move(this.boardData, startIndex, targetIndex, false),
            newMoves
          );
        }
      }
    }
  }
  generatePawnPromotions(newPawnMoves, color) {
    const targetPawnIndexes =
      (color & Piece.WHITE) > 0
        ? { startIndex: 0, endIndex: 7 }
        : { startIndex: 56, endIndex: 63 };
    const movesToIterate = [...newPawnMoves];
    for (const move of movesToIterate) {
      if (
        targetPawnIndexes.startIndex <= move.to &&
        move.to <= targetPawnIndexes.endIndex
      ) {
        let newMove = move;
        newMove.promotionPiece = Piece.QUEEN | color;
        newMove = move.clone();
        newPawnMoves.push(newMove);
        newMove.promotionPiece = Piece.ROOK | color;
        newMove = move.clone();
        newPawnMoves.push(newMove);
        newMove.promotionPiece = Piece.KNIGHT | color;
        newMove = move.clone();
        newPawnMoves.push(newMove);
        newMove.promotionPiece = Piece.BISHOP || color;
      }
    }
  }

  generatePawnMoves(newMoves, startIndex, piece, color) {
    const startPawnIndex = (color & Piece.WHITE) > 0 ? 6 : 1;
    const directionOffsetY = (color & Piece.WHITE) > 0 ? -1 : 1;

    const pieceOnly = piece & Piece.PIECES_MASK;
    const pieceColor = piece & Piece.COLOR_MASK;
    const oppositeColor = color ^ Piece.COLOR_MASK;
    const grid = this.boardData.indexToGrid(startIndex);
    // move 2
    if (grid.gridY === startPawnIndex) {
      const newY = grid.gridY + 2 * directionOffsetY;
      const newY1 = grid.gridY + directionOffsetY;
      const newX = grid.gridX;
      if (0 <= newY && newY < 8 && 0 <= newX && newX < 8) {
        const targetIndex = newY * 8 + newX;
        const middleIndex = newY1 * 8 + newX;
        const enPassantTargetIndex = (newY - directionOffsetY) * 8 + newX;
        if (0 <= targetIndex && targetIndex < 64) {
          const pieceOnTargetIndex = this.boardData.getPiece(targetIndex);
          const pieceOnTargetIndexColor = pieceOnTargetIndex & Piece.COLOR_MASK;
          const pieceOnMiddleIndex = this.boardData.getPiece(middleIndex);
          if (pieceOnTargetIndexColor === 0 && pieceOnMiddleIndex === 0) {
            const newMove = new Move(
              this.boardData,
              startIndex,
              targetIndex,
              false,
              undefined,
              enPassantTargetIndex
            );
            this.addMoveTo(newMove, newMoves);
          }
        }
      }
    }
    // move normal: 1
    let newY = grid.gridY + directionOffsetY;
    let newX = grid.gridX;
    if (0 <= newY && newY < 8 && 0 <= newX && newX < 8) {
      const targetIndex = newY * 8 + newX;
      if (0 <= targetIndex && targetIndex < 64) {
        const pieceOnTargetIndex = this.boardData.getPiece(targetIndex);
        const pieceOnTargetIndexColor = pieceOnTargetIndex & Piece.COLOR_MASK;
        if (pieceOnTargetIndexColor === 0) {
          const newMove = new Move(
            this.boardData,
            startIndex,
            targetIndex,
            false
          );
          this.addMoveTo(newMove, newMoves);
        }
      }
    }

    // hit rule left
    const directionsX = [-1, 1];
    for (const dirX of directionsX) {
      newY = grid.gridY + directionOffsetY;
      newX = grid.gridX + dirX;
      if (0 <= newY && newY < 8 && 0 <= newX && newX < 8) {
        const targetIndex = newY * 8 + newX;
        const pieceOnTargetIndex = this.boardData.getPiece(targetIndex);
        const pieceOnTargetIndexColor = pieceOnTargetIndex & Piece.COLOR_MASK;
        if (pieceOnTargetIndexColor === oppositeColor) {
          const newMove = new Move(
            this.boardData,
            startIndex,
            targetIndex,
            true
          );
          this.addMoveTo(newMove, newMoves);
        } else if (pieceOnTargetIndexColor === 0) {
          // check for en-passang
          newY = grid.gridY;
          newX = grid.gridX + dirX;
          if (0 <= newY && newY < 8 && 0 <= newX && newX < 8) {
            const targetEnPIndex = newY * 8 + newX;
            const pieceEnPOnTargetIndex =
              this.boardData.getPiece(targetEnPIndex);
            const pieceEnPOnTargetIndexColor =
              pieceEnPOnTargetIndex & Piece.COLOR_MASK;
            if (pieceEnPOnTargetIndexColor === oppositeColor) {
              if (this.boardData.isLegalEnPassant(targetEnPIndex)) {
                const newMove = new Move(
                  this.boardData,
                  startIndex,
                  targetIndex,
                  true,
                  targetEnPIndex
                );
                this.addMoveTo(newMove, newMoves);
              }
            }
          }
        }
      }
    }
  }

  generateSlidingMoves(newMoves, startIndex, piece, color) {
    const pieceOnly = piece & Piece.PIECES_MASK;
    const pieceColor = piece & Piece.COLOR_MASK;
    const oppositeColor = color ^ Piece.COLOR_MASK;
    const startDirIndex = pieceOnly == Piece.BISHOP ? 4 : 0;
    const endDirIndex = pieceOnly === Piece.ROOK ? 4 : 8;
    for (
      let directionIndex = startDirIndex;
      directionIndex < endDirIndex;
      directionIndex++
    ) {
      const distanceToTarget = distanceToEdge[startIndex][directionIndex];
      if (distanceToTarget) {
        let n = 0;
        const inc = Math.sign(distanceToTarget);
        do {
          const targetIndex =
            startIndex + directionOffsets[directionIndex] * (Math.abs(n) + 1);
          if (0 <= targetIndex && targetIndex < 64) {
            const pieceOnTargetIndex = this.boardData.getPiece(targetIndex);
            const pieceOnTargetIndexColor =
              pieceOnTargetIndex & Piece.COLOR_MASK;
            if (pieceOnTargetIndexColor === color) {
              break;
            }
            if (pieceOnTargetIndexColor === oppositeColor) {
              this.addMoveTo(
                new Move(this.boardData, startIndex, targetIndex, true),
                newMoves
              );
              break;
            } else {
              this.addMoveTo(
                new Move(this.boardData, startIndex, targetIndex, false),
                newMoves
              );
            }
          } else {
            break;
          }
          n = n + inc;
        } while (inc === 1 ? n < distanceToTarget : n > distanceToTarget);
      }
    }
  }

  removePseudoIllegalMovesForMyKing(color) {
    const legalMovesForKing = this.getMovesFrom(
      this.boardData.getKingPosition(color)
    );
    for (const moveOfKing of legalMovesForKing) {
      moveOfKing.makeMove();
      const opponentColor = color ^ Piece.COLOR_MASK;
      const newMoves =
        this.myOpponentLegalMoves(color).generateMoves(opponentColor);
      moveOfKing.undoLastMove();
      if (
        newMoves.find(
          (x) =>
            x.to === moveOfKing.to &&
            x.isHit &&
            x.targetPieceOnly === Piece.KING
        )
      ) {
        this.moves = this.moves.filter((x) => !x.eqFromTo(moveOfKing));
      }
      // old algo: not covering new moves for check - check if any opponent move target at the legal move target
      /*
      let hasAnyCheck = this.myOpponentLegalMoves(color).hasAnyMoveToIndex(
        moveOfKing.to
      );
      if (hasAnyCheck) {
        this.moves = this.moves.filter((x) => !x.eqFromTo(moveOfKing));
      }
      */
    }
  }

  // checkout: http://127.0.0.1:5500/#r3k3/1p3p2/p2q2p1/bn3P2/1N2PQP1/PB6/3K1R1r/3R4%20w%20KQkq%20-%200%201

  limitingMovementPinnedPieces() {
    // current legal moves: check for all moves if opponent offers new attacks to king if piece would move away
    const movesOfNotKing = this.moves.filter((x) => x.pieceOnly != Piece.KING);
    this.checkAttackOnPinnedPieces = [];
    const movesToRemove = [];
    for (const move of movesOfNotKing) {
      move.makeMove();
      let newMoves = this.boardData.opponentLegalMoves.generateMoves();
      newMoves = newMoves.filter(
        (x) => x.isHit && x.targetPieceOnly === Piece.KING
      );
      move.undoLastMove();
      if (newMoves.length > 0) {
        this.checkAttackOnPinnedPieces.push(
          ...newMoves.flatMap((x) => x.getIndexes())
        );
        movesToRemove.push(move);
      }
    }
    if (movesToRemove) {
      this.moves = this.moves.filter((x) => !x.isPartOf(movesToRemove));
    }
  }

  removePseudoIllegalMoves(movesToCheck) {
    if (movesToCheck.length === 0) return;
    const color = movesToCheck[0].color;
    this.checkAttackIndexes = [];
    for (const move of movesToCheck) {
      this.checkAttackIndexes.push(...move.getIndexes());
    }
    let movesToKeep = [];
    for (const move of this.moves) {
      const canPreventCheck = this.checkAttackIndexes.includes(move.to);
      if (canPreventCheck && move.pieceOnly !== Piece.KING) {
        movesToKeep.push(move);
      }
    }
    const movesOfTheKing = this.getMovesOfMyKing();
    verbose >= 2 && console.table(movesToKeep);

    // check which are moves that are in attack by opponent
    // opponent.to == movesOfTheKing.to
    for (const moveOfKing of movesOfTheKing) {
      const kingIsInCheckAndCastlingMove =
        moveOfKing.castlingKingTargetIndex &&
        this.checkAttackIndexes.includes(moveOfKing.from);
      if (!kingIsInCheckAndCastlingMove) {
        const kingsTargetInAttackLineNotAllowed =
          this.checkAttackIndexes.includes(moveOfKing.to);
        if (!kingsTargetInAttackLineNotAllowed) {
          for (const opponentMove of this.myLegalMoves(color).moves) {
            if (moveOfKing.to !== opponentMove.from) {
              if (
                movesToKeep.find((x) => x.eqFromTo(moveOfKing)) === undefined
              ) {
                movesToKeep.push(moveOfKing);
              }
            }
          }
        } else if (moveOfKing.isHit) {
          // check 8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - -  move the king
          movesToKeep.push(moveOfKing);
        }
      } else {
        verbose === 2 &&
        console.log(
          "Castling not allowed due because King " +
            moveOfKing.from +
            " is in check (remove pseudo illegal move)"
        );
      }
    }
    // check if new opponent hits would check the king
    const movesToKeepWithoutCheck = [];
    for (const moveOfKing of movesToKeep) {
      if (moveOfKing.pieceOnly === Piece.KING) {
        this.boardData.setPieceInternal(moveOfKing.from, 0);
        const oldTargetPiece = this.boardData.setPieceInternal(
          moveOfKing.to,
          moveOfKing.piece
        );

        let newMoves = this.boardData.opponentLegalMoves.generateMoves();
        newMoves = newMoves.filter(
          (x) => x.isHit && x.targetPieceOnly === Piece.KING
        );
        if (newMoves.length == 0) {
          movesToKeepWithoutCheck.push(moveOfKing);
        } else {
          verbose === 2 && console.log("Remove move for king to go into check");
        }

        this.boardData.setPieceInternal(moveOfKing.from, moveOfKing.piece);
        this.boardData.setPieceInternal(moveOfKing.to, oldTargetPiece);
      } else {
        movesToKeepWithoutCheck.push(moveOfKing);
      }
    }
    verbose >= 2 && console.table(movesToKeepWithoutCheck);
    this.moves = movesToKeepWithoutCheck;
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    Move,
    MoveGeneratorStats,
    MoveGeneratorTest,
  };
}
