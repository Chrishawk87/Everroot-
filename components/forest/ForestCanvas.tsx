"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Sky, Environment, Lightformer } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette, SMAA } from "@react-three/postprocessing";
import * as THREE from "three";
import type { ForestGraph, ForestNodeDTO, GrowthStage } from "@/lib/forest/types";
import { computeLayout, type PositionedNode, type Vec3, type Limb, type ForestLayout } from "@/lib/forest/layout";

const COLORS: Record<string, string> = {
  SEED: "#c9a86a",
  LEAF: "#7cc35a",
  FLOWER: "#e5738a",
  FRUIT: "#e8a33d",
  PHOTO: "#cfd8e3",
  PERSON: "#7fc99a",
  ROOT: "#7a5638",
  MEMORY_MOMENT: "#5bd0c0",
  MEMORY: "#9ad0b0",
};

const HIDDEN = new Set(["TIMELINE_EVENT", "RELATIONSHIP", "SUB_BRANCH"]);

// Normal-map strengths (three expects a Vector2, not an array literal).
const BARK_NORMAL_SCALE = new THREE.Vector2(0.7, 0.7);
const TRUNK_NORMAL_SCALE = new THREE.Vector2(0.85, 0.85);
const GROUND_NORMAL_SCALE = new THREE.Vector2(0.6, 0.6);
const SUN_POSITION: Vec3 = [-28, 30, -18];
// A memorial forest is lit at dusk: the sun rests low on the horizon, casting a
// long amber light that fades to a deep twilight blue overhead — a quiet, elegiac
// version of the same living world.
const MEMORIAL_SUN: Vec3 = [-26, 3.5, -20];

// Atmosphere palette, swapped whole when a forest becomes a memorial.
interface Atmosphere {
  sun: Vec3;
  background: string;
  sky: { turbidity: number; rayleigh: number; mieCoefficient: number; mieDirectionalG: number };
  fog: { color: string; near: number; far: number };
  ambient: number;
  hemi: { sky: string; ground: string; intensity: number };
  dir: { color: string; intensity: number };
  motes: { color: string; opacity: number };
}

const DAY_ATMOSPHERE: Atmosphere = {
  sun: SUN_POSITION,
  background: "#cfe3d6",
  sky: { turbidity: 6, rayleigh: 1.4, mieCoefficient: 0.006, mieDirectionalG: 0.85 },
  fog: { color: "#d7e6d2", near: 22, far: 65 },
  ambient: 0.4,
  hemi: { sky: "#e6f2e6", ground: "#4a5b34", intensity: 0.65 },
  dir: { color: "#fff1d6", intensity: 2.1 },
  motes: { color: "#fff2c8", opacity: 0.35 },
};

const MEMORIAL_ATMOSPHERE: Atmosphere = {
  sun: MEMORIAL_SUN,
  background: "#141d2b",
  sky: { turbidity: 10, rayleigh: 3.2, mieCoefficient: 0.02, mieDirectionalG: 0.82 },
  fog: { color: "#26303f", near: 14, far: 52 },
  ambient: 0.26,
  hemi: { sky: "#9fb0cc", ground: "#2a2b24", intensity: 0.4 },
  dir: { color: "#e7b184", intensity: 1.25 },
  // Warmer, brighter drifting motes read like candlelight or rising embers of memory.
  motes: { color: "#ffd8a0", opacity: 0.6 },
};

// ---- Living time-of-day cycle ----
// A slow ~2.5-minute loop carries the forest from night, through dawn, into full
// day, then down through golden hour to sunset and back to night. The scene
// starts mid-day so a fresh visitor lands in daylight. Each phase is a full
// Atmosphere plus a `night` value (0 = bright day, 1 = deep night) that drives
// the drifting motes and the memory constellations.
interface Keyframe extends Atmosphere {
  at: number; // position in the 0..1 cycle
  night: number;
}

const NIGHT_ATMOSPHERE: Atmosphere = {
  sun: [18, -6, 16],
  background: "#0a1020",
  sky: { turbidity: 0.1, rayleigh: 0.35, mieCoefficient: 0.001, mieDirectionalG: 0.9 },
  fog: { color: "#0d1526", near: 16, far: 62 },
  ambient: 0.18,
  hemi: { sky: "#38507a", ground: "#0e141d", intensity: 0.35 },
  dir: { color: "#9fb8e0", intensity: 0.28 },
  motes: { color: "#bcd0ff", opacity: 0.5 },
};

const DAWN_ATMOSPHERE: Atmosphere = {
  sun: [26, 5, 16],
  background: "#e6c4a8",
  sky: { turbidity: 4, rayleigh: 2.4, mieCoefficient: 0.02, mieDirectionalG: 0.85 },
  fog: { color: "#e6cbb6", near: 18, far: 62 },
  ambient: 0.34,
  hemi: { sky: "#f6dcc4", ground: "#40492e", intensity: 0.5 },
  dir: { color: "#ffd9a8", intensity: 1.3 },
  motes: { color: "#ffe4c0", opacity: 0.4 },
};

const GOLDEN_ATMOSPHERE: Atmosphere = {
  sun: [-26, 10, -20],
  background: "#e8d3a8",
  sky: { turbidity: 7, rayleigh: 2.0, mieCoefficient: 0.02, mieDirectionalG: 0.9 },
  fog: { color: "#e6d0a2", near: 20, far: 63 },
  ambient: 0.4,
  hemi: { sky: "#f3e0b0", ground: "#4a4a2e", intensity: 0.6 },
  dir: { color: "#ffcf8a", intensity: 2.0 },
  motes: { color: "#ffe6b0", opacity: 0.42 },
};

const SUNSET_ATMOSPHERE: Atmosphere = {
  sun: [-26, 2.5, -22],
  background: "#3a2c3e",
  sky: { turbidity: 10, rayleigh: 3.4, mieCoefficient: 0.03, mieDirectionalG: 0.85 },
  fog: { color: "#3a2f3e", near: 16, far: 56 },
  ambient: 0.28,
  hemi: { sky: "#c58aa0", ground: "#2a2320", intensity: 0.42 },
  dir: { color: "#ff9d6a", intensity: 1.1 },
  motes: { color: "#ffcfa0", opacity: 0.55 },
};

const DAY_CYCLE: Keyframe[] = [
  { at: 0.0, night: 1.0, ...NIGHT_ATMOSPHERE },
  { at: 0.16, night: 0.45, ...DAWN_ATMOSPHERE },
  { at: 0.32, night: 0.0, ...DAY_ATMOSPHERE },
  { at: 0.6, night: 0.0, ...DAY_ATMOSPHERE },
  { at: 0.76, night: 0.2, ...GOLDEN_ATMOSPHERE },
  { at: 0.9, night: 0.7, ...SUNSET_ATMOSPHERE },
  { at: 1.0, night: 1.0, ...NIGHT_ATMOSPHERE },
];

// Precomputed THREE.Color instances for each keyframe (avoids per-frame string parsing).
const CYCLE_COLORS = DAY_CYCLE.map((k) => ({
  bg: new THREE.Color(k.background),
  fog: new THREE.Color(k.fog.color),
  hemiSky: new THREE.Color(k.hemi.sky),
  hemiGround: new THREE.Color(k.hemi.ground),
  dir: new THREE.Color(k.dir.color),
}));

