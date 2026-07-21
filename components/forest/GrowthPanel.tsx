"use client";

import { useEffect, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { growForest, type GrowState } from "@/app/actions/forest";
import type { InteractionType } from "@/lib/forest/growth-engine";

const INTERACTIONS: { value: InteractionType; label: string; grows: string }[] = [
  { value: "record_story", label: "Record a story", grows: "a leaf" },
  { value: "record_advice", label: "Share life advice", grows: "fruit" },
  { value: "major_life_event", label: "Mark a milestone", grows: "a flower" },
  { value: "family_history", label: "Add family history", grows: "a root" },
  { value: "add_family_member", label: "Add a family member", grows: "a sapling" },
  { value: "answer_question", label: "Answer a question", grows: "a leaf" },
  { value: "upload_photo", label: "Add a photo memory", grows: "a memory" },
  { value: "memory_moment", label: "Capture a Memory Moment", grows: "a moment" },
];

const EPOCHS = [
  ["ROOTS", "Roots (0–12)"],
  ["FIRST_STEPS", "First Steps (13–22)"],
  ["CROSSROADS", "Crossroads (23–35)"],
  ["ANCHORS", "Anchors (36–50)"],
  ["STORMS", "Storms (51–65)"],
  ["HARVEST", "Harvest (66–80)"],
  ["HORIZONS", "Horizons (81+)"],
];

const MOMENT_TYPES = [
  ["quick_wisdom", "Quick Wisdom"],
  ["family_story", "Family Story"],
  ["tradition", "Tradition"],
  ["recipe", "Recipe"],
  ["time_capsule", "Time Capsule"],
  ["legacy_message", "Legacy Message"],
];

const initialState: GrowState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-full bg-canopy px-5 py-2.5 font-sans text-sm font-semibold text-white transition hover:bg-canopy-light disabled:opacity-60"
    >
      {pending ? "Growing…" : "Grow the forest"}
    </button>
  );
}

export default function GrowthPanel({ onGrew }: { onGrew?: () => void }) {
  const [state, formAction] = useFormState(growForest, initialState);
  const [type, setType] = useState<InteractionType>("record_story");

  useEffect(() => {
    if (state.ok) onGrew?.();
  }, [state, onGrew]);

  return (
    <form action={formAction} className="flex flex-col gap-3 font-sans text-sm">
      <label className="flex flex-col gap-1">
        <span className="text-parchment/70">Interaction</span>
        <select
          name="type"
          value={type}
          onChange={(e) => setType(e.target.value as InteractionType)}
          className="rounded-lg border border-parchment/20 bg-black/30 px-3 py-2 text-parchment outline-none focus:border-canopy-light"
        >
          {INTERACTIONS.map((i) => (
            <option key={i.value} value={i.value}>
              {i.label} → grows {i.grows}
            </option>
          ))}
        </select>
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-parchment/70">Title</span>
        <input
          name="title"
          required
          maxLength={160}
          placeholder="e.g. How I met your grandmother"
          className="rounded-lg border border-parchment/20 bg-black/30 px-3 py-2 text-parchment outline-none focus:border-canopy-light"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-parchment/70">Details (optional)</span>
        <textarea
          name="summary"
          rows={3}
          maxLength={2000}
          placeholder="A few words about this memory…"
          className="resize-none rounded-lg border border-parchment/20 bg-black/30 px-3 py-2 text-parchment outline-none focus:border-canopy-light"
        />
      </label>

      {type === "add_family_member" ? (
        <label className="flex flex-col gap-1">
          <span className="text-parchment/70">Relationship</span>
          <input
            name="relationship"
            placeholder="Wife, Son, Grandmother…"
            className="rounded-lg border border-parchment/20 bg-black/30 px-3 py-2 text-parchment outline-none focus:border-canopy-light"
          />
        </label>
      ) : (
        <label className="flex flex-col gap-1">
          <span className="text-parchment/70">Branch (optional)</span>
          <input
            name="branch"
            placeholder="Life Advice, Recipes, Faith…"
            className="rounded-lg border border-parchment/20 bg-black/30 px-3 py-2 text-parchment outline-none focus:border-canopy-light"
          />
        </label>
      )}

      {type === "memory_moment" ? (
        <label className="flex flex-col gap-1">
          <span className="text-parchment/70">Moment type</span>
          <select
            name="momentType"
            className="rounded-lg border border-parchment/20 bg-black/30 px-3 py-2 text-parchment outline-none focus:border-canopy-light"
          >
            {MOMENT_TYPES.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {type === "major_life_event" ? (
        <label className="flex flex-col gap-1">
          <span className="text-parchment/70">Life epoch</span>
          <select
            name="epoch"
            className="rounded-lg border border-parchment/20 bg-black/30 px-3 py-2 text-parchment outline-none focus:border-canopy-light"
          >
            <option value="">—</option>
            {EPOCHS.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
      ) : null}

      {state.error ? (
        <p className="rounded-lg bg-red-900/40 px-3 py-2 text-xs text-red-200">{state.error}</p>
      ) : null}
      {state.ok ? (
        <p className="rounded-lg bg-canopy-dark/50 px-3 py-2 text-xs text-canopy-light">
          Grew {state.createdKind?.toLowerCase()} · Legacy score {state.legacyScore}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
