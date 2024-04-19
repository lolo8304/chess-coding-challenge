class Game {
  constructor(w, h, padding, paddingTop, paddingBottom) {
    this.h = h;
    this.w = w;
    this.x = padding;
    this.y = paddingTop;
    this.padding = padding;
    this.paddingTop = paddingTop;
    this.paddingBottom = paddingBottom;
    this.board = new Board(this.x, this.y, this.w, this.h);

    this.color = Piece.WHITE;
    this.board.data.setLegalMovesFor(this.color);

    this.computerBlack = new ComputerPlayerRandomHitFirst(this.board.data, Piece.BLACK).on();
    this.computerWhite = new ComputerPlayerRandomHitFirst(this.board.data, Piece.WHITE).off();
  }
  
  draw() {
    this.board.draw();
    textSize(40);
    fill("white");
    textAlign(CENTER);
    let turnText = this.color === Piece.WHITE ? "WHITE's turn" : "BLACK's turn";
    if (this.board.check) {
      turnText += " CHECK";
    }
    text(turnText, this.x + this.w / 2, this.y - this.paddingTop + 50);
    if (this.computerBlack.shallRunNext()) {
      this.computerMove(this.computerBlack);
    }
    if (this.computerWhite.shallRunNext()) {
      this.computerMove(this.computerWhite);
    }
  }

  drawBoad() {
    this.board.draw();
  }

  clicked(clientY, clientX) {
    const selectedIndex = this.board.data.selectedIndex;
    if (selectedIndex >= 0) {
      const clickedCell = this.board.clickedCell(clientY, clientX);
      const validMove = this.board.getPossibleMoveForTargetIndex(
        clickedCell.index,
        selectedIndex
      );
      if (clickedCell && clickedCell.index != selectedIndex && validMove) {
        this.board.makeMove(validMove);
        this.changeTurn();
        this.board.data.setLegalMovesFor(this.color);
        this.computerMoveBlack();
      } else {
        this.board.selectCellIndex(NOT_SELECTED);
        this.board.data.setLegalMovesFor(this.color);
      }
    } else {
      const clickedCellForTurn = this.board.clickedCellByColor(
        clientY,
        clientX,
        this.color
      );
      if (clickedCellForTurn) {
        const validMove = this.board.hasPossibleMoveForIndex(
          clickedCellForTurn.index
        );
        if (clickedCellForTurn && validMove) {
          this.board.clickedToString(clientY, clientX);
          this.board.selectCellIndex(clickedCellForTurn.index);
          this.board.data.setLegalMovesFor(this.color);
        }
      }
    }
    return false;
  }

  changeTurn() {
    this.color = this.color === Piece.WHITE ? Piece.BLACK : Piece.WHITE;
  }

  computerMoveBlack() {
    if (this.computerBlack.isOn() && this.computerBlack.isTurn(this.color)) {
      // skip
    }
  }
  computerMoveWhite() {
    if (this.computerWhite.isOn() && this.computerWhite.isTurn(this.color)) {
      //this.computerMove(this.computerWhite);
    }
  }
  computerMove(computer) {
    const computerMove = computer.chooseMove();
    if (computerMove) {
      this.board.makeMove(computerMove);
      this.changeTurn();
      this.board.data.setLegalMovesFor(this.color);
    }
  }
}
