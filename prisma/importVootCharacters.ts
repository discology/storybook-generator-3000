import path from "path";
import { DatabaseSync } from "node:sqlite";
import { prisma } from "../server/db";
import { validateKey } from "../server/characters";

// Imports the Vambie characters from the VOOT app's Character Bible into the
// storybook's Character Library. Characters already in the library are left
// alone, so it's safe to re-run after adding characters in VOOT.
//   npm run characters:import-voot -- [path/to/vambie-voot-ambassador/prisma/dev.db]

const DEFAULT_DB = path.join(process.cwd(), "..", "vambie-voot-ambassador", "prisma", "dev.db");
const SKIP_GROUPS = new Set(["Founder"]); // real people don't belong in children's books

// Baby Vambie stands in for the child in every story (AI Instructions → Plan pages).
const BABY_VAMBIE = {
  storyRole: "Stands in for the child in every story; witnesses feelings rather than fixing them.",
  neverRules: "Smooth skin: no spikes, horns, wings or tail.",
};

interface VootCharacter {
  slug: string;
  name: string;
  group: string | null;
  role: string | null;
  title: string | null;
  archetype: string | null;
  personality: string | null;
  bio: string | null;
  visualIdentity: string | null;
  traits: string | null;
}

const db = new DatabaseSync(process.argv[2] ?? DEFAULT_DB, { readOnly: true });
const rows = db
  .prepare(
    `select c.slug, c.name, c."group", c.role, c.title, c.archetype, c.personality, c.bio, c.visualIdentity,
       (select group_concat(t.name, ', ') from CharacterTrait ct join Trait t on t.id = ct.traitId where ct.characterId = c.id) as traits
     from Character c where c.status != 'retired' order by c.name`
  )
  .all() as unknown as VootCharacter[];

for (const row of rows) {
  if (row.group && SKIP_GROUPS.has(row.group)) {
    console.log(`skip   ${row.name} (${row.group})`);
    continue;
  }
  const key = row.slug.replace(/-/g, "_");
  const keyError = validateKey(key);
  if (keyError) {
    console.log(`skip   ${row.name}: ${keyError}`);
    continue;
  }
  if (await prisma.character.findFirst({ where: { OR: [{ key }, { importedFrom: `voot:${row.slug}` }] } })) {
    console.log(`exists <${key}> ${row.name}`);
    continue;
  }

  const isBaby = row.slug === "baby-vambie";
  const appearance = row.visualIdentity ?? "";
  await prisma.character.create({
    data: {
      key,
      name: row.name,
      group: row.group,
      storyRole: isBaby ? BABY_VAMBIE.storyRole : row.title || (row.role ? `${row.role} in ${row.group}` : row.group ?? ""),
      personality: [row.personality, row.bio].filter(Boolean).join(" "),
      appearance,
      neverRules: isBaby ? BABY_VAMBIE.neverRules : "",
      castingMode: isBaby ? "always" : "when_it_fits",
      castingNotes: isBaby
        ? ""
        : [row.traits && `Traits: ${row.traits}. Include when the memory calls for these qualities.`, row.archetype && `Archetype: ${row.archetype}.`]
            .filter(Boolean)
            .join(" "),
      // Only Baby Vambie goes straight into stories; the rest wait for review and art.
      status: isBaby && appearance ? "active" : "draft",
      importedFrom: `voot:${row.slug}`,
    },
  });
  console.log(`added  <${key}> ${row.name}${isBaby ? " (active, in every chapter)" : " (draft)"}`);
}

await prisma.$disconnect();
