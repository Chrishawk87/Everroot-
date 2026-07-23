import { prisma } from "@/lib/prisma";

/**
 * Typed bridge to the `Recording` Prisma model.
 *
 * The model lives in schema.prisma and its client types + database table are
 * generated on deploy (`prisma generate` in the build step, `prisma db push`
 * on start). Our local sandbox cannot reach Prisma's engine CDN to regenerate
 * the client, so the checked-in generated types don't yet know about
 * `prisma.recording`. This bridge describes exactly the shape we rely on so the
 * codebase typechecks locally while matching the real runtime client. Once the
 * client is regenerated with the model present, this file can be simplified to
 * use `prisma.recording` directly.
 */

export interface RecordingRow {
  id: string;
  userId: string;
  nodeId: string;
  mimeType: string;
  durationMs: number;
  // Legacy recordings keep their audio here; R2-backed recordings have `bytes`
  // null and their audio under `storageKey`.
  bytes: Uint8Array | null;
  storageKey: string | null;
  transcript: string | null;
  question: string | null;
  createdAt: Date;
}

export interface CreateRecordingInput {
  userId: string;
  nodeId: string;
  mimeType: string;
  durationMs: number;
  bytes?: Uint8Array | null;
  storageKey?: string | null;
  transcript?: string | null;
  question?: string | null;
}

// Lean recording metadata — everything a story feed needs EXCEPT the audio
// bytes, which are streamed on demand via /api/recordings/[id].
export interface RecordingMeta {
  id: string;
  nodeId: string;
  mimeType: string;
  durationMs: number;
  transcript: string | null;
  question: string | null;
  createdAt: Date;
}

interface RecordingDelegate {
  create(args: { data: CreateRecordingInput }): Promise<RecordingRow>;
  findUnique(args: { where: { id: string } }): Promise<RecordingRow | null>;
  findFirst(args: {
    where: { nodeId: string };
    orderBy?: { createdAt?: "asc" | "desc" };
  }): Promise<RecordingRow | null>;
  findMany(args: {
    where: { userId: string };
    orderBy?: { createdAt?: "asc" | "desc" };
    select?: {
      id?: boolean;
      nodeId?: boolean;
      mimeType?: boolean;
      durationMs?: boolean;
      transcript?: boolean;
      question?: boolean;
      createdAt?: boolean;
    };
  }): Promise<RecordingMeta[]>;
}

export function recordings(): RecordingDelegate {
  return (prisma as unknown as { recording: RecordingDelegate }).recording;
}

// --- One-time backfill: move audio still stored in Postgres into R2 ---------
// A recording needs backfilling when its audio is still in the `bytes` column
// and it has no `storageKey` yet. These helpers power the admin backfill route.

interface PendingRecording {
  id: string;
  mimeType: string;
  bytes: Uint8Array | null;
}

const PENDING_WHERE = { storageKey: null, NOT: { bytes: null } } as const;

interface BackfillDelegate {
  findMany(args: {
    where: typeof PENDING_WHERE;
    take: number;
    orderBy?: { createdAt?: "asc" | "desc" };
    select: { id: true; mimeType: true; bytes: true };
  }): Promise<PendingRecording[]>;
  count(args: { where: typeof PENDING_WHERE }): Promise<number>;
  update(args: {
    where: { id: string };
    data: { storageKey: string; bytes: null };
  }): Promise<{ id: string }>;
}

function backfillDelegate(): BackfillDelegate {
  return (prisma as unknown as { recording: BackfillDelegate }).recording;
}

/** A batch of recordings whose audio still lives in Postgres. */
export function listPendingBackfill(limit: number): Promise<PendingRecording[]> {
  return backfillDelegate().findMany({
    where: PENDING_WHERE,
    take: limit,
    orderBy: { createdAt: "asc" },
    select: { id: true, mimeType: true, bytes: true },
  });
}

/** How many recordings still need moving to R2. */
export function countPendingBackfill(): Promise<number> {
  return backfillDelegate().count({ where: PENDING_WHERE });
}

/** Mark a recording as stored in R2 and drop its Postgres bytes. */
export async function markRecordingStored(id: string, storageKey: string): Promise<void> {
  await backfillDelegate().update({ where: { id }, data: { storageKey, bytes: null } });
}

/** The most recent recording attached to a memory node, if any. */
export function findRecordingForNode(nodeId: string): Promise<RecordingRow | null> {
  return recordings().findFirst({ where: { nodeId }, orderBy: { createdAt: "desc" } });
}

/**
 * Every recording a user has made, oldest→newest — the raw material for their
 * story feed. Omits the audio bytes so we don't pull whole recordings into
 * memory; the player streams each one from /api/recordings/[id] as it plays.
 */
export function listRecordingsForUser(userId: string): Promise<RecordingMeta[]> {
  return recordings().findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      nodeId: true,
      mimeType: true,
      durationMs: true,
      transcript: true,
      question: true,
      createdAt: true,
    },
  });
}
