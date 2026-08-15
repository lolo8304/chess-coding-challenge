#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
perft_js="$script_dir/perft.js"
fixture_json="$script_dir/regression-perft.json"
max_depth="${1:-}"
filter="${2:-}"

if [ ! -f "$fixture_json" ]; then
  echo "Error: regression-perft.json not found next to this script" >&2
  exit 1
fi

if [ -z "$max_depth" ]; then
  max_depth="$(node -e "console.log(require(process.argv[1]).defaultMaxDepth || 2)" "$fixture_json")"
fi

if ! [[ "$max_depth" =~ ^[0-9]+$ ]] || [ "$max_depth" -lt 1 ]; then
  echo "Usage: $0 [max-depth] [name-filter]" >&2
  echo "Example: $0 2 chess960-032" >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is not available on PATH" >&2
  exit 1
fi

if [ ! -f "$perft_js" ]; then
  echo "Error: perft.js not found next to this script" >&2
  exit 1
fi

PERFT_JS="$perft_js" FIXTURE_JSON="$fixture_json" MAX_DEPTH="$max_depth" CASE_FILTER="$filter" node <<'REGRESSION_NODE'
const { execFileSync } = require("child_process");
const fs = require("fs");

const perftJs = process.env.PERFT_JS;
const fixtureJson = process.env.FIXTURE_JSON;
const maxDepth = Number(process.env.MAX_DEPTH || 2);
const caseFilter = process.env.CASE_FILTER || "";
const fixture = JSON.parse(fs.readFileSync(fixtureJson, "utf8"));
const statAliases = { captures: "hits", promotions: "prom" };

function runPerft(depth, fen) {
  const output = execFileSync("node", [perftJs, String(depth), fen], {
    encoding: "utf8",
    maxBuffer: 50 * 1024 * 1024,
  });
  const pattern =
    "^" +
    depth +
    ": Nodes=(\\d+), hits=(\\d+), ep=(\\d+), castles=(\\d+), prom=(\\d+), checks=(\\d+)";
  const summary = output.match(new RegExp(pattern, "m"));
  if (!summary) {
    throw new Error("Could not parse perft summary for depth " + depth);
  }
  return {
    nodes: Number(summary[1]),
    hits: Number(summary[2]),
    ep: Number(summary[3]),
    castles: Number(summary[4]),
    prom: Number(summary[5]),
    checks: Number(summary[6]),
  };
}

function expectedEntries(expected) {
  return Object.entries(expected)
    .filter(([key]) => key !== "depth")
    .map(([key, value]) => [statAliases[key] || key, value]);
}

const cases = fixture.cases || [];
const selectedCases = caseFilter
  ? cases.filter((testCase) => testCase.name.includes(caseFilter))
  : cases;

if (selectedCases.length === 0) {
  console.error("No regression cases matched filter: " + caseFilter);
  process.exit(1);
}

let failures = 0;
let depthTargets = 0;

console.log("Perft Regression Suite (max depth " + maxDepth + ")");
console.log("Fixture: " + fixtureJson);
console.log("Cases: " + selectedCases.length + " / " + cases.length);

let i = 0;
for (const testCase of selectedCases) {
  i++;
  const expectations = testCase.expectations || testCase.depths || [];
  const depths = expectations.filter((expected) => expected.depth <= maxDepth);
  if (depths.length === 0) continue;

  const results = [];
  for (const expected of depths) {
    depthTargets++;
    const actual = runPerft(expected.depth, testCase.fen);
    const mismatches = expectedEntries(expected).filter(
      ([key, value]) => actual[key] !== value
    );

    if (mismatches.length === 0) {
      results.push("d" + expected.depth + "=" + actual.nodes);
      continue;
    }

    failures++;
    const detail = mismatches
      .map(([key, value]) => key + ": expected " + value + ", got " + actual[key])
      .join("; ");
    console.log(i+": FAIL " + testCase.name + " depth " + expected.depth + ": " + detail);
    console.log(i+": FEN: " + testCase.fen);
  }

  if (failures === 0) {
    console.log(i+": OK   " + testCase.name + " " + results.join(" "));
  }
}

console.log(
  "\nChecked " + depthTargets + " depth targets across " + selectedCases.length + " cases."
);
if (failures > 0) {
  console.error(failures + " regression target(s) failed.");
  process.exit(1);
}
console.log("All regression perft targets passed.");
REGRESSION_NODE
