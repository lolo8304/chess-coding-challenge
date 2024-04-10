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
  k: Piece.KING,
  p: Piece.PAWN,
  n: Piece.KNIGHT,
  b: Piece.BISHOP,
  r: Piece.ROOK,
  q: Piece.QUEEN,
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
    this.moves = [];
    //                       N   S  W  O  NW SE  NO  SW
    this.directionOffsets = [-8, 8, -1, 1, -9, 9, -7, 7];
    this.distanceToEdge = [];
    this.prepareDirectionOffsets();
    this.legalMoves = new LegalMoves(Piece.WHITE, this);
    this.legalMovesForSelectedIndex = [];
    this.legalIndicesForSelectedIndex = [];
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

  setLegalMovesFor(color) {
    const oldLegalMoves = this.legalMoves;
    const newLegalMoves = this.legalMovesFor(color);
    if (oldLegalMoves.color != color || !newLegalMoves.eq(oldLegalMoves)) {
      this.legalMoves = newLegalMoves;
      console.table(this.legalMoves.moves);
    }
    if (this.selectedIndex != NOT_SELECTED) {
      this.legalMovesForSelectedIndex = this.legalMoves.getMovesFrom(this.selectedIndex);
      this.legalIndicesForSelectedIndex = [];
      for (const move of this.legalMovesForSelectedIndex) {
        this.legalIndicesForSelectedIndex.push(...move.getFromToIndexes());
      }
      console.log(
        "Legal moves add-on moves: #" + this.legalMovesForSelectedIndex.length
      );
      console.log(
        "Legal indices add-on moves: #" +
          this.legalIndicesForSelectedIndex.length
      );
    }
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
    const piece = this.squares[index];
    const isWhite = (piece & Piece.WHITE) > 0;
    const pieceIndex =
      (isWhite ? 0 : 1) * Piece.COUNT + (piece & Piece.PIECES_MASK) - 1;
    if (piece > 0) {
      image(imgFigures[pieceIndex], pos.x, pos.y, CELL_SIZE, CELL_SIZE);
    }
    const size = Math.floor(CELL_SIZE / 4);
    textSize(size);
    fill("red");
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
      console.log(this.cellToString(cell));
      console.log(this.cellToString(this.cellToName(cell)));
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
    return this.moves.length > 0
      ? this.moves[this.moves.length - 1]
      : undefined;
  }

  storeMove(fromIndex, toIndex) {
    this.moves.push(new Move(this, fromIndex, toIndex));
    this.squares[toIndex] = this.squares[fromIndex];
    this.squares[fromIndex] = Piece.None;
    this.selectCellIndex(NOT_SELECTED);
  }
  isSlidingPiece(piece) {
    const pieceOnly = piece & Piece.PIECES_MASK;
    return SlidingPieces.includes(pieceOnly);
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
          Math.min(numNorth, numWest),
          Math.min(numSouth, numEast),
          Math.min(numNorth, numEast),
          Math.min(numSouth, numWest),
        ];
      }
    }
  }

  legalMovesFor(color) {
    return new LegalMoves(color, this).generateMoves(color);
  }
}

class Move {
  constructor(board, from, to) {
    this.board = board;
    this.from = from;
    this.to = to;
  }

  eq(other) {
    return other?.from === this.from && other?.to === this.to;
  }

  getFromToIndexes() {
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

  generateMoves(color) {
    for (let start = 0; start < this.board.squares.length; start++) {
      const piece = this.board.squares[start];
      const ownColor = piece & color;
      if (ownColor > 0) {
        if (this.board.isSlidingPiece(piece)) {
          this.generateSlidingMoves(start, piece, color);
        }
      }
    }
    return this;
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
      for (
        let n = 0;
        n < this.board.distanceToEdge[startIndex][directionIndex];
        n++
      ) {
        const targetIndex =
          startIndex + this.board.directionOffsets[directionIndex] * (n + 1);
        const pieceOnTargetIndex = this.board.squares[targetIndex];
        const pieceOnTargetIndexColor = pieceOnTargetIndex & color;
        if (pieceOnTargetIndexColor === color) {
          break;
        }
        this.moves.push(new Move(this.board, startIndex, targetIndex));
        if (pieceOnTargetIndexColor === oppositeColor) {
          break;
        }
      }
    }
  }
}
