import { NextResponse } from "next/server";
import {
  listPendingBackfill,
  countPendingBackfill,
  markRecordingStored,
} from "@/lib/recordings";
import { storageConfigured, putRecording, newRecordingKey } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-time migration: move voice recordings whose audio still lives in Postgres
// (`bytes`) into Cloudflare R2, then null out the DB bytes. Idempotent — only
// touches recordings with no `storageKey` yet, so it's safe to run repeatedly
// until `remaining` reaches 0.
//
// Gated by a shared secret in the BACKFILL_SECRET env var. If that var is unset
// the endpoint returns 404, so it stays dormant unless deliberately enabled.
// Call: GET /api/admin/backfill-recordings?key=<BACKFILL_SECRET>

const BATCH = 10; // recordings uploaded per DB pull
const TIME_BUDGET_MS = 20_000; // stop pulling new batches after ~20s

export async function GET(req: Request) {
  const secret = process.env.BACKFILL_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const key = new URL(req.url).searchParams.get("key");
  if (key !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!storageConfigured()) {
    return NextResponse.json(
      { error: "Object storage (R2) is not configured — set the R2_* env vars first." },
      { status: 400 },
    );
  }

  const deadline = Date.now() + TIME_BUDGET_MS;
  let moved = 0;
  const failed: string[] = [];

  while (Date.now() < deadline) {
    const batch = await listPendingBackfill(BATCH);
    if (batch.length === 0) break;

    for (const rec of batch) {
      if (!rec.bytes) continue; // nothing to move (shouldn't happen given the filter)
      try {
        const objectKey = newRecordingKey();
        await putRecording(objectKey, rec.bytes, rec.mimeType);
        await markRecordingStored(rec.id, objectKey);
        moved += 1;
      } catch (err) {
        console.error(`Backfill failed for recording ${rec.id}:`, err);
        failed.push(rec.id);
      }
      if (Date.now() >= deadline) break;
    }

    // If every recording in the batch failed, stop rather than spin forever.
    if (failed.length >= batch.length && moved === 0) break;
  }

  const remaining = await countPendingBackfill();
  return NextResponse.json({
    ok: true,
    movedThisRun: moved,
    failed,
    remaining,
    done: remaining === 0,
  });
}
