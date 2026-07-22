import { prisma } from "@/lib/prisma";
import { GROWTH_STAGES, stageForScore, type ForestGraph, type ForestNodeDTO, type ForestEdgeDTO } from "./types";
import type { NodeKind, LifeEpoch } from "@prisma/client";
import { findForwardLinks, findReverseLinks, linkedUserIdOf, isLinkedFamily } from "@/lib/family-links";
import { findRecordingForNode, listRecordingsForUser, type RecordingMeta } from "@/lib/recordings";
import { listCapsulesForUser } from "@/lib/time-capsules";
import { getMemorial } from "@/lib/guardianship";

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
  const [profile, nodes, edges, memorial] = await Promise.all([
    prisma.profile.findUnique({ where: { userId } }),
    prisma.forestNode.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    }),
    prisma.forestEdge.findMany({ where: { userId } }),
    getMemorial(userId),
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
    linkedUserId: linkedUserIdOf(n),
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
    isMemorial: memorial != null,
    memorialNote: memorial?.note ?? null,
  };
}

// One tree in the family forest — a linked member's forest plus how they relate
// to the person viewing.
export interface FamilyMemberForest {
  userId: string;
  relationship: string | null;
  graph: ForestGraph;
}

export interface FamilyForest {
  self: ForestGraph;
  members: FamilyMemberForest[];
}

/**
 * Gather every tree connected to this user into one family forest: the user's
 * own tree, everyone they've invited (forward links), and everyone who linked
 * to them (reverse links). One hop — direct family only, for now.
 */
export async function getFamilyForest(userId: string): Promise<FamilyForest | null> {
  const self = await getForest(userId);
  if (!self) return null;

  // Forward links: PERSON nodes in MY forest bound to a real account.
  const forward = await findForwardLinks(userId);
  // Reverse links: PERSON nodes in OTHER forests bound to ME.
  const reverse = await findReverseLinks(userId);

  // Relationship label per linked user (prefer the label on my side).
  const relById = new Map<string, string | null>();
  const memberIds = new Set<string>();

  for (const node of forward) {
    if (!node.linkedUserId || node.linkedUserId === userId) continue;
    memberIds.add(node.linkedUserId);
    const fam = await prisma.forestEdge.findFirst({
      where: { userId, kind: "FAMILY", toNodeId: node.id },
    });
    if (!relById.has(node.linkedUserId)) relById.set(node.linkedUserId, fam?.label ?? null);
  }
  for (const node of reverse) {
    if (node.userId === userId) continue;
    memberIds.add(node.userId);
    if (!relById.has(node.userId)) relById.set(node.userId, null);
  }

  const members: FamilyMemberForest[] = [];
  for (const memberId of memberIds) {
    const graph = await getForest(memberId);
    if (graph) {
      members.push({ userId: memberId, relationship: relById.get(memberId) ?? null, graph });
    }
  }

  return { self, members };
}

// A single memory turned into a shareable keepsake — the story, who told it,
// when, and (if captured) its recorded voice.
export interface MemoryClip {
  nodeId: string;
  kind: NodeKind;
  title: string;
  summary: string | null;
  transcript: string | null;
  question: string | null;
  epoch: string | null;
  createdAt: string;
  tellerName: string;
  tellerRole: string | null;
  recordingId: string | null;
  durationMs: number;
  canView: boolean;
}

// Memory kinds that can become a shareable clip (everything that holds a story,
// not the tree's scaffolding).
const CLIP_KINDS = new Set<NodeKind>([
  "LEAF", "FLOWER", "FRUIT", "MEMORY_MOMENT", "PHOTO", "MEMORY",
]);

/**
 * Load one memory as a shareable clip. Returns null if the memory doesn't exist
 * or isn't a shareable kind. Access is limited to the owner and linked family;
 * when the viewer isn't allowed, `canView` is false and no content is exposed.
 */
export async function getMemoryClip(nodeId: string, viewerId: string): Promise<MemoryClip | null> {
  const node = await prisma.forestNode.findUnique({ where: { id: nodeId } });
  if (!node || !CLIP_KINDS.has(node.kind)) return null;

  const allowed = await isLinkedFamily(viewerId, node.userId);
  if (!allowed) {
    return {
      nodeId: node.id,
      kind: node.kind,
      title: "",
      summary: null,
      transcript: null,
      question: null,
      epoch: null,
      createdAt: node.createdAt.toISOString(),
      tellerName: "",
      tellerRole: null,
      recordingId: null,
      durationMs: 0,
      canView: false,
    };
  }

  const [teller, rec] = await Promise.all([
    prisma.profile.findUnique({ where: { userId: node.userId } }),
    findRecordingForNode(node.id),
  ]);

  return {
    nodeId: node.id,
    kind: node.kind,
    title: node.title,
    summary: node.summary,
    transcript: rec?.transcript ?? null,
    question: rec?.question ?? null,
    epoch: node.epoch,
    createdAt: node.createdAt.toISOString(),
    tellerName: teller?.displayName ?? "A family member",
    tellerRole: teller?.familyPosition ?? null,
    recordingId: rec?.id ?? null,
    durationMs: rec?.durationMs ?? 0,
    canView: true,
  };
}

