import type { ForestGraph, ForestNodeDTO, GrowthStage } from "./types";

export type Vec3 = [number, number, number];

export interface PositionedNode {
  node: ForestNodeDTO;
  position: Vec3;
  /** Radius/scale hint for the renderer. */
  scale: number;
  parentId: string | null;
}

export interface Limb {
  from: Vec3;
  to: Vec3;
  kind: "branch" | "twig" | "root";
}

export interface ForestLayout {
  trunkHeight: number;
  positioned: PositionedNode[];
  limbs: Limb[];
}

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));

const TRUNK_HEIGHT: Record<GrowthStage, number> = {
  SEED: 0.5,
  SPROUT: 1.1,
  SAPLING: 1.9,
  YOUNG_TREE: 2.7,
  MATURE_TREE: 3.5,
  ANCIENT_TREE: 4.4,
};

// Deterministic 0..1 pseudo-random from a string id so layouts are stable.
function hash01(id: string, salt = 0): number {
  let h = 2166136261 ^ salt;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * Compute deterministic 3D positions for every node in the forest, purely from
 * graph data. The renderer draws exactly what this returns — no hardcoded tree.
 */
export function computeLayout(graph: ForestGraph): ForestLayout {
  const byId = new Map(graph.nodes.map((n) => [n.id, n]));
  const parentOf = new Map<string, string>();
  for (const e of graph.edges) {
    if (["CONTAINS", "ANCESTOR_OF", "FAMILY", "GREW_INTO"].includes(e.kind)) {
      parentOf.set(e.toNodeId, e.fromNodeId);
    }
  }
  const childrenOf = new Map<string, ForestNodeDTO[]>();
  for (const [childId, parentId] of parentOf) {
    const child = byId.get(childId);
    if (!child) continue;
    const arr = childrenOf.get(parentId) ?? [];
    arr.push(child);
    childrenOf.set(parentId, arr);
  }

  const seed = graph.nodes.find((n) => n.kind === "SEED");
  const trunk = graph.nodes.find((n) => n.kind === "TRUNK");
  const trunkHeight = TRUNK_HEIGHT[graph.stage];

  const positioned: PositionedNode[] = [];
  const limbs: Limb[] = [];

  // Seed / trunk sit at the origin.
  if (seed) positioned.push({ node: seed, position: [0, 0.1, 0], scale: 0.35, parentId: null });
  if (trunk) positioned.push({ node: trunk, position: [0, trunkHeight * 0.5, 0], scale: 1, parentId: seed?.id ?? null });

  // Branches spiral up the trunk and reach outward.
  const branches = trunk ? childrenOf.get(trunk.id)?.filter((c) => c.kind === "BRANCH") ?? [] : [];
  const branchTip = new Map<string, Vec3>();

  branches.forEach((branch, i) => {
    const angle = i * GOLDEN_ANGLE + hash01(branch.id) * 0.6;
    const heightFrac = 0.45 + (branches.length > 1 ? (i / branches.length) * 0.5 : 0.2);
    const baseY = trunkHeight * heightFrac;
    const length = 1.0 + hash01(branch.id, 7) * 0.8;
    const lift = 0.4 + hash01(branch.id, 13) * 0.5;

    const base: Vec3 = [0, baseY, 0];
    const tip: Vec3 = [
      Math.cos(angle) * length,
      baseY + lift,
      Math.sin(angle) * length,
    ];
    branchTip.set(branch.id, tip);
    positioned.push({ node: branch, position: tip, scale: 0.5, parentId: trunk!.id });
    limbs.push({ from: base, to: tip, kind: "branch" });

    // Leaves / flowers / fruit cluster around the branch tip.
    const foliage = childrenOf.get(branch.id) ?? [];
    foliage.forEach((leaf, j) => {
      const a = j * GOLDEN_ANGLE + hash01(leaf.id) * Math.PI * 2;
      const r = 0.25 + hash01(leaf.id, 3) * 0.35;
      const pos: Vec3 = [
        tip[0] + Math.cos(a) * r,
        tip[1] + (hash01(leaf.id, 5) - 0.4) * 0.5,
        tip[2] + Math.sin(a) * r,
      ];
      const scale = leaf.kind === "FLOWER" ? 0.22 : leaf.kind === "FRUIT" ? 0.2 : 0.14;
      positioned.push({ node: leaf, position: pos, scale, parentId: branch.id });
      limbs.push({ from: tip, to: pos, kind: "twig" });
    });
  });

  // Roots radiate below ground (heritage / family history).
  const roots = trunk ? childrenOf.get(trunk.id)?.filter((c) => c.kind === "ROOT") ?? [] : [];
  roots.forEach((root, i) => {
    const angle = i * GOLDEN_ANGLE + 0.9;
    const length = 1.1 + hash01(root.id, 11) * 0.7;
    const pos: Vec3 = [
      Math.cos(angle) * length,
      -0.35 - hash01(root.id, 2) * 0.5,
      Math.sin(angle) * length,
    ];
    positioned.push({ node: root, position: pos, scale: 0.28, parentId: trunk!.id });
    limbs.push({ from: [0, 0, 0], to: pos, kind: "root" });
  });

  // Family members live UNDERGROUND as glowing nodes in the root network —
  // each one a seed for their own future tree. They fan out and down from the
  // base at organic depths/distances so the roots read as a living web, not a
  // ring. A soft root "limb" ties each back to the base of the trunk.
  const people = seed ? childrenOf.get(seed.id)?.filter((c) => c.kind === "PERSON") ?? [] : [];
  people.forEach((person, i) => {
    const angle = i * GOLDEN_ANGLE + hash01(person.id, 4) * 0.7;
    const r = 1.5 + hash01(person.id, 8) * 1.9;
    const depth = 0.55 + hash01(person.id, 6) * 1.1;
    const pos: Vec3 = [Math.cos(angle) * r, -depth, Math.sin(angle) * r];
    positioned.push({ node: person, position: pos, scale: 0.34, parentId: seed!.id });
  });

  return { trunkHeight, positioned, limbs };
}
