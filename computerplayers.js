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

const MAX_DEPTH = 2;

class ComputerPlayerAlphaBetaPruning extends ComputerPlayer {
  constructor(name, boardData, color) {
    super(name, boardData, color);
  }
  bestMove(legalMoves) {
    const evalutator = new Evaluator(this.boardData, this.color);
    const { bestMove, evaluation, count, cutOffs } =
      evalutator.searchAlphaBetaPruningAll(
        MAX_DEPTH,
        -Infinity,
        Infinity,
        true
      );
    verbose === 1 &&
      console.log("Count Evaluations: " + evalutator.countEvaluated);
    //console.log("Search: count=" + count + ", cuts: " + cutOffs);
    return bestMove;
  }
}

const evaluators = new ComputerPlayerFactory();
evaluators.addEvaluator("random", ComputerPlayerRandom);
evaluators.addEvaluator("hit-random", ComputerPlayerRandomHitFirst);
evaluators.addEvaluator("alpha-beta", ComputerPlayerAlphaBetaPruning);
computerName = "alpha-beta";

class EvaluatorData {
  constructor() {
    this.materialScore = 0;
    this.mopUpScore = 0;
    this.pieceSquareScore = 0;
    this.pawnScore = 0;
    this.pawnShieldScore = 0;
    this.checkFactor = 1;
  }
  sum() {
    return (
      (this.materialScore +
        this.mopUpScore +
        this.pieceSquareScore +
        this.pawnScore +
        this.pawnShieldScore) *
      this.checkFactor
    );
  }
}

class MaterialInfo {
  constructor(
    numPawns,
    numKnights,
    numBishops,
    numQueens,
    numRooks,
    myPawns,
    enemyPawns
  ) {
    this.numPawns = numPawns;
    this.numBishops = numBishops;
    this.numQueens = numQueens;
    this.numRooks = numRooks;
    this.pawns = myPawns;
    this.enemyPawns = enemyPawns;
    this.endgameT = 0;
    this.materialScore = 0;

    this.numMajors = numRooks + numQueens;
    this.numMinors = numBishops + numKnights;

    this.materialScore += numPawns * PieceEvaluations[Piece.PAWN];
    this.materialScore += numKnights * PieceEvaluations[Piece.KNIGHT];
    this.materialScore += numBishops * PieceEvaluations[Piece.BISHOP];
    this.materialScore += numRooks * PieceEvaluations[Piece.ROOK];
    this.materialScore += numQueens * PieceEvaluations[Piece.QUEEN];

    // Endgame Transition (0->1)
    const queenEndgameWeight = 45;
    const rookEndgameWeight = 20;
    const bishopEndgameWeight = 10;
    const knightEndgameWeight = 10;

    const endgameStartWeight =
      2 * rookEndgameWeight +
      2 * bishopEndgameWeight +
      2 * knightEndgameWeight +
      queenEndgameWeight;
    const endgameWeightSum =
      numQueens * queenEndgameWeight +
      numRooks * rookEndgameWeight +
      numBishops * bishopEndgameWeight +
      numKnights * knightEndgameWeight;
    this.endgameT = 1 - Math.min(1, endgameWeightSum / endgameStartWeight);
  }
}

class Evaluator {
  constructor(data, color) {
    this.countEvaluated = 0;
    this.data = data;
    this.color = color;
    this.myEvalation = new EvaluatorData();
    this.opponentEvaluation = new EvaluatorData();
    this.myMaterialInfo = this.getMaterialInfo(color);
    this.opponentMaterialInfo = this.getMaterialInfo(color ^ Piece.COLOR_MASK);
  }

  evaluate(maximizingPlayer) {
    this.countEvaluated++;
    this.myEvalation.materialScore = this.myMaterialInfo.materialScore;
    this.opponentEvaluation.materialScore = this.myMaterialInfo.materialScore;

    this.myEvalation.pieceSquareScore = this.evaluatePieceSquareTables(
      this.color === Piece.WHITE,
      this.myMaterialInfo.endgameT
    );
    this.opponentEvaluation.pieceSquareScore = this.evaluatePieceSquareTables(
      this.color !== Piece.WHITE,
      this.opponentMaterialInfo.endgameT
    );
/*
    this.myEvalation.mopUpScore = this.evaluateMopUp(
      this.color === Piece.WHITE,
      this.myMaterialInfo,
      this.opponentMaterialInfo
    );
    */

    if (this.data.checkMate) {
      this.myMaterialInfo.checkFactor = 1000;
    } else if (this.data.check) {
      this.myMaterialInfo.checkFactor = 5;
      console.log("I am in check");
    }

    const finalEval =
      (maximizingPlayer ? 1 : 1) *
      (this.myEvalation.sum() - this.opponentEvaluation.sum());
    return finalEval;
  }

