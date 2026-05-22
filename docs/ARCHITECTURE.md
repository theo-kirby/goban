# Architecture

3D Go is a research project built on a stripped fork of [online-go/goban](https://github.com/online-go/goban). It plays Go on a 3D lattice (an N×N×N cube of intersections) instead of a 2D grid. The rules are unchanged from standard Go — only the neighbor topology differs: an interior intersection has 6 liberties (±x, ±y, ±z) instead of 4.

The code splits into two layers: a cross-platform **engine** (`src/engine/`) and a browser-only **sandbox UI** (`examples/`).

## Engine

### Topology (`src/engine/Topology.ts`)

The seam where 3D plugs in. A `Topology` owns three things:

- `forEachNeighbor(x, y, z, cb)` — visit the cardinal neighbors of a point.
- `forEachPoint(cb)` — visit every intersection.
- `idx(x, y, z)` — map a coordinate to a flat integer index (for scratch buffers / sets).

Two implementations:

- `Topology2D(width, height)` — 4 neighbors, `depth = 1`, `idx = y*width + x`.
- `Topology3D(width, height, depth)` — 6 neighbors honoring lattice boundaries, `idx = z*width*height + y*width + x`.

The original 2D engine (`BoardState`, `StoneStringBuilder`) was refactored to route all neighbor enumeration and scratch indexing through a `Topology` instead of hardcoding `x±1 / y±1` and `y*width+x`. 2D behavior is unchanged — this was a pure refactor that opened the seam.

### BoardState3D (`src/engine/BoardState3D.ts`)

A standalone 3D board with full move logic. It is **parallel** to the 2D `BoardState` — they share the `Topology` family but no storage or game logic. (See [ROADMAP](./ROADMAP.md) for why parallel was chosen over a single unified engine.)

- Storage: `board[z][y][x]` of `JGOFNumericPlayerColor` (0 empty, 1 black, 2 white).
- `play(x, y, z)` — places the current player's stone, resolves captures (6-neighbor liberty counting), rejects suicide, and enforces **positional superko** (the resulting board may not repeat a prior position). Throws an `Error` on any illegal move so the UI can surface the reason. On success it advances `player` and `move_number`.
- `getRawStoneString(x, y, z)` — flood-fill the connected same-color group.
- `countLiberties(group)` / `getLiberties(group)` — liberty count / liberty positions.
- `getColorLiberties(color)` — every empty point adjacent to a stone of `color`.
- `pass()`, `clone()`, `hashPosition()`.

There is no separate `Engine3D` yet; turn order and history live on `BoardState3D` directly. One can be extracted if game-flow logic grows.

### Scorer3D (`src/engine/Scorer3D.ts`)

Topology-driven scoring for a 3D position (goscorer is 2D-only and unused here). Two pure functions, both returning the same `ScoreResult` (per-color `{ stones, territory, area }`, `komi`, `diff`, `winner`, `margin`, and the `blackTerritory` / `whiteTerritory` / `neutral` point lists for overlays):

- `scoreTrompTaylor(state, { komi, dead? })` — **final** Tromp-Taylor area scoring. All stones count as alive; each maximal empty region is awarded to a color iff it borders exactly one color; komi is added to white; `diff = black.area − white.area`. The optional `dead` set (flat `topology.idx` indices) removes manually-marked stones before scoring — a convenience layered on pure TT. Mirrors ericjang/autogo `GoBoard::score()`, generalized via `Topology3D`.
- `estimateScoreInfluence(state, { komi })` — a **live mid-game** estimate. A multi-source BFS spreads from each color's stones through empty space; each empty point goes to the color whose nearest stone is closer (ties / unreachable-by-both are neutral). Crude around life & death but gives a useful picture without rollouts; strictly-enclosed regions reduce to the TT result.

See [SCORING_PLAN.md](./SCORING_PLAN.md) for the design and limitations.

## Sandbox UI (`examples/`)

A React app served at `/sandbox` by the webpack dev server.

### `main.tsx`

- `Sandbox` — top-level; shows a **start screen** (pick cube size) then the `Game`.
- `Game` — holds the `BoardState3D` and all tool state (view, grid/section/liberty/place modes, score mode, the manually-marked `dead` set, komi). A fixed-width shell with a stable toolbar (controls never reflow when options change), a board area, an optional score panel, and a status bar.
- `Slice` — renders one z-layer as a 2D SVG goban: grid lines, stones, faint "ghost" dots for stones on adjacent layers, a hover preview stone in the current color, liberty highlights, and (in scoring) a territory overlay with dead stones dimmed. Click-to-play, or click-to-toggle-dead in final scoring.
- `LatticeView` — React wrapper that owns the imperative three.js scene lifecycle.

Tools exposed in the toolbar:

- **View**: Slices (all layers as a 2D grid) vs Lattice (3D).
- **Grid**: lattice line visibility — all / horizontal (within-layer) / vertical (between-layer) / none.
- **Section cut**: clipping plane that hides everything above the current slice.
- **All slices**: side panel shows every layer vs a 3-slice window (below / current / above).
- **Liberties**: off / group (hover a stone) / black / white.
- **Place**: alternate / black-only / white-only.
- **Score**: off / **Estimate** (live `estimateScoreInfluence`, updates as you play) / **Final** (`scoreTrompTaylor`; clicking a stone toggles its whole group dead). Either mode shows a territory overlay and a score panel (per-color stones / territory / area, an editable komi input, and the result, e.g. "Black +12.0").
- **Pass / Reset / New game**.

The lattice side panel auto-scales its boards to fill a fixed-size area regardless of how many are shown.

### `lattice3d.ts`

The imperative three.js scene (`createLatticeApp`). Notable details:

- Board layers stack vertically: board `(x, y, z)` → world `(x, up = z, depth = y)`.
- Stones are spheres; intersections are invisible spheres used only as raycast targets; a translucent preview stone follows the cursor in the color to be played.
- Edges are built as two line sets — horizontal (x/y) and vertical (z) — toggled independently by the Grid control.
- A `THREE.Plane` provides the section cut; it is applied to all materials and toggled by pushing its constant out of range.
- Click vs drag is distinguished by pointer travel distance, so orbiting never places a stone. The front-most object under the cursor wins the raycast (rotate to reach occluded points).
- Liberty highlights are cyan markers rebuilt via `setHighlights`.
- Scoring is driven by three imperative setters mirrored from React effects: `setScoring` (enter/exit scoring visuals), `setDead` (dim manually-marked dead stones), and `setTerritory(black, white)` (render the per-color territory overlay).

## Build & run

```
yarn install
yarn run dev      # http://localhost:9000/sandbox
```

three.js is a runtime dependency (lattice view). The dev bundle is large because three is imported whole; a production build tree-shakes it.
