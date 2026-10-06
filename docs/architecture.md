# Architecture

How the code is organized, for anyone working on it.

## Stack

- **Web app:** React 18 with React Router, built with Vite. It's written mobile-first: family screens are designed for phones, and the admin panel for a desktop browser.
- **API:** Express on Node.js, written in TypeScript and run with `tsx`.
- **Database:** SQLite through Prisma 6. The generated client lives in `src/generated/prisma`, which isn't committed.
- **AI:** OpenAI for speech-to-text, text steps (JSON replies) and images. Google Gemini can stand in for transcription and the text steps.
- **Sign-in:** Twilio Verify texts one-time codes. Sessions are HTTP-only cookies that last 30 days.

During development, Vite serves the web app on port 5174 and forwards `/api` and `/uploads` to the API on port 3002.

## Folders

```
src/                  web app
  pages/              one file per screen (family screens)
  pages/admin/        admin panel screens
  components/         shared UI: ui.tsx (design system), icons, TopBar, BottomNav,
                      AudioPlayer, PagePicture, MemoryListRow
  hooks/              data loading (useStorybookData), shared audio playback
  lib/                API helpers, formatting, reading stages, relationships
  auth/               signed-in user context
  index.css           all styles: design tokens, components, screens
server/               API: routes and the services behind them
server.ts             API entry point: routes, private folders, background jobs
prisma/
  schema.prisma       data model
  migrations/         database migrations
  seed.ts             starter prompt cards
  import*.ts          Character Library import scripts
public/art/           Baby Vambie artwork and backgrounds for the app
uploads/              files created at runtime (not committed; see below)
docs/                 these guides
```

## Server modules

| Module | Responsibility |
| --- | --- |
| `storybookRoutes.ts` | Storybooks, memories, the weekly chapter, reading, sharing and settings |
| `familyRoutes.ts` | Family members and invitations |
| `accountRoutes.ts` | Account name and account deletion |
| `exportRoutes.ts` | Exports, deleting a memory, and exporting a single memory |
| `pageRoutes.ts` | The parent's page review actions, and the admin's page rules |
| `guardianRoutes.ts` | Admin: Story Review, family feedback, overview and families |
| `promptRoutes.ts` | Prompt cards, their order and artwork |
| `characterRoutes.ts` | Admin: the Vambie Character Library; parents: the Vambies they can pick |
| `familyCharacterRoutes.ts` | Family characters, their designs, private photos and approvals |
| `messageRoutes.ts`, `aiInstructionRoutes.ts` | Admin: editable text messages and AI instructions |
| `authRoutes.ts`, `session.ts`, `sms.ts` | Sign-in with a texted code, sessions, phone number format |
| `access.ts`, `admin.ts` | Who can see and do what; who is an admin |
| `storyPages.ts` | Planning, checks, illustration, page edits, revisions and approvals |
| `memoryPipeline.ts` | Transcribing, titling and interpreting new recordings |
| `weeklyChapters.ts` | The weekly chapter schedule |
| `readingStages.ts` | The five reading stages and Baby Vambie's name by age |
| `pageRules.ts` | Versioned page rules: reading profiles, art direction, image model and quality |
| `characters.ts`, `familyCharacters.ts` | Character cards, casting, reference art and render choice, design proposals |
| `aiService.ts`, `aiInstructions.ts` | Calling the AI provider; each AI step's instructions and reply format |
| `imageQueue.ts` | Pacing image requests to the OpenAI account's per-minute limit |
| `promptArt.ts` | The prompt card artwork library, and drawing card pictures from a question |
| `aiUsage.ts`, `costRoutes.ts` | Recording what each AI call costs (prices per model), and the admin Costs page |
| `messageTemplates.ts` | Text message types, variables and wording |

## Data model

The schema is in `prisma/schema.prisma`. Here are the models, grouped by what they're for:

