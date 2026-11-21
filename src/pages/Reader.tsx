import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import PagePicture from "../components/PagePicture";
import AccessDenied from "../components/AccessDenied";
import { IconBookmark, IconChevronLeft, IconChevronRight, IconClose, IconPause, IconPeople, IconPlay, IconSparkle } from "../components/icons";
import { BottomSheet, Loading, MorphSlot, Switch } from "../components/ui";
import { useStorybookData } from "../hooks/useStorybookData";
import { apiGet, apiSend, ApiError } from "../lib/api";
import { capitalize, chapterLabel, possessive } from "../lib/format";
import type { ReaderChapter } from "../types";

type Paper = "cream" | "white" | "dark";
type TurnDir = 1 | -1 | 0;
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

function rubberband(dx: number, dimension: number, constant = 0.55): number {
  const abs = Math.abs(dx);
  if (abs === 0 || dimension <= 0) return 0;
  const damped = (1 - 1 / ((abs * constant) / dimension + 1)) * dimension;
  return dx < 0 ? -damped : damped;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function ReaderOrnament({ size = 20, draw = false }: { size?: number; draw?: boolean }) {
  return (
    <div className={`reader__ornament ${draw ? "reader__ornament--draw" : ""}`.trim()} aria-hidden="true">
      <svg className="reader__ornament-rule reader__ornament-rule--left" width="70" height="4" viewBox="0 0 70 4">
        <line x1="70" y1="2" x2="0" y2="2" pathLength={100} />
      </svg>
      <IconSparkle size={size} />
      <svg className="reader__ornament-rule reader__ornament-rule--right" width="70" height="4" viewBox="0 0 70 4">
        <line x1="0" y1="2" x2="70" y2="2" pathLength={100} />
      </svg>
    </div>
  );
}

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
// A featured sample story (VSB-141) opens in the same reader, read-only and
// without signing in: no bookmarks, reading marks or grown-ups page, and it
// ends with "Make your own story".
export function PublicStory() {
  const { slug } = useParams();
  return <Reader publicSlug={slug} />;
}

interface PublicStoryData {
  slug: string;
  title: string;
  pages: ReaderChapter["pages"];
}

const asChapter = (s: PublicStoryData): ReaderChapter => ({
  id: s.slug,
  title: s.title,
  sequence: 0,
  status: "published",
  content: "",
  publishedAt: null,
  pages: s.pages,
  mark: null,
  storybook: { id: "", title: "", childName: "" },
  nextChapterId: null,
  previousChapterId: null,
  canShare: false,
});

interface DragState {
  pointerId: number;
  startX: number;
  startY: number;
  startTime: number;
  axis: "none" | "x" | "y";
  dx: number;
}

export default function Reader({ publicSlug }: { publicSlug?: string }) {
  const { id, chapterId } = useParams();
  const isPublic = Boolean(publicSlug);
  const navigate = useNavigate();
  const [chapter, setChapter] = useState<ReaderChapter | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "denied" | "missing">("loading");
  const [index, setIndex] = useState(0);
  const [turnDir, setTurnDir] = useState<TurnDir>(0);
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs);
  const [controls, setControls] = useState(false);
  const [barsShown, setBarsShown] = useState(true);
  const [favorite, setFavorite] = useState(false);
  const wide = useMediaQuery("(min-width: 900px) and (min-aspect-ratio: 5/4)");
  const dragRef = useRef<DragState | null>(null);
  const suppressTapRef = useRef(false);
  const pageRef = useRef<HTMLDivElement | null>(null);
  const activeAnimRef = useRef<Animation | null>(null);
  // The speaker's voice on pre-birth pages (VSB-118): one player for the chapter.
  const voiceRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => {
    voiceRef.current?.pause();
    setPlaying(null);
  }, [index]);
  const toggleVoice = (src: string) => {
    const audio = voiceRef.current;
    if (!audio) return;
    if (playing === src) {
      audio.pause();
      setPlaying(null);
      return;
    }
    audio.src = src;
    void audio.play().then(() => setPlaying(src)).catch(() => setPlaying(null));
  };

  useEffect(() => {
    setState("loading");
    setIndex(0);
    setTurnDir(0);
    if (publicSlug) {
      apiGet(`/api/public/stories/${encodeURIComponent(publicSlug)}`)
        .then((s: PublicStoryData) => {
          setChapter(asChapter(s));
          setState("ready");
        })
        .catch(() => setState("missing"));
      return;
    }
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
  }, [chapterId, publicSlug, navigate]);

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
  // A chapter with a question for the grown-ups gets its own page after the end (VSB-128).
  const grownUpsIndex = chapter?.reflection || chapter?.lesson ? pages.length + 1 : null;
  const maxIndex = grownUpsIndex ?? pages.length;
  const onGrownUps = grownUpsIndex !== null && index === grownUpsIndex;

  const go = useCallback(
    (next: number, dir?: TurnDir) => {
      if (!chapter) return;
      const clamped = Math.max(0, Math.min(maxIndex, next));
      if (clamped === index) return;
      const resolvedDir: TurnDir = dir !== undefined ? dir : clamped > index ? 1 : -1;
      setTurnDir(resolvedDir);
      setIndex(clamped);
      pageRef.current?.scrollTo({ top: 0 });
      if (isPublic) return;
      if (clamped < pages.length) void apiSend(`/api/chapters/${chapter.id}/mark`, "PUT", { lastPage: clamped }).catch(() => undefined);
      else void apiSend(`/api/chapters/${chapter.id}/mark`, "PUT", { finished: true }).catch(() => undefined);
    },
    [chapter, pages.length, maxIndex, index, isPublic]
  );

  // Emil's Keyboard Rule: ArrowLeft / ArrowRight pass turnDir = 0 for instant 0ms turns.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (controls) return;
      if (e.key === "ArrowRight") go(index + 1, 0);
      if (e.key === "ArrowLeft") go(index - 1, 0);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, controls]);

  // WAAPI directional page turn for touch swipes & button taps (skipped when turnDir === 0).
  useLayoutEffect(() => {
    const el = pageRef.current;
    if (!el) return;
    activeAnimRef.current?.cancel();
    el.style.transform = "";
    el.style.transition = "";
    if (turnDir === 0) return;

    if (prefersReducedMotion()) {
      activeAnimRef.current = el.animate([{ opacity: 0.4 }, { opacity: 1 }], {
        duration: 180,
        easing: "cubic-bezier(0.23, 1, 0.32, 1)",
      });
      return;
    }

    if (wide && el.classList.contains("reader__spread")) {
      el.style.transformOrigin = "50% 50%";
      activeAnimRef.current = el.animate(
        [
          { transform: `perspective(1400px) rotateY(${-4 * turnDir}deg)`, opacity: 0.4 },
          { transform: "perspective(1400px) rotateY(0deg)", opacity: 1 },
        ],
        { duration: 280, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }
      );
    } else {
      activeAnimRef.current = el.animate(
        [
          { transform: `translateX(${16 * turnDir}px)`, opacity: 0 },
          { transform: "translateX(0px)", opacity: 1 },
        ],
        { duration: 240, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }
      );
    }
  }, [index, turnDir, wide]);

  const snapBackPage = () => {
    const el = pageRef.current;
    if (!el) return;
    if (prefersReducedMotion()) {
      el.style.transform = "";
      return;
    }
    el.style.transition = "transform 300ms var(--ease-drawer)";
    el.style.transform = "translateX(0px)";
    const clear = () => {
      el.style.transition = "";
      el.style.transform = "";
      el.removeEventListener("transitionend", clear);
    };
    el.addEventListener("transitionend", clear);
  };

  const onFramePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (controls || (e.pointerType === "mouse" && e.button !== 0)) return;
    // Ignore pointer drags originating on interactive controls inside the page
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, a, input, select, textarea")) return;
    if (dragRef.current) return; // Multi-touch protection
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTime: Date.now(),
      axis: "none",
      dx: 0,
    };
  };

  const onFramePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    const rawDx = e.clientX - d.startX;
    const rawDy = e.clientY - d.startY;

    if (d.axis === "none") {
      if (Math.abs(rawDx) < 10 && Math.abs(rawDy) < 10) return;
      if (Math.abs(rawDx) > Math.abs(rawDy)) {
        d.axis = "x";
        e.currentTarget.setPointerCapture?.(e.pointerId);
        activeAnimRef.current?.cancel();
        if (pageRef.current) pageRef.current.style.transition = "none";
      } else {
        d.axis = "y";
        dragRef.current = null;
        return;
      }
    }

    if (d.axis === "x") {
      d.dx = rawDx;
      const el = pageRef.current;
      if (!el) return;
      const width = el.offsetWidth || 360;
      const atStartEdge = index === 0 && rawDx > 0;
      const atEndEdge = index >= maxIndex && rawDx < 0;
      const visualX = atStartEdge || atEndEdge ? rubberband(rawDx, width, 0.55) : rawDx;
      if (!prefersReducedMotion()) {
        el.style.transform = `translateX(${visualX}px)`;
      }
    }
  };

  const finishPointerDrag = (e: React.PointerEvent<HTMLDivElement>, cancelled = false) => {
    const d = dragRef.current;
    if (!d || d.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (d.axis !== "x") return;

    suppressTapRef.current = true;
    setTimeout(() => {
      suppressTapRef.current = false;
    }, 50);

    if (cancelled) {
      snapBackPage();
      return;
    }

    const dx = e.clientX - d.startX;
    const elapsed = Math.max(1, Date.now() - d.startTime);
    const velocity = Math.abs(dx) / elapsed;
    const shouldFlip = Math.abs(dx) > 60 || velocity > 0.11;

    if (shouldFlip && dx < 0 && index < maxIndex) {
      if (pageRef.current) {
        pageRef.current.style.transition = "";
        pageRef.current.style.transform = "";
      }
      go(index + 1, 1);
    } else if (shouldFlip && dx > 0 && index > 0) {
      if (pageRef.current) {
        pageRef.current.style.transition = "";
        pageRef.current.style.transform = "";
      }
      go(index - 1, -1);
    } else {
      snapBackPage();
    }
  };

  const toggleFavorite = async () => {
    if (!chapter) return;
    const next = !favorite;
    setFavorite(next);
    await apiSend(`/api/chapters/${chapter.id}/mark`, "PUT", { favorite: next }).catch(() => {
      setFavorite(!next);
      toast.error("Couldn't save bookmark");
    });
  };

  if (state === "denied") return <AccessDenied />;
  if (state === "missing" && isPublic)
    return (
      <div className="page">
        <p className="loading">This story isn't available.</p>
        <p className="t-center">
          <Link to="/try" className="btn btn--lime btn--caps" style={{ display: "inline-flex", width: "auto" }}>
            Make your own story <IconChevronRight size={20} />
          </Link>
        </p>
      </div>
    );
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
    if (suppressTapRef.current) return;
    if (prefs.hide) setBarsShown((s) => !s);
  };

  const chapterHead = (
    <header className="reader__head">
      <span className="reader__chapter">
        {isPublic ? "A Vambie story" : chapterLabel(chapter.sequence)}
        {chapter.beforeBirth ? " · Before you arrive" : ""}
        {chapter.growing ? " · Still being written" : ""}
      </span>
      <h1 className="reader__title">{chapter.title}</h1>
    </header>
  );
  const isVoicePlaying = Boolean(page.voice?.src && playing === page.voice.src);
  const words = page.text ? (
    <div className={`reader__text ${page.image ? "" : "reader__text--only"}`} style={{ fontSize: `${(wide ? 27 : 22) * textSize}px` }}>
      {paragraphs(page.text).map((p, i) => (
        <p key={i}>{p}</p>
      ))}
      {page.voice?.src && (
        // Before the birth, the person's own voice, under their words (VSB-118).
        <button
          type="button"
          className={`reader__voice ${isVoicePlaying ? "reader__voice--on" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            toggleVoice(page.voice!.src!);
          }}
        >
          <span className="reader__voice-icon">
            <MorphSlot
              active={isVoicePlaying ? "playing" : "idle"}
              items={[
                { key: "idle", content: <IconPlay size={16} /> },
                { key: "playing", content: <IconPause size={16} /> },
              ]}
            />
          </span>
          <MorphSlot
            active={isVoicePlaying ? "playing" : "idle"}
            items={[
              { key: "idle", content: `Hear ${page.voice.name} say it` },
              { key: "playing", content: `Listening to ${page.voice.name}` },
            ]}
          />
          {page.voice.durationSec ? <span className="reader__voice-time">{Math.floor(page.voice.durationSec / 60)}:{String(page.voice.durationSec % 60).padStart(2, "0")}</span> : null}
        </button>
      )}
    </div>
  ) : null;
  const picture = page.image ? (
    <div
      className={`reader__pic ${
        wide ? "" : page.pictureSize === "full" ? "reader__pic--full" : page.pictureSize === "wordless" ? "reader__pic--wordless" : "reader__pic--inset"
      }`}
    >
      <PagePicture src={`/${page.image}`} size={page.pictureSize} alt={page.visibleAction} instant={turnDir === 0} />
    </div>
  ) : null;

  // The chapter's wordless moment if it has one, else its last picture.
  const endingPicture = (pages.find((p) => p.pictureSize === "wordless" && p.image) ?? [...pages].reverse().find((p) => p.image))?.image;
  const nextOrClose = chapter.nextChapterId ? (
    <Link className="btn btn--outline" to={`${base}/read/${chapter.nextChapterId}`}>
      Next chapter <IconChevronRight size={20} />
    </Link>
  ) : (
    <Link className="btn btn--outline" to={base}>
      Close the book
    </Link>
  );
  const toCheck = chapter.pagesToCheck ?? 0;
  const grownUpLinks = (feedbackLabel: string) => (
    <>
      {chapter.canShare && (
        // Chapters go into the book on their own (VSB-137); the owner can still fix a page.
        <p style={{ marginTop: 16 }}>
          <Link to={`${base}/chapters/${chapter.id}/pages`} className="tlink" style={{ fontSize: 17 }}>
            Edit pages{toCheck ? ` · ${toCheck === 1 ? "1 page" : `${toCheck} pages`} to check` : ""}
          </Link>
        </p>
      )}
      {chapter.canShare && (
        <p style={{ marginTop: 14 }}>
          <Link to={`${base}/chapters/${chapter.id}/share`} className="tlink" style={{ fontSize: 17 }}>
            Send this chapter to family
          </Link>
        </p>
      )}
      <p style={{ marginTop: 14 }}>
        <Link to={`${base}/chapters/${chapter.id}/feedback`} className="tlink" style={{ display: "inline-flex", gap: 8, alignItems: "center", fontWeight: 500, fontSize: 16 }}>
          <IconPeople size={20} /> {feedbackLabel}
        </Link>
      </p>
    </>
  );
  const ending = (
    <div className="ending">
      <span className="reader__chapter">{isPublic ? "A Vambie story" : chapterLabel(chapter.sequence)}</span>
      <h1 className="ending__line">{chapter.title}</h1>
      {endingPicture && (
        <div className="reader__pic reader__pic--inset" style={{ maxWidth: 360, margin: "0 auto" }}>
          <PagePicture src={`/${endingPicture}`} size="framed" alt="" instant={turnDir === 0} />
        </div>
      )}
      <ReaderOrnament size={20} draw={turnDir !== 0} />
      {chapter.growing ? (
        // Before the birth the chapter grows a page per message (VSB-134).
        <div className="ending__growing">
          <p className="ending__end">Still being written</p>
          <p className="ending__count">
            {chapter.voices ?? 0} of {chapter.voicesToFinish ?? 8} voices so far
          </p>
          <p className="ending__note">
            A new page arrives each time someone in the family records a message. This chapter finishes at {chapter.voicesToFinish ?? 8} voices, or sooner if someone already in it adds another message.
          </p>
        </div>
      ) : (
        <p className="ending__end">{isPublic ? "The end" : `End of chapter ${chapter.sequence}`}</p>
      )}
      {isPublic ? (
        <div className="stack" style={{ marginTop: 22, maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>
          <Link className="btn btn--lime btn--caps" to="/try">
            Make your own story <IconChevronRight size={20} />
          </Link>
          <button className="btn btn--outline" onClick={() => go(0, -1)}>
            Read again
          </button>
        </div>
      ) : (
        <div className="stack" style={{ marginTop: 22, maxWidth: 380, marginLeft: "auto", marginRight: "auto" }}>
          <button className="btn btn--purple" onClick={() => go(0, -1)}>
            Read again
          </button>
          {nextOrClose}
        </div>
      )}
      {isPublic ? null : grownUpsIndex !== null ? (
        <p style={{ marginTop: 18 }}>
          <button type="button" className="tlink" style={{ display: "inline-flex", gap: 6, alignItems: "center", fontSize: 17 }} onClick={() => go(grownUpsIndex, 1)}>
            For the grown-ups <IconChevronRight size={18} />
          </button>
        </p>
      ) : (
        grownUpLinks("For grown-ups: story feedback")
      )}
    </div>
  );

  // For the grown-ups: the chapter's question on a page of its own, after the
  // child's ending, with sharing and story feedback (VSB-128). Nothing to answer.
  const grownUps = (
    <div className="ending grown-ups">
      <span className="reader__chapter">{chapterLabel(chapter.sequence)}</span>
      <p className="grown-ups__label">For the grown-ups</p>
      {chapter.lesson && (
        // A lesson story names its lesson here, never on the child's pages (VSB-147).
        <>
          <p className="grown-ups__lesson-label">The lesson in this story</p>
          <p className="grown-ups__lesson" style={{ fontSize: `${(wide ? 22 : 19) * textSize}px` }}>
            {chapter.lesson}
          </p>
        </>
      )}
      {chapter.reflection && (
        <p className="grown-ups__question" style={{ fontSize: `${(wide ? 32 : 26) * textSize}px` }}>
          {chapter.reflection}
        </p>
      )}
      <ReaderOrnament size={20} draw={turnDir !== 0} />
      <div className="stack" style={{ marginTop: 18, maxWidth: 380, width: "100%", marginLeft: "auto", marginRight: "auto" }}>
        {nextOrClose}
      </div>
      {grownUpLinks("Story feedback")}
    </div>
  );

  return (
    <div className={`reader reader--${prefs.paper} ${hidden ? "reader--hidden" : ""}`}>
      {/* One player for the whole chapter, always mounted: it lived in the chapter
          header, which only shows on the first page, so voices on later pages never played. */}
      <audio ref={voiceRef} preload="none" onEnded={() => setPlaying(null)} />
      <div className="reader__top">
        {isPublic ? (
          <span className="tbar__icon" aria-hidden="true" />
        ) : ended ? (
          <Link to={base} className="tbar__icon" aria-label="Close the book">
            <IconClose size={28} />
          </Link>
        ) : (
          <Link to={base} className="tbar__back" aria-label="Back">
            <IconChevronLeft size={28} strokeWidth={2.4} />
          </Link>
        )}
        <span className="tbar__title" title={ended || isPublic ? undefined : capitalize(`${possessive(chapter.storybook.childName)} story`)}>
          {ended || isPublic ? "" : capitalize(`${possessive(chapter.storybook.childName)} story`)}
        </span>
        <div className="tbar__right">
          {!ended && (
            <button className="tbar__icon" onClick={() => setControls(true)} aria-label="Reading settings">
              Aa
            </button>
          )}
          {!isPublic && (
            <button className="tbar__icon" onClick={() => void toggleFavorite()} aria-pressed={favorite} aria-label={favorite ? "Remove bookmark" : "Bookmark this chapter"}>
              <IconBookmark size={26} filled={favorite} />
            </button>
          )}
        </div>
      </div>

      <div
        className="reader__frame"
        onClick={onTap}
        onPointerDown={onFramePointerDown}
        onPointerMove={onFramePointerMove}
        onPointerUp={(e) => finishPointerDrag(e, false)}
        onPointerCancel={(e) => finishPointerDrag(e, true)}
      >
        {ended ? (
          <div className="reader__page" ref={pageRef} style={{ maxWidth: wide ? 760 : 480 }}>
            {onGrownUps ? grownUps : ending}
          </div>
        ) : wide ? (
          <div className="reader__page reader__spread" ref={pageRef}>
            <div className="reader__left">
              {picture ?? <ReaderOrnament size={30} />}
            </div>
            <div className="reader__right">
              {index === 0 && chapterHead}
              {words ?? <ReaderOrnament size={22} />}
              {index === pages.length - 1 && <ReaderOrnament size={18} draw={turnDir !== 0} />}
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
          <button className="reader__nav-btn" onClick={() => go(index - 1, -1)} disabled={index === 0}>
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
          <button className="reader__next" onClick={() => go(index + 1, 1)}>
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