// Day/night follows the visitor's real local clock: midnight = 0, noon = 0.5.
function realTimePhase() {
  const now = new Date();
  return (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds()) / 86400;
}

// The nine interview branches each carry their own light. Memory leaves inherit
// their branch's color and glow a little brighter so the tree reads as chapters
// of a life, not one undifferentiated canopy. "Messages for Future Generations"
// is the brightest — it's the whole point of the forest.
const CATEGORY_COLORS: Record<string, string> = {
  "Life Advice": "#cdd8ff",
  "Family Traditions": "#f2c66b",
  "Favorite Stories": "#7fd0e8",
  "Childhood Memories": "#8fe0a0",
  Milestones: "#ffb0d6",
  "Roots & Heritage": "#d0a06a",
  "Biggest Wins": "#ffd54a",
  "Biggest Mistakes": "#9aa2b4",
  "Messages for Future Generations": "#fff4c0",
  Tributes: "#ffc2a6",
};

const MEMORY_KINDS = new Set(["LEAF", "FLOWER", "FRUIT", "PHOTO", "MEMORY", "MEMORY_MOMENT"]);

// Crown fullness by growth stage: radius + decorative leaf count.
const CROWN: Record<GrowthStage, { r: number; count: number }> = {
  SEED: { r: 0, count: 0 },
  SPROUT: { r: 0.55, count: 45 },
  SAPLING: { r: 1.15, count: 180 },
  YOUNG_TREE: { r: 1.9, count: 480 },
  MATURE_TREE: { r: 2.6, count: 950 },
  ANCIENT_TREE: { r: 3.3, count: 1450 },
};
const STAGE_INDEX: Record<GrowthStage, number> = {
  SEED: 0, SPROUT: 1, SAPLING: 2, YOUNG_TREE: 3, MATURE_TREE: 4, ANCIENT_TREE: 5,
};

