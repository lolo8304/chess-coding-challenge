#!/usr/bin/env node

const fs = require("fs");
const readline = require("readline");
const { spawn } = require("child_process");

function usage(exitCode = 1) {
  console.error(`Usage: node stockfish-fair-positions.js [options]

Options:
  --input <file>          Input opening/FEN file (default: output.txt)
  --output <file>         Output file for fair positions (default: fair_positions.txt)
  --stockfish <path>      Stockfish binary path (default: stockfish)
  --depth <n>             Stockfish search depth per FEN (default: 10)
  --movetime <ms>         Use fixed milliseconds per FEN instead of depth
  --max-cp <n>            Maximum absolute centipawn score to keep (default: 150)
  --limit <n>             Only process the first N positions
  --metadata              Add score metadata comment after each kept FEN
  --v                     Print every evaluation
  --vv                    Print raw Stockfish UCI traffic

Input format:
  Opening name
  FEN
  Opening name
  FEN

Lines starting with # are ignored, so this can read position_parser.py --metadata output.
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const options = {
    input: "output.txt",
    output: "fair_positions.txt",
    stockfish: "stockfish",
    depth: 10,
    movetime: undefined,
    maxCp: 150,
    limit: undefined,
    metadata: false,
    verbose: 0,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = argv[i + 1];
    switch (arg) {
      case "--input":
        options.input = value;
        i++;
        break;
      case "--output":
        options.output = value;
        i++;
        break;
      case "--stockfish":
        options.stockfish = value;
        i++;
        break;
      case "--depth":
        options.depth = parsePositiveInt(value, "--depth");
        i++;
        break;
      case "--movetime":
        options.movetime = parsePositiveInt(value, "--movetime");
        i++;
        break;
      case "--max-cp":
        options.maxCp = parsePositiveInt(value, "--max-cp");
        i++;
        break;
      case "--limit":
        options.limit = parsePositiveInt(value, "--limit");
        i++;
        break;
      case "--metadata":
        options.metadata = true;
        break;
      case "--v":
        options.verbose = Math.max(options.verbose, 1);
        break;
      case "--vv":
        options.verbose = Math.max(options.verbose, 2);
        break;
      case "--help":
      case "-h":
        usage(0);
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        usage();
    }
  }

  return options;
}

function parsePositiveInt(value, optionName) {
  const parsed = parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${optionName} must be a positive integer.`);
  }
  return parsed;
}

function readPositions(inputPath) {
  const lines = fs
    .readFileSync(inputPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !line.startsWith("#"));

  const positions = [];
  for (let i = 0; i < lines.length; i += 2) {
    const opening = lines[i];
    const fen = lines[i + 1];
    if (!opening || !fen) {
      throw new Error(`Input has an incomplete opening/FEN pair near line ${i + 1}.`);
    }
    positions.push({ opening, fen });
  }
  return positions;
}

function parseScore(line) {
  const match = line.match(/\bscore\s+(cp|mate)\s+(-?\d+)/);
  if (!match) return undefined;
  return { type: match[1], value: parseInt(match[2], 10) };
}

class Stockfish {
  constructor(binary, verbose) {
    this.verbose = verbose;
    this.pending = [];
    this.lastScore = undefined;
    this.engine = spawn(binary, [], { stdio: ["pipe", "pipe", "pipe"] });
    this.lines = readline.createInterface({ input: this.engine.stdout });

    this.lines.on("line", (line) => this.onLine(line));
    this.engine.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      if (text.trim()) process.stderr.write(text);
    });
    this.engine.on("error", (error) => {
      this.rejectPending(error);
    });
    this.engine.on("exit", (code, signal) => {
      if (this.pending.length > 0) {
        this.rejectPending(
          new Error(`Stockfish exited before finishing: code=${code} signal=${signal}`)
        );
      }
    });
  }

  onLine(line) {
    if (this.verbose >= 2) console.error(`< ${line}`);

    const score = parseScore(line);
    if (score) this.lastScore = score;

    const pending = this.pending[0];
    if (!pending) return;

    if (line === pending.waitFor || line.startsWith(pending.waitFor + " ")) {
      this.pending.shift();
      pending.resolve({ line, score: this.lastScore });
    }
  }

  rejectPending(error) {
    while (this.pending.length > 0) {
      this.pending.shift().reject(error);
    }
  }

  send(command) {
    if (this.verbose >= 2) console.error(`> ${command}`);
    this.engine.stdin.write(command + "\n");
  }

  waitFor(waitFor) {
    return new Promise((resolve, reject) => {
      this.pending.push({ waitFor, resolve, reject });
    });
  }

  async initialize() {
    this.send("uci");
    await this.waitFor("uciok");
    this.send("isready");
    await this.waitFor("readyok");
  }

  async analyze(fen, options) {
    this.lastScore = undefined;
    this.send(`position fen ${fen}`);
    if (options.movetime) {
      this.send(`go movetime ${options.movetime}`);
    } else {
      this.send(`go depth ${options.depth}`);
    }
    const result = await this.waitFor("bestmove");
    if (!result.score) {
      throw new Error(`Stockfish did not report a score for FEN: ${fen}`);
    }
    return result.score;
  }

  async close() {
    this.send("quit");
  }
}

function isFair(score, maxCp) {
  if (score.type === "mate") return false;
  return Math.abs(score.value) <= maxCp;
}

function scoreLabel(score) {
  return `${score.type} ${score.value}`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const positions = readPositions(options.input);
  const selectedPositions = options.limit
    ? positions.slice(0, options.limit)
    : positions;
  const stockfish = new Stockfish(options.stockfish, options.verbose);
  const kept = [];

  await stockfish.initialize();
  try {
    for (let i = 0; i < selectedPositions.length; i++) {
      const position = selectedPositions[i];
      const score = await stockfish.analyze(position.fen, options);
      const fair = isFair(score, options.maxCp);

      if (options.verbose >= 1) {
        console.error(
          `${i + 1}/${selectedPositions.length} ${fair ? "keep" : "drop"} ` +
            `${scoreLabel(score)} ${position.fen}`
        );
      }

      if (fair) {
        kept.push({ ...position, score });
      }
    }
  } finally {
    await stockfish.close();
  }

  const output = [];
  for (const position of kept) {
    output.push(position.opening);
    output.push(position.fen);
    if (options.metadata) {
      const searchLabel = options.movetime
        ? `movetime=${options.movetime}`
        : `depth=${options.depth}`;
      output.push(`# stockfish ${searchLabel} score=${scoreLabel(position.score)}`);
    }
  }

  fs.writeFileSync(options.output, output.join("\n") + (output.length ? "\n" : ""));
  console.log(
    `Wrote ${kept.length}/${selectedPositions.length} fair positions to ${options.output}.`
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
