class Game {
  constructor(w, h) {
    this.h = h;
    this.w = w;
    this.x = (W - this.w) / 2.0;
    this.y = PADDING;
    this.board = new Board(this.x, this.y, this.w, this.h);
  }

  draw() {
    this.drawBoad();
  }

  drawBoad() {
    this.board.draw();
  }
}
