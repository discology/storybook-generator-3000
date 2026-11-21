import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { IconBookmark, IconChevronLeft, IconChevronRight, IconSparkle } from "../components/icons";

interface SamplePage {
  id: string;
  pageNumber: number;
  image: string;
  alt: string;
  text: string;
}

const SAMPLE_PAGES: SamplePage[] = [
  {
    id: "p1",
    pageNumber: 1,
    image: "/art/how/nudge.jpg",
    alt: "Warm evening lamplight across a kitchen table while rain taps on the window",
    text: "On Sunday evening, Grandma called just as the rain began to tap against the kitchen window.\n\nMia pressed both hands to the cool glass, counting every drop that raced to the sill.",
  },
  {
    id: "p2",
    pageNumber: 2,
    image: "/art/how/reflect.jpg",
    alt: "Grandmother smiling into her phone while remembering a small childhood story",
    text: "“Tell me about the yellow boots again,” Mia whispered.\n\nSo Grandma told her how every puddle in October used to look like a tiny mirror waiting for a jump.",
  },
  {
    id: "p3",
    pageNumber: 3,
    image: "/art/how/book.jpg",
    alt: "Baby Vambie standing inside an open picture book surrounded by soft threads of light",
    text: "Baby Vambie tucked the puddle and the laughter between two warm cream pages, where nothing small is ever lost.",
  },
  {
    id: "p4",
    pageNumber: 4,
    image: "/art/how/moment.jpg",
    alt: "Parent and child reading together under a quilt at bedtime",
    text: "By the time the quilt was pulled up to Mia's chin, the rain had slowed to a hush — and the story was ready to read again tomorrow.",
  },
];

type VariantKey = "whisper" | "paper-leaf" | "wash-curtain";

const VARIANTS: { key: VariantKey; name: string; subtitle: string }[] = [
  {
    key: "whisper",
    name: "Whisper",
    subtitle: "Subtle 16px directional drift + opacity settle (240ms ease-out)",
  },
  {
    key: "paper-leaf",
    name: "Paper Leaf",
    subtitle: "Spine-hinged 3D perspective page leaf with soft shadow lift (290ms ease-out)",
  },
  {
    key: "wash-curtain",
    name: "Wash Curtain",
    subtitle: "Directional clip-path ink & watercolor wipe across the sheet (280ms ease-in-out)",
  },
];

const prefersReducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function VariantStage({ variant, replayTick }: { variant: VariantKey; replayTick: number }) {
  const [index, setIndex] = useState(0);
  const [dir, setDir] = useState<1 | -1>(1);
  const [paper, setPaper] = useState<"cream" | "white" | "dark">("cream");
  const pageRef = useRef<HTMLDivElement | null>(null);
  const animRef = useRef<Animation | null>(null);

  const runTurn = useCallback(
    (direction: 1 | -1) => {
      const el = pageRef.current;
      if (!el) return;
      animRef.current?.cancel();
      el.style.transformOrigin = "";

      if (prefersReducedMotion()) {
        animRef.current = el.animate([{ opacity: 0.4 }, { opacity: 1 }], {
          duration: 180,
          easing: "cubic-bezier(0.23, 1, 0.32, 1)",
        });
        return;
      }

      if (variant === "whisper") {
        animRef.current = el.animate(
          [
            { transform: `translateX(${16 * direction}px)`, opacity: 0 },
            { transform: "translateX(0px)", opacity: 1 },
          ],
          { duration: 240, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }
        );
      } else if (variant === "paper-leaf") {
        el.style.transformOrigin = direction > 0 ? "0% 50%" : "100% 50%";
        animRef.current = el.animate(
          [
            {
              transform: `perspective(1200px) rotateY(${-12 * direction}deg) scale(0.985)`,
              opacity: 0.35,
            },
            {
              transform: "perspective(1200px) rotateY(0deg) scale(1)",
              opacity: 1,
            },
          ],
          { duration: 290, easing: "cubic-bezier(0.23, 1, 0.32, 1)" }
        );
      } else {
        const fromClip = direction > 0 ? "inset(0 0 0 100% round 12px)" : "inset(0 100% 0 0 round 12px)";
        animRef.current = el.animate(
          [
            {
              clipPath: fromClip,
              transform: `translateX(${10 * direction}px)`,
              opacity: 0.55,
            },
            {
              clipPath: "inset(0 0% 0 0% round 12px)",
              transform: "translateX(0px)",
              opacity: 1,
            },
          ],
          { duration: 280, easing: "cubic-bezier(0.77, 0, 0.175, 1)" }
        );
      }
    },
    [variant]
  );

  useLayoutEffect(() => {
    runTurn(dir);
  }, [index, dir, replayTick, runTurn]);

  const flip = (nextIndex: number, direction: 1 | -1) => {
    const wrapped = (nextIndex + SAMPLE_PAGES.length) % SAMPLE_PAGES.length;
    setDir(direction);
    setIndex(wrapped);
  };

  const page = SAMPLE_PAGES[index];
  const meta = VARIANTS.find((v) => v.key === variant)!;

  return (
    <div className={`reader reader--${paper}`}>
      <div className="reader__top">
        <Link to="/" className="tbar__back" aria-label="Back to home">
          <IconChevronLeft size={28} strokeWidth={2.4} />
        </Link>
        <span className="tbar__title">Mia's story · {meta.name}</span>
        <div className="tbar__right">
          {(["cream", "white", "dark"] as const).map((p) => (
            <button
              key={p}
              type="button"
              className="tbar__icon"
              onClick={() => setPaper(p)}
              aria-pressed={paper === p}
              aria-label={`${p} paper`}
              style={{
                fontSize: 13,
                fontFamily: "var(--font-body)",
                padding: "0 10px",
                minWidth: 0,
                height: 32,
                border: paper === p ? "1.5px solid var(--accent-border)" : "1px solid var(--dark-line)",
              }}
            >
              {p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
          <span className="tbar__icon" aria-hidden="true">
            <IconBookmark size={24} filled />
          </span>
        </div>
      </div>

      <div className="reader__frame">
        <div className="reader__page" ref={pageRef}>
          {index === 0 && (
            <header className="reader__head">
              <span className="reader__chapter">Chapter 4</span>
              <h1 className="reader__title">The Yellow Boots &amp; the Windowpane</h1>
            </header>
          )}
          <div className="reader__pic reader__pic--inset">
            <img
              src={page.image}
              alt={page.alt}
              style={{ display: "block", width: "100%", aspectRatio: "3 / 2", objectFit: "cover", borderRadius: 14 }}
            />
          </div>
          <div className="reader__text">
            {page.text.split("\n\n").map((para, i) => (
              <p key={i}>{para}</p>
            ))}
          </div>
          <div className="reader__ornament" aria-hidden="true" style={{ marginTop: 22 }}>
            <IconSparkle size={18} />
          </div>
          <p className="t-center t-xs" style={{ color: "var(--paper-soft)", marginTop: 8 }}>
            {meta.subtitle}
          </p>
        </div>
      </div>

      <nav className="reader__bottom" aria-label="Prototype pages">
        <button type="button" className="reader__nav-btn" onClick={() => flip(index - 1, -1)}>
          <IconChevronLeft size={22} /> Previous
        </button>
        <div className="reader__count">
          <span>
            {index + 1} / {SAMPLE_PAGES.length}
          </span>
          <span className="reader__dots" aria-hidden="true">
            {SAMPLE_PAGES.map((p, i) => (
              <span key={p.id} className={i === index ? "on" : ""} />
            ))}
          </span>
        </div>
        <button type="button" className="reader__next" onClick={() => flip(index + 1, 1)}>
          Next page <IconChevronRight size={20} />
        </button>
      </nav>
    </div>
  );
}

export default function ReaderTurnPrototype() {
  const [active, setActive] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    const requested = parseInt(new URLSearchParams(window.location.search).get("v") ?? "", 10);
    return requested >= 1 && requested <= VARIANTS.length ? requested - 1 : 0;
  });
  const [replayTick, setReplayTick] = useState(0);
  const [ready, setReady] = useState(false);

  const pickerRef = useRef<HTMLElement | null>(null);
  const highlightRef = useRef<HTMLSpanElement | null>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const moveHighlight = useCallback((idx: number) => {
    const el = itemRefs.current[idx];
    const hl = highlightRef.current;
    if (!el || !hl) return;
    hl.style.width = `${el.offsetWidth}px`;
    hl.style.transform = `translateX(${el.offsetLeft}px)`;
  }, []);

  const selectVariant = useCallback((idx: number) => {
    if (idx < 0 || idx >= VARIANTS.length) return;
    setActive(idx);
    setReplayTick(0);
    const url = new URL(window.location.href);
    url.searchParams.set("v", String(idx + 1));
    window.history.replaceState(null, "", url);
  }, []);

  useLayoutEffect(() => {
    moveHighlight(active);
  }, [active, moveHighlight]);

  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setReady(true));
    });
    const onResize = () => moveHighlight(active);
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      window.removeEventListener("resize", onResize);
    };
  }, [active, moveHighlight]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= VARIANTS.length) {
        selectVariant(num - 1);
      } else if (e.key === "ArrowRight") {
        selectVariant((active + 1) % VARIANTS.length);
      } else if (e.key === "ArrowLeft") {
        selectVariant((active - 1 + VARIANTS.length) % VARIANTS.length);
      } else if (e.key === "r" || e.key === "R") {
        setReplayTick((t) => t + 1);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [active, selectVariant]);

  const currentVariant = VARIANTS[active];

  return (
    <>
      <nav
        ref={pickerRef}
        className="proto-picker"
        data-position="top"
        data-ready={ready ? "" : undefined}
        aria-label="Prototype variants"
      >
        <span ref={highlightRef} className="proto-picker-highlight" aria-hidden="true" />
        {VARIANTS.map((v, i) => (
          <button
            key={v.key}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            type="button"
            className="proto-picker-item"
            data-active={i === active ? "" : undefined}
            aria-current={i === active ? "true" : undefined}
            onClick={() => selectVariant(i)}
          >
            {v.name}
          </button>
        ))}
        <span className="proto-picker-divider" aria-hidden="true" />
        <button
          type="button"
          className="proto-picker-item proto-picker-replay"
          aria-label="Replay animation (R)"
          onClick={() => setReplayTick((t) => t + 1)}
        >
          ↻
        </button>
      </nav>

      <VariantStage key={`${currentVariant.key}-${replayTick}`} variant={currentVariant.key} replayTick={replayTick} />
    </>
  );
}
