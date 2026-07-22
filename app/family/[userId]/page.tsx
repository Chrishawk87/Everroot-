import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getFamilyForest } from "@/lib/forest/queries";
import { isGuardianOf } from "@/lib/guardianship";
import ReadOnlyForest from "@/components/forest/ReadOnlyForest";

export const dynamic = "force-dynamic";

// Visit a family member's tree — read-only, and only if they're linked to you.
export default async function MemberForestPage({
  params,
}: {
  params: { userId: string };
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  // Your own tree lives at /forest.
  if (params.userId === session.user.id) redirect("/forest");

  // Access is limited to trees connected to yours.
  const family = await getFamilyForest(session.user.id);
  const member = family?.members.find((m) => m.userId === params.userId);
  if (!member) redirect("/family");

  const isViewerGuardian = await isGuardianOf(session.user.id, member.userId);

  return (
    <ReadOnlyForest
      graph={member.graph}
      relationship={member.relationship}
      ownerId={member.userId}
      isViewerGuardian={isViewerGuardian}
    />
  );
}
