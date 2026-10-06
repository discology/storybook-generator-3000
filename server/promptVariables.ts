// Variables a prompt card's question and supporting text can use, filled in for
// the person recording ("…tell <child_name>…" → "…tell Mia…"). Plain functions
// with no server imports: the web app uses this file too.

export interface PromptVariable {
  name: string;
  label: string;
  description: string;
  sample: string; // what the card editor's preview shows
  neutral: string; // used where no family is known, like drawing card art
}

export const PROMPT_VARIABLES: PromptVariable[] = [
  { name: "child_name", label: "Child's name", description: "The child's name or nickname, as the family entered it", sample: "Mia", neutral: "the child" },
  { name: "child_age", label: "Child's age", description: "\"8 months old\", \"2 years old\", or \"on the way\" while expecting", sample: "2 years old", neutral: "young" },
  { name: "your_name", label: "Your name", description: "First name of the person recording", sample: "Rose", neutral: "you" },
  { name: "your_relationship", label: "Your relationship", description: "How the person recording is related to the child (\"grandparent\", \"auntie\")", sample: "grandparent", neutral: "family member" },
  { name: "parent_name", label: "Parent's name", description: "First name of the parent who started the storybook", sample: "Anna", neutral: "the parent" },
];

const PATTERN = /<([a-z][a-z0-9_]*)>/g;
// Anything that looks like a variable, so typos like <Child_Name> or <child name> are caught.
const LOOSE = /<([A-Za-z][\w ]{0,30})>/g;
const KNOWN = new Set(PROMPT_VARIABLES.map((v) => v.name));

// Variables in the text that cards don't support, like a misspelled <childname>.
export const unknownPromptVariables = (text: string | null | undefined) => [
  ...new Set([...(text ?? "").matchAll(LOOSE)].map((m) => m[1]).filter((name) => !KNOWN.has(name))),
];

export const fillPrompt = (text: string, values: Record<string, string>) => text.replace(PATTERN, (match, name) => values[name] ?? match);

export const samplePromptValues: Record<string, string> = Object.fromEntries(PROMPT_VARIABLES.map((v) => [v.name, v.sample]));
export const neutralPromptValues: Record<string, string> = Object.fromEntries(PROMPT_VARIABLES.map((v) => [v.name, v.neutral]));

// Splits text into plain parts and variables, for showing variables highlighted.
export const promptParts = (text: string) =>
  text.split(/(<[A-Za-z][\w ]{0,30}>)/g).filter(Boolean).map((part) => {
    const name = part.match(/^<([A-Za-z][\w ]{0,30})>$/)?.[1];
    return name ? { variable: name, known: KNOWN.has(name), text: part } : { variable: null, known: true, text: part };
  });

// Family titles that belong with the name ("Grandma Rose", not "Grandma").
const TITLES = new Set(["grandma", "grandpa", "granny", "grandad", "granddad", "nana", "papa", "nanna", "auntie", "aunt", "uncle", "nonna", "nonno", "abuela", "abuelo", "mama", "dada"]);
export function firstName(name: string | null | undefined) {
  // Some people have only their phone number as a name; that's not a name to show.
  if (/^\+?[\d\s().-]+$/.test((name ?? "").trim())) return "";
  const words = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  return TITLES.has(words[0].toLowerCase()) && words[1] ? `${words[0]} ${words[1]}` : words[0];
}

// The child's age in words. Birth dates are calendar dates stored at UTC midnight.
export function childAgeWords(child: { stage: string; birthDate: string | Date | null }, now = new Date()) {
  if (child.stage === "expecting") return "on the way";
  if (!child.birthDate) return "young";
  const birth = new Date(child.birthDate);
  if (Number.isNaN(birth.getTime())) return "young";
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.floor((today - birth.getTime()) / 86_400_000);
  if (days < 0) return "young";
  if (days < 14) return days <= 1 ? "a day old" : `${days} days old`;
  let months = (now.getFullYear() - birth.getUTCFullYear()) * 12 + (now.getMonth() - birth.getUTCMonth());
  if (now.getDate() < birth.getUTCDate()) months -= 1;
  if (months < 1) return `${Math.floor(days / 7)} weeks old`;
  if (months < 24) return months === 1 ? "1 month old" : `${months} months old`;
  return `${Math.floor(months / 12)} years old`;
}

// The values for one person recording in one storybook.
export function promptValues(input: {
  child: { displayName: string; stage: string; birthDate: string | Date | null };
  me: { name: string; relationship: string | null };
  parentName: string | null;
}, now = new Date()): Record<string, string> {
  const relationship = input.me.relationship && input.me.relationship !== "Other" ? input.me.relationship.toLowerCase() : "family member";
  return {
    child_name: input.child.displayName.trim() || "your little one",
    child_age: childAgeWords(input.child, now),
    your_name: firstName(input.me.name) || "you",
    your_relationship: relationship,
    parent_name: firstName(input.parentName) || "their parent",
  };
}
