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

const PieceShortNamesLower = {
  0: "", // No piece
  1: "k", // King
  2: "p", // Pawn
  3: "n", // Knight
  4: "b", // Bishop
  5: "r", // Rook
  6: "q", // Queen
};

const CastlingPositionsWhite = [56, 63];
const CastlingPositionsBlack = [0, 7];

const FEN_start = fen_hash
  ? fen_hash
  : "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
//const FEN_start = "r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - ";
const FEN_Pieces = {
  k: Piece.KING, // könig
  p: Piece.PAWN, // bauer
  n: Piece.KNIGHT, // pferd
  b: Piece.BISHOP, // springer
  r: Piece.ROOK, // turm
  q: Piece.QUEEN, // dame
};

const NOT_SELECTED = -1;

let BLACK_COLOR;
let WHITE_COLOR;
let SELECTED_COLOR;
let LAST_MOVE_COLOR;

//                       N   S  W  O  NW SE  NO  SW
directionOffsets = [-8, 8, -1, 1, -9, 9, -7, 7];
distanceToEdge = [];

const prepareDirectionOffsets = () => {
  const checkBoardToEdges = (distanceToEdgeCount) => {
    if (distanceToEdgeCount === 0) return undefined;
    return distanceToEdgeCount;
  };
  for (let gridY = 0; gridY < ROW_CELLS; gridY++) {
    for (let gridX = 0; gridX < ROW_CELLS; gridX++) {
      const numNorth = -gridY;
      const numSouth = 7 - gridY;
      const numWest = -gridX;
      const numEast = 7 - gridX;
      const index = gridY * 8 + gridX;

      const NW = -Math.min(Math.abs(numNorth), Math.abs(numWest));
      const SE = Math.min(Math.abs(numSouth), Math.abs(numEast));
      const NE = -Math.min(Math.abs(numNorth), Math.abs(numEast));
      const SW = Math.min(Math.abs(numSouth), Math.abs(numWest));
      distanceToEdge[index] = [
        checkBoardToEdges(numNorth),
        checkBoardToEdges(numSouth),
        checkBoardToEdges(numWest),
        checkBoardToEdges(numEast),
        checkBoardToEdges(NW),
        checkBoardToEdges(SE),
        checkBoardToEdges(NE),
        checkBoardToEdges(SW),
      ];
    }
  }
};

function boardSetupStatic() {
  prepareDirectionOffsets();
  BLACK_COLOR = color(125, 148, 92);
  WHITE_COLOR = color(235, 235, 211);
  SELECTED_COLOR = color(183, 149, 93);
  LAST_MOVE_COLOR = color(186, 164, 96);
}

function isSlidingPiece(piece) {
  return SlidingPieces.includes(piece & Piece.PIECES_MASK);
}
function isPawn(piece) {
  return (piece & Piece.PIECES_MASK) === Piece.PAWN;
}
function isKing(piece) {
  return (piece & Piece.PIECES_MASK) === Piece.KING;
}
function isKnight(piece) {
  return (piece & Piece.PIECES_MASK) === Piece.KNIGHT;
}

function toPieceNotation(piece) {
  const pieceOnly = piece & Piece.PIECES_MASK;
  const color = piece & Piece.COLOR_MASK;

  let notation = PieceShortNamesLower[pieceOnly];
  if (notation === "p") {
    notation = "";
  }
  if (color === Piece.WHITE) {
    notation = notation.toUpperCase();
  }
  return notation || "";
}

class History {
  constructor(historyInit) {
    this.movesHistory = historyInit || [];
  }
  lastMove() {
    return this.movesHistory.length > 0
      ? this.movesHistory[this.movesHistory.length - 1]
      : undefined;
  }
  storeMove(move) {
    this.movesHistory.push(move);
  }
  hasMoved(piece) {
    return this.movesHistory.find((x) => x.piece === piece) != undefined;
  }
  hasMovedFromIndex(piece, index) {
    return (
      this.movesHistory.find((x) => x.piece === piece && x.from === index) !=
      undefined
    );
  }
}

class BoardData {
  constructor(history, fen) {
    this.debuggingIndexes = [];
    this.history = history;
    this.squares = new Array(64).fill(0);
    this.selectedIndex = NOT_SELECTED;
    this.selectCellIndex(NOT_SELECTED);
    this.enPassantMove = [];
    this.halfMoveCounter = 0;
    this.nextFullMoveCounter = 1;
    this.resetHalfMoveCounter();
    this.resetSquares(fen);
    this.result = undefined;
  }

