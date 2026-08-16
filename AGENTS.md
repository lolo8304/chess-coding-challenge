# AGENTS.md

Guidance for coding agents working on this repository.

## Project Overview

This is a self-made JavaScript chess engine and browser frontend. It runs directly in the browser with P5.js, without a bundler or package manager.

Main capabilities:

- Manual chess play on a canvas-based board.
- Human vs AI and AI vs AI play through the frontend controls.
- FEN loading through the input field or URL hash.
- Legal move generation, including castling, promotion, en passant-related state, checks, and checkmate/stalemate handling.
- AI move choice through alpha-beta search.
- Zobrist hashing and a transposition table for search reuse.
- Perft-style move-generation testing.

## Runtime Model

The app is loaded from `index.html`. JavaScript files are included as plain `<script>` tags and share globals, so script order matters.

Important entry points:

- `index.html`: frontend markup, controls, script loading order, FEN form, AI toggles, perft button.
- `chess.js`: P5 lifecycle (`preload`, `setup`, `draw`), canvas sizing, top-level game globals.
- `game.js`: game loop, turn changes, click handling, undo flow, frontend-to-engine coordination.
- `board.js`: board drawing, square selection, piece rendering, user click mapping.
- `board-data.js`: board state, FEN parsing/output, move application/undo, legal move calculation, perft helpers.
- `board-moves.js`: `Move`, `LegalMoves`, pseudo/legal move generation and filtering.
- `board-pieces.js`: piece constants, FEN symbols, evaluation tables, coordinate helpers.
- `computerplayers.js`: AI player factory, random players, alpha-beta player, evaluator.
- `transposition-table.js`: transposition table storage and lookup.
- `zobrist.js`: deterministic Zobrist key generation and hashing helpers.
- `bit-board.js`: bit-board representation used for hashing/search support.
- `history.js`: move history and undo-related state.
- `perft.js` / `perft.sh`: command-line move-generation testing experiments.

## Running The App

Open `index.html` directly in a browser.

For local HTTP testing, use a simple static server from the repository root, for example:

```sh
python3 -m http.server 8000
```

Then open:

```text
http://localhost:8000
```

The app can also start from a FEN in the URL hash:

```text
http://localhost:8000/#rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR%20w%20KQkq%20-%200%201
```

## Validation

There is no package manager setup and no formal test runner. Validate changes manually and with targeted move-generation checks.

Manual browser checks:

- Load `index.html` or the local static server URL.
- Start a new game.
- Make legal and illegal moves.
- Toggle WHITE/BLACK AI on and off.
- Use Undo after human moves and after AI responses.
- Load a FEN through the input and through the URL hash.
- Use the "Test moves" button for perft-style checks.

Command-line perft support exists but is experimental. If you use it, verify the Node path still works before relying on it:

```sh
node perft.js 3 "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
```

Known README limitation: move-generation counts do not yet fully match the reference FEN/perft library in all cases, and performance is still being improved.

## Engine Invariants

Keep these rules in mind when changing engine code:

- Board squares are a 64-element array indexed from top-left to bottom-right.
- Piece values combine type bits and color bits. Use `Piece.PIECES_MASK` and `Piece.COLOR_MASK` instead of ad hoc numeric checks.
- The current side to move is tracked through `game.color` in the browser flow and `BoardData.legalMoves.color` in board state.
- After making or undoing a move, legal moves must be recalculated for the side to move.
- `BoardData.piecesCache` must stay synchronized with `squares`; prefer `setPiece` / `setPieceInternal` rather than direct square mutation.
- `Move.makeMove()` records undo information. Do not bypass it unless you also preserve undo correctness.
- Castling rights, en passant targets, side to move, and pieces all affect Zobrist hashes. Any state change in those areas must be reflected in hash inputs.
- The transposition table stores entries by Zobrist hash and depth. When changing evaluation or move ordering, check whether stored `bestMove` and flags remain valid.
- Search code currently mutates board state recursively, then undoes moves. Always pair every `makeMove` with a matching undo path, even on early returns.

## Frontend Notes

The frontend is intentionally simple:

- P5.js owns the canvas lifecycle.
- DOM controls in `index.html` call global functions directly.
- Piece artwork is loaded from `images/Chess_Pieces_Sprite-large.png`.
- Canvas sizing is recalculated on resize in `chess.js`.

When editing the UI:

- Preserve direct browser execution. Do not introduce build steps unless explicitly requested.
- Keep script order in `index.html` consistent with global dependencies.
- Test on both desktop-sized and narrow/mobile-sized windows.
- Avoid blocking the P5 draw loop with long synchronous UI work where possible.

## AI Notes

Computer players are registered in `computerplayers.js`:

- `random`
- `hit-random`
- `alpha-beta`

The default is:

```js
computerName = "alpha-beta";
```

The alpha-beta player uses `Evaluator.searchAlphaBetaPruningAll(...)`, static evaluation, move ordering, Zobrist hashes, and the shared transposition table.

When working on AI:

- Keep search behavior deterministic unless randomness is intentional.
- Log search stats sparingly; verbose output can make browser play noisy.
- Re-check undo correctness after search changes.
- Compare behavior on tactical FENs, not only the starting position.

## Coding Style

- Use plain JavaScript compatible with direct browser script loading.
- Prefer existing classes and globals over adding new frameworks.
- Keep comments short and useful; many files are exploratory, so explain only non-obvious rules or state transitions.
- Preserve ASCII unless editing an existing non-ASCII string.
- Avoid unrelated formatting churn.
- Do not remove `.idea/` or other local user files unless asked.

## Common Pitfalls

- Breaking global script load order in `index.html`.
- Updating `squares` without updating `piecesCache`.
- Forgetting to recalculate legal moves after mutating board state.
- Leaving `game.color` inconsistent during recursive AI search.
- Storing or reusing transposition-table entries with incomplete hash state.
- Testing only happy-path moves and missing castling, en passant, promotion, check, and pinned-piece cases.
- Assuming command-line Node execution is as complete as the browser path.

## Run perfts

- never go beyond 3, 3 is max due to performance issues on coding side
- for regressions tests within after an agent change - run the first 1-20 in pert only
- run local perft using "./perft.sh 2 '<fen string>'
- run stockfish perft using "./stockfish.sh 2 '<fen string>'"

## Commit, Push, merge rules

- use the existing main branch
- before commit, make a branch in form "feature/<name>", commit the changes, push, and make a PR to main, and auto merge
- after merge, checkout main and pull changes
- always delete the feature branch after merge

## Important Rules for the Agent

- whenever you make changes, accept that i also make changes myself and always use all changes in git. also for testing: don’t start any services.
- i have stated them in watch mode and you can use it via port 8080
- Other important tip: don’t write too much as a final response. Keep it short
- dont use p5.min.js for code analysis
- if there is a bug question, after fixing the bug add this fen and the numbers as a regression test
- 
