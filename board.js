const Piece = {
  COUNT: 6,

  None: 0,

  KING: 1,
  PAWN: 2,
  KNIGHT: 3,
  BISHOP: 4,
  ROOK: 5,
  QUEEN: 6,

  PIECES_MASK: 7,

  WHITE: 8,
  BLACK: 16,

  COLOR_MASK: 24,
};

const SlidingPieces = [Piece.BISHOP, Piece.ROOK, Piece.QUEEN];

const PieceNames = {
  0: "None",
  1: "KING",
  2: "PAWN",
  3: "KNIGHT",
  4: "BISHOP",
  5: "ROOK",
  6: "QUEEN",
  8: "WHITE",
  16: "BLACK",
};

const FEN_start = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
const FEN_Pieces = {
  k: Piece.KING, // könig
  p: Piece.PAWN, // bauer
  n: Piece.KNIGHT, // pferd
  b: Piece.BISHOP, // springer
  r: Piece.ROOK, // turm
  q: Piece.QUEEN, // dame
};

const NOT_SELECTED = -1;

class Board {
  constructor(x, y, w, h) {
    this.BLACK_COLOR = color(125, 148, 92);
    this.WHITE_COLOR = color(235, 235, 211);
    this.SELECTED_COLOR = color(183, 149, 93);
    this.LAST_MOVE_COLOR = color(186, 164, 96);

    this.h = h;
    this.w = w;
    this.x = x;
    this.y = y;
    this.squares = new Array(64).fill(0);
    this.setup();
    this.selectCellIndex(NOT_SELECTED);
    this.mouseCellIndex = NOT_SELECTED;
    this.movesHistory = [];
    //                       N   S  W  O  NW SE  NO  SW
    this.directionOffsets = [-8, 8, -1, 1, -9, 9, -7, 7];
    this.distanceToEdge = [];
    this.prepareDirectionOffsets();
    this.legalMoves = new LegalMoves(Piece.WHITE, this);
    this.legalMovesForSelectedIndex = [];
    this.legalIndicesForSelectedIndex = [];
    this.debuggingIndexes = [];
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

  /*
    if (this.selectedIndex != -1) {
      const mouseGrid = this.toGrid(y, x);
      this.mouseCellIndex = mouseGrid
        ? mouseGrid.gridY * ROW_CELLS + mouseGrid.gridX
        : -1;
  */

  addDebug(move) {
    this.debuggingIndexes.push(move);
  }

  debugIndexColor(index) {
    const found = this.debuggingIndexes.find(
      (x) => x.from === index || x.to === index || x?.via === index
    );
    if (!found) return undefined;
    if (found.from === index) return "red";
    if (found.to === index) return "pink";
    if (found.via === index) return "orange";
    return "black";
  }

  setLegalMovesFor(color) {
    this.debuggingIndexes = [];
    const oldLegalMoves = this.legalMoves;
    const newLegalMoves = this.legalMovesFor(color);
    if (oldLegalMoves.color != color || !newLegalMoves.eq(oldLegalMoves)) {
      this.legalMoves = newLegalMoves;
      console.table(this.legalMoves.moves);
    }
    if (this.selectedIndex != NOT_SELECTED) {
      this.legalMovesForSelectedIndex = this.legalMoves.getMovesFrom(
        this.selectedIndex
      );
      this.legalIndicesForSelectedIndex = [];
      for (const move of this.legalMovesForSelectedIndex) {
        this.legalIndicesForSelectedIndex.push(...move.getFromToIndexes());
      }
      console.log("Nof legal moves: " + this.legalMovesForSelectedIndex.length);
      /*
      console.log(
        "Legal indices add-on moves: #" +
          this.legalIndicesForSelectedIndex.length
      );
      */
    }
  }

  getPossibleMoveForTargetIndex(index) {
    if (this.selectedIndex === -1) return undefined;
    return this.legalMovesForSelectedIndex.find((x) => x.to === index);
  }
  hasPossibleMoveForIndex(index) {
    if (this.selectedIndex != -1) return false;
    return this.legalMoves.hasAnyMoveForIndex(index);
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

  indexToGrid(index) {
    return {
      gridY: Math.floor(index / ROW_CELLS),
      gridX: index % ROW_CELLS,
    };
  }

  drawCell(gridY, gridX) {
    const index = gridY * ROW_CELLS + gridX;
    const piece = this.squares[index];
    const isWhite = (piece & Piece.WHITE) > 0;

    if (this.selectedIndex === index) {
      fill(this.LAST_MOVE_COLOR);
    } else {
      const lastMove = this.lastMove();
      if (
        this.selectedIndex === NOT_SELECTED &&
        lastMove &&
        (lastMove.from === index || lastMove.to === index)
      ) {
        if (lastMove.from === index) {
          fill(this.SELECTED_COLOR);
        } else {
          fill(this.LAST_MOVE_COLOR);
        }
      } else {
        if ((gridY + gridX) % 2 == 0) {
          fill(this.WHITE_COLOR);
        } else {
          fill(this.BLACK_COLOR);
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

    const debugColor = this.debugIndexColor(index);
    if (debugColor) {
      if (debugColor === "red") fill("rgba(0, 0, 153, 0.4)");
      if (debugColor === "pink") fill("rgba(0, 255, 255, 0.4)");
      if (debugColor === "orange") fill("rgba(255, 153, 51, 0.4)");
      rect(pos.x, pos.y, CELL_SIZE, CELL_SIZE);
    }

    const pieceIndex =
      (isWhite ? 0 : 1) * Piece.COUNT + (piece & Piece.PIECES_MASK) - 1;
    if (piece > 0) {

      image(imgFigures[pieceIndex], pos.x, pos.y, CELL_SIZE, CELL_SIZE);
    }
    const size = Math.floor(CELL_SIZE / 4);
    textSize(size);
    fill("red");
    const hasPossibleMove = this.hasPossibleMoveForIndex(index)
    if (!hasPossibleMove) {
      fill("rgba(255, 255, 255, 0.4)");
    }
    textAlign(LEFT);
    text("" + index, pos.x + PADDING, pos.y + size + PADDING);

  }

  isNumber(str) {
    const num = parseFloat(str);
    return !isNaN(num);
  }

  // rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
  setup(fen) {
    if (!fen) {
      fen = FEN_start;
    }
    const fenboard = fen.split(" ")[0];
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
        this.squares[yIndex * ROW_CELLS + xIndex] = pieceType | pieceColor;
        xIndex++;
      }
    }
  }

  square(gridY, gridX) {
    return this.squares[gridY * ROW_CELLS + gridX];
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

  selectCellIndex(index) {
    this.selectedIndex = index;
    //console.log("Select index: " + index);
  }

  lastMove() {
    return this.movesHistory.length > 0
      ? this.movesHistory[this.movesHistory.length - 1]
      : undefined;
  }

  storeMove(move) {
    this.movesHistory.push(move);
    this.squares[move.to] = this.squares[move.from];
    this.squares[move.from] = Piece.None;
    if (move.via) {
      this.squares[move.via] = Piece.None;
    }
    this.selectCellIndex(NOT_SELECTED);
  }
  isSlidingPiece(piece) {
    return SlidingPieces.includes(piece & Piece.PIECES_MASK);
  }
  isPawn(piece) {
    return (piece & Piece.PIECES_MASK) === Piece.PAWN;
  }
  isKing(piece) {
    return (piece & Piece.PIECES_MASK) === Piece.KING;
  }
  isKnight(piece) {
    return (piece & Piece.PIECES_MASK) === Piece.KNIGHT;
  }

  prepareDirectionOffsets() {
    for (let gridY = 0; gridY < ROW_CELLS; gridY++) {
      for (let gridX = 0; gridX < ROW_CELLS; gridX++) {
        const numNorth = -gridY;
        const numSouth = 7 - gridY;
        const numWest = -gridX;
        const numEast = 7 - gridX;
        const index = gridY * 8 + gridX;
        this.distanceToEdge[index] = [
          numNorth,
          numSouth,
          numWest,
          numEast,
          -Math.min(Math.abs(numNorth), Math.abs(numWest)),
          Math.min(Math.abs(numSouth), Math.abs(numEast)),
          -Math.min(Math.abs(numNorth), Math.abs(numEast)),
          Math.min(Math.abs(numSouth), Math.abs(numWest)),
        ];
      }
    }
  }

  legalMovesFor(color) {
    return new LegalMoves(color, this).generateMoves(color);
  }
}

class Move {
  constructor(board, from, to, isHit = false, via = undefined) {
    this.colorName = PieceNames[board.squares[from] & Piece.COLOR_MASK];
    this.pieceName = PieceNames[board.squares[from] & Piece.PIECES_MASK];
    this.board = board;
    this.from = from;
    this.to = to;
    this.isHit = isHit;
    this.via = via; // enPassang
  }

  eq(other) {
    return (
      other?.from === this.from &&
      other?.to === this.to &&
      other?.isHit === this.isHit
    );
  }

  getFromToIndexes() {
    return [];
    const gridFrom = this.board.indexToGrid(this.from);
    const gridTo = this.board.indexToGrid(this.to);
    const diffY = Math.sign(gridFrom.gridY - gridTo.gridY);
    const diffX = Math.sign(gridFrom.gridX - gridTo.gridX);
    const indices = [];
    const start = {
      gridY: gridFrom.gridY,
      gridX: gridFrom.gridX,
    };
    while (start.gridY != gridTo.gridY || start.gridX != gridTo.gridX) {
      indices.push({
        index: start.gridY * ROW_CELLS + start.gridX,
        gridY: start.gridY,
        gridX: start.gridX,
      });
      start.gridY += diffY;
      start.gridX += diffX;
    }
    indices.push({
      index: start.gridY * ROW_CELLS + start.gridX,
      gridY: start.gridY,
      gridX: start.gridX,
    });
    return indices;
  }
}

class LegalMoves {
  constructor(color, board) {
    this.board = board;
    this.moves = [];
    this.color = color;
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

  getMovesTo(index) {
    return this.moves.filter((x) => x.to === index);
  }
  getMovesFrom(index) {
    return this.moves.filter((x) => x.from === index);
  }

  hasAnyMoveForIndex(index) {
    return this.moves.find(x => x.from === index) != undefined
  }

  addMove(move) {
    //this.board.addDebug(move);
    if (0 <= move.to && move.to < 64) {
      this.moves.push(move);
    }
  }

  generateMoves(color) {
    for (let start = 0; start < this.board.squares.length; start++) {
      const piece = this.board.squares[start];
      const ownColor = piece & color;
      if (ownColor > 0) {
        if (this.board.isSlidingPiece(piece)) {
          this.generateSlidingMoves(start, piece, color);
        } else if (this.board.isKing(piece)) {
          this.generateKingMoves(start, piece, color);
        } else if (this.board.isKnight(piece)) {
          this.generateKnightMoves(start, piece, color);
        } else if (this.board.isPawn(piece)) {
          this.generatePawnMoves(start, piece, color);
        }
      }
    }
    return this;
  }

  generateKingMoves(startIndex, piece, color) {
    const oppositeColor = color ^ Piece.COLOR_MASK;
    for (let i = 0; i < this.board.directionOffsets.length; i++) {
      const targetIndex = startIndex + this.board.directionOffsets[i];
      const pieceOnTargetIndex = this.board.squares[targetIndex];
      const pieceOnTargetIndexColor = pieceOnTargetIndex & Piece.COLOR_MASK;
      if (pieceOnTargetIndexColor === color) {
        // skip
      } else if (pieceOnTargetIndexColor === oppositeColor) {
        this.addMove(new Move(this.board, startIndex, targetIndex, true));
      } else {
        this.addMove(new Move(this.board, startIndex, targetIndex, false));
      }
    }
  }
  generateKnightMoves(startIndex, piece, color) {
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
    const grid = this.board.indexToGrid(startIndex);
    for (let i = 0; i < knightsDirectionOffsetsYX.length; i++) {
      const knightsGridDiff = knightsDirectionOffsetsYX[i];
      const newY = grid.gridY + knightsGridDiff[0];
      const newX = grid.gridX + knightsGridDiff[1];
      if (0 <= newY && newY < 8 && 0 <= newX && newX < 8) {
        const targetIndex = newY * 8 + newX;
        const pieceOnTargetIndex = this.board.squares[targetIndex];
        const pieceOnTargetIndexColor = pieceOnTargetIndex & Piece.COLOR_MASK;
        if (pieceOnTargetIndexColor === color) {
          // skip
        } else if (pieceOnTargetIndexColor === oppositeColor) {
          this.addMove(new Move(this.board, startIndex, targetIndex, true));
        } else {
          this.addMove(new Move(this.board, startIndex, targetIndex, false));
        }
      }
    }
  }
  generatePawnMoves(startIndex, piece, color) {
    const startPawnIndex = (color & Piece.WHITE) > 0 ? 6 : 1;
    const directionOffsetY = (color & Piece.WHITE) > 0 ? -1 : 1;

    const pieceOnly = piece & Piece.PIECES_MASK;
    const pieceColor = piece & Piece.COLOR_MASK;
    const oppositeColor = color ^ Piece.COLOR_MASK;
    const grid = this.board.indexToGrid(startIndex);
    // move 2
    if (grid.gridY === startPawnIndex) {
      const newY = grid.gridY + 2 * directionOffsetY;
      const newX = grid.gridX;
      if (0 <= newY && newY < 8 && 0 <= newX && newX < 8) {
        const targetIndex = newY * 8 + newX;
        if (0 <= targetIndex && targetIndex < 64) {
          const pieceOnTargetIndex = this.board.squares[targetIndex];
          const pieceOnTargetIndexColor = pieceOnTargetIndex & Piece.COLOR_MASK;
          if (pieceOnTargetIndexColor === 0) {
            const newMove = new Move(
              this.board,
              startIndex,
              targetIndex,
              false
            );
            this.addMove(newMove);
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
        const pieceOnTargetIndex = this.board.squares[targetIndex];
        const pieceOnTargetIndexColor = pieceOnTargetIndex & Piece.COLOR_MASK;
        if (pieceOnTargetIndexColor === 0) {
          const newMove = new Move(this.board, startIndex, targetIndex, false);
          this.addMove(newMove);
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
        const pieceOnTargetIndex = this.board.squares[targetIndex];
        const pieceOnTargetIndexColor = pieceOnTargetIndex & Piece.COLOR_MASK;
        if (pieceOnTargetIndexColor === oppositeColor) {
          this.addMove(new Move(this.board, startIndex, targetIndex, true));
          const newMove = new Move(this.board, startIndex, targetIndex, true);
          this.addMove(newMove);
        } else if (pieceOnTargetIndexColor === 0) {
          // check for en-passang
          newY = grid.gridY;
          newX = grid.gridX + dirX;
          if (0 <= newY && newY < 8 && 0 <= newX && newX < 8) {
            const targetEnPIndex = newY * 8 + newX;
            const pieceEnPOnTargetIndex = this.board.squares[targetEnPIndex];
            const pieceEnPOnTargetIndexColor =
              pieceEnPOnTargetIndex & Piece.COLOR_MASK;
            if (pieceEnPOnTargetIndexColor === oppositeColor) {
              const newMove = new Move(
                this.board,
                startIndex,
                targetIndex,
                true,
                targetEnPIndex
              );
              this.addMove(newMove);
            }
          }
        }
      }
    }
  }

  generateSlidingMoves(startIndex, piece, color) {
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
      const distanceToTarget =
        this.board.distanceToEdge[startIndex][directionIndex];
      let n = 0;
      const inc = Math.sign(distanceToTarget);
      do {
        const targetIndex =
          startIndex +
          this.board.directionOffsets[directionIndex] * (Math.abs(n) + 1);
        if (0 <= targetIndex && targetIndex < 64) {
          const pieceOnTargetIndex = this.board.squares[targetIndex];
          const pieceOnTargetIndexColor = pieceOnTargetIndex & Piece.COLOR_MASK;
          if (pieceOnTargetIndexColor === color) {
            break;
          }
          if (pieceOnTargetIndexColor === oppositeColor) {
            this.addMove(new Move(this.board, startIndex, targetIndex, true));
            break;
          } else {
            this.addMove(new Move(this.board, startIndex, targetIndex, false));
          }
        } else {
          break;
        }
        n = n + inc;
      } while (inc === 1 ? n < distanceToTarget : n > distanceToTarget);
    }
  }
}
