"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { AuthError } from "next-auth";
import { prisma } from "@/lib/prisma";
import { signIn } from "@/auth";
import { plantSeed } from "@/lib/forest/growth-engine";

const signupSchema = z.object({
  displayName: z.string().min(1, "Please enter your name").max(80),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  birthYear: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : undefined))
    .refine((v) => v === undefined || (v > 1900 && v <= new Date().getFullYear()), {
      message: "Enter a valid birth year",
    }),
  familyPosition: z.string().max(60).optional(),
});

export interface ActionState {
  error?: string;
}

export async function signup(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signupSchema.safeParse({
    displayName: formData.get("displayName"),
    email: formData.get("email"),
    password: formData.get("password"),
    birthYear: formData.get("birthYear") || undefined,
    familyPosition: formData.get("familyPosition") || undefined,
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid details" };
  }

  const { displayName, email, password, birthYear, familyPosition } = parsed.data;
  const normalizedEmail = email.toLowerCase();

  const existing = await prisma.user.findUnique({ where: { email: normalizedEmail } });
  if (existing) {
    return { error: "An account with that email already exists" };
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      email: normalizedEmail,
      passwordHash,
      profile: {
        create: {
          displayName,
          birthYear: birthYear ?? null,
          familyPosition: familyPosition ?? null,
        },
      },
    },
  });

  // Every new account begins as a seed in the forest.
  await plantSeed(user.id, displayName);

  // signIn throws a redirect on success, which propagates out of the action.
  await signIn("credentials", {
    email: normalizedEmail,
    password,
    redirectTo: "/forest",
  });

  return {};
}

export async function login(_prev: ActionState, formData: FormData): Promise<ActionState> {
  try {
    await signIn("credentials", {
      email: String(formData.get("email") ?? "").toLowerCase(),
      password: String(formData.get("password") ?? ""),
      redirectTo: "/forest",
    });
    return {};
  } catch (error) {
    if (error instanceof AuthError) {
      return { error: "Invalid email or password" };
    }
    // Re-throw redirect errors so Next.js can perform the navigation.
    throw error;
  }
}
