import { prisma } from "@/lib/prisma";
import type { NodeKind, EdgeKind, LifeEpoch, Prisma } from "@prisma/client";

/**
 * TREE GROWTH ENGINE
 * ------------------
 * Every meaningful interaction results in visible growth. Each interaction type
 * produces a specific Forest object:
 *
 *   Record Story        -> LEAF
 *   Upload Photo        -> PHOTO memory node
 *   Add Family Member   -> connected PERSON sapling
 *   Answer Question     -> LEAF on an existing branch
 *   Record Life Advice  -> FRUIT
 *   Major Life Event    -> FLOWER
 *   Family History      -> ROOT (expands the root system)
 *   Memory Moment       -> LEAF / FRUIT / FLOWER / ROOT (by moment type)
 *
 * The engine also grows the tree's scaffolding on demand: the SEED grows into a
 * TRUNK the first time content is added, and BRANCH nodes are created for each
 * category as needed. The Forest is the source of truth — nothing is hardcoded
 * in the UI; the renderer draws whatever the graph contains.
 */

export type InteractionType =
  | "record_story"
  | "upload_photo"
  | "add_family_member"
  | "answer_question"
  | "record_advice"
  | "major_life_event"
  | "family_history"
  | "memory_moment";

export interface GrowInput {
  type: InteractionType;
  title: string;
  summary?: string;
  /** Branch category the content belongs to (e.g. "Life Advice"). */
  branch?: string;
  epoch?: LifeEpoch;
  /** For add_family_member: the relationship label, e.g. "Wife", "Son". */
  relationship?: string;
  /** Free-form structured payload: transcript, audio url, people, tags, etc. */
  data?: Prisma.InputJsonValue;
  /** For memory_moment: quick_wisdom | family_story | tradition | recipe | time_capsule | legacy_message */
  momentType?: string;
}

interface Recipe {
  kind: NodeKind;
  score: number;
  defaultBranch: string;
}

// How each interaction maps to a Forest object + its legacy-score weight.
const RECIPES: Record<InteractionType, Recipe> = {
  record_story: { kind: "LEAF", score: 5, defaultBranch: "Favorite Stories" },
  upload_photo: { kind: "PHOTO", score: 3, defaultBranch: "Childhood Memories" },
  add_family_member: { kind: "PERSON", score: 8, defaultBranch: "Family" },
  answer_question: { kind: "LEAF", score: 6, defaultBranch: "Family Questions" },
  record_advice: { kind: "FRUIT", score: 12, defaultBranch: "Life Advice" },
  major_life_event: { kind: "FLOWER", score: 15, defaultBranch: "Milestones" },
  family_history: { kind: "ROOT", score: 10, defaultBranch: "Roots & Heritage" },
  memory_moment: { kind: "MEMORY_MOMENT", score: 7, defaultBranch: "Memory Moments" },
};

// Memory Moments feed different parts of the forest depending on their type.
const MOMENT_KIND: Record<string, NodeKind> = {
  quick_wisdom: "FRUIT",
  legacy_message: "FRUIT",
  recipe: "FRUIT",
  family_story: "LEAF",
  tradition: "FLOWER",
  time_capsule: "FLOWER",
};

export interface GrowResult {
  createdNodeId: string;
  createdKind: NodeKind;
  branchId: string | null;
  newLegacyScore: number;
}

