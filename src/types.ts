export interface Child {
  id: string;
  householdId: string;
  displayName: string;
  stage: string;
  birthDate: string | null;
  dueDate: string | null;
}

export interface Contributor {
  id: string;
  name: string;
  relationship: string | null;
  role?: string;
  inviteStatus?: string;
  userId?: string | null;
}

export interface TranscriptVersion {
  id: string;
  source: "machine" | "corrected";
  text: string;
  createdAt: string;
}

export interface MemoryInterpretation {
  id: string;
  events: string | null;
  emotions: string | null;
  themes: string | null;
  isMock: boolean;
}

export interface Memory {
  id: string;
  storybookId: string;
  contributorId: string;
  contributor?: Contributor;
  title: string | null;
  eventDate: string | null;
  recordedAt: string;
  audioUrl: string | null;
  durationSec: number | null;
  visibility: string;
  storyUseConsent: boolean;
  status: string;
  transcripts: TranscriptVersion[];
  interpretation: MemoryInterpretation | null;
}

export interface ChapterSource {
  chapterId: string;
  memoryId: string;
}

export interface GuardianFinding {
  id: string;
  chapterId: string;
  category: string;
  status: "ok" | "needs_revision";
  note: string;
  createdAt: string;
}

export interface Chapter {
  id: string;
  storybookId: string;
  sequence: number;
  title: string;
  content: string;
  status: "draft" | "guardian_review" | "published";
  guardianStatus: "not_reviewed" | "needs_revision" | "approved";
  revisionRequested?: boolean;
  isMock: boolean;
  sources: ChapterSource[];
  findings?: GuardianFinding[];
  pages?: StoryPage[];
  pagesStatus?: "none" | "needs_characters" | "illustrating" | "ready" | "needs_attention";
  ruleSetVersion?: number | null;
  characterSheet?: string | null;
  createdAt: string;
}

export interface PageAsset {
  id: string;
  pageId: string;
  version: number;
  status: "generating" | "ready" | "failed";
  imagePath: string | null;
  model: string | null;
  error: string | null;
  checkStatus: "unchecked" | "ok" | "flagged";
  checkNote: string | null;
  createdAt: string;
}

export interface StoryPage {
  id: string;
  chapterId: string;
  pageNumber: number;
  storyMoment: string;
  characters: string; // JSON string[]
  setting: string;
  visibleAction: string;
  emotionalTone: string;
  continuity: string;
  shot: string | null; // JSON: { type, angle, focus }
  text: string;
  interpretationNote: string;
  sourceMemoryId: string | null;
  sourceQuote: string | null;
  checkStatus: "unchecked" | "ok" | "flagged";
  checkNotes: string | null; // JSON string[]
  approvedAt: string | null;
  assets: PageAsset[]; // newest first
  appearances?: PageAppearance[];
}

export interface Storybook {
  id: string;
  childId: string;
  child: Child;
  title: string;
  readerAgeBand: string;
  growWithChild: boolean;
  language: string;
  status: string;
  reminderFrequency: string;
  reminderDay: string;
  reminderTime: string;
  reminderTimezone: string;
  reminderChannel: string;
  remindersPaused: boolean;
  defaultVisibility: string;
  defaultStoryUse: boolean;
  memories: Memory[];
  chapters: Chapter[];
  defaultContributorId: string | null;
  myRole?: string;
  createdAt: string;
}

export interface Prompt {
  id: string;
  question: string;
  supportingText: string | null;
  category: string;
  audience: string;
  childStage: string;
  cardColor: string;
  status: "draft" | "published" | "archived";
  sortOrder: number;
  createdAt: string;
}

export interface ExportRequest {
  id: string;
  storybookId: string;
  status: "preparing" | "ready" | "failed" | "expired";
  filePath: string | null;
  createdAt: string;
  expiresAt: string | null;
}

export interface StorybookSummary {
  id: string;
  title: string;
  readerAgeBand: string;
  status: string;
  child: Child;
  _count: { memories: number; chapters: number };
}

export interface MessageVariable {
  name: string;
  description: string;
  sample: string;
}

export interface MessageTemplate {
  key: string;
  name: string;
  trigger: string;
  variables: MessageVariable[];
  defaultBody: string;
  body: string;
  enabled: boolean;
  isDefault: boolean;
  updatedAt: string | null;
}

export interface AiInstruction {
  key: string;
  name: string;
  trigger: string;
  variables: MessageVariable[];
  defaultBody: string;
  outputFormat: string;
  body: string;
  model: string | null;
  isDefault: boolean;
  updatedAt: string | null;
  models: string[];
  defaultModel: string;
  characterVariables: MessageVariable[];
}

export interface CharacterArt {
  id: string;
  characterId: string;
  imagePath: string;
  source: "upload" | "generated" | "render";
  view: string | null;
  expression: string | null;
  artSet: string;
  createdAt: string;
}

export type CastingMode = "always" | "when_it_fits" | "only_when_picked";

export interface LibraryCharacter {
  id: string;
  key: string;
  name: string;
  group: string | null;
  storyRole: string;
  personality: string;
  appearance: string;
  neverRules: string;
  castingMode: CastingMode;
  castingNotes: string;
  status: "draft" | "active" | "retired";
  version: number;
  referenceArtId: string | null;
  referenceImage: string | null;
  importedFrom: string | null;
  chaptersUsing: number;
  artCount?: number;
  art?: CharacterArt[];
  card?: string;
}

export type CastingModes = Record<CastingMode, { label: string; description: string }>;

export interface DesignProposal {
  id: string;
  designId: string;
  imagePath: string;
  createdAt: string;
}

export interface CharacterDesign {
  id: string;
  familyCharacterId: string;
  variant: string;
  version: number;
  status: "draft" | "approved" | "superseded";
  identity: string;
  usualClothing: string;
  changeNote: string;
  portraitPath: string | null;
  sheetPath: string | null;
  sheetStatus: "none" | "generating" | "ready" | "failed";
  approvedAt: string | null;
  hasPhoto: boolean;
  pages: number;
  publishedPages: number;
  proposals: DesignProposal[];
  createdAt: string;
}

export interface FamilyCharacterDetail {
  id: string;
  name: string;
  relationship: string;
  aliases: string[];
  context: string;
  approvedDesignIds: string[];
  designs: CharacterDesign[];
  fixedIdentity?: string;
  allowedVariations?: string;
}

export interface FamilyCharacterSummary {
  id: string;
  name: string;
  relationship: string;
  aliases: string[];
  portraitPath: string | null;
  variants: string[];
  hasDraft: boolean;
}

export interface PageAppearance {
  id: string;
  pageId: string;
  familyCharacterId: string;
  designId: string;
  outfit: string;
  details: string;
  familyCharacter: { id: string; name: string };
  design: { id: string; variant: string; version: number; portraitPath: string | null; status: string };
}

export interface UnresolvedPerson {
  ref: string;
  mention: string;
  kind: "unclear" | "new" | "missing_variant";
  candidates: string[];
  variant: string;
  question: string;
  suggestedName: string;
  suggestedRelationship: string;
  appearances: { pageNumber: number; variant: string; outfit: string }[];
}
