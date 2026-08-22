#!/usr/bin/env python3
"""Extract random playable starting positions from a Lichess PGN file."""

import argparse
import random
import sys
from pathlib import Path

try:
    import chess.pgn
except ImportError as exc:
    raise SystemExit(
        "Missing dependency: python-chess. Install it with:\n"
        "  python3 -m pip install python-chess"
    ) from exc


PIECE_SYMBOLS_FOR_MATERIAL = "rnbq"


def material_piece_count(fen):
    """Count non-pawn, non-king pieces, matching the screenshot logic."""
    placement = fen.split(" ", 1)[0]
    return sum(placement.lower().count(symbol) for symbol in PIECE_SYMBOLS_FOR_MATERIAL)


def choose_even_ply(min_ply, max_ply):
    ply = random.randint(min_ply, max_ply)
    return ply & ~1


def position_from_game(game, min_ply, max_ply, min_remaining_plies, min_material_pieces):
    moves = list(game.mainline_moves())
    if not moves:
        return None

    ply_to_play = choose_even_ply(min_ply, max_ply)
    if len(moves) < ply_to_play + min_remaining_plies:
        return None

    board = game.board()
    for ply, move in enumerate(moves, start=1):
        board.push(move)
        if ply == ply_to_play:
            fen = board.fen()
            if material_piece_count(fen) < min_material_pieces:
                return None

            return {
                "opening": game.headers.get("Opening", "?"),
                "fen": fen,
                "game_id": game.headers.get("Site", "?"),
                "ply": ply,
                "remaining_plies": len(moves) - ply,
                "material_pieces": material_piece_count(fen),
            }

    return None


def format_position(position, include_metadata):
    lines = [position["opening"], position["fen"]]
    if include_metadata:
        lines.append(
            "# "
            f"site={position['game_id']} "
            f"ply={position['ply']} "
            f"remaining_plies={position['remaining_plies']} "
            f"material_pieces={position['material_pieces']}"
        )
    return lines


def extract_positions(args):
    positions = []
    games_read = 0

    with args.pgn.open(encoding="utf-8", errors="replace") as pgn:
        while args.max_games is None or games_read < args.max_games:
            game = chess.pgn.read_game(pgn)
            if game is None:
                break

            games_read += 1
            position = position_from_game(
                game,
                args.min_ply,
                args.max_ply,
                args.min_remaining_plies,
                args.min_material_pieces,
            )
            if position is not None:
                positions.append(position)
                if len(positions) >= args.count:
                    break

            if args.progress and games_read % args.progress == 0:
                print(
                    f"read {games_read} games, kept {len(positions)} positions",
                    file=sys.stderr,
                )

    return positions, games_read


def parse_args():
    parser = argparse.ArgumentParser(
        description="Pick random midgame FEN positions from a Lichess PGN."
    )
    parser.add_argument(
        "pgn",
        nargs="?",
        type=Path,
        default=Path("lichess_db_standard_rated_2016-03.pgn"),
        help="PGN file to read. Defaults to lichess_db_standard_rated_2016-03.pgn.",
    )
    parser.add_argument(
        "-o",
        "--output",
        type=Path,
        default=Path("output.txt"),
        help="Output file. Defaults to output.txt.",
    )
    parser.add_argument(
        "-c",
        "--count",
        type=int,
        default=1000,
        help="Number of positions to write. Defaults to 1000.",
    )
    parser.add_argument(
        "--max-games",
        type=int,
        default=150000,
        help="Maximum games to scan. Use 0 for all games. Defaults to 150000.",
    )
    parser.add_argument(
        "--min-ply",
        type=int,
        default=16,
        help="Minimum random ply to use. Defaults to 16.",
    )
    parser.add_argument(
        "--max-ply",
        type=int,
        default=35,
        help="Maximum random ply to use before rounding down to an even ply. Defaults to 35.",
    )
    parser.add_argument(
        "--min-remaining-plies",
        type=int,
        default=40,
        help="Required plies still available after the position. Defaults to 40.",
    )
    parser.add_argument(
        "--min-material-pieces",
        type=int,
        default=10,
        help="Minimum r/n/b/q pieces still on the board. Defaults to 10.",
    )
    parser.add_argument(
        "--seed",
        type=int,
        help="Random seed for reproducible output.",
    )
    parser.add_argument(
        "--metadata",
        action="store_true",
        help="Include comment lines with source game and filter details.",
    )
    parser.add_argument(
        "--progress",
        type=int,
        default=0,
        help="Print progress to stderr every N games. Defaults to disabled.",
    )
    args = parser.parse_args()

    if args.count < 1:
        parser.error("--count must be at least 1")
    if args.min_ply < 0:
        parser.error("--min-ply must not be negative")
    if args.max_ply < args.min_ply:
        parser.error("--max-ply must be greater than or equal to --min-ply")
    if args.min_remaining_plies < 0:
        parser.error("--min-remaining-plies must not be negative")
    if args.min_material_pieces < 0:
        parser.error("--min-material-pieces must not be negative")
    if args.max_games == 0:
        args.max_games = None

    return args


def main():
    args = parse_args()
    if args.seed is not None:
        random.seed(args.seed)

    if not args.pgn.exists():
        raise SystemExit(f"PGN file not found: {args.pgn}")

    positions, games_read = extract_positions(args)

    with args.output.open("w", encoding="utf-8") as output:
        for position in positions:
            for line in format_position(position, args.metadata):
                output.write(line + "\n")

    print(f"Wrote {len(positions)} positions to {args.output} from {games_read} games.")
    if len(positions) < args.count:
        print(
            f"Warning: requested {args.count} positions but only found {len(positions)}.",
            file=sys.stderr,
        )


if __name__ == "__main__":
    main()
