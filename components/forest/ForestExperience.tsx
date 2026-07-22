"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ForestGraph, ForestNodeDTO } from "@/lib/forest/types";
import { GROWTH_STAGES } from "@/lib/forest/types";
import GrowthPanel from "./GrowthPanel";
import InviteButton from "./InviteButton";
import ShareClipButton, { isClipKind } from "./ShareClipButton";
import StoryFeedPlayer from "./StoryFeedPlayer";
import CapsulePanel from "./CapsulePanel";
import GuardianPanel, { type FamilyOption } from "./GuardianPanel";
import { signOutAction } from "@/app/actions/forest";

// three.js only runs in the browser — load the canvas without SSR.
const ForestCanvas = dynamic(() => import("./ForestCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center text-parchment/50">
      Growing your forest…
    </div>
  ),
});

const ForestIntro = dynamic(() => import("./ForestIntro"), { ssr: false });

const INTRO_SEEN_KEY = "everroot_intro_seen";

const NEXT_STAGE_LABEL: Record<string, { min: number; label: string } | null> = Object.fromEntries(
  GROWTH_STAGES.map((s, i) => [
    s.stage,
    GROWTH_STAGES[i + 1] ? { min: GROWTH_STAGES[i + 1].minScore, label: GROWTH_STAGES[i + 1].label } : null,
  ]),
);

// How each freshly grown object announces itself.
const GREW_VERB: Record<string, string> = {
  LEAF: "A new leaf unfurled",
  FLOWER: "A flower bloomed",
  FRUIT: "Fruit ripened",
  ROOT: "A root took hold",
  PERSON: "A family sapling was planted",
  PHOTO: "A memory was pinned",
  MEMORY_MOMENT: "A moment was captured",
  BRANCH: "A new branch reached out",
  SEED: "A seed was planted",
};

