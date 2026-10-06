import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import PagePicture from "../components/PagePicture";
import AccessDenied from "../components/AccessDenied";
import { IconBookmark, IconChevronLeft, IconChevronRight, IconClose, IconPeople, IconSparkle } from "../components/icons";
import { BottomSheet, Loading, Switch } from "../components/ui";
import { useStorybookData } from "../hooks/useStorybookData";
import { apiGet, apiSend, ApiError } from "../lib/api";
import { chapterLabel, possessive } from "../lib/format";
import type { ReaderChapter } from "../types";

type Paper = "cream" | "white" | "dark";
interface Prefs {
  size: number;
  paper: Paper;
  hide: boolean;
}

const PREFS_KEY = "vambie:reader";
const SIZES = [0.82, 0.9, 1, 1.12, 1.25, 1.4];
const PAPERS: { value: Paper; label: string; swatch: string }[] = [
  { value: "cream", label: "Cream", swatch: "#fbf5ea" },
  { value: "white", label: "White", swatch: "#ffffff" },
  { value: "dark", label: "Dark", swatch: "#17161b" },
];

function loadPrefs(): Prefs {
  try {
    return { size: 2, paper: "cream", hide: false, ...JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}") };
  } catch {
    return { size: 2, paper: "cream", hide: false };
  }
}

function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const onChange = () => setMatches(list.matches);
    list.addEventListener("change", onChange);
    return () => list.removeEventListener("change", onChange);
  }, [query]);
  return matches;
}

const paragraphs = (text: string) => text.split(/\n+/).filter((p) => p.trim());

