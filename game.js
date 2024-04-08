class Game {
  constructor(w, h, padding, paddingTop, paddingBottom) {
    this.h = h - paddingTop - paddingBottom;
    this.w = w - 2 * padding;
    this.x = (W - this.w) / 2.0;
    this.y = paddingTop;
    this.padding = padding;
    this.paddingTop = paddingTop;
    this.paddingBottom = paddingBottom;
    this.board = new Board(this.x, this.y, this.w, this.h);
    this.color = Piece.WHITE;
  }

  draw() {
    this.board.draw();
    textSize(40);
    fill("white");
    textAlign(CENTER);
    const turnText =
      this.color === Piece.WHITE ? "WHITE's turn" : "BLACK's turn";
    text(turnText, this.x + this.w / 2, this.y - this.paddingTop + 50);
  }

  drawBoad() {
    this.board.draw();
  }

  clicked(clientY, clientX) {
    const selectedIndex = this.board.selectedIndex;
    if (selectedIndex >= 0) {
      const clickedCell = this.board.clickedCell(clientY, clientX);
      if (clickedCell.index != selectedIndex) {
        this.board.makeMove(selectedIndex, clickedCell.index);
        this.changeTurn();
      }
    } else {
      const clickedCellForTurn = this.board.clickedCellByColor(
        clientY,
        clientX,
        this.color
      );
      if (clickedCellForTurn) {
        this.board.clickedToString(clientY, clientX);
        this.board.selectCellIndex(clickedCellForTurn.index);
      }
    }
    return false;
  }

  changeTurn() {
    this.color = this.color === Piece.WHITE ? Piece.BLACK : Piece.WHITE;
  }
}
