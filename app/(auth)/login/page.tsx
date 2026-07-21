"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { login, type ActionState } from "@/app/actions/auth";

const initialState: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 w-full rounded-full bg-canopy px-6 py-3 font-sans font-semibold text-white transition hover:bg-canopy-light disabled:opacity-60"
    >
      {pending ? "Entering your forest…" : "Enter my forest"}
    </button>
  );
}

export default function LoginPage() {
  const [state, formAction] = useFormState(login, initialState);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="mb-2 font-serif text-3xl text-parchment">Welcome back</h1>
      <p className="mb-8 text-parchment/70">Return to your Living Legacy Forest.</p>

      <form action={formAction} className="flex flex-col gap-4 font-sans">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-parchment/80">Email</span>
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            className="rounded-lg border border-parchment/20 bg-black/20 px-4 py-2.5 text-parchment outline-none transition focus:border-canopy-light"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-parchment/80">Password</span>
          <input
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="rounded-lg border border-parchment/20 bg-black/20 px-4 py-2.5 text-parchment outline-none transition focus:border-canopy-light"
          />
        </label>

        {state.error ? (
          <p className="rounded-lg bg-red-900/40 px-4 py-2 text-sm text-red-200">{state.error}</p>
        ) : null}

        <SubmitButton />
      </form>

      <p className="mt-6 text-center text-sm text-parchment/60">
        New here?{" "}
        <Link href="/signup" className="text-canopy-light hover:underline">
          Plant your seed
        </Link>
      </p>
    </main>
  );
}
