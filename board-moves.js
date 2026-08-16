class UndoMove {
  constructor() {
    this.undoPiecesAtIndex = [];
    this.halfMoveCounter = undefined;
    this.nextFullMoveCounter = undefined;
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
    this.piece = this.board.getPiece(from);
    this.pieceOnly = this.piece & Piece.PIECES_MASK;
    this.color = this.piece & Piece.COLOR_MASK;
    this.colorName = PieceNames[this.color];
    this.pieceName = PieceNames[this.pieceOnly];

    this.targetPiece = this.board.getPiece(to);
    this.targetPieceOnly = this.targetPiece & Piece.PIECES_MASK;
    this.targetColor = this.targetPiece & Piece.COLOR_MASK;
    this.targetColorName = PieceNames[this.targetColor];
    this.targetPieceName = PieceNames[this.targetPieceOnly];
  }

  clone() {
    const move = new Move(
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
    move.promotionPiece = this.promotionPiece;
    return move;
  }

  eq(other) {
    return (
      other?.from === this.from &&
      other?.to === this.to &&
      other?.promotionPiece === this.promotionPiece &&
      other?.isHit === this.isHit &&
      other?.enPassant === this.enPassant &&
      other?.enPassantTarget === this.enPassantTarget &&
      other?.castlingKingTargetIndex === this.castlingKingTargetIndex &&
      other?.castlingRookStartIndex === this.castlingRookStartIndex &&
      other?.castlingRookTargetIndex === this.castlingRookTargetIndex
    );
  }
  eqFromTo(other) {
    return (
      other?.from === this.from &&
      other?.to === this.to &&
      other?.promotionPiece === this.promotionPiece &&
      other?.enPassant === this.enPassant &&
      other?.castlingKingTargetIndex === this.castlingKingTargetIndex &&
      other?.castlingRookStartIndex === this.castlingRookStartIndex &&
      other?.castlingRookTargetIndex === this.castlingRookTargetIndex
    );
  }

  isEnPassantAttackable() {
    return (
      (this.piece & Piece.PIECES_MASK) === Piece.PAWN &&
      Math.abs(this.from - this.to) === 16 // 2 move
    );
  }

  getIndexes() {
    if (!isSlidingPiece(this.pieceOnly)) {
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

  addIndexesToLookup(lookup, indexes) {
    if (!isSlidingPiece(this.pieceOnly)) {
      lookup[this.from] = true;
      indexes.push(this.from);
      lookup[this.to] = true;
      indexes.push(this.to);
      return;
    }

    const fromY = Math.floor(this.from / ROW_CELLS);
    const fromX = this.from % ROW_CELLS;
    const toY = Math.floor(this.to / ROW_CELLS);
    const toX = this.to % ROW_CELLS;
    const stepY = Math.sign(toY - fromY);
    const stepX = Math.sign(toX - fromX);
    let currentY = fromY;
    let currentX = fromX;
    let counter = 0;

    while (currentY !== toY || currentX !== toX) {
      const index = currentY * ROW_CELLS + currentX;
      lookup[index] = true;
      indexes.push(index);
      currentY += stepY;
      currentX += stepX;
      counter++;
      if (counter > 8) {
        throw Error("Looping ");
      }
    }
    const index = currentY * ROW_CELLS + currentX;
    lookup[index] = true;
    indexes.push(index);
  }

  toCoordinateNotation() {
    const sourceSquare = this.board.indexToAlgebraic(this.from);
    const targetIndex =
      this.castlingKingTargetIndex !== undefined &&
      this.from === this.to &&
      this.castlingRookStartIndex !== undefined
        ? this.castlingRookStartIndex
        : this.to;
    const targetSquare = this.board.indexToAlgebraic(targetIndex);
    if (this.promotionPiece > 0) {
      const promotionPiece = this.promotionPiece & Piece.PIECES_MASK;
      return sourceSquare + targetSquare + PieceShortNamesLower[promotionPiece];
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
      for (const indexAndPiece of this.undoMove.undoPiecesAtIndex
        .slice()
        .reverse()) {
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
    if (this.castlingKingTargetIndex) {
      const rookPiece = this.board.getPiece(this.castlingRookStartIndex);
      this.setPiece(this.from, Piece.None);
      if (this.castlingRookStartIndex !== this.from) {
        this.setPiece(this.castlingRookStartIndex, Piece.None);
      }
      this.setPiece(this.to, toPiece);
      this.setPiece(this.castlingRookTargetIndex, rookPiece);
      return;
    }
    this.setPiece(this.to, toPiece);
    this.setPiece(this.from, Piece.None);
    if (this.enPassant) {
      this.setPiece(this.enPassant, Piece.None);
    }
  }

  isPartOf(listOfMoves) {
    for (let i = 0; i < listOfMoves.length; i++) {
      if (listOfMoves[i].eqFromTo(this)) return true;
    }
    return false;
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
      this.generatePawnMoves(newMoves, index, piece, color);
    }
  }

  generateMoves(color) {
    color = color || this.color;
    const newMoves = [];
    for (let pieceOnly = Piece.KING; pieceOnly <= Piece.QUEEN; pieceOnly++) {
      const piece = pieceOnly | color;
      const indexes = this.boardData.getPiecesCache(piece);
      for (const index of indexes) {
        this.generateMoveForPieceFromIndex(newMoves, index, piece, color);
      }
    }
    return newMoves;
  }

  getCastlingOptions(kingPiece, color) {
    if (this.boardData.history.hasMoved(kingPiece))
      return { long: false, short: false };
    const rookPiece = Piece.ROOK | color;
    const rookPositions = this.boardData.castlingRookStartIndexes[color];

    const rookLongPiece =
      rookPositions.long === undefined
        ? Piece.None
        : this.boardData.getPiece(rookPositions.long);
    const rookLongStillThere =
      (rookLongPiece & Piece.PIECES_MASK) === Piece.ROOK &&
      (rookLongPiece & Piece.COLOR_MASK) === color;
    const rookLongMoved =
      !rookLongStillThere ||
      this.boardData.history.hasMovedFromIndex(rookPiece, rookPositions.long);
    const rookShortPiece =
      rookPositions.short === undefined
        ? Piece.None
        : this.boardData.getPiece(rookPositions.short);
    const rookShortStillThere =
      (rookShortPiece & Piece.PIECES_MASK) === Piece.ROOK &&
      (rookShortPiece & Piece.COLOR_MASK) === color;
    const rookShortMoved =
      !rookShortStillThere ||
      this.boardData.history.hasMovedFromIndex(rookPiece, rookPositions.short);
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
    const homeRank = color === Piece.WHITE ? 7 : 0;
    if (Math.floor(startIndex / ROW_CELLS) !== homeRank) return;
    const opponentColor = color ^ Piece.COLOR_MASK;

    const castlingOptions = this.getCastlingOptions(piece, color);
    this.addCastlingMove(newMoves, {
      possible: castlingOptions.long,
      startIndex,
      targetIndex: color === Piece.WHITE ? 58 : 2,
      rookStartIndex: this.boardData.castlingRookStartIndexes[color].long,
      rookTargetIndex: color === Piece.WHITE ? 59 : 3,
      color,
      opponentColor,
    });
    this.addCastlingMove(newMoves, {
      possible: castlingOptions.short,
      startIndex,
      targetIndex: color === Piece.WHITE ? 62 : 6,
      rookStartIndex: this.boardData.castlingRookStartIndexes[color].short,
      rookTargetIndex: color === Piece.WHITE ? 61 : 5,
      color,
      opponentColor,
    });
  }

  addCastlingMove(
    newMoves,
    {
      possible,
      startIndex,
      targetIndex,
      rookStartIndex,
      rookTargetIndex,
      color,
      opponentColor,
    }
  ) {
    if (!possible) return;
    if (rookStartIndex === undefined) return;

    const kingPiece = Piece.KING | color;
    const rookPiece = Piece.ROOK | color;
    if (this.boardData.getPiece(startIndex) !== kingPiece) return;
    if (this.boardData.getPiece(rookStartIndex) !== rookPiece) return;

    const homeRank = color === Piece.WHITE ? 7 : 0;
    if (
      Math.floor(startIndex / ROW_CELLS) !== homeRank ||
      Math.floor(rookStartIndex / ROW_CELLS) !== homeRank ||
      Math.floor(targetIndex / ROW_CELLS) !== homeRank ||
      Math.floor(rookTargetIndex / ROW_CELLS) !== homeRank
    ) {
      return;
    }

    const minKingRook = Math.min(startIndex, rookStartIndex);
    const maxKingRook = Math.max(startIndex, rookStartIndex);
    for (let index = minKingRook + 1; index < maxKingRook; index++) {
      if (this.boardData.getPiece(index) !== Piece.None) return;
    }

    const minFinal = Math.min(targetIndex, rookTargetIndex);
    const maxFinal = Math.max(targetIndex, rookTargetIndex);
    for (let index = minFinal; index <= maxFinal; index++) {
      if (
        index !== startIndex &&
        index !== rookStartIndex &&
        this.boardData.getPiece(index) !== Piece.None
      ) {
        return;
      }
    }

    const minKingPath = Math.min(startIndex, targetIndex);
    const maxKingPath = Math.max(startIndex, targetIndex);
    for (let index = minKingPath; index <= maxKingPath; index++) {
      if (
        index !== startIndex &&
        index !== rookStartIndex &&
        this.boardData.getPiece(index) !== Piece.None
      ) {
        return;
      }
    }

    if (startIndex === targetIndex) {
      if (this.boardData.isIndexAttackedByColor(startIndex, opponentColor)) {
        return;
      }
    } else {
      const kingStep = Math.sign(targetIndex - startIndex);
      for (
        let index = startIndex;
        index !== targetIndex + kingStep;
        index += kingStep
      ) {
        if (this.boardData.isIndexAttackedByColor(index, opponentColor)) return;
      }
    }

    this.addMoveTo(
      new Move(
        this.boardData,
        startIndex,
        targetIndex,
        false,
        undefined,
        undefined,
        targetIndex,
        rookStartIndex,
        rookTargetIndex
      ),
      newMoves
    );
  }

  generateKingMoves(newMoves, startIndex, piece, color) {
    const oppositeColor = color ^ Piece.COLOR_MASK;
    const targets = kingAttackTargets[startIndex];
    for (let i = 0; i < targets.length; i++) {
      const targetIndex = targets[i];
      const pieceOnTargetIndex = this.boardData.getPiece(targetIndex);
      const pieceOnTargetIndexColor = pieceOnTargetIndex & Piece.COLOR_MASK;
      if (pieceOnTargetIndexColor === color) {
        continue;
      }
      this.addMoveTo(
        new Move(
          this.boardData,
          startIndex,
          targetIndex,
          pieceOnTargetIndexColor === oppositeColor
        ),
        newMoves
      );
    }
  }

  generateKnightMoves(newMoves, startIndex, piece, color) {
    const oppositeColor = color ^ Piece.COLOR_MASK;
    const targets = knightAttackTargets[startIndex];
    for (let i = 0; i < targets.length; i++) {
      const targetIndex = targets[i];
      const pieceOnTargetIndex = this.boardData.getPiece(targetIndex);
      const pieceOnTargetIndexColor = pieceOnTargetIndex & Piece.COLOR_MASK;
      if (pieceOnTargetIndexColor === color) {
        continue;
      }
      this.addMoveTo(
        new Move(
          this.boardData,
          startIndex,
          targetIndex,
          pieceOnTargetIndexColor === oppositeColor
        ),
        newMoves
      );
    }
  }

  addPawnMove(
    newMoves,
    startIndex,
    targetIndex,
    isHit,
    color,
    enPassant,
    enPassantTarget
  ) {
    const promotionRank = color === Piece.WHITE ? 0 : 7;
    const targetRank = Math.floor(targetIndex / ROW_CELLS);
    if (targetRank !== promotionRank) {
      this.addMoveTo(
        new Move(
          this.boardData,
          startIndex,
          targetIndex,
          isHit,
          enPassant,
          enPassantTarget
        ),
        newMoves
      );
      return;
    }

    for (let i = 0; i < PromotionPieceTypes.length; i++) {
      const move = new Move(
        this.boardData,
        startIndex,
        targetIndex,
        isHit,
        enPassant,
        enPassantTarget
      );
      move.promotionPiece = PromotionPieceTypes[i] | color;
      this.addMoveTo(move, newMoves);
    }
  }

  generatePawnMoves(newMoves, startIndex, piece, color) {
    const startPawnRank = color === Piece.WHITE ? 6 : 1;
    const directionOffsetY = color === Piece.WHITE ? -1 : 1;
    const oppositeColor = color ^ Piece.COLOR_MASK;
    const startRank = Math.floor(startIndex / ROW_CELLS);
    const startFile = startIndex % ROW_CELLS;

    const oneStepIndex = startIndex + directionOffsetY * ROW_CELLS;
    if (0 <= oneStepIndex && oneStepIndex < 64) {
      const pieceOnTargetIndex = this.boardData.getPiece(oneStepIndex);
      if (pieceOnTargetIndex === Piece.None) {
        this.addPawnMove(newMoves, startIndex, oneStepIndex, false, color);

        if (startRank === startPawnRank) {
          const twoStepIndex = startIndex + directionOffsetY * ROW_CELLS * 2;
          if (
            0 <= twoStepIndex &&
            twoStepIndex < 64 &&
            this.boardData.getPiece(twoStepIndex) === Piece.None
          ) {
            this.addPawnMove(
              newMoves,
              startIndex,
              twoStepIndex,
              false,
              color,
              undefined,
              oneStepIndex
            );
          }
        }
      }
    }

    const captureOffset = directionOffsetY * ROW_CELLS;
    for (let fileDirection = -1; fileDirection <= 1; fileDirection += 2) {
      const targetFile = startFile + fileDirection;
      if (targetFile < 0 || targetFile >= ROW_CELLS) continue;

      const targetIndex = startIndex + captureOffset + fileDirection;
      if (targetIndex < 0 || targetIndex >= 64) continue;

      const pieceOnTargetIndex = this.boardData.getPiece(targetIndex);
      const pieceOnTargetIndexColor = pieceOnTargetIndex & Piece.COLOR_MASK;
      if (pieceOnTargetIndexColor === oppositeColor) {
        this.addPawnMove(newMoves, startIndex, targetIndex, true, color);
      } else if (pieceOnTargetIndex === Piece.None) {
        const targetEnPIndex = startIndex + fileDirection;
        const pieceEnPOnTargetIndex = this.boardData.getPiece(targetEnPIndex);
        const pieceEnPOnTargetIndexColor =
          pieceEnPOnTargetIndex & Piece.COLOR_MASK;
        if (
          pieceEnPOnTargetIndexColor === oppositeColor &&
          this.boardData.isLegalEnPassant(targetEnPIndex, targetIndex)
        ) {
          this.addPawnMove(
            newMoves,
            startIndex,
            targetIndex,
            true,
            color,
            targetEnPIndex
          );
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
      const ray = rayTargets[startIndex][directionIndex];
      for (let rayIndex = 0; rayIndex < ray.length; rayIndex++) {
        const targetIndex = ray[rayIndex];
        const pieceOnTargetIndex = this.boardData.getPiece(targetIndex);
        const pieceOnTargetIndexColor = pieceOnTargetIndex & Piece.COLOR_MASK;
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
      }
    }
  }

  removePseudoIllegalMovesForMyKing(color) {
    const kingIndex = this.boardData.getKingPosition(color);
    const opponentColor = color ^ Piece.COLOR_MASK;
    const movesToRemove = [];
    for (const moveOfKing of this.moves) {
      if (moveOfKing.from !== kingIndex) continue;

      const kingInCheck = this.boardData.isKingMoveTargetAttacked(
        moveOfKing,
        opponentColor
      );
      if (kingInCheck) {
        movesToRemove.push(moveOfKing);
      }
    }
    if (movesToRemove.length > 0) {
      const filteredMoves = [];
      for (const move of this.moves) {
        if (!movesToRemove.includes(move)) {
          filteredMoves.push(move);
        }
      }
      this.moves = filteredMoves;
    }
  }

  // checkout: http://127.0.0.1:5500/#r3k3/1p3p2/p2q2p1/bn3P2/1N2PQP1/PB6/3K1R1r/3R4%20w%20KQkq%20-%200%201

  limitingMovementPinnedPieces() {
    const kingIndex = this.boardData.getKingPosition(this.color);
    const pinnedPieces = this.findPinnedPieces(kingIndex);
    this.checkAttackOnPinnedPieces = [];
    const filteredMoves = [];
    for (const move of this.moves) {
      if (move.pieceOnly === Piece.KING) {
        filteredMoves.push(move);
        continue;
      }

      if (move.enPassant) {
        const keepMove = !this.boardData.doesMoveExposeKing(move, this.color);
        if (!keepMove) {
          this.checkAttackOnPinnedPieces.push(move.from, move.to);
        } else {
          filteredMoves.push(move);
        }
        continue;
      }

      const pinnedPiece = pinnedPieces[move.from];
      if (!pinnedPiece) {
        filteredMoves.push(move);
        continue;
      }

      const keepMove = this.isMoveAllowedForPinnedPiece(
        kingIndex,
        pinnedPiece,
        move.to
      );
      if (!keepMove) {
        this.addPinnedAttackLine(kingIndex, pinnedPiece);
      } else {
        filteredMoves.push(move);
      }
    }
    this.moves = filteredMoves;
  }

  findPinnedPieces(kingIndex = this.boardData.getKingPosition(this.color)) {
    const pinnedPieces = {};
    if (kingIndex === undefined) {
      return pinnedPieces;
    }

    for (
      let directionIndex = 0;
      directionIndex < directionOffsets.length;
      directionIndex++
    ) {
      const ray = rayTargets[kingIndex][directionIndex];
      let pinnedIndex = undefined;

      for (let rayIndex = 0; rayIndex < ray.length; rayIndex++) {
        const index = ray[rayIndex];
        const piece = this.boardData.getPiece(index);
        if (piece === Piece.None) continue;

        const pieceColor = piece & Piece.COLOR_MASK;
        if (pieceColor === this.color) {
          if (pinnedIndex !== undefined) break;
          pinnedIndex = index;
          continue;
        }

        if (
          pinnedIndex !== undefined &&
          this.isSlidingAttackOnDirection(piece, directionIndex)
        ) {
          pinnedPieces[pinnedIndex] = {
            directionIndex,
            attackerIndex: index,
          };
        }
        break;
      }
    }

    return pinnedPieces;
  }

  isMoveAllowedForPinnedPiece(kingIndex, pinnedPiece, targetIndex) {
    if (kingIndex === undefined) return false;
    const ray = rayTargets[kingIndex][pinnedPiece.directionIndex];
    for (let rayIndex = 0; rayIndex < ray.length; rayIndex++) {
      const index = ray[rayIndex];
      if (index === targetIndex) return true;
      if (index === pinnedPiece.attackerIndex) return false;
    }
    return false;
  }

  addPinnedAttackLine(kingIndex, pinnedPiece) {
    if (kingIndex === undefined) return;
    const ray = rayTargets[kingIndex][pinnedPiece.directionIndex];
    for (let rayIndex = 0; rayIndex < ray.length; rayIndex++) {
      const index = ray[rayIndex];
      this.checkAttackOnPinnedPieces.push(index);
      if (index === pinnedPiece.attackerIndex) return;
    }
  }

  isSlidingAttackOnDirection(piece, directionIndex) {
    const pieceOnly = piece & Piece.PIECES_MASK;
    if (directionIndex < 4) {
      return pieceOnly === Piece.ROOK || pieceOnly === Piece.QUEEN;
    }
    return pieceOnly === Piece.BISHOP || pieceOnly === Piece.QUEEN;
  }

  removePseudoIllegalMoves(movesToCheck) {
    if (movesToCheck.length === 0) return;
    const color = movesToCheck[0].color;
    this.checkAttackIndexes = [];
    const checkAttackLookup = [];
    for (const move of movesToCheck) {
      move.addIndexesToLookup(checkAttackLookup, this.checkAttackIndexes);
    }
    const movesToKeep = [];
    if (movesToCheck.length === 1) {
      for (const move of this.moves) {
        const canPreventCheck =
          checkAttackLookup[move.to] === true ||
          (move.enPassant !== undefined &&
            checkAttackLookup[move.enPassant] === true);
        if (canPreventCheck && move.pieceOnly !== Piece.KING) {
          movesToKeep.push(move);
        }
      }
    }
    verbose >= 2 && console.table(movesToKeep);

    for (const moveOfKing of this.moves) {
      if (moveOfKing.pieceOnly !== Piece.KING) continue;

      const kingIsInCheckAndCastlingMove =
        moveOfKing.castlingKingTargetIndex &&
        checkAttackLookup[moveOfKing.from] === true;
      if (kingIsInCheckAndCastlingMove) {
        verbose === 2 &&
          console.log(
            "Castling not allowed due because King " +
              moveOfKing.from +
              " is in check (remove pseudo illegal move)"
          );
        continue;
      }

      const kingInCheck = this.boardData.isKingMoveTargetAttacked(
        moveOfKing,
        color
      );
      if (!kingInCheck) {
        movesToKeep.push(moveOfKing);
      }
    }
    verbose >= 2 && console.table(movesToKeep);
    this.moves = movesToKeep;
  }
}

if (typeof module !== "undefined") {
  module.exports = {
    Move,
    MoveGeneratorStats,
    MoveGeneratorTest,
  };
}
