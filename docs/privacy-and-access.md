# Privacy and access

Who can see what, what leaves the app, and how families can take their data or delete it.

## Who's who

- **The owner** is the family member who started the storybook, usually a parent. They choose the storybook's settings, invite family, review and publish chapters, and choose who can read each one.
- **Family members** join with an invitation link. They can record memories and read the chapters shared with them.
- **Admins** are the Vambie team: the phone numbers listed in `ADMIN_PHONES`. They review held chapters, manage prompt cards and characters, and edit the settings that shape every chapter. If `ADMIN_PHONES` is empty, anyone signed in can open the admin panel on a development copy; the hosted app keeps it closed.

- **Visitors** trying Vambie before signing up have a draft tied to their device by a cookie. Only that device can see it: their memory, the recording and the preview pictures. It isn't part of any family until they verify their number, and it's deleted after 7 days if they don't. A relative's memory recorded from an invitation joins the family's storybook only once they verify.

Who can start a storybook on the hosted app is a setting. It's invite-only by default (admins and the numbers in `ALLOWED_PHONES`, with everyone else joining a family through an invitation link), and open to anyone with `OPEN_SIGNUP=on`, which is how the hosted app runs now.

## What each person can see and do

| | Owner | Family member | Admin |
| --- | --- | --- | --- |
| Record memories | Yes | Yes | Only if also in the family |
| Hear a recording and read its words | Their own, and others' set to "Everyone in the family" | The same | No, but Story Review shows a short summary of each memory a chapter came from |
| Correct a memory's words, change its privacy or story use | Their own | Their own | No |
| Delete a memory | Their own, and others' shared with the family | Their own | No |
| See chapters before they're published | Yes | No | Yes, in Story Review |
| Review pages and publish | Yes | No | No |
| Read published chapters | All | Those shared with them | Yes, in Story Review |
| Invite or remove family members | Yes | No | No |
| See who's in the family | Yes | Yes | A summary under Families |

## Recordings and words

- When saving a memory, the person who recorded it chooses who can hear the original: **only them** (the default) or **everyone in the family**. That choice covers the recording and its transcript. The story made from it can still be shared.
- They also choose whether the memory may be used in stories. A memory that isn't allowed in stories never goes into a chapter.
- Recordings are never served as public files. They're streamed through an API route that checks who's asking.
- A family can choose **not to keep voice recordings** at setup or in Privacy settings. Each recording is then deleted as soon as it's transcribed, and only the words remain.

## Chapters

- The owner sees chapters while they're being made. Everyone else only sees a chapter once it's published.
- Each chapter can be readable by **everyone in the family**, **selected family members**, or **only the owner**.
- A link to a chapter only works for someone who's signed in and allowed to read it. Forwarding the link doesn't grant access.
- A chapter is held for review, and taken out of the book if it was already published, when the Guardian finds a problem, when an admin holds it, or when a memory it was made from is deleted. It comes back once it's reviewed and published again.

## What's sent to AI providers

To work, the app sends family content to OpenAI, or to Google Gemini when it's configured instead of OpenAI (pictures always use OpenAI).

| What | Sent for |
| --- | --- |
| Voice recordings | Transcription |
| Transcripts and interpretations | Interpreting memories, planning and checking chapters, the Guardian review |
| Family members' names, relationships and described looks | Planning chapters and drawing pictures |
| Approved design pictures of family members, and Vambie artwork | Reference images when drawing pages, and checking that pictures match |
| A family member's optional reference photo | Once to describe their features, and as a reference when drawing their proposed looks. It's never sent with page pictures. |

The child is never drawn as themselves: Baby Vambie stands in for them on every page, so no picture of the child is ever generated. Check each provider's current data-use and retention terms before using the app with real families.

## Exports

Anyone in the family can download a copy of their data from Privacy settings. An export holds:

- their own original recordings;
- their own transcripts;
- the published chapters they can read, with each page's words and picture.

**Other family members' private recordings are never included.** The download link only works for the person who asked for it, and it expires after 7 days. A single memory can also be exported from its options menu before it's deleted.

## Deleting

- **A memory.** The person who recorded it, or the storybook's owner, can delete it. The app first shows what will be removed (the recording, transcript and interpretation) and which chapters were made from it. Deleting needs "DELETE" typed to confirm. Chapters made from the memory are held for review, so its influence can be removed.
- **An account.** The app shows what will be removed and asks for "DELETE" to be typed. Everything goes in one step, or nothing does:
  - storybooks the person started are deleted for everyone, with all their memories, chapters, pictures and family characters;
  - in storybooks they joined, their own memories and recordings are deleted, and chapters made from them are held for review;
  - their account and sign-in sessions are deleted;
  - the record of what their AI use cost stays, so the admin totals stay right, but it's no longer tied to them. These rows never hold words, recordings or pictures, only the step, model, token counts and cost.
- Copies that were already downloaded or printed can't be recalled. The app says so before anything is deleted.

## Files

- **Recordings, exports and reference photos** are never served as files. Recordings and exports go through API routes that check who's asking, and reference photos are only read by the server.
- **Page pictures, chapter character sheets and family members' design pictures** are only served to members of that family and to admins.
- **Vambie artwork and prompt-card artwork** are public, since they're the same for everyone.
- Addresses are normalized before these rules are applied, so a path like `/uploads/x/../private/…` is judged by where it really leads.

## Hosting

On the hosted app ([Deployment](deployment.md)):

- everything travels over HTTPS, and session cookies are HTTPS-only and HTTP-only;
- sign-in codes are only texted, through Twilio Verify, which also limits how often codes can be requested;
- the database and files live on an encrypted disk, with a daily snapshot kept for 5 days.

## Known limitations

This is still a prototype. Before inviting families widely:

- **Terms and privacy policy.** The sign-in screen mentions them, but they haven't been written.
- **Backups stay with Fly.** Daily snapshots are kept for 5 days on Fly itself, and there's no copy anywhere else.
- **AI providers' terms.** Check OpenAI's current data-use and retention terms for family content, especially recordings and photos.
