/*
 * Copyright (C) Online-Go.com
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *  http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { BoardState3D, Intersection3D } from "./BoardState3D";
import { JGOFNumericPlayerColor } from "./formats/JGOF";

export interface ScoreColorBreakdown {
    stones: number;
    territory: number;
    /** stones + territory (+ komi for white) */
    area: number;
}

export interface ScoreResult {
    black: ScoreColorBreakdown;
    white: ScoreColorBreakdown;
    komi: number;
    /** black.area - white.area; positive means black is ahead */
    diff: number;
    winner: "black" | "white" | "draw";
    margin: number;
    blackTerritory: Intersection3D[];
    whiteTerritory: Intersection3D[];
    neutral: Intersection3D[];
}

export interface ScoreOptions {
    komi?: number;
    /** Flat indices (topology.idx) of stones to treat as removed before
     *  scoring — a manual-dead-stone convenience layered on pure Tromp-Taylor. */
    dead?: Set<number>;
}

/**
 * Tromp-Taylor area scoring for a 3D board. All stones on the board count as
 * alive (minus any explicitly marked dead); each maximal empty region is
 * awarded to a color iff it borders exactly one color; komi is added to white.
 * Mirrors ericjang/autogo GoBoard::score(), generalized to the lattice via
 * Topology3D.
 */
export function scoreTrompTaylor(state: BoardState3D, options: ScoreOptions = {}): ScoreResult {
    const komi = options.komi ?? 0;
    const dead = options.dead ?? null;
    const topo = state.topology;

    const colorAt = (x: number, y: number, z: number): JGOFNumericPlayerColor => {
        if (dead && dead.has(topo.idx(x, y, z))) {
            return JGOFNumericPlayerColor.EMPTY;
        }
        return state.getStone(x, y, z);
    };

    let blackStones = 0;
    let whiteStones = 0;
    topo.forEachPoint((x, y, z) => {
        const c = colorAt(x, y, z);
        if (c === JGOFNumericPlayerColor.BLACK) {
            blackStones++;
        } else if (c === JGOFNumericPlayerColor.WHITE) {
            whiteStones++;
        }
    });

    const blackTerritory: Intersection3D[] = [];
    const whiteTerritory: Intersection3D[] = [];
    const neutral: Intersection3D[] = [];

    const visited = new Uint8Array(topo.numPoints);
    topo.forEachPoint((x, y, z) => {
        const start = topo.idx(x, y, z);
        if (visited[start] || colorAt(x, y, z) !== JGOFNumericPlayerColor.EMPTY) {
            return;
        }

        const region: Intersection3D[] = [];
        const borders = new Set<JGOFNumericPlayerColor>();
        const stack: Intersection3D[] = [{ x, y, z }];
        visited[start] = 1;

        while (stack.length) {
            const pt = stack.pop()!;
            region.push(pt);
            topo.forEachNeighbor(pt.x, pt.y, pt.z, (nx, ny, nz) => {
                const c = colorAt(nx, ny, nz);
                if (c === JGOFNumericPlayerColor.EMPTY) {
                    const nidx = topo.idx(nx, ny, nz);
                    if (!visited[nidx]) {
                        visited[nidx] = 1;
                        stack.push({ x: nx, y: ny, z: nz });
                    }
                } else {
                    borders.add(c);
                }
            });
        }

        let dest = neutral;
        if (borders.size === 1) {
            dest =
                borders.values().next().value === JGOFNumericPlayerColor.BLACK
                    ? blackTerritory
                    : whiteTerritory;
        }
        for (const pt of region) {
            dest.push(pt);
        }
    });

    return assembleResult(blackStones, whiteStones, blackTerritory, whiteTerritory, neutral, komi);
}

/**
 * Live score estimate for an unfinished game via an influence heuristic. A
 * multi-source breadth-first search spreads from each color's stones through
 * empty space; every empty point is attributed to the color whose nearest
 * stone is closer (equal distance, or unreachable by both, is neutral). All
 * stones count for their color. Crude around life & death but gives a useful
 * mid-game picture without rollouts. (Strictly-enclosed regions reduce to the
 * Tromp-Taylor result.)
 */
export function estimateScoreInfluence(
    state: BoardState3D,
    options: ScoreOptions = {},
): ScoreResult {
    const komi = options.komi ?? 0;
    const topo = state.topology;
    const N = topo.numPoints;

    const distFrom = (color: JGOFNumericPlayerColor): Int32Array => {
        const dist = new Int32Array(N).fill(-1);
        const queue: Intersection3D[] = [];
        topo.forEachPoint((x, y, z) => {
            if (state.getStone(x, y, z) === color) {
                dist[topo.idx(x, y, z)] = 0;
                queue.push({ x, y, z });
            }
        });
        let head = 0;
        while (head < queue.length) {
            const pt = queue[head++];
            const d = dist[topo.idx(pt.x, pt.y, pt.z)] + 1;
            topo.forEachNeighbor(pt.x, pt.y, pt.z, (nx, ny, nz) => {
                if (state.getStone(nx, ny, nz) !== JGOFNumericPlayerColor.EMPTY) {
                    return; /* influence only spreads through empty space */
                }
                const ni = topo.idx(nx, ny, nz);
                if (dist[ni] === -1) {
                    dist[ni] = d;
                    queue.push({ x: nx, y: ny, z: nz });
                }
            });
        }
        return dist;
    };

    const blackDist = distFrom(JGOFNumericPlayerColor.BLACK);
    const whiteDist = distFrom(JGOFNumericPlayerColor.WHITE);

    let blackStones = 0;
    let whiteStones = 0;
    const blackTerritory: Intersection3D[] = [];
    const whiteTerritory: Intersection3D[] = [];
    const neutral: Intersection3D[] = [];

    topo.forEachPoint((x, y, z) => {
        const c = state.getStone(x, y, z);
        if (c === JGOFNumericPlayerColor.BLACK) {
            blackStones++;
            return;
        }
        if (c === JGOFNumericPlayerColor.WHITE) {
            whiteStones++;
            return;
        }
        const i = topo.idx(x, y, z);
        const b = blackDist[i];
        const w = whiteDist[i];
        const bReached = b !== -1;
        const wReached = w !== -1;
        if (bReached && (!wReached || b < w)) {
            blackTerritory.push({ x, y, z });
        } else if (wReached && (!bReached || w < b)) {
            whiteTerritory.push({ x, y, z });
        } else {
            neutral.push({ x, y, z });
        }
    });

    return assembleResult(blackStones, whiteStones, blackTerritory, whiteTerritory, neutral, komi);
}

function assembleResult(
    blackStones: number,
    whiteStones: number,
    blackTerritory: Intersection3D[],
    whiteTerritory: Intersection3D[],
    neutral: Intersection3D[],
    komi: number,
): ScoreResult {
    const blackArea = blackStones + blackTerritory.length;
    const whiteArea = whiteStones + whiteTerritory.length + komi;
    const diff = blackArea - whiteArea;

    return {
        black: { stones: blackStones, territory: blackTerritory.length, area: blackArea },
        white: { stones: whiteStones, territory: whiteTerritory.length, area: whiteArea },
        komi,
        diff,
        winner: diff > 0 ? "black" : diff < 0 ? "white" : "draw",
        margin: Math.abs(diff),
        blackTerritory,
        whiteTerritory,
        neutral,
    };
}
