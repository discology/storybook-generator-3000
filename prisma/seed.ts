import { prisma } from "../server/db";

const PROMPTS = [
  { question: "What made you smile today?", supportingText: "Tell it in your own words.", category: "Little joys", cardColor: "purple" },
  { question: "What did they try for the first time?", supportingText: "Big or small, it counts.", category: "Firsts", audience: "Parents", cardColor: "gold" },
  { question: "When did you feel close to them today?", supportingText: "A quiet moment works too.", category: "Connection", cardColor: "pink" },
  { question: "What do you want them to know someday?", supportingText: "Say it like you're telling them now.", category: "For the future", cardColor: "green" },
];

async function main() {
  const count = await prisma.prompt.count();
  if (count > 0) {
    console.log(`Prompts already seeded (${count} present) — skipping.`);
    return;
  }
  for (let i = 0; i < PROMPTS.length; i++) {
    const p = PROMPTS[i];
    await prisma.prompt.create({
      data: { ...p, status: "published", sortOrder: i, audience: p.audience ?? "Everyone", childStage: "All stages" },
    });
  }
  console.log(`Seeded ${PROMPTS.length} prompts.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