  getMaterialInfo(color) {
    const numPawns = this.countMaterial(Piece.PAWN, color);
    const numKnights = this.countMaterial(Piece.KNIGHT, color);
    const numBishops = this.countMaterial(Piece.BISHOP, color);
    const numRooks = this.countMaterial(Piece.ROOK, color);
    const numQueens = this.countMaterial(Piece.QUEEN, color);

    const myPawns = this.countMaterial(Piece.PAWN, color);
    const enemyPawns = this.countMaterial(Piece.PAWN, color ^ Piece.COLOR_MASK);

    return new MaterialInfo(
      numPawns,
      numKnights,
      numBishops,
      numQueens,
      numRooks,
      myPawns,
      enemyPawns
    );
  }

  countMaterial(pieceType, color) {
    const pieces = this.data.getPiecesCache(pieceType | color);
    return pieces.length;
  }

  valueMaterial(pieceType, color) {
    return this.countMaterial(pieceType, color) * getPieceTypeValue(pieceType);
  }

  evaluatePieceSquareTables(isWhite, endgameT) {
    let value = 0;
    let colorIndex = isWhite ? Piece.WHITE : Piece.BLACK;
    value += this.evaluatePieceSquareTable(
      PieceSquareTable.Rooks,
      this.data.getPiecesCache(Piece.ROOK | colorIndex),
      isWhite
    );
    value += this.evaluatePieceSquareTable(
      PieceSquareTable.Knights,
      this.data.getPiecesCache(Piece.KNIGHT | colorIndex),
      isWhite
    );
    value += this.evaluatePieceSquareTable(
      PieceSquareTable.Bishops,
      this.data.getPiecesCache(Piece.BISHOP | colorIndex),
      isWhite
    );
    value += this.evaluatePieceSquareTable(
      PieceSquareTable.Queens,
      this.data.getPiecesCache(Piece.QUEEN | colorIndex),
      isWhite
    );

    const pawnEarly = this.evaluatePieceSquareTable(
      PieceSquareTable.Pawns,
      this.data.getPiecesCache(Piece.PAWN | colorIndex),
      isWhite
    );
    const pawnLate = this.evaluatePieceSquareTable(
      PieceSquareTable.PawnsEnd,
      this.data.getPiecesCache(Piece.PAWN | colorIndex),
      isWhite
    );
    value += Math.floor(pawnEarly * (1 - endgameT));
    value += Math.floor(pawnLate * endgameT);

    if (this.data.getPiecesCache(Piece.KING | colorIndex)[0]) {
      const kingEarlyPhase = PieceSquareTable.read(
        PieceSquareTable.KingStart,
        this.data.getPiecesCache(Piece.KING | colorIndex)[0],
        isWhite
      );
      value += Math.floor(kingEarlyPhase * (1 - endgameT));
      const kingLatePhase = PieceSquareTable.read(
        PieceSquareTable.KingEnd,
        this.data.getPiecesCache(Piece.KING | colorIndex)[0],
        isWhite
      );
      value += Math.floor(kingLatePhase * endgameT);
    } else {
      value += 1000 * endgameT;
    }

    return value;
  }

  evaluatePieceSquareTable(table, pieceList, isWhite) {
    let value = 0;
    for (var i = 0; i < pieceList.Count; i++) {
      value += PieceSquareTable.read(table, pieceList[i], isWhite);
    }
    return value;
  }
  evaluateMopUp(isWhite, myMaterial, opponentMaterial) {
    if (
      myMaterial.materialScore >
        opponentMaterial.materialScore + PieceEvaluations[Piece.PAWN] * 2 &&
      opponentMaterial.endgameT > 0
    ) {
      let mopUpScore = 0;
      const friendlyIndex = isWhite ? Piece.WHITE : Piece.BLACK;
      const opponentIndex = isWhite ? Piece.BLACK : Piece.WHITE;

      const friendlyKingSquare = this.data.getPiecesCache(
        Piece.KING | friendlyIndex
      )[0];
      const opponentKingSquare = this.data.getPiecesCache(
        Piece.KING | opponentIndex
      )[0];
      // Encourage moving king closer to opponent king
      mopUpScore +=
        4 * (14 - OrthogonalDistance[friendlyKingSquare][opponentKingSquare]);
      // Encourage pushing opponent king to edge of board
      mopUpScore += CentreManhattanDistance[opponentKingSquare] * 10;
      const finalMopUpScore = Math.floor(
        mopUpScore * opponentMaterial.endgameT
      );
      verbose === 1 && console.log("MopUp Score = " + finalMopUpScore);
      return finalMopUpScore;
    }
    return 0;
  }

  searchAlphaBetaPruningAll(depth, alpha, beta, maximizingPlayer) {
    const startTime = performance.now();
    const result = this.searchAlphaBetaPruning(
      false,
      depth,
      alpha,
      beta,
      maximizingPlayer
    );
    const diffTime = Math.round(performance.now() - startTime);
    console.log(
      "Search all: best=" +
        result.bestMove?.toAlgebraicNotation() +
        ", name=" +
        result.bestMove?.pieceName +
        ", count=" +
        result.count +
        ", cuts: " +
        result.cutOffs +
        ", eval=" +
        result.evaluation +
        ", time=" +
        diffTime +
        " [ms]"
    );
    return result;
  }

