[![License: Apache-2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)

# 3D Go

A research project exploring **3D Go** — Go played on an N×N×N lattice instead of a 2D grid. The rules are unchanged from standard Go; only the topology differs (an interior intersection has 6 liberties instead of 4). Goals: a correct engine, a human-playable UX for the hard-to-perceive lattice, and eventually a self-play AI.

Built on a stripped fork of [online-go/goban](https://github.com/online-go/goban). Removed from upstream: OGS networking + protocol, Canvas renderer, score estimator/autoscore, AI review, chat, all stone/board themes except `Plain`, the standalone engine-only build, tests, typedoc, cspell, jscpd, husky. The 2D engine and SVG renderer remain (the 3D engine is built parallel to them).

## Run

```
yarn install     # first time only
yarn run dev     # http://localhost:9000/sandbox
```

The sandbox lets you play 3D Go on a configurable cube, in either a stacked 2D "slices" view or an interactive three.js lattice, with tools for section cuts, liberty highlighting, free stone placement, and more.

## Docs

- [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md) — engine (topology abstraction, `BoardState3D`) and sandbox UI.
- [docs/ROADMAP.md](./docs/ROADMAP.md) — what's done, what's next, key decisions, open questions.
- [docs/SCORING_PLAN.md](./docs/SCORING_PLAN.md) — plan for the 3D scoring system.

Engine code lives in `src/engine/` (entry `src/index.ts`); the sandbox is in `examples/`.
