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

import { JGOFNumericPlayerColor } from "./formats/JGOF";
import { Topology3D } from "./Topology";

export interface Intersection3D {
    x: number;
    y: number;
    z: number;
}

export type RawStoneString3D = Intersection3D[];

export interface BoardState3DConfig {
    width: number;
    height: number;
    depth: number;
    board?: JGOFNumericPlayerColor[][][];
    player?: JGOFNumericPlayerColor;
}

export interface PlaceResult3D {
    color: JGOFNumericPlayerColor;
    position: Intersection3D;
    captured: Intersection3D[];
}

/**
 * 3D Go board state with full move logic: placement, capture (6-neighbor
 * liberties via Topology3D), positional superko, suicide rejection. Parallel
 * to BoardState — does not share storage or methods, only the Topology
 * interface family. play() throws on illegal moves; callers handle the error.
 */
export class BoardState3D {
    public readonly width: number;
    public readonly height: number;
    public readonly depth: number;
    public readonly topology: Topology3D;
    public board: JGOFNumericPlayerColor[][][];
    public player: JGOFNumericPlayerColor;
    public move_number: number = 0;
    public black_prisoners: number = 0;
    public white_prisoners: number = 0;

    /* Positional superko: every previous board position (after each move) is
     * hashed and tracked. Cheaply prevents repetition. */
    private position_history: Set<string> = new Set();

    constructor(config: BoardState3DConfig) {
        this.width = config.width;
        this.height = config.height;
        this.depth = config.depth;
        this.topology = new Topology3D(this.width, this.height, this.depth);
        this.player = config.player ?? JGOFNumericPlayerColor.BLACK;
        this.board = config.board
            ? cloneBoard3D(config.board)
            : makeBoard3D(this.width, this.height, this.depth);
        this.position_history.add(this.hashPosition());
    }

    public getStone(x: number, y: number, z: number): JGOFNumericPlayerColor {
        return this.board[z][y][x];
    }

    public setStone(x: number, y: number, z: number, color: JGOFNumericPlayerColor): void {
        this.board[z][y][x] = color;
    }

    /** Flood-fill the same-color group containing (x, y, z). Empty if the
     *  starting point is empty (returns one-element string of empties). */
    public getRawStoneString(x: number, y: number, z: number): RawStoneString3D {
        const color = this.getStone(x, y, z);
        const visited = new Uint8Array(this.topology.numPoints);
        const stack: Intersection3D[] = [{ x, y, z }];
        const result: Intersection3D[] = [];
        while (stack.length) {
            const pt = stack.pop()!;
            const idx = this.topology.idx(pt.x, pt.y, pt.z);
            if (visited[idx]) {
                continue;
            }
            visited[idx] = 1;
            if (this.getStone(pt.x, pt.y, pt.z) === color) {
                result.push(pt);
                this.topology.forEachNeighbor(pt.x, pt.y, pt.z, (nx, ny, nz) => {
                    stack.push({ x: nx, y: ny, z: nz });
                });
            }
        }
        return result;
    }

    public countLiberties(group: RawStoneString3D): number {
        const counted = new Uint8Array(this.topology.numPoints);
        let count = 0;
        for (const pt of group) {
            this.topology.forEachNeighbor(pt.x, pt.y, pt.z, (nx, ny, nz) => {
                if (this.getStone(nx, ny, nz) === JGOFNumericPlayerColor.EMPTY) {
                    const idx = this.topology.idx(nx, ny, nz);
                    if (!counted[idx]) {
                        counted[idx] = 1;
                        count++;
                    }
                }
            });
        }
        return count;
    }

    /** The empty intersections adjacent to the given group (its liberties). */
    public getLiberties(group: RawStoneString3D): Intersection3D[] {
        const seen = new Uint8Array(this.topology.numPoints);
        const libs: Intersection3D[] = [];
        for (const pt of group) {
            this.topology.forEachNeighbor(pt.x, pt.y, pt.z, (nx, ny, nz) => {
                if (this.getStone(nx, ny, nz) === JGOFNumericPlayerColor.EMPTY) {
                    const idx = this.topology.idx(nx, ny, nz);
                    if (!seen[idx]) {
                        seen[idx] = 1;
                        libs.push({ x: nx, y: ny, z: nz });
                    }
                }
            });
        }
        return libs;
    }

    /** Every empty intersection that is a liberty of any group of `color`
     *  (i.e. empty points adjacent to at least one stone of that color). */
    public getColorLiberties(color: JGOFNumericPlayerColor): Intersection3D[] {
        const libs: Intersection3D[] = [];
        this.topology.forEachPoint((x, y, z) => {
            if (this.getStone(x, y, z) !== JGOFNumericPlayerColor.EMPTY) {
                return;
            }
            let adjacent = false;
            this.topology.forEachNeighbor(x, y, z, (nx, ny, nz) => {
                if (this.getStone(nx, ny, nz) === color) {
                    adjacent = true;
                }
            });
            if (adjacent) {
                libs.push({ x, y, z });
            }
        });
        return libs;
    }