// One recorded memory as an episode in a person's story feed — the tree's whole
// spoken life, strung together in the order it was told.
export interface StoryEpisode {
  recordingId: string;
  nodeId: string;
  title: string;
  question: string | null;
  epoch: string | null;
  mimeType: string;
  durationMs: number;
  createdAt: string;
}

// A person's story feed — every recording they've made, in order, ready to play
// or download as one listenable life story.
export interface StoryFeed {
  ownerId: string;
  tellerName: string;
  tellerRole: string | null;
  episodes: StoryEpisode[];
  totalDurationMs: number;
  canListen: boolean;
}

/**
 * Compile a person's recorded memories into a single ordered story feed.
 * Access mirrors the memory clip: the owner and their linked family only. When
 * the viewer isn't allowed, `canListen` is false and no episodes are exposed.
 */
export async function getStoryFeed(ownerId: string, viewerId: string): Promise<StoryFeed | null> {
  const profile = await prisma.profile.findUnique({ where: { userId: ownerId } });
  if (!profile) return null;

  const allowed = await isLinkedFamily(viewerId, ownerId);
  if (!allowed) {
    return {
      ownerId,
      tellerName: profile.displayName,
      tellerRole: profile.familyPosition,
      episodes: [],
      totalDurationMs: 0,
      canListen: false,
    };
  }

  const [recs, nodes] = await Promise.all([
    listRecordingsForUser(ownerId),
    prisma.forestNode.findMany({
      where: { userId: ownerId },
      select: { id: true, title: true, epoch: true },
    }),
  ]);

  const nodeById = new Map(nodes.map((n) => [n.id, n]));
  const episodes: StoryEpisode[] = recs.map((r) => {
    const n = nodeById.get(r.nodeId);
    return {
      recordingId: r.id,
      nodeId: r.nodeId,
      title: n?.title ?? "A memory",
      question: r.question,
      epoch: n?.epoch ?? null,
      mimeType: r.mimeType,
      durationMs: r.durationMs,
      createdAt: r.createdAt.toISOString(),
    };
  });

  const totalDurationMs = episodes.reduce((sum, e) => sum + (e.durationMs || 0), 0);

  return {
    ownerId,
    tellerName: profile.displayName,
    tellerRole: profile.familyPosition,
    episodes,
    totalDurationMs,
    canListen: true,
  };
}

// The seven life epochs, in the order a life is lived, with a chapter title +
// subtitle for the printed book.
const EPOCH_META: { epoch: LifeEpoch; label: string; subtitle: string }[] = [
  { epoch: "ROOTS", label: "Roots", subtitle: "The early years" },
  { epoch: "FIRST_STEPS", label: "First Steps", subtitle: "Coming of age" },
  { epoch: "CROSSROADS", label: "Crossroads", subtitle: "Turning points" },
  { epoch: "ANCHORS", label: "Anchors", subtitle: "Love, family, and home" },
  { epoch: "STORMS", label: "Storms", subtitle: "Trials weathered" },
  { epoch: "HARVEST", label: "Harvest", subtitle: "The fruits of a life" },
  { epoch: "HORIZONS", label: "Horizons", subtitle: "Looking onward" },
];

// One recorded memory, written up as a chapter in the book.
export interface BookChapter {
  nodeId: string;
  title: string;
  question: string | null;
  body: string | null;
  date: string;
}

// A run of chapters that belong to one life epoch.
export interface BookSection {
  key: string;
  label: string;
  subtitle: string | null;
  chapters: BookChapter[];
}

export interface BookPerson {
  name: string;
  relationship: string | null;
}

// A person's whole life, laid out as a printable keepsake book.
export interface Book {
  ownerId: string;
  displayName: string;
  birthYear: number | null;
  familyPosition: string | null;
  stageLabel: string;
  legacyScore: number;
  memoryCount: number;
  sections: BookSection[];
  family: BookPerson[];
  canView: boolean;
}

// Memory kinds that become chapters (mirrors the clip/feed set).
const BOOK_KINDS = new Set<NodeKind>([
  "LEAF", "FLOWER", "FRUIT", "MEMORY_MOMENT", "PHOTO", "MEMORY",
]);

