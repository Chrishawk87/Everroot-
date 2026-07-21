import type { NodeKind, LifeEpoch, EdgeKind } from "@prisma/client";

export type { NodeKind, LifeEpoch, EdgeKind };

// A node as consumed by the Forest renderer + growth engine.
export interface ForestNodeDTO {
  id: string;
  kind: NodeKind;
  title: string;
  summary: string | null;
  epoch: LifeEpoch | null;
  score: number;
  createdAt: string;
  data: Record<string, unknown> | null;
}

export interface ForestEdgeDTO {
  id: string;
  kind: EdgeKind;
  fromNodeId: string;
  toNodeId: string;
  label: string | null;
}

// The full forest for one user — everything the renderer needs.
export interface ForestGraph {
  profile: {
    displayName: string;
    birthYear: number | null;
    familyPosition: string | null;
  };
  nodes: ForestNodeDTO[];
  edges: ForestEdgeDTO[];
  legacyScore: number;
  stage: GrowthStage;
  counts: Record<NodeKind, number>;
}

// The tree's visible growth stage, derived from the legacy score.
export type GrowthStage =
  | "SEED"
  | "SPROUT"
  | "SAPLING"
  | "YOUNG_TREE"
  | "MATURE_TREE"
  | "ANCIENT_TREE";

export const GROWTH_STAGES: { stage: GrowthStage; minScore: number; label: string }[] = [
  { stage: "SEED", minScore: 0, label: "Seed" },
  { stage: "SPROUT", minScore: 10, label: "Sprout" },
  { stage: "SAPLING", minScore: 40, label: "Sapling" },
  { stage: "YOUNG_TREE", minScore: 100, label: "Young Tree" },
  { stage: "MATURE_TREE", minScore: 250, label: "Mature Tree" },
  { stage: "ANCIENT_TREE", minScore: 600, label: "Ancient Tree" },
];

export function stageForScore(score: number): GrowthStage {
  let current: GrowthStage = "SEED";
  for (const s of GROWTH_STAGES) {
    if (score >= s.minScore) current = s.stage;
  }
  return current;
}
