"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { isLinkedFamily } from "@/lib/family-links";
import { grow } from "@/lib/forest/growth-engine";
import {
  setGuardian,
  clearGuardian,
  isGuardianOf,
  setMemorial,
  isMemorial,
} from "@/lib/guardianship";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

/**
 * Appoint a guardian to help steward the caller's forest. The guardian must be
 * linked family (already part of the family forest). A guardian can add or edit
 * memories on the owner's behalf and, with confirmation, turn the forest into a
 * memorial. Each forest has at most one guardian — appointing replaces any prior.
 */
export async function appointGuardian(input: { guardianUserId: string }): Promise<ActionResult> {
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) return { ok: false, error: "Not signed in" };

  const guardianUserId = input.guardianUserId?.trim();
  if (!guardianUserId) return { ok: false, error: "Choose a family member" };
  if (guardianUserId === ownerId) return { ok: false, error: "You can't be your own guardian" };

  // A guardian must be someone already in the family forest.
  const linked = await isLinkedFamily(ownerId, guardianUserId);
  if (!linked) return { ok: false, error: "A guardian must be a linked family member" };

  await setGuardian(ownerId, guardianUserId);
  return { ok: true };
}

/** Remove the caller's appointed guardian. */
export async function removeGuardian(): Promise<ActionResult> {
  const session = await auth();
  const ownerId = session?.user?.id;
  if (!ownerId) return { ok: false, error: "Not signed in" };

  await clearGuardian(ownerId);
  return { ok: true };
}

/**
 * Turn a forest into a memorial (or turn it back). Allowed for the owner
 * themselves or their appointed guardian. Once memorial, linked family can leave
 * tributes and the tree keeps growing as a shared remembrance.
 */
export async function setMemorialMode(input: {
  ownerId: string;
  on: boolean;
  note?: string;
}): Promise<ActionResult> {
  const session = await auth();
  const viewerId = session?.user?.id;
  if (!viewerId) return { ok: false, error: "Not signed in" };

  const ownerId = input.ownerId?.trim();
  if (!ownerId) return { ok: false, error: "Missing forest" };

  const allowed = viewerId === ownerId || (await isGuardianOf(viewerId, ownerId));
  if (!allowed) {
    return { ok: false, error: "Only the owner or their guardian can do this" };
  }

  await setMemorial(ownerId, input.on, input.note?.trim() || null);
  return { ok: true };
}

const tributeSchema = z.object({
  ownerId: z.string().min(1),
  title: z.string().trim().min(1, "Give your tribute a title").max(120),
  message: z.string().trim().min(1, "Write a few words").max(20000),
});

/**
 * Leave a tribute on a memorial forest. Requires the forest to be a memorial and
 * the caller to be linked family. The tribute grows as a memory on the tree,
 * tagged with who left it so it reads clearly as a remembrance from that person.
 */
export async function addTribute(input: {
  ownerId: string;
  title: string;
  message: string;
}): Promise<ActionResult> {
  const session = await auth();
  const viewerId = session?.user?.id;
  if (!viewerId) return { ok: false, error: "Not signed in" };

  const parsed = tributeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid tribute" };
  }
  const { ownerId, title, message } = parsed.data;

  const memorial = await isMemorial(ownerId);
  if (!memorial) return { ok: false, error: "This forest is not a memorial" };

  const linked = await isLinkedFamily(viewerId, ownerId);
  if (!linked) return { ok: false, error: "Only linked family can leave tributes" };

  const authorProfile = await prisma.profile.findUnique({ where: { userId: viewerId } });
  const authorName = authorProfile?.displayName ?? "A family member";

  await grow(ownerId, {
    type: "record_story",
    branch: "Tributes",
    title,
    summary: message,
    data: { tribute: true, authorId: viewerId, authorName },
  });

  return { ok: true };
}
