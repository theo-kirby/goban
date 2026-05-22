# Scoring

Scoring a 3D Go position using **Tromp-Taylor area scoring**. Implemented in `src/engine/Scorer3D.ts` and wired into the sandbox; this document is the design and rationale. The implementation also adds a live mid-game estimator that was not in the original plan (see [Live estimator](#live-estimator-influence-heuristic)).

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

`scoreTrompTaylor` in `Scorer3D.ts` (kept separate so `BoardState3D` stays lean) implements autogo's algorithm over `Topology3D`:

```
scoreTrompTaylor(state, { komi?, dead?: Set<idx> }) -> ScoreResult
```

1. (Optional) treat `dead` stones (flat `topology.idx` indices) as empty for the whole computation — see below. Pure TT passes no dead set.
2. Count stones of each color.
3. Flood-fill empty regions via `topology.forEachNeighbor`, tracking the set of colors bordering each region. A region bordering exactly one color is that color's territory; otherwise neutral.
4. `black.area = blackStones + blackTerritory`; `white.area = whiteStones + whiteTerritory + komi`; `diff = black.area − white.area` (positive → black wins).

The actual `ScoreResult` (shared by both scorers):

```ts
ScoreResult {
  black: { stones, territory, area }   // area = stones + territory
  white: { stones, territory, area }   // area also includes komi
  komi: number
  diff: number                         // black.area − white.area
  winner: "black" | "white" | "draw"
  margin: number                       // |diff|
  blackTerritory: Intersection3D[]     // point lists, used for overlays
  whiteTerritory: Intersection3D[]
  neutral: Intersection3D[]
}
```

This is small, deterministic, and easy to validate against autogo's output on equivalent 2D positions.

## Live estimator (influence heuristic)

`estimateScoreInfluence(state, { komi })` gives a score for an **unfinished** game, for the sandbox's live "Estimate" mode. A multi-source breadth-first search spreads from every stone of each color through empty space; each empty point is attributed to the color whose nearest stone is closer (equal distance, or unreachable by both, is neutral). All stones count for their color. It returns the same `ScoreResult` shape as the final scorer.

It is crude around life & death (no rollouts, no group-status reasoning) but gives a useful mid-game picture, and on a strictly-enclosed final position it reduces to the Tromp-Taylor result. This was not in the original plan but proved cheap and useful while exploring positions.

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

## Implementation status

1. **S1 — `Scorer3D`** ✅ done. Pure TT area scoring over `Topology3D` with optional dead-set removal (`scoreTrompTaylor`), plus the live influence estimator (`estimateScoreInfluence`).
2. **S2 — Score-mode UI** ✅ done. Estimate/Final modes, click-to-mark-dead, territory overlay (slices + lattice), score panel, editable komi input.
3. **S3 — later** (not started): assisted life/death (heuristics or AI ownership), seki handling, optional two-pass auto-entry. Still gated on the AI work (Phases 4–5).
