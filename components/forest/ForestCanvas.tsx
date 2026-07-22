"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { OrbitControls, Html, Sky } from "@react-three/drei";
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
const SUN_POSITION: Vec3 = [-28, 30, -18];

// Crown fullness by growth stage: radius + decorative leaf count.
const CROWN: Record<GrowthStage, { r: number; count: number }> = {
  SEED: { r: 0, count: 0 },
  SPROUT: { r: 0.55, count: 160 },
  SAPLING: { r: 1.15, count: 700 },
  YOUNG_TREE: { r: 1.9, count: 2000 },
  MATURE_TREE: { r: 2.6, count: 4200 },
  ANCIENT_TREE: { r: 3.3, count: 6500 },
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

function makeBarkTexture(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const w = 256;
  const h = 512;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d")!;
  x.fillStyle = "#5b3f2a";
  x.fillRect(0, 0, w, h);
  const bc = document.createElement("canvas");
  bc.width = w;
  bc.height = h;
  const bx = bc.getContext("2d")!;
  bx.fillStyle = "#808080";
  bx.fillRect(0, 0, w, h);
  for (let i = 0; i < 240; i++) {
    const px = Math.random() * w;
    const py = Math.random() * h;
    const len = 50 + Math.random() * 240;
    const dark = Math.random() < 0.55;
    const a = 0.12 + Math.random() * 0.3;
    const lw = 1 + Math.random() * 3.5;
    const cx = (Math.random() - 0.5) * 8;
    x.strokeStyle = dark ? `rgba(38,24,14,${a})` : `rgba(120,90,60,${a})`;
    x.lineWidth = lw;
    x.beginPath();
    x.moveTo(px, py);
    x.bezierCurveTo(px + cx, py + len * 0.5, px + cx, py + len, px + cx * 0.6, py + len);
    x.stroke();
    bx.strokeStyle = dark ? `rgba(0,0,0,${a})` : `rgba(255,255,255,${a})`;
    bx.lineWidth = lw;
    bx.beginPath();
    bx.moveTo(px, py);
    bx.bezierCurveTo(px + cx, py + len * 0.5, px + cx, py + len, px + cx * 0.6, py + len);
    bx.stroke();
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(1.5, 3);
  const bump = new THREE.CanvasTexture(bc);
  bump.wrapS = bump.wrapT = THREE.RepeatWrapping;
  bump.repeat.set(1.5, 3);
  return { map, bump };
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
}

export default function ForestCanvas({ graph, selectedId, focusId, onSelect }: Props) {
  const layout = useMemo(() => computeLayout(graph), [graph]);
  const stageIdx = STAGE_INDEX[graph.stage];

  const bark = useMemo(makeBarkTexture, []);
  const leafTex = useMemo(makeLeafTexture, []);
  const grass = useMemo(makeGrassTexture, []);
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

  return (
    <Canvas
      shadows
      camera={{ position: [6, 3.6, 8], fov: 48 }}
      gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 1.05 }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={["#cfe3d6"]} />
      <Sky distance={450000} sunPosition={SUN_POSITION} turbidity={6} rayleigh={1.4} mieCoefficient={0.006} mieDirectionalG={0.85} />
      <fog attach="fog" args={["#d7e6d2", 22, 65]} />

      <ambientLight intensity={0.4} />
      <hemisphereLight args={["#e6f2e6", "#4a5b34", 0.65]} />
      <directionalLight
        position={SUN_POSITION}
        intensity={2.1}
        color="#fff1d6"
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

      <Hills />
      <Ground grass={grass} />
      {crown.r > 0 ? <CanopyShadow tex={shadowTex} center={crownCenter} radius={crown.r} /> : null}
      <Motes trunkHeight={layout.trunkHeight} />

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
            onSelect={onSelect}
          />
        ))}

      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        minDistance={2.5}
        maxDistance={30}
        maxPolarAngle={Math.PI / 2.05}
        target={[0, layout.trunkHeight * 0.55, 0]}
      />
      <CameraRig focusPos={focusPos} />
    </Canvas>
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

function Branch({ limb, bark }: { limb: Limb; bark: { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } }) {
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
      <meshStandardMaterial color={color} map={bark.map} bumpMap={bark.bump} bumpScale={0.02} roughness={0.95} />
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
  bark: { map: THREE.CanvasTexture; bump: THREE.CanvasTexture };
}) {
  const rBottom = 0.18 + stageIdx * 0.07;
  const rTop = rBottom * 0.45;
  return (
    <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
      <cylinderGeometry args={[rTop, rBottom, height, 20, 4]} />
      <meshStandardMaterial color="#6b4a30" map={bark.map} bumpMap={bark.bump} bumpScale={0.03} roughness={0.95} />
    </mesh>
  );
}

function Ground({ grass }: { grass: THREE.CanvasTexture }) {
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

function Motes({ trunkHeight }: { trunkHeight: number }) {
  const ref = useRef<THREE.Points>(null);
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
  });
  return (
    <points ref={ref} geometry={geometry}>
      <pointsMaterial size={0.05} color="#fff2c8" transparent opacity={0.35} depthWrite={false} blending={THREE.AdditiveBlending} sizeAttenuation />
    </points>
  );
}

/* ---------- Interactive memory nodes ---------- */

function NodeGlyph({
  positioned,
  selected,
  justGrew,
  leafTex,
  onSelect,
}: {
  positioned: PositionedNode;
  selected: boolean;
  justGrew: boolean;
  leafTex: THREE.CanvasTexture;
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

  const color = COLORS[node.kind] ?? "#9ad0b0";

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
      <Geometry kind={node.kind} scale={scale} color={color} glow={justGrew} leafTex={leafTex} seed={hash01(node.id, 9)} />
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
  leafTex,
  seed,
}: {
  kind: string;
  scale: number;
  color: string;
  glow: boolean;
  leafTex: THREE.CanvasTexture;
  seed: number;
}) {
  const emissive = glow ? "#ffcf7a" : color;
  // Memory nodes glow softly so they stand out from decorative canopy leaves.
  const baseGlow = glow ? 0.7 : 0.35;

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
      return (
        <mesh castShadow>
          <octahedronGeometry args={[scale, 0]} />
          <meshStandardMaterial color={color} roughness={0.6} emissive={emissive} emissiveIntensity={baseGlow} />
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
