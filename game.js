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

    this.computerBlack = new ComputerPlayerRandomHitFirst(
      this.board.data,
      Piece.BLACK
    ).on();
    this.computerWhite = new ComputerPlayerRandomHitFirst(
      this.board.data,
      Piece.WHITE
    ).off();
    this.velocity = 0.1;
    this.time = 0.0;
  }

  draw() {
    this.board.draw();
    textSize(40);
    fill("white");
    textAlign(CENTER);
    let turnText = this.color === Piece.WHITE ? "WHITE's turn"+(this.computerWhite.isOn() ? " (Computer)" : "") : "BLACK's turn"+(this.computerBlack.isOn() ? " (Computer)" : "");
    if (this.board.check) {
      turnText += " CHECK";
    }
    text(turnText, this.x + this.w / 2, this.y - this.paddingTop + 50);
    if (this.time > 1.0) {
      const movedBlack = this.computerMoveNow(this.computerBlack, 0);
      const movedWhite = this.computerMoveNow(this.computerWhite, 0);
      if (!movedWhite && !movedBlack && this.computerBlack.isOn() && this.computerWhite.isOn()) {
        this.computerWhite.isTurn(this.color);
      }
      this.time = 0;
    }
    this.time += this.velocity;
  }

  drawBoad() {
    this.board.draw();
  }

  makeMove(move, depth) {
    this.board.makeMove(move);
    this.changeTurn();
    this.board.data.setLegalMovesFor(this.color);
    this.computerMove(undefined, depth + 1);
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
        this.makeMove(validMove, 0);
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
      //skip
    }
  }

  computerMoveNow(computer, depth) {
    if (computer.isOn() && computer.shallRunNext()) {
      const computerMove = computer.chooseMove();
      if (computerMove) {
        this.makeMove(computerMove, depth);
        return true;
      }
    }
    return false;
  }

  computerMove(computer, depth) {
    if (!computer) {
      // must call isTurn - to calculate next run in draw
      const isWhiteTurn = this.computerWhite.isTurn(this.color);
      this.computerBlack.isTurn(this.color);
      computer = isWhiteTurn ? this.computerWhite : this.computerBlack;
    }
    if (depth > 1) return false;
    return this.computerMoveNow(computer, depth);
  }
}
