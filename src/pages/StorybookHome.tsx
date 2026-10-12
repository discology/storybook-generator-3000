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
import { fillPrompt, promptValues } from "../lib/promptVariables";
import { capitalize, childLabel, possessive } from "../lib/format";
import type { Prompt, StorybookView } from "../types";

const PROCESSING = ["recorded", "transcribing", "transcribed"];
const SAMPLE_PROMPT = "What is one thing you never want to forget?";

const weekday = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "long" });

// Home is just the actions (VSB-129): record a memory (prompted by this week's
// question), read the newest chapter together, and open the chapter list. What a
// chapter in progress needs from the parent lives in that list, under "Waiting
// for you"; when the next chapter is made shows on the Chapters row.
export default function StorybookHome() {
  const { id } = useParams();
  const { storybook, status, reload } = useStorybookData(id);
  const [weekQuestion, setWeekQuestion] = useState<string | null>(null);

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

  // This week's question prompts the Record tile, until you've answered it.
  useEffect(() => {
    if (!storybook) return;
    Promise.all([apiGet(`/api/storybooks/${storybook.id}/prompt-answers`), apiGet("/api/prompts?status=published")])
      .then(([answers, prompts]: [{ weekPromptId: string | null; answers: Record<string, { you: boolean }> }, Prompt[]]) => {
        const week = prompts.find((p) => p.id === answers.weekPromptId);
        if (!week || answers.answers[week.id]?.you) return setWeekQuestion(null);
        const values = promptValues({ child: storybook.child, me: storybook.me, parentName: storybook.family.find((f) => f.role === "owner")?.name ?? null });
        setWeekQuestion(fillPrompt(week.question, values));
      })
      .catch(() => setWeekQuestion(null));
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
  const waitingForYou = owner ? waitingChapters(storybook.chapters, child).length : 0;
  const waiting = storybook.memories.filter((m) => m.chapterIds.length === 0 && m.storyUseConsent && m.status !== "failed");
  const nextLine = storybook.generating ? "writing the next one now" : waiting.length ? `next one ${weekday(storybook.nextChapterAt)}` : "";
  const chaptersLine = [
    published.length ? `${published.length} in the book` : "None in the book yet",
    waitingForYou ? `${waitingForYou} waiting for you` : "",
    nextLine,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="page page--nav">
      <TopBar wordmark avatar={`${base}/settings`} />
      <div className="pad">
        <h1 className="h-title home-title" style={{ fontSize: 36, margin: "2px 0 16px" }}>
          {capitalize(possessive(child))} story
        </h1>

        <div className="home-tiles">
          {weekQuestion ? (
            <Link to={`${base}/record`} className="home-prompt">
              <Mascot name="mic" className="home-prompt__art" />
              <span className="home-prompt__kicker">This week's question</span>
              <span className="home-prompt__q">{weekQuestion}</span>
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

          <Link to={featured ? `${base}/read/${featured.id}` : `${base}/this-week`} className="home-tile">
            {featured?.cover ? <img src={`/${featured.cover}`} alt="" className="home-tile__cover" /> : <Mascot name="closedbook" className="home-tile__art" />}
            <span className="home-tile__text">
              <span className="home-tile__title">Read together</span>
              <span className="home-tile__sub">{featured ? featured.title : "Your first chapter is on its way."}</span>
              {featured && !featured.readAt && <span className="home-tile__new">New</span>}
            </span>
            <Chev size={22} />
          </Link>
        </div>

        <Link to={`${base}/memories`} className="home-chapters">
          <span>
            <span className="home-chapters__title">Chapters</span>
            <span className="home-chapters__sub">{chaptersLine}</span>
          </span>
          <Chev size={22} />
        </Link>
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
