# chess-coding-challenge

A plain JavaScript chess engine and browser UI built for the
[Coding Challenges](https://codingchallenges.fyi) chess-engine challenge.

The project runs directly in the browser with P5.js. There is no bundler,
framework, or package-manager install step. The engine supports legal move
generation, FEN loading, castling, promotion, en passant state, check/checkmate
handling, alpha-beta AI search, Zobrist hashing, transposition tables, and
perft-style validation scripts.

## Requirements

- A modern browser
- Node.js for command-line scripts
- Stockfish for Stockfish comparison and Elo/replay scripts

Install Stockfish on macOS with Homebrew:

```sh
brew install stockfish
```

Check the local Node version:

```sh
node --version
```

The repository declares Node `24.x` in [package.json](package.json).

## Build

There is no build step.

The app is loaded from [index.html](index.html), and scripts are included with
plain `<script>` tags. Script order matters because the engine uses browser
globals.

## Run

Open [index.html](index.html) directly in a browser, or use the already-running
watch/static server on port `8080`:

```text
http://localhost:8080
```

You can also serve the directory manually when needed:

```sh
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

Load a position from the URL hash:

```text
http://localhost:8080/#rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR%20w%20KQkq%20-%200%201
```

Online version:

```text
https://chess-coding-challenge.vercel.app
```

## Browser Usage

- Make moves on the canvas board.
- Toggle white/black AI from the page controls.
- Paste a FEN into the FEN input.
- Use the URL hash to start from a FEN.
- Use Undo to step back through moves.
- Use the Test moves button for browser-side perft checks.

## Command-Line Perft

Run the local move generator from Node:

```sh
node perft.js 3 "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
```

Useful flags:

```sh
node perft.js --nodes-only 3 "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
node perft.js --profile 3 "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
```

Keep perft depth at `3` or lower for routine checks. Deeper runs can be slow.

## Compare Script

Compare this engine's perft node counts against Stockfish for one FEN:

```sh
./compare-perft.sh 3 "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
```

The script prints a table with:

- depth
- this engine's node count
- Stockfish node count
- `OK` or `FAIL`

It requires `node` and `stockfish` on `PATH`.

## Chess960 Compare Script

Compare against rows from the ChessProgramming Chess960 perft page:

```sh
./compare-Chess960_Perft_Results.sh 2 10
```

Arguments:

- first argument: max depth
- second argument: optional row limit

Examples:

```sh
./compare-Chess960_Perft_Results.sh 1 5
./compare-Chess960_Perft_Results.sh 2 10
```

This script fetches the Chess960 perft page, parses FEN rows, and calls
[compare-perft.sh](compare-perft.sh) for each selected row.

## Regression Tests

Run stored perft regression fixtures from [regression-perft.json](regression-perft.json):

```sh
./regression-perft.sh 2 "" 20
```

Arguments:

- `max-depth`: maximum perft depth to run
- `name-filter`: optional substring filter for fixture names
- `case-range`: optional case selection

Case range examples:

```sh
./regression-perft.sh 2 "" 20
./regression-perft.sh 2 chess960 10-
./regression-perft.sh 2 chess960 10-20
./regression-perft.sh 2 chess960 random-25
```

For routine post-change checks, use the first 1-20 cases and do not exceed
depth `3`:

```sh
./regression-perft.sh 3 "" 20
```

## Stockfish Elo Script

Run matches between this engine's `alpha-beta` AI and Stockfish's limited-Elo
mode:

```sh
./stockfish-elo.sh
```

Common options:

```sh
./stockfish-elo.sh --games 10 --engine-depth 4 --stockfish-elo 1320
./stockfish-elo.sh --games 20 --engine-depth 4 --stockfish-elo 1400 --v
./stockfish-elo.sh --games 2 --engine-depth 1 --stockfish-movetime 10 --max-plies 20 --vv
```

Verbosity:

- `--v`: game, ply, move, timing, legal move count, and FEN details
- `--vv`: everything from `--v`, plus raw Stockfish UCI traffic

Environment variable alternatives:

```sh
GAMES=20 ENGINE_DEPTH=4 STOCKFISH_ELO=1400 ./stockfish-elo.sh
VERBOSE=1 ./stockfish-elo.sh
VERBOSE=2 ./stockfish-elo.sh
STOCKFISH_BIN=/path/to/stockfish ./stockfish-elo.sh
```

The reported Elo is a match-performance estimate against the selected
Stockfish Elo. Use more games and several opponent Elo levels for a more stable
number.

## Elo Calculator History

Append a depth-4 Elo run to `elo-results.csv` after an optimization:

```sh
./elo-calculator.sh
```

Each run appends one CSV line with `timestamp`, `results`, `calculated_elo`,
`depth`, and `stockfish_elo`. Use `ELO_RESULTS_FILE` to write to another file:

```sh
ELO_RESULTS_FILE=elo-history.csv GAMES=20 STOCKFISH_ELO=1400 ./elo-calculator.sh
```

## Save Stockfish Games

Write replay data while running Elo matches:

```sh
./stockfish-elo.sh --games 2 --save-games stockfish-games.txt
./stockfish-elo.sh --games 2 --save-pgn stockfish-games.pgn
```

Or with an environment variable:

```sh
SAVE_GAMES=stockfish-games.txt ./stockfish-elo.sh --games 2
SAVE_PGN=stockfish-games.pgn ./stockfish-elo.sh --games 2
```

The `.txt` replay file contains:

- Stockfish CLI replay command
- UCI move list
- final FEN
- FEN after every move

The `.pgn` file contains standard PGN/SAN movetext for chess apps.

On macOS, open the PGN with the Stockfish app if it is installed:

```sh
open -a Stockfish stockfish-games.pgn
```

Or open it with the default app for PGN files:

```sh
open stockfish-games.pgn
```

## Replay Saved Games In Stockfish

Start Stockfish with a saved game, load the position, print the board, and keep
Stockfish open for analysis:

```sh
./stockfish-replay.sh stockfish-games.txt
```

Replay a specific saved game:

```sh
./stockfish-replay.sh stockfish-games.txt --game 2
```

Use a specific Stockfish binary:

```sh
./stockfish-replay.sh stockfish-games.txt --stockfish /usr/local/bin/stockfish
STOCKFISH_BIN=/usr/local/bin/stockfish ./stockfish-replay.sh stockfish-games.txt
```

After the board is displayed, useful Stockfish commands include:

```text
eval
go depth 12
go movetime 1000
quit
```

## Project Structure

- [index.html](index.html): page markup, controls, script loading order
- [chess.js](chess.js): P5 lifecycle, canvas sizing, top-level globals
- [game.js](game.js): game loop, turn changes, click handling, AI coordination
- [board.js](board.js): board rendering and user click mapping
- [board-data.js](board-data.js): board state, FEN, move apply/undo, perft helpers
- [board-moves.js](board-moves.js): move model and legal move generation
- [board-pieces.js](board-pieces.js): piece constants, tables, coordinates
- [computerplayers.js](computerplayers.js): AI players and evaluator
- [transposition-table.js](transposition-table.js): search transposition table
- [zobrist.js](zobrist.js), [zobrist-keys.js](zobrist-keys.js): hashing
- [bit-board.js](bit-board.js): bit-board support
- [history.js](history.js): move history and undo state
- [perft.js](perft.js): Node perft harness
- [compare-perft.sh](compare-perft.sh): compare one FEN against Stockfish
- [regression-perft.sh](regression-perft.sh): regression fixture runner
- [stockfish-elo.sh](stockfish-elo.sh), [stockfish-elo.js](stockfish-elo.js): Elo match harness
- [stockfish-replay.sh](stockfish-replay.sh): saved-game Stockfish replay helper

## Known Limitations

- Some move-generation counts may still differ from reference engines for
  specific positions.
- Perft performance is still being improved.
- The Stockfish Elo script gives an approximate match-performance rating, not an
  official Elo.

## Credits

- [Coding Challenges](https://codingchallenges.fyi) for the challenge idea.
- Sebastian Lague's chess-engine videos for engine-building inspiration.
  - https://www.youtube.com/watch?v=U4ogK0MIzqk
  - https://www.youtube.com/watch?v=_vqlIPDR2TU