    /** Place the current player's stone at (x, y, z). Resolves captures,
     *  rejects suicide and positional-superko repeats. Throws Error on any
     *  illegality; on success, advances player and returns what happened. */
    public play(x: number, y: number, z: number): PlaceResult3D {
        if (x < 0 || x >= this.width || y < 0 || y >= this.height || z < 0 || z >= this.depth) {
            throw new Error(`Out of bounds: (${x},${y},${z})`);
        }
        if (this.getStone(x, y, z) !== JGOFNumericPlayerColor.EMPTY) {
            throw new Error(`Point not empty: (${x},${y},${z})`);
        }
        const color = this.player;
        if (color === JGOFNumericPlayerColor.EMPTY) {
            throw new Error("No current player");
        }
        const opponent =
            color === JGOFNumericPlayerColor.BLACK
                ? JGOFNumericPlayerColor.WHITE
                : JGOFNumericPlayerColor.BLACK;

        this.setStone(x, y, z, color);

        /* Capture any adjacent opponent group that now has zero liberties.
         * Dedupe groups using a single visited bitmap. */
        const captured: Intersection3D[] = [];
        const group_checked = new Uint8Array(this.topology.numPoints);
        this.topology.forEachNeighbor(x, y, z, (nx, ny, nz) => {
            const nidx = this.topology.idx(nx, ny, nz);
            if (group_checked[nidx]) {
                return;
            }
            if (this.getStone(nx, ny, nz) !== opponent) {
                return;
            }
            const group = this.getRawStoneString(nx, ny, nz);
            for (const pt of group) {
                group_checked[this.topology.idx(pt.x, pt.y, pt.z)] = 1;
            }
            if (this.countLiberties(group) === 0) {
                for (const pt of group) {
                    this.setStone(pt.x, pt.y, pt.z, JGOFNumericPlayerColor.EMPTY);
                    captured.push(pt);
                }
            }
        });

        /* Suicide check: if we captured nothing and our own group has no
         * liberties, the move is illegal. Roll back. */
        if (captured.length === 0) {
            const own_group = this.getRawStoneString(x, y, z);
            if (this.countLiberties(own_group) === 0) {
                this.setStone(x, y, z, JGOFNumericPlayerColor.EMPTY);
                throw new Error(`Suicide: (${x},${y},${z})`);
            }
        }

        /* Positional superko: the resulting board must not be one we've seen
         * before. If it is, roll back the placement and captures. */
        const hash = this.hashPosition();
        if (this.position_history.has(hash)) {
            for (const pt of captured) {
                this.setStone(pt.x, pt.y, pt.z, opponent);
            }
            this.setStone(x, y, z, JGOFNumericPlayerColor.EMPTY);
            throw new Error(`Ko (positional superko): (${x},${y},${z})`);
        }
        this.position_history.add(hash);

        if (color === JGOFNumericPlayerColor.BLACK) {
            this.black_prisoners += captured.length;
        } else {
            this.white_prisoners += captured.length;
        }

        this.player = opponent;
        this.move_number++;
        return { color, position: { x, y, z }, captured };
    }

    public pass(): void {
        this.player =
            this.player === JGOFNumericPlayerColor.BLACK
                ? JGOFNumericPlayerColor.WHITE
                : JGOFNumericPlayerColor.BLACK;
        this.move_number++;
    }

    public clone(): BoardState3D {
        return new BoardState3D({
            width: this.width,
            height: this.height,
            depth: this.depth,
            board: this.board,
            player: this.player,
        });
    }

    /* Stringified position. Used for positional-superko detection. Player to
     * move is intentionally excluded (PSK, not SSK). */
    public hashPosition(): string {
        const parts: string[] = [];
        for (let z = 0; z < this.depth; z++) {
            for (let y = 0; y < this.height; y++) {
                parts.push(this.board[z][y].join(""));
            }
        }
        return parts.join("|");
    }
}

function makeBoard3D(width: number, height: number, depth: number): JGOFNumericPlayerColor[][][] {
    const result: JGOFNumericPlayerColor[][][] = [];
    for (let z = 0; z < depth; z++) {
        const layer: JGOFNumericPlayerColor[][] = [];
        for (let y = 0; y < height; y++) {
            layer.push(new Array(width).fill(JGOFNumericPlayerColor.EMPTY));
        }
        result.push(layer);
    }
    return result;
}

function cloneBoard3D(src: JGOFNumericPlayerColor[][][]): JGOFNumericPlayerColor[][][] {
    return src.map((layer) => layer.map((row) => row.slice()));
}
