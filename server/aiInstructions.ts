import { prisma } from "./db";
import type { MessageVariable } from "./messageTemplates";

// The AI steps are fixed in code because the code decides when each runs and reads
// its reply. Admins edit the instructions (stored in AiInstruction); the reply
// format is appended by the code and can't be edited, since the app parses it.

export interface AiStep {
  key: string;
  name: string;
  trigger: string;
  variables: MessageVariable[];
  defaultBody: string;
  outputFormat: string;
}

export const AI_STEPS: AiStep[] = [
  {
    key: "interpret",
    name: "Interpret memory",
    trigger: "Runs after a voice memory is transcribed, to pull out what happened and how it felt",
    variables: [
      {
        name: "transcript",
        description: "What the parent said in the recording",
        sample:
          "Today Mia didn't want to leave the playground. She cried the whole walk home, and I felt frustrated and then guilty. Later she asked me if I was still mad, and we hugged.",
      },
    ],
    defaultBody: `A parent recorded this memory about their child:

"<transcript>"

Fill in:
- events: what happened, in one sentence
- emotions: comma-separated emotions present, the parent's and the child's
- themes: comma-separated possible relational or emotional themes

Do not diagnose anyone or state things the parent didn't say. If something is uncertain, phrase it as "may have been about X" rather than asserting it.`,
    outputFormat: `Respond with ONLY a JSON object, no markdown fences, with exactly these string fields: {"events": "...", "emotions": "...", "themes": "..."}`,
  },
  {
    key: "page_plan",
    name: "Plan pages",
    trigger: "Runs when a chapter is created (and when a reviewer asks for a full rewrite) to divide it into illustrated pages",
    variables: [
      { name: "child_name", description: "Child's name or nickname", sample: "Mia" },
      { name: "reading_level", description: "The reading profile: vocabulary, page count and word limits", sample: "A little more adventure · Ages 4-7. Simple, warm words an early reader can sound out; name feelings directly. Use 6-8 pages. Each page's text: at most 40 words, and no sentence longer than 12 words." },
      { name: "embellishment_rules", description: "How much fictional storytelling is allowed (set in Page Rules)", sample: "Baby Vambie is the fictional stand-in for the child and may add small actions, sounds and short lines of dialogue that fit the memory's feelings. Never add events, people, places or outcomes that aren't in the memory." },
      { name: "memories", description: "The approved memories: what happened, emotions, themes and the original account", sample: "Memory 1:\nWhat happened: Grandma taught Mia to plant tomatoes; Mia checked every morning until the first sprout appeared.\nEmotions present: patience, excitement, pride\nPossible themes: waiting, grandparent bond, growth\nOriginal account: \"Grandma taught me to plant tomatoes. I checked every morning until the first sprout appeared.\"" },
      { name: "previous_chapters", description: "Titles of the chapters already in the storybook", sample: "Bath Time Splash" },
      { name: "revision_request", description: "A reviewer's revision note, or empty on a first draft", sample: "" },
    ],
    defaultBody: `You are the Storyteller for Storybook Generator 3000. Turn a real family memory into the next illustrated chapter of <child_name>'s Vambie storybook, planned page by page.

Reading level: <reading_level>
Earlier chapters: <previous_chapters>

Source material
- The memories below are the only factual source. Keep family facts (who, what, where, outcome) exactly as told.
- Baby Vambie (teal-blue, round head, big eyes, tiny fangs) is the fictional stand-in for <child_name>: whatever <child_name> did, said or felt, Baby Vambie does, says and feels, in both the pictures and the text. Never include <child_name> as a separate human character. Other family members appear as themselves.
- Baby Vambie feels its feelings honestly; the story sits beside them rather than fixing them. Don't invent other named Vambie characters.
- Fictional storytelling allowed: <embellishment_rules>
- On every page, say in interpretationNote what is fictional or interpreted, so it is never presented as verified family history.

Chapter structure
- Organize the story into an opening, development, a meaningful moment, and an ending. Let the page count follow the story within the reading level's range.
- Preserve the emotional truth; don't sanitize it into "and everyone was happy". Don't moralize. Mixed feelings can coexist; no one is the villain.

Page boundaries
- Each page shows one main action or emotional moment.
- Start a new page when the location, time, or central action changes.

Scene and continuity
- For each page, describe the characters present, the setting, the visible action, the emotional tone and important objects.
- List every character once in "characters" with a fixed appearance and outfit, and reuse it on every page. Keep clothing, objects and setting details the same across connected scenes, and say what must carry over in "continuity".

Shot list
- Plan every page's camera like a picture-book illustrator: the shot type (wide establishing, medium, close-up, extreme close-up, over-the-shoulder, bird's-eye or low angle), the camera angle, and the one thing the picture focuses on.
- Open with a wide establishing shot that shows where we are. Use close-ups for the most emotional moments and for important small objects.
- Never use the same shot type on two pages in a row. When the setting stays the same, show it from a new viewpoint or distance instead of repeating the view.

Bottom-of-page text
- Write the exact narration or dialogue shown beneath that page's illustration. It must match what the picture shows, complement rather than repeat it, and never describe events that belong to another page.

<memories>

<revision_request>`,
    outputFormat: `Respond with ONLY a JSON object, no markdown fences, in this shape: {"title": "chapter title", "characters": [{"name": "...", "appearance": "fixed look and outfit, reused on every page"}], "pages": [{"storyMoment": "...", "characters": ["names from the characters list"], "setting": "...", "visibleAction": "...", "emotionalTone": "...", "continuity": "what must match neighboring pages", "shot": {"type": "wide establishing | medium | close-up | extreme close-up | over-the-shoulder | bird's-eye | low angle", "angle": "e.g. eye level, from behind Grandma", "focus": "the one thing the picture centers on"}, "text": "exact words shown beneath the illustration", "sourceMemory": 1, "sourceQuote": "the words from the memory this page draws on, or empty", "interpretationNote": "what on this page is fictional or interpreted"}]}`,
  },
  {
    key: "page_check",
    name: "Check pages",
    trigger: "Runs after pages are planned or edited, before the draft is shown, to check source fidelity, continuity and scene/text alignment",
    variables: [
      { name: "child_name", description: "Child's name or nickname", sample: "Mia" },
      { name: "reading_level", description: "The reading profile: vocabulary, page count and word limits", sample: "A little more adventure · Ages 4-7. Simple, warm words an early reader can sound out; name feelings directly. Use 6-8 pages. Each page's text: at most 40 words, and no sentence longer than 12 words." },
      { name: "embellishment_rules", description: "How much fictional storytelling is allowed", sample: "Baby Vambie is the fictional stand-in for the child and may add small actions, sounds and short lines of dialogue that fit the memory's feelings. Never add events, people, places or outcomes that aren't in the memory." },
      { name: "memories", description: "The approved memories the chapter is based on", sample: "Memory 1:\nWhat happened: Grandma taught Mia to plant tomatoes; Mia checked every morning until the first sprout appeared.\nEmotions present: patience, excitement, pride\nPossible themes: waiting, grandparent bond, growth\nOriginal account: \"Grandma taught me to plant tomatoes. I checked every morning until the first sprout appeared.\"" },
      { name: "characters", description: "The chapter's character list with fixed appearances", sample: "Baby Vambie: small round teal-blue creature, big eyes, tiny fangs, wearing a yellow sun hat\nGrandma: silver hair in a bun, round glasses, yellow cardigan, green garden gloves" },
      {
        name: "pages",
        description: "Every page's plan and exact text",
        sample: "Page 1\nStory moment: Grandma shows Baby Vambie the empty garden bed.\nCharacters: Baby Vambie, Grandma\nSetting: Grandma's garden, morning\nVisible action: Grandma kneels, pressing a seed into the soil; Baby Vambie watches.\nText: \"Grandma pressed a tiny seed into the soil. 'Now we wait,' she said.\"\n\nPage 2\nStory moment: Baby Vambie checks the soil every morning.\nCharacters: Baby Vambie\nSetting: the same garden bed, morning\nVisible action: Baby Vambie peers at bare soil.\nText: \"Every morning, Vambie checked. Nothing yet. Then one day, a sprout! Grandma cheered.\"",
      },
      { name: "pages_to_check", description: "Which page numbers to report on", sample: "1, 2" },
    ],
    defaultBody: `You are the Story Guardian checking a planned storybook chapter, page by page, before a parent sees the draft.

Reading level: <reading_level>
Fictional storytelling allowed: <embellishment_rules>

Source memories:
<memories>

Characters:
<characters>

Pages:
<pages>

For pages <pages_to_check>, flag a page if:
- its text contradicts its scene: the text mentions a character, action or important object the scene doesn't show, or describes it differently. (A character who is visible but not mentioned in the text is fine: the text should complement the picture, not narrate it.);
- its text describes events that belong to another page;
- it adds facts, people, places or outcomes not in the memories, beyond the fictional storytelling allowed;
- it breaks continuity with neighboring pages (outfits, objects, setting, time of day);
- <child_name> appears as a human character instead of being shown as Baby Vambie;
- its shot doesn't suit the moment (for example, a key emotional moment or a tiny important object shown only from far away);
- an interpretation is uncertain and should be confirmed by the parent.
Otherwise mark it ok. Keep each note to one sentence a parent can act on.`,
    outputFormat: `Respond with ONLY a JSON object, no markdown fences: {"pages": [{"pageNumber": 1, "status": "ok" | "flagged", "note": "one sentence; empty if ok"}]} with one entry per page you were asked to check.`,
  },
  {
    key: "page_revise",
    name: "Revise page",
    trigger: "Runs when a parent asks to revise a single page's story moment",
    variables: [
      { name: "reading_level", description: "The reading profile: vocabulary and word limits", sample: "A little more adventure · Ages 4-7. Simple, warm words an early reader can sound out; name feelings directly. Use 6-8 pages. Each page's text: at most 40 words, and no sentence longer than 12 words." },
      { name: "embellishment_rules", description: "How much fictional storytelling is allowed", sample: "Baby Vambie is the fictional stand-in for the child and may add small actions, sounds and short lines of dialogue that fit the memory's feelings. Never add events, people, places or outcomes that aren't in the memory." },
      { name: "memories", description: "The approved memories the chapter is based on", sample: "Memory 1:\nWhat happened: Grandma taught Mia to plant tomatoes; Mia checked every morning until the first sprout appeared.\nEmotions present: patience, excitement, pride\nPossible themes: waiting, grandparent bond, growth\nOriginal account: \"Grandma taught me to plant tomatoes. I checked every morning until the first sprout appeared.\"" },
      { name: "characters", description: "The chapter's character list with fixed appearances", sample: "Baby Vambie: small round teal-blue creature, big eyes, tiny fangs, wearing a yellow sun hat\nGrandma: silver hair in a bun, round glasses, yellow cardigan, green garden gloves" },
      { name: "page_number", description: "The page being revised", sample: "3" },
      { name: "current_page", description: "The page's current plan and text", sample: "Story moment: Baby Vambie discovers the first sprout.\nVisible action: Baby Vambie crouches beside a tiny green sprout; Grandma kneels nearby.\nText: \"Every morning, Vambie checked the little patch of earth. Then one day, hello! A tiny green sprout peeked out.\"" },
      { name: "previous_page", description: "The page before, for continuity (or none)", sample: "Page 2: Baby Vambie checks the bare soil each morning, wearing the yellow sun hat." },
      { name: "next_page", description: "The page after, for continuity (or none)", sample: "Page 4: Grandma and Baby Vambie water the sprout together." },
      { name: "revision_request", description: "What the parent asked to change", sample: "Grandma should be the one who spots it first." },
    ],
    defaultBody: `You are revising one page of an illustrated storybook chapter.

Reading level: <reading_level>
Fictional storytelling allowed: <embellishment_rules>

Source memories:
<memories>

Characters (keep these appearances):
<characters>

Previous page: <previous_page>
Page <page_number> now:
<current_page>
Next page: <next_page>

The parent asked: "<revision_request>"

Rewrite page <page_number> to make that change. Keep it one main action or emotional moment, keep it consistent with the previous and next pages, keep family facts as told, and make sure the scene and the exact text agree. Choose a camera shot that suits the moment and differs from the shot type of the previous and next pages.`,
    outputFormat: `Respond with ONLY a JSON object, no markdown fences, for the single revised page: {"storyMoment": "...", "characters": ["..."], "setting": "...", "visibleAction": "...", "emotionalTone": "...", "continuity": "...", "shot": {"type": "...", "angle": "...", "focus": "..."}, "text": "exact words shown beneath the illustration", "sourceMemory": 1, "sourceQuote": "...", "interpretationNote": "..."}`,
  },
  {
    key: "illustration_check",
    name: "Check illustration",
    trigger: "Runs on each new illustration (the image is attached) to confirm it matches the page",
    variables: [
      { name: "page_text", description: "The exact text shown beneath the illustration", sample: "Every morning, Vambie checked the little patch of earth. Then one day, hello! A tiny green sprout peeked out." },
      { name: "visible_action", description: "What the scene plan says should be visible", sample: "Baby Vambie crouches beside a tiny green sprout; Grandma kneels nearby holding a red watering can." },
      { name: "characters", description: "Who should appear, with their fixed appearances", sample: "Baby Vambie: small round teal-blue creature, big eyes, tiny fangs, wearing a yellow sun hat\nGrandma: silver hair in a bun, round glasses, yellow cardigan, green garden gloves" },
    ],
    defaultBody: `Look at the attached storybook illustration.

It should show: <visible_action>
Characters who should appear:
<characters>
The book will print this text on the page below the picture (it is NOT part of the image, so don't look for it): "<page_text>"

Flag it if:
- a character, action or important object from the scene plan or the text is missing or contradicted in the picture;
- a character looks clearly different from their description;
- the picture itself contains any written words, letters or captions (it shouldn't).
Small artistic differences are fine.`,
    outputFormat: `Respond with ONLY a JSON object, no markdown fences: {"status": "ok" | "flagged", "note": "one sentence; empty if ok"}`,
  },
  {
    key: "guardian",
    name: "Guardian review",
    trigger: "Runs on every new chapter before it can be approved",
    variables: [
      {
        name: "reader_level",
        description: "Reading-level guidance for the storybook's age band",
        sample: "Early reader: simple sentences, warm and playful, can name feelings directly.",
      },
      {
        name: "previous_chapters",
        description: "Titles of the chapters already in the storybook",
        sample: "The Walk Home, Bath Time Splash",
      },
      {
        name: "chapter_text",
        description: "The draft chapter being reviewed",
        sample:
          "Mia did not want to leave the playground. Her feet felt heavy. Baby Vambie sat close and saw the sad feeling sit beside her.\n\nLater, Mia asked, \"Are you still mad?\" Then they hugged, and the love was there too.",
      },
    ],
    defaultBody: `You are the Story Guardian for Storybook Generator 3000. Review this draft chapter before it can be approved for a child's storybook.

Reader level: <reader_level>
Previous chapter titles (for continuity only — do not invent plot you haven't seen): <previous_chapters>

Chapter draft:
"""
<chapter_text>
"""

Check exactly these three things:
1. continuity — does anything in this chapter contradict what the previous chapter titles imply, without it being an intentional, shown moment of growth?
2. reader_fit — is the language, sentence length and emotional complexity appropriate for the stated reader level?
3. private_details — does the chapter contain adult-only specifics (names of adult conflicts, inappropriate detail) that shouldn't be in a children's story?

For each, give a status of "ok" or "needs_revision" and a one-sentence note.`,
    outputFormat: `Respond with ONLY a JSON object, no markdown fences, in this shape: {"findings": [{"category": "continuity", "status": "ok" | "needs_revision", "note": "..."}, ...]} with exactly 3 findings for continuity, reader_fit, private_details in that order.`,
  },
];

export const getAiStep = (key: string) => AI_STEPS.find((s) => s.key === key);

export async function getAiInstruction(key: string) {
  const step = getAiStep(key);
  if (!step) throw new Error(`Unknown AI step: ${key}`);
  const saved = await prisma.aiInstruction.findUnique({ where: { key } });
  return {
    ...step,
    body: saved?.body ?? step.defaultBody,
    model: saved?.model ?? null,
    isDefault: !saved || (saved.body === step.defaultBody && !saved.model),
    updatedAt: saved?.updatedAt ?? null,
  };
}
