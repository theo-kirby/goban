# Roadmap & Status

The project explores 3D Go along three pillars: a working **engine**, a human-playable **UX** for a hard-to-perceive lattice, and eventually a self-play **AI**. The 3D engine, sandbox, and docs currently live on `main` (the `3d-go` and `sandbox-only` branches have converged onto it).

## Done

| Phase | What |
|-------|------|
| 0 | Stripped sandbox base (SVG-only 2D goban, ~28k lines removed from upstream). |
| 1 | `Topology` abstraction; refactored 2D `BoardState` / `StoneStringBuilder` to use it with no behavior change. |
| 2 | `Topology3D` (6-neighbor) + `BoardState3D` (placement, capture, suicide rejection, positional superko, liberty queries). |
| 3a | Slices view: each z-layer as a 2D goban; click-to-play; ghost dots for adjacent-layer stones. |
| 3b | three.js lattice view + tooling: orbit/click, section cut, multi-slice side panel, grid-line modes, liberty highlighting, color preview, place-color toggle, start screen + stable UI. |
| Scoring | `Scorer3D` Tromp-Taylor area scorer (`scoreTrompTaylor`) with manual dead-stone removal, **plus** a live mid-game `estimateScoreInfluence` heuristic. Wired into the sandbox: Estimate/Final score modes, territory overlay (slices + lattice), score panel, komi input. See [SCORING_PLAN.md](./SCORING_PLAN.md). |

The engine plays correct 3D Go headlessly today, scores finished positions, and the sandbox is a usable playground for exploring the UX.

## Architecture decision: parallel engines

When 3D support began, the choice was between (a) parameterizing the existing engine so one codebase serves both 2D and 3D, or (b) building `BoardState3D` as a parallel class. We chose **parallel**:

- The 2D engine is upstream-derived and works; no reason to churn it for 3D.
- 3D is experimental and should evolve freely; whether it ever needs to mirror 2D internals is unknown.
- Faster to a playable 3D MVP, which is what unblocks the UX research.

They share the `Topology` interface. Unifying later (once the 3D design stabilizes) is easier than guessing now.

## Next

- **Phase 4 — Headless game runner + classical MCTS.** A `playGame(state, agentA, agentB)` loop with random and basic-MCTS agents to validate the engine on small cubes (5³, 7³) and surface performance. This is the immediate next piece.
- **Phase 5 — Neural training stack (deferred).** Likely a separate Python/PyTorch project consuming exported games; decide engine portability once Phase 4 shows real self-play speed.

There is currently **no automated test suite** (the upstream Jest setup was stripped). The engine and scorer are validated by hand and through the sandbox; a lightweight test harness for `BoardState3D` / `Scorer3D` would be worth adding before relying on them for self-play.

### Reference: autogo

[ericjang/autogo](https://github.com/ericjang/autogo) is an AlphaGo-style Go research stack (C++ engine with pybind bindings, MCTS, AlphaZero-style self-play training, cluster infra). It is the reference for our Tromp-Taylor scoring (see [SCORING_PLAN.md](./SCORING_PLAN.md)) and a strong reference for Phases 4–5: its `agents/` (random, nn_agent, nn_mcts), C++ `mcts/`, and `experiments/` (throughput benches, from-scratch training runs) map closely to what we'll need. Its engine, like ours, abstracts neighbor enumeration — so a 3D port is mostly swapping the topology.

## Known limitations / open questions

- **Life & death** is genuinely harder in 3D and largely unexplored; automatic dead-stone detection is deferred.
- **Komi** for 3D is unknown — first-move advantage will need empirical calibration (eventually via AI).
- **Performance** of TS self-play at scale is unmeasured; may force an engine port for serious training.
- **Scoring edge cases** (seki, false eyes) are out of scope for the first scorer.
- **Bundle size** — three.js imported whole inflates the dev bundle; only relevant if we ever ship.
