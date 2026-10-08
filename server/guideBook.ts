import { prisma } from "./db";

// The Guide Book (VSB-102): the rules a good Vambie storybook follows, in
// numbered sections. The prompts stay where they are (Page Rules, AI
// instructions, the Character Library); each rule says where it's enforced, and
// flags are analyzed against it (VSB-103). Each save is a new version.

export interface GuideRule {
  id: string; // e.g. "P-2": section letter and number, never reused
  section: string; // V | W | P | C | S
  title: string;
  rule: string;
  why: string;
  good: string;
  bad: string;
  enforcedIn: string[]; // keys of ENFORCEMENT_TARGETS
}

export const GUIDE_SECTIONS: Record<string, string> = {
  V: "Voice",
  W: "World",
  P: "Pictures",
  C: "Characters",
  S: "Safety and privacy",
};

// Where a rule lives in the app, so a suggested fix can name the exact place.
export const ENFORCEMENT_TARGETS: Record<string, string> = {
  "page_rules.illustrationStyle": "Page Rules: Art style",
  "page_rules.peopleStyle": "Page Rules: How people are drawn",
  "page_rules.pictureDirection": "Page Rules: Camera and acting",
  "page_rules.shotRules": "Page Rules: Shot list",
  "page_rules.readingProfiles": "Page Rules: Reading stages",
  "page_rules.embellishment": "Page Rules: Embellishment",
  "instruction.world": "AI instruction: The Vambie world",
  "instruction.page_plan": "AI instruction: Plan pages",
  "instruction.page_check": "AI instruction: Check pages",
  "instruction.illustration_check": "AI instruction: Check illustration",
  "instruction.guardian": "AI instruction: Guardian review",
  characters: "Character Library",
  family_designs: "Family character designs",
  code: "App code (needs a developer)",
};

const r = (id: string, title: string, rule: string, why: string, good: string, bad: string, enforcedIn: string[]): GuideRule => ({
  id,
  section: id.split("-")[0],
  title,
  rule,
  why,
  good,
  bad,
  enforcedIn,
});

