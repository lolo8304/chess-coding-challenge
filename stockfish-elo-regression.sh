#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
"$SCRIPT_DIR/_check-node.sh"
node "$SCRIPT_DIR/stockfish-elo-regression.js"
