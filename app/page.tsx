import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();
  if (session?.user) redirect("/forest");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col items-center justify-center px-6 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/everroot-logo-transparent.png"
        alt="EverRoot — the living legacy forest"
        className="mb-8 w-[320px] max-w-full drop-shadow-[0_4px_24px_rgba(0,0,0,0.5)] md:w-[420px]"
      />
      <p className="mb-10 max-w-xl text-lg text-parchment/80">
        Preserve your family&apos;s history before it&apos;s gone. Every person begins as a
        seed. Every story grows a tree. Every family becomes a forest that future
        generations can walk through.
      </p>
      <div className="flex flex-col gap-4 sm:flex-row">
        <Link
          href="/signup"
          className="rounded-full bg-canopy px-8 py-3 font-sans text-base font-semibold text-white transition hover:bg-canopy-light"
        >
          Plant your seed
        </Link>
        <Link
          href="/login"
          className="rounded-full border border-parchment/30 px-8 py-3 font-sans text-base font-semibold text-parchment transition hover:border-parchment/60"
        >
          Return to your forest
        </Link>
      </div>
    </main>
  );
}
