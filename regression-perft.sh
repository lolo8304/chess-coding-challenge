#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
perft_js="$script_dir/perft.js"
fixture_json="$script_dir/regression-perft.json"
max_depth="${1:-}"
filter="${2:-}"
range="${3:-}"

if [ ! -f "$fixture_json" ]; then
  echo "Error: regression-perft.json not found next to this script" >&2
  exit 1
fi

if [ -z "$max_depth" ]; then
  max_depth="$(node -e "console.log(require(process.argv[1]).defaultMaxDepth || 2)" "$fixture_json")"
fi

if ! [[ "$max_depth" =~ ^[0-9]+$ ]] || [ "$max_depth" -lt 1 ]; then
  echo "Usage: $0 [max-depth] [name-filter] [case-range]" >&2
  echo "Examples:" >&2
  echo "  $0 2 '' 10" >&2
  echo "  $0 2 chess960 10-" >&2
  echo "  $0 2 chess960 10-20" >&2
  echo "  $0 2 chess960 random-25" >&2
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

PERFT_JS="$perft_js" FIXTURE_JSON="$fixture_json" MAX_DEPTH="$max_depth" CASE_FILTER="$filter" CASE_RANGE="$range" node <<'REGRESSION_NODE'
const { execFileSync } = require("child_process");
const fs = require("fs");

const perftJs = process.env.PERFT_JS;
const fixtureJson = process.env.FIXTURE_JSON;
const maxDepth = Number(process.env.MAX_DEPTH || 2);
const caseFilter = process.env.CASE_FILTER || "";
const caseRange = process.env.CASE_RANGE || "";
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
  const rootMoves = Array.from(
    output.matchAll(/^([a-h][1-8][a-h][1-8][qrbn]?): Nodes=/gm),
    (match) => match[1]
  );
  return {
    nodes: Number(summary[1]),
    hits: Number(summary[2]),
    ep: Number(summary[3]),
    castles: Number(summary[4]),
    prom: Number(summary[5]),
    checks: Number(summary[6]),
    rootMoves,
  };
}

function expectedEntries(expected) {
  return Object.entries(expected)
    .filter(([key]) => key !== "depth")
    .map(([key, value]) => [statAliases[key] || key, value]);
}

const cases = fixture.cases || [];
let selectedCases = (caseFilter
  ? cases.filter((testCase) => testCase.name.includes(caseFilter))
  : cases
).map((testCase) => ({
  ...testCase,
  fixtureIndex: cases.indexOf(testCase) + 1,
}));

function parseCaseRange(value, total) {
  if (!value) return { type: "range", start: 1, end: total };

  let match = value.match(/^random-(\d+)$/);
  if (match) {
    return { type: "random", count: Number(match[1]) };
  }

  match = value.match(/^(\d+)$/);
  if (match) {
    return { type: "range", start: 1, end: Number(match[1]) };
  }

  match = value.match(/^(\d+)-$/);
  if (match) {
    return { type: "range", start: Number(match[1]), end: total };
  }

  match = value.match(/^(\d+)-(\d+)$/);
  if (match) {
    return { type: "range", start: Number(match[1]), end: Number(match[2]) };
  }

  throw new Error(
    "Invalid case range. Use N, N-, N-M, or random-N, for example 10, 10-, 10-20, or random-25."
  );
}

let selectionLabel = caseRange ? "Range: " + caseRange : "";
try {
  const selection = parseCaseRange(caseRange, selectedCases.length);
  if (selection.type === "random") {
    if (selection.count < 1) {
      throw new Error("Random case count must be at least 1.");
    }
    const maxStart = Math.max(1, selectedCases.length - selection.count + 1);
    const start = Math.floor(Math.random() * maxStart) + 1;
    const end = Math.min(selectedCases.length, start + selection.count - 1);
    selectedCases = selectedCases.slice(start - 1, end);
    selectionLabel =
      "Random: " +
      selectedCases.length +
      " requested=" +
      selection.count +
      " start=" +
      start +
      " end=" +
      end +
      " from=" +
      (caseFilter ? "filtered" : "all");
  } else {
    const { start, end } = selection;
    if (start < 1 || end < start) {
      throw new Error("Invalid case range bounds.");
    }
    selectedCases = selectedCases.slice(start - 1, end);
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}

if (selectedCases.length === 0) {
  console.error("No regression cases matched filter/range.");
  process.exit(1);
}

let failures = 0;
let depthTargets = 0;

console.log("Perft Regression Suite (max depth " + maxDepth + ")");
console.log("Fixture: " + fixtureJson);
console.log("Cases: " + selectedCases.length + " / " + cases.length);
if (caseFilter) console.log("Filter: " + caseFilter);
if (selectionLabel) console.log(selectionLabel);

let i = 0;
for (const testCase of selectedCases) {
  i++;
  const caseStartTime = process.hrtime.bigint();
  const expectations = testCase.expectations || testCase.depths || [];
  const depths = expectations.filter((expected) => expected.depth <= maxDepth);
  if (depths.length === 0) continue;

  const results = [];
  const actualByDepth = new Map();
  for (const expected of depths) {
    depthTargets++;
    const actual = runPerft(expected.depth, testCase.fen);
    actualByDepth.set(expected.depth, actual);
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
    console.log(
      i +
        " [" +
        testCase.fixtureIndex +
        "]: FAIL " +
        testCase.name +
        " depth " +
        expected.depth +
        ": " +
        detail
    );
    console.log(i + " [" + testCase.fixtureIndex + "]: FEN: " + testCase.fen);
  }

  const expectedRootMoves = testCase.expectedRootMovesContain || [];
  const excludedRootMoves = testCase.expectedRootMovesExclude || [];
  if (expectedRootMoves.length > 0) {
    const actualDepthOne = actualByDepth.get(1) || runPerft(1, testCase.fen);
    const missingRootMoves = expectedRootMoves.filter(
      (move) => !actualDepthOne.rootMoves.includes(move)
    );
    if (missingRootMoves.length === 0) {
      results.push("rootMoves=" + expectedRootMoves.join("|"));
    } else {
      failures++;
      console.log(
        i +
          " [" +
          testCase.fixtureIndex +
          "]: FAIL " +
          testCase.name +
          " root moves missing: " +
          missingRootMoves.join(", ")
      );
      console.log(i + " [" + testCase.fixtureIndex + "]: FEN: " + testCase.fen);
    }
  }
  if (excludedRootMoves.length > 0) {
    const actualDepthOne = actualByDepth.get(1) || runPerft(1, testCase.fen);
    const presentRootMoves = excludedRootMoves.filter((move) =>
      actualDepthOne.rootMoves.includes(move)
    );
    if (presentRootMoves.length === 0) {
      results.push("excludedRootMoves=" + excludedRootMoves.join("|"));
    } else {
      failures++;
      console.log(
        i +
          " [" +
          testCase.fixtureIndex +
          "]: FAIL " +
          testCase.name +
          " excluded root moves present: " +
          presentRootMoves.join(", ")
      );
      console.log(i + " [" + testCase.fixtureIndex + "]: FEN: " + testCase.fen);
    }
  }

  const caseElapsedMs =
    Math.round((Number(process.hrtime.bigint() - caseStartTime) / 1e6) * 10) /
    10;
  if (failures === 0) {
    console.log(
      i +
        " [" +
        testCase.fixtureIndex +
        "]: OK   " +
        testCase.name +
        " time=" +
        caseElapsedMs +
        "ms " +
        results.join(" ")
    );
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
