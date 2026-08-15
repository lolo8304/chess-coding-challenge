#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

usage() {
  cat <<'USAGE' >&2
Usage: ./stockfish-replay.sh [saved-game-file] [--game N]

Starts Stockfish with a saved game from stockfish-elo.js / stockfish-elo.sh,
loads the selected game position, prints the board with "d", then leaves
Stockfish open for analysis commands.

Options:
  --game N             Replay game number N from the saved file (default: 1)
  --stockfish <path>   Stockfish binary path
  -h, --help           Show this help

Examples:
  ./stockfish-replay.sh stockfish-games.txt
  ./stockfish-replay.sh stockfish-games.txt --game 2
  STOCKFISH_BIN=/path/to/stockfish ./stockfish-replay.sh stockfish-games.txt
USAGE
}

GAME_FILE="stockfish-games.txt"
GAME_NUMBER=1
STOCKFISH_ARG="${STOCKFISH_BIN:-}"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --game)
      GAME_NUMBER="${2:-}"
      shift 2
      ;;
    --stockfish)
      STOCKFISH_ARG="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    -*)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
    *)
      GAME_FILE="$1"
      shift
      ;;
  esac
done

if ! [[ "$GAME_NUMBER" =~ ^[0-9]+$ ]] || [[ "$GAME_NUMBER" -lt 1 ]]; then
  echo "--game must be a positive integer." >&2
  exit 1
fi

if [[ ! -f "$GAME_FILE" ]]; then
  echo "Saved game file not found: $GAME_FILE" >&2
  echo "Create one with: ./stockfish-elo.sh --save-games $GAME_FILE" >&2
  exit 1
fi

if [[ -z "$STOCKFISH_ARG" ]]; then
  if command -v stockfish >/dev/null 2>&1; then
    STOCKFISH_ARG="$(command -v stockfish)"
  elif [[ -x /opt/homebrew/bin/stockfish ]]; then
    STOCKFISH_ARG="/opt/homebrew/bin/stockfish"
  elif [[ -x /usr/local/bin/stockfish ]]; then
    STOCKFISH_ARG="/usr/local/bin/stockfish"
  else
    echo "Stockfish not found. Install it with: brew install stockfish" >&2
    echo "Or run with: STOCKFISH_BIN=/path/to/stockfish ./stockfish-replay.sh $GAME_FILE" >&2
    exit 1
  fi
fi

POSITION_COMMAND="$(
  awk -v target="$GAME_NUMBER" '
    /^Game [0-9]+$/ {
      split($0, parts, " ");
      inGame = (parts[2] == target);
      next;
    }
    inGame && /^position fen / {
      print;
      found = 1;
      exit;
    }
    END {
      if (!found) exit 2;
    }
  ' "$GAME_FILE"
)" || {
  echo "Could not find replay command for game $GAME_NUMBER in $GAME_FILE." >&2
  exit 1
}

echo "Starting Stockfish: $STOCKFISH_ARG"
echo "Loaded game $GAME_NUMBER from $GAME_FILE"
echo "$POSITION_COMMAND"
echo
echo "Commands queued: position, d"
echo "Try next: eval, go depth 12, go movetime 1000, quit"
echo

{
  printf '%s\n' "$POSITION_COMMAND"
  printf 'd\n'
  cat
} | "$STOCKFISH_ARG"
