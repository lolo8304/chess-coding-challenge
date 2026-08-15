#!/usr/bin/env bash
set -euo pipefail

url="https://chessprogramming.org/Chess960_Perft_Results"
script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
compare_script="$script_dir/compare-perft.sh"
max_depth="${1:-2}"
limit="${2:-}"

if ! [[ "$max_depth" =~ ^[0-9]+$ ]] || [ "$max_depth" -lt 1 ]; then
  echo "Usage: $0 [depth] [limit]" >&2
  echo "Example: $0 2 10" >&2
  exit 1
fi

if [ -n "$limit" ] && { ! [[ "$limit" =~ ^[0-9]+$ ]] || [ "$limit" -lt 1 ]; }; then
  echo "Error: limit must be a positive integer" >&2
  exit 1
fi

if [ ! -x "$compare_script" ]; then
  echo "Error: compare-perft.sh must exist and be executable next to this script" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is not available on PATH" >&2
  exit 1
fi

rows="$(
  PAGE_URL="$url" node <<'NODE'
const url = process.env.PAGE_URL;

function decodeHtml(value) {
  return value
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

async function main() {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }

  const page = await response.text();
  const cells = [...page.matchAll(/<td[^>]*>(.*?)<\/td>/g)].map((match) =>
    decodeHtml(match[1].replace(/<[^>]+>/g, '').trim())
  );

  for (let i = 0; i + 7 < cells.length; i += 8) {
    const row = cells.slice(i, i + 8);
    console.log(row.join('\t'));
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
NODE
)"

total_rows="$(printf '%s\n' "$rows" | sed '/^$/d' | wc -l | tr -d ' ')"
if [ "$total_rows" -eq 0 ]; then
  echo "Error: no perft rows parsed from $url" >&2
  exit 1
fi

echo "Source: $url"
echo "Parsed rows: $total_rows"
echo "Max depth: $max_depth"
if [ -n "$limit" ]; then
  echo "Limit: $limit"
fi
echo

checked=0
failed=0

while IFS=$'\t' read -r index fen d1 d2 d3 d4 d5 d6; do
  if [ -z "$index" ]; then
    continue
  fi

  checked=$((checked + 1))
  if [ -n "$limit" ] && [ "$checked" -gt "$limit" ]; then
    break
  fi

  echo "=== #$index ==="
  echo "Page nodes: d1=$d1 d2=$d2 d3=$d3 d4=$d4 d5=$d5 d6=$d6"
  if "$compare_script" "$max_depth" "$fen"; then
    echo
    continue
  fi

  failed=$((failed + 1))
  echo "Failed row #$index"
  echo
  break
done <<< "$rows"

if [ "$failed" -eq 0 ]; then
  echo "All checked rows passed."
else
  echo "$failed row failed."
fi

exit "$failed"
