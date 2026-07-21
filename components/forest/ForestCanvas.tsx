"use client";

import { useMemo, useRef, useState } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Line, Html } from "@react-three/drei";
import * as THREE from "three";
import type { ForestGraph, ForestNodeDTO } from "@/lib/forest/types";
import { computeLayout, type PositionedNode, type Vec3 } from "@/lib/forest/layout";

const COLORS: Record<string, string> = {
  SEED: "#c9a86a",
  TRUNK: "#5b3a29",
  BRANCH: "#6b4a35",
  LEAF: "#4caf6d",
  FLOWER: "#e5738a",
  FRUIT: "#e8a33d",
  PHOTO: "#cfd8e3",
  PERSON: "#7fc99a",
  ROOT: "#7a5638",
  MEMORY_MOMENT: "#5bd0c0",
  MEMORY: "#9ad0b0",
};

// Nodes that are metadata, not drawn in the tree.
const HIDDEN = new Set(["TIMELINE_EVENT", "RELATIONSHIP", "SUB_BRANCH"]);

interface Props {
  graph: ForestGraph;
  selectedId: string | null;
  onSelect: (node: ForestNodeDTO | null) => void;
}

export default function ForestCanvas({ graph, selectedId, onSelect }: Props) {
  const layout = useMemo(() => computeLayout(graph), [graph]);

  return (
    <Canvas
      shadows
      camera={{ position: [4.5, 3.2, 6.5], fov: 50 }}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={["#0a1a11"]} />
      <fog attach="fog" args={["#0a1a11", 10, 26]} />

      <ambientLight intensity={0.55} />
      <directionalLight position={[6, 10, 4]} intensity={1.1} castShadow />
      <directionalLight position={[-6, 4, -4]} intensity={0.3} color="#8fd4a8" />

      <Ground />

      {/* Structural limbs (branches, twigs, roots). */}
      {layout.limbs.map((limb, i) => (
        <Line
          key={i}
          points={[limb.from, limb.to]}
          color={limb.kind === "root" ? "#4a3222" : "#5b3a29"}
          lineWidth={limb.kind === "branch" ? 3 : limb.kind === "root" ? 2.5 : 1.5}
          transparent
          opacity={limb.kind === "twig" ? 0.7 : 1}
        />
      ))}

      {/* Trunk drawn as a tapered cylinder from the ground up. */}
      <Trunk height={layout.trunkHeight} />

      {/* Every other node as a glyph. */}
      {layout.positioned
        .filter((p) => p.node.kind !== "TRUNK" && !HIDDEN.has(p.node.kind))
        .map((p) => (
          <NodeGlyph
            key={p.node.id}
            positioned={p}
            selected={p.node.id === selectedId}
            onSelect={onSelect}
          />
        ))}

      <OrbitControls
        enablePan
        enableZoom
        minDistance={2}
        maxDistance={20}
        maxPolarAngle={Math.PI / 1.9}
        target={[0, layout.trunkHeight * 0.5, 0]}
      />
    </Canvas>
  );
}

function Ground() {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
      <circleGeometry args={[18, 48]} />
      <meshStandardMaterial color="#123421" roughness={1} />
    </mesh>
  );
}

function Trunk({ height }: { height: number }) {
  return (
    <mesh position={[0, height / 2, 0]} castShadow>
      <cylinderGeometry args={[0.12, 0.28, height, 12]} />
      <meshStandardMaterial color={COLORS.TRUNK} roughness={0.9} />
    </mesh>
  );
}

function NodeGlyph({
  positioned,
  selected,
  onSelect,
}: {
  positioned: PositionedNode;
  selected: boolean;
  onSelect: (node: ForestNodeDTO | null) => void;
}) {
  const { node, position, scale } = positioned;
  const [hovered, setHovered] = useState(false);
  const ref = useRef<THREE.Group>(null);

  // Gentle sway + pop on hover/selection.
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    const target = selected ? 1.5 : hovered ? 1.25 : 1;
    ref.current.scale.lerp(new THREE.Vector3(target, target, target), 0.15);
    if (node.kind === "LEAF" || node.kind === "FLOWER") {
      ref.current.rotation.z = Math.sin(t + position[0]) * 0.08;
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
      <Geometry kind={node.kind} scale={scale} color={color} />
      {(hovered || selected) && (
        <Html center distanceFactor={10} position={[0, scale + 0.4, 0]}>
          <div className="pointer-events-none select-none whitespace-nowrap rounded-full bg-black/80 px-3 py-1 text-xs text-parchment">
            {node.title}
          </div>
        </Html>
      )}
    </group>
  );
}

function Geometry({ kind, scale, color }: { kind: string; scale: number; color: string }) {
  const mat = <meshStandardMaterial color={color} roughness={0.6} />;

  switch (kind) {
    case "SEED":
      return (
        <mesh castShadow>
          <sphereGeometry args={[scale, 16, 16]} />
          {mat}
        </mesh>
      );
    case "LEAF":
      return (
        <mesh castShadow>
          <icosahedronGeometry args={[scale, 0]} />
          {mat}
        </mesh>
      );
    case "FLOWER":
      return (
        <mesh castShadow>
          <dodecahedronGeometry args={[scale, 0]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.25} />
        </mesh>
      );
    case "FRUIT":
      return (
        <mesh castShadow>
          <sphereGeometry args={[scale, 16, 16]} />
          <meshStandardMaterial color={color} roughness={0.35} metalness={0.1} />
        </mesh>
      );
    case "PHOTO":
      return (
        <mesh castShadow>
          <boxGeometry args={[scale * 1.4, scale * 1.4, scale * 0.15]} />
          {mat}
        </mesh>
      );
    case "PERSON":
      return (
        <group>
          <mesh position={[0, scale * 0.35, 0]} castShadow>
            <coneGeometry args={[scale * 0.7, scale * 1.2, 8]} />
            <meshStandardMaterial color={color} roughness={0.7} />
          </mesh>
          <mesh position={[0, -scale * 0.4, 0]}>
            <cylinderGeometry args={[scale * 0.12, scale * 0.12, scale * 0.6, 6]} />
            <meshStandardMaterial color="#5b3a29" />
          </mesh>
        </group>
      );
    case "ROOT":
      return (
        <mesh>
          <sphereGeometry args={[scale, 10, 10]} />
          {mat}
        </mesh>
      );
    default:
      return (
        <mesh castShadow>
          <octahedronGeometry args={[scale, 0]} />
          {mat}
        </mesh>
      );
  }
}
