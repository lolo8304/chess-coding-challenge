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
const MAX_DEPTH = 2;
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

function fenHash() {
  if (typeof fen_hash !== "undefined") {
    return fen_hash;
  } else {
    return undefined;
  }
}
const FEN_start = fenHash()
  ? fenHash()
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

const PieceEvaluations = {};
PieceEvaluations[Piece.PAWN] = 100;
PieceEvaluations[Piece.KNIGHT] = 300;
PieceEvaluations[Piece.BISHOP] = 320;
PieceEvaluations[Piece.ROOK] = 500;
PieceEvaluations[Piece.QUEEN] = 900;

const PieceEvaluationsHighValuePiecesForHits = [Piece.QUEEN, Piece.ROOK];

function getPieceTypeValue(pieceType) {
  return PieceEvaluations[pieceType] || 0;
}

if (typeof module !== "undefined") {
  module.exports = {
    Piece,
  };
}

class PieceSquareTable {
  static Pawns = [
    0, 0, 0, 0, 0, 0, 0, 0, 50, 50, 50, 50, 50, 50, 50, 50, 10, 10, 20, 30, 30,
    20, 10, 10, 5, 5, 10, 25, 25, 10, 5, 5, 0, 0, 0, 20, 20, 0, 0, 0, 5, -5,
    -10, 0, 0, -10, -5, 5, 5, 10, 10, -20, -20, 10, 10, 5, 0, 0, 0, 0, 0, 0, 0,
    0,
  ];

  static Rooks = [
    0, 0, 0, 0, 0, 0, 0, 0, 5, 10, 10, 10, 10, 10, 10, 5, -5, 0, 0, 0, 0, 0, 0,
    -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0, 0, -5, -5, 0, 0, 0, 0, 0,
    0, -5, -5, 0, 0, 0, 0, 0, 0, -5, 0, 0, 0, 5, 5, 0, 0, 0,
  ];

  static Knights = [
    -50, -40, -30, -30, -30, -30, -40, -50, -40, -20, 0, 0, 0, 0, -20, -40, -30,
    0, 10, 15, 15, 10, 0, -30, -30, 5, 15, 20, 20, 15, 5, -30, -30, 0, 15, 20,
    20, 15, 0, -30, -30, 5, 10, 15, 15, 10, 5, -30, -40, -20, 0, 5, 5, 0, -20,
    -40, -50, -40, -30, -30, -30, -30, -40, -50,
  ];
  static Bishops = [
    -20, -10, -10, -10, -10, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0,
    5, 10, 10, 5, 0, -10, -10, 5, 5, 10, 10, 5, 5, -10, -10, 0, 10, 10, 10, 10,
    0, -10, -10, 10, 10, 10, 10, 10, 10, -10, -10, 5, 0, 0, 0, 0, 5, -10, -20,
    -10, -10, -10, -10, -10, -10, -20,
  ];
  static Queens = [
    -20, -10, -10, -5, -5, -10, -10, -20, -10, 0, 0, 0, 0, 0, 0, -10, -10, 0, 5,
    5, 5, 5, 0, -10, -5, 0, 5, 5, 5, 5, 0, -5, 0, 0, 5, 5, 5, 5, 0, -5, -10, 5,
    5, 5, 5, 5, 0, -10, -10, 0, 5, 0, 0, 0, 0, -10, -20, -10, -10, -5, -5, -10,
    -10, -20,
  ];
  static KingStart = [
    -80, -70, -70, -70, -70, -70, -70, -80, -60, -60, -60, -60, -60, -60, -60,
    -60, -40, -50, -50, -60, -60, -50, -50, -40, -30, -40, -40, -50, -50, -40,
    -40, -30, -20, -30, -30, -40, -40, -30, -30, -20, -10, -20, -20, -20, -20,
    -20, -20, -10, 20, 20, -5, -5, -5, -5, 20, 20, 20, 30, 10, 0, 0, 10, 30, 20,
  ];

  static KingEnd = [
    -20, -10, -10, -10, -10, -10, -10, -20, -5, 0, 5, 5, 5, 5, 0, -5, -10, -5,
    20, 30, 30, 20, -5, -10, -15, -10, 35, 45, 45, 35, -10, -15, -20, -15, 30,
    40, 40, 30, -15, -20, -25, -20, 20, 25, 25, 20, -20, -25, -30, -25, 0, 0, 0,
    0, -25, -30, -50, -30, -30, -30, -30, -30, -30, -50,
  ];

  static {
    this.Tables = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const whiteIndex = 0;
    const blackIndex = 8;
    this.Tables[Piece.PAWN + whiteIndex] = this.Pawns;
    this.Tables[Piece.ROOK + whiteIndex] = this.Rooks;
    this.Tables[Piece.KNIGHT + whiteIndex] = this.Knights;
    this.Tables[Piece.BISHOP + whiteIndex] = this.Bishops;
    this.Tables[Piece.QUEEN + whiteIndex] = this.Queens;

    this.Tables[Piece.PAWN + blackIndex] = this.getFlippedTable(this.Pawns);
    this.Tables[Piece.ROOK + blackIndex] = this.getFlippedTable(this.Rooks);
    this.Tables[Piece.KNIGHT + blackIndex] = this.getFlippedTable(this.Knights);
    this.Tables[Piece.BISHOP + blackIndex] = this.getFlippedTable(this.Bishops);
    this.Tables[Piece.QUEEN + blackIndex] = this.getFlippedTable(this.Queens);
  }

  static getFlippedTable(table) {
    const flippedTable = Array(table.length).fill(0);
    for (let i = 0; i < table.length; i++) {
      const rank = 7 - Math.floor(i / 8);
      const file = i % 8;
      const flippedIndex = rank * 8 + file;
      flippedTable[flippedIndex] = table[i];
    }
    return flippedTable;
  }

  static read(table, square, isWhite) {
    if (isWhite) {
      const file = square % 8;
      const rank = Math.floor(square / 8);
      const flippedRank = 7 - rank;
      square = flippedRank * 8 + file;
    }
    return table[square];
  }
}

function IndexToCoord(index) {
  const rank = 7 - Math.floor(index / 8);
  const file = index % 8;
  return {
    index,
    rankIndex: rank,
    y: rank,
    fileIndex: file,
    x: file,
  };
}
function CoordToIndex(coord) {
  return coord.rankIndex * 8 + coord.fileIndex;
}

const OrthogonalDistance = Array.from({ length: 64 }, () => Array(64).fill(0));
const CentreManhattanDistance = Array.from({ length: 64 }, () => 0);
const KingDistance = Array.from({ length: 64 }, () => Array(64).fill(0));

for (let indexA = 0; indexA < 64; indexA++) {
  const coordA = IndexToCoord(indexA);
  const fileDstFromCentre = Math.max(
    3 - coordA.fileIndex,
    coordA.fileIndex - 4
  );
  const rankDstFromCentre = Math.max(
    3 - coordA.rankIndex,
    coordA.rankIndex - 4
  );
  CentreManhattanDistance[indexA] = fileDstFromCentre + rankDstFromCentre;

  for (let indexB = 0; indexB < 64; indexB++) {
    const coordB = IndexToCoord(indexB);
    const rankDistance = Math.abs(coordA.rankIndex - coordB.rankIndex);
    const fileDistance = Math.abs(coordA.fileIndex - coordB.fileIndex);
    OrthogonalDistance[indexA][indexB] = rankDistance + fileDistance;
    KingDistance[indexA][indexB] = Math.max(rankDistance, fileDistance);
  }
}
