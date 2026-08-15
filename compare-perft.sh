#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 1 ]; then
  echo "Usage: $0 <depth> \"<fen>\""
  echo "Example: $0 3 \"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1\""
  exit 1
fi

max_depth="$1"
shift
if [ "$#" -eq 0 ]; then
  printf "FEN: " >&2
  read -r fen
else
  fen="$*"
fi
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
perft_js="$script_dir/perft.js"

if ! [[ "$max_depth" =~ ^[0-9]+$ ]] || [ "$max_depth" -lt 1 ]; then
  echo "Error: depth must be a positive integer" >&2
  exit 1
fi

if [ -z "$fen" ]; then
  echo "Error: FEN must not be empty" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is not available on PATH" >&2
  exit 1
fi

if ! command -v stockfish >/dev/null 2>&1; then
  echo "Error: stockfish is not available on PATH" >&2
  exit 1
fi

if [ ! -f "$perft_js" ]; then
  echo "Error: perft.js not found next to this script" >&2
  exit 1
fi

engine_nodes() {
  local depth="$1"
  node "$perft_js" "$depth" "$fen" |
    awk '/^Nodes: / { nodes = $2 } END { if (nodes != "") print nodes }'
}

stockfish_nodes() {
  local depth="$1"
  printf "position fen %s\ngo perft %s\nquit\n" "$fen" "$depth" |
    stockfish |
    tr -d '\r' |
    awk '/^Nodes searched: / { nodes = $3 } END { if (nodes != "") print nodes }'
}

printf 'FEN: %s\n\n' "$fen"
printf '%-7s %-12s %-12s %s\n' "Depth" "Engine" "Stockfish" "Result"

failed=0
for ((depth = 1; depth <= max_depth; depth++)); do
  engine="$(engine_nodes "$depth")"
  stockfish="$(stockfish_nodes "$depth")"

  if [ -z "$engine" ]; then
    echo "Error: could not parse engine node count at depth $depth" >&2
    exit 1
  fi

  if [ -z "$stockfish" ]; then
    echo "Error: could not parse Stockfish node count at depth $depth" >&2
    exit 1
  fi

  if [ "$engine" = "$stockfish" ]; then
    result="OK"
  else
    result="FAIL"
    failed=1
  fi

  printf '%-7s %-12s %-12s %s\n' "$depth" "$engine" "$stockfish" "$result"
done

exit "$failed"
