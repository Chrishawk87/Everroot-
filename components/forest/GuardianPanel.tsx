"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { appointGuardian, removeGuardian, setMemorialMode } from "@/app/actions/guardian";

export interface FamilyOption {
  userId: string;
  name: string;
}

/**
 * Owner-facing controls for stewardship of their own forest:
 *  - Appoint (or replace / remove) a guardian from their linked family. A
 *    guardian can help add memories and, later, turn the forest into a memorial.
 *  - Turn their own forest into a memorial (with confirmation).
 */
export default function GuardianPanel({
  ownerId,
  isMemorial,
  currentGuardianId,
  family,
}: {
  ownerId: string;
  isMemorial: boolean;
  currentGuardianId: string | null;
  family: FamilyOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmMemorial, setConfirmMemorial] = useState(false);

  const currentGuardian = family.find((f) => f.userId === currentGuardianId) ?? null;

  async function appoint() {
    if (!choice) return;
    setBusy(true);
    setError(null);
    const res = await appointGuardian({ guardianUserId: choice });
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Something went wrong");
      return;
    }
    setChoice("");
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    setError(null);
    const res = await removeGuardian();
    setBusy(false);
    if (!res.ok) {
      setError(res.error ?? "Something went wrong");
      return;
    }
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
    setConfirmMemorial(false);
    router.refresh();
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-full border border-parchment/25 bg-black/50 px-4 py-1.5 font-sans text-sm text-parchment/85 transition hover:border-parchment/60 hover:text-parchment"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        </svg>
        Guardian
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 font-sans backdrop-blur-sm">
          <div className="relative flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-parchment/15 bg-gradient-to-b from-[#1a2417] to-[#0d130b] shadow-2xl">
            <div className="flex items-start justify-between border-b border-parchment/10 px-6 py-5">
              <div>
                <p className="text-xs uppercase tracking-widest text-canopy-light">Guardian &amp; Memorial</p>
                <h2 className="font-serif text-2xl text-parchment">Care for your forest</h2>
              </div>
              <button onClick={() => setOpen(false)} className="text-parchment/50 transition hover:text-parchment" aria-label="Close">
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5">
              {/* Guardian */}
              <section>
                <h3 className="font-serif text-lg text-parchment">Your guardian</h3>
                <p className="mt-1 text-sm text-parchment/60">
                  A guardian is a family member you trust to help tend your forest — adding
                  memories on your behalf, and one day turning it into a memorial.
                </p>

                {currentGuardian ? (
                  <div className="mt-3 flex items-center justify-between rounded-2xl border border-canopy-light/30 bg-canopy/20 px-4 py-3">
                    <span className="text-sm text-parchment">
                      <span className="text-parchment/50">Guardian · </span>
                      {currentGuardian.name}
                    </span>
                    <button
                      onClick={remove}
                      disabled={busy}
                      className="text-xs text-parchment/60 underline-offset-2 hover:text-parchment hover:underline disabled:opacity-50"
                    >
                      Remove
                    </button>
                  </div>
                ) : family.length === 0 ? (
                  <p className="mt-3 rounded-2xl border border-parchment/10 bg-black/30 px-4 py-3 text-sm text-parchment/60">
                    Once family members join your forest, you can appoint one as your guardian.
                  </p>
                ) : (
                  <div className="mt-3 flex gap-2">
                    <select
                      value={choice}
                      onChange={(e) => setChoice(e.target.value)}
                      className="flex-1 rounded-xl border border-parchment/15 bg-black/40 px-3 py-2 text-sm text-parchment focus:border-canopy-light focus:outline-none"
                    >
                      <option value="">Choose a family member…</option>
                      {family.map((f) => (
                        <option key={f.userId} value={f.userId}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={appoint}
                      disabled={busy || !choice}
                      className="rounded-full bg-fruit px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
                    >
                      Appoint
                    </button>
                  </div>
                )}
              </section>

              {/* Memorial */}
              <section className="mt-6 border-t border-parchment/10 pt-5">
                <h3 className="font-serif text-lg text-parchment">Memorial mode</h3>
                <p className="mt-1 text-sm text-parchment/60">
                  When a forest becomes a memorial, family can leave tributes and the tree keeps
                  growing as a shared remembrance.
                </p>

                {isMemorial ? (
                  <div className="mt-3 space-y-3">
                    <div className="rounded-2xl border border-fruit/40 bg-canopy/20 px-4 py-3 text-sm text-parchment">
                      This forest is a memorial.
                    </div>
                    <button
                      onClick={() => toggleMemorial(false)}
                      disabled={busy}
                      className="text-xs text-parchment/60 underline-offset-2 hover:text-parchment hover:underline disabled:opacity-50"
                    >
                      Turn memorial mode off
                    </button>
                  </div>
                ) : confirmMemorial ? (
                  <div className="mt-3 space-y-3 rounded-2xl border border-fruit/40 bg-black/30 px-4 py-4">
                    <p className="text-sm text-parchment/80">
                      Turn this forest into a memorial? Your family will be able to leave tributes.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => toggleMemorial(true)}
                        disabled={busy}
                        className="flex-1 rounded-full bg-fruit px-4 py-2 text-sm font-semibold text-black transition hover:brightness-110 disabled:opacity-50"
                      >
                        {busy ? "Working…" : "Yes, make it a memorial"}
                      </button>
                      <button
                        onClick={() => setConfirmMemorial(false)}
                        disabled={busy}
                        className="rounded-full border border-parchment/20 px-4 py-2 text-sm text-parchment/70 transition hover:border-parchment/50"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmMemorial(true)}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-parchment/20 px-4 py-2 text-sm text-parchment/80 transition hover:border-parchment/50"
                  >
                    Turn this forest into a memorial
                  </button>
                )}
              </section>

              {error ? <p className="mt-4 text-xs text-red-300">{error}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
