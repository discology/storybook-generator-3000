import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import TopBar from "../components/TopBar";
import { Masthead, Sheet } from "../components/ui";
import { LEGAL, TERMS_EFFECTIVE } from "../lib/legal";

// The Terms of Service and Privacy Policy (VSB-44), public at /terms and
// /privacy. Plain language, describing what the app actually does.

interface Section {
  title: string;
  body: ReactNode;
}

const contact = <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>;

function LegalPage({ title, intro, sections }: { title: ReactNode; intro: ReactNode; sections: Section[] }) {
  return (
    <div className="page">
      <TopBar back wordmark />
      <Masthead title={title} style={{ paddingTop: 0 }} />
      <Sheet grow>
        <div className="legal">
          <p className="t-small t-muted">Effective {TERMS_EFFECTIVE}</p>
          {intro}
          {sections.map((s) => (
            <section key={s.title}>
              <h2 className="h-title">{s.title}</h2>
              {s.body}
            </section>
          ))}
          <p className="t-small t-muted">
            See also: <Link to="/terms">Terms of Service</Link> · <Link to="/privacy">Privacy Policy</Link>
          </p>
        </div>
      </Sheet>
    </div>
  );
}

export function Terms() {
  return (
    <LegalPage
      title={<>Terms of<br />Service.</>}
      intro={
        <p>
          {LEGAL.product} turns little family moments into a storybook for a child. It's made by {LEGAL.company} ("we", "us"). These terms are the
          agreement between you and us when you use {LEGAL.product}. By using it, you agree to them.
        </p>
      }
      sections={[
        {
          title: "Who can use it",
          body: (
            <p>
              You must be 18 or older. {LEGAL.product} is for parents and the family and friends they invite. Children don't use it or have accounts:
              the storybook is made about them and read to them.
            </p>
          ),
        },
        {
          title: "Your account",
          body: (
            <ul>
              <li>You sign in with your mobile number and a code we text you. Keep your phone and codes to yourself.</li>
              <li>One account per person. Don't sign in as someone else.</li>
              <li>You can delete your account at any time in Settings → Privacy → Delete account.</li>
            </ul>
          ),
        },
        {
          title: "Your memories are yours",
          body: (
            <>
              <p>
                You own what you record or write. You give us permission to store it, process it (including with the AI providers named in our{" "}
                <Link to="/privacy">Privacy Policy</Link>) and show it to the people you choose, only to run {LEGAL.product} for you and your family.
              </p>
              <p>
                Only share memories you have the right to share. If a memory includes someone else's words or private details, make sure they'd be
                comfortable with it, and use the privacy choices when saving it.
              </p>
            </>
          ),
        },
        {
          title: "Your storybook",
          body: (
            <>
              <p>
                Stories and pictures are written and drawn by AI from your memories. They can get things wrong. The storybook's owner reviews each
                chapter before it's published, and we may hold a chapter for review if our checks find a problem.
              </p>
              <p>
                The storybook is yours to keep, read, download and print for your family. The Vambie characters, artwork and world belong to{" "}
                {LEGAL.company}, so please don't sell storybooks or use the characters commercially.
              </p>
            </>
          ),
        },
        {
          title: "Text messages",
          body: (
            <ul>
              <li>
                {LEGAL.product} texts you sign-in codes, the reminders you choose to get, and family updates such as a new chapter, an invitation or
                someone joining. You agree to these texts when you enter your number.
              </li>
              <li>Message frequency varies. Message and data rates may apply.</li>
              <li>Reply STOP to stop all texts except sign-in codes you ask for. Reply START to get them again. Reply HELP for help.</li>
              <li>You can also turn reminders off in Settings → Reminders.</li>
              <li>Carriers aren't responsible for texts that are delayed or not delivered.</li>
            </ul>
          ),
        },
        {
          title: "Please don't",
          body: (
            <ul>
              <li>Record or upload anything illegal, hateful, sexual, or that harms or exploits a child.</li>
              <li>Use {LEGAL.product} to harass anyone, or to collect other people's information.</li>
              <li>Try to break, overload or get around the app's limits and security.</li>
            </ul>
          ),
        },
        {
          title: "Changes and ending",
          body: (
            <>
              <p>
                {LEGAL.product} is new and will change. We may add, change or stop features. If we change these terms in a way that matters, we'll ask
                you to accept the new version.
              </p>
              <p>We may suspend an account that breaks these terms. You can stop using {LEGAL.product} and delete your account whenever you like.</p>
            </>
          ),
        },
        {
          title: "The legal part",
          body: (
            <>
              <p>
                {LEGAL.product} is provided as it is. We work hard to keep it running and your memories safe, but we can't promise it will always be
                available or free of mistakes. Keep your own copies of anything precious (Settings → Privacy → Export my memories).
              </p>
              <p>
                To the extent the law allows, {LEGAL.company} isn't liable for indirect or consequential losses, and our total liability is limited to
                the amount you paid us in the last 12 months. These terms are governed by the laws of {LEGAL.governingState}.
              </p>
            </>
          ),
        },
        {
          title: "Contact",
          body: <p>Questions about these terms: {contact}.</p>,
        },
      ]}
    />
  );
}

