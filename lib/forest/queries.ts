import { prisma } from "@/lib/prisma";
import { stageForScore, type ForestGraph, type ForestNodeDTO, type ForestEdgeDTO } from "./types";
import type { NodeKind } from "@prisma/client";

const ALL_KINDS: NodeKind[] = [
  "SEED", "ROOT", "TRUNK", "BRANCH", "SUB_BRANCH", "LEAF", "FLOWER",
  "FRUIT", "MEMORY", "PHOTO", "PERSON", "RELATIONSHIP", "TIMELINE_EVENT", "MEMORY_MOMENT",
];

function emptyCounts(): Record<NodeKind, number> {
  return ALL_KINDS.reduce((acc, k) => {
    acc[k] = 0;
    return acc;
  }, {} as Record<NodeKind, number>);
}

/** Load the entire forest for a user. The renderer builds itself from this. */
export async function getForest(userId: string): Promise<ForestGraph | null> {
  const [profile, nodes, edges] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.forestNode.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.forestEdge.findMany({ where: { userId } }),
  ]);

  if (!profile) return null;

  const counts = emptyCounts();
  let legacyScore = 0;
  for (const n of nodes) {
    counts[n.kind] += 1;
    legacyScore += n.score;
  }

  const nodeDTOs: ForestNodeDTO[] = nodes.map((n) => ({
    id: n.id,
    kind: n.kind,
    title: n.title,
    summary: n.summary,
    epoch: n.epoch,
    score: n.score,
    createdAt: n.createdAt.toISOString(),
    data: (n.data as Record<string, unknown> | null) ?? null,
  }));

  const edgeDTOs: ForestEdgeDTO[] = edges.map((e) => ({
    id: e.id,
    kind: e.kind,
    fromNodeId: e.fromNodeId,
    toNodeId: e.toNodeId,
    label: e.label,
  }));

  return {
    profile: {
      displayName: profile.displayName,
      birthYear: profile.birthYear,
      familyPosition: profile.familyPosition,
    },
    nodes: nodeDTOs,
    edges: edgeDTOs,
    legacyScore,
    stage: stageForScore(legacyScore),
    counts,
  };
}
