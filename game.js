class Game {
  constructor(w, h, padding, paddingTop, paddingBottom, fen) {
    this.h = h;
    this.w = w;
    this.x = padding;
    this.y = paddingTop;
    this.padding = padding;
    this.paddingTop = paddingTop;
    this.paddingBottom = paddingBottom;
    this.board = new Board(this.x, this.y, this.w, this.h, fen);

    this.color = this.board.data.legalMoves.color;
    const v = verbose;
    verbose = 0;
    this.board.data.setLegalMovesFor(this.color);
    verbose = v;
    // needs a two pass because of castling rules and no opponent data is there
    this.board.data.setLegalMovesFor(this.color);

    this.computerBlack = evaluators.newPlayerOff(
      computerName,
      this.board.data,
      Piece.BLACK
    ).on();
    this.computerWhite = evaluators.newPlayerOff(
      computerName,
      this.board.data,
      Piece.WHITE
    );

    this.velocity = 0.02;
    this.time = 0.0;
  }

  draw() {
    this.board.draw();
    let turnText =
      this.color === Piece.WHITE
        ? "WHITE's turn" +
          (this.computerWhite.isOn()
            ? "(AI)" // (" + this.computerWhite.name + ")"
            : "")
        : "BLACK's turn" +
          (this.computerBlack.isOn()
            ? " (AI)" // (" + this.computerBlack.name + ")"
            : "");
    if (this.board.check) {
      turnText += " CHECK";
    }
    if (this.board.data.isFinished()) {
      turnText = this.board.data.result;
      fill("red");
      rect(this.x, this.y - this.paddingTop, this.w, this.paddingTop);
    }
    const fontSize = this.w > 600 ? 40 : this.w > 400 ? 30 : 20;
    textSize(fontSize);
    fill("white");
    textAlign(CENTER);
    text(
      turnText,
      this.x + this.w / 2,
      this.y - this.paddingTop + this.paddingTop / 2 + (fontSize - 10) / 2
    );
    if (!this.board.data.isFinished()) {
      if (this.time > 1.0) {
        const movedBlack = this.computerMoveNow(this.computerBlack, 0);
        const movedWhite = this.computerMoveNow(this.computerWhite, 0);
        if (
          !movedWhite &&
          !movedBlack &&
          this.computerBlack.isOn() &&
          this.computerWhite.isOn()
        ) {
          this.computerWhite.isTurn(this.color);
        }
        this.time = 0;
      }
      this.time += this.velocity;
    }
  }

  undoLastMove() {
    let lastMove = this.board.undoLastMove();
    if (lastMove && this.nextComputer().isOn()) {
      lastMove = this.board.undoLastMove();
      if (lastMove) {
        // change already to change back to the same again if opponent is auto
        this.changeTurn();
      }
    }
    if (lastMove) {
      this.makeTurnAndCalculate(0);
    }
  }

  makeTurnAndCalculate(depth) {
    this.changeTurn();
    this.board.data.setLegalMovesFor(this.color);
    const fen = this.board.data.calculatedFen();
    const fenHTML = window.document.getElementById("fen");
    if (fenHTML) {
      fenHTML.value = fen;
      window.location.hash = fen;
    }
    this.computerMove(undefined, depth + 1);
  }

  makeMove(move, depth) {
    this.board.makeMove(move, true);
    this.makeTurnAndCalculate(depth);
  }

  setTimeLastMove(startTime) {
    const endTime = performance.now();
    const timeLastMove = window.document.getElementById("timeLastMove");
    if (timeLastMove) {
      timeLastMove.innerHTML = `${
        Math.floor((endTime - startTime) * 10) / 10
      } ms`;
    }
  }

  clicked(clientY, clientX) {
    const startTime = performance.now();
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
    this.setTimeLastMove(startTime);
    return false;
  }

  changeTurn() {
    this.color = this.color === Piece.WHITE ? Piece.BLACK : Piece.WHITE;
  }

  currentComputer() {
    return this.color === Piece.WHITE ? this.computerWhite : this.computerBlack
  }
  nextComputer() {
    return this.color === Piece.WHITE ? this.computerBlack : this.computerWhite
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
