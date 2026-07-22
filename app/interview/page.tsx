import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getForest } from "@/lib/forest/queries";
import InterviewExperience from "@/components/interview/InterviewExperience";

export const dynamic = "force-dynamic";

// The life interview — a focused, voice-first conversation that grows the tree.
export default async function InterviewPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const graph = await getForest(session.user.id);
  if (!graph) redirect("/signup");

  // The family members already in this forest — offered as tappable choices in
  // the "who was part of this?" step so memories can link to real people.
  const people = graph.nodes
    .filter((n) => n.kind === "PERSON")
    .map((n) => {
      const fam = graph.edges.find((e) => e.kind === "FAMILY" && e.toNodeId === n.id);
      return { id: n.id, name: n.title, relationship: fam?.label ?? null };
    });

  return (
    <InterviewExperience displayName={graph.profile.displayName} people={people} />
  );
}
