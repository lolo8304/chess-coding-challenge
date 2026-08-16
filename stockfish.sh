#!/usr/bin/env bash

level=$1
fen=$2
if [ -z "$level" ]; then
  level=2
fi
if [ -z "$fen" ]; then
  read -p "Enter FEN string: " fen
fi
echo -e "position fen $fen\ngo perft $level\nquit" | stockfish
