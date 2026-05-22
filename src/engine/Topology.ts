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

/**
 * A Topology describes the lattice the board lives on: its dimensions, how to
 * iterate over points, how to enumerate neighbors, and how to map a coordinate
 * triple to a flat scratch index. Everything in the engine that previously
 * hardcoded "4 cardinal neighbors on a 2D grid" goes through this interface,
 * which is the seam where 3D plugs in.
 *
 * z is always present in the API. For 2D topologies it is fixed at 0 and
 * depth is 1.
 */
export interface Topology {
    readonly width: number;
    readonly height: number;
    readonly depth: number;
    readonly numPoints: number;

    forEachPoint(cb: (x: number, y: number, z: number) => void): void;

    forEachNeighbor(
        x: number,
        y: number,
        z: number,
        cb: (nx: number, ny: number, nz: number) => void,
    ): void;

    idx(x: number, y: number, z: number): number;
}

export class Topology2D implements Topology {
    public readonly width: number;
    public readonly height: number;
    public readonly depth = 1;
    public readonly numPoints: number;

    constructor(width: number, height: number) {
        this.width = width;
        this.height = height;
        this.numPoints = width * height;
    }

    public forEachPoint(cb: (x: number, y: number, z: number) => void): void {
        for (let y = 0; y < this.height; ++y) {
            for (let x = 0; x < this.width; ++x) {
                cb(x, y, 0);
            }
        }
    }

    public forEachNeighbor(
        x: number,
        y: number,
        _z: number,
        cb: (nx: number, ny: number, nz: number) => void,
    ): void {
        if (x - 1 >= 0) {
            cb(x - 1, y, 0);
        }
        if (x + 1 < this.width) {
            cb(x + 1, y, 0);
        }
        if (y - 1 >= 0) {
            cb(x, y - 1, 0);
        }
        if (y + 1 < this.height) {
            cb(x, y + 1, 0);
        }
    }

    public idx(x: number, y: number, _z: number): number {
        return y * this.width + x;
    }
}

/**
 * 3D lattice topology. Interior points have 6 neighbors (±x, ±y, ±z); face,
 * edge, and corner points have correspondingly fewer. Rules of Go are
 * unchanged; only the neighbor relation differs from 2D.
 */
export class Topology3D implements Topology {
    public readonly width: number;
    public readonly height: number;
    public readonly depth: number;
    public readonly numPoints: number;
    private readonly _layerSize: number;

    constructor(width: number, height: number, depth: number) {
        this.width = width;
        this.height = height;
        this.depth = depth;
        this._layerSize = width * height;
        this.numPoints = this._layerSize * depth;
    }

    public forEachPoint(cb: (x: number, y: number, z: number) => void): void {
        for (let z = 0; z < this.depth; ++z) {
            for (let y = 0; y < this.height; ++y) {
                for (let x = 0; x < this.width; ++x) {
                    cb(x, y, z);
                }
            }
        }
    }

    public forEachNeighbor(
        x: number,
        y: number,
        z: number,
        cb: (nx: number, ny: number, nz: number) => void,
    ): void {
        if (x - 1 >= 0) {
            cb(x - 1, y, z);
        }
        if (x + 1 < this.width) {
            cb(x + 1, y, z);
        }
        if (y - 1 >= 0) {
            cb(x, y - 1, z);
        }
        if (y + 1 < this.height) {
            cb(x, y + 1, z);
        }
        if (z - 1 >= 0) {
            cb(x, y, z - 1);
        }
        if (z + 1 < this.depth) {
            cb(x, y, z + 1);
        }
    }

    public idx(x: number, y: number, z: number): number {
        return z * this._layerSize + y * this.width + x;
    }
}