export function Privacy() {
  return (
    <LegalPage
      title={<>Privacy<br />Policy.</>}
      intro={
        <p>
          {LEGAL.product} holds some of a family's most personal moments. This policy says what we collect, why, who it goes to, and how you can
          take it or delete it. {LEGAL.product} is made by {LEGAL.company}.
        </p>
      }
      sections={[
        {
          title: "What we collect",
          body: (
            <ul>
              <li>
                <strong>About you:</strong> your mobile number, your name and your relationship to the child.
              </li>
              <li>
                <strong>About the child:</strong> the name or nickname you give and their birth or due date. Children don't use the app; this comes
                from their family.
              </li>
              <li>
                <strong>Memories:</strong> voice recordings, their transcripts, memories you type, and the details you add, such as when it happened
                and who can see it.
              </li>
              <li>
                <strong>Family members:</strong> the names, relationships and descriptions you add for the people in the pictures, their approved
                looks, and an optional reference photo.
              </li>
              <li>
                <strong>The storybook:</strong> the chapters and pictures made from memories.
              </li>
              <li>
                <strong>A little technical data:</strong> a sign-in cookie; for visitors trying it before signing up, a cookie for their draft and a
                one-way code made from their device and network, used only to limit free previews; and a record of what each AI step cost (never its
                words or pictures).
              </li>
            </ul>
          ),
        },
        {
          title: "How we use it",
          body: (
            <ul>
              <li>To make the storybook: transcribing recordings, writing chapters and drawing pictures.</li>
              <li>To sign you in and send the texts described in our <Link to="/terms">Terms</Link>.</li>
              <li>
                To keep stories safe for children: an automated check reviews each chapter before it's published. The Vambie team can see chapters
                and a short summary of the memories behind them, to review held chapters and help when something goes wrong. They don't hear
                recordings or read full transcripts.
              </li>
            </ul>
          ),
        },
        {
          title: "AI providers",
          body: (
            <>
              <p>
                To write and illustrate the storybook, we send memories (recordings, words and the family details above) to AI providers, currently
                OpenAI. We use them through their business services, which don't use this data to train their models by default.
              </p>
              <p>
                The child is never drawn as themselves: Baby Vambie stands in for them on every page, so no picture of the child is ever made. A
                family member's optional reference photo is used to design their look, and is never sent with page pictures.
              </p>
            </>
          ),
        },
        {
          title: "Who can see what",
          body: (
            <ul>
              <li>
                When you save a memory, you choose who can hear or read the original: only you, or everyone in the family. You also choose whether
                it can be used in stories.
              </li>
              <li>The storybook's owner chooses who can read each chapter. A link to a chapter only works for someone who's allowed to read it.</li>
              <li>We don't sell your information, show you ads, or share it with anyone for their marketing.</li>
            </ul>
          ),
        },
        {
          title: "Text messages and your number",
          body: (
            <ul>
              <li>Your mobile number is used to sign you in and to send the texts you've agreed to.</li>
              <li>
                Your number and your consent to get texts are never sold or shared with third parties for their marketing. Our texting provider only
                uses them to deliver our messages.
              </li>
              <li>Reply STOP to any text to stop them, START to get them again, and HELP for help.</li>
            </ul>
          ),
        },
        {
          title: "Services we use",
          body: (
            <ul>
              <li>Fly.io hosts the app and stores its data.</li>
              <li>OpenAI transcribes recordings and writes and draws the storybook.</li>
              <li>Twilio sends sign-in codes and text messages.</li>
            </ul>
          ),
        },
        {
          title: "Keeping and deleting",
          body: (
            <ul>
              <li>
                A family can choose not to keep voice recordings: each one is then deleted as soon as it's transcribed, and only the words remain.
              </li>
              <li>A visitor's draft that isn't saved is deleted after 7 days.</li>
              <li>You can delete a memory, or your whole account, at any time. The app shows exactly what will be removed before you confirm.</li>
              <li>Deleting your account deletes the storybooks you started, and your memories in storybooks you joined.</li>
              <li>Copies you already downloaded or printed can't be recalled.</li>
            </ul>
          ),
        },
        {
          title: "Your choices",
          body: (
            <ul>
              <li>Download a copy of your recordings, transcripts and the chapters you can read: Settings → Privacy → Export my memories.</li>
              <li>Correct a memory's words, or change who can see it, from the memory itself.</li>
              <li>Delete a memory or your account, as above, or ask us to: {contact}.</li>
            </ul>
          ),
        },
        {
          title: "Security",
          body: (
            <p>
              Data travels over encrypted connections. Recordings, exports and reference photos are never public files: the app checks who's asking
              before sending them. Pictures are only shown to the family they belong to and to the Vambie team.
            </p>
          ),
        },
        {
          title: "Changes and contact",
          body: (
            <p>
              If we change this policy in a way that matters, we'll ask you to accept the new version. Questions or requests: {contact}.
            </p>
          ),
        },
      ]}
    />
  );
}