export default function ForestExperience({
  graph,
  ownerId,
  guardianId = null,
}: {
  graph: ForestGraph;
  ownerId: string;
  guardianId?: string | null;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<ForestNodeDTO | null>(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showIntro, setShowIntro] = useState(false);

  // Play the opening automatically the first time this browser sees the forest.
  useEffect(() => {
    try {
      if (!localStorage.getItem(INTRO_SEEN_KEY)) setShowIntro(true);
    } catch {
      /* localStorage unavailable — just skip the intro. */
    }
  }, []);

  const completeIntro = useCallback(() => {
    setShowIntro(false);
    try {
      localStorage.setItem(INTRO_SEEN_KEY, "1");
    } catch {
      /* ignore */
    }
  }, []);

  // Nodes arrive ordered oldest→newest, so the last one is the freshest.
  const newestNode = graph.nodes.length ? graph.nodes[graph.nodes.length - 1] : null;
  const newestId = newestNode?.id ?? null;
  // Seed with the current newest so the first render doesn't fly the camera.
  const prevNewest = useRef<string | null>(newestId);
  const focusTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (newestId && prevNewest.current && newestId !== prevNewest.current && newestNode) {
      // Something new grew — reveal it.
      setSelected(newestNode);
      setFocusId(newestId);
      const verb = GREW_VERB[newestNode.kind] ?? "Your forest grew";
      setToast(`${verb}: ${newestNode.title}`);

      if (focusTimer.current) clearTimeout(focusTimer.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      focusTimer.current = setTimeout(() => setFocusId(null), 4500);
      toastTimer.current = setTimeout(() => setToast(null), 4000);
    }
    prevNewest.current = newestId;
  }, [newestId, newestNode]);

  useEffect(() => {
    return () => {
      if (focusTimer.current) clearTimeout(focusTimer.current);
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const handleGrew = useCallback(() => {
    router.refresh();
  }, [router]);

  const stageMeta = GROWTH_STAGES.find((s) => s.stage === graph.stage);
  const next = NEXT_STAGE_LABEL[graph.stage];
  const memoryCount =
    graph.counts.LEAF + graph.counts.FLOWER + graph.counts.FRUIT + graph.counts.MEMORY_MOMENT + graph.counts.PHOTO;

  // Linked family who could serve as a guardian (PERSON nodes bound to a real account).
  const familyOptions: FamilyOption[] = graph.nodes
    .filter((n) => n.kind === "PERSON" && n.linkedUserId)
    .map((n) => ({ userId: n.linkedUserId as string, name: n.title }));

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      <div
        className="absolute inset-0 transition-[filter] duration-1000"
        style={graph.isMemorial ? { filter: "sepia(0.45) saturate(0.75) brightness(0.9)" } : undefined}
      >
        <ForestCanvas
          graph={graph}
          selectedId={selected?.id ?? null}
          focusId={focusId}
          onSelect={setSelected}
        />
      </div>

      {/* Memorial banner. */}
      {graph.isMemorial ? (
        <div className="pointer-events-none absolute left-1/2 top-6 z-10 -translate-x-1/2 text-center font-serif">
          <p className="text-xs uppercase tracking-[0.3em] text-parchment/60">In loving memory</p>
          <p className="text-lg text-parchment/90">{graph.profile.displayName}</p>
          {graph.memorialNote ? (
            <p className="mt-1 max-w-md text-sm italic text-parchment/60">{graph.memorialNote}</p>
          ) : null}
        </div>
      ) : null}

      {/* Top-left: whose forest + growth stage. */}
      <div className="pointer-events-none absolute left-5 top-5 max-w-xs font-sans">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/everroot-logo-transparent.png"
          alt="EverRoot"
          className="mb-2 h-14 w-auto drop-shadow-[0_2px_10px_rgba(0,0,0,0.6)]"
        />
        <h1 className="font-serif text-2xl text-parchment">
          {graph.profile.displayName}
          {graph.profile.familyPosition ? (
            <span className="text-parchment/50"> · {graph.profile.familyPosition}</span>
          ) : null}
        </h1>
        <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-black/40 px-3 py-1 text-sm">
          <span className="text-fruit">{stageMeta?.label ?? graph.stage}</span>
          <span className="text-parchment/40">·</span>
          <span className="text-parchment/80">Legacy {graph.legacyScore}</span>
        </div>
        {next ? (
          <p className="mt-1 text-xs text-parchment/50">
            {next.min - graph.legacyScore > 0
              ? `${next.min - graph.legacyScore} more to reach ${next.label}`
              : `Ready to become ${next.label}`}
          </p>
        ) : (
          <p className="mt-1 text-xs text-parchment/50">Fully grown — an ancient legacy</p>
        )}
        <p className="mt-2 text-xs text-parchment/40">
          {memoryCount} memories · {graph.counts.PERSON} family · {graph.counts.ROOT} roots
        </p>
        <button
          onClick={() => setShowIntro(true)}
          className="pointer-events-auto mt-2 text-xs text-parchment/40 underline-offset-2 transition hover:text-parchment/80 hover:underline"
        >
          ▶ Replay opening
        </button>
      </div>

      {/* Growth toast — announces what just grew. */}
      {toast ? (
        <div className="pointer-events-none absolute left-1/2 top-6 z-10 -translate-x-1/2 animate-[fadeIn_0.4s_ease-out] font-sans">
          <div className="flex items-center gap-2 rounded-full border border-fruit/40 bg-black/80 px-5 py-2 text-sm text-parchment shadow-lg backdrop-blur">
            <span className="text-fruit">✦</span>
            <span>{toast}</span>
          </div>
        </div>
      ) : null}

      {/* Top-right: family forest + sign out. */}
      <div className="absolute right-5 top-5 flex items-center gap-2 font-sans">
        <Link
          href="/family"
          className="rounded-full border border-canopy-light/40 bg-canopy/25 px-4 py-1.5 text-sm text-parchment/90 transition hover:border-canopy-light"
        >
          Family forest
        </Link>
        <form action={signOutAction}>
          <button className="rounded-full border border-parchment/20 bg-black/40 px-4 py-1.5 text-sm text-parchment/80 transition hover:border-parchment/50">
            Sign out
          </button>
        </form>
      </div>

      {/* Selected node detail. */}
      {selected ? (
        <div className="absolute bottom-5 left-5 max-w-sm rounded-2xl border border-parchment/15 bg-black/70 p-5 font-sans backdrop-blur">
          <p className="text-xs uppercase tracking-widest text-canopy-light">
            {selected.kind.replace(/_/g, " ")}
          </p>
          <h2 className="mt-1 font-serif text-xl text-parchment">{selected.title}</h2>
          {selected.summary ? (
            <p className="mt-2 text-sm text-parchment/75">{selected.summary}</p>
          ) : null}
          {selected.epoch ? (
            <p className="mt-2 text-xs text-parchment/50">Epoch · {selected.epoch.replace(/_/g, " ")}</p>
          ) : null}
          {selected.kind === "PERSON" ? <InviteButton person={selected} /> : null}
          {isClipKind(selected.kind) ? <ShareClipButton node={selected} /> : null}
          <button
            onClick={() => setSelected(null)}
            className="mt-3 text-xs text-parchment/50 hover:text-parchment"
          >
            Close
          </button>
        </div>
      ) : null}

      {/* Cinematic opening — plays over everything. */}
      {showIntro ? (
        <ForestIntro displayName={graph.profile.displayName} onComplete={completeIntro} />
      ) : null}

      {/* Growth panel. */}
      <div className="absolute bottom-5 right-5 w-80 max-w-[90vw] font-sans">
        {/* Primary action — the voice life interview. */}
        <Link
          href="/interview"
          className="mb-3 flex items-center gap-3 rounded-2xl border border-fruit/40 bg-gradient-to-r from-canopy/80 to-canopy-light/70 px-5 py-3.5 text-left shadow-lg transition hover:border-fruit/70 hover:brightness-110"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 10a7 7 0 0 0 14 0" />
            <line x1="12" y1="17" x2="12" y2="21" />
            <line x1="8" y1="21" x2="16" y2="21" />
          </svg>
          <span>
            <span className="block font-serif text-lg leading-tight text-white">Record your story</span>
            <span className="block text-xs text-white/80">Answer a few questions aloud — watch your tree grow</span>
          </span>
        </Link>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <StoryFeedPlayer ownerId={ownerId} ownerName={graph.profile.displayName} isSelf />
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
          <CapsulePanel ownerId={ownerId} ownerName={graph.profile.displayName} isSelf />
          <GuardianPanel
            ownerId={ownerId}
            isMemorial={graph.isMemorial}
            currentGuardianId={guardianId}
            family={familyOptions}
          />
        </div>
        <div className="rounded-2xl border border-parchment/15 bg-black/70 backdrop-blur">
          <button
            onClick={() => setPanelOpen((o) => !o)}
            className="flex w-full items-center justify-between px-5 py-3 text-left"
          >
            <span className="font-serif text-lg text-parchment">Grow your forest</span>
            <span className="text-parchment/50">{panelOpen ? "–" : "+"}</span>
          </button>
          {panelOpen ? (
            <div className="border-t border-parchment/10 p-5 pt-4">
              <GrowthPanel onGrew={handleGrew} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
