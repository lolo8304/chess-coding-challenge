const TranspositionFlag = {
  EXACT: "EXACT",
  LOWERBOUND: "LOWERBOUND",
  UPPERBOUND: "UPPERBOUND",
};

class TranspositionTable {
  constructor(size = 1 << 20) {
    verbose > 0 && console.log("new TranspositionTable()");
    // Default size is 2^20 entries
    this.table = new Array(size);
    this.size = size;
    this.filled = 0;
    this.filledExact = 0;
    this.overwritten = 0;
    this.rejectedStores = 0;
    this.probes = 0;
    this.emptyMisses = 0;
    this.indexCollisions = 0;
    this.depthTooLow = 0;
    this.depthHits = 0;
    this.exactUsable = 0;
    this.boundUsableCutoffs = 0;
    this.boundNotUseful = 0;
    this.bestMoveOrderingHits = 0;
  }

  printStats() {
    const usable = this.exactUsable + this.boundUsableCutoffs;
    const usableRatioPercent =
      this.probes === 0 ? 100 : Math.floor((usable * 100) / this.probes);
    const depthHitRatioPercent =
      this.probes === 0
        ? 100
        : Math.floor((this.depthHits * 100) / this.probes);
    console.log(
      "Transposition stats: " +
        this.filled +
        " filled, exact=" +
        this.filledExact +
        ", overwritten=" +
        this.overwritten +
        ", rejectedStores=" +
        this.rejectedStores +
        ", " +
        depthHitRatioPercent +
        "% depth-hit (" +
        this.depthHits +
        "), " +
        usableRatioPercent +
        "% usable (" +
        usable +
        "), exactUsable=" +
        this.exactUsable +
        ", boundCutoffs=" +
        this.boundUsableCutoffs +
        ", boundNotUseful=" +
        this.boundNotUseful +
        ", empty=" +
        this.emptyMisses +
        ", indexCollision=" +
        this.indexCollisions +
        ", depthTooLow=" +
        this.depthTooLow +
        ", bestMoveOrderingHits=" +
        this.bestMoveOrderingHits +
        ", total probes=" +
        this.probes +
        ", "
    );
  }

  // Compute an index in the table using the Zobrist hash
  getIndex(hash) {
    return Number(hash % BigInt(this.size));
  }

  // Store an entry in the table
  store(
    hash,
    depth,
    evaluation,
    flag,
    bestMove = undefined,
    principalVariation = []
  ) {
    const index = this.getIndex(hash);

    const entry = this.table[index];
    if (!this.shouldReplace(entry, hash, depth, flag)) {
      this.rejectedStores++;
      return;
    }

    if (!entry) {
      this.filled++;
    } else {
      this.overwritten++;
      if (entry.flag === TranspositionFlag.EXACT) {
        this.filledExact--;
      }
    }
    if (flag === TranspositionFlag.EXACT) {
      this.filledExact++;
    }

    this.table[index] = {
      hash,
      depth,
      evaluation,
      flag,
      bestMove,
      principalVariation,
    };
  }

  shouldReplace(entry, hash, depth, flag) {
    if (!entry) return true;
    if (entry.hash !== hash) {
      if (depth > entry.depth) return true;
      if (depth === entry.depth && flag === TranspositionFlag.EXACT) return true;
      return false;
    }
    if (depth > entry.depth) return true;
    if (depth < entry.depth) return false;
    if (flag === TranspositionFlag.EXACT) return true;
    return entry.flag !== TranspositionFlag.EXACT;
  }

  retrieve(hash, requiredDepth) {
    this.probes++;
    const index = this.getIndex(hash);
    const entry = this.table[index];

    if (!entry) {
      this.emptyMisses++;
      return undefined;
    }
    if (entry.hash !== hash) {
      this.indexCollisions++;
      return undefined;
    }
    if (entry.depth < requiredDepth) {
      this.depthTooLow++;
      return undefined;
    }
    this.depthHits++;
    return entry;
  }

  bestMoveForOrdering(hash) {
    const entry = this.table[this.getIndex(hash)];
    if (entry && entry.hash === hash && entry.bestMove) {
      this.bestMoveOrderingHits++;
      return entry.bestMove;
    }
    return undefined;
  }

  log(color, entry) {
    if (verbose > 0 && entry.bestMove) {
      console.log(
        "Transposition table " +
          PieceNames[color] +
          ": Found hash=" +
          entry.hash +
          ", depth=" +
          entry.depth +
          ", " +
          entry.flag +
          " evaluation=" +
          entry.evaluation +
          ", bestMove=" +
          (entry.bestMove
          ? entry.bestMove.toCoordinateNotation()
          : "-")
      );
    }
  }

  use(color, hash, alpha, beta, depth) {
    const entry = this.retrieve(hash, depth);

    if (entry) {
      switch (entry.flag) {
        case "EXACT":
          // Exact evaluation: return the stored value
          this.exactUsable++;
          this.log(color, entry)
          return {
            evaluation: entry.evaluation,
            bestMove: entry.bestMove,
            principalVariation: entry.principalVariation || [],
          };

        case "LOWERBOUND":
          // Lower bound: update alpha
          alpha = Math.max(alpha, entry.evaluation);
          break;

        case "UPPERBOUND":
          // Upper bound: update beta
          beta = Math.min(beta, entry.evaluation);
          break;
      }

      // Prune the search if bounds overlap
      if (alpha >= beta) {
        this.boundUsableCutoffs++;
        this.log(color, entry);
        return {
          evaluation: entry.evaluation,
          bestMove: entry.bestMove,
          principalVariation: entry.principalVariation || [],
        };
      }
      this.boundNotUseful++;
    }

    // No usable entry or search must continue
    return undefined;
  }
}

let TranspositionTableSingleton = undefined;

function TranspositionTableInstance() {
  if (!TranspositionTableSingleton) {
    TranspositionTableSingleton = new TranspositionTable();
  }
  return TranspositionTableSingleton;
}
function TranspositionTableReset() {
  TranspositionTableSingleton = undefined;
  return TranspositionTableInstance();
}
