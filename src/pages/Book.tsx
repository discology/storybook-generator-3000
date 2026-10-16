import { useMemo, useState, Fragment } from "react";
import { Link, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import AccessDenied from "../components/AccessDenied";
import { IconBookmark, IconChevronRight, IconMic, IconSpinner, IconStar } from "../components/icons";
import { Chev, Loading, Mascot } from "../components/ui";
import { useStorybookData } from "../hooks/useStorybookData";
import { apiSend } from "../lib/api";
import { waitingChapters } from "../lib/chapterStatus";
import { capitalize, chapterLabel, childLabel, formatDate, possessive } from "../lib/format";
import type { StorybookChapter } from "../types";

const DATE_RANGES = [
  { value: "all", label: "All dates" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 3 months" },
  { value: "365", label: "This past year" },
];

// The Book tab (VSB-136): every chapter in the book, newest first, with the
// owner's waiting ones and held pages at the top (VSB-129, VSB-134).
export default function Book() {
  const { id } = useParams();
  const { storybook, status } = useStorybookData(id);
  const [range, setRange] = useState("all");
  const [favorites, setFavorites] = useState(false);
  const [marks, setMarks] = useState<Record<string, boolean>>({});

  const chapters = useMemo(() => {
    if (!storybook) return [];
    const since = range === "all" ? 0 : Date.now() - Number(range) * 86400000;
    return storybook.chapters
      .filter((c) => c.status === "published")
      .filter((c) => new Date(c.publishedAt ?? c.createdAt).getTime() >= since)
      .filter((c) => !favorites || (marks[c.id] ?? c.favorite))
      .sort((a, b) => b.sequence - a.sequence);
  }, [storybook, range, favorites, marks]);

  if (status === "denied") return <AccessDenied />;
  if (!storybook) return <Loading />;

  const base = `/storybooks/${storybook.id}`;
  const child = childLabel(storybook.child.displayName, storybook.me?.role === "owner");
  const waitingForYou = storybook.me?.role === "owner" ? waitingChapters(storybook.chapters, child) : [];
  // Before the birth, a page a check held waits for the parent inside a chapter
  // that's already in the book (VSB-134).
  const heldInBook = storybook.me?.role === "owner" ? storybook.chapters.filter((c) => c.status === "published" && c.living && (c.heldPages ?? 0) > 0) : [];

  const toggleMark = async (c: StorybookChapter) => {
    const next = !(marks[c.id] ?? c.favorite);
    setMarks((m) => ({ ...m, [c.id]: next }));
    await apiSend(`/api/chapters/${c.id}/mark`, "PUT", { favorite: next }).catch(() => setMarks((m) => ({ ...m, [c.id]: !next })));
  };

  return (
    <div className="page page--nav">
      <TopBar wordmark avatar={`${base}/settings`} />
      <header className="masthead" style={{ paddingTop: 0, paddingBottom: 18 }}>
        <h1 className="h-display h-display--md masthead__title">{capitalize(`${possessive(child)} book.`)}</h1>
      </header>
      <div className="pad">
        {(waitingForYou.length > 0 || heldInBook.length > 0) && (
          <>
            <h2 className="section-label">Waiting for you</h2>
        {heldInBook.map((c) => (
          <Link key={c.id} to={`${base}/chapters/${c.id}/pages`} className="chapter-tile chapter-tile--waiting">
            <span className="chapter-tile__cover chapter-tile__cover--art">
              <Mascot name="peek-worried" />
            </span>
            <span className="chapter-tile__text">
              <span className="chapter-tile__label">{c.heldPages === 1 ? "A page needs a look" : `${c.heldPages} pages need a look`}</span>
              <span className="chapter-tile__title" style={{ display: "block" }}>{c.title}</span>
              <span className="chapter-tile__date">A check held it back. Fix it or approve it to add it to the book.</span>
            </span>
            <span className="chapter-tile__chev">
              <IconChevronRight size={22} />
            </span>
          </Link>
        ))}
            {waitingForYou.map(({ chapter, step }) => {
              const body = (
                <>
                  {chapter.cover ? (
                    <img src={`/${chapter.cover}`} alt="" className="chapter-tile__cover" />
                  ) : (
                    <span className="chapter-tile__cover chapter-tile__cover--art">{"spinner" in step && step.spinner ? <IconSpinner size={30} /> : <Mascot name={step.art ?? "open-book"} />}</span>
                  )}
                  <span className="chapter-tile__text">
                    <span className="chapter-tile__label">{step.kicker}</span>
                    <span className="chapter-tile__title" style={{ display: "block" }}>{chapter.title}</span>
                    <span className="chapter-tile__date">{step.text}</span>
                  </span>
                  {step.cta && (
                    <span className="chapter-tile__chev">
                      <IconChevronRight size={22} />
                    </span>
                  )}
                </>
              );
              return step.cta ? (
                <Link key={chapter.id} to={`${base}/chapters/${chapter.id}/pages`} className="chapter-tile chapter-tile--waiting">
                  {body}
                </Link>
              ) : (
                <div key={chapter.id} className="chapter-tile chapter-tile--waiting">
                  {body}
                </div>
              );
            })}
            <h2 className="section-label">In the book</h2>
          </>
        )}
        <div className="chips" style={{ margin: "16px 0" }}>
          <label className="chip">
            <span className="sr-only">Date range</span>
            <select value={range} onChange={(e) => setRange(e.target.value)}>
              {DATE_RANGES.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
            <IconChevronRight size={16} className="chip__chev" />
          </label>
          <button className={`chip ${favorites ? "chip--on" : ""}`} onClick={() => setFavorites((f) => !f)} aria-pressed={favorites}>
            <IconStar size={18} filled={favorites} /> Favorites
          </button>
        </div>
        {chapters.length === 0 ? (
          <EmptyCard
            art={favorites ? "magnifier" : "open-book"}
            title={favorites ? "No favorites yet." : waitingForYou.length ? "Nothing in the book yet." : "No chapters yet."}
            text={
              favorites
                ? "Tap the bookmark on a chapter to keep it here."
                : waitingForYou.length
                  ? "Chapters show up here once they're added to the book."
                  : "The week's memories become a new chapter each week."
            }
          />
        ) : (
          chapters.map((c, i) => {
            const marked = marks[c.id] ?? c.favorite;
            // One book, two parts: newest first, so "You're here" comes before "Before you arrive" (VSB-120).
            const hasBefore = chapters.some((x) => x.beforeBirth);
            const part = c.beforeBirth ? "Before you arrive" : "You’re here";
            const prevPart = i > 0 ? (chapters[i - 1].beforeBirth ? "Before you arrive" : "You’re here") : null;
            const divider = hasBefore && part !== prevPart ? <h2 className="section-label chapter-part">{part}</h2> : null;
            return (
              <Fragment key={c.id}>
              {divider}
              <div className="chapter-tile">
                <Link to={`${base}/read/${c.id}`} className="hstack" style={{ flex: 1, color: "inherit", textDecoration: "none", gap: 14, minWidth: 0 }}>
                  {c.cover ? <img src={`/${c.cover}`} alt="" className="chapter-tile__cover" /> : <span className="chapter-tile__cover" />}
                  <span className="chapter-tile__text">
                    <span className="chapter-tile__label">{chapterLabel(c.sequence)}</span>
                    <span className="chapter-tile__title" style={{ display: "block" }}>{c.title}</span>
                    <span className="chapter-tile__date">
                      {c.growing ? `Still being written · ${c.voices ?? 0} of ${c.voicesToFinish ?? 8} voices` : formatDate(c.publishedAt ?? c.createdAt)}
                    </span>
                  </span>
                  <span className="chapter-tile__chev">
                    <IconChevronRight size={22} />
                  </span>
                </Link>
                <button
                  className={`chapter-tile__mark ${marked ? "chapter-tile__mark--on" : ""}`}
                  onClick={() => void toggleMark(c)}
                  aria-pressed={marked}
                  aria-label={marked ? "Remove bookmark" : "Bookmark this chapter"}
                >
                  <IconBookmark size={24} filled={marked} />
                </button>
              </div>
              </Fragment>
            );
          })
        )}

        <Link className="btn btn--lime btn--caps" to={`${base}/record`} style={{ marginTop: 20 }}>
          <IconMic size={24} filled /> Record a memory <Chev />
        </Link>
      </div>
      <BottomNav storybookId={storybook.id} />
    </div>
  );
}

function EmptyCard({ art, title, text }: { art: "magnifier" | "open-book" | "mic"; title: string; text: string }) {
  return (
    <div className="card card--dark" style={{ textAlign: "center", marginTop: 8 }}>
      <Mascot name={art} style={{ width: 120, display: "block", margin: "0 auto" }} />
      <p className="h-title h-title--sm" style={{ marginTop: 6 }}>{title}</p>
      <p className="t-small t-muted-dark" style={{ margin: "6px 0 0" }}>{text}</p>
    </div>
  );
}

