"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth, signOut } from "@/auth";
import { grow, type InteractionType } from "@/lib/forest/growth-engine";

const INTERACTIONS: InteractionType[] = [
  "record_story",
  "upload_photo",
  "add_family_member",
  "answer_question",
  "record_advice",
  "major_life_event",
  "family_history",
  "memory_moment",
];

const EPOCHS = [
  "ROOTS", "FIRST_STEPS", "CROSSROADS", "ANCHORS", "STORMS", "HARVEST", "HORIZONS",
] as const;

const growSchema = z.object({
  type: z.enum(INTERACTIONS as [InteractionType, ...InteractionType[]]),
  title: z.string().min(1, "Give this memory a title").max(160),
  summary: z.string().max(2000).optional(),
  branch: z.string().max(80).optional(),
  relationship: z.string().max(60).optional(),
  epoch: z.enum(EPOCHS).optional(),
  momentType: z.string().max(40).optional(),
});

export interface GrowState {
  error?: string;
  ok?: boolean;
  createdKind?: string;
  legacyScore?: number;
}

export async function growForest(_prev: GrowState, formData: FormData): Promise<GrowState> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be signed in" };

  const parsed = growSchema.safeParse({
    type: formData.get("type"),
    title: formData.get("title"),
    summary: formData.get("summary") || undefined,
    branch: formData.get("branch") || undefined,
    relationship: formData.get("relationship") || undefined,
    epoch: formData.get("epoch") || undefined,
    momentType: formData.get("momentType") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await grow(session.user.id, {
    type: parsed.data.type,
    title: parsed.data.title,
    summary: parsed.data.summary,
    branch: parsed.data.branch,
    relationship: parsed.data.relationship,
    epoch: parsed.data.epoch,
    momentType: parsed.data.momentType,
  });

  revalidatePath("/forest");

  return {
    ok: true,
    createdKind: result.createdKind,
    legacyScore: result.newLegacyScore,
  };
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}