function hash01(id: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/* ---------- Procedural textures (canvas-generated; no external assets) ---------- */

function makeLeafTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 160;
  const x = c.getContext("2d")!;
  x.clearRect(0, 0, 128, 160);
  x.beginPath();
  x.moveTo(64, 4);
  x.bezierCurveTo(122, 42, 108, 132, 64, 156);
  x.bezierCurveTo(20, 132, 6, 42, 64, 4);
  x.closePath();
  const g = x.createLinearGradient(0, 0, 40, 160);
  g.addColorStop(0, "#8fce62");
  g.addColorStop(0.5, "#4e9a3d");
  g.addColorStop(1, "#2f6b2a");
  x.fillStyle = g;
  x.fill();
  x.strokeStyle = "rgba(22,60,22,0.45)";
  x.lineWidth = 2.5;
  x.beginPath();
  x.moveTo(64, 10);
  x.lineTo(64, 150);
  x.stroke();
  x.lineWidth = 1;
  for (let i = 1; i < 7; i++) {
    const yy = 18 + i * 19;
    x.beginPath();
    x.moveTo(64, yy);
    x.lineTo(64 + (i % 2 ? 28 : -28), yy - 15);
    x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

// Converts a grayscale height canvas into a tangent-space normal map so surface
// detail catches the moving light believably (real bark ridges, not a flat decal).
function heightToNormal(height: HTMLCanvasElement, strength = 2.2): HTMLCanvasElement {
  const w = height.width;
  const h = height.height;
  const src = height.getContext("2d")!.getImageData(0, 0, w, h).data;
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const dst = out.getContext("2d")!.createImageData(w, h);
  const at = (xx: number, yy: number) => {
    const cx = (xx + w) % w;
    const cy = (yy + h) % h;
    return src[(cy * w + cx) * 4] / 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (at(x - 1, y) - at(x + 1, y)) * strength;
      const dy = (at(x, y - 1) - at(x, y + 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * w + x) * 4;
      dst.data[i] = ((dx / len) * 0.5 + 0.5) * 255;
      dst.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      dst.data[i + 2] = (1 / len) * 255;
      dst.data[i + 3] = 255;
    }
  }
  out.getContext("2d")!.putImageData(dst, 0, 0);
  return out;
}

function makeBarkTexture(): { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } {
  const w = 512;
  const h = 1024;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d")!;
  // Base gradient so the bark isn't a flat brown fill.
  const bg = x.createLinearGradient(0, 0, w, 0);
  bg.addColorStop(0, "#4a3320");
  bg.addColorStop(0.5, "#63472e");
  bg.addColorStop(1, "#4f3924");
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
  // Mottled patches for age and moss hints.
  for (let i = 0; i < 900; i++) {
    const r = 6 + Math.random() * 40;
    const g = Math.random() < 0.15;
    x.fillStyle = g
      ? `rgba(70,88,52,${0.03 + Math.random() * 0.05})`
      : `rgba(${30 + Math.random() * 40},${20 + Math.random() * 26},${12 + Math.random() * 16},${0.05 + Math.random() * 0.08})`;
    x.beginPath();
    x.arc(Math.random() * w, Math.random() * h, r, 0, Math.PI * 2);
    x.fill();
  }
  const hc = document.createElement("canvas");
  hc.width = w;
  hc.height = h;
  const hx = hc.getContext("2d")!;
  hx.fillStyle = "#808080";
  hx.fillRect(0, 0, w, h);
  // Long vertical furrows: paired dark (color) + height strokes.
  for (let i = 0; i < 520; i++) {
    const px = Math.random() * w;
    const py = Math.random() * h;
    const len = 80 + Math.random() * 420;
    const dark = Math.random() < 0.55;
    const a = 0.12 + Math.random() * 0.32;
    const lw = 1 + Math.random() * 5;
    const cx = (Math.random() - 0.5) * 12;
    x.strokeStyle = dark ? `rgba(28,18,10,${a})` : `rgba(132,100,66,${a})`;
    x.lineWidth = lw;
    x.beginPath();
    x.moveTo(px, py);
    x.bezierCurveTo(px + cx, py + len * 0.5, px + cx, py + len, px + cx * 0.6, py + len);
    x.stroke();
    hx.strokeStyle = dark ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;
    hx.lineWidth = lw;
    hx.beginPath();
    hx.moveTo(px, py);
    hx.bezierCurveTo(px + cx, py + len * 0.5, px + cx, py + len, px + cx * 0.6, py + len);
    hx.stroke();
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1.5, 3);
  map.anisotropy = 8;
  const normal = new THREE.CanvasTexture(heightToNormal(hc, 2.6));
  normal.wrapS = normal.wrapT = THREE.RepeatWrapping;
  normal.repeat.set(1.5, 3);
  return { map, normal };
}

function makeGrassTexture(): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const x = c.getContext("2d")!;
  x.fillStyle = "#3f6f34";
  x.fillRect(0, 0, s, s);
  for (let i = 0; i < 6000; i++) {
    x.fillStyle = `rgba(${28 + Math.random() * 46},${78 + Math.random() * 70},${30 + Math.random() * 44},0.5)`;
    x.fillRect(Math.random() * s, Math.random() * s, 2, 2 + Math.random() * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  return tex;
}

// A soft, tileable noise normal map so the ground plane catches light with a
// little organic unevenness instead of reading as glass-flat.
function makeGroundNormal(): THREE.CanvasTexture {
  const s = 256;
  const hc = document.createElement("canvas");
  hc.width = s;
  hc.height = s;
  const hx = hc.getContext("2d")!;
  hx.fillStyle = "#808080";
  hx.fillRect(0, 0, s, s);
  for (let i = 0; i < 2600; i++) {
    const g = 90 + Math.random() * 110;
    hx.fillStyle = `rgba(${g},${g},${g},0.5)`;
    hx.beginPath();
    hx.arc(Math.random() * s, Math.random() * s, 1 + Math.random() * 4, 0, Math.PI * 2);
    hx.fill();
  }
  const tex = new THREE.CanvasTexture(heightToNormal(hc, 1.6));
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(24, 24);
  return tex;
}

function makeRadialShadow(): THREE.CanvasTexture {
  const s = 256;
  const c = document.createElement("canvas");
  c.width = s;
  c.height = s;
  const x = c.getContext("2d")!;
  const g = x.createRadialGradient(128, 128, 8, 128, 128, 128);
  g.addColorStop(0, "rgba(0,0,0,0.5)");
  g.addColorStop(0.7, "rgba(0,0,0,0.22)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  x.fillStyle = g;
  x.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

/* ---------- Scene ---------- */

interface Props {
  graph: ForestGraph;
  selectedId: string | null;
  focusId: string | null;
  onSelect: (node: ForestNodeDTO | null) => void;
  memorial?: boolean;
}

export default function ForestCanvas({ graph, selectedId, focusId, onSelect, memorial = false }: Props) {
  const layout = useMemo(() => computeLayout(graph), [graph]);
  const stageIdx = STAGE_INDEX[graph.stage];
  const atmo = memorial ? MEMORIAL_ATMOSPHERE : DAY_ATMOSPHERE;

  const bark = useMemo(makeBarkTexture, []);
  const leafTex = useMemo(makeLeafTexture, []);
  const grass = useMemo(makeGrassTexture, []);
  const groundNormal = useMemo(makeGroundNormal, []);
  const shadowTex = useMemo(makeRadialShadow, []);

  const crown = CROWN[graph.stage];
  const crownCenter = useMemo<Vec3>(
    () => [0, layout.trunkHeight + crown.r * 0.45, 0],
    [layout.trunkHeight, crown.r],
  );

  const focusPos = useMemo<Vec3 | null>(() => {
    if (!focusId) return null;
    const p = layout.positioned.find((n) => n.node.id === focusId);
    return p ? p.position : null;
  }, [focusId, layout]);

  // Map each memory node to the color of the branch it hangs from, so leaves,
  // memory glyphs and constellation stars all speak their category's language.
  const categoryColorByNodeId = useMemo(() => {
    const branchTitle = new Map<string, string>();
    for (const n of graph.nodes) if (n.kind === "BRANCH") branchTitle.set(n.id, n.title);
    const m = new Map<string, string>();
    for (const p of layout.positioned) {
      const title = p.parentId ? branchTitle.get(p.parentId) : undefined;
      if (title && CATEGORY_COLORS[title]) m.set(p.node.id, CATEGORY_COLORS[title]);
    }
    return m;
  }, [graph, layout]);

  // Shared state the day-cycle writes and the constellations read (0 day → 1 night).
  const nightRef = useRef(memorial ? 0.6 : 0);
  const ambientRef = useRef<THREE.AmbientLight>(null);
  const hemiRef = useRef<THREE.HemisphereLight>(null);
  const dirRef = useRef<THREE.DirectionalLight>(null);
  const skyRef = useRef<React.ElementRef<typeof Sky>>(null);

  // Frame the tall tree well on portrait phones (pull back + slightly wider lens),
  // tighter and more cinematic on landscape/desktop.
  const isPortrait = typeof window !== "undefined" && window.innerHeight >= window.innerWidth;
  const camInit = isPortrait
    ? { position: [4.5, 4.4, 11.5] as Vec3, fov: 55 }
    : { position: [6, 3.6, 8] as Vec3, fov: 48 };

  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      performance={{ min: 0.5 }}
      camera={camInit}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={[atmo.background]} />
      <Sky ref={skyRef} distance={450000} sunPosition={atmo.sun} turbidity={atmo.sky.turbidity} rayleigh={atmo.sky.rayleigh} mieCoefficient={atmo.sky.mieCoefficient} mieDirectionalG={atmo.sky.mieDirectionalG} />
      <fog attach="fog" args={[atmo.fog.color, atmo.fog.near, atmo.fog.far]} />

      <ambientLight ref={ambientRef} intensity={atmo.ambient} />
      <hemisphereLight ref={hemiRef} args={[atmo.hemi.sky, atmo.hemi.ground, atmo.hemi.intensity]} />
      <directionalLight
        ref={dirRef}
        position={atmo.sun}
        intensity={atmo.dir.intensity}
        color={atmo.dir.color}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0004}
        shadow-camera-near={1}
        shadow-camera-far={90}
        shadow-camera-left={-10}
        shadow-camera-right={10}
        shadow-camera-top={12}
        shadow-camera-bottom={-4}
      />
      {/* Soft warm rim light from behind: lifts the tree's silhouette off the
          sky for depth. No shadow — purely cinematic separation. */}
      <directionalLight position={[-8, 6, -9]} intensity={0.5} color="#ffd9a8" />

      {/* The day-cycle drives all of the above; memorial forests hold at dusk. */}
      <SceneClock
        enabled={!memorial}
        nightRef={nightRef}
        ambientRef={ambientRef}
        hemiRef={hemiRef}
        dirRef={dirRef}
        skyRef={skyRef}
      />

      {/* Memories rise into the night sky as a constellation you can read. */}
      <Constellation
        graph={graph}
        categoryColorByNodeId={categoryColorByNodeId}
        nightRef={nightRef}
        onSelect={onSelect}
      />

      {/* Image-based lighting: soft sky fill + a warm key + a ground bounce,
          built entirely in-scene (no external HDRI files). Gives leaves, fruit
          and bark realistic soft highlights and gentle reflections. */}
      <Environment resolution={256} frames={1}>
        <Lightformer intensity={0.7} color="#dfeaff" position={[0, 8, 0]} scale={[12, 12, 1]} form="ring" />
        <Lightformer intensity={1.4} color="#fff0d6" position={[-6, 5, -5]} scale={[6, 6, 1]} />
        <Lightformer intensity={0.35} color="#3d5230" position={[0, -6, 0]} scale={[14, 14, 1]} rotation={[Math.PI / 2, 0, 0]} />
      </Environment>

      <Hills />
      <Ground grass={grass} normal={groundNormal} />
      <GrassField />
      {crown.r > 0 ? <CanopyShadow tex={shadowTex} center={crownCenter} radius={crown.r} /> : null}
      <Motes trunkHeight={layout.trunkHeight} color={atmo.motes.color} opacity={atmo.motes.opacity} nightRef={nightRef} />

      {/* Woody structure. */}
      <Trunk height={layout.trunkHeight} stageIdx={stageIdx} bark={bark} />
      {layout.limbs
        .filter((l) => l.kind !== "twig")
        .map((limb, i) => (
          <Branch key={i} limb={limb} bark={bark} />
        ))}

      {/* Decorative full canopy. */}
      {crown.count > 0 ? (
        <Canopy center={crownCenter} radius={crown.r} count={crown.count} leafTex={leafTex} />
      ) : null}

      {/* Memory graph: glowing threads between memories and the people in them. */}
      <MemoryThreads graph={graph} layout={layout} selectedId={selectedId} />

      {/* Interactive memory nodes (glow within the canopy). */}
      {layout.positioned
        .filter((p) => p.node.kind !== "TRUNK" && !HIDDEN.has(p.node.kind))
        .map((p) => (
          <NodeGlyph
            key={p.node.id}
            positioned={p}
            selected={p.node.id === selectedId}
            justGrew={p.node.id === focusId}
            leafTex={leafTex}
            overrideColor={categoryColorByNodeId.get(p.node.id)}
            onSelect={onSelect}
          />
        ))}

      <OrbitControls
        makeDefault
        enablePan={false}
        enableZoom
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.55}
        zoomSpeed={0.8}
        autoRotate={!focusPos}
        autoRotateSpeed={0.28}
        minDistance={2.5}
        maxDistance={30}
        minPolarAngle={0.25}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, layout.trunkHeight * 0.55, 0]}
      />
      <CameraRig focusPos={focusPos} />

      {/* Cinematic pass: bloom lifts the glowing memories, stars and low sun;
          SMAA cleans edges; a soft vignette focuses the eye on the tree. */}
      <EffectComposer multisampling={0} enableNormalPass={false}>
        <Bloom mipmapBlur luminanceThreshold={0.72} luminanceSmoothing={0.28} intensity={0.7} radius={0.7} />
        <SMAA />
        <Vignette offset={0.28} darkness={0.62} eskil={false} />
      </EffectComposer>
    </Canvas>
  );
}

