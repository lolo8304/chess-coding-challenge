#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  node stockfish-fair-positions.js --help
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
    echo "Or run with: STOCKFISH_BIN=/path/to/stockfish ./stockfish-fair-positions.sh" >&2
    exit 1
  fi
fi

EXTRA_ARGS=()
if [[ "${VERBOSE:-0}" == "2" || "${VERBOSE:-}" == "vv" ]]; then
  EXTRA_ARGS+=(--vv)
elif [[ "${VERBOSE:-0}" == "1" || "${VERBOSE:-}" == "true" || "${VERBOSE:-}" == "v" ]]; then
  EXTRA_ARGS+=(--v)
fi
if [[ -n "${MOVETIME:-}" ]]; then
  EXTRA_ARGS+=(--movetime "$MOVETIME")
fi

node stockfish-fair-positions.js \
  --stockfish "$STOCKFISH_BIN" \
  --input "${INPUT:-output.txt}" \
  --output "${OUTPUT:-fair_positions.txt}" \
  --depth "${DEPTH:-10}" \
  --max-cp "${MAX_CP:-150}" \
  ${EXTRA_ARGS[@]+"${EXTRA_ARGS[@]}"} \
  "$@"
