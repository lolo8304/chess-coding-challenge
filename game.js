// Check if the code is running in Node.js
if (typeof window === "undefined") {
  // Use dynamic import in Node.js
  import("./board.js")
    .then((pkg) => {
      Board = pkg.Board;
    })
    .catch((err) => {
      console.error("Failed to load the board module:", err);
    });
}
const GAME_CLOCK_START_MILLISECONDS = 10 * 60 * 1000;

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

    this.computerBlack = evaluators
      .newPlayerOff(computerName, this.board.data, Piece.BLACK)
      .on();
    this.computerWhite = evaluators.newPlayerOff(
      computerName,
      this.board.data,
      Piece.WHITE
    );

    this.velocity = 0.02;
    this.time = 0.0;
    this.clockStartMilliseconds = GAME_CLOCK_START_MILLISECONDS;
    this.clockRemainingMilliseconds = {
      [Piece.WHITE]: this.clockStartMilliseconds,
      [Piece.BLACK]: this.clockStartMilliseconds,
    };
    this.clockRunningColor = undefined;
    this.clockTurnStartMilliseconds = this.nowMilliseconds();
  }

  draw() {
    this.board.draw();
    if (typeof updateConsolePhase === "function") {
      updateConsolePhase();
    }
    this.syncClockToPhase();
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
    const clockFontSize = this.w > 600 ? 22 : this.w > 400 ? 18 : 14;
    const bannerMiddleY =
      this.y - this.paddingTop + this.paddingTop / 2 + (fontSize - 10) / 2;
    const clockY =
      this.y -
      this.paddingTop +
      this.paddingTop / 2 +
      (clockFontSize - 10) / 2;
    textSize(fontSize);
    fill("white");
    textAlign(CENTER);
    text(turnText, this.x + this.w / 2, bannerMiddleY);
    this.drawClock(Piece.WHITE, "left", this.x + this.padding, clockY);
    this.drawClock(
      Piece.BLACK,
      "right",
      this.x + this.w - this.padding,
      clockY
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

  nowMilliseconds() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  isEndPhase() {
    return this.effectivePhase() === "end";
  }

  effectivePhase() {
    if (typeof effectiveGamePhase === "function") {
      return effectiveGamePhase();
    }
    return this.board.data.isFinished() ? "end" : "play";
  }

  syncClockToPhase() {
    const phase = this.effectivePhase();
    if (phase !== "play") {
      this.stopActiveClock();
      return;
    }
    if (this.clockRunningColor !== this.color) {
      this.stopActiveClock();
      this.startClock(this.color);
    }
  }

  remainingMilliseconds(color) {
    let remaining = this.clockRemainingMilliseconds[color];
    if (this.clockRunningColor === color) {
      remaining -= this.nowMilliseconds() - this.clockTurnStartMilliseconds;
    }
    return Math.max(0, remaining);
  }

  formatClockMilliseconds(milliseconds) {
    const totalSeconds = Math.ceil(milliseconds / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  }

  drawClock(color, align, x, y) {
    const label = this.formatClockMilliseconds(this.remainingMilliseconds(color));
    const clockFontSize = this.w > 600 ? 22 : this.w > 400 ? 18 : 14;
    fill("white");
    textSize(clockFontSize);
    textAlign(CENTER);
    const clockHalfWidth = clockFontSize * 1.5;
    const alignedX = align === "left" ? x + clockHalfWidth : x - clockHalfWidth;
    text(label, alignedX, y);
  }

  stopActiveClock() {
    if (this.clockRunningColor === undefined) return;
    const color = this.clockRunningColor;
    this.clockRemainingMilliseconds[color] = this.remainingMilliseconds(color);
    this.clockRunningColor = undefined;
  }

  startClock(color) {
    if (this.isEndPhase()) {
      this.clockRunningColor = undefined;
      return;
    }
    this.clockRunningColor = color;
    this.clockTurnStartMilliseconds = this.nowMilliseconds();
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
    if (typeof updateConsolePhase === "function") {
      updateConsolePhase();
    }
  }

  makeTurnAndCalculate(depth, runComputerNow = true) {
    this.changeTurn();
    this.board.data.setLegalMovesFor(this.color);
    const fen = this.board.data.calculatedFen();
    const fenHTML = window.document.getElementById("fen");
    if (fenHTML) {
      fenHTML.value = fen;
      window.location.hash = fen;
    }
    this.startClock(this.color);
    if (runComputerNow) {
      this.computerMove(undefined, depth + 1);
    } else {
      this.computerMove(undefined, 2);
      this.time = 1.01;
    }
  }

  makeMove(move, depth, runComputerNow = true) {
    if (typeof setGamePhase === "function") {
      setGamePhase("play");
    }
    this.stopActiveClock();
    this.board.makeMove(move, true);
    this.makeTurnAndCalculate(depth, runComputerNow);
    if (typeof updateConsolePhase === "function") {
      updateConsolePhase();
    }
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
        this.makeMove(validMove, 0, false);
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
          if (typeof setGamePhase === "function") {
            setGamePhase("play");
          }
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
    return this.color === Piece.WHITE ? this.computerWhite : this.computerBlack;
  }
  nextComputer() {
    return this.color === Piece.WHITE ? this.computerBlack : this.computerWhite;
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
