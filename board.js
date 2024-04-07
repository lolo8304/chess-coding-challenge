const Piece = {
  COUNT: 6,

  None: 0,

  KING: 1,
  PAWN: 2,
  KNIGHT: 3,
  BISHOP: 4,
  ROOK: 5,
  QUEEN: 6,

  WHITE: 8,
  BLACK: 16,
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

class Board {
  constructor(x, y, w, h) {
    this.BLACK_COLOR = color(125, 148, 92);
    this.WHITE_COLOR = color(235, 235, 211);

    this.h = h;
    this.w = w;
    this.x = x;
    this.y = y;
    this.squares = new Array(100).fill(0);
    this.setup(FEN_start);
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

  pos(gridY, gridX) {
    return {
      x: this.x + gridX * CELL_SIZE,
      y: this.y + gridY * CELL_SIZE,
    };
  }

  drawCell(gridY, gridX) {
    const index = gridY * ROW_CELLS + gridX;
    if ((gridY + gridX) % 2 == 0) {
      fill(this.WHITE_COLOR);
    } else {
      fill(this.BLACK_COLOR);
    }
    const pos = this.pos(gridY, gridX);
    rect(pos.x, pos.y, CELL_SIZE, CELL_SIZE);
    const piece = this.squares[index];
    const isWhite = (piece & Piece.WHITE) > 0;
    const pieceIndex = (isWhite ? 0 : 1) * Piece.COUNT + (piece & 7) - 1;
    if (piece > 0) {
      image(imgFigures[pieceIndex], pos.x, pos.y, CELL_SIZE, CELL_SIZE);
    }
  }

  isNumber(str) {
    const num = parseFloat(str);
    return !isNaN(num);
  }

  // rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
  setup(fen) {
    if (!fen) {
      this.squares[0] = Piece.ROOK | Piece.BLACK;
      this.squares[1] = Piece.KNIGHT | Piece.BLACK;
      this.squares[2] = Piece.BISHOP | Piece.BLACK;
      this.squares[3] = Piece.QUEEN | Piece.BLACK;
      this.squares[4] = Piece.KING | Piece.BLACK;
      this.squares[5] = Piece.BISHOP | Piece.BLACK;
      this.squares[6] = Piece.KNIGHT | Piece.BLACK;
      this.squares[7] = Piece.ROOK | Piece.BLACK;
      this.squares[8] = Piece.PAWN | Piece.BLACK;

      this.squares[55] = Piece.PAWN | Piece.WHITE;
      this.squares[56] = Piece.ROOK | Piece.WHITE;
      this.squares[57] = Piece.KNIGHT | Piece.WHITE;
      this.squares[58] = Piece.BISHOP | Piece.WHITE;
      this.squares[59] = Piece.QUEEN | Piece.WHITE;
      this.squares[60] = Piece.KING | Piece.WHITE;
      this.squares[61] = Piece.BISHOP | Piece.WHITE;
      this.squares[62] = Piece.KNIGHT | Piece.WHITE;
      this.squares[63] = Piece.ROOK | Piece.WHITE;
    } else {
      const fenboard = fen.split(" ")[0];
      let yIndex = 0;
      let xIndex = 0;
      for (let i = 0; i < fenboard.length; i++) {
        const symbol = fenboard.charCodeAt(i);
        if (symbol === 47) {
          // char / == 47
          yIndex++;
          xIndex = 0;
        } else if ((symbol <= 57)) {
          // char 9 = 57
          xIndex += (symbol - 48);
        } else {
          const pieceColor = symbol >= 97 ? Piece.BLACK : Piece.WHITE;
          const pieceType = FEN_Pieces[String.fromCharCode(symbol).toLowerCase()];
          this.squares[yIndex * ROW_CELLS + xIndex] = pieceType | pieceColor;
          xIndex++;
        }
      }
    }
  }
}
