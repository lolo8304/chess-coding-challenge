const TranspositionFlag = {
  EXACT: "EXACT",
  LOWERBOUND: "LOWERBOUND",
  UPPERBOUND: "UPPERBOUND",
};

class TranspositionTable {
  constructor(size = 1 << 20) {
    console.log("new TranspositionTable()");
    // Default size is 2^20 entries
    this.table = new Array(size);
    this.size = size;
    this.hits = 0;
    this.misses = 0;
    this.filled = 0;
    this.filledExact = 0;
    this.overwritten = 0;
  }

  printStats() {
    const totalCalls = this.hits + this.misses;
    const hitRatioPercent =
      totalCalls === 0 ? 100 : Math.floor((this.hits * 100) / totalCalls);
    const missesRatioPercent = 100 - hitRatioPercent;
    console.log(
      "Transposition stats: " +
        this.filled +
        " filled, exact=" +
        this.filledExact +
        ", overwritten=" +
        this.overwritten +
        ", " +
        hitRatioPercent +
        "% hit (" +
        this.hits +
        "), " +
        missesRatioPercent +
        "% missed (" +
        this.misses +
        "), total calls=" +
        totalCalls +
        ", "
    );
  }

  // Compute an index in the table using the Zobrist hash
  getIndex(hash) {
    return Number(hash % BigInt(this.size));
  }

  // Store an entry in the table
  store(hash, depth, evaluation, flag, bestMove = undefined) {
    const index = this.getIndex(hash);

    // Replace the entry if it's empty or if the new depth is greater
    const entry = this.table[index];
    if (!entry || entry.depth <= depth) {
      if (!entry) {
        this.filled++;
        if (flag === TranspositionFlag.EXACT) {
          this.filledExact++;
        }
      } else {
        this.overwritten++;
      }
      this.table[index] = {
        hash,
        depth,
        evaluation,
        flag,
        bestMove,
      };
    }
  }

  retrieve(hash, requiredDepth) {
    const index = this.getIndex(hash);
    const entry = this.table[index];

    // Verify that the entry corresponds to the current hash and depth is sufficient
    if (entry && entry.hash === hash && entry.depth >= requiredDepth) {
      this.hits++;
      return entry;
    }
    this.misses++;
    return undefined; // No valid entry found or insufficient depth
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
          this.log(color, entry)
          return {
            evaluation: entry.evaluation,
            bestMove: entry.bestMove,
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
        this.log(color, entry);
        return {
          evaluation: entry.evaluation,
          bestMove: entry.bestMove,
        };
      }
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