  searchAlphaBetaPruningCapturesOnly(alpha, beta, maximizingPlayer) {
    const result = this.searchAlphaBetaPruning(
      true,
      MAX_DEPTH,
      alpha,
      beta,
      maximizingPlayer
    );
    //console.log("Search captures: best="+result.bestMove?.toAlgebraicNotation() +", count=" + result.count + ", cuts: " + result.cutOffs +", eval="+result.evaluation);
    return result;
  }
  searchAlphaBetaPruning(capturesOnly, depth, alpha, beta, maximizingPlayer) {
    if (depth === 0) {
      if (!capturesOnly) {
        const evalWithCapturesOnly = this.searchAlphaBetaPruningCapturesOnly(
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
        evaluation: this.evaluate(maximizingPlayer),
        count: 1,
        cutOffs: 0,
      };
    }

    let moves = [...this.data.legalMoves.moves];
    if (capturesOnly) {
      moves = moves.filter((x) => x.isHit);
    }
    moves = this.orderMoves(moves);
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
    const origColor = game.color;
    for (let indexMove = 0; indexMove < moves.length; indexMove++) {
      const move = moves[indexMove];
      this.data.makeMove(move, false);
      const newColor = this.color ^ Piece.COLOR_MASK;
      this.data.setLegalMovesFor(newColor);
      game.color = newColor;

      verbose === 1 &&
        depth > 1 &&
        console.log(
          "Search MAXIMIZE=" +
            maximizingPlayer +
            "  ".repeat(5 - depth) +
            depth +
            ": make move " +
            move.toCoordinateNotation() +
            " " +
            PieceNames[origColor] +
            "... (alpha=" +
            alpha +
            ", beta=" +
            beta +
            ")"
        );

      let { bestMove, evaluation, count, cutOffs } =
        this.searchAlphaBetaPruning(
          capturesOnly,
          depth - 1,
          alpha,
          beta,
          !maximizingPlayer
        );
      totalCutOffs += cutOffs;

      this.data.undoMove(move);
      this.data.setLegalMovesFor(this.color);
      game.color = this.color;
      redraw();

      // see https://www.appliedaicourse.com/blog/alpha-beta-pruning-in-artificial-intelligence/
      if (maximizingPlayer) {
        if (evaluation > minMaxEval) {
          currentBestMove = move;
        }
        minMaxEval = Math.max(minMaxEval, evaluation);
        alpha = Math.max(alpha, evaluation);
        totalCount += count;
      } else {
        if (evaluation < minMaxEval) {
          currentBestMove = move;
        }
        minMaxEval = Math.min(minMaxEval, evaluation);
        beta = Math.min(beta, evaluation);
        totalCount += count;
      }

      if (beta <= alpha) {
        // move was too good, oppponent will avoid this posititon - snip
        totalCutOffs++;
        verbose === 1 &&
          console.log(
            "...    MAXIMIZE=" +
              maximizingPlayer +
              "  ".repeat(5 - depth) +
              depth +
              ": make move " +
              move.toCoordinateNotation() +
              " " +
              PieceNames[origColor] +
              ", eval=" +
              evaluation +
              (currentBestMove === move ? " (BEST MOVE)" : "") +
              " CUTOFF (" +
              beta +
              " <= " +
              alpha +
              ", minMaxEval=" +
              minMaxEval +
              ")"
          );
        return {
          bestMove: move,
          evaluation: minMaxEval,
          count: totalCount,
          cutOffs: totalCutOffs,
        };
      } else {
        verbose === 1 &&
          console.log(
            "...    MAXIMIZE=" +
              maximizingPlayer +
              "  ".repeat(5 - depth) +
              depth +
              ": make move " +
              move.toCoordinateNotation() +
              " " +
              PieceNames[origColor] +
              ", eval=" +
              evaluation +
              (currentBestMove === move ? "(BEST MOVE)" : "")
          );
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
      let moveScoreGuess = 0;
      const movePieceType = move.pieceOnly;
      if (move.isHit) {
        const capturePieceType = move.targetPieceOnly;

        // priorize capturing opponent most valuable pieces with our least valueable pieces
        if (capturePieceType !== Piece.None) {
          if (capturePieceType !== movePieceType) {
            moveScoreGuess +=
              10 *
              (getPieceTypeValue(capturePieceType) -
                getPieceTypeValue(movePieceType));
          } else if (
            PieceEvaluationsHighValuePiecesForHits.includes(capturePieceType)
          ) {
            // if high value piece hits high value piece its a good move
            moveScoreGuess += 2 * getPieceTypeValue(capturePieceType);
          }
        }
      }
      // if promottion add promotion value
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
