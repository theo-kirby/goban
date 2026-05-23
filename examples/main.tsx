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

import * as React from "react";
import * as ReactDOM from "react-dom/client";
import {
    BoardState3D,
    Intersection3D,
    JGOFNumericPlayerColor,
    scoreTrompTaylor,
    estimateScoreInfluence,
    ScoreResult,
} from "../src";
import { createLatticeApp, LatticeApp, LineMode } from "./lattice3d";

const CUBE_SIZES = [3, 4, 5, 7, 9] as const;
type CubeSize = (typeof CUBE_SIZES)[number];
type View3D = "slices" | "lattice";
type Phase = "setup" | "playing";
type LibMode = "off" | "group" | "black" | "white";
type PlaceMode = "alternate" | "black" | "white";
type ScoreMode = "off" | "estimate" | "final";

const EMPTY_DEAD: Set<number> = new Set();

const VIEW_MODES: { value: View3D; label: string }[] = [
    { value: "slices", label: "Slices" },
    { value: "lattice", label: "Lattice" },
];

const LIB_MODES: { value: LibMode; label: string }[] = [
    { value: "off", label: "Off" },
    { value: "group", label: "Group" },
    { value: "black", label: "Black" },
    { value: "white", label: "White" },
];

const PLACE_MODES: { value: PlaceMode; label: string }[] = [
    { value: "alternate", label: "Alt" },
    { value: "black", label: "Black" },
    { value: "white", label: "White" },
];

const LINE_MODES: { value: LineMode; label: string }[] = [
    { value: "all", label: "All" },
    { value: "horizontal", label: "Horiz" },
    { value: "vertical", label: "Vert" },
    { value: "none", label: "None" },
];

const SCORE_MODES: { value: ScoreMode; label: string }[] = [
    { value: "off", label: "Off" },
    { value: "estimate", label: "Estimate" },
    { value: "final", label: "Final" },
];

const libKey = (p: Intersection3D): string => `${p.x},${p.y},${p.z}`;

/* Fixed area the slice boards live in (px). Never changes; the boards scale
 * to fill it as large as possible regardless of how many are shown. */
const PANEL_AREA_W = 600;
const PANEL_AREA_H = 560;
const PANEL_GAP = 10;
const PANEL_LABEL_H = 18;
/* Padding around the grid, as a fraction of cell size. With 0.5 the board's
 * pixel side is exactly cell * boardDimension. */
const SLICE_PAD_FRAC = 0.5;

/* Choose the column count (and resulting cell size) that fits `n` square
 * boards of grid dimension `s` into the fixed area as large as possible. */
function bestSliceLayout(n: number, s: number): { cell: number; cols: number } {
    let best = { cell: 1, cols: 1 };
    for (let cols = 1; cols <= Math.max(1, n); ++cols) {
        const rows = Math.ceil(n / cols);
        const availW = (PANEL_AREA_W - PANEL_GAP * (cols - 1)) / cols;
        const availH = (PANEL_AREA_H - PANEL_GAP * (rows - 1)) / rows;
        const cellW = availW / s;
        const cellH = (availH - PANEL_LABEL_H) / s;
        const cell = Math.floor(Math.min(cellW, cellH));
        if (cell > best.cell) {
            best = { cell, cols };
        }
    }
    return best;
}

/* A connected, mutually-exclusive toggle group. The active option is filled;
 * clicking an option calls onChange with its value. */
function Segmented({
    options,
    value,
    onChange,
    disabled = false,
}: {
    options: { value: string; label: string }[];
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}): React.JSX.Element {
    return (
        <div className="Segmented">
            {options.map((o) => (
                <button
                    key={o.value}
                    type="button"
                    className={value === o.value ? "active" : ""}
                    disabled={disabled}
                    onClick={() => onChange(o.value)}
                >
                    {o.label}
                </button>
            ))}
        </div>
    );
}

/* A compact labeled dropdown (native select) for settings with several
 * options that don't need to be visible at all times. */
function Dropdown({
    label,
    options,
    value,
    onChange,
    disabled = false,
}: {
    label: string;
    options: { value: string; label: string }[];
    value: string;
    onChange: (value: string) => void;
    disabled?: boolean;
}): React.JSX.Element {
    return (
        <label className={"Dropdown" + (disabled ? " disabled" : "")}>
            <span className="DropdownLabel">{label}</span>
            <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
        </label>
    );
}

