import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import AccessDenied from "../components/AccessDenied";
import { IconMic, IconPeople, IconSparkle } from "../components/icons";
import { Chev, Loading, Mascot } from "../components/ui";
import { useStorybookData } from "../hooks/useStorybookData";
import { apiGet } from "../lib/api";
import { waitingChapters } from "../lib/chapterStatus";
import { askedLine, audienceFor, cardFitsChild, cardPose, JUST_TALK, type AskedCard } from "../lib/promptStages";
import { fillPrompt, promptValues } from "../lib/promptVariables";
import { capitalize, childLabel, possessive } from "../lib/format";
import type { Prompt, StorybookView } from "../types";

const PROCESSING = ["recorded", "transcribing", "transcribed"];

// The card home asks: one from the family's deck, never a made-up sample (VSB-130).
type HomeQuestion = { id: string; question: string; thisWeek: boolean; askedBy?: string[] };
// Above the question: who asked it (VSB-131), or that it's this week's.
const questionLabel = (q: HomeQuestion | null | undefined) => (q?.askedBy ? askedLine(q.askedBy) : q?.thisWeek ? "this week's question" : "a question for you");

const weekday = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "long" });

// Home is just the actions (VSB-129): Baby Vambie asks one question and a big
// button records the answer; under it, one chapter slot shows what a chapter needs
// from the owner (review, who's who, publish) or else the newest chapter to read;
// then the chapter covers, tagged, and when the next chapter is made.
export default function StorybookHome() {
  const { id } = useParams();
  const { storybook, status, reload } = useStorybookData(id);
  // undefined while the deck loads; null when no card fits.
  const [prompt, setPrompt] = useState<HomeQuestion | null>();

  const busy =
    !!storybook &&
    (storybook.generating ||
      storybook.memories.some((m) => PROCESSING.includes(m.status)) ||
      storybook.chapters.some((c) => c.pagesStatus === "illustrating"));

  // Keep in-progress work fresh without a manual refresh.
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => reload(true), 8000);
    return () => clearInterval(t);
  }, [busy, reload]);

  // Baby Vambie always asks something: a question someone in the family passed on
  // to you (VSB-131), then this week's question until you've answered it, then the
  // next card in your deck you haven't answered.
  useEffect(() => {
    if (!storybook) return;
    // The bubble is never left empty: if the deck hasn't come back in a few
    // seconds, ask the "Just talk" question until it does.
    const slow = setTimeout(() => setPrompt((p) => (p === undefined ? null : p)), 5000);
    Promise.all([apiGet(`/api/storybooks/${storybook.id}/prompt-answers`), apiGet("/api/prompts?status=published")])
      .then(([answers, prompts]: [{ weekPromptId: string | null; answers: Record<string, { you: boolean }>; asked?: AskedCard[] }, Prompt[]]) => {
        const audience = audienceFor(storybook.me.relationship);
        const fits = prompts.filter((p) => (p.audience === "Everyone" || p.audience === audience) && cardFitsChild(p.childStage, storybook.child));
        const answered = (p: Prompt) => Boolean(answers.answers[p.id]?.you);
        // A card someone asked you to answer shows whoever it's usually for.
        const ask = answers.asked?.find((a) => prompts.some((p) => p.id === a.promptId));
        const asked = ask && prompts.find((p) => p.id === ask.promptId);
        const week = fits.find((p) => p.id === answers.weekPromptId && !answered(p));
        const next = asked ?? week ?? fits.find((p) => p.answerOnce && !answered(p)) ?? fits.find((p) => !p.answerOnce) ?? null;
        if (!next) return setPrompt(null);
        const values = promptValues({ child: storybook.child, me: storybook.me, parentName: storybook.family.find((f) => f.role === "owner")?.name ?? null });
        setPrompt({ id: next.id, question: fillPrompt(next.question, values), thisWeek: next === week, askedBy: next === asked ? ask?.from : undefined });
      })
      .catch(() => setPrompt(null));
    return () => clearTimeout(slow);
  }, [storybook?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (status === "denied") return <AccessDenied />;
  if (status === "notfound")
    return (
      <div className="page">
        <TopBar wordmark />
        <p className="loading">We couldn't find that storybook.</p>
      </div>
    );
  if (!storybook) return <Loading />;

  const base = `/storybooks/${storybook.id}`;
  const child = childLabel(storybook.child.displayName, storybook.me?.role === "owner");

  if (storybook.memories.length === 0 && storybook.chapters.length === 0) return <EmptyStorybook storybook={storybook} prompt={prompt} />;

  const owner = storybook.me.role === "owner";
  const published = storybook.chapters.filter((c) => c.status === "published").sort((a, b) => b.sequence - a.sequence);
  const featured = published[0];
  const waitingForYou = owner ? waitingChapters(storybook.chapters, child) : [];
  const waiting = storybook.memories.filter((m) => m.chapterIds.length === 0 && m.storyUseConsent && m.status !== "failed");
  const nextLine = storybook.generating ? "Writing the next chapter now." : waiting.length ? `Next chapter: ${weekday(storybook.nextChapterAt)} morning.` : "";
  // The chapter covers: chapters that need the owner first, then the ones in the book.
  const strip = [
    ...waitingForYou.map(({ chapter, step }) => ({ chapter, tag: step.tag, done: false, to: step.cta ? `${base}/chapters/${chapter.id}/pages` : null })),
    ...published.map((c) => ({ chapter: c, tag: c.readAt ? "Finished" : "New", done: true, to: `${base}/read/${c.id}` })),
  ].slice(0, 8);
  const total = published.length + waitingForYou.length;
  // The one chapter slot: what a chapter needs from the owner, else the newest chapter to read.
  const todo = waitingForYou.find(({ step }) => step.go);
  const slot = todo
    ? { to: `${base}/chapters/${todo.chapter.id}/pages`, cover: todo.chapter.cover, kicker: todo.step.kicker, title: todo.chapter.title, go: todo.step.go }
    : featured
      ? { to: `${base}/read/${featured.id}`, cover: featured.cover, kicker: `${possessive(child)} newest chapter`, title: featured.title, go: "Read" }
      : { to: `${base}/this-week`, cover: null, kicker: "Read together", title: "Your first chapter is on its way.", go: null };
  const question = prompt ? prompt.question : prompt === null ? JUST_TALK : "";

  return (
    <div className="page page--nav">
      <TopBar wordmark avatar={`${base}/settings`} />
      <div className="pad">
        {/* Baby Vambie asks one question, one button answers it: like "Every story starts somewhere". */}
        <span className="home-hero__kicker">
          {capitalize(possessive(child))} story · {questionLabel(prompt)}
        </span>
        <div className="home-ask" aria-busy={prompt === undefined}>
          <h1 className="home-ask__q">
            <QuestionText text={question} />
          </h1>
          <svg className="home-ask__tail" width="34" height="26" viewBox="0 0 34 26" aria-hidden="true">
            <path d="M3 0 L13 24 L31 0" />
          </svg>
        </div>
        <div className="home-hero__art">
          <Mascot name={prompt ? cardPose(prompt.id) : "hug-book"} />
        </div>
        <Link className="btn btn--lime btn--caps" to={prompt ? `${base}/record?card=${prompt.id}` : `${base}/record`}>
          <IconMic size={24} filled /> Record a memory
        </Link>

        <Link to={slot.to} className={`home-read-row ${todo ? "home-read-row--todo" : ""}`}>
          {slot.cover ? <img src={`/${slot.cover}`} alt="" className="home-read-row__cover" /> : <Mascot name="closedbook" className="home-read-row__cover home-read-row__cover--art" />}
          <span className="home-read-row__text">
            <span className="home-read-row__kicker">{slot.kicker}</span>
            <span className="home-read-row__title">{slot.title}</span>
          </span>
          {slot.go && <span className="home-read-row__go">{slot.go}</span>}
          <Chev size={20} />
        </Link>

        {strip.length > 0 && (
          <>
            <div className="home-chapters-head">
              <h2 className="home-chapters-head__title">Chapters</h2>
              <Link to={`${base}/memories`} className="home-chapters-head__all">
                See all {total}
              </Link>
            </div>
            <div className="home-strip">
              {strip.map(({ chapter, tag, done, to }) => {
                const body = (
                  <>
                    <span className="home-strip__cover">{chapter.cover ? <img src={`/${chapter.cover}`} alt="" /> : <Mascot name="closedbook" />}</span>
                    <span className={`home-strip__tag ${done ? (tag === "New" ? "home-strip__tag--new" : "home-strip__tag--done") : ""}`}>{tag}</span>
                    <span className="home-strip__title">{chapter.title}</span>
                  </>
                );
                return to ? (
                  <Link key={chapter.id} to={to} className="home-strip__item">
                    {body}
                  </Link>
                ) : (
                  <div key={chapter.id} className="home-strip__item">
                    {body}
                  </div>
                );
              })}
            </div>
          </>
        )}
        {nextLine && <p className="home-next">{nextLine}</p>}
      </div>
      <BottomNav storybookId={storybook.id} />
    </div>
  );
}

// "What did you grow up believing you had to earn? What would you like Peanut to
// receive freely?": the second sentence in italic.
function QuestionText({ text }: { text: string }) {
  const [first, ...rest] = text.split(/(?<=[?.!])\s+/);
  return rest.length ? (
    <>
      {first} <em>{rest.join(" ")}</em>
    </>
  ) : (
    <>{text}</>
  );
}

// A brand-new storybook asks the same real card home would (VSB-130), so the first
// memory is saved against it; "What would you like to remember?" if no card fits.
function EmptyStorybook({ storybook, prompt }: { storybook: StorybookView; prompt: HomeQuestion | null | undefined }) {
  const base = `/storybooks/${storybook.id}`;
  const record = prompt ? `${base}/record?card=${prompt.id}` : `${base}/record`;
  return (
    <div className="page page--nav">
      <TopBar wordmark menu={`${base}/settings`} />
      <header className="masthead masthead--plate" style={{ paddingBottom: 6 }}>
        <h1 className="h-display masthead__title">
          Every story
          <br />
          starts somewhere.
        </h1>
        <p className="masthead__sub" style={{ marginTop: 8 }}>
          {capitalize(possessive(childLabel(storybook.child.displayName, storybook.me?.role === "owner")))} story.
        </p>
        <Mascot name="closedbook" className="masthead__art masthead__art--scene" />
        <p className="t-center" style={{ position: "relative", zIndex: 2, fontSize: 19, margin: "6px 0 0" }}>
          Your first memory can be a tiny one.
        </p>
      </header>
      <div className="pad stack" style={{ marginTop: 14 }}>
        <Link to={record} className="first-question" aria-busy={prompt === undefined}>
          <IconSparkle size={34} />
          <span className="grow">
            <span className="badge badge--lavender badge--caps badge--sm">{capitalize(questionLabel(prompt))}</span>
            <span className="first-question__q">
              {prompt ? prompt.question : prompt === null ? JUST_TALK : ""}
            </span>
          </span>
          <Chev size={26} />
        </Link>
        <Link className="btn btn--lime btn--caps" to={record}>
          <IconMic size={24} filled /> Record your first memory <Chev />
        </Link>
        <Link className="btn btn--ghost btn--caps" to={`${base}/family`}>
          <IconPeople size={24} /> Invite family <Chev />
        </Link>
      </div>
      <BottomNav storybookId={storybook.id} />
    </div>
  );
}
