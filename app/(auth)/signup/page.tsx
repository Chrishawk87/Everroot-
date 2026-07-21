"use client";

import Link from "next/link";
import { useFormState, useFormStatus } from "react-dom";
import { signup, type ActionState } from "@/app/actions/auth";

const initialState: ActionState = {};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="mt-2 w-full rounded-full bg-canopy px-6 py-3 font-sans font-semibold text-white transition hover:bg-canopy-light disabled:opacity-60"
    >
      {pending ? "Planting your seed…" : "Plant my seed"}
    </button>
  );
}

export default function SignupPage() {
  const [state, formAction] = useFormState(signup, initialState);

  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-12">
      <h1 className="mb-2 font-serif text-3xl text-parchment">Plant your seed</h1>
      <p className="mb-8 text-parchment/70">
        Create your account and begin your Living Legacy Forest.
      </p>

      <form action={formAction} className="flex flex-col gap-4 font-sans">
        <Field label="Your name" name="displayName" type="text" required autoComplete="name" />
        <Field label="Email" name="email" type="email" required autoComplete="email" />
        <Field
          label="Password"
          name="password"
          type="password"
          required
          autoComplete="new-password"
          hint="At least 8 characters"
        />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Birth year" name="birthYear" type="number" placeholder="1952" />
          <Field label="Family role" name="familyPosition" type="text" placeholder="Grandfather" />
        </div>

        {state.error ? (
          <p className="rounded-lg bg-red-900/40 px-4 py-2 text-sm text-red-200">{state.error}</p>
        ) : null}

        <SubmitButton />
      </form>

      <p className="mt-6 text-center text-sm text-parchment/60">
        Already have a forest?{" "}
        <Link href="/login" className="text-canopy-light hover:underline">
          Sign in
        </Link>
      </p>
    </main>
  );
}

function Field({
  label,
  hint,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-parchment/80">{label}</span>
      <input
        {...props}
        className="rounded-lg border border-parchment/20 bg-black/20 px-4 py-2.5 text-parchment outline-none transition focus:border-canopy-light"
      />
      {hint ? <span className="text-xs text-parchment/50">{hint}</span> : null}
    </label>
  );
}