/* ---------- Grass ---------- */

// A field of individual instanced blades around the base of the tree, each
// leaning slightly and swaying in the same wind that moves the canopy. Fades
// out with distance so the edge blends into the textured ground plane.
// Short blade so the grass carpets the ground rather than standing tall.
const BLADE_H = 0.26;
function GrassField({ count = 20000, inner = 0.5, outer = 24 }: { count?: number; inner?: number; outer?: number }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const shaderRef = useRef<{ uniforms: { uTime: { value: number } } } | null>(null);

  // A single tapered blade: a narrow triangle-ish quad that bends toward the tip.
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(0.05, BLADE_H, 1, 4);
    g.translate(0, BLADE_H / 2, 0); // pivot at the root
    const pos = g.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i);
      const t = y / BLADE_H;
      // Taper to a point and curl forward toward the tip.
      pos.setX(i, pos.getX(i) * (1 - t * 0.85));
      pos.setZ(i, pos.getZ(i) + t * t * 0.06);
    }
    pos.needsUpdate = true;
    g.computeVertexNormals();
    return g;
  }, []);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    let placed = 0;
    let guard = 0;
    while (placed < count && guard < count * 4) {
      guard++;
      // Ring distribution, denser near the trunk.
      const a = Math.random() * Math.PI * 2;
      const r = inner + Math.pow(Math.random(), 0.7) * (outer - inner);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      dummy.position.set(x, 0, z);
      dummy.rotation.set(
        (Math.random() - 0.5) * 0.3,
        Math.random() * Math.PI * 2,
        (Math.random() - 0.5) * 0.35,
      );
      const s = 0.7 + Math.random() * 0.9;
      dummy.scale.set(s, s * (0.8 + Math.random() * 0.6), s);
      dummy.updateMatrix();
      mesh.setMatrixAt(placed, dummy.matrix);
      const l = 0.28 + Math.random() * 0.22;
      color.setHSL(0.26 + (Math.random() - 0.5) * 0.04, 0.55, l);
      mesh.setColorAt(placed, color);
      placed++;
    }
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [count, inner, outer]);

  useLayoutEffect(() => {
    const mat = matRef.current;
    if (!mat) return;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader =
        "uniform float uTime;\n" +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           #ifdef USE_INSTANCING
           float bladeH = clamp(position.y / 0.26, 0.0, 1.0);
           float ph = instanceMatrix[3].x * 1.3 + instanceMatrix[3].z * 0.7;
           float sway = sin(uTime * 1.6 + ph) * 0.05 + sin(uTime * 0.7 + ph * 1.7) * 0.025;
           transformed.x += sway * bladeH * bladeH;
           transformed.z += cos(uTime * 1.2 + ph) * 0.025 * bladeH * bladeH;
           #endif`,
        );
      shaderRef.current = shader as unknown as { uniforms: { uTime: { value: number } } };
    };
    mat.needsUpdate = true;
  }, []);

  useFrame((state) => {
    if (shaderRef.current) shaderRef.current.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false} receiveShadow>
      <primitive object={geometry} attach="geometry" />
      <meshStandardMaterial
        ref={matRef}
        color="#5f8f43"
        side={THREE.DoubleSide}
        roughness={0.9}
        metalness={0}
      />
    </instancedMesh>
  );
}

function CameraRig({ focusPos }: { focusPos: Vec3 | null }) {
  const tmpTarget = useRef(new THREE.Vector3());
  const tmpCam = useRef(new THREE.Vector3());
  useFrame((state, delta) => {
    const controls = state.controls as unknown as { target: THREE.Vector3; update: () => void } | null;
    if (!controls || !focusPos) return;
    const k = 1 - Math.pow(0.0016, delta);
    tmpTarget.current.set(focusPos[0], focusPos[1], focusPos[2]);
    controls.target.lerp(tmpTarget.current, k);
    tmpCam.current.set(focusPos[0] + 2.6, focusPos[1] + 1.6, focusPos[2] + 3.4);
    state.camera.position.lerp(tmpCam.current, k * 0.5);
    controls.update();
  });
  return null;
}

/* ---------- Memory threads ---------- */

// Draws faint glowing arcs for the semantic edges of the graph (a memory
// MENTIONS a person, memories RELATED_TO each other). Threads stay subtle so
// the tree never turns into a cat's cradle; selecting either endpoint lights
// its threads up and gives them a slow pulse.
function MemoryThreads({
  graph,
  layout,
  selectedId,
}: {
  graph: ForestGraph;
  layout: ForestLayout;
  selectedId: string | null;
}) {
  const threads = useMemo(() => {
    const pos = new Map<string, Vec3>();
    for (const p of layout.positioned) pos.set(p.node.id, p.position);
    const out: { id: string; a: Vec3; b: Vec3; from: string; to: string; kind: string }[] = [];
    for (const e of graph.edges) {
      if (e.kind !== "MENTIONS" && e.kind !== "RELATED_TO" && e.kind !== "FAMILY") continue;
      const a = pos.get(e.fromNodeId);
      const b = pos.get(e.toNodeId);
      if (!a || !b) continue;
      out.push({ id: e.id, a, b, from: e.fromNodeId, to: e.toNodeId, kind: e.kind });
    }
    return out;
  }, [graph, layout]);

  if (!threads.length) return null;

  return (
    <>
      {threads.map((t) => (
        <Thread
          key={t.id}
          a={t.a}
          b={t.b}
          kind={t.kind}
          active={selectedId === t.from || selectedId === t.to}
          dimmed={!!selectedId}
        />
      ))}
    </>
  );
}

