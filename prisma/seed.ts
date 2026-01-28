import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const initialSubreddits = [
  "SomebodyMakeThis",
  "AppIdeas",
  "Entrepreneur",
  "startups",
  "SaaS",
  "smallbusiness",
];

async function main() {
  console.log("Seeding database...");

  for (const name of initialSubreddits) {
    await prisma.subreddit.upsert({
      where: { name },
      update: {},
      create: { name },
    });
    console.log(`  - Added subreddit: r/${name}`);
  }

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
