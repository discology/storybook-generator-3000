# Admin guide

The admin panel is where the Vambie team reviews chapters and shapes how every chapter is written and drawn. Open `/admin`, for example http://localhost:5174/admin. Only phone numbers listed in `ADMIN_PHONES` can open it.

## Overview

The week at a glance: chapters held for review, open family feedback, memories and chapters this week, the number of storybooks, invites waiting, and memories that couldn't be transcribed. Below that are chapters whose pictures need another try, and the latest family feedback, each linking to its chapter.

## Story Review

Every chapter passes through here.

- **Tabs.** *Needs review* lists chapters the Guardian flagged or hasn't finished reviewing, and any chapter with new family feedback. *In revision* lists chapters that were rewritten after a revision request and still have open findings. *Approved* lists the rest.
- **Search and sort** by chapter, storybook, reason or status.
- The banner confirms that **no held chapter is readable by a family**. If one ever is, it says so.

### Reviewing a chapter

![Reviewing a chapter in the admin panel: the draft's pages on the left, with Guardian findings and family feedback on the right](images/admin-chapter-review.jpg)

- **The draft** shows every page with its picture. Passages the Guardian flagged are highlighted.
- **Guardian findings** cover continuity, reader fit, private details and removed sources. Open one to read the note. If it isn't a real problem, or it was fixed by hand, choose **Mark as resolved**.
- **Family feedback** shows what grown-ups reported from the reader. Choose **Mark as handled** once you've acted on it. Feedback doesn't block approval.
- **Request revision** rewrites the whole chapter following your instructions (up to 500 characters). It plans new pages, redraws every picture and becomes a new version. The chapter leaves the family's book until it's approved and published again.
- **Approve chapter** is available once every finding is resolved. Approving doesn't publish: the parent still approves the pages and publishes.
- **Keep on hold** takes a chapter out of the family's book until it's reviewed.
- **Run the Guardian again** reviews the chapter afresh, for example after the parent edited pages.
- **Source context** shows a short summary of each memory the chapter came from. Recordings and transcripts aren't shown.

## Prompt Library

Prompt cards are the questions families see when they record.

- **Tabs** for published, draft and archived cards, with search and a category filter.
- **Drag cards in the Published tab** to set the order families see them in. The deck preview below the table shows that order.
- The **⋯** menu publishes a card, moves it to drafts, archives it or deletes it.

### Editing a card

- **Question** (up to 90 characters) and **supporting text** (up to 120 characters).
- **Variables** make a card personal: each family sees their own names. Click a variable to add it at the cursor in the question or supporting text. The phone preview shows samples, and the Prompt Library list shows variables highlighted.

  | Variable | Shows | If it's unknown |
  | --- | --- | --- |
  | `<child_name>` | The child's name or nickname, as the family entered it (Mia) | — |
  | `<child_age>` | The child's age in words (8 months old, 2 years old), or "on the way" while expecting | "young" |
  | `<your_name>` | First name of the person recording (Rose, or "Grandma Rose" when the name starts with a family title) | "you" |
  | `<your_relationship>` | How the person recording is related to the child, in lowercase (grandparent, auntie) | "family member" |
  | `<parent_name>` | First name of the parent who started the storybook (Anna) | "their parent" |

  For example, "What is something you'd like to tell `<child_name>` in the future?" reads "…tell Mia in the future?" for Mia's family. A recorded memory keeps the question as the family saw it. A misspelled variable (like `<childname>`) is flagged, and the card can't be saved until it's fixed. When drawing card art, variables become neutral words ("the child").
- **Category:** pick an existing category or create a new one. Categories become the filter chips on the recording screen.
- **Audience** decides who sees the card: all contributors, parents (the Parent and Guardian relationships) or grandparents.
- **Child stage** shows the card at every age, or only while the family is expecting, for newborns (under 1) or for toddlers (1 to 3).
- **Card color** sets purple, gold, pink or green.
- **Artwork:** opens the card artwork window, which shows a preview of the card with the picture you select. Without artwork, the card shows one of Baby Vambie's card poses.
  - **Generate from the question** draws two pictures of Baby Vambie in the 3D style of the card poses, on a transparent background so he sits on the card's color. It uses the question as it's written now, its supporting text, and an optional picture idea ("Baby Vambie blowing out a candle on a cupcake"). It takes about 30 seconds and costs about $0.40 a click. The cost appears on the Costs page as "Prompt card art".
  - **Choose from library** has Baby Vambie's 14 card poses, and every picture generated or uploaded for any card, labeled with the question it was made for. Generated pictures stay in the library even if no card uses them.
  - **Upload** adds a square image (ideally 1024 × 1024) to the library and to this card.
  - New artwork reaches families when you publish the card, like the other fields.
- **Save draft** saves the card as a draft, which takes it out of the families' deck until you publish it. **Publish changes** updates the card for families. Memories already recorded keep the question as it was worded when they were recorded.

## Feedback

Where the team learns from what went wrong in pictures and words.

- **Flag a page** from Story Review: "Flag this page" under any page. Pick the picture, the words or both, one or more categories (camera/framing, composition, expression, character off-model, wrong action or continuity, text in the picture, art style; voice, reading level, facts, pacing, title), say what's wrong and, optionally, what it should be. The picture's exact prompt and model, the page plan (camera, action, mood) and the words are saved with the flag, so later changes don't lose what was judged.
- **Parents' feedback** ("something's off" on a chapter) appears in the same queue, labeled by relationship.
- **The queue** filters by picture or words, category, team or families, status, reading stage and date. The counts above it show which problems come up most; click one to filter by it.
- **Redraw to compare** draws a flagged picture again from the same page plan with today's Page Rules and Character Library art, and shows the two side by side. The family's chapter never changes. About $0.06–0.08 a picture, counted as an admin cost.
- **Re-test all with today's rules** (after filtering by a picture category) redraws every open flag in that category, after showing how many and the estimated cost. Use it after changing Page Rules or AI instructions to see whether the change helped.
- **Action items**: select flags and make an action item (what to change: picture prompt / camera and acting, Page Rules, planner wording, character art, other). The Action items tab tracks them as open or done. **Send to Jira** creates a VSB ticket (Story for development work, Task otherwise), once Jira is connected (see [deployment settings](deployment.md#settings)).
- **Export** downloads the flags in the current filter as JSON: categories, notes, prompts, page plans, words, rules versions, picture links and redraws. Families are named by relationship only.

## Families

Every storybook: the child, who started it, how many people have joined or are invited, the reading stage, the number of memories and chapters, and when the last memory was recorded. Recordings and transcripts aren't shown here.

## Characters

The Vambie Character Library. Every chapter can include these characters, and AI instructions can refer to any of them as `<key>`.

- **Card:** name, group, look (locked and used in every picture), "never" rules, personality and voice, and role in stories. The preview shows exactly what `<key>` turns into inside AI instructions.
- **Status:** *Active* characters can appear in stories. *Draft* characters are safe to edit, and *retired* ones no longer appear.
- **When they appear:** in every chapter (like Baby Vambie), when the memory fits their casting notes, or only when a parent picks them on This week's chapter.
- **Reference art** is attached to every picture the character appears in. You can upload artwork, generate it, or **redraw it in the book's style** so the character matches the ink-and-wash pages.
- **3D renders:** the official renders, organized by camera view and expression. Select one to make it the reference art. When the reference art is a render, each page also gets the render matching its mood and camera angle.
- **Expressions in the book's style:** when the reference art is in the book's style, **Draw expressions in the book's style** draws nine moods from it (about three minutes, about $2). Each page then attaches the expression matching its mood in place of the reference art, so the character's face changes with the story. **Redraw the expressions** replaces the set.
- Editing a card or changing the reference art creates a new version. Chapters keep the version they were made with.

## Visitors

People trying Vambie before they sign up get a free three-page preview of their story. Under Admin → Settings → Visitors:

- **Free previews in the last 24 hours** compared with the cap, and how many unsaved drafts are waiting on visitors' devices.
- **Free previews a day, across all visitors** (default 100, about $40 at most). 0 pauses free previews. Past the cap, visitors can still record and save, and their story is made once they verify their number.

Each device and network also gets one preview and one retry a day, and unsaved drafts are deleted after 7 days. Visitors' drafts don't appear in Story Review, Families or the Overview counts. On the Costs page, their spend shows under "Started by: Visitor (not signed up)".

## Costs

What the AI costs to run, from the usage each call reports. Costs are recorded from the day tracking was added, so older chapters are counted but show as *not tracked*.

- **Filters:** the period (last 7, 30 or 90 days, this month, last month, all time or custom dates), one family, a reading stage, who started the work (the family, the weekly batch, the Vambie team, or a resume after a restart) and the cost type (pictures, writing and checks, voice). Filters are kept in the address, so a filtered view can be bookmarked or shared with the team.
- **Headline numbers:** total spend, average cost per chapter (with the median and the highest), all-in cost per chapter (adding each family's memories and character designs), chapters made, chapters per family per week, a month's spend at this pace, the cost of one page picture, and the share of picture spend that went on redraws.
- **Week by week:** spend per week split into pictures, writing and voice, with the number of chapters made above each bar.
- **Where the money goes:** each AI step with its number of calls, cost per call, cost per chapter and total.
- **By reading stage:** average chapter cost per stage. Stages that draw more pictures cost more.
- **Families:** chapters, chapters a week, cost per chapter, spend on chapters, memories and character designs, and a month at this pace. Select a family's name to filter the page to it.
- **Chapters:** every chapter in the period with its pages, pictures drawn (including redraws), and cost split into writing and pictures. **Download CSV** saves this table.
- **Prices used:** the price table behind the numbers, and when it was last checked.

A chapter's cost is everything ever spent on it, including later redraws and rewrites. Spend in the period counts each call on the day it was made. Spend that isn't tied to a family (Vambie library art, admin test runs, families who deleted their account) is in the totals and noted under the Families table.

## Settings

### Text messages

The wording of the welcome, family invite, memory reminder and new-chapter texts. Write variables like `<child_name>` or `<record_url>` in angle brackets; the editor lists the ones each message supports and previews the result. It also counts characters, so you can see how many texts a message takes. Each message can be turned off, or reset to the default wording.

The page also shows the texting mode (off, test or live), a "Text me a test" button for each message, and the log of recent texts with their delivery status. Every text starts "Vambie Storybook:". Invitations are never texted by the app, since carriers need the person's own consent: the parent shares the link.

### AI instructions

The instructions given to the AI at each step: interpret memory, plan pages, check pages, revise a page, check a picture, describe a person, and the Guardian. See [AI steps](architecture.md#ai-steps) for when each one runs.

**The Vambie world** is the first entry and isn't a step: it's the shared text that describes Baby Vambie, Parts, the band as background and the storybook's voice at each reading stage. Plan pages, Check pages, Revise page and the Guardian read it wherever their instructions say `<world>`. It has no model and no test run; to see its effect, test run Plan pages. Chapters keep the version of it they were made with.

- Write variables in angle brackets. Each step lists its variables, and any Vambie can be included as `<key>`.
- **Model:** each step can use its own model. Checking steps often work well on a smaller, cheaper model; see [Running costs](how-it-works.md#running-costs).
- **The reply format** is shown, but it can't be edited, because the app reads the AI's reply.
- **Test run** sends the current instructions, saved or not, with sample values, and shows the reply. Each test run is a real, billed AI call.
- **Reset to default instructions** restores the built-in wording.

### Page rules

The rules every new chapter is made with.

- **Reading stages:** page counts, words per page and per sentence, vocabulary, and each stage's picture pattern.
- **Fictional embellishment:** minimal, moderate or imaginative.
- **Illustrations:** the art style, how people are drawn (by default everyone is a Vambie in their own skin tone, and Baby Vambie alone is teal-blue), camera and acting for page pictures (follow the planned camera, off-center framing, movement, feelings on faces), and the image model and quality.

Saving creates a new version, and only new chapters use it. The version history shows how many chapters were made with each version.
