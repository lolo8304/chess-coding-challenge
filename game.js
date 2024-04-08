class Game {
  constructor(w, h) {
    this.h = h;
    this.w = w;
    this.x = (W - this.w) / 2.0;
    this.y = PADDING;
    this.board = new Board(this.x, this.y, this.w, this.h);
    this.color = Piece.WHITE;
  }

  draw() {
    this.board.draw();
    textSize(40);
    fill("white");
    textAlign(CENTER);
    const turnText = this.color === Piece.WHITE ? "WHITE's turn" : "BLACK's turn"
    text(turnText, this.x + this.w/2, this.y + this.h+50);
  }

  drawBoad() {
    this.board.draw();
  }

  clicked(clientY, clientX) {
    const selectedIndex = this.board.selectedIndex
    if (selectedIndex >= 0) {
      const clickedCell = this.board.clickedCell(clientY, clientX);
      if (clickedCell.index != selectedIndex) {
        this.board.makeMove(selectedIndex, clickedCell.index)
        this.changeTurn();  
      }

    } else {
      const clickedCellForTurn = this.board.clickedCellByColor(clientY, clientX, this.color);
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
