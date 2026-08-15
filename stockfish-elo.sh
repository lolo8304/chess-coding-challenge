#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  node stockfish-elo.js --help
  exit 0
fi

STOCKFISH_BIN="${STOCKFISH_BIN:-}"
if [[ -z "$STOCKFISH_BIN" ]]; then
  if command -v stockfish >/dev/null 2>&1; then
    STOCKFISH_BIN="$(command -v stockfish)"
  elif [[ -x /opt/homebrew/bin/stockfish ]]; then
    STOCKFISH_BIN="/opt/homebrew/bin/stockfish"
  elif [[ -x /usr/local/bin/stockfish ]]; then
    STOCKFISH_BIN="/usr/local/bin/stockfish"
  else
    echo "Stockfish not found. Install it with: brew install stockfish" >&2
    echo "Or run with: STOCKFISH_BIN=/path/to/stockfish ./stockfish-elo.sh" >&2
    exit 1
  fi
fi

EXTRA_ARGS=""
if [[ "${VERBOSE:-0}" == "2" || "${VERBOSE:-}" == "vv" ]]; then
  EXTRA_ARGS="--vv"
elif [[ "${VERBOSE:-0}" == "1" || "${VERBOSE:-}" == "true" || "${VERBOSE:-}" == "v" ]]; then
  EXTRA_ARGS="--v"
fi
SAVE_GAMES_FLAG=""
SAVE_GAMES_PATH=""
if [[ -n "${SAVE_GAMES:-}" ]]; then
  SAVE_GAMES_FLAG="--save-games"
  SAVE_GAMES_PATH="$SAVE_GAMES"
fi
SAVE_PGN_FLAG=""
SAVE_PGN_PATH=""
if [[ -n "${SAVE_PGN:-}" ]]; then
  SAVE_PGN_FLAG="--save-pgn"
  SAVE_PGN_PATH="$SAVE_PGN"
fi

node stockfish-elo.js \
  --stockfish "$STOCKFISH_BIN" \
  --games "${GAMES:-10}" \
  --engine-depth "${ENGINE_DEPTH:-4}" \
  --stockfish-elo "${STOCKFISH_ELO:-1320}" \
  --stockfish-movetime "${STOCKFISH_MOVETIME:-100}" \
  --max-plies "${MAX_PLIES:-160}" \
  ${EXTRA_ARGS:+"$EXTRA_ARGS"} \
  ${SAVE_GAMES_FLAG:+"$SAVE_GAMES_FLAG"} \
  ${SAVE_GAMES_PATH:+"$SAVE_GAMES_PATH"} \
  ${SAVE_PGN_FLAG:+"$SAVE_PGN_FLAG"} \
  ${SAVE_PGN_PATH:+"$SAVE_PGN_PATH"} \
  "$@"
