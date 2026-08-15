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
    this.tt = TranspositionTableInstance();
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
    const evalutator = new Evaluator(this.tt, this.boardData, this.color);
    const { bestMove, evaluation, count, cutOffs } =
      evalutator.searchAlphaBetaPruningAll(
        getCalculationDepth(),
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

const CHECKMATE_EVALUATION = 1000000;
const MAX_QUIESCENCE_DEPTH = 2;

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
  constructor(tt, data, color) {
    this.tt = tt;
    this.countEvaluated = 0;
    this.data = data;
    this.color = color;
    this.myEvalation = new EvaluatorData();
    this.opponentEvaluation = new EvaluatorData();
    this.myMaterialInfo = undefined;
    this.opponentMaterialInfo = undefined;
    this.killerMoves = [];
    this.historyHeuristic = {};
    this.searchStats = {
      cutoffSources: this.createCutoffSourceStats(),
      cutoffSourcesByDepth: {},
      cutoffSourcesByMode: {
        main: this.createCutoffSourceStats(),
        quiescence: this.createCutoffSourceStats(),
      },
      ttBestMove: {
        available: 0,
        legal: 0,
        first: 0,
        cutoff: 0,
      },
    };
  }

  createCutoffSourceStats() {
    return {
      ttBestMove: 0,
      winningCapture: 0,
      promotion: 0,
      killer: 0,
      history: 0,
      other: 0,
    };
  }

  evaluate(maximizingPlayer) {
    this.countEvaluated++;
    this.myMaterialInfo = this.getMaterialInfo(this.color);
    this.opponentMaterialInfo = this.getMaterialInfo(
      this.color ^ Piece.COLOR_MASK
    );
    this.myEvalation.materialScore = this.myMaterialInfo.materialScore;
    this.opponentEvaluation.materialScore =
      this.opponentMaterialInfo.materialScore;

    this.myEvalation.pieceSquareScore = this.evaluatePieceSquareTables(
      this.color === Piece.WHITE,
      this.myMaterialInfo.endgameT
    );
    this.opponentEvaluation.pieceSquareScore = this.evaluatePieceSquareTables(
      this.color !== Piece.WHITE,
      this.opponentMaterialInfo.endgameT
    );

    this.myEvalation.mopUpScore = this.evaluateMopUp(
      this.color === Piece.WHITE,
      this.myMaterialInfo,
      this.opponentMaterialInfo
    );

    /*
    if (this.data.checkMate) {
      this.myMaterialInfo.checkFactor = 1000;
    } else if (this.data.check) {
      this.myMaterialInfo.checkFactor = 5;
      console.log("I am in check");
    }
*/
    const finalEval =
      this.myEvalation.sum() - this.opponentEvaluation.sum();

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
      PieceSquareTable.PawnsEnd || PieceSquareTable.Pawns,
      this.data.getPiecesCache(Piece.PAWN | colorIndex),
      isWhite
    );
    value += Math.floor(pawnEarly * (1 - endgameT));
    value += Math.floor(pawnLate * endgameT);

    const kingIndex = this.data.getKingPosition(colorIndex);
    if (kingIndex !== undefined) {
      const kingEarlyPhase = PieceSquareTable.read(
        PieceSquareTable.KingStart,
        kingIndex,
        isWhite
      );
      value += Math.floor(kingEarlyPhase * (1 - endgameT));
      const kingLatePhase = PieceSquareTable.read(
        PieceSquareTable.KingEnd,
        kingIndex,
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
    for (var i = 0; i < pieceList.length; i++) {
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

      const friendlyKingSquare = this.data.getKingPosition(friendlyIndex);
      const opponentKingSquare = this.data.getKingPosition(opponentIndex);
      if (
        friendlyKingSquare === undefined ||
        opponentKingSquare === undefined
      ) {
        return 0;
      }
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
    let result = undefined;
    let totalCount = 0;
    let totalCutOffs = 0;
    for (let currentDepth = 1; currentDepth <= depth; currentDepth++) {
      result = this.searchAlphaBetaPruning(
        false,
        currentDepth,
        alpha,
        beta,
        maximizingPlayer,
        0
      );
      totalCount += result.count;
      totalCutOffs += result.cutOffs;
      verbose === 1 &&
        console.log(
          "Iterative depth " +
            currentDepth +
            ": best=" +
            result.bestMove?.toAlgebraicNotation() +
            ", eval=" +
            result.evaluation +
            ", count=" +
            result.count +
            ", cuts=" +
            result.cutOffs
        );
    }
    const diffTime = Math.round(performance.now() - startTime);
    if (verbose > 0) {
      console.log(
        "Search all: best=" +
          result.bestMove?.toAlgebraicNotation() +
          ", name=" +
          result.bestMove?.pieceName +
          ", count=" +
          totalCount +
          ", cuts: " +
          totalCutOffs +
          ", eval=" +
          result.evaluation +
          ", time=" +
          diffTime +
          " [ms]"
      );
      this.printSearchStats();
      this.tt.printStats();
    }
    return {
      bestMove: result.bestMove,
      evaluation: result.evaluation,
      count: totalCount,
      cutOffs: totalCutOffs,
    };
  }

  searchAlphaBetaPruningCapturesOnly(alpha, beta, maximizingPlayer, ply = 0) {
    const result = this.searchAlphaBetaPruning(
      true,
      MAX_QUIESCENCE_DEPTH,
      alpha,
      beta,
      maximizingPlayer,
      ply
    );
    //console.log("Search captures: best="+result.bestMove?.toAlgebraicNotation() +", count=" + result.count + ", cuts: " + result.cutOffs +", eval="+result.evaluation);
    return result;
  }
  searchAlphaBetaPruning(
    capturesOnly,
    depth,
    alpha,
    beta,
    maximizingPlayer,
    ply = 0
  ) {
    if (depth === 0) {
      if (!capturesOnly) {
        const evalWithCapturesOnly = this.searchAlphaBetaPruningCapturesOnly(
          alpha,
          beta,
          maximizingPlayer,
          ply
        );
        if (evalWithCapturesOnly.bestMove) {
          return evalWithCapturesOnly;
        }
      }
      const newHash = this.data.newHash(game.color);
      const ttResult = this.tt.use(game.color, newHash, alpha, beta, depth);
      let evaluation = 0;
      let bestMove = undefined;
      if (ttResult) {
        evaluation = ttResult.evaluation;
        bestMove = ttResult.bestMove;
      } else {
        evaluation = this.evaluate(maximizingPlayer);
        this.tt.store(newHash, depth, evaluation, TranspositionFlag.EXACT);
      }
      return {
        bestMove: bestMove,
        evaluation: evaluation,
        count: 1,
        cutOffs: 0,
      };
    }
    const newHash = this.data.newHash(game.color);
    const ttResult = this.tt.use(game.color, newHash, alpha, beta, depth);
    if (ttResult) {
      return {
        bestMove: ttResult.bestMove,
        evaluation: ttResult.evaluation,
        count: 1,
        cutOffs: 0,
      };
    }
    const ttBestMove = this.tt.bestMoveForOrdering(newHash);
    let moves = [...this.data.legalMoves.moves];
    if (capturesOnly && !this.data.check) {
      const captureMoves = [];
      for (const move of moves) {
        if (move.isHit) captureMoves.push(move);
      }
      moves = captureMoves;
    }
    moves = this.orderMoves(moves, ttBestMove, ply);
    this.recordTTBestMoveStats(ttBestMove, moves);
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
          evaluation: maximizingPlayer
            ? -CHECKMATE_EVALUATION - depth
            : CHECKMATE_EVALUATION + depth,
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
      const newColor = origColor ^ Piece.COLOR_MASK;
      this.data.setLegalMovesForSearch(newColor);
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
          !maximizingPlayer,
          ply + 1
        );
      totalCutOffs += cutOffs;

      this.data.undoMove(move);
      this.data.setLegalMovesForSearch(origColor);
      game.color = origColor;
      redraw();

      // see https://www.appliedaicourse.com/blog/alpha-beta-pruning-in-artificial-intelligence/
      let transpositionFlag = TranspositionFlag.EXACT;
      if (maximizingPlayer) {
        if (evaluation > minMaxEval) {
          currentBestMove = move;
        }
        minMaxEval = Math.max(minMaxEval, evaluation);
        alpha = Math.max(alpha, evaluation);
        if (minMaxEval >= beta) {
          transpositionFlag = TranspositionFlag.LOWERBOUND;
        }
        totalCount += count;
      } else {
        if (evaluation < minMaxEval) {
          currentBestMove = move;
        }
        minMaxEval = Math.min(minMaxEval, evaluation);
        beta = Math.min(beta, evaluation);
        if (minMaxEval <= alpha) {
          transpositionFlag = TranspositionFlag.UPPERBOUND;
        }
        totalCount += count;
      }

      if (beta <= alpha) {
        // move was too good, oppponent will avoid this posititon - snip
        totalCutOffs++;
        this.recordCutoffSource(move, depth, capturesOnly);
        this.rememberCutoffMove(move, ply, depth);
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
        this.tt.store(
          newHash,
          depth,
          minMaxEval,
          transpositionFlag,
          currentBestMove
        );
        return {
          bestMove: currentBestMove,
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
    this.tt.store(
      newHash,
      depth,
      minMaxEval,
      TranspositionFlag.EXACT,
      currentBestMove
    );
    return {
      bestMove: currentBestMove,
      evaluation: minMaxEval,
      count: totalCount,
      cutOffs: totalCutOffs,
    };
  }

  recordCutoffSource(move, depth, capturesOnly) {
    const source = move.cutoffSource || "other";
    this.searchStats.cutoffSources[source]++;
    if (!this.searchStats.cutoffSourcesByDepth[depth]) {
      this.searchStats.cutoffSourcesByDepth[depth] =
        this.createCutoffSourceStats();
    }
    this.searchStats.cutoffSourcesByDepth[depth][source]++;
    const mode = capturesOnly ? "quiescence" : "main";
    this.searchStats.cutoffSourcesByMode[mode][source]++;
    if (source === "ttBestMove") {
      this.searchStats.ttBestMove.cutoff++;
    }
  }

  recordTTBestMoveStats(ttBestMove, moves) {
    if (!ttBestMove) return;
    this.searchStats.ttBestMove.available++;
    let legalIndex = -1;
    for (let i = 0; i < moves.length; i++) {
      if (moves[i].eqFromTo(ttBestMove)) {
        legalIndex = i;
        break;
      }
    }
    if (legalIndex === -1) return;
    this.searchStats.ttBestMove.legal++;
    if (legalIndex === 0) {
      this.searchStats.ttBestMove.first++;
    }
  }

  printSearchStats() {
    const sources = this.searchStats.cutoffSources;
    const mainSources = this.searchStats.cutoffSourcesByMode.main;
    const quiescenceSources = this.searchStats.cutoffSourcesByMode.quiescence;
    const ttBestMove = this.searchStats.ttBestMove;
    console.log(
      "Cutoff sources: " +
        this.formatCutoffSources(sources)
    );
    console.log(
      "Cutoff sources main: " +
        this.formatCutoffSources(mainSources) +
        "; quiescence: " +
        this.formatCutoffSources(quiescenceSources)
    );
    console.log(
      "Cutoff sources by depth: " +
        this.formatCutoffSourcesByDepth()
    );
    console.log(
      "TT best move: available=" +
        ttBestMove.available +
        ", legal=" +
        ttBestMove.legal +
        ", first=" +
        ttBestMove.first +
        ", cutoff=" +
        ttBestMove.cutoff
    );
  }

  formatCutoffSources(sources) {
    return (
      "ttBestMove=" +
      sources.ttBestMove +
      ", winningCapture=" +
      sources.winningCapture +
      ", promotion=" +
      sources.promotion +
      ", killer=" +
      sources.killer +
      ", history=" +
      sources.history +
      ", other=" +
      sources.other
    );
  }

  formatCutoffSourcesByDepth() {
    const byDepth = this.searchStats.cutoffSourcesByDepth;
    const depths = Object.keys(byDepth).sort((left, right) => left - right);
    if (depths.length === 0) return "-";
    const parts = [];
    for (const depth of depths) {
      parts.push(depth + "={" + this.formatCutoffSources(byDepth[depth]) + "}");
    }
    return parts.join("; ");
  }

  orderMoves(moves, ttBestMove = undefined, ply = 0) {
    for (const move of moves) {
      let moveScoreGuess = 0;
      let cutoffSource = "other";
      if (ttBestMove && move.eqFromTo(ttBestMove)) {
        moveScoreGuess += 1000000000;
        cutoffSource = "ttBestMove";
      }
      const movePieceType = move.pieceOnly;
      if (move.isHit) {
        const capturePieceType = move.targetPieceOnly;

        // priorize capturing opponent most valuable pieces with our least valueable pieces
        if (capturePieceType !== Piece.None) {
          const captureDelta =
            getPieceTypeValue(capturePieceType) -
            getPieceTypeValue(movePieceType);
          if (captureDelta >= 0) {
            moveScoreGuess += 800000 + 10 * captureDelta;
            if (cutoffSource === "other") {
              cutoffSource = "winningCapture";
            }
          } else {
            moveScoreGuess += 10000 + captureDelta;
          }
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
        moveScoreGuess += 700000 + getPieceTypeValue(move.promotionPiece);
        if (cutoffSource === "other") {
          cutoffSource = "promotion";
        }
      }
      if (this.isKillerMove(move, ply)) {
        moveScoreGuess += 600000;
        if (cutoffSource === "other") {
          cutoffSource = "killer";
        }
      }
      if (this.isQuietMove(move)) {
        const historyScore = this.historyHeuristic[this.moveKey(move)] || 0;
        moveScoreGuess += historyScore;
        if (cutoffSource === "other" && historyScore > 0) {
          cutoffSource = "history";
        }
      }
      // penalize moving our pieces to a square attacked by an opponent pawn
      if (this.data.opponentPawnCanAttackIndex(move.color, move.to)) {
        moveScoreGuess -= getPieceTypeValue(movePieceType);
      }
      move.moveScoreGuess = moveScoreGuess;
      move.cutoffSource = cutoffSource;
      //move.randomScoreGuess = Math.floor(Math.random() * 1000);
    }
    moves.sort((x, y) => {
      const diff = y.moveScoreGuess - x.moveScoreGuess;
      if (diff === 0) {
        return (y.randomScoreGuess || 0) - (x.randomScoreGuess || 0);
      } else {
        return diff;
      }
    });
    return moves;
  }

  rememberCutoffMove(move, ply, depth) {
    if (!this.isQuietMove(move)) return;
    this.rememberKillerMove(move, ply);
    const key = this.moveKey(move);
    this.historyHeuristic[key] =
      (this.historyHeuristic[key] || 0) + depth * depth;
  }

  rememberKillerMove(move, ply) {
    let killers = this.killerMoves[ply];
    if (!killers) {
      killers = [];
      this.killerMoves[ply] = killers;
    }
    const key = this.moveKey(move);
    for (let i = 0; i < killers.length; i++) {
      if (killers[i] === key) return;
    }
    killers.unshift(key);
    if (killers.length > 2) killers.pop();
  }

  isKillerMove(move, ply) {
    const killers = this.killerMoves[ply];
    if (!killers) return false;
    const key = this.moveKey(move);
    for (let i = 0; i < killers.length; i++) {
      if (killers[i] === key) return true;
    }
    return false;
  }

  isQuietMove(move) {
    return !move.isHit && move.promotionPiece === Piece.None;
  }

  moveKey(move) {
    return move.from + ":" + move.to + ":" + move.promotionPiece;
  }
}