// Family/root threads glow living-green; memory mentions glow warm gold.
const THREAD_COLORS: Record<string, { base: string; active: string }> = {
  FAMILY: { base: "#7fd6b4", active: "#c4f5e0" },
  MENTIONS: { base: "#e8c98d", active: "#ffe6a8" },
  RELATED_TO: { base: "#e8c98d", active: "#ffe6a8" },
};

function Thread({
  a,
  b,
  kind,
  active,
  dimmed,
}: {
  a: Vec3;
  b: Vec3;
  kind: string;
  active: boolean;
  dimmed: boolean;
}) {
  const matRef = useRef<THREE.MeshBasicMaterial>(null);

  const geometry = useMemo(() => {
    const start = new THREE.Vector3(a[0], a[1], a[2]);
    const end = new THREE.Vector3(b[0], b[1], b[2]);
    const dist = start.distanceTo(end);
    const mid = start.clone().add(end).multiplyScalar(0.5);
    // Underground threads sag downward like roots; above-ground ones bow up
    // like a light bridge. Decide by where the thread mostly lives.
    if (mid.y < 0.3) mid.y -= 0.2 + dist * 0.14;
    else mid.y += 0.25 + dist * 0.18;
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    return new THREE.TubeGeometry(curve, 32, 0.013, 6, false);
  }, [a, b]);

  useLayoutEffect(() => {
    return () => geometry.dispose();
  }, [geometry]);

  useFrame((state) => {
    if (!matRef.current) return;
    const base = active ? 0.7 : dimmed ? 0.08 : 0.26;
    const pulse = active ? 0.22 * (0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 3)) : 0;
    matRef.current.opacity = base + pulse;
  });

  const palette = THREAD_COLORS[kind] ?? THREAD_COLORS.MENTIONS;

  return (
    <mesh geometry={geometry}>
      <meshBasicMaterial
        ref={matRef}
        color={active ? palette.active : palette.base}
        transparent
        opacity={0.26}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
  );
}

/* ---------- Canopy ---------- */

function Canopy({
  center,
  radius,
  count,
  leafTex,
}: {
  center: Vec3;
  radius: number;
  count: number;
  leafTex: THREE.CanvasTexture;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const shaderRef = useRef<{ uniforms: { uTime: { value: number } } } | null>(null);

  // Lumpy crown: a handful of sub-cluster centers so the silhouette isn't a perfect ball.
  const clusters = useMemo(() => {
    const out: Vec3[] = [];
    const n = 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + hash01(`c${i}`, 2) * 1.2;
      const rr = radius * (0.35 + hash01(`c${i}`, 5) * 0.4);
      out.push([Math.cos(a) * rr, (hash01(`c${i}`, 9) - 0.35) * radius * 0.7, Math.sin(a) * rr]);
    }
    return out;
  }, [radius]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dummy = new THREE.Object3D();
    const color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const c = clusters[i % clusters.length];
      const u = Math.random();
      const v = Math.random();
      const theta = u * Math.PI * 2;
      const phi = Math.acos(2 * v - 1);
      const rr = radius * (0.4 + Math.random() * 0.55);
      const px = center[0] + c[0] + Math.sin(phi) * Math.cos(theta) * rr;
      const py = center[1] + c[1] + Math.cos(phi) * rr * 0.92;
      const pz = center[2] + c[2] + Math.sin(phi) * Math.sin(theta) * rr;
      dummy.position.set(px, py, pz);
      dummy.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
      dummy.scale.setScalar(0.24 + Math.random() * 0.2);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      // Inner leaves darker (fake ambient occlusion), outer brighter.
      const depth = Math.hypot(px - center[0], py - center[1], pz - center[2]) / (radius * 1.4);
      const l = THREE.MathUtils.clamp(0.16 + depth * 0.28 + (Math.random() - 0.5) * 0.08, 0.1, 0.5);
      color.setHSL(0.27 + (Math.random() - 0.5) * 0.05, 0.5, l);
      mesh.setColorAt(i, color);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [count, radius, center, clusters]);

  useLayoutEffect(() => {
    const mat = matRef.current;
    if (!mat) return;
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      shader.vertexShader =
        "uniform float uTime;\n" +
        shader.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
           #ifdef USE_INSTANCING
           float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 0.9;
           transformed.x += sin(uTime * 1.4 + ph) * 0.06;
           transformed.z += cos(uTime * 1.1 + ph) * 0.05;
           transformed.y += sin(uTime * 0.8 + ph) * 0.025;
           #endif`,
        );
      shaderRef.current = shader as unknown as { uniforms: { uTime: { value: number } } };
    };
    mat.needsUpdate = true;
  }, []);

  useFrame((state) => {
    if (shaderRef.current) shaderRef.current.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false} receiveShadow>
      <planeGeometry args={[1, 1.3]} />
      <meshStandardMaterial ref={matRef} map={leafTex} alphaTest={0.5} side={THREE.DoubleSide} roughness={0.85} metalness={0} />
    </instancedMesh>
  );
}

/* ---------- Woody parts ---------- */

function Branch({ limb, bark }: { limb: Limb; bark: { map: THREE.CanvasTexture; normal: THREE.CanvasTexture } }) {
  const geometry = useMemo(() => {
    const a = new THREE.Vector3(...limb.from);
    const b = new THREE.Vector3(...limb.to);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const len = a.distanceTo(b);
    mid.y += len * (limb.kind === "root" ? -0.28 : 0.32);
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const radius = limb.kind === "root" ? 0.06 : 0.09;
    const geo = new THREE.TubeGeometry(curve, 16, radius, 8, false);
    taperTube(geo, 16, 8, radius, radius * 0.3);
    return geo;
  }, [limb]);
  const color = limb.kind === "root" ? "#4a3222" : "#6b4a30";
  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial color={color} map={bark.map} normalMap={bark.normal} normalScale={BARK_NORMAL_SCALE} roughness={0.92} />
    </mesh>
  );
}

