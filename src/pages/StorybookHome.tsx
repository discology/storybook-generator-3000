import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import AccessDenied from "../components/AccessDenied";
import { IconBook, IconMic, IconPeople, IconSparkle } from "../components/icons";
import { Chev, Loading, Mascot } from "../components/ui";
import { useStorybookData } from "../hooks/useStorybookData";
import { apiGet } from "../lib/api";
import { waitingChapters } from "../lib/chapterStatus";
import { audienceFor, cardFitsChild } from "../lib/promptStages";
import { fillPrompt, promptValues } from "../lib/promptVariables";
import { capitalize, childLabel, possessive } from "../lib/format";
import type { Prompt, StorybookView } from "../types";

const PROCESSING = ["recorded", "transcribing", "transcribed"];
const SAMPLE_PROMPT = "What is one thing you never want to forget?";

const weekday = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "long" });

// Home is just the actions (VSB-129): record a memory (always prompted by a
// question), read the newest chapter together, and open the chapter list. What a
// chapter in progress needs from the parent lives in that list, under "Waiting
// for you" and as tagged covers on home; when the next chapter is made shows
// under them.
export default function StorybookHome() {
  const { id } = useParams();
  const { storybook, status, reload } = useStorybookData(id);
  const [prompt, setPrompt] = useState<{ id: string; question: string; thisWeek: boolean } | null>(null);

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

  // A question always prompts the Record tile: this week's question until you've
  // answered it, then the next card in your deck you haven't answered.
  useEffect(() => {
    if (!storybook) return;
    Promise.all([apiGet(`/api/storybooks/${storybook.id}/prompt-answers`), apiGet("/api/prompts?status=published")])
      .then(([answers, prompts]: [{ weekPromptId: string | null; answers: Record<string, { you: boolean }> }, Prompt[]]) => {
        const audience = audienceFor(storybook.me.relationship);
        const fits = prompts.filter((p) => (p.audience === "Everyone" || p.audience === audience) && cardFitsChild(p.childStage, storybook.child));
        const answered = (p: Prompt) => Boolean(answers.answers[p.id]?.you);
        const week = fits.find((p) => p.id === answers.weekPromptId && !answered(p));
        const next = week ?? fits.find((p) => p.answerOnce && !answered(p)) ?? fits.find((p) => !p.answerOnce) ?? null;
        if (!next) return setPrompt(null);
        const values = promptValues({ child: storybook.child, me: storybook.me, parentName: storybook.family.find((f) => f.role === "owner")?.name ?? null });
        setPrompt({ id: next.id, question: fillPrompt(next.question, values), thisWeek: next === week });
      })
      .catch(() => setPrompt(null));
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

  if (storybook.memories.length === 0 && storybook.chapters.length === 0) return <EmptyStorybook storybook={storybook} />;

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

  return (
    <div className="page page--nav">
      <TopBar wordmark avatar={`${base}/settings`} />
      <div className="pad">
        <h1 className="h-title home-title" style={{ fontSize: 36, margin: "2px 0 16px" }}>
          {capitalize(possessive(child))} story
        </h1>

        <div className="home-tiles">
          {prompt ? (
            <Link to={`${base}/record?card=${prompt.id}`} className="home-prompt">
              <Mascot name="mic" className="home-prompt__art" />
              <span className="home-prompt__kicker">{prompt.thisWeek ? "This week's question" : "A question for you"}</span>
              <span className="home-prompt__q">{prompt.question}</span>
              <span className="home-prompt__go">
                <IconMic size={20} filled /> Record a memory
              </span>
            </Link>
          ) : (
            <Link to={`${base}/record`} className="home-tile home-tile--record">
              <Mascot name="mic" className="home-tile__art" />
              <span className="home-tile__text">
                <span className="home-tile__title">Record a memory</span>
                <span className="home-tile__sub">A minute or two, in your own words.</span>
              </span>
              <Chev size={22} />
            </Link>
          )}

          <Link to={featured ? `${base}/read/${featured.id}` : `${base}/this-week`} className="home-read">
            {featured?.cover ? (
              <img src={`/${featured.cover}`} alt="" className="home-read__cover" />
            ) : (
              <span className="home-read__cover home-read__cover--art">
                <Mascot name="closedbook" />
              </span>
            )}
            <span className="home-read__kicker">{!featured ? "Read together" : featured.readAt ? "Your newest chapter" : "New chapter"}</span>
            <span className="home-read__title">{featured ? featured.title : "Your first chapter is on its way."}</span>
            {featured && (
              <span className="home-prompt__go">
                <IconBook size={20} /> Read together
              </span>
            )}
          </Link>
        </div>

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

function EmptyStorybook({ storybook }: { storybook: StorybookView }) {
  const base = `/storybooks/${storybook.id}`;
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
        <Link to={`${base}/record?q=${encodeURIComponent(SAMPLE_PROMPT)}`} className="sample-prompt">
          <IconSparkle size={34} />
          <span className="grow">
            <span className="badge badge--lavender badge--caps badge--sm">Sample prompt</span>
            <span className="sample-prompt__q" style={{ display: "block" }}>
              {SAMPLE_PROMPT}
            </span>
          </span>
          <Chev size={26} />
        </Link>
        <Link className="btn btn--lime btn--caps" to={`${base}/record?q=${encodeURIComponent(SAMPLE_PROMPT)}`}>
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
