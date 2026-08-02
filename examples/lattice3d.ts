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

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls";
import { BoardState3D, Intersection3D, JGOFNumericPlayerColor } from "../src";

export type LineMode = "all" | "horizontal" | "vertical" | "none";

export type Theme = "dark" | "light";

export interface LatticeApp {
    syncStones(): void;
    setSliceZ(z: number): void;
    setSectionCut(enabled: boolean): void;
    setLineMode(mode: LineMode): void;
    setHighlights(points: Intersection3D[]): void;
    setDead(dead: Set<number>): void;
    setTerritory(black: Intersection3D[], white: Intersection3D[]): void;
    setScoring(enabled: boolean): void;
    setTheme(theme: Theme): void;
    dispose(): void;
}

/* Scene colors per theme. Everything else (stones, preview) keeps its own
 * black/white identity in both themes. */
interface LatticeTheme {
    background: number;
    edge: number;
    edge_opacity: number;
    highlight: number;
    territory_black: number;
    territory_white: number;
    ambient: number;
    key_light: number;
}

const THEMES: Record<Theme, LatticeTheme> = {
    dark: {
        background: 0x1e1e1e,
        edge: 0x666666,
        edge_opacity: 0.45,
        highlight: 0x39d0ff,
        territory_black: 0x000000,
        territory_white: 0xffffff,
        ambient: 0.75,
        key_light: 0.85,
    },
    light: {
        background: 0xe6e2da,
        edge: 0x6b6459,
        edge_opacity: 0.55,
        highlight: 0x0b87b8,
        territory_black: 0x1a1a1a,
        territory_white: 0xffffff,
        ambient: 0.85,
        key_light: 0.7,
    },
};

interface NodeUserData {
    kind: "point" | "stone";
    x: number;
    y: number;
    z: number;
}

const NO_CUT = 1e9;

/**
 * Imperative three.js scene for a 3D Go lattice. Board layers (z) stack
 * vertically (world Y); each layer is a horizontal x/y plane. Stones are
 * spheres. Intersection markers are invisible but still serve as raycast
 * targets; a hovered empty point shows a translucent preview stone. Drag to
 * orbit, click an intersection to play. A section-cut clipping plane can hide
 * everything above the current slice. onHoverGroup reports the stone under
 * the cursor (or null) for liberty highlighting.
 */
