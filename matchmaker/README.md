# Matchmaker

Create a version snapshot after changing the root engine:

```sh
./matchmaker/make-version.sh baseline
```

This creates `matchmaker/versions/<number>-<name>/` with the browser-engine
files needed for headless AI games.

Run version A against version B:

```sh
./matchmaker/matchmaker.sh 1 2
```

Defaults:

- `--games 500`: games per color, so 1000 total
- `--depth 4`
- `--seed 42`
- `--max-plies 160`
- `--positions fair_positions.txt`

The output is from the first version's perspective and is also saved under
`matchmaker/results/`.

A compact comparison line is appended to `matchmaker/results/summary.txt`:

```text
timestamp, v1, v2, win, draw, loss
```
