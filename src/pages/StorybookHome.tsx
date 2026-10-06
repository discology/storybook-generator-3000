import { useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import AccessDenied from "../components/AccessDenied";
import MemoryListRow from "../components/MemoryListRow";
import { IconBook, IconMic, IconPeople, IconSparkle, IconSpinner } from "../components/icons";
import { Chev, Loading, Mascot, type MascotName } from "../components/ui";
import { useStorybookData } from "../hooks/useStorybookData";
import { useInlineAudio } from "../hooks/useInlineAudio";
import { apiSend, ApiError } from "../lib/api";
import { possessive } from "../lib/format";
import type { StorybookChapter, StorybookView } from "../types";

const PROCESSING = ["recorded", "transcribing", "transcribed"];
const SAMPLE_PROMPT = "What is one thing you never want to forget?";

const weekday = (iso: string) => new Date(iso).toLocaleDateString("en-US", { weekday: "long" });

// What a chapter that isn't published yet needs from the parent, if anything.
function chapterStep(c: StorybookChapter, childName: string) {
  if (c.status === "published") return null;
  if (c.pagesStatus === "needs_characters")
    return { kicker: "Who's who?", text: "Tell us who someone in this memory is, so we can draw them right.", art: "magnifier" as MascotName, cta: "pages" as const };
  if (c.pagesStatus === "illustrating") return { kicker: "Drawing the pictures", text: "This takes a few minutes. You can leave this page.", spinner: true, cta: "pages" as const };
  if (c.pagesStatus === "needs_attention")
    return { kicker: "A picture needs another try", text: "Open the chapter to redraw it.", art: "peek-worried" as MascotName, cta: "pages" as const };
  if (c.approvedPages < c.pageCount)
    return { kicker: "Ready for you", text: "Look through the pages and approve them.", art: "open-book" as MascotName, cta: "pages" as const };
  if (c.guardianStatus !== "approved")
    return { kicker: "Almost ready", text: "The Vambie team is giving it a final read.", art: "papers" as MascotName, cta: null };
  return { kicker: "Ready to publish", text: `Publish it to add it to ${possessive(childName)} book.`, art: "hug-book" as MascotName, cta: "publish" as const };
}

export default function StorybookHome() {
  const { id } = useParams();
  const { storybook, status, reload } = useStorybookData(id);
  const audio = useInlineAudio();
  const [publishing, setPublishing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  const publish = async (chapterId: string) => {
    setPublishing(chapterId);
    setError(null);
    try {
      await apiSend(`/api/chapters/${chapterId}/publish`, "PUT");
      reload(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't publish. Try again.");
    } finally {
      setPublishing(null);
    }
  };

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
  const child = storybook.child.displayName;

  if (storybook.memories.length === 0 && storybook.chapters.length === 0) return <EmptyStorybook storybook={storybook} />;

  const owner = storybook.me.role === "owner";
  const published = storybook.chapters.filter((c) => c.status === "published").sort((a, b) => b.sequence - a.sequence);
  const featured = published[0];
  const pendingSteps = owner
    ? storybook.chapters
        .filter((c) => c.status !== "published")
        .sort((a, b) => b.sequence - a.sequence)
        .map((c) => ({ chapter: c, step: chapterStep(c, child) }))
        .filter((x) => x.step)
        .slice(0, 2)
    : [];
  const waiting = storybook.memories.filter((m) => m.chapterIds.length === 0 && m.storyUseConsent && m.status !== "failed");
  const recent = storybook.memories.slice(0, 5);

  return (
    <div className="page page--nav">
      <TopBar wordmark avatar={`${base}/settings`} />
      <div className="pad">
        <h1 className="h-title" style={{ fontSize: 40, margin: "2px 0 16px" }}>
          {possessive(child)} story
        </h1>

        {pendingSteps.map(({ chapter, step }) => (
          <AttentionCard
            key={chapter.id}
            to={step!.cta === "pages" ? `${base}/chapters/${chapter.id}/pages` : undefined}
            art={step!.art}
            spinner={step!.spinner}
            kicker={step!.kicker}
            title={chapter.title}
            text={step!.text}
          >
            {step!.cta === "publish" && (
              <button className="btn btn--purple btn--sm btn--auto" style={{ marginTop: 10 }} onClick={() => void publish(chapter.id)} disabled={publishing === chapter.id}>
                {publishing === chapter.id ? "Publishing…" : "Publish chapter"}
              </button>
            )}
          </AttentionCard>
        ))}
        {error && <p className="error-text">{error}</p>}

        {featured ? (
          <Link to={`${base}/read/${featured.id}`} className="feature" style={{ marginTop: pendingSteps.length ? 14 : 0 }}>
            <div className="feature__image">
              {featured.cover && <img src={`/${featured.cover}`} alt="" />}
              {!featured.readAt && <span className="badge badge--pink badge--caps feature__badge">New chapter</span>}
            </div>
            <div className="feature__body">
              <div>
                <h2 className="feature__title">{featured.title}</h2>
                <span className="btn btn--sm btn--auto btn--caps btn--pill" style={{ background: "var(--white)", color: "var(--ink)" }}>
                  Read together <Chev />
                </span>
              </div>
              <span className="feature__chev">
                <Chev size={30} />
              </span>
            </div>
          </Link>
        ) : (
          pendingSteps.length === 0 && (
            <Link to={`${base}/this-week`} className="feature" style={{ display: "flex", alignItems: "center", gap: 12, padding: 16 }}>
              <Mascot name="open-book" style={{ width: 96 }} />
              <div>
                <h2 className="feature__title" style={{ fontSize: 28, margin: 0 }}>
                  A new chapter is taking shape.
                </h2>
                <p className="t-small" style={{ margin: "6px 0 0", opacity: 0.9 }}>
                  {storybook.generating ? "Writing it now…" : `Made ${weekday(storybook.nextChapterAt)} morning from this week's memories.`}
                </p>
              </div>
            </Link>
          )
        )}

        <Link className="btn btn--lime btn--caps" to={`${base}/record`} style={{ marginTop: 16 }}>
          <IconMic size={24} filled /> Record a memory <Chev />
        </Link>

        <Link to={`${base}/this-week`} className="week-card" style={{ marginTop: 12 }}>
          <span className="week-card__icon">{storybook.generating ? <IconSpinner size={24} /> : <IconBook size={24} />}</span>
          <span className="grow">
            <span className="week-card__title" style={{ display: "block" }}>
              This week's chapter
            </span>
            <span className="week-card__sub" style={{ display: "block" }}>
              {storybook.generating
                ? "Writing it now…"
                : waiting.length
                  ? `${waiting.length} ${waiting.length === 1 ? "memory" : "memories"} so far · made ${weekday(storybook.nextChapterAt)} morning`
                  : "Record a memory to start this week's chapter."}
            </span>
          </span>
          <Chev />
        </Link>

        <div className="section-label">Recent memories</div>
        {recent.length === 0 ? (
          <p className="t-small t-muted-dark">Memories the family records show up here.</p>
        ) : (
          recent.map((m) => (
            <MemoryListRow
              key={m.id}
              memory={m}
              to={`${base}/memories/${m.id}`}
              playing={audio.playingId === m.id}
              onPlay={() => m.audioSrc && audio.toggle(m.id, m.audioSrc)}
              showWho
            />
          ))
        )}
        {storybook.memories.length > recent.length && (
          <p style={{ margin: "12px 0 0" }}>
            <Link to={`${base}/memories?tab=memories`} className="tlink tlink--light">
              See all {storybook.memories.length} memories
            </Link>
          </p>
        )}
      </div>
      <BottomNav storybookId={storybook.id} />
    </div>
  );
}

function AttentionCard({
  to,
  art,
  spinner,
  kicker,
  title,
  text,
  children,
}: {
  to?: string;
  art?: MascotName;
  spinner?: boolean;
  kicker: string;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  const body = (
    <>
      {spinner ? (
        <span className="attention__art" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--purple)" }}>
          <IconSpinner size={44} />
        </span>
      ) : (
        art && <Mascot name={art} className="attention__art" />
      )}
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="attention__kicker" style={{ display: "block" }}>
          {kicker}
        </span>
        <span className="attention__title" style={{ display: "block" }}>
          {title}
        </span>
        <span className="attention__text" style={{ display: "block" }}>
          {text}
        </span>
        {children}
      </span>
      {to && <Chev size={22} />}
    </>
  );
  return to ? (
    <Link to={to} className="attention">
      {body}
    </Link>
  ) : (
    <div className="attention">{body}</div>
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
          {possessive(storybook.child.displayName)} story.
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
