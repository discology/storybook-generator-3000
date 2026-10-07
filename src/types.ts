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
  pictureSize: string; // vignette | framed | full | wordless; "" on older pages
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
  artworkPath: string | null;
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
  me: { role: string; relationship: string | null; name: string } | null;
  latestChapter: { id: string; title: string; publishedAt: string | null } | null;
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
  kind?: "step" | "block";
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
  look: "vambie" | "person";
  identity: string;
  usualClothing: string;
  changeNote: string;
  portraitPath: string | null;
  sheetPath: string | null;
  sheetStatus: "none" | "generating" | "ready" | "failed";
  styleSnapshot: string;
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
  currentStyle?: string;
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

// --- Storybook as seen by one family member (GET /api/storybooks/:id) ---

export interface StorybookMemory {
  id: string;
  title: string | null;
  recordedAt: string;
  eventDate: string | null;
  durationSec: number | null;
  status: string;
  processingError: string | null;
  visibility: string;
  storyUseConsent: boolean;
  contributorId: string;
  contributor: { id: string; name: string; relationship: string | null };
  mine: boolean;
  favorite: boolean;
  excerpt: string | null;
  words: string; // the full transcript, for search
  chapterIds: string[];
  audioSrc: string | null;
  typed: boolean; // written, not recorded
  promptText: string | null;
}

export interface StorybookChapter {
  id: string;
  sequence: number;
  title: string;
  status: "draft" | "guardian_review" | "published";
  guardianStatus: "not_reviewed" | "needs_revision" | "approved";
  pagesStatus: "none" | "needs_characters" | "illustrating" | "ready" | "needs_attention";
  createdAt: string;
  publishedAt: string | null;
  pageCount: number;
  approvedPages: number;
  cover: string | null;
  favorite: boolean;
  readAt: string | null;
  unresolvedCount: number;
  shareMode: "family" | "selected" | "private";
  version: number;
  excerpt: string;
  isMock: boolean;
}

export interface FamilyMember {
  id: string;
  name: string;
  relationship: string | null;
  role: string;
  inviteStatus: string;
}

export interface StorybookView {
  id: string;
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
  remindersPausedUntil: string | null;
  defaultVisibility: string;
  defaultStoryUse: boolean;
  keepRecordings: boolean;
  vambieNameAge: number;
  createdAt: string;
  child: Child;
  memories: StorybookMemory[];
  chapters: StorybookChapter[];
  pendingCastKeys: string[];
  currentStage: string;
  vambieName: string;
  me: { contributorId: string; role: string; name: string; relationship: string | null };
  family: FamilyMember[];
  nextChapterAt: string;
  generating: boolean;
  batchError: string | null;
  defaultContributorId: string;
  myRole: string;
}

export interface ThisWeek {
  nextChapterAt: string;
  generating: boolean;
  error: string | null;
  readyCount: number;
  memories: {
    id: string;
    title: string | null;
    status: string;
    processingError: string | null;
    storyUseConsent: boolean;
    recordedAt: string;
    durationSec: number | null;
    contributor: { name: string };
    mine: boolean;
  }[];
  otherCount: number;
  chapterInProgress: { id: string; title: string; pagesStatus: string; sequence: number; createdAt: string } | null;
}

export interface MemoryDetail {
  id: string;
  storybookId: string;
  title: string | null;
  recordedAt: string;
  eventDate: string | null;
  durationSec: number | null;
  status: string;
  processingError: string | null;
  visibility: string;
  storyUseConsent: boolean;
  promptText: string | null;
  audioSrc: string | null;
  recordingKept: boolean; // false when the family keeps only the words
  typed: boolean; // written, not recorded (VSB-85)
  favorite: boolean;
  mine: boolean;
  contributor: { id: string; name: string; relationship: string | null };
  transcript: TranscriptVersion | null;
  interpretation: MemoryInterpretation | null;
  chapters: { id: string; title: string; sequence: number; status: string; cover: string | null }[];
  storybook: { id: string; title: string; childName: string };
  nextChapterAt: string;
  canDelete: boolean;
}

export interface ReaderChapter {
  id: string;
  title: string;
  sequence: number;
  status: string;
  content: string;
  publishedAt: string | null;
  pages: { id: string; pageNumber: number; text: string; pictureSize: string; visibleAction: string; image: string | null }[];
  mark: { favorite: boolean; lastPage: number; readAt: string | null; finishedAt: string | null } | null;
  storybook: { id: string; title: string; childName: string };
  nextChapterId: string | null;
  previousChapterId: string | null;
  canShare: boolean;
}