// Version 1, drafted from the Vambie world bible, the voice rules and stage
// voices, the art direction, camera and acting, the people rule, the Character
// Library and what testing taught us (Oct 2026). The team edits from here.
export const DEFAULT_GUIDE: GuideRule[] = [
  r("V-1", "Facts are fixed, texture is free", "Who was there, what happened, where, and how it ended stay exactly as the memory tells them. Light, weather, sound, smell, refrains and the inner weather of a feeling are free.", "Families trust the book because it's their memory; texture is what makes it a story.", "\"The kitchen smelled like toast and rain.\"", "Adding a trip to the park the memory never mentioned.", ["instruction.page_plan", "instruction.page_check", "page_rules.embellishment"]),
  r("V-2", "Read aloud, not reported", "Write like a picture book read aloud at bedtime: short sentences, present tense or close past, specific and concrete. Say less than you could.", "These books are read to children; reports put them to sleep the wrong way.", "\"The slide is tall. Baby Vambie is small. Up, up, up it goes anyway.\"", "\"Baby Vambie went to the playground and felt happy about the slide.\"", ["instruction.page_plan", "instruction.world"]),
  r("V-3", "Never name the lesson", "Put the meaning in a detail, a refrain or a strange little joke that is kind. No morals.", "A named lesson turns a memory into a lecture.", "A refrain that comes back changed on the last page.", "\"And Baby Vambie learned that it's okay to be scared.\"", ["instruction.page_plan", "instruction.world"]),
  r("V-4", "Not a poster, not therapy copy", "Never sound like a motivational poster, therapy copy, a greeting card or a cartoon mascot. Never \"best version of yourself\", \"eliminate\", or \"your worry doesn't define you\".", "The Vambie voice is absurd and tender, deadpan and sincere.", "\"The worried part made a plan. Nobody asked it to.\"", "\"You are stronger than your fears!\"", ["instruction.world"]),
  r("V-5", "Family names the way the child says them", "Family members are called what the child calls them: Mama, Papa, Grandma, or their aliases. Never \"the mother\", and never a grown-up's first name unless the child uses it.", "It's the child's book, in the child's words.", "\"Mama holds on. And holds on.\"", "\"Anna picked up the pillow.\" (when the child says Mama)", ["instruction.page_plan"]),
  r("V-6", "Feelings are honest and allowed to stay", "The story sits beside a feeling; it never fixes it, cheers it up or explains it away. Two feelings can live at once, and a feeling may still be there on the last page.", "Children learn their feelings are allowed, not problems to solve.", "\"Scared and a little bit proud.\"", "\"Then the sad went away and everyone was happy!\"", ["instruction.page_plan", "instruction.world"]),
  r("V-7", "Endings stay a little open", "Someone understands someone a little better; life continues; some mess remains. Never end on a moral.", "Real days don't tie up neatly, and Vambie endings don't either.", "\"They still didn't know what they were doing. They went together anyway.\"", "\"And they all lived happily ever after.\"", ["instruction.page_plan", "instruction.world"]),
  r("V-8", "Each reading stage has its own voice", "Read to me: 8 to 15 words a page, sound words, a pattern or refrain that comes back changed, the shortest page last. Picture book: 20 to 35 words, rhythm, two feelings at once. Early reader and up: parts begin; Baby Vambie asks a feeling one question.", "A page that's right for a five-year-old is wrong for a baby, and the reverse.", "\"Thump-thump goes my heart.\" (Read to me)", "A four-word caption on a Read to me page, or parts language for a toddler.", ["page_rules.readingProfiles", "instruction.page_plan"]),
  r("V-9", "Humor punches sideways", "Jokes are kind: sideways or inward, never at the child or at whoever is hurting. One dry, deadpan line is welcome from Chapter book up.", "A family book can't make fun of the family.", "A tune from somewhere that nobody admits to humming.", "A joke about the child's tantrum.", ["instruction.world", "instruction.page_plan"]),
  r("V-10", "Real picture-book titles", "Two to six words with a concrete image in them, ideally a phrase from the memory itself. Never \"Baby Vambie and the…\", and not a body part or a piece of furniture.", "The title is the first thing a family reads aloud.", "\"The Tomato Mornings\"", "\"Baby Vambie and the Big Day\"", ["instruction.page_plan"]),
  r("W-1", "You already are enough", "Never imply that a child must be fixed, finished or improved. Changing is remembering what was already true.", "It's the central truth of the Vambie world.", "Baby Vambie stays with a feeling until it's ready.", "\"Baby Vambie learned to be braver.\"", ["instruction.world", "instruction.guardian"]),
  r("W-2", "Baby Vambie witnesses, understands, stays", "Baby Vambie is not a helper, teacher or fixer. It sits beside a feeling, notices why it came, and lets a sad feeling keep its dignity.", "That presence is what Baby Vambie is for.", "\"Baby Vambie sat down next to it anyway.\"", "\"Baby Vambie showed her how to stop crying.\"", ["instruction.world", "characters"]),
  r("W-3", "The band is background unless cast", "Sunset, Tiggs, Gene and Vared appear in person only when cast; otherwise the world shows as texture: a drum like a heartbeat, a hat going by.", "The family's memory is the story, not the band.", "A tune from somewhere.", "Gene arriving to solve the problem.", ["instruction.world", "characters"]),
  r("W-4", "Grown-up Vambie stays out", "No profanity, the bite, Dan and his company, the Vambie Office of Transformation and its notices, cult-like edges, or romance.", "Those belong to the grown-up Vambie world, not a child's book.", "", "An official notice from the Office of Transformation.", ["instruction.world", "instruction.guardian"]),
  r("P-1", "One art direction", "Pen-and-ink line with fine cross-hatching and transparent watercolor washes, on warm cream paper. A muted, earthy palette in which the Vambies' signature colors (Baby Vambie's aqua) are the only clear, bright notes. No 3D shading, glossy surfaces or smooth gradients.", "Every page has to look like the same book.", "Ink first, wash second, aqua the brightest thing on the page.", "A glossy 3D-rendered Baby Vambie pasted onto a painted room.", ["page_rules.illustrationStyle", "characters"]),
  r("P-2", "Follow the planned camera", "A close-up fills the frame with a face, hands or an object and crops boldly; an extreme close-up shows only the focus; a wide shot makes the characters small in their world; a low angle looks up and a bird's-eye view looks straight down.", "The camera carries the feeling: close for big moments, wide for where we are.", "A close-up of two faces, cropped at the shoulders, as Baby Vambie says \"no\".", "A \"close-up\" that shows everyone full-body in the middle of the room.", ["page_rules.pictureDirection", "code"]),
  r("P-3", "Compose like a film still", "Place the subject off-center, with something in the foreground, depth behind, and room where the feeling needs it. Never line the characters up in the middle facing the viewer.", "Centered, front-facing pictures all look the same.", "Grandma's shoulder blurred in the foreground, Baby Vambie small by the window.", "Two characters standing side by side, centered, looking at us.", ["page_rules.pictureDirection"]),
  r("P-4", "Catch the moment mid-movement", "Leaning, reaching, turning, mid-step. Quiet moments can be still, but never stiff or posed.", "Movement is what makes a picture feel alive.", "Toes lifting off the rug as Baby Vambie leans in.", "Baby Vambie standing straight with arms at its sides on every page.", ["page_rules.pictureDirection", "instruction.page_plan"]),
  r("P-5", "Feelings show on faces and bodies", "Eyes, brows and mouth change with the mood, and shoulders and posture follow. Baby Vambie uses its expression set for the page's mood.", "The same neutral face on every page reads as no feeling at all.", "Eyes squeezed shut laughing; a wobbly mouth before tears.", "The same wide-eyed neutral face on every page.", ["page_rules.pictureDirection", "characters"]),
  r("P-6", "Vary what each picture is about", "A face, two people's hands, an important object, the place, someone's reaction. Not every page centers on Baby Vambie, and two pages in a row about the same subject change viewpoint, not only distance.", "Variety is what makes a book worth turning pages in.", "Page 3 on Grandma's hands, page 4 on the seed, page 5 wide on the garden.", "Five pages of the same two characters at the same distance.", ["instruction.page_plan"]),
  r("P-7", "Continuity: states, outfits and objects", "Outfits, objects and states (eyes shut or open, asleep, swaddled, wet or dry, held or put down) stay right across pages, and nothing changes before the memory says it does.", "A newborn with open eyes before the memory's \"first look\" breaks the story.", "Curled, swaddled and eyes shut until the page where the eyes open.", "Eyes already open on page 1 of a \"first look\" memory.", ["instruction.page_plan", "instruction.page_check", "instruction.illustration_check"]),
  r("P-8", "No words in pictures", "No letters, numbers, captions or signs anywhere in an illustration.", "The words belong under the picture, where they can be read aloud.", "", "A sign on the door that says \"Mia's room\".", ["page_rules.illustrationStyle", "instruction.illustration_check"]),
  r("P-9", "Faces clear of the edges on full pages", "On tall full-page and wordless pictures, keep faces away from the very edges: phones may trim them.", "A cropped face on the phone reader ruins the biggest moment.", "", "A face cut in half at the edge of the phone screen.", ["code"]),
  r("P-10", "Shots that don't work on a Vambie", "The camera never goes below waist height; no close-ups on feet or legs; a low angle keeps the whole head in frame; one focus per shot; the shot type is exactly one of the allowed types in the Shot list.", "A huge head on tiny legs distorts from below, and a feet-first frame reads as extra feet.", "A low angle from waist height, Baby Vambie's whole head in frame, one eye the focus.", "A low close-up at ankle height on Baby Vambie's feet and one eye.", ["page_rules.shotRules", "code"]),
  r("C-1", "Baby Vambie is always the child", "The child is never drawn as themselves. Whatever the child did, said or felt, Baby Vambie does, says and feels, in the words and the pictures.", "No picture of a real child is ever made, and every child can see themselves in Baby Vambie.", "Baby Vambie reaching for the bottle.", "A human toddler beside Baby Vambie.", ["instruction.page_plan", "instruction.world", "characters"]),
  r("C-2", "Baby Vambie stays on-model", "Teal-blue, an oversized rounded head, huge round eyes, tiny fangs, a simple body and limbs. Smooth skin: no spikes, horns, wings or tail. Never a generic monster, alien or cartoon creature.", "Baby Vambie is the brand.", "", "A green alien with antennae.", ["characters"]),
  r("C-3", "Everyone else is a Vambie in their own skin tone", "Every person has Baby Vambie's creature design (big ringed eyes, tiny fangs, big head on a small body) in their own skin tone, recognizable by hair, glasses, clothes and accessories. Pale gray-white when the skin tone isn't known. Teal-blue belongs to Baby Vambie alone.", "The whole book is the Vambie world, and every family sees itself in it.", "Grandma Rose with warm brown skin, silver curls and her tortoiseshell glasses.", "Papa drawn teal like Baby Vambie, or as a human.", ["page_rules.peopleStyle", "family_designs"]),
  r("C-4", "Pets keep their coat", "Pets and other animals keep their own body, coat and markings and stand the way that animal does, with the Vambie eyes and tiny fangs.", "The family dog should look like their dog.", "Savi on all fours in her russet-and-cream coat with Vambie eyes.", "The dog standing on two legs like a person.", ["page_rules.peopleStyle", "family_designs"]),
  r("C-5", "Family members match their approved look", "Skin tone, hair, build, and signature glasses or accessories match the approved design on every page; expression, pose and scene clothing can change. A look approved as a person stays a person until the family redraws it.", "Families notice immediately when Grandma isn't Grandma.", "", "Grandma's glasses missing on page 4.", ["instruction.illustration_check", "family_designs"]),
  r("C-6", "Cast members keep their locked looks", "The band and other named Vambies appear only when cast and keep their card's look: no new clothing, hats or accessories (props they hold are fine).", "Recurring characters have to be recognizable across every family's books.", "Gene in his yellow beanie and purple jacket.", "Gene in a new red cap.", ["characters", "instruction.page_plan"]),
  r("S-1", "Private details stay out", "Nothing a family member would be uncomfortable seeing in a shared book: adult conflicts, health, money, or other people's private matters.", "Books get shared with grandparents and read for years.", "", "A page about the parents' argument.", ["instruction.guardian"]),
  r("S-2", "Right for the reader's stage", "No frightening images or ideas beyond what the reading stage can hold; big feelings are welcome, threats and gore aren't.", "A bedtime book has to be safe to read at bedtime.", "", "A shadowy monster in the closet for a Read to me chapter.", ["instruction.guardian", "page_rules.readingProfiles"]),
];