/**
 * Assemble a person's whole story into a printable book: their memories written
 * up as chapters, grouped by life epoch in the order a life is lived, plus the
 * family around them. Access mirrors the story feed — owner + linked family.
 */
export async function getBook(ownerId: string, viewerId: string): Promise<Book | null> {
  const profile = await prisma.profile.findUnique({ where: { userId: ownerId } });
  if (!profile) return null;

  const base: Book = {
    ownerId,
    displayName: profile.displayName,
    birthYear: profile.birthYear,
    familyPosition: profile.familyPosition,
    stageLabel: "",
    legacyScore: 0,
    memoryCount: 0,
    sections: [],
    family: [],
    canView: false,
  };

  const allowed = await isLinkedFamily(viewerId, ownerId);
  if (!allowed) return base;

  const [recs, nodes, familyEdges] = await Promise.all([
    listRecordingsForUser(ownerId),
    prisma.forestNode.findMany({ where: { userId: ownerId }, orderBy: { createdAt: "asc" } }),
    prisma.forestEdge.findMany({ where: { userId: ownerId, kind: "FAMILY" } }),
  ]);

  // Most recent recording per node — its transcript becomes the chapter body.
  const recByNode = new Map<string, RecordingMeta>();
  for (const r of recs) if (!recByNode.has(r.nodeId)) recByNode.set(r.nodeId, r);

  const relByNode = new Map(familyEdges.map((e) => [e.toNodeId, e.label]));

  let legacyScore = 0;
  const family: BookPerson[] = [];
  const byEpoch = new Map<string, BookChapter[]>();

  for (const n of nodes) {
    legacyScore += n.score;

    if (n.kind === "PERSON") {
      family.push({ name: n.title, relationship: relByNode.get(n.id) ?? null });
      continue;
    }
    if (!BOOK_KINDS.has(n.kind)) continue;

    const rec = recByNode.get(n.id);
    const transcript = rec?.transcript?.trim();
    const body = transcript && transcript.length > 0 ? transcript : n.summary;
    const chapter: BookChapter = {
      nodeId: n.id,
      title: n.title,
      question: rec?.question ?? null,
      body: body ?? null,
      date: n.createdAt.toISOString(),
    };
    const key = n.epoch ?? "_OTHER";
    const list = byEpoch.get(key);
    if (list) list.push(chapter);
    else byEpoch.set(key, [chapter]);
  }

  const sections: BookSection[] = [];
  let memoryCount = 0;
  for (const meta of EPOCH_META) {
    const chapters = byEpoch.get(meta.epoch);
    if (chapters && chapters.length) {
      sections.push({ key: meta.epoch, label: meta.label, subtitle: meta.subtitle, chapters });
      memoryCount += chapters.length;
    }
  }
  const other = byEpoch.get("_OTHER");
  if (other && other.length) {
    sections.push({ key: "_OTHER", label: "More Memories", subtitle: null, chapters: other });
    memoryCount += other.length;
  }

  const stageLabel =
    GROWTH_STAGES.find((s) => s.stage === stageForScore(legacyScore))?.label ?? "Seed";

  return {
    ...base,
    stageLabel,
    legacyScore,
    memoryCount,
    sections,
    family,
    canView: true,
  };
}

// One time capsule as seen by a viewer. When it's still sealed, `message` is
// null — only the title, who it's for, and the unlock date are revealed.
export interface CapsuleView {
  id: string;
  title: string;
  recipient: string | null;
  unlockAt: string;
  sealed: boolean;
  message: string | null;
  createdAt: string;
}

export interface CapsuleFeed {
  ownerId: string;
  ownerName: string;
  capsules: CapsuleView[];
  canView: boolean;
}

/**
 * A person's time capsules. Access mirrors the other legacy products — owner
 * and linked family. Sealed capsules never expose their message until the
 * unlock date has passed.
 */
export async function getCapsules(ownerId: string, viewerId: string): Promise<CapsuleFeed | null> {
  const profile = await prisma.profile.findUnique({ where: { userId: ownerId } });
  if (!profile) return null;

  const allowed = await isLinkedFamily(viewerId, ownerId);
  if (!allowed) {
    return { ownerId, ownerName: profile.displayName, capsules: [], canView: false };
  }

  const now = Date.now();
  const rows = await listCapsulesForUser(ownerId);
  const capsuleViews: CapsuleView[] = rows.map((c) => {
    const sealed = c.unlockAt.getTime() > now;
    return {
      id: c.id,
      title: c.title,
      recipient: c.recipient,
      unlockAt: c.unlockAt.toISOString(),
      sealed,
      message: sealed ? null : c.message,
      createdAt: c.createdAt.toISOString(),
    };
  });

  return { ownerId, ownerName: profile.displayName, capsules: capsuleViews, canView: true };
}
