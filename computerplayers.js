class ComputerPlayerFactory {
  constructor() {
    this.factory = {};
  }

  addEvaluator(shortName, className) {
    this.factory[shortName] = className;
  }

  newPlayerOn(named, ...args) {
    return this.newPlayerOff(named, args).on()
  }
  newPlayerOff(named, ...args) {
    const className = this.factory[named];
    if (className && window[className]) {
      return new window[className](...args).off();
    }
    throw new Error(`Class ${className} named '${named}' not found`);
  }
}

class ComputerPlayer {
  constructor(boardData, color) {
    this.boardData = boardData;
    this.color = color;
    this._isOn = false;
    this.runNext = false;
  }

  isTurn(color) {
    if (!this._isOn) return false;
    const turn = this.color === color;
    this.runNext = turn;
    return turn;
  }

  shallRunNext() {
    return this.runNext;
  }

  chooseMove() {
    if (this.boardData.legalMoves.color === this.color) {
      return this.bestMove(this.boardData.legalMoves);
    }
    this.runNext = false;
    return undefined;
  }

  bestMove(legalMoves) {
    throw Error("Override to implement new Evaluations");
  }

  on() {
    this._isOn = true;
    return this;
  }
  off() {
    this._isOn = false;
    return this;
  }
  isOn() {
    return this._isOn;
  }
}

class ComputerPlayerRandom extends ComputerPlayer {
  constructor(boardData, color) {
    super(boardData, color);
  }
  bestMove(legalMoves) {
    const randomMove = Math.floor(random(legalMoves.moves.length));
    return legalMoves.moves[randomMove];
  }
}

class ComputerPlayerRandomHitFirst extends ComputerPlayer {
  constructor(boardData, color) {
    super(boardData, color);
  }
  bestMove(legalMoves) {
    const hits = legalMoves.moves.filter((x) => x.isHit);
    const noHits = legalMoves.moves.filter((x) => !x.isHit);
    if (hits.length > 0) {
      const randomMove = Math.floor(random(hits.length));
      return hits[randomMove];
    }
    const randomMove = Math.floor(random(noHits.length));
    return noHits[randomMove];
  }
}

const evaluators = new ComputerPlayerFactory();
evaluators.addEvaluator("random", "ComputerPlayerRandom");
evaluators.addEvaluator("hit-random", "ComputerPlayerRandomHitFirst");