export interface GuideVersion {
  version: number;
  rules: GuideRule[];
  note: string;
  createdAt: Date | null;
}

export async function getGuide(): Promise<GuideVersion> {
  const latest = await prisma.guideBook.findFirst({ orderBy: { version: "desc" } });
  if (!latest) return { version: 0, rules: DEFAULT_GUIDE, note: "Draft v1 (not saved yet)", createdAt: null };
  return { version: latest.version, rules: JSON.parse(latest.rules), note: latest.note, createdAt: latest.createdAt };
}

export function validateGuide(rules: unknown): string | null {
  if (!Array.isArray(rules) || rules.length === 0) return "The Guide Book needs at least one rule.";
  const ids = new Set<string>();
  for (const x of rules as GuideRule[]) {
    if (!x || typeof x !== "object") return "A rule is missing.";
    if (!/^[A-Z]-\d+$/.test(x.id ?? "")) return `"${x.id}" isn't a rule number like P-3.`;
    if (!(x.section in GUIDE_SECTIONS) || x.id.split("-")[0] !== x.section) return `${x.id}: the section doesn't match the number.`;
    if (ids.has(x.id)) return `${x.id} is used twice.`;
    ids.add(x.id);
    if (!String(x.title ?? "").trim() || !String(x.rule ?? "").trim()) return `${x.id}: a rule needs a title and the rule itself.`;
    if (!Array.isArray(x.enforcedIn) || x.enforcedIn.some((t) => !(t in ENFORCEMENT_TARGETS))) return `${x.id}: unknown "where it's enforced".`;
  }
  return null;
}

