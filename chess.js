let W = 300;
let H = 500;
const PADDING = 5;
const PADDING_BOTTOM = 28 * PADDING;
let CELL_SIZE = 20; //px
const COL_CELLS = 8; // count
const ROW_CELLS = 8; // count
const COL_CELLS_AND_BOUNDARY = COL_CELLS;
const ROW_CELLS_AND_BOUNDARY = ROW_CELLS;

let cnv;
let startScreen;
let game;

let buttons = {};

let useStartScreen = false;
let isGameFinished = false;

let imgSprite;
let imgFigures = [];

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

  const cellSizeW = (W - 2 * PADDING) / COL_CELLS_AND_BOUNDARY;
  const cellSizeH = (H - 2 * PADDING) / ROW_CELLS_AND_BOUNDARY;

  CELL_SIZE = Math.min(cellSizeH, cellSizeW);
}

function resizeFinalize() {
  game = new Game(
    CELL_SIZE * COL_CELLS_AND_BOUNDARY,
    CELL_SIZE * ROW_CELLS_AND_BOUNDARY
  );
}

function reset() {
  useStartScreen = false;
  isGameFinished = false;
}

function clickedInCanvas() {
  return false;
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
  imgFigures = new Array(12);
  const pixels = 45 * 5;
  for (let y = 0; y < 2; y++) {
    for (let x = 0; x < 6; x++) {
      const figure = createImage(pixels, pixels);
      // The arguments are: source image, source x, source y, source width, source height, dest x, dest y, dest width, dest height
      figure.copy(imgSprite, pixels * x, pixels * y, pixels, pixels, 0, 0, pixels, pixels);
      const index = 6 * y + piecesInImage[x] - 1;
      imgFigures[index] = figure;
      console.log("Pos: x="+x+" y="+y+" piece="+(piecesInImage[x])+" index="+index)
    }
  }
  
  resizeIfNeeded();
  cnv = createCanvas(W, H);
  cnv.mouseClicked(clickedInCanvas);
  resizeFinalize();
}

function draw() {
  background('black');
  game.draw();
  fill("red");
  rect(W, H);
}
