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

function toFenChar(piece) {
  if (piece === 0) return "";
  let fenChar = PieceShortNamesLower[piece & Piece.PIECES_MASK];
  if ((piece & Piece.COLOR_MASK) === Piece.WHITE) {
    fenChar = fenChar.toUpperCase();
  }
  return fenChar;
}

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