export async function saveGuide(rules: GuideRule[], note: string, userId: string | null) {
  const { version } = await getGuide();
  const clean = rules.map((x) => ({
    id: x.id,
    section: x.section,
    title: String(x.title).trim(),
    rule: String(x.rule).trim(),
    why: String(x.why ?? "").trim(),
    good: String(x.good ?? "").trim(),
    bad: String(x.bad ?? "").trim(),
    enforcedIn: x.enforcedIn,
  }));
  return prisma.guideBook.create({ data: { version: version + 1, rules: JSON.stringify(clean), note: note.trim().slice(0, 500), createdById: userId } });
}

// The Guide Book as text, for the analysis prompt.
export const describeGuide = (rules: GuideRule[]) =>
  Object.entries(GUIDE_SECTIONS)
    .map(([key, name]) => {
      const inSection = rules.filter((x) => x.section === key);
      if (!inSection.length) return "";
      return `${name}\n${inSection
        .map((x) => `${x.id} ${x.title}: ${x.rule}${x.bad ? ` (Not like: ${x.bad})` : ""} [Enforced in: ${x.enforcedIn.map((t) => ENFORCEMENT_TARGETS[t] ?? t).join("; ")}]`)
        .join("\n")}`;
    })
    .filter(Boolean)
    .join("\n\n");