// Reading a chapter together: one page per screen on phones, a two-page
// spread on tablets in landscape. Display settings never change the words.
export default function Reader() {
  const { id, chapterId } = useParams();
  const navigate = useNavigate();
  const [chapter, setChapter] = useState<ReaderChapter | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "denied" | "missing">("loading");
  const [index, setIndex] = useState(0);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [controls, setControls] = useState(false);
  const [barsShown, setBarsShown] = useState(true);
  const [favorite, setFavorite] = useState(false);
  const wide = useMediaQuery("(min-width: 900px) and (min-aspect-ratio: 5/4)");
  const touchX = useRef<number | null>(null);
  const pageRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setState("loading");
    setIndex(0);
    apiGet(`/api/chapters/${chapterId}/read`)
      .then((c: ReaderChapter) => {
        setChapter(c);
        setFavorite(c.mark?.favorite ?? false);
        setState("ready");
        void apiSend(`/api/chapters/${c.id}/mark`, "PUT", { opened: true }).catch(() => undefined);
      })
      .catch((err: ApiError) => {
        if (err.status === 401) navigate(`/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
        else setState(err.status === 403 ? "denied" : "missing");
      });
  }, [chapterId, navigate]);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // storage may be unavailable
    }
  }, [prefs]);

  // Keep the screen on while reading at bedtime.
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => undefined);
    return () => void lock?.release().catch(() => undefined);
  }, []);

  const pages: ReaderChapter["pages"] = chapter
    ? chapter.pages.length
      ? chapter.pages
      : [{ id: "text", pageNumber: 1, text: chapter.content, pictureSize: "none", visibleAction: "", image: null }]
    : [];
  const ended = index >= pages.length;

  const go = useCallback(
    (next: number) => {
      if (!chapter) return;
      const clamped = Math.max(0, Math.min(pages.length, next));
      setIndex(clamped);
      pageRef.current?.scrollTo({ top: 0 });
      if (clamped < pages.length) void apiSend(`/api/chapters/${chapter.id}/mark`, "PUT", { lastPage: clamped }).catch(() => undefined);
      else void apiSend(`/api/chapters/${chapter.id}/mark`, "PUT", { finished: true }).catch(() => undefined);
    },
    [chapter, pages.length]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (controls) return;
      if (e.key === "ArrowRight") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, controls]);

  const toggleFavorite = async () => {
    if (!chapter) return;
    const next = !favorite;
    setFavorite(next);
    await apiSend(`/api/chapters/${chapter.id}/mark`, "PUT", { favorite: next }).catch(() => setFavorite(!next));
  };

  if (state === "denied") return <AccessDenied />;
  if (state === "missing")
    return (
      <div className="page">
        <p className="loading">This chapter isn't available.</p>
        <p className="t-center">
          <Link to={`/storybooks/${id}`} className="tlink tlink--light">
            Back to the storybook
          </Link>
        </p>
      </div>
    );
  if (!chapter) return <Loading />;

  const base = `/storybooks/${chapter.storybook.id}`;
  const page = pages[Math.min(index, pages.length - 1)];
  const hidden = prefs.hide && !barsShown;
  const textSize = SIZES[prefs.size] ?? 1;

  const onTap = () => {
    if (prefs.hide) setBarsShown((s) => !s);
  };

  const chapterHead = (
    <header className="reader__head">
      <span className="reader__chapter">{chapterLabel(chapter.sequence)}</span>
      <h1 className="reader__title">{chapter.title}</h1>
    </header>
  );
  const words = page.text ? (
    <div className={`reader__text ${page.image ? "" : "reader__text--only"}`} style={{ fontSize: `${(wide ? 27 : 22) * textSize}px` }}>
      {paragraphs(page.text).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
    </div>
  ) : null;
  const picture = page.image ? (
    <div
      className={`reader__pic ${
        wide ? "" : page.pictureSize === "full" ? "reader__pic--full" : page.pictureSize === "wordless" ? "reader__pic--wordless" : "reader__pic--inset"
      }`}
    >
      <PagePicture src={`/${page.image}`} size={page.pictureSize} alt={page.visibleAction} />
    </div>
  ) : null;

  // The chapter's wordless moment if it has one, else its last picture.
  const endingPicture = (pages.find((p) => p.pictureSize === "wordless" && p.image) ?? [...pages].reverse().find((p) => p.image))?.image;
  const ending = (
    <div className="ending">
      <span className="reader__chapter">{chapterLabel(chapter.sequence)}</span>
      <h1 className="ending__line">{chapter.title}</h1>
      {endingPicture && (
        <div className="reader__pic reader__pic--inset" style={{ maxWidth: 360, margin: "0 auto" }}>
          <PagePicture src={`/${endingPicture}`} size="framed" alt="" />
        </div>
      )}
      <div className="reader__ornament" aria-hidden="true">
        <IconSparkle size={20} />
      </div>
      <p className="ending__end">End of chapter {chapter.sequence}</p>
      <div className="stack" style={{ marginTop: 22, maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>
        <button className="btn btn--purple" onClick={() => go(0)}>
          Read again
        </button>
        {chapter.nextChapterId ? (
          <Link className="btn btn--outline" to={`${base}/read/${chapter.nextChapterId}`}>
            Next chapter <IconChevronRight size={20} />
          </Link>
        ) : (
          <Link className="btn btn--outline" to={base}>
            Close the book
          </Link>
        )}
      </div>
      {chapter.canShare && (
        <p style={{ marginTop: 16 }}>
          <Link to={`${base}/chapters/${chapter.id}/share`} className="tlink" style={{ fontSize: 17 }}>
            Send this chapter to family
          </Link>
        </p>
      )}
      <p style={{ marginTop: 14 }}>
        <Link to={`${base}/chapters/${chapter.id}/feedback`} className="tlink" style={{ display: "inline-flex", gap: 8, alignItems: "center", fontWeight: 500, fontSize: 16 }}>
          <IconPeople size={20} /> For grown-ups: story feedback
        </Link>
      </p>
    </div>
  );

  return (
    <div
      className={`reader reader--${prefs.paper} ${hidden ? "reader--hidden" : ""}`}
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 60) go(index + (dx < 0 ? 1 : -1));
      }}
    >
      <div className="reader__top">
        {ended ? (
          <Link to={base} className="tbar__icon" aria-label="Close the book">
            <IconClose size={28} />
          </Link>
        ) : (
          <Link to={base} className="tbar__back" aria-label="Back">
            <IconChevronLeft size={28} strokeWidth={2.4} />
          </Link>
        )}
        <span className="tbar__title">{ended ? "" : `${possessive(chapter.storybook.childName)} story`}</span>
        <div className="tbar__right">
          {!ended && (
            <button className="tbar__icon" onClick={() => setControls(true)} aria-label="Reading settings">
              Aa
            </button>
          )}
          <button className="tbar__icon" onClick={() => void toggleFavorite()} aria-pressed={favorite} aria-label={favorite ? "Remove bookmark" : "Bookmark this chapter"}>
            <IconBookmark size={26} filled={favorite} />
          </button>
        </div>
      </div>

      <div className="reader__frame" onClick={onTap}>
        {ended ? (
          <div className="reader__page" ref={pageRef} style={{ maxWidth: wide ? 760 : 480 }}>
            {ending}
          </div>
        ) : wide ? (
          <div className="reader__page reader__spread" ref={pageRef}>
            <div className="reader__left">
              {picture ?? (
                <div className="reader__ornament" style={{ fontSize: 30 }}>
                  <IconSparkle size={30} />
                </div>
              )}
            </div>
            <div className="reader__right">
              {index === 0 && chapterHead}
              {words}
              {index === pages.length - 1 && (
                <div className="reader__ornament" aria-hidden="true">
                  <IconSparkle size={18} />
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="reader__page" ref={pageRef}>
            {index === 0 && chapterHead}
            {picture}
            {words}
          </div>
        )}
      </div>

      {!ended && (
        <nav className="reader__bottom" aria-label="Pages">
          <button className="reader__nav-btn" onClick={() => go(index - 1)} disabled={index === 0}>
            <IconChevronLeft size={22} /> Previous
          </button>
          <div className="reader__count">
            <span>
              {index + 1} / {pages.length}
            </span>
            {pages.length <= 12 && (
              <span className="reader__dots" aria-hidden="true">
                {pages.map((p, i) => (
                  <span key={p.id} className={i === index ? "on" : ""} />
                ))}
              </span>
            )}
          </div>
          <button className="reader__next" onClick={() => go(index + 1)}>
            {index === pages.length - 1 ? "The end" : "Next page"} <IconChevronRight size={20} />
          </button>
        </nav>
      )}

      <BottomSheet open={controls} onClose={() => setControls(false)} label="Reading settings">
        <ReaderControls prefs={prefs} setPrefs={setPrefs} onDone={() => setControls(false)} />
      </BottomSheet>
    </div>
  );
}

function ReaderControls({ prefs, setPrefs, onDone }: { prefs: Prefs; setPrefs: (p: Prefs) => void; onDone: () => void }) {
  const size = SIZES[prefs.size] ?? 1;
  const row = (label: string, child: ReactNode) => (
    <div style={{ marginTop: 18 }}>
      <p className="h-section" style={{ fontSize: 19, margin: "0 0 10px" }}>
        {label}
      </p>
      {child}
    </div>
  );
  return (
    <div>
      <div className="kv-row">
        <h2 style={{ fontFamily: "var(--font-book)", fontWeight: 600, fontSize: 28, margin: 0 }}>Make yourself comfortable</h2>
        <button className="tbar__icon" style={{ color: "var(--ink)" }} onClick={onDone} aria-label="Close">
          <IconClose size={26} />
        </button>
      </div>
      {row(
        "Text size",
        <div className="size-row">
          <button className="size-btn" onClick={() => setPrefs({ ...prefs, size: Math.max(0, prefs.size - 1) })} disabled={prefs.size === 0} aria-label="Smaller text">
            A−
          </button>
          <span className="size-preview" style={{ fontSize: `${19 * size}px` }}>
            A little light stayed close.
          </span>
          <button className="size-btn" onClick={() => setPrefs({ ...prefs, size: Math.min(SIZES.length - 1, prefs.size + 1) })} disabled={prefs.size === SIZES.length - 1} aria-label="Bigger text">
            A+
          </button>
        </div>
      )}
      <hr className="divider" />
      {row(
        "Page color",
        <div className="paper-choices" role="radiogroup">
          {PAPERS.map((p) => (
            <button key={p.value} role="radio" aria-checked={prefs.paper === p.value} className={`paper-choice ${prefs.paper === p.value ? "paper-choice--on" : ""}`} onClick={() => setPrefs({ ...prefs, paper: p.value })}>
              <span style={{ background: p.swatch }} />
              <span>{p.label}</span>
            </button>
          ))}
        </div>
      )}
      <hr className="divider" />
      <div className="toggle-row">
        <div>
          <p className="h-section" style={{ fontSize: 19, margin: 0 }}>Hide controls while reading</p>
          <p className="t-small t-muted" style={{ marginTop: 2 }}>Tap the page to bring controls back.</p>
        </div>
        <Switch checked={prefs.hide} onChange={(hide) => setPrefs({ ...prefs, hide })} label="Hide controls while reading" />
      </div>
      <button className="btn btn--purple" style={{ marginTop: 22 }} onClick={onDone}>
        Done
      </button>
      <p className="t-center t-small t-muted" style={{ marginTop: 10 }}>Display settings only. Story wording stays the same.</p>
    </div>
  );
}

// "/storybooks/:id/read": opens the newest published chapter.
export function ReadLatest() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { storybook, status } = useStorybookData(id);
  useEffect(() => {
    if (!storybook) return;
    const latest = storybook.chapters.filter((c) => c.status === "published").sort((a, b) => b.sequence - a.sequence)[0];
    navigate(latest ? `/storybooks/${storybook.id}/read/${latest.id}` : `/storybooks/${storybook.id}`, { replace: true });
  }, [storybook, navigate]);
  if (status === "denied") return <AccessDenied />;
  return <Loading />;
}