  selectCellIndex(index) {
    this.selectedIndex = index;
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
    if (!castlingOptions["w"].long) {
      this.history.push(
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
        this.squares[yIndex * ROW_CELLS + xIndex] = pieceType | pieceColor;
        xIndex++;
      }
    }
    this.legalMoves = new LegalMoves(startColor, this, this.history);
    this.opponentLegalMoves = new LegalMoves(
      startColor ^ Piece.COLOR_MASK,
      this,
      this.history
    );
  }

  calculatedFen() {
    let fen = "";
    let emptyCount = 0;

    for (let i = 0; i < 64; i++) {
      const piece = this.squares[i];
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

    let enPassantString = this.enPassantMove
      ? this.indexToAlgebraic(this.enPassantMove.enPassantTarget)
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
    const newLegalMoves = this.legalMovesFor(color);
    if (oldLegalMoves.color != color || !newLegalMoves.eq(oldLegalMoves)) {
      this.legalMoves = newLegalMoves;
      this.opponentLegalMoves = this.legalMovesFor(opponentColor);
      console.log("Moves " + PieceNames[color]);
      console.table(this.legalMoves.moves);
      console.log("Moves " + PieceNames[opponentColor]);
      console.table(this.opponentLegalMoves.moves);
    }
    //for (const move of this.opponentLegalMoves.moves) {
    //  this.debuggingIndexes.push(move);
    //}
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

    if (this.selectedIndex != NOT_SELECTED) {
      this.legalMovesForSelectedIndex = this.legalMoves.getMovesFrom(
        this.selectedIndex
      );
      const selectedPiece = this.squares[this.selectedIndex];
      const selectedPieceOnly = selectedPiece & Piece.PIECES_MASK;
      if (selectedPieceOnly === Piece.KING) {
        this.legalMovesForSelectedIndex =
          this.legalMoves.removePseudoIllegalMovesSelectedKing(
            this.legalMovesForSelectedIndex
          );
      }
    }
  }

  legalMovesFor(color) {
    return new LegalMoves(color, this, this.history).generateMoves(color);
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
    const pieceOnly = piece & Piece.PIECES_MASK;
    return this.squares.filter((x) => (x & Piece.PIECES_MASK) === pieceOnly);
  }
  anyOfPiece(piece) {
    for (let i = 0; i < this.squares.length; i++) {
      if (this.squares[i] === piece) return i;
    }
    return undefined;
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
    //if (this.enPassantMove.includes(index)) return "green";
    const found = this.debuggingIndexes.find((x) => x.to === index);
    if (!found) return undefined;
    if (found.to === index) return "red";
    return "black";
  }

  isLegalEnPassant(targetEnPassant) {
    return this.enPassantMove && this.enPassantMove.to === targetEnPassant;
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
}

class Board {
  constructor(x, y, w, h, fen) {
    this.h = h;
    this.w = w;
    this.x = x;
    this.y = y;
    this.history = new History();
    this.data = new BoardData(this.history, fen);
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
    const piece = this.data.squares[index];
    const isWhite = (piece & Piece.WHITE) > 0;

    if (this.data.selectedIndex === index) {
      fill(LAST_MOVE_COLOR);
    } else {
      const lastMove = this.history.lastMove();
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
    if (
      (this.data.isNotFinished() && checkMoves.length > 0) ||
      isInCheckAttack
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
    return this.data.squares[gridY * ROW_CELLS + gridX];
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

  makeMove(move) {
    this.data.enPassantMove = undefined;
    if (move.isEnPassantAttackable()) {
      this.data.enPassantMove = move;
    }
    this.history.storeMove(move);
    this.data.squares[move.to] = this.data.squares[move.from];
    this.data.squares[move.from] = Piece.None;
    if (move.enPassant) {
      this.data.squares[move.enPassant] = Piece.None;
    }
    if (move.castlingKingTargetIndex) {
      this.data.squares[move.castlingRookTargetIndex] =
        this.data.squares[move.castlingRookStartIndex];
      this.data.squares[move.castlingRookStartIndex] = Piece.None;
    }
    this.selectCellIndex(NOT_SELECTED);
    if (move.enPassant) {
      this.data.enPassantMove = undefined;
    }
    if (move.pieceOnly === Piece.PAWN || move.isHit) {
      this.data.resetHalfMoveCounter();
    } else {
      this.data.incHalfMoveCounter();
    }
    if (this.data.halfMoveCounter === 100) {
      const confirmed = window.confirm("50 move rule - confirm to offer DRAW?");
      if (confirmed) {
        this.data.result = "DRAW - agreed by 50-move rule ";
      }
    }
    if (this.data.halfMoveCounter === 150) {
      this.data.result = "DRAW - forced by 75-move rule";
    }
  }

  selectCellIndex(index) {
    this.data.selectCellIndex(index);
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
      isHit && (this.targetPiece & Piece.PIECES_MASK) === Piece.KING
        ? true
        : undefined;
    this.enPassant = enPassant; // enPassant
    this.enPassantTarget = enPassantTarget;
    this.castlingKingTargetIndex = castlingKingTargetIndex; // castling king - king position
    this.castlingRookStartIndex = castlingRookStartIndex; // castling king - rook position start
    this.castlingRookTargetIndex = castlingRookTargetIndex; // castling king - rook position target
  }
  calculateFromAndTo(from, to) {
    this.from = from;
    this.to = to;
    this.colorName = PieceNames[this.board.squares[from] & Piece.COLOR_MASK];
    this.pieceName = PieceNames[this.board.squares[from] & Piece.PIECES_MASK];
    this.piece = this.board.squares[from];
    this.pieceOnly = this.piece & Piece.PIECES_MASK;
    this.targetPiece = this.board.squares[to];
    this.targetPieceOnly = this.targetPiece & Piece.PIECES_MASK;
  }

  eq(other) {
    return (
      other?.from === this.from &&
      other?.to === this.to &&
      other?.isHit === this.isHit
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
    while (newGrid.gridY != gridTo.gridY || newGrid.gridX != gridTo.gridX) {
      const index = newGrid.gridY * ROW_CELLS + newGrid.gridX;
      indexes.push(index);
      newGrid.gridY += sign.gridY;
      newGrid.gridX += sign.gridX;
    }
    const index = newGrid.gridY * ROW_CELLS + newGrid.gridX;
    indexes.push(index);
  return indexes;
  }

  moveToNotation() {
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
}

class LegalMoves {
  constructor(color, boardData, history) {
    this.boardData = boardData;
    this.history = history;
    this.moves = [];
    this.color = color;
    this.checkAttackIndexes = [];
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

  addMove(move) {
    if (0 <= move.to && move.to < 64) {
      this.moves.push(move);
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
    console.log("Index of my KING (" + PieceNames[this.color] + ")=" + index);
    return this.getMovesFrom(index);
  }

  generateMoves(color) {
    for (let start = 0; start < this.boardData.squares.length; start++) {
      const piece = this.boardData.squares[start];
      const ownColor = piece & color;
      if (ownColor > 0) {
        if (isSlidingPiece(piece)) {
          this.generateSlidingMoves(start, piece, color);
        } else if (isKing(piece)) {
          this.generateKingMoves(start, piece, color);
          this.generateCastlingKings(start, piece, color);
        } else if (isKnight(piece)) {
          this.generateKnightMoves(start, piece, color);
        } else if (isPawn(piece)) {
          this.generatePawnMoves(start, piece, color);
        }
      }
    }
    return this;
  }

  getCastlingOptions(kingPiece, color) {
    if (this.history.hasMoved(kingPiece)) return { long: false, short: false };
    const rookPiece = Piece.ROOK | color;
    const rookPositions =
      color === Piece.WHITE ? CastlingPositionsWhite : CastlingPositionsBlack;

    const rookLongPiece = this.boardData.squares[rookPositions[0]];
    const rookLongStillThere =
      (rookLongPiece & Piece.PIECES_MASK) === Piece.ROOK &&
      (rookLongPiece & Piece.COLOR_MASK) === color;
    const rookLongMoved =
      !rookLongStillThere ||
      this.history.hasMovedFromIndex(rookPiece, rookPositions[0]);
    const rookShortPiece = this.boardData.squares[rookPositions[1]];
    const rookShortStillThere =
      (rookShortPiece & Piece.PIECES_MASK) === Piece.ROOK &&
      (rookShortPiece & Piece.COLOR_MASK) === color;
    const rookShortMoved =
      !rookShortStillThere ||
      this.history.hasMovedFromIndex(rookPiece, rookPositions[1]);
    return { long: !rookLongMoved, short: !rookShortMoved };
  }

  generateCastlingKings(startIndex, piece, color) {
    if (this.history.hasMoved(piece)) return;
    const rookPositions =
      color === Piece.WHITE ? CastlingPositionsWhite : CastlingPositionsBlack;

    const castlingOptions = this.getCastlingOptions(piece, color);
    const longPossible = castlingOptions.long;
    const shortPossible = castlingOptions.short;

    if (longPossible) {
      const targetIndex = rookPositions[0] + 2;
      let isEmpty = true;
      for (let index = rookPositions[0] + 1; index < startIndex; index++) {
        const shouldBeEmptyPiece = this.boardData.squares[index];
        if (shouldBeEmptyPiece != 0) {
          isEmpty = false;
          break;
        }
        // is empty - check now if attack opponent attacks this index - only for index where king is moving
        if (targetIndex <= index && index < startIndex) {
          if (this.boardData.opponentLegalMoves.hasAnyMoveToIndex(index)) {
            console.log("Castling not allowed due to attack on " + index);
            isEmpty = false;
            break;
          }
        }
      }
      if (
        isEmpty &&
        this.boardData.opponentLegalMoves.hasAnyMoveToIndex(startIndex)
      ) {
        isEmpty = false;
        console.log(
          "Castling not allowed due because King " + startIndex + " is in check"
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
        this.addMove(newMove);
      }
    }

    if (shortPossible) {
      let isEmpty = true;
      const targetIndex = startIndex + 2;
      for (let index = startIndex + 1; index < rookPositions[1]; index++) {
        const shouldBeEmptyPiece = this.boardData.squares[index];
        if (shouldBeEmptyPiece != 0) {
          isEmpty = false;
          break;
        }
        // is empty - check now if attack opponent attacks this index - only for index where king is moving
        if (startIndex < index && index <= targetIndex) {
          if (this.boardData.opponentLegalMoves.hasAnyMoveToIndex(index)) {
            console.log("Castling not allowed due to attack on " + index);
            isEmpty = false;
            break;
          }
        }
      }
      if (
        isEmpty &&
        this.boardData.opponentLegalMoves.hasAnyMoveToIndex(startIndex)
      ) {
        isEmpty = false;
        console.log(
          "Castling not allowed due because King " + startIndex + " is in check"
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
        this.addMove(newMove);
      }
    }
  }

  generateKingMoves(startIndex, piece, color) {
    const oppositeColor = color ^ Piece.COLOR_MASK;
    for (let i = 0; i < directionOffsets.length; i++) {
      const targetIndex = startIndex + directionOffsets[i];
      const pieceOnTargetIndex = this.boardData.squares[targetIndex];
      const pieceOnTargetIndexColor = pieceOnTargetIndex & Piece.COLOR_MASK;
      if (pieceOnTargetIndexColor === color) {
        // skip
      } else if (pieceOnTargetIndexColor === oppositeColor) {
        this.addMove(new Move(this.boardData, startIndex, targetIndex, true));
      } else {
        this.addMove(new Move(this.boardData, startIndex, targetIndex, false));
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
    const grid = this.boardData.indexToGrid(startIndex);
    for (let i = 0; i < knightsDirectionOffsetsYX.length; i++) {
      const knightsGridDiff = knightsDirectionOffsetsYX[i];
      const newY = grid.gridY + knightsGridDiff[0];
      const newX = grid.gridX + knightsGridDiff[1];
      if (0 <= newY && newY < 8 && 0 <= newX && newX < 8) {
        const targetIndex = newY * 8 + newX;
        const pieceOnTargetIndex = this.boardData.squares[targetIndex];
        const pieceOnTargetIndexColor = pieceOnTargetIndex & Piece.COLOR_MASK;
        if (pieceOnTargetIndexColor === color) {
          // skip
        } else if (pieceOnTargetIndexColor === oppositeColor) {
          this.addMove(new Move(this.boardData, startIndex, targetIndex, true));
        } else {
          this.addMove(
            new Move(this.boardData, startIndex, targetIndex, false)
          );
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
    const grid = this.boardData.indexToGrid(startIndex);
    // move 2
    if (grid.gridY === startPawnIndex) {
      const newY = grid.gridY + 2 * directionOffsetY;
      const newX = grid.gridX;
      if (0 <= newY && newY < 8 && 0 <= newX && newX < 8) {
        const targetIndex = newY * 8 + newX;
        const enPassantTargetIndex = (newY - directionOffsetY) * 8 + newX;
        if (0 <= targetIndex && targetIndex < 64) {
          const pieceOnTargetIndex = this.boardData.squares[targetIndex];
          const pieceOnTargetIndexColor = pieceOnTargetIndex & Piece.COLOR_MASK;
          if (pieceOnTargetIndexColor === 0) {
            const newMove = new Move(
              this.boardData,
              startIndex,
              targetIndex,
              false,
              undefined,
              enPassantTargetIndex
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
        const pieceOnTargetIndex = this.boardData.squares[targetIndex];
        const pieceOnTargetIndexColor = pieceOnTargetIndex & Piece.COLOR_MASK;
        if (pieceOnTargetIndexColor === 0) {
          const newMove = new Move(
            this.boardData,
            startIndex,
            targetIndex,
            false
          );
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
        const pieceOnTargetIndex = this.boardData.squares[targetIndex];
        const pieceOnTargetIndexColor = pieceOnTargetIndex & Piece.COLOR_MASK;
        if (pieceOnTargetIndexColor === oppositeColor) {
          const newMove = new Move(
            this.boardData,
            startIndex,
            targetIndex,
            true
          );
          this.addMove(newMove);
        } else if (pieceOnTargetIndexColor === 0) {
          // check for en-passang
          newY = grid.gridY;
          newX = grid.gridX + dirX;
          if (0 <= newY && newY < 8 && 0 <= newX && newX < 8) {
            const targetEnPIndex = newY * 8 + newX;
            const pieceEnPOnTargetIndex =
              this.boardData.squares[targetEnPIndex];
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
                this.addMove(newMove);
              }
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
      const distanceToTarget = distanceToEdge[startIndex][directionIndex];
      if (distanceToTarget) {
        let n = 0;
        const inc = Math.sign(distanceToTarget);
        do {
          const targetIndex =
            startIndex + directionOffsets[directionIndex] * (Math.abs(n) + 1);
          if (0 <= targetIndex && targetIndex < 64) {
            const pieceOnTargetIndex = this.boardData.squares[targetIndex];
            const pieceOnTargetIndexColor =
              pieceOnTargetIndex & Piece.COLOR_MASK;
            if (pieceOnTargetIndexColor === color) {
              break;
            }
            if (pieceOnTargetIndexColor === oppositeColor) {
              this.addMove(
                new Move(this.boardData, startIndex, targetIndex, true)
              );
              break;
            } else {
              this.addMove(
                new Move(this.boardData, startIndex, targetIndex, false)
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

  removePseudoIllegalMovesSelectedKing(legalMovesForSelectedIndex) {
    const movesToKeep = [];
    for (const moveOfKing of legalMovesForSelectedIndex) {
      // check if any opponent move target at the legal move target
      let hasAnyCheck = this.boardData.opponentLegalMoves.hasAnyMoveToIndex(
        moveOfKing.to
      );
      if (!hasAnyCheck) {
        movesToKeep.push(moveOfKing);
      }
    }
    return movesToKeep;
  }

  removePseudoIllegalMoves(movesToCheck) {
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
    console.table(movesToKeep);

    // check which are moves that are in attack by opponent
    // opponent.to == movesOfTheKing.to
    for (const moveOfKing of movesOfTheKing) {
      const kingsTargetInAttackLineNotAllowed =
        this.checkAttackIndexes.includes(moveOfKing.to);
      if (!kingsTargetInAttackLineNotAllowed) {
        for (const opponentMove of this.boardData.opponentLegalMoves.moves) {
          if (moveOfKing.to !== opponentMove.to) {
            if (
              movesToKeep.find(
                (x) => x.from === moveOfKing.from && x.to === moveOfKing.to
              ) === undefined
            ) {
              movesToKeep.push(moveOfKing);
            }
          }
        }
      }
    }
    console.table(movesToKeep);
    this.moves = movesToKeep;
  }
}
