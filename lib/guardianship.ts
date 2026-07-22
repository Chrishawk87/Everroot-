import { prisma } from "@/lib/prisma";

/**
 * Typed bridge to the `Guardian` and `Memorial` Prisma models.
 *
 * Same rationale as lib/time-capsules.ts and lib/family-links.ts: the local
 * sandbox can't reach Prisma's engine CDN to regenerate the client, so the
 * checked-in types don't yet know about `prisma.guardian` / `prisma.memorial`.
 * This describes the exact shapes we use so the codebase typechecks locally
 * while matching the real runtime client. Once the client is regenerated it can
 * use `prisma.guardian` / `prisma.memorial` directly.
 */

export interface GuardianRow {
  id: string;
  ownerId: string;
  guardianId: string;
  createdAt: Date;
}

export interface MemorialRow {
  id: string;
  ownerId: string;
  note: string | null;
  createdAt: Date;
}

interface GuardianDelegate {
  create(args: { data: { ownerId: string; guardianId: string } }): Promise<GuardianRow>;
  findUnique(args: { where: { ownerId: string } }): Promise<GuardianRow | null>;
  findMany(args: { where: { guardianId: string } }): Promise<GuardianRow[]>;
  delete(args: { where: { ownerId: string } }): Promise<GuardianRow>;
}

interface MemorialDelegate {
  create(args: { data: { ownerId: string; note?: string | null } }): Promise<MemorialRow>;
  findUnique(args: { where: { ownerId: string } }): Promise<MemorialRow | null>;
  delete(args: { where: { ownerId: string } }): Promise<MemorialRow>;
}

function guardianDelegate(): GuardianDelegate {
  return (prisma as unknown as { guardian: GuardianDelegate }).guardian;
}

function memorialDelegate(): MemorialDelegate {
  return (prisma as unknown as { memorial: MemorialDelegate }).memorial;
}

// --- Guardian helpers ------------------------------------------------------

/** The account appointed to steward this owner's forest, if any. */
export async function getGuardianId(ownerId: string): Promise<string | null> {
  const row = await guardianDelegate().findUnique({ where: { ownerId } });
  return row?.guardianId ?? null;
}

/** True if `guardianId` is the appointed guardian of `ownerId`'s forest. */
export async function isGuardianOf(guardianId: string, ownerId: string): Promise<boolean> {
  const row = await guardianDelegate().findUnique({ where: { ownerId } });
  return row?.guardianId === guardianId;
}

/** Every forest this user stewards on behalf of others. */
export async function listGuardedOwnerIds(guardianId: string): Promise<string[]> {
  const rows = await guardianDelegate().findMany({ where: { guardianId } });
  return rows.map((r) => r.ownerId);
}

/** Appoint (or replace) a guardian for a forest. */
export async function setGuardian(ownerId: string, guardianId: string): Promise<void> {
  const existing = await guardianDelegate().findUnique({ where: { ownerId } });
  if (existing) await guardianDelegate().delete({ where: { ownerId } });
  await guardianDelegate().create({ data: { ownerId, guardianId } });
}

/** Remove the guardian from a forest. */
export async function clearGuardian(ownerId: string): Promise<void> {
  const existing = await guardianDelegate().findUnique({ where: { ownerId } });
  if (existing) await guardianDelegate().delete({ where: { ownerId } });
}

// --- Memorial helpers ------------------------------------------------------

/** True if this forest has been turned into a memorial. */
export async function isMemorial(ownerId: string): Promise<boolean> {
  const row = await memorialDelegate().findUnique({ where: { ownerId } });
  return row != null;
}

/** The memorial note for this forest, if it is a memorial. */
export async function getMemorial(ownerId: string): Promise<MemorialRow | null> {
  return memorialDelegate().findUnique({ where: { ownerId } });
}

/** Turn memorial mode on (idempotent) or off for a forest. */
export async function setMemorial(
  ownerId: string,
  on: boolean,
  note?: string | null,
): Promise<void> {
  const existing = await memorialDelegate().findUnique({ where: { ownerId } });
  if (on) {
    if (!existing) await memorialDelegate().create({ data: { ownerId, note: note ?? null } });
  } else if (existing) {
    await memorialDelegate().delete({ where: { ownerId } });
  }
}