function taperTube(geo: THREE.TubeGeometry, tubularSegments: number, radialSegments: number, rBase: number, rTip: number) {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const path = geo.parameters.path;
  const frames = path.computeFrenetFrames(tubularSegments, false);
  let idx = 0;
  for (let i = 0; i <= tubularSegments; i++) {
    const t = i / tubularSegments;
    const point = path.getPointAt(t);
    const r = rBase + (rTip - rBase) * t;
    const N = frames.normals[i];
    const B = frames.binormals[i];
    for (let j = 0; j <= radialSegments; j++) {
      const v = (j / radialSegments) * Math.PI * 2;
      const cos = -Math.cos(v);
      const sin = Math.sin(v);
      const nx = cos * N.x + sin * B.x;
      const ny = cos * N.y + sin * B.y;
      const nz = cos * N.z + sin * B.z;
      pos.setXYZ(idx, point.x + r * nx, point.y + r * ny, point.z + r * nz);
      idx++;
    }
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

function Trunk({
  height,
  stageIdx,
  bark,
}: {
  height: number;
  stageIdx: number;
  bark: { map: THREE.CanvasTexture; normal: THREE.CanvasTexture };
}) {
  const rBottom = 0.18 + stageIdx * 0.07;
  const rTop = rBottom * 0.45;
  return (
    <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[rTop, rBottom, height, 32, 6]} />
      <meshStandardMaterial color="#6b4a30" map={bark.map} normalMap={bark.normal} normalScale={TRUNK_NORMAL_SCALE} roughness={0.92} />
    </mesh>
  );
}

function Ground({ grass, normal }: { grass: THREE.CanvasTexture; normal: THREE.CanvasTexture }) {
  return (
    <group>
      {/* Dark soil backdrop — gives the underground volume depth so the family
          root network reads as being *in* the earth. Opaque, sits below. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -2.4, 0]}>
        <circleGeometry args={[60, 64]} />
        <meshStandardMaterial color="#241a12" roughness={1} />
      </mesh>
      {/* Grass surface — slightly see-through so the glowing roots beneath show
          faintly, like roots through soil at dusk. Drawn without depth-write so
          it never hard-occludes the network below it. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
        <circleGeometry args={[60, 64]} />
        <meshStandardMaterial
          map={grass}
          normalMap={normal}
          normalScale={GROUND_NORMAL_SCALE}
          color="#6f9a58"
          roughness={1}
          transparent
          opacity={0.72}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}

function CanopyShadow({ tex, center, radius }: { tex: THREE.CanvasTexture; center: Vec3; radius: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[center[0], 0.02, center[2]]}>
      <planeGeometry args={[radius * 3.2, radius * 3.2]} />
      <meshBasicMaterial map={tex} transparent depthWrite={false} opacity={0.85} />
    </mesh>
  );
}

function Hills() {
  const hills = useMemo(() => {
    const out: { pos: Vec3; scale: Vec3; color: string }[] = [];
    const count = 14;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + hash01(`h${i}`, 3) * 0.3;
      const r = 36 + hash01(`h${i}`, 7) * 14;
      const w = 12 + hash01(`h${i}`, 11) * 14;
      const h = 3 + hash01(`h${i}`, 5) * 6;
      const c = new THREE.Color().setHSL(0.28, 0.34, 0.28 + hash01(`h${i}`, 9) * 0.12);
      out.push({ pos: [Math.cos(a) * r, -1.5, Math.sin(a) * r], scale: [w, h, w], color: `#${c.getHexString()}` });
    }
    return out;
  }, []);
  return (
    <group>
      {hills.map((hill, i) => (
        <mesh key={i} position={hill.pos} scale={hill.scale}>
          <sphereGeometry args={[1, 12, 8]} />
          <meshStandardMaterial color={hill.color} roughness={1} flatShading />
        </mesh>
      ))}
    </group>
  );
}

function Motes({
  trunkHeight,
  color = "#fff2c8",
  opacity = 0.35,
  nightRef,
}: {
  trunkHeight: number;
  color?: string;
  opacity?: number;
  nightRef?: React.MutableRefObject<number>;
}) {
  const ref = useRef<THREE.Points>(null);
  const matRef = useRef<THREE.PointsMaterial>(null);
  const COUNT = 60;
  const { geometry, speeds } = useMemo(() => {
    const positions = new Float32Array(COUNT * 3);
    const speeds = new Float32Array(COUNT);
    for (let i = 0; i < COUNT; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 0.5 + Math.random() * 6;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = Math.random() * (trunkHeight + 4);
      positions[i * 3 + 2] = Math.sin(a) * r;
      speeds[i] = 0.05 + Math.random() * 0.12;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return { geometry, speeds };
  }, [trunkHeight]);
  useFrame((state, delta) => {
    if (!ref.current) return;
    const pos = ref.current.geometry.attributes.position as THREE.BufferAttribute;
    const ceiling = trunkHeight + 4;
    const t = state.clock.elapsedTime;
    for (let i = 0; i < COUNT; i++) {
      let y = pos.getY(i) + speeds[i] * delta;
      if (y > ceiling) y = 0;
      pos.setY(i, y);
      pos.setX(i, pos.getX(i) + Math.sin(t * 0.3 + i) * delta * 0.05);
    }
    pos.needsUpdate = true;
    // Motes read like fireflies after dark: they glow stronger at night.
    if (matRef.current && nightRef) matRef.current.opacity = opacity + nightRef.current * 0.3;
  });
  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial ref={matRef} size={0.05} color={color} transparent opacity={opacity} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

/* ---------- Living time-of-day cycle ---------- */

// Interpolates the atmosphere keyframes each frame and mutates the scene's
// lights, sky, fog and background in place — no React state, so it's cheap.
// When disabled (memorial forests) it simply holds a gentle dusk night factor
// so the constellations stay faintly visible.
function SceneClock({
  enabled,
  nightRef,
  ambientRef,
  hemiRef,
  dirRef,
  skyRef,
}: {
  enabled: boolean;
  nightRef: React.MutableRefObject<number>;
  ambientRef: React.RefObject<THREE.AmbientLight>;
  hemiRef: React.RefObject<THREE.HemisphereLight>;
  dirRef: React.RefObject<THREE.DirectionalLight>;
  skyRef: React.RefObject<React.ElementRef<typeof Sky>>;
}) {
  const { scene } = useThree();
  const lerp = THREE.MathUtils.lerp;

  useFrame(() => {
    if (!enabled) {
      nightRef.current = 0.6;
      return;
    }
    const phase = realTimePhase();
    let i = 0;
    for (let k = 0; k < DAY_CYCLE.length - 1; k++) {
      if (phase >= DAY_CYCLE[k].at && phase < DAY_CYCLE[k + 1].at) {
        i = k;
        break;
      }
    }
    const k0 = DAY_CYCLE[i];
    const k1 = DAY_CYCLE[i + 1];
    const c0 = CYCLE_COLORS[i];
    const c1 = CYCLE_COLORS[i + 1];
    const t = THREE.MathUtils.clamp((phase - k0.at) / (k1.at - k0.at || 1), 0, 1);

    nightRef.current = lerp(k0.night, k1.night, t);

    if (scene.background instanceof THREE.Color) scene.background.copy(c0.bg).lerp(c1.bg, t);
    if (scene.fog instanceof THREE.Fog) {
      scene.fog.color.copy(c0.fog).lerp(c1.fog, t);
      scene.fog.near = lerp(k0.fog.near, k1.fog.near, t);
      scene.fog.far = lerp(k0.fog.far, k1.fog.far, t);
    }
    if (ambientRef.current) ambientRef.current.intensity = lerp(k0.ambient, k1.ambient, t);
    if (hemiRef.current) {
      hemiRef.current.color.copy(c0.hemiSky).lerp(c1.hemiSky, t);
      hemiRef.current.groundColor.copy(c0.hemiGround).lerp(c1.hemiGround, t);
      hemiRef.current.intensity = lerp(k0.hemi.intensity, k1.hemi.intensity, t);
    }

    const sx = lerp(k0.sun[0], k1.sun[0], t);
    const sy = lerp(k0.sun[1], k1.sun[1], t);
    const sz = lerp(k0.sun[2], k1.sun[2], t);
    if (dirRef.current) {
      dirRef.current.color.copy(c0.dir).lerp(c1.dir, t);
      dirRef.current.intensity = lerp(k0.dir.intensity, k1.dir.intensity, t);
      dirRef.current.position.set(sx, sy, sz);
    }
    const skyMat = skyRef.current?.material as THREE.ShaderMaterial | undefined;
    if (skyMat?.uniforms) {
      skyMat.uniforms.turbidity.value = lerp(k0.sky.turbidity, k1.sky.turbidity, t);
      skyMat.uniforms.rayleigh.value = lerp(k0.sky.rayleigh, k1.sky.rayleigh, t);
      skyMat.uniforms.mieCoefficient.value = lerp(k0.sky.mieCoefficient, k1.sky.mieCoefficient, t);
      skyMat.uniforms.mieDirectionalG.value = lerp(k0.sky.mieDirectionalG, k1.sky.mieDirectionalG, t);
      (skyMat.uniforms.sunPosition.value as THREE.Vector3).set(sx, sy, sz);
    }
  });

  return null;
}

/* ---------- Memory constellations ---------- */

interface Star {
  id: string;
  node: ForestNodeDTO;
  pos: Vec3;
  color: string;
}

// After dark, a selection of memories rises into the sky as stars, joined by
// faint lines into a constellation of a life. They fade in with the night and
// can be clicked to open the memory, just like a leaf on the tree.
function Constellation({
  graph,
  categoryColorByNodeId,
  nightRef,
  onSelect,
}: {
  graph: ForestGraph;
  categoryColorByNodeId: Map<string, string>;
  nightRef: React.MutableRefObject<number>;
  onSelect: (node: ForestNodeDTO | null) => void;
}) {
  const stars = useMemo<Star[]>(() => {
    const mem = graph.nodes
      .filter((n) => MEMORY_KINDS.has(n.kind))
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, 40);
    return mem.map((n) => {
      const theta = hash01(n.id, 1) * Math.PI * 2;
      const rad = 28 + hash01(n.id, 3) * 18;
      const y = 15 + hash01(n.id, 5) * 20;
      return {
        id: n.id,
        node: n,
        pos: [Math.cos(theta) * rad, y, Math.sin(theta) * rad] as Vec3,
        color: categoryColorByNodeId.get(n.id) ?? COLORS[n.kind] ?? "#cfe0ff",
      };
    });
  }, [graph, categoryColorByNodeId]);

  // Connect each star to its nearest neighbor to sketch constellation lines.
  const lineGeometry = useMemo(() => {
    if (stars.length < 2) return null;
    const pts: number[] = [];
    for (let i = 0; i < stars.length; i++) {
      let best = -1;
      let bestD = Infinity;
      for (let j = 0; j < stars.length; j++) {
        if (i === j) continue;
        const dx = stars[i].pos[0] - stars[j].pos[0];
        const dy = stars[i].pos[1] - stars[j].pos[1];
        const dz = stars[i].pos[2] - stars[j].pos[2];
        const d = dx * dx + dy * dy + dz * dz;
        if (d < bestD) {
          bestD = d;
          best = j;
        }
      }
      if (best >= 0 && best > i) {
        pts.push(...stars[i].pos, ...stars[best].pos);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    return g;
  }, [stars]);

  const lineMat = useRef<THREE.LineBasicMaterial>(null);
  useFrame(() => {
    if (lineMat.current) lineMat.current.opacity = nightRef.current * 0.28;
  });

  useLayoutEffect(() => {
    return () => lineGeometry?.dispose();
  }, [lineGeometry]);

  if (!stars.length) return null;

  return (
    <group>
      {lineGeometry ? (
        <lineSegments geometry={lineGeometry}>
          <lineBasicMaterial
            ref={lineMat}
            color="#aac4ff"
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
            toneMapped={false}
          />
        </lineSegments>
      ) : null}
      {stars.map((s) => (
        <StarNode key={s.id} star={s} nightRef={nightRef} onSelect={onSelect} />
      ))}
    </group>
  );
}

function StarNode({
  star,
  nightRef,
  onSelect,
}: {
  star: Star;
  nightRef: React.MutableRefObject<number>;
  onSelect: (node: ForestNodeDTO | null) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const coreRef = useRef<THREE.Group>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const haloRef = useRef<THREE.MeshBasicMaterial>(null);
  const hitRef = useRef<THREE.Mesh>(null);
  const twinkle = useMemo(() => hash01(star.id, 7) * Math.PI * 2, [star.id]);

  useFrame((state) => {
    const night = nightRef.current;
    const visible = night > 0.15;
    if (hitRef.current) hitRef.current.visible = visible;
    const flicker = 0.75 + 0.25 * Math.sin(state.clock.elapsedTime * 1.5 + twinkle);
    if (matRef.current) matRef.current.opacity = night * (hovered ? 1 : flicker);
    if (haloRef.current) haloRef.current.opacity = night * (hovered ? 0.5 : 0.22);
    if (coreRef.current) coreRef.current.scale.setScalar(hovered ? 1.6 : 1);
  });

  return (
    <group position={star.pos}>
      <group ref={coreRef}>
        <mesh>
          <sphereGeometry args={[0.32, 12, 12]} />
          <meshBasicMaterial ref={matRef} color={star.color} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.7, 12, 12]} />
          <meshBasicMaterial ref={haloRef} color={star.color} transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} toneMapped={false} />
        </mesh>
      </group>
      {/* Invisible, larger hit target; disabled during daylight. */}
      <mesh
        ref={hitRef}
        visible={false}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          setHovered(false);
          document.body.style.cursor = "default";
        }}
        onClick={(e) => {
          e.stopPropagation();
          if (nightRef.current > 0.15) onSelect(star.node);
        }}
      >
        <sphereGeometry args={[1.1, 8, 8]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      {hovered ? (
        <Html center distanceFactor={16} position={[0, 1.3, 0]}>
          <div className="pointer-events-none select-none whitespace-nowrap rounded-full bg-black/80 px-3 py-1 text-xs text-parchment">
            {star.node.title}
          </div>
        </Html>
      ) : null}
    </group>
  );
}

/* ---------- Interactive memory nodes ---------- */

function NodeGlyph({
  positioned,
  selected,
  justGrew,
  leafTex,
  overrideColor,
  onSelect,
}: {
  positioned: PositionedNode;
  selected: boolean;
  justGrew: boolean;
  leafTex: THREE.CanvasTexture;
  overrideColor?: string;
  onSelect: (node: ForestNodeDTO | null) => void;
}) {
  const { node, position, scale } = positioned;
  const [hovered, setHovered] = useState(false);
  const ref = useRef<THREE.Group>(null);
  const appear = useRef(0);

  useFrame((state, delta) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    appear.current = THREE.MathUtils.damp(appear.current, 1, 5, delta);
    const emphasis = selected ? 1.5 : hovered ? 1.25 : justGrew ? 1.3 : 1;
    ref.current.scale.setScalar(appear.current * emphasis);
    if (node.kind === "LEAF" || node.kind === "FLOWER" || node.kind === "FRUIT") {
      ref.current.rotation.z = Math.sin(t * 0.9 + position[0]) * 0.09;
      ref.current.rotation.x = Math.cos(t * 0.7 + position[2]) * 0.05;
    }
  });

  const color = overrideColor ?? COLORS[node.kind] ?? "#9ad0b0";

  return (
    <group
      ref={ref}
      position={position as Vec3}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "default";
      }}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(node);
      }}
    >
      <Geometry kind={node.kind} scale={scale} color={color} glow={justGrew} categorized={!!overrideColor} leafTex={leafTex} seed={hash01(node.id, 9)} />
      {justGrew ? <GrowthBurst scale={scale} /> : null}
      {(hovered || selected) && (
        <Html center distanceFactor={10} position={[0, scale + 0.5, 0]}>
          <div className="pointer-events-none select-none whitespace-nowrap rounded-full bg-black/80 px-3 py-1 text-xs text-parchment">
            {node.title}
          </div>
        </Html>
      )}
    </group>
  );
}

