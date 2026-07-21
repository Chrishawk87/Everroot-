/**
 * Optional demo seed. Creates a sample account with a partially grown forest so
 * you can see the experience before recording your own memories.
 *
 *   npm run db:seed
 *
 * Login: demo@everroot.app  /  everroot123
 */
import { PrismaClient, type NodeKind, type EdgeKind } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = "demo@everroot.app";
  await prisma.user.deleteMany({ where: { email } });

  const passwordHash = await bcrypt.hash("everroot123", 12);
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      profile: {
        create: { displayName: "Walter Everroot", birthYear: 1948, familyPosition: "Grandfather" },
      },
    },
  });

  const uid = user.id;
  const mk = (kind: NodeKind, title: string, score: number, summary?: string) =>
    prisma.forestNode.create({ data: { userId: uid, kind, title, score, summary: summary ?? null } });
  const link = (kind: EdgeKind, from: string, to: string, label?: string) =>
    prisma.forestEdge.create({ data: { userId: uid, kind, fromNodeId: from, toNodeId: to, label: label ?? null } });

  const seed = await mk("SEED", "Walter's Seed", 1);
  const trunk = await mk("TRUNK", "Life Journey", 5);
  await link("GREW_INTO", seed.id, trunk.id);

  const advice = await mk("BRANCH", "Life Advice", 2);
  const stories = await mk("BRANCH", "Favorite Stories", 2);
  await link("CONTAINS", trunk.id, advice.id);
  await link("CONTAINS", trunk.id, stories.id);

  const fruit = await mk("FRUIT", "Always keep your word", 12, "The best advice my father gave me.");
  const leaf = await mk("LEAF", "The summer of 1965", 5, "The road trip that changed everything.");
  await link("CONTAINS", advice.id, fruit.id);
  await link("CONTAINS", stories.id, leaf.id);

  const flower = await mk("FLOWER", "Marrying Margaret", 15, "June 12, 1971.");
  await link("CONTAINS", stories.id, flower.id);

  const root = await mk("ROOT", "Crossing from Ireland", 10, "Our family's immigration story.");
  await link("ANCESTOR_OF", trunk.id, root.id);

  const wife = await mk("PERSON", "Margaret", 8);
  await link("FAMILY", seed.id, wife.id, "Wife");

  console.log(`Seeded demo forest for ${email}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
