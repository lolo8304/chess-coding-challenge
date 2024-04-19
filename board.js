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
    this.resetSquares(fen);
    this.selectedIndex = NOT_SELECTED;
    this.selectCellIndex(NOT_SELECTED);
    this.legalMoves = new LegalMoves(Piece.WHITE, this, this.history);
    this.opponentLegalMoves = new LegalMoves(Piece.BLACK, this, this.history);
    this.enPassantPawns = [];
  }

  selectCellIndex(index) {
    this.selectedIndex = index;
  }

  // rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1
  resetSquares(fen) {
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
    if (this.selectedIndex != NOT_SELECTED) {
      this.legalMovesForSelectedIndex = this.legalMoves.getMovesFrom(
        this.selectedIndex
      );
    }
    //for (const move of this.opponentLegalMoves.moves) {
    //  this.debuggingIndexes.push(move);
    //}
    if (this.amIunderCheck()) {
      this.check = true;
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
  amIunderCheck() {
    return this.opponentLegalMoves.hasMoveForMyKing();
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
    //if (this.enPassantPawns.includes(index)) return "green";
    const found = this.debuggingIndexes.find((x) => x.to === index);
    if (!found) return undefined;
    if (found.to === index) return "red";
    return "black";
  }

  isLegalEnPassant(targetEnPassant) {
    return this.enPassantPawns.includes(targetEnPassant);
  }
}

class Board {
  constructor(x, y, w, h) {
    this.h = h;
    this.w = w;
    this.x = x;
    this.y = y;
    this.history = new History();
    this.data = new BoardData(this.history);
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
    return this.data.legalMovesForSelectedIndex.find((x) => x.to === targetIndex && (!index || x.from === index));
  }
  hasPossibleMoveForIndex(index) {
    if (this.data.selectedIndex != -1) return false;
    return this.data.legalMoves.hasAnyMoveForIndex(index);
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

    const debugColor = this.data.debugIndexColor(index);
    if (debugColor) {
      if (debugColor === "red") fill("rgba(255, 0, 0, 0.4)");
      if (debugColor === "blue") fill("rgba(0, 0, 153, 0.4)");
      if (debugColor === "cyan") fill("rgba(0, 255, 255, 0.4)");
      if (debugColor === "orange") fill("rgba(255, 153, 51, 0.4)");
      if (debugColor === "green") fill("rgba(0, 255, 0, 0.8)");
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
    const hasPossibleMove = this.hasPossibleMoveForIndex(index);
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
    this.data.enPassantPawns = [];
    if (move.isEnPassantAttackable()) {
      this.data.enPassantPawns.push(move.to);
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
      this.data.enPassantPawns = this.data.enPassantPawns.filter(
        (x) => x != move.enPassant
      );
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
    castlingKingTargetIndex = undefined,
    castlingRookStartIndex = undefined,
    castlingRookTargetIndex = undefined
  ) {
    this.colorName = PieceNames[board.squares[from] & Piece.COLOR_MASK];
    this.pieceName = PieceNames[board.squares[from] & Piece.PIECES_MASK];
    this.piece = board.squares[from];
    this.targetPiece = board.squares[to];
    this.board = board;
    this.from = from;
    this.to = to;
    this.isHit = isHit ? true : undefined;
    this.isCheck =
      isHit && (this.targetPiece & Piece.PIECES_MASK) === Piece.KING
        ? true
        : undefined;
    this.enPassant = enPassant; // enPassant
    this.castlingKingTargetIndex = castlingKingTargetIndex; // castling king - king position
    this.castlingRookStartIndex = castlingRookStartIndex; // castling king - rook position start
    this.castlingRookTargetIndex = castlingRookTargetIndex; // castling king - rook position target
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
}

class LegalMoves {
  constructor(color, boardData, history) {
    this.boardData = boardData;
    this.history = history;
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
    return this.getMovesFrom(index).length > 0;
  }
  hasAnyMoveToIndex(index) {
    return this.getMovesTo(index).length > 0;
  }

  addMove(move) {
    if (0 <= move.to && move.to < 64) {
      this.moves.push(move);
    }
  }

  hasMoveForMyKing() {
    const opponentColor = this.color ^ Piece.COLOR_MASK;
    const index = this.boardData.anyOfPiece(Piece.KING | opponentColor);
    console.log(
      "Index of my KING (" + PieceNames[opponentColor] + ")=" + index
    );
    return this.hasAnyMoveToIndex(index);
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

  generateCastlingKings(startIndex, piece, color) {
    if (this.history.hasMoved(piece)) return;
    const rookPiece = Piece.ROOK | color;
    const rookPositions = color === Piece.WHITE ? [56, 63] : [0, 7];

    const rookLongMoved = this.history.hasMovedFromIndex(
      rookPiece,
      rookPositions[0]
    );
    if (!rookLongMoved) {
      let isEmpty = true;
      for (let index = rookPositions[0] + 1; index < startIndex; index++) {
        const shouldBeEmptyPiece = this.boardData.squares[index];
        if (shouldBeEmptyPiece != 0) {
          isEmpty = false;
          break;
        }
      }
      if (isEmpty) {
        const targetIndex = rookPositions[0] + 2;
        const newMove = new Move(
          this.boardData,
          startIndex,
          targetIndex,
          false,
          undefined,
          targetIndex,
          rookPositions[0],
          targetIndex + 1
        );
        this.addMove(newMove);
      }
    }

    const rookShortMoved = this.history.hasMovedFromIndex(
      rookPiece,
      rookPositions[1]
    );
    if (!rookShortMoved) {
      let isEmpty = true;
      for (let index = startIndex + 1; index < rookPositions[1]; index++) {
        const shouldBeEmptyPiece = this.boardData.squares[index];
        if (shouldBeEmptyPiece != 0) {
          isEmpty = false;
          break;
        }
      }
      if (isEmpty) {
        const targetIndex = startIndex + 2;
        const newMove = new Move(
          this.boardData,
          startIndex,
          targetIndex,
          false,
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
}
