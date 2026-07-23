"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { ForestGraph, ForestNodeDTO } from "@/lib/forest/types";
import { GROWTH_STAGES } from "@/lib/forest/types";
import ShareClipButton, { isClipKind } from "./ShareClipButton";
import StoryFeedPlayer from "./StoryFeedPlayer";
import CapsulePanel from "./CapsulePanel";
import MemorialControls from "./MemorialControls";

const ForestCanvas = dynamic(() => import("./ForestCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-parchment/50">
      Growing the forest…
    </div>
  ),
});

// A visiting view of a family member's tree — the full 3D forest, but read-only
// (no growth controls). Reached by clicking a tree in the family forest.
export default function ReadOnlyForest({
  graph,
  relationship,
  ownerId,
  isViewerGuardian = false,
}: {
  graph: ForestGraph;
  relationship: string | null;
  ownerId: string;
  isViewerGuardian?: boolean;
}) {
  const [selected, setSelected] = useState<ForestNodeDTO | null>(null);
  const stageMeta = GROWTH_STAGES.find((s) => s.stage === graph.stage);
  const memoryCount =
    graph.counts.LEAF + graph.counts.FLOWER + graph.counts.FRUIT + graph.counts.MEMORY_MOMENT + graph.counts.PHOTO;

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div className="absolute inset-0">
        <ForestCanvas graph={graph} selectedId={selected?.id ?? null} focusId={null} onSelect={setSelected} memorial={graph.isMemorial} />
      </div>

      {/* Memorial banner. */}
      {graph.isMemorial ? (
        <div className="pointer-events-none absolute left-1/2 top-6 z-10 -translate-x-1/2 text-center font-serif [text-shadow:0_1px_8px_rgba(0,0,0,0.9)]">
          <p className="text-xs uppercase tracking-[0.3em] text-parchment/60">In loving memory</p>
          <p className="text-lg text-parchment/90">{graph.profile.displayName}</p>
          {graph.memorialNote ? (
            <p className="mt-1 max-w-md text-sm italic text-parchment/60">{graph.memorialNote}</p>
          ) : null}
        </div>
      ) : null}

      {/* Whose tree this is */}
      <div className="pointer-events-none absolute left-5 top-5 max-w-xs font-sans [text-shadow:0_1px_8px_rgba(0,0,0,0.9)]">
        <p className="text-xs uppercase tracking-widest text-canopy-light">Visiting</p>
        <h1 className="font-serif text-2xl text-parchment">
          {graph.profile.displayName}
          {relationship ? <span className="text-parchment/50"> · {relationship}</span> : null}
        </h1>
        <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-sm">
          <span className="text-fruit">{stageMeta?.label ?? graph.stage}</span>
          <span className="text-parchment/40">·</span>
          <span className="text-parchment/80">Legacy {graph.legacyScore}</span>
        </div>
        <p className="mt-2 text-xs text-parchment/40">
          {memoryCount} memories · {graph.counts.PERSON} family · {graph.counts.ROOT} roots
        </p>
        <div className="pointer-events-auto mt-3 flex flex-wrap items-center gap-2">
          <StoryFeedPlayer ownerId={ownerId} ownerName={graph.profile.displayName} />
          <Link
            href={`/book/${ownerId}`}
            className="inline-flex items-center gap-2 rounded-full border border-parchment/25 bg-black/50 px-4 py-1.5 text-sm text-parchment/85 transition hover:border-parchment/60 hover:text-parchment"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
            Book of the Tree
          </Link>
          <CapsulePanel ownerId={ownerId} ownerName={graph.profile.displayName} />
          <MemorialControls
            ownerId={ownerId}
            ownerName={graph.profile.displayName}
            isMemorial={graph.isMemorial}
            isViewerGuardian={isViewerGuardian}
            memorialNote={graph.memorialNote}
          />
        </div>
      </div>

      <Link
        href="/family"
        className="absolute right-5 top-5 rounded-full border border-parchment/20 bg-black/40 px-4 py-1.5 font-sans text-sm text-parchment/80 transition hover:border-parchment/50"
      >
        ← Family forest
      </Link>

      {/* Selected node detail (read-only) */}
      {selected ? (
        <div className="absolute bottom-5 left-5 max-w-sm rounded-2xl border border-parchment/15 bg-black/70 p-5 font-sans backdrop-blur">
          <p className="text-xs uppercase tracking-widest text-canopy-light">{selected.kind.replace(/_/g, " ")}</p>
          <h2 className="mt-1 font-serif text-xl text-parchment">{selected.title}</h2>
          {selected.summary ? <p className="mt-2 text-sm text-parchment/75">{selected.summary}</p> : null}
          {isClipKind(selected.kind) ? <ShareClipButton node={selected} /> : null}
          <button onClick={() => setSelected(null)} className="mt-3 block text-xs text-parchment/50 hover:text-parchment">
            Close
          </button>
        </div>
      ) : null}
    </div>
  );
}