- **People and access:** `User`, `Session`, `OtpCode`, `Household` (a family), `Contributor` (a person's place in a family: owner or contributor), `Invitation`.
- **Storybooks and memories:** `Child`, `Storybook` (settings, reminder schedule, reading stage), `Memory`, `TranscriptVersion` (machine and corrected transcripts), `MemoryInterpretation`.
- **Chapters:** `Chapter` (with its rules snapshot), `ChapterSource` (which memories it came from), `StoryPage`, `PageAsset` (every picture attempt for a page), `GuardianFinding`, `ChapterAccess` and `ChapterShare` (sharing), `ChapterMark` (bookmarks and reading progress), `StoryFeedback`.
- **Characters:** `Character` and `CharacterArt` (the Vambies), `FamilyCharacter`, `CharacterDesign` (versioned looks per age), `DesignProposal`, `PageAppearance` (which design of a family member is on a page, and what they're wearing).
- **Configuration:** `Prompt`, `PromptArtwork` (pictures generated or uploaded for prompt cards), `MessageTemplate`, `AiInstruction`, `GenerationRuleSet` (one row per page rules version).
- **Exports:** `ExportRequest`.
- **Costs:** `AiUsage` (one row per AI call: step, model, tokens, cost in dollars, and the family, chapter or memory it was for).

## Background work

Background jobs run inside the API process. There's no separate worker yet.

| When | What runs |
| --- | --- |
| A recording is uploaded | The memory pipeline: transcribe, title and interpret. The audio is deleted afterwards if the family doesn't keep recordings. |
| Every 5 minutes | The weekly chapter check: any storybook whose scheduled time has passed gets its chapter. This runs on the hosted app, and on a development copy only with `WEEKLY_CHAPTERS=on`. |
| A slow action is requested | Rewriting a chapter, drawing a design, revising a page and similar actions answer right away with a job id and finish in the background. The browser asks `/api/jobs/:id` until the result is ready (`server/jobs.ts`, `src/lib/api.ts`). |
| A chapter is planned (or Who's who is answered) | Illustration: the character sheet, then three pages at a time, paced to the image limit. |
| An export is requested | The zip is built, and the download expires after 7 days. |
| The API starts | Unfinished memories resume. Pictures and exports that were in progress are marked failed, so they can be retried from the app. |

## AI steps

Each step's instructions can be edited under Admin → Settings → AI instructions, and each can use its own model. The reply format is fixed in code, because the app reads it. Every step uses `OPENAI_MODEL` (`gpt-5.5`) unless a step has its own model set.

| Step | Runs when | Produces |
| --- | --- | --- |
| `interpret` | A memory has been transcribed | A title, what happened, feelings and possible themes |
| `page_plan` | A chapter is made or fully rewritten | The page-by-page plan, extras and Who's who questions |
| `page_check` | After planning, and after a page is edited or revised | Notes for pages that need attention |
| `page_revise` | A parent asks to change one page | The rewritten page |
| `illustration_check` | Each new picture (the image is attached) | Whether it matches the page, and which family members don't match their design |
| `describe_person` | A photo is uploaded for a family member | A draft of their fixed features and usual clothing |
| `guardian` | After planning, or when an admin re-runs it | Findings for continuity, reader fit and private details |

Transcription uses `OPENAI_TRANSCRIBE_MODEL` (`gpt-4o-transcribe`). Pictures use the image model and quality from Page Rules (`gpt-image-2`, medium).

### What each call costs

Every AI call records the usage the API reports in `AiUsage`, priced with the table in `server/aiUsage.ts` (standard OpenAI prices per million tokens). The cost is saved when the call is made, so a later price change only affects new calls. Update the table and `PRICES_CHECKED` when OpenAI changes its prices. A model missing from the table is priced like the default for its kind, and its rows are marked as estimates.

Each row is tagged with what it was for. Call sites pass the chapter, memory or family (`runAiStep(..., tags)`, `recordImage(...)`), and the request, the weekly batch or an admin test run sets who started it (`usageFromRequest`, `withUsage`). A chapter's first call happens before the chapter exists, so it's linked afterwards (`linkUsage`). Recording never throws: a failed record is logged and the call carries on.

## Files on disk

Runtime files live in `uploads/`, which isn't committed.

| Folder | Contents | How it's served |
| --- | --- | --- |
| `uploads/memories/` | Voice recordings | Only through `/api/memories/:id/audio`, after an access check |
| `uploads/exports/` | Export zips | Only through `/api/exports/:id/download`, to the person who asked for it |
| `uploads/private/photos/` | Family members' reference photos | Only to family members, through an access-checked route |
| `uploads/pages/` | Page pictures and chapter character sheets | Only to the family's members and admins |
| `uploads/characters/family/` | Family members' design pictures | Only to the family's members and admins |
| `uploads/characters/` (the rest) | Vambie art and renders | Public |
| `uploads/prompts/` | Prompt card artwork: generated and uploaded pictures in the artwork library | Public |

`server/uploadAccess.ts` applies these rules to every `/uploads` request, after normalizing the address. On the hosted app, `uploads/` points at the data volume ([Deployment](deployment.md)).

`server/assets/baby-vambie-render.png` is Baby Vambie's official 3D render, the reference new card pictures are drawn from (`server/promptArt.ts`). It's committed and isn't served.

## Conventions

- **Chapters snapshot their rules.** Anything that shapes a chapter is copied into it when it's made: rules, instructions, character cards and family designs. Changing a setting must never change an existing chapter.
- **Admins edit the wording; code owns the structure.** Message and AI instruction text are editable, while the message types, variables and reply formats are fixed in code.
- **Access checks.** Storybook, memory, chapter, family and export routes use the helpers in `server/access.ts` (`requireMember`, `memberForMemory`, `memberForChapter`). Page review (owner only) and family characters (family members only) have their own checks, in `pageRoutes.ts` and `familyCharacterRoutes.ts`.
- **Every route under `/api/admin` requires an admin,** and so does changing prompt cards. This is enforced once, in `server.ts`.
- **Slow actions run as jobs.** A route that can take more than a few seconds is listed with `asJob` in `server.ts`; the browser helpers in `src/lib/api.ts` wait for the result, so screens don't need to change.
