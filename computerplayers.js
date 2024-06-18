class ComputerPlayerFactory {
  constructor() {
    this.factory = {};
  }

  addEvaluator(shortName, className) {
    this.factory[shortName] = className;
  }

  newPlayerOn(named, boardData, color) {
    return this.newPlayerOff(named, boardData, color).on();
  }
  newPlayerOff(named, boardData, color) {
    const className = this.factory[named];
    if (className) {
      return new className(named, boardData, color).off();
    }
    throw new Error(`Class ${className} named '${named}' not found`);
  }
}

class ComputerPlayer {
  constructor(name, boardData, color) {
    this.name = name;
    this.boardData = boardData;
    this.color = color;
    this._isOn = false;
    this.runNext = false;
  }

  isTurn(color) {
    if (!this._isOn) return false;
    const turn = this.color === color;
    this.runNext = turn;
    if (this.runNext) {
      verbose === 2 &&
        console.log("Computer run Next " + PieceNames[this.color]);
    }
    return turn;
  }
  checkForAutoTurn() {
    this.isTurn(this.boardData.legalMoves.color);
    return this;
  }

  shallRunNext() {
    return this.runNext;
  }

  chooseMove() {
    if (this.boardData.legalMoves.color === this.color) {
      this.runNext = false;
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
  constructor(name, boardData, color) {
    super(name, boardData, color);
  }
  bestMove(legalMoves) {
    const randomMove = Math.floor(random(legalMoves.moves.length));
    return legalMoves.moves[randomMove];
  }
}

class ComputerPlayerRandomHitFirst extends ComputerPlayer {
  constructor(name, boardData, color) {
    super(name, boardData, color);
  }
  bestMove(legalMoves) {
    const hits = legalMoves.moves
      .filter((x) => x.isHit)
      .filter((x) => x.targetPieceOnly !== Piece.KING);
    const noHits = legalMoves.moves.filter((x) => !x.isHit);
    if (hits.length > 0) {
      const randomMove = Math.floor(random(hits.length));
      return hits[randomMove];
    }
    const randomMove = Math.floor(random(noHits.length));
    return noHits[randomMove];
  }
}

class ComputerPlayerAlphaBetaPruning extends ComputerPlayer {
  constructor(name, boardData, color) {
    super(name, boardData, color);
  }
  bestMove(legalMoves) {
    const { bestMove, evaluation, count, cutOffs } = new Evaluator(
      this.boardData,
      this.color
    ).searchAlphaBetaPruningAll(2, -Infinity, Infinity, true);
    //console.log("Search: count=" + count + ", cuts: " + cutOffs);
    return bestMove;
  }
}

const evaluators = new ComputerPlayerFactory();
evaluators.addEvaluator("random", ComputerPlayerRandom);
evaluators.addEvaluator("hit-random", ComputerPlayerRandomHitFirst);
evaluators.addEvaluator("alpha-beta", ComputerPlayerAlphaBetaPruning);
computerName = "alpha-beta";

class Evaluator {
  constructor(data, color) {
    this.data = data;
    this.color = color;
  }

  evaluate() {
    const whiteEval = this.countMaterial(Piece.WHITE);
    const blackEval = this.countMaterial(Piece.BLACK);
    const evaluation = whiteEval - blackEval;
    const perspective = this.color === Piece.WHITE ? 1 : -1;
    return evaluation * perspective;
  }
  countMaterial(color) {
    let material = 0;
    const pieceTypes = [
      Piece.PAWN,
      Piece.KNIGHT,
      Piece.ROOK,
      Piece.BISHOP,
      Piece.QUEEN,
    ];
    for (const pieceType of pieceTypes) {
      const pieces = this.data.getPiecesCache(pieceType | color);
      material += pieces.length * getPieceTypeValue(pieceType);
    }
    return material;
  }

  searchAlphaBetaPruningAll(depth, alpha, beta, maximizingPlayer) {
    const result = this.searchAlphaBetaPruning(
      false,
      depth,
      alpha,
      beta,
      maximizingPlayer
    );
    console.log("Search all: best="+result.bestMove?.toAlgebraicNotation() +", count=" + result.count + ", cuts: " + result.cutOffs +", eval="+result.evaluation);
    return result
  }

  searchAlphaBetaPruningCapturesOnly(depth, alpha, beta, maximizingPlayer) {
    const result = this.searchAlphaBetaPruning(
      true,
      2,
      alpha,
      beta,
      maximizingPlayer
    );
    //console.log("Search captures: best="+result.bestMove?.toAlgebraicNotation() +", count=" + result.count + ", cuts: " + result.cutOffs +", eval="+result.evaluation);
    return result
  }
  searchAlphaBetaPruning(capturesOnly, depth, alpha, beta, maximizingPlayer) {
    if (depth === 0) {
      if (!capturesOnly) {
        const evalWithCapturesOnly = this.searchAlphaBetaPruningCapturesOnly(
          depth,
          alpha,
          beta,
          maximizingPlayer
        );
        if (evalWithCapturesOnly.bestMove) {
          return evalWithCapturesOnly;
        }
      }
      return {
        bestMove: undefined,
        evaluation: this.evaluate(),
        count: 1,
        cutOffs: 0,
      };
    }
    let moves = this.orderMoves([...this.data.legalMoves.moves]);
    if (capturesOnly) {
      moves = moves.filter((x) => x.isHit);
    }
    let minMaxEval = 0;
    if (maximizingPlayer) {
      minMaxEval = -Infinity;
    } else {
      minMaxEval = Infinity;
    }
    if (moves.length === 0) {
      if (this.data.check) {
        return {
          bestMove: undefined,
          evaluation: minMaxEval,
          count: 1,
          cutOffs: 0,
        };
      }
      return {
        bestMove: undefined,
        evaluation: 0,
        count: 1,
        cutOffs: 0,
      };
    }

    let currentBestMove = undefined;
    let totalCount = 0;
    let totalCutOffs = 0;
    for (const move of moves) {
      this.data.makeMove(move, false);
      const newColor = this.color ^ Piece.COLOR_MASK;
      this.data.setLegalMovesFor(newColor);
      game.color = newColor;

      let { bestMove, evaluation, count, cutOffs } =
        this.searchAlphaBetaPruning(
          capturesOnly,
          depth - 1,
          alpha,
          beta,
          !maximizingPlayer
        );
      this.data.undoMove(move);
      this.data.setLegalMovesFor(this.color);
      game.color = this.color;
      redraw();

      if (maximizingPlayer) {
        if (evaluation > minMaxEval) {
          currentBestMove = move;
        }
        minMaxEval = Math.max(evaluation, minMaxEval);
        alpha = Math.max(evaluation, alpha);
        totalCount += count;
        totalCutOffs += cutOffs;
      } else {
        if (evaluation < minMaxEval) {
          currentBestMove = move;
        }
        minMaxEval = Math.min(evaluation, minMaxEval);
        beta = Math.min(evaluation, beta);
        totalCount += count;
        totalCutOffs += cutOffs;
      }

      if (beta <= alpha) {
        // move was too good, oppponent will avoid this posititon
        totalCutOffs++;
        return {
          bestMove: move,
          evaluation: minMaxEval,
          count: totalCount,
          cutOffs: totalCutOffs,
        };
      }
    }
    return {
      bestMove: currentBestMove,
      evaluation: minMaxEval,
      count: totalCount,
      cutOffs: totalCutOffs,
    };
  }

  orderMoves(moves) {
    for (const move of moves) {
      if (move.isHit) {
        let moveScoreGuess = 0;
        const movePieceType = move.pieceOnly;
        const capturePieceType = move.targetPieceOnly;

        // priorize capturing opponent most valuable pieces with our least valueable pieces
        if (capturePieceType !== Piece.None) {
          moveScoreGuess +=
            getPieceTypeValue(capturePieceType) -
            getPieceTypeValue(movePieceType);
        }
        if (move.promotionPiece != Piece.None) {
          moveScoreGuess += getPieceTypeValue(move.promotionPiece);
        }
        // penalize moving our pieces to a square attacked by an opponent pawn
        if (this.data.opponentPawnCanAttackIndex(move.color, move.to)) {
          moveScoreGuess -= getPieceTypeValue(movePieceType);
        }
        move.moveScoreGuess = moveScoreGuess;
        move.randomScoreGuess = Math.floor(Math.random() * 1000);
      }
    }
    moves.sort((x, y) => {
      const diff = x.moveScoreGuess - y.moveScoreGuess;
      if (diff === 0) {
        return x.randomScoreGuess - y.randomScoreGuess;
      } else {
        return diff;
      }
    });
    return moves;
  }
}
