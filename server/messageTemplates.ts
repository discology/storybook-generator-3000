import { prisma } from "./db";

// The message types are fixed in code because the code decides when each one is
// sent; admins edit the wording (stored in MessageTemplate) and can turn a type off.
// Variables are written as <name> in a template body.

export interface MessageVariable {
  name: string;
  description: string;
  sample: string;
}

export interface MessageType {
  key: string;
  name: string;
  trigger: string;
  variables: MessageVariable[];
  defaultBody: string;
}

const v = {
  parentName: { name: "parent_name", description: "Name of the parent who started the storybook", sample: "Jordan" },
  childName: { name: "child_name", description: "Child's name or nickname", sample: "Mia" },
  storybookTitle: { name: "storybook_title", description: "Title of the storybook", sample: "Mia's Story" },
  storybookUrl: { name: "storybook_url", description: "Link to the storybook", sample: "https://vambie.app/s/ck29x" },
  recordUrl: { name: "record_url", description: "Link straight to recording a new memory", sample: "https://vambie.app/r/ck29x" },
  inviterName: { name: "inviter_name", description: "Name of the person sending the invite", sample: "Jordan" },
  relationship: { name: "relationship", description: "Invitee's relationship to the child", sample: "Grandparent" },
  inviteUrl: { name: "invite_url", description: "Link to accept the invitation", sample: "https://vambie.app/i/8f3a" },
  chapterTitle: { name: "chapter_title", description: "Title of the new chapter", sample: "The Walk Home" },
  chapterUrl: { name: "chapter_url", description: "Link to read the new chapter", sample: "https://vambie.app/c/ck31q" },
  senderName: { name: "sender_name", description: "Name of the person sending the chapter", sample: "Jordan" },
  note: { name: "note", description: "The sender's note, or empty", sample: "Grandma, this one's about your tomatoes." },
  memberName: { name: "member_name", description: "Name of the family member who joined or asked", sample: "June" },
  familyUrl: { name: "family_url", description: "Link to the Family page", sample: "https://vambie.app/f/ck29x" },
  reviewUrl: { name: "review_url", description: "Link to review the chapter's pages", sample: "https://vambie.app/p/ck31q" },
  exportUrl: { name: "export_url", description: "Link to the download", sample: "https://vambie.app/e/ck44z" },
  memoryUrl: { name: "memory_url", description: "Link to the memory", sample: "https://vambie.app/m/ck52a" },
} satisfies Record<string, MessageVariable>;

