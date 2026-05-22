## Repository Overview

This repo is a **3D Go research project** built on a stripped fork of
[online-go/goban](https://github.com/online-go/goban). It plays Go on an N×N×N
lattice instead of a 2D grid: the rules are unchanged from standard Go, only the
neighbor topology differs (an interior intersection has 6 liberties instead of
4). The package is `goban-sandbox` — a minimal playground, not a published
library.

Three pillars: a correct **engine**, a human-playable **UX** for the
hard-to-perceive lattice, and eventually a self-play **AI**. See `docs/` for the
current state.

The upstream library was stripped down to make this experiment cheap. Removed:
OGS networking glue beyond the legacy 2D stack, the Canvas renderer, the score
estimator / autoscore, AI review, chat, all stone/board themes except `Plain`,
the standalone engine-only build, the Jest test suite, TypeDoc, cspell, jscpd,
and husky. The legacy 2D engine + SVG renderer remain; the 3D engine is built
parallel to them.

## Essential Commands

```bash
yarn install              # first-time setup
yarn run dev              # dev server → http://localhost:9000/sandbox
make                      # alias for yarn run dev

make build                # build-debug + build-production
yarn run build-debug      # webpack debug build  → build/sandbox.js
yarn run build-production # webpack prod build    → build/sandbox.min.js

yarn run lint             # ESLint (src/ examples/)
yarn run lint:fix         # ESLint autofix
yarn run prettier         # format src/ examples/
yarn run prettier:check   # check formatting
yarn run checks           # lint + prettier:check

make clean                # rm -Rf build node_modules
```

There is **no test runner, typedoc, spellcheck, or duplicate-code check** in
this fork — don't reference commands that aren't in `package.json`.

## Architecture

### Single build

One webpack config (`webpack.config.js`), `target: web`, entry
`examples/main.tsx`, output `build/sandbox.{js,min.js}`. There is no separate
Node/engine build. `DefinePlugin` always sets `CLIENT: true`, `SERVER: false`.

`tsconfig.json` type-checks the library entry (`src/index.ts`) plus the sandbox
(`examples/`). Path mapping: `*` → `src/*`, `engine` → `src/engine`, `goscorer`
→ `src/third_party/goscorer/goscorer`.

### Engine (`src/engine/`) — cross-platform game logic

Must run in both browser and Node (no DOM / browser-only APIs).

- **2D (legacy, upstream-derived):** `BoardState`, `GobanEngine`, `MoveTree`,
  `ConditionalMoveTree`, `StoneString`/`StoneStringBuilder`, formats (`JGOF`,
  `AdHocFormat`), `messages.ts`, `translate.ts`. Refactored to route neighbor
  enumeration and scratch indexing through `Topology` (pure refactor, behavior
  unchanged).
- **3D (the research work):**
  - `Topology.ts` — the seam. `Topology2D` (4 neighbors) and `Topology3D` (6
    neighbors) own `forEachNeighbor`, `forEachPoint`, `idx`, `numPoints`.
  - `BoardState3D.ts` — standalone 3D board, **parallel** to 2D `BoardState`:
    placement, 6-neighbor capture, suicide rejection, positional superko,
    liberty queries, `pass`/`clone`/`hashPosition`. Throws on illegal moves.
  - `Scorer3D.ts` — Tromp-Taylor area scoring (`scoreTrompTaylor`, with optional
    manual-dead-stone removal) plus a live mid-game `estimateScoreInfluence`
    (BFS influence heuristic).

The 2D and 3D engines share only the `Topology` family — no shared storage or
game logic. Parallel was a deliberate choice (see `docs/ROADMAP.md`).

### Legacy 2D renderer (`src/Goban/`) — browser-only

Retained from upstream but not used by the 3D sandbox. Class stack:

```
SVGRenderer → Goban → OGSConnectivity → InteractiveBase → GobanBase
```

(`CanvasRenderer` was removed.) Themes are reduced to `board_plain` and
`plain_stones`.

### Sandbox UI (`examples/`) — the 3D playground

A React app served at `/sandbox`. `main.tsx` holds a `BoardState3D` and all
tool state; `lattice3d.ts` is the imperative three.js scene. Two views: **Slices**
(each z-layer as a 2D SVG goban) and **Lattice** (interactive three.js).
three.js is a runtime dependency. See `docs/ARCHITECTURE.md` for the full tool
list.

## Docs

- `docs/ARCHITECTURE.md` — engine + sandbox internals.
- `docs/ROADMAP.md` — what's done, what's next, key decisions, open questions.
- `docs/SCORING_PLAN.md` — the 3D scoring design (now implemented).

## Conventions

- Apache-2.0 copyright header required on all `.ts`/`.tsx` files.
- ESLint + Prettier are enforced; run `yarn run checks` before finishing.
- Engine code (`src/engine/`) must stay cross-platform.
- 3D is experimental — keep it parallel to the 2D engine; don't churn the
  upstream 2D code for 3D's sake. Don't add OGS/networking back; this stays local.
