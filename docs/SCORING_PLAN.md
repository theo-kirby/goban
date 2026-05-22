# Scoring Plan

A plan for scoring a finished 3D Go position using **Tromp-Taylor area scoring**. Not yet implemented.

## Reference implementation

[ericjang/autogo](https://github.com/ericjang/autogo) is an AlphaGo-style Go research stack (C++ engine + MCTS + self-play NN training). Its C++ engine scores with Tromp-Taylor and is our reference. Two things from it directly shape this plan:

- **`GoBoard::score()`** (`src/alpha_go/cpp/go/go_game.cpp`) is textbook Tromp-Taylor: count all stones as alive, flood-fill empty regions, award a region to a color iff it borders exactly one color, add komi to white, return `black − white`. It iterates neighbors through a `neighbor_counts_` / `neighbor_indices_` abstraction — the same shape as our `Topology`, so `Topology3D` substitutes cleanly.
- **Suicide is rejected** (both single- and multi-stone), matching KataGo's default `suicide:false`. autogo notes they previously allowed multi-stone suicide and it caused agent/engine divergence bugs. Our `BoardState3D` already rejects all suicide, so our play rules already match — no engine change needed for scoring.

(autogo is also the reference for Phases 4–5; see [ROADMAP](./ROADMAP.md).)

## Ruleset: Tromp-Taylor

Tromp-Taylor is a precise, computer-friendly ruleset. The parts relevant to us:

- **Area scoring.** A player's score = their stones on the board + empty points reachable only from their color, + komi (white).
- **No dead-stone concept.** Every stone on the board counts as alive; dead stones must actually be captured by playing them out. Scoring is a pure function of the final board.
- **Positional superko** — already implemented in `BoardState3D`.
- **Game ends after two consecutive passes** — autogo tracks this; we have `pass()` but not yet game-over detection (not strictly required given a manual Score toggle).

Our existing engine (no suicide, positional superko, 6-neighbor captures) is already TT-compatible.

## Decisions (resolved)

- **Ruleset:** Tromp-Taylor area scoring.
- **Dead stones:** manual marking, as a convenience layered on pure TT (see below).
- **Entry:** a dedicated **Score** toggle (can play/score at any time; good for sandbox setups). Two-pass auto-entry can come later.
- **Komi:** configurable, default **0** (3D komi is unknown; calibrate empirically later, likely via AI).

## Core scorer (pure Tromp-Taylor)

A `Scorer3D` module (keeps `BoardState3D` lean) implementing exactly autogo's algorithm over `Topology3D`:

```
score(state, { komi, dead?: Set<idx> }) -> ScoreResult
```

1. (Optional) remove `dead` stones from a working copy — see below. Pure TT passes no dead set.
2. `blackArea = 0; whiteArea = komi`.
3. Add 1 per stone of each color on the board.
4. Flood-fill empty regions via `topology.forEachNeighbor`. Track the set of colors bordering each region. If a region borders exactly one color, add its size to that color's area. Otherwise it is neutral.
5. `result = blackArea − whiteArea` (positive → black wins).

```
ScoreResult {
  black: { stones, territory, area }
  white: { stones, territory, area }   // area includes komi
  komi: number
  neutral: number
  winner: "black" | "white" | "draw"
  margin: number                       // |black.area − white.area|
}
```

This is small, deterministic, and easy to validate against autogo's output on equivalent 2D positions.

## Dead stones: a convenience on top of TT

Pure TT has no dead stones — you play them out. That is tedious in a sandbox and impossible to "agree" without capturing, so we add an **optional manual removal step**:

- A **Score** mode where clicking a stone toggles its whole group dead/alive (reuse `getRawStoneString`).
- Marked-dead stones are removed from the working board before the TT scorer runs; their points become empty and get awarded as territory like any other empty region.
- The canonical TT score (no removals) is always available; manual marking is purely a convenience for reading a position without playing out captures.
- Automatic life/death is **not** attempted in v1 (genuinely hard in 3D; deferred to heuristics / the trained net).

## UI integration

- **Score** toggle alongside the existing tools.
- **Territory overlay:** tint empty territory by owner (reuse the highlight-marker mechanism, colored black/white), grey neutral points, dim dead stones — in both the lattice and the slice boards.
- **Score panel:** per-color stones / territory / area, komi, and the result (e.g. "Black +12.0").
- **Komi input** (start screen or score panel), default 0.

## Limitations (v1, intentional)

- No automatic **seki** detection — seki points would be miscounted; manual dead-marking is the workaround.
- No **false-eye** detection (pure TT doesn't need it for the area count, but it affects how humans read the board).
- **Manual** dead-stone marking only.
- **Komi** uncalibrated.

## Implementation order

1. **S1 — `Scorer3D`** (pure TT area scoring over `Topology3D`, optional dead-set removal). Validate against autogo on equivalent 2D positions and by hand on small cubes.
2. **S2 — Score-mode UI** (mark dead, territory overlay, score panel, komi input).
3. **S3 — later** assisted life/death (heuristics or AI ownership), seki handling, optional two-pass auto-entry.
