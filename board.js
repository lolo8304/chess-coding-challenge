class Board {
  constructor(x, y, w, h, fen) {
    this.h = h;
    this.w = w;
    this.x = x;
    this.y = y;
    this.data = new BoardData(new History(), fen);
    this.check = false;
  }

  draw() {
    this.drawGrid();
  }

  drawGrid() {
    for (let gridY = 0; gridY < ROW_CELLS; gridY++) {
      for (let gridX = 0; gridX < COL_CELLS; gridX++) {
        this.drawCell(gridY, gridX);
      }
    }
  }

  getPossibleMoveForTargetIndex(targetIndex, index) {
    if (this.data.selectedIndex === -1) return undefined;
    return this.data.legalMovesForSelectedIndex.find(
      (x) => x.to === targetIndex && (!index || x.from === index)
    );
  }
  hasPossibleMoveForIndex(index) {
    if (this.data.selectedIndex != -1) return false;
    return this.data.legalMoves.hasAnyMoveFromIndex(index);
  }

  toPos(gridY, gridX) {
    return {
      x: this.x + gridX * CELL_SIZE,
      y: this.y + gridY * CELL_SIZE,
    };
  }
  toGrid(y, x) {
    circle(x, y, 10, "pink");
    //console.log("x: " + this.x + " <= " + x + " < " + (this.x + this.w));
    //console.log("y: " + this.y + " <= " + y + " < " + (this.y + this.h));
    if (
      this.x <= x &&
      x < this.x + this.w &&
      this.y <= y &&
      y < this.y + this.h
    ) {
      return {
        gridX: Math.floor((x - this.x) / CELL_SIZE),
        gridY: Math.floor((y - this.y) / CELL_SIZE),
      };
    } else {
      return undefined;
    }
  }

  drawCell(gridY, gridX) {
    const index = gridY * ROW_CELLS + gridX;
    const piece = this.data.getPiece(index);
    const isWhite = (piece & Piece.WHITE) > 0;

    if (this.data.selectedIndex === index) {
      fill(LAST_MOVE_COLOR);
    } else {
      const lastMove = this.data.history.lastMove();
      if (
        this.data.selectedIndex === NOT_SELECTED &&
        lastMove &&
        (lastMove.from === index || lastMove.to === index)
      ) {
        if (lastMove.from === index) {
          fill(SELECTED_COLOR);
        } else {
          fill(LAST_MOVE_COLOR);
        }
      } else {
        if ((gridY + gridX) % 2 == 0) {
          fill(WHITE_COLOR);
        } else {
          fill(BLACK_COLOR);
        }
      }
    }

    const pos = this.toPos(gridY, gridX);
    rect(pos.x, pos.y, CELL_SIZE, CELL_SIZE);

    const moveTarget = this.getPossibleMoveForTargetIndex(index);
    if (moveTarget) {
      fill("rgba(255, 0, 0, 0.6)");
      rect(pos.x, pos.y, CELL_SIZE, CELL_SIZE);
    }

    const debugColor = this.data.isFinished()
      ? undefined
      : this.data.debugIndexColor(index);
    if (debugColor) {
      if (debugColor === "red") fill("rgba(255, 0, 0, 0.4)");
      if (debugColor === "blue") fill("rgba(0, 0, 153, 0.4)");
      if (debugColor === "cyan") fill("rgba(0, 255, 255, 0.4)");
      if (debugColor === "orange") fill("rgba(255, 153, 51, 0.4)");
      if (debugColor === "green") fill("rgba(0, 255, 0, 0.8)");
      rect(pos.x, pos.y, CELL_SIZE, CELL_SIZE);
    }

    const checkMoves = this.data.opponentLegalMoves.getCheckMovesTo(index);
    const isInCheckAttack =
      this.data.legalMoves.checkAttackIndexes.includes(index);
    const isInCheckAttackInPinnedPieces =
      this.data.legalMoves.checkAttackOnPinnedPieces.includes(index);
    if (
      (this.data.isNotFinished() && checkMoves.length > 0) ||
      isInCheckAttack || isInCheckAttackInPinnedPieces
    ) {
      fill("rgba(255, 255, 0, 0.4)");
      rect(pos.x, pos.y, CELL_SIZE, CELL_SIZE);
    }

    const size = Math.floor(CELL_SIZE / 4);
    textSize(size);
    fill("red");
    const hasPossibleMove = this.hasPossibleMoveForIndex(index);

    if (this.data.isFinished() || !hasPossibleMove) {
      fill("rgba(255, 255, 255, 0.4)");
    }
    textAlign(RIGHT);
    text("" + index, pos.x + CELL_SIZE - PADDING, pos.y + size);

    if (gridX === 0) {
      const rank = 1 + (7 - gridY);
      textAlign(LEFT);
      fill("black");
      text("" + rank, pos.x + PADDING, pos.y + size);
    }
    const diff = Math.floor(CELL_SIZE * 0.9);
    if (gridY === 7) {
      const file = "abcdefgh"[gridX];
      textAlign(RIGHT);
      fill("black");
      text(
        "" + file,
        pos.x + CELL_SIZE - PADDING,
        pos.y + CELL_SIZE - 2 * PADDING
      );
    }

    const pieceIndex =
      (isWhite ? 0 : 1) * Piece.COUNT + (piece & Piece.PIECES_MASK) - 1;
    if (piece > 0) {
      image(
        imgFigures[pieceIndex],
        pos.x + diff,
        pos.y + diff,
        CELL_SIZE - 2 * diff,
        CELL_SIZE - 2 * diff
      );
    }
  }

  isNumber(str) {
    const num = parseFloat(str);
    return !isNaN(num);
  }

  square(gridY, gridX) {
    return this.data.getPiece(gridY * ROW_CELLS + gridX);
  }

  piece(gridY, gridX) {
    return this.square(gridY, gridX) & Piece.PIECES_MASK;
  }
  color(gridY, gridX) {
    return this.square(gridY, gridX) & Piece.COLOR_MASK;
  }
  cell(gridY, gridX) {
    const cell = this.square(gridY, gridX);
    return {
      index: gridY * ROW_CELLS + gridX,
      piece: cell & Piece.PIECES_MASK,
      color: cell & Piece.COLOR_MASK,
    };
  }

  cellToName(cell) {
    return {
      index: cell.index,
      piece: PieceNames[cell.piece],
      color: PieceNames[cell.color],
    };
  }

  isColor(gridY, gridX, color) {
    return (this.square(gridY, gridX) & color) > 0;
  }

  cellToString(cell) {
    return (
      "Cell: piece=" +
      cell.piece +
      ", color=" +
      cell.color +
      " index=" +
      cell.index
    );
  }

  clickedToString(clientY, clientX, color) {
    const grid = this.toGrid(clientY, clientX);
    if (grid) {
      const cell = this.cell(grid.gridY, grid.gridX);
      //console.log(this.cellToString(cell));
      //console.log(this.cellToString(this.cellToName(cell)));
    } else {
      console.log("Out of board");
    }
  }

  clickedCellByColor(clientY, clientX, color) {
    const grid = this.toGrid(clientY, clientX);
    if (grid) {
      const cell = this.cell(grid.gridY, grid.gridX);
      if (cell.color === color) {
        return cell;
      }
    }
    return undefined;
  }

  clickedCell(clientY, clientX) {
    const grid = this.toGrid(clientY, clientX);
    if (grid) {
      return this.cell(grid.gridY, grid.gridX);
    }
    return undefined;
  }

  makeMove(move, withHalfMoves) {
    this.data.makeMove(move, withHalfMoves)
  }


  selectCellIndex(index) {
    this.data.selectCellIndex(index);
  }
}
