#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const ENGINE_FILES = [
  "board-pieces.js",
  "history.js",
  "zobrist-keys.js",
  "zobrist.js",
  "bit-board.js",
  "transposition-table.js",
  "board-moves.js",
  "board-data.js",
  "computerplayers.js",
];

function usage(exitCode = 1) {
  console.error(`Usage: ./matchmaker/make-version.sh <name>

Creates matchmaker/versions/<next-number>-<name>/ with the engine files needed
for AI-vs-AI matchmaker games.
`);
  process.exit(exitCode);
}

function sanitizeName(name) {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function nextVersionNumber(versionsDir) {
  if (!fs.existsSync(versionsDir)) return 1;
  const numbers = fs
    .readdirSync(versionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => /^(\d+)-/.exec(entry.name))
    .filter(Boolean)
    .map((match) => parseInt(match[1], 10));
  return numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
}

function copyEngineFiles(rootDir, versionDir) {
  fs.mkdirSync(versionDir, { recursive: true });
  for (const fileName of ENGINE_FILES) {
    const source = path.join(rootDir, fileName);
    const target = path.join(versionDir, fileName);
    if (!fs.existsSync(source)) {
      throw new Error(`Required engine file is missing: ${fileName}`);
    }
    fs.copyFileSync(source, target);
  }
}

function main() {
  const rawName = process.argv[2];
  if (!rawName || rawName === "--help" || rawName === "-h") {
    usage(rawName ? 0 : 1);
  }

  const name = sanitizeName(rawName);
  if (!name) {
    throw new Error("Version name must contain at least one letter or number.");
  }

  const rootDir = path.resolve(__dirname, "..");
  const versionsDir = path.join(__dirname, "versions");
  const versionNumber = nextVersionNumber(versionsDir);
  const versionName = `${versionNumber}-${name}`;
  const versionDir = path.join(versionsDir, versionName);

  copyEngineFiles(rootDir, versionDir);

  const metadata = {
    version: versionNumber,
    name,
    createdAt: new Date().toISOString(),
    files: ENGINE_FILES,
  };
  fs.writeFileSync(
    path.join(versionDir, "version.json"),
    JSON.stringify(metadata, null, 2) + "\n",
    "utf8"
  );

  console.log(`Created matchmaker version ${versionNumber}: ${versionName}`);
  console.log(`Path: ${path.relative(rootDir, versionDir)}`);
}

main();
