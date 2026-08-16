#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

usage() {
  cat <<'EOF'
Usage: ./elo-calculator.sh [stockfish-elo options]

Runs the local alpha-beta AI against limited-Elo Stockfish at depth 4 by
default, prints the match output, and appends one CSV row to the Elo history.

Output file:
  ELO_RESULTS_FILE=elo-results.csv

Common examples:
  ./elo-calculator.sh
  GAMES=20 STOCKFISH_ELO=1400 ./elo-calculator.sh
  ELO_RESULTS_FILE=elo-history.csv ./elo-calculator.sh --games 10

Any options are passed through to stockfish-elo.sh.
EOF
}

if [[ "${1:-}" == "--help" || "${1:-}" == "-h" ]]; then
  usage
  echo
  ./stockfish-elo.sh --help
  exit 0
fi

RESULTS_FILE="${ELO_RESULTS_FILE:-elo-results.csv}"
ENGINE_DEPTH_VALUE="${ENGINE_DEPTH:-4}"
timestamp="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
tmp_output="$(mktemp)"

cleanup() {
  rm -f "$tmp_output"
}
trap cleanup EXIT

./stockfish-elo.sh "$@" --engine-depth "$ENGINE_DEPTH_VALUE" | tee "$tmp_output"

stockfish_elo="$(
  awk -F': ' '/^Opponent Stockfish Elo:/ { value = $2 } END { print value }' "$tmp_output"
)"
score_line="$(
  awk -F': ' '/^AI score:/ { value = $2 } END { print value }' "$tmp_output"
)"
calculated_elo="$(
  awk '/^Estimated AI Elo:/ { value = $4 } END { print value }' "$tmp_output"
)"

if [[ -z "$stockfish_elo" || -z "$score_line" || -z "$calculated_elo" ]]; then
  echo "Could not parse Elo result from stockfish-elo.sh output." >&2
  exit 1
fi

wins="$(awk '/^Game / && / win / { count++ } END { print count + 0 }' "$tmp_output")"
draws="$(awk '/^Game / && / draw / { count++ } END { print count + 0 }' "$tmp_output")"
losses="$(awk '/^Game / && / loss / { count++ } END { print count + 0 }' "$tmp_output")"
results="score=${score_line}; wins=${wins}; draws=${draws}; losses=${losses}"

if [[ ! -f "$RESULTS_FILE" ]]; then
  printf 'timestamp,results,calculated_elo,depth,stockfish_elo\n' >>"$RESULTS_FILE"
fi

csv_escape() {
  local value="${1//\"/\"\"}"
  printf '"%s"' "$value"
}

{
  csv_escape "$timestamp"
  printf ','
  csv_escape "$results"
  printf ','
  csv_escape "$calculated_elo"
  printf ','
  csv_escape "$ENGINE_DEPTH_VALUE"
  printf ','
  csv_escape "$stockfish_elo"
  printf '\n'
} >>"$RESULTS_FILE"

echo "Elo result appended to $RESULTS_FILE"