/** Grow the forest in response to a single interaction. */
export async function grow(userId: string, input: GrowInput): Promise<GrowResult> {
  const recipe = RECIPES[input.type];

  // Memory Moments override the node kind based on their moment type.
  const kind: NodeKind =
    input.type === "memory_moment" && input.momentType && MOMENT_KIND[input.momentType]
      ? MOMENT_KIND[input.momentType]
      : recipe.kind;

  return prisma.$transaction(async (tx) => {
    const seed = await getSeed(tx, userId);

    // The seed grows into a trunk on the first piece of content.
    const trunk = await ensureTrunk(tx, userId, seed.id);

    // Roots attach directly under the trunk; people attach to the seed as
    // saplings; everything else hangs off a category branch.
    let branchId: string | null = null;
    let parentId = trunk.id;
    let parentEdge: EdgeKind = "CONTAINS";

    if (kind === "ROOT") {
      parentId = trunk.id;
      parentEdge = "ANCESTOR_OF";
    } else if (kind === "PERSON") {
      parentId = seed.id;
      parentEdge = "FAMILY";
    } else {
      const branchName = input.branch?.trim() || recipe.defaultBranch;
      const branch = await ensureBranch(tx, userId, trunk.id, branchName);
      branchId = branch.id;
      parentId = branch.id;
      parentEdge = "CONTAINS";
    }

    const node = await tx.forestNode.create({
      data: {
        userId,
        kind,
        title: input.title,
        summary: input.summary ?? null,
        epoch: input.epoch ?? null,
        score: recipe.score,
        data: input.data ?? undefined,
      },
    });

    await tx.forestEdge.create({
      data: {
        userId,
        kind: parentEdge,
        fromNodeId: parentId,
        toNodeId: node.id,
        label: kind === "PERSON" ? input.relationship ?? null : null,
      },
    });

    // Major life events also drop a timeline event so the tree and timeline
    // stay synchronized.
    if (input.type === "major_life_event") {
      const evt = await tx.forestNode.create({
        data: {
          userId,
          kind: "TIMELINE_EVENT",
          title: input.title,
          summary: input.summary ?? null,
          epoch: input.epoch ?? null,
          score: 0,
        },
      });
      await tx.forestEdge.create({
        data: { userId, kind: "OCCURRED_IN", fromNodeId: node.id, toNodeId: evt.id },
      });
    }

    const newLegacyScore = await recomputeLegacyScore(tx, userId);

    return {
      createdNodeId: node.id,
      createdKind: kind,
      branchId,
      newLegacyScore,
    };
  });
}

// --- scaffolding helpers -------------------------------------------------

type Tx = Prisma.TransactionClient;

async function getSeed(tx: Tx, userId: string) {
  const seed = await tx.forestNode.findFirst({
    where: { userId, kind: "SEED" },
  });
  if (!seed) {
    throw new Error("Forest has no seed. Was the account seeded on signup?");
  }
  return seed;
}

async function ensureTrunk(tx: Tx, userId: string, seedId: string) {
  const existing = await tx.forestNode.findFirst({
    where: { userId, kind: "TRUNK" },
  });
  if (existing) return existing;

  const trunk = await tx.forestNode.create({
    data: {
      userId,
      kind: "TRUNK",
      title: "Life Journey",
      summary: "The trunk of this legacy — it grows as the story is told.",
      score: 5,
    },
  });
  await tx.forestEdge.create({
    data: { userId, kind: "GREW_INTO", fromNodeId: seedId, toNodeId: trunk.id },
  });
  return trunk;
}

async function ensureBranch(tx: Tx, userId: string, trunkId: string, name: string) {
  const existing = await tx.forestNode.findFirst({
    where: { userId, kind: "BRANCH", title: name },
  });
  if (existing) return existing;

  const branch = await tx.forestNode.create({
    data: { userId, kind: "BRANCH", title: name, score: 2 },
  });
  await tx.forestEdge.create({
    data: { userId, kind: "CONTAINS", fromNodeId: trunkId, toNodeId: branch.id },
  });
  return branch;
}

/** Legacy score = sum of every node's score. Recomputed after each growth. */
export async function recomputeLegacyScore(tx: Tx, userId: string): Promise<number> {
  const agg = await tx.forestNode.aggregate({
    where: { userId },
    _sum: { score: true },
  });
  return agg._sum.score ?? 0;
}

/** Create the initial SEED for a brand-new account. */
export async function plantSeed(
  userId: string,
  displayName: string,
): Promise<void> {
  await prisma.forestNode.create({
    data: {
      userId,
      kind: "SEED",
      title: `${displayName}'s Seed`,
      summary: "Untold potential. Every story told will grow this into a tree.",
      score: 1,
    },
  });
}
