let W = 300;
let H = 500;
const PADDING = 5;
const PADDING_TOP = 60 + PADDING;
const PADDING_BOTTOM = PADDING;
let CELL_SIZE = 20; //px
const COL_CELLS = 8; // count
const ROW_CELLS = 8; // count
const COL_CELLS_AND_BOUNDARY = COL_CELLS;
const ROW_CELLS_AND_BOUNDARY = ROW_CELLS;

let verbose = 1; // 1 - default log, 2 - moves logs

let cnv;
let startScreen;
let game;

let buttons = {};

let useStartScreen = false;
let isGameFinished = false;

let imgSprite;
let imgFigures = [];

let fen_hash = window.location.hash.substring(1).replace(/%20/g, " ");
let computerName;

function createTButton(title, name) {
  const newButton = createButton(title, name);
  newButton.style("display", "none");
  buttons[name] = newButton;
}

function button(name) {
  return buttons[name];
}

function enableButton(name, x, y, callback) {
  const btn = buttons[name];
  btn.position(x, y);
  btn.style("display", "block");
  btn.mousePressed(() => {
    callback.apply();
    return false;
  });
}

function disableButton(name) {
  const btn = buttons[name];
  btn.style("display", "none");
  btn.mousePressed(() => {});
}

function preload() {
  imgSprite = loadImage("images/Chess_Pieces_Sprite-large.png");
}

function resizeIfNeeded() {
  W = windowWidth;
  H = windowHeight;

  let cellSizeW = Math.floor((W - 2 * PADDING) / COL_CELLS_AND_BOUNDARY);
  let cellSizeH = Math.floor(
    (H - 2 * PADDING - PADDING_BOTTOM - PADDING_TOP) / ROW_CELLS_AND_BOUNDARY
  );
  if (cellSizeW > cellSizeH) {
    W = windowWidth;
    H = windowHeight - 150;
    cellSizeW = Math.floor((W - 2 * PADDING) / COL_CELLS_AND_BOUNDARY);
    cellSizeH = Math.floor(
      (H - 2 * PADDING - PADDING_BOTTOM - PADDING_TOP) / ROW_CELLS_AND_BOUNDARY
    );
  }

  CELL_SIZE = Math.min(cellSizeH, cellSizeW);
  W = CELL_SIZE * ROW_CELLS + 2 * PADDING;
  H = CELL_SIZE * ROW_CELLS + 2 * PADDING + PADDING_BOTTOM + PADDING_TOP;
  resizeCanvas(W, H);
}

function resizeFinalize() {
  game = new Game(
    CELL_SIZE * COL_CELLS_AND_BOUNDARY,
    CELL_SIZE * ROW_CELLS_AND_BOUNDARY,
    PADDING,
    PADDING_TOP,
    PADDING_BOTTOM,
    fen_hash
  );
}

function reset() {
  useStartScreen = false;
  isGameFinished = false;
}

function clickedInCanvas(event) {
  return game.clicked(event.clientY, event.clientX);
}

function undoLastMove() {
  game.undoLastMove();
}

function testMoves(callbackStats) {
  console.log("Start test move calculation:");
  maxDepth = 2;
  for (let depth = 1; depth < maxDepth + 1; depth++) {
    const startTime = performance.now();
    const numPositions = game.board.data.testMoves(depth);
    const diffTime = Math.round(performance.now() - startTime);
    console.log(
      "Depth: " +
        depth +
        " ply Result: " +
        numPositions +
        " Time " +
        diffTime +
        " ms"
    );
    callbackStats(depth, numPositions)
  }
}

function getElementByValue(tag, value) {
  const elems = [].filter.call(
    document.getElementsByTagName(tag),
    function (input) {
      return input.value === value;
    }
  );
  return elems[0];
}

function windowResized() {
  fen_hash = window.location.hash.substring(1).replace(/%20/g, " ");
  resizeCanvas(windowWidth, windowHeight);
  resizeIfNeeded();
  resizeFinalize();
}

function uuidv4() {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c == "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function setup() {
  const piecesInImage = [
    Piece.KING,
    Piece.QUEEN,
    Piece.BISHOP,
    Piece.KNIGHT,
    Piece.ROOK,
    Piece.PAWN,
  ];
  boardSetupStatic();
  imgFigures = new Array(12);
  const pixels = 45 * 5;
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 6; x++) {
      const figure = createImage(pixels, pixels);
      // The arguments are: source image, source x, source y, source width, source height, dest x, dest y, dest width, dest height
      figure.copy(
        imgSprite,
        pixels * x,
        pixels * y,
        pixels,
        pixels,
        0,
        0,
        pixels,
        pixels
      );
      const index = 6 * y + piecesInImage[x] - 1;
      imgFigures[index] = figure;
    }
  }

  resizeIfNeeded();
  cnv = createCanvas(W, H);
  cnv.mouseClicked(clickedInCanvas);
  resizeFinalize();
}

function draw() {
  background("black");
  game.draw();
  fill("red");
  rect(W, H);
}
