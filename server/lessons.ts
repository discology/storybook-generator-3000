// "Teach Baby Vambie a lesson" (VSB-140): from the landing page, a grown-up
// types a lesson instead of a memory. It's saved as a typed memory answering
// LESSON_PROMPT, and wherever memories are shown to the AI, the Lesson stories
// rules go with it, so the planner, the page check and page revisions all know
// there's no event to stay true to.

export const LESSON_PROMPT = "What do you want to teach Baby Vambie?";

export const isLessonPrompt = (prompt: string | null | undefined) => prompt === LESSON_PROMPT;

// The Lesson stories block's default (Admin, AI instructions; VSB-147): the
// rules a lesson travels with. Chapters keep the version they were made with.
export const LESSON_STORY_KEY = "lesson_story";
export const DEFAULT_LESSON_STORY = `This one isn't a memory: it's a lesson the grown-up wants to teach, in their own words, and nothing in it happened yet. When a teacher's reply comes with it, build the story from that reply: it says what Baby Vambie should come to understand. Make up one small, ordinary scene from a young child's day (a snack to split, a tower that falls, a first morning somewhere new) where Baby Vambie meets this lesson and finds it out by doing. Bring in only who the scene needs: a friend, a sibling, or a grown-up from the family. A made-up friend or sibling gets a short, simple first name, never just "Friend"; a grown-up is called what a child calls them (Mama, Papa, Grandma). The teacher never appears in the story and is never named, and no real person is quoted. Because the scene is invented, the rule that the memories are the only source of facts doesn't apply to it; the voice, the reading level, the shot list and every other rule still do. Keep it to one place and a short stretch of time. Never say the lesson as a moral and never have a grown-up explain it: show it in what Baby Vambie does and feels, and let the last page land on a detail. If the grown-up's words hold a phrase worth keeping, it may come back once, said by a grown-up in the story. In interpretationNote, write "Made-up scene for a lesson" instead of listing the invented facts.`;

// What a lesson memory carries to the AI: the chapter's Lesson stories rules
// and, when a teacher replied (VSB-147), the reply and the lesson under it.
export interface LessonContext {
  rules: string;
  reply?: string;
  forGrownUps?: string;
}

// The lesson as the grown-up typed it after "I want to teach Baby Vambie…",
// as one sentence that reads well in their memories list.
export function lessonMemoryText(raw: string) {
  let text = raw.trim().replace(/^[.…\s]+/, "").replace(/\s+/g, " ").slice(0, 400);
  if (!text) return "";
  if (/^i want to teach\b/i.test(text)) text = `I${text.slice(1)}`;
  else if (/^(baby )?vambie\b/i.test(text)) text = `I want to teach ${text}`;
  else text = `I want to teach Baby Vambie ${/^I\b/.test(text) ? `that ${text}` : text[0].toLowerCase() + text.slice(1)}`;
  return /[.!?…"”]$/.test(text) ? text : `${text}.`;
}