export const MESSAGE_TYPES: MessageType[] = [
  {
    key: "welcome",
    name: "Welcome",
    trigger: "Sent to the parent right after they create a storybook",
    variables: [v.parentName, v.childName, v.storybookTitle, v.storybookUrl, v.recordUrl],
    defaultBody:
      "Hi <parent_name>! <storybook_title> has begun. Whenever a moment with <child_name> is worth remembering, record it here: <record_url>",
  },
  {
    key: "invite",
    name: "Family invite",
    trigger: "Sent when someone invites a family member to contribute",
    variables: [v.inviterName, v.childName, v.relationship, v.storybookTitle, v.inviteUrl],
    defaultBody:
      "<inviter_name> invited you to help write <child_name>'s Vambie storybook. Join here: <invite_url>",
  },
  {
    key: "reminder",
    name: "Memory reminder",
    trigger: "Sent on the schedule each parent picks in Reminder settings",
    variables: [v.parentName, v.childName, v.storybookTitle, v.storybookUrl, v.recordUrl],
    defaultBody: "Hi <parent_name>, anything from this week with <child_name> worth keeping? Tap to record: <record_url>",
  },
  {
    key: "chapter_ready",
    name: "New chapter ready",
    trigger: "Sent to the family when a chapter is approved and published",
    variables: [v.childName, v.storybookTitle, v.chapterTitle, v.chapterUrl],
    defaultBody: "A new chapter of <storybook_title> is ready: \"<chapter_title>\". Read it here: <chapter_url>",
  },
  {
    key: "chapter_shared",
    name: "Chapter sent to you",
    trigger: "Sent to each family member a parent chooses in \"Send a little story\"",
    variables: [v.senderName, v.childName, v.storybookTitle, v.chapterTitle, v.chapterUrl, v.note],
    defaultBody: "<sender_name> sent you a chapter of <storybook_title>: \"<chapter_title>\". <note> Read it here: <chapter_url>",
  },
  {
    key: "member_joined",
    name: "Someone joined",
    trigger: "Sent to the parent when an invited family member joins",
    variables: [v.memberName, v.relationship, v.childName, v.storybookTitle, v.familyUrl],
    defaultBody: "<member_name> joined <storybook_title>. See your family: <family_url>",
  },
  {
    key: "review_ready",
    name: "Chapter ready for review",
    trigger: "Sent to the parent when the weekly chapter is drafted and waiting for page approval",
    variables: [v.parentName, v.childName, v.storybookTitle, v.chapterTitle, v.reviewUrl],
    defaultBody: "This week's chapter for <child_name> is ready for your review: \"<chapter_title>\". <review_url>",
  },
  {
    key: "export_ready",
    name: "Download ready",
    trigger: "Sent to the person who asked for a copy of their memories, when it's ready",
    variables: [v.storybookTitle, v.exportUrl],
    defaultBody: "Your copy of <storybook_title> is ready to download: <export_url>",
  },
  {
    key: "pictures_failed",
    name: "Pictures need another try",
    trigger: "Sent to the parent when a chapter's pictures finish with some not drawn",
    variables: [v.childName, v.storybookTitle, v.chapterTitle, v.reviewUrl],
    defaultBody: "Some pictures in \"<chapter_title>\" didn't finish. Give them another try here: <review_url>",
  },
  {
    key: "transcription_failed",
    name: "A memory couldn't be transcribed",
    trigger: "Sent to the person who recorded a memory when its words couldn't be made out",
    variables: [v.childName, v.storybookTitle, v.memoryUrl],
    defaultBody: "We couldn't make out the words in your memory for <storybook_title>. You can type them here: <memory_url>",
  },
  {
    key: "new_link_requested",
    name: "New invite link requested",
    trigger: "Sent to the parent when an invitee's link expired and they asked for a new one",
    variables: [v.memberName, v.childName, v.storybookTitle, v.familyUrl],
    defaultBody: "<member_name> asked for a fresh invitation link to <storybook_title>. Send one from Family: <family_url>",
  },
  {
    key: "story_ready",
    name: "Storybook ready",
    trigger: "Sent to someone who tried Vambie and saved their story while it was being made, once all its pictures are drawn",
    variables: [v.childName, v.storybookTitle, v.storybookUrl],
    defaultBody: "<child_name>'s storybook is ready! Read it here: <storybook_url>",
  },
];

export const getMessageType = (key: string) => MESSAGE_TYPES.find((t) => t.key === key);

const VARIABLE_PATTERN = /<([a-z][a-z0-9_]*)>/g;

// Returns any <variables> in the body that this type doesn't support; `extra`
// adds names allowed beyond the type's own (e.g. character keys).
export function findUnknownVariables(type: { variables: { name: string }[] }, body: string, extra: string[] = []): string[] {
  const allowed = new Set([...type.variables.map((x) => x.name), ...extra]);
  const found = [...body.matchAll(VARIABLE_PATTERN)].map((m) => m[1]);
  return [...new Set(found.filter((name) => !allowed.has(name)))];
}

export function fillTemplate(body: string, values: Record<string, string>): string {
  return body.replace(VARIABLE_PATTERN, (match, name) => values[name] ?? match);
}

export async function getTemplate(key: string) {
  const type = getMessageType(key);
  if (!type) throw new Error(`Unknown message type: ${key}`);
  const saved = await prisma.messageTemplate.findUnique({ where: { key } });
  return {
    ...type,
    body: saved?.body ?? type.defaultBody,
    enabled: saved?.enabled ?? true,
    isDefault: !saved || saved.body === type.defaultBody,
    updatedAt: saved?.updatedAt ?? null,
  };
}

// The text to send, or null when an admin has turned this message type off.
export async function renderMessage(key: string, values: Record<string, string>): Promise<string | null> {
  const template = await getTemplate(key);
  return template.enabled ? fillTemplate(template.body, values) : null;
}

// Links in texts must be absolute; APP_URL is the public address of the app.
export const appUrl = (path: string) => `${(process.env.APP_URL || "http://localhost:5174").replace(/\/$/, "")}${path}`;
