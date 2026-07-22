"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { addTribute, setMemorialMode } from "@/app/actions/guardian";

/**
 * Memorial-related controls shown when visiting someone else's tree:
 *  - When the forest is a memorial, any linked family can leave a tribute — a
 *    remembrance that grows on the tree, clearly marked as coming from them.
 *  - The appointed guardian gets a toggle to turn memorial mode on or off.
 */
export default function MemorialControls({
  ownerId,
  ownerName,
  isMemorial,
  isViewerGuardian,
}: {
  ownerId: string;
  ownerName: string;
  isMemorial: boolean;
  isViewerGuardian: boolean;
}) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmOn, setConfirmOn] = useState(false);

  async function submitTribute(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await addTribute({ ownerId, title, message });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Something went wrong");
      return;
    }
    setTitle("");
    setMessage("");
    setShowForm(false);
    router.refresh();
  }

  async function toggleMemorial(on: boolean) {
    setBusy(true);
    setError(null);
    const res = await setMemorialMode({ ownerId, on });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Something went wrong");
      return;
    }
    setConfirmOn(false);
    router.refresh();
  }

  return (
    <>
      {isMemorial ? (
        showForm ? (
          <form
            onSubmit={submitTribute}
            className="w-full max-w-sm space-y-2 rounded-2xl border border-parchment/15 bg-black/70 p-4 backdrop-blur"
          >
            <p className="font-serif text-parchment">A tribute for {ownerName}</p>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title (e.g. How I'll remember you)"
              maxLength={120}
              className="w-full rounded-xl border border-parchment/15 bg-black/40 px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:border-canopy-light focus:outline-none"
            />
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Share a memory or a few words…"
              rows={4}
              className="w-full resize-y rounded-xl border border-parchment/15 bg-black/40 px-3 py-2 text-sm text-parchment placeholder:text-parchment/30 focus:border-canopy-light focus:outline-none"
            />
            {error ? <p className="text-xs text-red-300">{error}</p> : null}
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={busy}
                className="flex-1 rounded-full bg-fruit px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
              >
                {busy ? "Planting…" : "Leave tribute"}
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-full border border-parchment/20 px-4 py-2 text-sm text-parchment/70 transition hover:border-parchment/50"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-full border border-fruit/40 bg-fruit/15 px-4 py-1.5 font-sans text-sm text-parchment transition hover:brightness-110"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
            </svg>
            Leave a tribute
          </button>
        )
      ) : null}

      {/* Guardian's memorial toggle. */}
      {isViewerGuardian ? (
        isMemorial ? (
          <button
            onClick={() => toggleMemorial(false)}
            disabled={busy}
            className="inline-flex items-center rounded-full border border-parchment/20 bg-black/40 px-4 py-1.5 font-sans text-xs text-parchment/70 transition hover:border-parchment/50 disabled:opacity-50"
          >
            Turn memorial mode off
          </button>
        ) : confirmOn ? (
          <span className="inline-flex items-center gap-2 rounded-full border border-fruit/40 bg-black/60 px-3 py-1.5 font-sans text-xs text-parchment">
            Make {ownerName}&apos;s forest a memorial?
            <button
              onClick={() => toggleMemorial(true)}
              disabled={busy}
              className="font-semibold text-fruit hover:underline disabled:opacity-50"
            >
              Yes
            </button>
            <button onClick={() => setConfirmOn(false)} className="text-parchment/60 hover:underline">
              No
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmOn(true)}
            className="inline-flex items-center rounded-full border border-parchment/20 bg-black/40 px-4 py-1.5 font-sans text-xs text-parchment/70 transition hover:border-parchment/50"
          >
            Turn into a memorial
          </button>
        )
      ) : null}

      {error && !showForm ? <p className="text-xs text-red-300">{error}</p> : null}
    </>
  );
}