export function createLatticeApp(
    mount: HTMLElement,
    state: BoardState3D,
    onPlay: (x: number, y: number, z: number) => void,
    onHoverGroup: (pos: Intersection3D | null) => void,
    theme: Theme = "dark",
): LatticeApp {
    let palette = THEMES[theme];
    const W = state.width;
    const H = state.height;
    const D = state.depth;

    /* board (x, y, layer z) -> world (x, up=layer, depth=board-y) */
    const wx = (x: number): number => x - (W - 1) / 2;
    const wy = (z: number): number => z - (D - 1) / 2;
    const wz = (y: number): number => y - (H - 1) / 2;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(palette.background);

    let viewW = mount.clientWidth || 640;
    let viewH = mount.clientHeight || 560;

    const camera = new THREE.PerspectiveCamera(50, viewW / viewH, 0.1, 1000);
    const maxDim = Math.max(W, H, D);
    camera.position.set(maxDim * 1.4, maxDim * 1.1, maxDim * 1.9);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(viewW, viewH);
    renderer.localClippingEnabled = true;
    mount.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 0, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.1;
    controls.update();

    const ambient_light = new THREE.AmbientLight(0xffffff, palette.ambient);
    scene.add(ambient_light);
    const key_light = new THREE.DirectionalLight(0xffffff, palette.key_light);
    key_light.position.set(maxDim, maxDim * 2, maxDim * 1.5);
    scene.add(key_light);

    /* Section-cut plane: keep everything at or below world-y = constant.
     * Starts disabled (constant pushed out of range). */
    const clip_plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), NO_CUT);
    let cut_on = false;
    let current_slice_z = 0;
    let scoring = false;
    let dead_set: Set<number> = new Set();

    /* Lattice edges, split into horizontal (within-layer x/y) and vertical
     * (between-layer z) so each can be shown independently. */
    const edge_positions_h: number[] = [];
    const edge_positions_v: number[] = [];
    for (let z = 0; z < D; ++z) {
        for (let y = 0; y < H; ++y) {
            for (let x = 0; x < W; ++x) {
                if (x + 1 < W) {
                    edge_positions_h.push(wx(x), wy(z), wz(y), wx(x + 1), wy(z), wz(y));
                }
                if (y + 1 < H) {
                    edge_positions_h.push(wx(x), wy(z), wz(y), wx(x), wy(z), wz(y + 1));
                }
                if (z + 1 < D) {
                    edge_positions_v.push(wx(x), wy(z), wz(y), wx(x), wy(z + 1), wz(y));
                }
            }
        }
    }
    const edge_mat = new THREE.LineBasicMaterial({
        color: palette.edge,
        transparent: true,
        opacity: palette.edge_opacity,
        clippingPlanes: [clip_plane],
    });
    const edges_h_geom = new THREE.BufferGeometry();
    edges_h_geom.setAttribute("position", new THREE.Float32BufferAttribute(edge_positions_h, 3));
    const edges_h = new THREE.LineSegments(edges_h_geom, edge_mat);
    scene.add(edges_h);
    const edges_v_geom = new THREE.BufferGeometry();
    edges_v_geom.setAttribute("position", new THREE.Float32BufferAttribute(edge_positions_v, 3));
    const edges_v = new THREE.LineSegments(edges_v_geom, edge_mat);
    scene.add(edges_v);

    /* Invisible intersection markers, used only as raycast targets. */
    const point_geom = new THREE.SphereGeometry(0.12, 8, 8);
    const point_mat = new THREE.MeshBasicMaterial({
        transparent: true,
        opacity: 0,
        depthWrite: false,
    });
    const pick_targets: THREE.Mesh[] = [];
    const points_group = new THREE.Group();
    for (let z = 0; z < D; ++z) {
        for (let y = 0; y < H; ++y) {
            for (let x = 0; x < W; ++x) {
                const m = new THREE.Mesh(point_geom, point_mat);
                m.position.set(wx(x), wy(z), wz(y));
                m.userData = { kind: "point", x, y, z } as NodeUserData;
                points_group.add(m);
                pick_targets.push(m);
            }
        }
    }
    scene.add(points_group);

    /* Stones (rebuilt on sync) */
    const stone_group = new THREE.Group();
    scene.add(stone_group);
    const stone_geom = new THREE.SphereGeometry(0.4, 24, 24);
    const black_mat = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.45,
        clippingPlanes: [clip_plane],
    });
    const white_mat = new THREE.MeshStandardMaterial({
        color: 0xf5f5f5,
        roughness: 0.55,
        clippingPlanes: [clip_plane],
    });
    /* Dimmed variants for stones marked dead during scoring. */
    const dead_black_mat = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.45,
        transparent: true,
        opacity: 0.25,
        clippingPlanes: [clip_plane],
    });
    const dead_white_mat = new THREE.MeshStandardMaterial({
        color: 0xf5f5f5,
        roughness: 0.55,
        transparent: true,
        opacity: 0.25,
        clippingPlanes: [clip_plane],
    });

    /* Territory markers (rebuilt via setTerritory): small cubes tinted by owner. */
    const territory_group = new THREE.Group();
    scene.add(territory_group);
    const territory_geom = new THREE.BoxGeometry(0.3, 0.3, 0.3);
    const terr_black_mat = new THREE.MeshBasicMaterial({
        color: palette.territory_black,
        transparent: true,
        opacity: 0.55,
        clippingPlanes: [clip_plane],
    });
    const terr_white_mat = new THREE.MeshBasicMaterial({
        color: palette.territory_white,
        transparent: true,
        opacity: 0.55,
        clippingPlanes: [clip_plane],
    });

    /* Translucent preview stone shown at the hovered empty point, tinted to
     * whichever color is about to be played. */
    const preview_mat = new THREE.MeshStandardMaterial({
        color: 0x111111,
        roughness: 0.5,
        transparent: true,
        opacity: 0.45,
        clippingPlanes: [clip_plane],
    });
    const preview_mesh = new THREE.Mesh(stone_geom, preview_mat);
    preview_mesh.visible = false;
    scene.add(preview_mesh);

    /* Liberty highlight markers (rebuilt via setHighlights) */
    const highlight_group = new THREE.Group();
    scene.add(highlight_group);
    const highlight_geom = new THREE.SphereGeometry(0.2, 12, 12);
    const highlight_mat = new THREE.MeshBasicMaterial({
        color: palette.highlight,
        transparent: true,
        opacity: 0.85,
        clippingPlanes: [clip_plane],
    });

    function setHighlights(points: Intersection3D[]): void {
        while (highlight_group.children.length) {
            highlight_group.remove(highlight_group.children[0]);
        }
        for (const p of points) {
            const m = new THREE.Mesh(highlight_geom, highlight_mat);
            m.position.set(wx(p.x), wy(p.z), wz(p.y));
            highlight_group.add(m);
        }
    }

    function pointPickable(ud: NodeUserData, m: THREE.Mesh): boolean {
        if (!m.visible) {
            return false;
        }
        return !cut_on || ud.z <= current_slice_z;
    }

    function syncStones(): void {
        preview_mesh.visible = false;
        while (stone_group.children.length) {
            stone_group.remove(stone_group.children[0]);
        }
        for (let z = 0; z < D; ++z) {
            for (let y = 0; y < H; ++y) {
                for (let x = 0; x < W; ++x) {
                    const c = state.getStone(x, y, z);
                    if (c === JGOFNumericPlayerColor.EMPTY) {
                        continue;
                    }
                    const is_dead = dead_set.has(state.topology.idx(x, y, z));
                    const mat =
                        c === JGOFNumericPlayerColor.BLACK
                            ? is_dead
                                ? dead_black_mat
                                : black_mat
                            : is_dead
                              ? dead_white_mat
                              : white_mat;
                    const mesh = new THREE.Mesh(stone_geom, mat);
                    mesh.position.set(wx(x), wy(z), wz(y));
                    mesh.userData = { kind: "stone", x, y, z } as NodeUserData;
                    stone_group.add(mesh);
                }
            }
        }
        for (const m of pick_targets) {
            const ud = m.userData as NodeUserData;
            m.visible = state.getStone(ud.x, ud.y, ud.z) === JGOFNumericPlayerColor.EMPTY;
        }
    }

    function applyCut(): void {
        clip_plane.constant = cut_on ? wy(current_slice_z) + 0.5 : NO_CUT;
    }

    function setSliceZ(z: number): void {
        current_slice_z = z;
        applyCut();
    }

    function setSectionCut(enabled: boolean): void {
        cut_on = enabled;
        applyCut();
    }

    function setLineMode(mode: LineMode): void {
        edges_h.visible = mode === "all" || mode === "horizontal";
        edges_v.visible = mode === "all" || mode === "vertical";
    }

    function setDead(dead: Set<number>): void {
        dead_set = dead;
        syncStones();
    }

    function setScoring(enabled: boolean): void {
        scoring = enabled;
        if (enabled) {
            preview_mesh.visible = false;
        }
    }

    function setTheme(next: Theme): void {
        palette = THEMES[next];
        (scene.background as THREE.Color).setHex(palette.background);
        edge_mat.color.setHex(palette.edge);
        edge_mat.opacity = palette.edge_opacity;
        highlight_mat.color.setHex(palette.highlight);
        terr_black_mat.color.setHex(palette.territory_black);
        terr_white_mat.color.setHex(palette.territory_white);
        ambient_light.intensity = palette.ambient;
        key_light.intensity = palette.key_light;
    }

    function setTerritory(black: Intersection3D[], white: Intersection3D[]): void {
        while (territory_group.children.length) {
            territory_group.remove(territory_group.children[0]);
        }
        for (const p of black) {
            const m = new THREE.Mesh(territory_geom, terr_black_mat);
            m.position.set(wx(p.x), wy(p.z), wz(p.y));
            territory_group.add(m);
        }
        for (const p of white) {
            const m = new THREE.Mesh(territory_geom, terr_white_mat);
            m.position.set(wx(p.x), wy(p.z), wz(p.y));
            territory_group.add(m);
        }
    }

    /* Pointer handling: distinguish click (place) from drag (orbit) */
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let down_x = 0;
    let down_y = 0;

    function updatePointer(e: PointerEvent): void {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        pointer.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    }

    function pickableTargets(): THREE.Mesh[] {
        return pick_targets.filter((m) => pointPickable(m.userData as NodeUserData, m));
    }

    function blockingStones(): THREE.Object3D[] {
        if (!cut_on) {
            return stone_group.children;
        }
        return stone_group.children.filter(
            (m) => (m.userData as NodeUserData).z <= current_slice_z,
        );
    }

    function onPointerDown(e: PointerEvent): void {
        down_x = e.clientX;
        down_y = e.clientY;
    }

    function onPointerUp(e: PointerEvent): void {
        if (Math.hypot(e.clientX - down_x, e.clientY - down_y) > 5) {
            return; /* was a drag */
        }
        updatePointer(e);
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects([...pickableTargets(), ...blockingStones()], false);
        if (hits.length) {
            const ud = hits[0].object.userData as NodeUserData;
            /* Empty points always forward; stones forward only while scoring
             * (so a click can toggle a group dead). */
            if (ud.kind === "point" || scoring) {
                onPlay(ud.x, ud.y, ud.z);
            }
        }
    }

    function onPointerMove(e: PointerEvent): void {
        updatePointer(e);
        raycaster.setFromCamera(pointer, camera);
        const hits = raycaster.intersectObjects([...pickableTargets(), ...blockingStones()], false);
        if (!hits.length) {
            preview_mesh.visible = false;
            onHoverGroup(null);
            return;
        }
        const ud = hits[0].object.userData as NodeUserData;
        if (ud.kind === "point" && !scoring) {
            preview_mesh.position.set(wx(ud.x), wy(ud.z), wz(ud.y));
            preview_mat.color.setHex(
                state.player === JGOFNumericPlayerColor.BLACK ? 0x111111 : 0xf5f5f5,
            );
            preview_mesh.visible = true;
            onHoverGroup(null);
        } else {
            preview_mesh.visible = false;
            onHoverGroup(ud.kind === "stone" ? { x: ud.x, y: ud.y, z: ud.z } : null);
        }
    }

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointermove", onPointerMove);

    function onResize(): void {
        viewW = mount.clientWidth || 640;
        viewH = mount.clientHeight || 560;
        camera.aspect = viewW / viewH;
        camera.updateProjectionMatrix();
        renderer.setSize(viewW, viewH);
    }
    const resize_observer = new ResizeObserver(onResize);
    resize_observer.observe(mount);

    let raf = 0;
    function animate(): void {
        raf = requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }
    animate();

    syncStones();

    function dispose(): void {
        cancelAnimationFrame(raf);
        resize_observer.disconnect();
        renderer.domElement.removeEventListener("pointerdown", onPointerDown);
        renderer.domElement.removeEventListener("pointerup", onPointerUp);
        renderer.domElement.removeEventListener("pointermove", onPointerMove);
        controls.dispose();
        edges_h_geom.dispose();
        edges_v_geom.dispose();
        edge_mat.dispose();
        point_geom.dispose();
        point_mat.dispose();
        stone_geom.dispose();
        black_mat.dispose();
        white_mat.dispose();
        dead_black_mat.dispose();
        dead_white_mat.dispose();
        territory_geom.dispose();
        terr_black_mat.dispose();
        terr_white_mat.dispose();
        preview_mat.dispose();
        highlight_geom.dispose();
        highlight_mat.dispose();
        renderer.dispose();
        if (renderer.domElement.parentNode === mount) {
            mount.removeChild(renderer.domElement);
        }
    }

    return {
        syncStones,
        setSliceZ,
        setSectionCut,
        setLineMode,
        setHighlights,
        setDead,
        setTerritory,
        setScoring,
        setTheme,
        dispose,
    };
}