function Sandbox(): React.JSX.Element {
    const [phase, setPhase] = React.useState<Phase>("setup");
    const [size, setSize] = React.useState<CubeSize>(5);

    return (
        <div className="Sandbox">
            {phase === "setup" ? (
                <StartScreen size={size} onPick={setSize} onStart={() => setPhase("playing")} />
            ) : (
                <Game key={size} size={size} onNewGame={() => setPhase("setup")} />
            )}
        </div>
    );
}

function StartScreen({
    size,
    onPick,
    onStart,
}: {
    size: CubeSize;
    onPick: (n: CubeSize) => void;
    onStart: () => void;
}): React.JSX.Element {
    return (
        <div className="StartScreen">
            <h1 className="StartTitle">3D Go</h1>
            <p className="StartSubtitle">Select board size</p>
            <div className="StartSizes">
                {CUBE_SIZES.map((n) => (
                    <button
                        key={n}
                        className={n === size ? "active" : ""}
                        onClick={() => onPick(n)}
                    >
                        {n}³
                    </button>
                ))}
            </div>
            <button className="StartButton" onClick={onStart}>
                Start Game
            </button>
        </div>
    );
}

function Game({ size, onNewGame }: { size: CubeSize; onNewGame: () => void }): React.JSX.Element {
    const [view, setView] = React.useState<View3D>("lattice");
    const [state, setState] = React.useState(
        () => new BoardState3D({ width: size, height: size, depth: size }),
    );
    const [tick, setTick] = React.useState(0);
    const [error, setError] = React.useState<string | null>(null);
    const [lineMode, setLineMode] = React.useState<LineMode>("all");
    const [sectionCut, setSectionCut] = React.useState(false);
    const [sliceZ, setSliceZ] = React.useState(0);
    const [libMode, setLibMode] = React.useState<LibMode>("off");
    const [hoverGroup, setHoverGroup] = React.useState<Intersection3D | null>(null);
    const [showAllSlices, setShowAllSlices] = React.useState(false);
    const [placeMode, setPlaceMode] = React.useState<PlaceMode>("alternate");
    const [scoreMode, setScoreMode] = React.useState<ScoreMode>("off");
    const [dead, setDead] = React.useState<Set<number>>(new Set());
    const [komi, setKomi] = React.useState(0);
    const finalMode = scoreMode === "final";

    React.useEffect(() => {
        setDead(new Set());
    }, [state]);

    const pinPlayer = () => {
        if (placeMode === "black") {
            state.player = JGOFNumericPlayerColor.BLACK;
        } else if (placeMode === "white") {
            state.player = JGOFNumericPlayerColor.WHITE;
        }
    };

    React.useEffect(() => {
        pinPlayer();
        setTick((t) => t + 1);
    }, [placeMode, state]);

    React.useEffect(() => {
        setHoverGroup(null);
    }, [libMode]);

    const highlights = React.useMemo<Intersection3D[]>(() => {
        // tick participates so color liberties refresh after each move
        void tick;
        if (libMode === "black") {
            return state.getColorLiberties(JGOFNumericPlayerColor.BLACK);
        }
        if (libMode === "white") {
            return state.getColorLiberties(JGOFNumericPlayerColor.WHITE);
        }
        if (libMode === "group" && hoverGroup) {
            const group = state.getRawStoneString(hoverGroup.x, hoverGroup.y, hoverGroup.z);
            if (
                state.getStone(hoverGroup.x, hoverGroup.y, hoverGroup.z) !==
                JGOFNumericPlayerColor.EMPTY
            ) {
                return state.getLiberties(group);
            }
        }
        return [];
    }, [libMode, hoverGroup, state, tick]);

    const highlightSet = React.useMemo(() => new Set(highlights.map(libKey)), [highlights]);

    const panelZs = React.useMemo<number[]>(
        () =>
            showAllSlices
                ? Array.from({ length: state.depth }, (_, i) => i)
                : [sliceZ - 1, sliceZ, sliceZ + 1].filter((z) => z >= 0 && z < state.depth),
        [showAllSlices, sliceZ, state],
    );

    const panelLayout = React.useMemo(
        () => bestSliceLayout(panelZs.length, state.width),
        [panelZs.length, state.width],
    );

    const onHoverGroup = (pos: Intersection3D | null) => {
        if (libMode !== "group") {
            return;
        }
        setHoverGroup((prev) => {
            if (prev === pos) {
                return prev;
            }
            if (prev && pos && prev.x === pos.x && prev.y === pos.y && prev.z === pos.z) {
                return prev;
            }
            return pos;
        });
    };

    React.useEffect(() => {
        if (view !== "lattice") {
            return;
        }
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "ArrowUp") {
                e.preventDefault();
                setSliceZ((z) => Math.min(state.depth - 1, z + 1));
            } else if (e.key === "ArrowDown") {
                e.preventDefault();
                setSliceZ((z) => Math.max(0, z - 1));
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [view, state]);

    const play = (x: number, y: number, z: number) => {
        try {
            state.play(x, y, z);
            pinPlayer();
            setError(null);
            setTick((t) => t + 1);
        } catch (e) {
            setError((e as Error).message);
        }
    };

    const toggleDead = (x: number, y: number, z: number) => {
        if (state.getStone(x, y, z) === JGOFNumericPlayerColor.EMPTY) {
            return;
        }
        const group = state.getRawStoneString(x, y, z);
        setDead((prev) => {
            const next = new Set(prev);
            const allDead = group.every((p) => next.has(state.topology.idx(p.x, p.y, p.z)));
            for (const p of group) {
                const i = state.topology.idx(p.x, p.y, p.z);
                if (allDead) {
                    next.delete(i);
                } else {
                    next.add(i);
                }
            }
            return next;
        });
    };

    const onPoint = (x: number, y: number, z: number) => {
        if (finalMode) {
            toggleDead(x, y, z);
        } else {
            play(x, y, z);
        }
    };

    const score = React.useMemo<ScoreResult | null>(() => {
        void tick;
        if (scoreMode === "final") {
            return scoreTrompTaylor(state, { komi, dead });
        }
        if (scoreMode === "estimate") {
            return estimateScoreInfluence(state, { komi });
        }
        return null;
    }, [scoreMode, state, tick, dead, komi]);

    const blackTerritorySet = React.useMemo(
        () => new Set((score?.blackTerritory ?? []).map((p) => state.topology.idx(p.x, p.y, p.z))),
        [score, state],
    );
    const whiteTerritorySet = React.useMemo(
        () => new Set((score?.whiteTerritory ?? []).map((p) => state.topology.idx(p.x, p.y, p.z))),
        [score, state],
    );

    const sliceScoreProps = {
        scoring: finalMode,
        dead: finalMode ? dead : EMPTY_DEAD,
        blackTerritory: blackTerritorySet,
        whiteTerritory: whiteTerritorySet,
    };

    const onPass = () => {
        state.pass();
        pinPlayer();
        setError(null);
        setTick((t) => t + 1);
    };

    const onReset = () => {
        setState(new BoardState3D({ width: size, height: size, depth: size }));
        setSliceZ(0);
        setError(null);
    };

    return (
        <div className="Game">
            <div className="Toolbar">
                <div className="ToolGroup">
                    <span className="ControlLabel">View</span>
                    <Segmented
                        options={VIEW_MODES}
                        value={view}
                        onChange={(v) => setView(v as View3D)}
                    />
                </div>
                <Dropdown
                    label="Grid"
                    options={LINE_MODES}
                    value={lineMode}
                    onChange={(v) => setLineMode(v as LineMode)}
                    disabled={view !== "lattice"}
                />
                <div className="ToolGroup">
                    <button
                        type="button"
                        className={"Toggle" + (sectionCut ? " active" : "")}
                        disabled={view !== "lattice"}
                        onClick={() => setSectionCut((v) => !v)}
                    >
                        Section cut
                    </button>
                    <button
                        type="button"
                        className={"Toggle" + (showAllSlices ? " active" : "")}
                        disabled={view !== "lattice"}
                        onClick={() => setShowAllSlices((v) => !v)}
                    >
                        All slices
                    </button>
                </div>
                <Dropdown
                    label="Liberties"
                    options={LIB_MODES}
                    value={libMode}
                    onChange={(v) => setLibMode(v as LibMode)}
                />
                <Dropdown
                    label="Place"
                    options={PLACE_MODES}
                    value={placeMode}
                    onChange={(v) => setPlaceMode(v as PlaceMode)}
                />
                <div className="ToolGroup ToolGroup--right">
                    <Dropdown
                        label="Score"
                        options={SCORE_MODES}
                        value={scoreMode}
                        onChange={(v) => setScoreMode(v as ScoreMode)}
                    />
                    <span className="ControlSeparator" />
                    <button type="button" className="ToolAction" onClick={onPass}>
                        Pass
                    </button>
                    <button type="button" className="ToolAction" onClick={onReset}>
                        Reset
                    </button>
                    <button type="button" className="ToolAction" onClick={onNewGame}>
                        New
                    </button>
                </div>
            </div>

            <div className="Board">
                {view === "slices" ? (
                    <div className="Slices">
                        {Array.from({ length: state.depth }, (_, z) => (
                            <Slice
                                key={z}
                                state={state}
                                z={z}
                                onPlay={onPoint}
                                libMode={libMode}
                                onHoverGroup={onHoverGroup}
                                highlight={highlightSet}
                                {...sliceScoreProps}
                            />
                        ))}
                    </div>
                ) : (
                    <div className="LatticeLayout">
                        <LatticeView
                            state={state}
                            onPlay={onPoint}
                            syncKey={tick}
                            lineMode={lineMode}
                            sectionCut={sectionCut}
                            sliceZ={sliceZ}
                            highlights={highlights}
                            onHoverGroup={onHoverGroup}
                            scoring={finalMode}
                            dead={finalMode ? dead : EMPTY_DEAD}
                            blackTerritory={score?.blackTerritory ?? []}
                            whiteTerritory={score?.whiteTerritory ?? []}
                        />
                        <div className="SidePanel">
                            <div className="SidePanelHeader">
                                <button
                                    onClick={() => setSliceZ((z) => Math.max(0, z - 1))}
                                    disabled={sliceZ === 0}
                                >
                                    ▼
                                </button>
                                <span>z = {sliceZ}</span>
                                <button
                                    onClick={() =>
                                        setSliceZ((z) => Math.min(state.depth - 1, z + 1))
                                    }
                                    disabled={sliceZ === state.depth - 1}
                                >
                                    ▲
                                </button>
                            </div>
                            <div className="SlicePanelArea">
                                <div
                                    className="SliceGrid"
                                    style={{
                                        gridTemplateColumns: `repeat(${panelLayout.cols}, max-content)`,
                                        gap: `${PANEL_GAP}px`,
                                    }}
                                >
                                    {panelZs.map((z) => (
                                        <Slice
                                            key={z}
                                            state={state}
                                            z={z}
                                            onPlay={onPoint}
                                            cell={panelLayout.cell}
                                            current={z === sliceZ}
                                            libMode={libMode}
                                            onHoverGroup={onHoverGroup}
                                            highlight={highlightSet}
                                            {...sliceScoreProps}
                                        />
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {score && (
                <div className="ScorePanel">
                    <span className="ScoreMode">
                        {scoreMode === "estimate" ? "Estimate" : "Final"}
                    </span>
                    <label className="KomiInput">
                        Komi
                        <input
                            type="number"
                            step="0.5"
                            value={komi}
                            onChange={(e) => setKomi(parseFloat(e.target.value) || 0)}
                        />
                    </label>
                    <span className="ScoreCol">
                        Black — stones {score.black.stones}, territory {score.black.territory}, area{" "}
                        {score.black.area}
                    </span>
                    <span className="ScoreCol">
                        White — stones {score.white.stones}, territory {score.white.territory}, area{" "}
                        {score.white.area.toFixed(1)}
                    </span>
                    <strong className="ScoreResult">
                        {score.winner === "draw"
                            ? "Draw"
                            : `${score.winner === "black" ? "Black" : "White"} +${score.margin.toFixed(1)}`}
                    </strong>
                </div>
            )}

            <div className="Status">
                <span>
                    {size}³ · Move {state.move_number} · To play:{" "}
                    <strong>
                        {state.player === JGOFNumericPlayerColor.BLACK ? "Black" : "White"}
                    </strong>
                </span>
                <span>
                    Prisoners — B:{state.black_prisoners} W:{state.white_prisoners}
                </span>
                <span className="Hint">
                    {scoreMode === "final"
                        ? "final scoring · click a stone to toggle it dead"
                        : scoreMode === "estimate"
                          ? "estimating · keep playing, score updates live"
                          : view === "lattice"
                            ? "drag to rotate · click to play · ↑/↓ move slice"
                            : "click any intersection to play"}
                </span>
                {error && <span className="Error">{error}</span>}
            </div>
        </div>
    );
}

function LatticeView({
    state,
    onPlay,
    syncKey,
    lineMode,
    sectionCut,
    sliceZ,
    highlights,
    onHoverGroup,
    scoring,
    dead,
    blackTerritory,
    whiteTerritory,
}: {
    state: BoardState3D;
    onPlay: (x: number, y: number, z: number) => void;
    syncKey: number;
    lineMode: LineMode;
    sectionCut: boolean;
    sliceZ: number;
    highlights: Intersection3D[];
    onHoverGroup: (pos: Intersection3D | null) => void;
    scoring: boolean;
    dead: Set<number>;
    blackTerritory: Intersection3D[];
    whiteTerritory: Intersection3D[];
}): React.JSX.Element {
    const mount = React.useRef<HTMLDivElement>(null);
    const app = React.useRef<LatticeApp | null>(null);
    const on_play = React.useRef(onPlay);
    on_play.current = onPlay;
    const on_hover_group = React.useRef(onHoverGroup);
    on_hover_group.current = onHoverGroup;

    React.useEffect(() => {
        if (!mount.current) {
            return;
        }
        const created = createLatticeApp(
            mount.current,
            state,
            (x, y, z) => on_play.current(x, y, z),
            (pos) => on_hover_group.current(pos),
        );
        app.current = created;
        return () => {
            created.dispose();
            app.current = null;
        };
    }, [state]);

    React.useEffect(() => {
        app.current?.syncStones();
    }, [syncKey]);

    React.useEffect(() => {
        app.current?.setLineMode(lineMode);
    }, [lineMode, state]);

    React.useEffect(() => {
        app.current?.setSectionCut(sectionCut);
    }, [sectionCut, state]);

    React.useEffect(() => {
        app.current?.setSliceZ(sliceZ);
    }, [sliceZ, state]);

    React.useEffect(() => {
        app.current?.setHighlights(highlights);
    }, [highlights, state]);

    React.useEffect(() => {
        app.current?.setScoring(scoring);
    }, [scoring, state]);

    React.useEffect(() => {
        app.current?.setDead(dead);
    }, [dead, state]);

    React.useEffect(() => {
        app.current?.setTerritory(blackTerritory, whiteTerritory);
    }, [blackTerritory, whiteTerritory, state]);

    return <div ref={mount} className="LatticeMount" />;
}

function Slice({
    state,
    z,
    onPlay,
    cell = 28,
    current = false,
    libMode = "off",
    onHoverGroup,
    highlight,
    scoring = false,
    dead,
    blackTerritory,
    whiteTerritory,
}: {
    state: BoardState3D;
    z: number;
    onPlay: (x: number, y: number, z: number) => void;
    cell?: number;
    current?: boolean;
    libMode?: LibMode;
    onHoverGroup?: (pos: Intersection3D | null) => void;
    highlight?: Set<string>;
    scoring?: boolean;
    dead?: Set<number>;
    blackTerritory?: Set<number>;
    whiteTerritory?: Set<number>;
}): React.JSX.Element {
    const W = state.width;
    const H = state.height;
    const CELL = cell;
    const PAD = CELL * SLICE_PAD_FRAC;
    const svgW = (W - 1) * CELL + 2 * PAD;
    const svgH = (H - 1) * CELL + 2 * PAD;
    const cx = (x: number) => PAD + x * CELL;
    const cy = (y: number) => PAD + y * CELL;

    const [hover, setHover] = React.useState<{ x: number; y: number } | null>(null);

    const enter = (x: number, y: number) => {
        setHover({ x, y });
        if (libMode === "group" && onHoverGroup) {
            const occupied = state.getStone(x, y, z) !== JGOFNumericPlayerColor.EMPTY;
            onHoverGroup(occupied ? { x, y, z } : null);
        }
    };
    const leave = () => {
        setHover(null);
        if (libMode === "group" && onHoverGroup) {
            onHoverGroup(null);
        }
    };

    const cells: React.JSX.Element[] = [];
    const ghosts: React.JSX.Element[] = [];
    const stones: React.JSX.Element[] = [];
    const highlights: React.JSX.Element[] = [];
    const territories: React.JSX.Element[] = [];

    for (let y = 0; y < H; ++y) {
        for (let x = 0; x < W; ++x) {
            const idx = state.topology.idx(x, y, z);
            cells.push(
                <rect
                    key={`c${x},${y}`}
                    x={cx(x) - CELL / 2}
                    y={cy(y) - CELL / 2}
                    width={CELL}
                    height={CELL}
                    fill="transparent"
                    onClick={() => onPlay(x, y, z)}
                    onMouseEnter={() => enter(x, y)}
                    style={{ cursor: "pointer" }}
                />,
            );

            if (highlight && highlight.has(`${x},${y},${z}`)) {
                highlights.push(
                    <circle
                        key={`l${x},${y}`}
                        cx={cx(x)}
                        cy={cy(y)}
                        r={CELL * 0.24}
                        fill="#39d0ff"
                        opacity={0.85}
                        stroke="#06485e"
                        strokeWidth={1}
                        pointerEvents="none"
                    />,
                );
            }

            const terrOwner = blackTerritory?.has(idx)
                ? "black"
                : whiteTerritory?.has(idx)
                  ? "white"
                  : null;
            if (terrOwner) {
                territories.push(
                    <rect
                        key={`t${x},${y}`}
                        x={cx(x) - CELL * 0.18}
                        y={cy(y) - CELL * 0.18}
                        width={CELL * 0.36}
                        height={CELL * 0.36}
                        fill={terrOwner === "black" ? "#000" : "#fff"}
                        opacity={0.6}
                        pointerEvents="none"
                    />,
                );
            }

            const here = state.getStone(x, y, z);
            if (here !== JGOFNumericPlayerColor.EMPTY) {
                stones.push(
                    <circle
                        key={`s${x},${y}`}
                        cx={cx(x)}
                        cy={cy(y)}
                        r={CELL * 0.45}
                        fill={here === JGOFNumericPlayerColor.BLACK ? "#111" : "#fafafa"}
                        stroke="#000"
                        strokeWidth={1}
                        opacity={dead?.has(idx) ? 0.25 : 1}
                    />,
                );
            } else if (state.depth > 1) {
                const above = z + 1 < state.depth ? state.getStone(x, y, z + 1) : 0;
                const below = z - 1 >= 0 ? state.getStone(x, y, z - 1) : 0;
                const ghost = above || below;
                if (ghost) {
                    ghosts.push(
                        <circle
                            key={`g${x},${y}`}
                            cx={cx(x)}
                            cy={cy(y)}
                            r={3}
                            fill={ghost === JGOFNumericPlayerColor.BLACK ? "#000" : "#fff"}
                            opacity={0.4}
                            pointerEvents="none"
                        />,
                    );
                }
            }
        }
    }

    const gridLines: React.JSX.Element[] = [];
    for (let y = 0; y < H; ++y) {
        gridLines.push(
            <line
                key={`h${y}`}
                x1={cx(0)}
                y1={cy(y)}
                x2={cx(W - 1)}
                y2={cy(y)}
                stroke="#1a1208"
                strokeWidth={1}
            />,
        );
    }
    for (let x = 0; x < W; ++x) {
        gridLines.push(
            <line
                key={`v${x}`}
                x1={cx(x)}
                y1={cy(0)}
                x2={cx(x)}
                y2={cy(H - 1)}
                stroke="#1a1208"
                strokeWidth={1}
            />,
        );
    }

    let preview: React.JSX.Element | null = null;
    if (!scoring && hover && state.getStone(hover.x, hover.y, z) === JGOFNumericPlayerColor.EMPTY) {
        preview = (
            <circle
                cx={cx(hover.x)}
                cy={cy(hover.y)}
                r={CELL * 0.45}
                fill={state.player === JGOFNumericPlayerColor.BLACK ? "#111" : "#fafafa"}
                opacity={0.45}
                pointerEvents="none"
            />
        );
    }

    return (
        <div className={current ? "Slice current" : "Slice"}>
            <div className="SliceLabel">
                z = {z}
                {current ? " · current" : ""}
            </div>
            <svg width={svgW} height={svgH} className="SliceSvg" onMouseLeave={leave}>
                {gridLines}
                {ghosts}
                {highlights}
                {territories}
                {stones}
                {preview}
                {cells}
            </svg>
        </div>
    );
}

const react_root = ReactDOM.createRoot(document.getElementById("test-content") as Element);
react_root.render(<Sandbox />);
