import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getForest } from "@/lib/forest/queries";
import ForestExperience from "@/components/forest/ForestExperience";

// The Forest is the application. After authentication the user enters directly
// into their 3D forest — there is no dashboard.
export const dynamic = "force-dynamic";

export default async function ForestPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const graph = await getForest(session.user.id);
  if (!graph) {
    // Profile missing (should not happen after signup) — send back to signup.
    redirect("/signup");
  }

  return <ForestExperience graph={graph} />;
}
