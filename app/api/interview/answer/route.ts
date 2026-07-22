import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { grow, ensurePerson, linkMention } from "@/lib/forest/growth-engine";
import { recordings } from "@/lib/recordings";
import { ALL_QUESTIONS, MOMENT_TYPE_BY_QUESTION } from "@/lib/interview/script";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Save one interview answer: grow a memory on the tree and (if provided) store
// the voice recording alongside it. Uses a route handler rather than a server
// action so the audio blob isn't capped by the server-action body limit.
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "You must be signed in" }, { status: 401 });
  }
  const userId = session.user.id;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Expected multipart form data" }, { status: 400 });
  }

  const questionId = String(form.get("questionId") ?? "");
  const transcript = String(form.get("transcript") ?? "").trim();
  const durationMs = Number(form.get("durationMs") ?? 0) || 0;
  const audio = form.get("audio");

  const question = ALL_QUESTIONS.find((q) => q.id === questionId);
  if (!question) {
    return NextResponse.json({ error: "Unknown question" }, { status: 400 });
  }
  if (!transcript && !(audio instanceof Blob)) {
    return NextResponse.json({ error: "Nothing to save yet" }, { status: 400 });
  }

  // Grow the memory. The transcript becomes the memory's story text.
  const result = await grow(userId, {
    type: question.interaction,
    title: question.title,
    summary: transcript || undefined,
    branch: question.branch,
    epoch: question.epoch,
    momentType: MOMENT_TYPE_BY_QUESTION[question.id],
    data: {
      source: "voice_interview",
      questionId: question.id,
      question: question.prompt,
      transcript: transcript || null,
    },
  });

  // Weave the memory graph: connect this memory to the people who were part of
  // it. Each entry is either an existing person ({ id }) or a new one to plant
  // ({ name, relationship? }). We return the canonical [{ id, name }] so the
  // client can reuse freshly planted saplings on later questions.
  const linkedPeople: { id: string; name: string }[] = [];
  const rawPeople = form.get("people");
  if (typeof rawPeople === "string" && rawPeople.trim()) {
    try {
      const parsed = JSON.parse(rawPeople) as Array<{
        id?: string;
        name?: string;
        relationship?: string;
      }>;
      for (const p of Array.isArray(parsed) ? parsed : []) {
        let personId = p.id;
        let personName = p.name?.trim() ?? "";
        if (!personId && personName) {
          personId = await ensurePerson(userId, personName, p.relationship);
        }
        if (!personId) continue;
        if (!personName) {
          const node = await prisma.forestNode.findUnique({ where: { id: personId } });
          personName = node?.title ?? "";
        }
        await linkMention(userId, result.createdNodeId, personId);
        linkedPeople.push({ id: personId, name: personName });
      }
    } catch {
      /* malformed people payload — skip linking, still save the memory */
    }
  }

  // Store the recording, if the browser captured one.
  let recordingId: string | null = null;
  if (audio instanceof Blob && audio.size > 0) {
    const bytes = new Uint8Array(await audio.arrayBuffer());
    const rec = await recordings().create({
      data: {
        userId,
        nodeId: result.createdNodeId,
        mimeType: audio.type || "audio/webm",
        durationMs,
        bytes,
        transcript: transcript || null,
        question: question.prompt,
      },
    });
    recordingId = rec.id;
  }

  revalidatePath("/forest");

  return NextResponse.json({
    ok: true,
    nodeId: result.createdNodeId,
    createdKind: result.createdKind,
    legacyScore: result.newLegacyScore,
    recordingId,
    linkedPeople,
  });
}