function GrowthBurst({ scale }: { scale: number }) {
  const ring = useRef<THREE.Mesh>(null);
  const start = useRef<number | null>(null);
  useFrame((state) => {
    if (!ring.current) return;
    if (start.current === null) start.current = state.clock.elapsedTime;
    const age = state.clock.elapsedTime - start.current;
    const p = Math.min(age / 1.4, 1);
    const s = 0.3 + p * 3.4;
    ring.current.scale.set(s, s, s);
    (ring.current.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.7;
    ring.current.visible = p < 1;
  });
  return (
    <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
      <ringGeometry args={[scale * 0.9, scale * 1.15, 32]} />
      <meshBasicMaterial color="#ffe6a8" transparent opacity={0.7} side={THREE.DoubleSide} depthWrite={false} />
    </mesh>
  );
}

function Geometry({
  kind,
  scale,
  color,
  glow,
  categorized,
  leafTex,
  seed,
}: {
  kind: string;
  scale: number;
  color: string;
  glow: boolean;
  categorized?: boolean;
  leafTex: THREE.CanvasTexture;
  seed: number;
}) {
  const emissive = glow ? "#ffcf7a" : color;
  // Memory nodes glow softly so they stand out from decorative canopy leaves.
  // Categorized leaves glow a touch stronger so their branch color carries.
  const baseGlow = glow ? 0.7 : categorized ? 0.5 : 0.35;

  switch (kind) {
    case "SEED":
      return (
        <mesh castShadow>
          <sphereGeometry args={[scale, 16, 16]} />
          <meshStandardMaterial color={color} roughness={0.6} emissive={emissive} emissiveIntensity={glow ? 0.6 : 0} />
        </mesh>
      );
    case "LEAF":
      return (
        <mesh geometry={LEAF_MEMORY_GEOMETRY} scale={scale * 4} rotation={[-0.5, seed * Math.PI * 2, seed * 0.6 - 0.3]} castShadow>
          <meshStandardMaterial map={leafTex} alphaTest={0.4} side={THREE.DoubleSide} roughness={0.5} emissive={emissive} emissiveIntensity={baseGlow} emissiveMap={leafTex} />
        </mesh>
      );
    case "FLOWER":
      return <Flower scale={scale} color={color} glow={glow} />;
    case "FRUIT":
      return (
        <mesh castShadow>
          <sphereGeometry args={[scale * 1.2, 18, 18]} />
          <meshStandardMaterial color={color} roughness={0.3} metalness={0.05} emissive={emissive} emissiveIntensity={baseGlow} />
        </mesh>
      );
    case "PHOTO":
      return (
        <mesh castShadow>
          <boxGeometry args={[scale * 1.5, scale * 1.5, scale * 0.15]} />
          <meshStandardMaterial color={color} roughness={0.5} emissive={emissive} emissiveIntensity={baseGlow} />
        </mesh>
      );
    case "PERSON":
      // A family member: a glowing node in the underground root network — the
      // seed of their own tree, waiting to grow.
      return (
        <group>
          <mesh>
            <sphereGeometry args={[scale, 18, 18]} />
            <meshStandardMaterial
              color={color}
              roughness={0.35}
              emissive={emissive}
              emissiveIntensity={glow ? 1.0 : 0.75}
            />
          </mesh>
          {/* Soft halo so the node reads through the soil. */}
          <mesh>
            <sphereGeometry args={[scale * 1.7, 16, 16]} />
            <meshBasicMaterial
              color={color}
              transparent
              opacity={0.16}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      );
    case "ROOT":
      return (
        <mesh>
          <sphereGeometry args={[scale, 12, 12]} />
          <meshStandardMaterial color={color} roughness={0.6} emissive={emissive} emissiveIntensity={baseGlow} />
        </mesh>
      );
    default:
      // Every other memory kind reads as a glowing leaf — no diamonds.
      return (
        <mesh geometry={LEAF_MEMORY_GEOMETRY} scale={scale * 4} rotation={[-0.5, seed * Math.PI * 2, seed * 0.6 - 0.3]} castShadow>
          <meshStandardMaterial map={leafTex} alphaTest={0.4} side={THREE.DoubleSide} roughness={0.5} emissive={emissive} emissiveIntensity={baseGlow} emissiveMap={leafTex} />
        </mesh>
      );
  }
}

// A slightly stouter leaf silhouette for interactive memory leaves.
const LEAF_MEMORY_GEOMETRY = (() => {
  const s = new THREE.Shape();
  s.moveTo(0, -0.5);
  s.bezierCurveTo(0.42, -0.18, 0.34, 0.5, 0, 0.72);
  s.bezierCurveTo(-0.34, 0.5, -0.42, -0.18, 0, -0.5);
  const g = new THREE.ShapeGeometry(s, 14);
  g.center();
  return g;
})();

function Flower({ scale, color, glow }: { scale: number; color: string; glow: boolean }) {
  const petals = [0, 1, 2, 3, 4];
  return (
    <group>
      {petals.map((i) => {
        const a = (i / petals.length) * Math.PI * 2;
        return (
          <mesh key={i} geometry={LEAF_MEMORY_GEOMETRY} position={[Math.cos(a) * scale * 0.5, 0, Math.sin(a) * scale * 0.5]} rotation={[-Math.PI / 2, 0, a]} scale={scale * 1.8}>
            <meshStandardMaterial color={color} side={THREE.DoubleSide} roughness={0.5} emissive={glow ? "#ffcf7a" : color} emissiveIntensity={glow ? 0.6 : 0.3} />
          </mesh>
        );
      })}
      <mesh>
        <sphereGeometry args={[scale * 0.4, 12, 12]} />
        <meshStandardMaterial color="#f4c95d" emissive="#f4c95d" emissiveIntensity={0.5} />
      </mesh>
    </group>
  );
}
