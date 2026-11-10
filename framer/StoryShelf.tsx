// "Stories from other families" for the Framer landing page (VSB-148).
// Paste this file into Framer as a code component (Assets, Code, New file).
// It shows the featured sample stories from Admin, Featured stories as a row of
// cards and opens each one in a reading modal. At the end, "Make your own
// story" opens the lesson box's modal (LessonBox.tsx) on the same page, or the
// app's /try when the page has no lesson box. Fonts, colors and the app's
// address are settings in Framer's right-hand panel.

import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { addPropertyControls, ControlType, RenderTarget } from "framer";

interface Props {
  appUrl: string;
  headingFont: string;
  textFont: string;
  cardWidth: number;
  endButtonLabel: string;
  buttonColor: string;
  buttonTextColor: string;
  style?: CSSProperties;
}

interface Story {
  slug: string;
  title: string;
  blurb: string;
  color: string;
  cover: string | null; // the story's first picture
}

interface Page {
  id: string;
  pageNumber: number;
  text: string;
  pictureSize: string;
  visibleAction: string;
  image: string | null;
}

// The four card colors from Admin, Featured stories, with the ink drawn on each.
const CARD_COLORS: Record<string, { paper: string; ink: string }> = {
  yellow: { paper: "#F5D547", ink: "#5E4B0A" },
  green: { paper: "#A3F25A", ink: "#2F5A0C" },
  blue: { paper: "#5146F0", ink: "#D9D6FF" },
  purple: { paper: "#B23AC6", ink: "#FBE3FF" },
};

const appBase = (url: string) => url.replace(/\/+$/, "");

/**
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight auto
 */
export default function StoryShelf(props: Props) {
  const { appUrl, cardWidth } = props;
  const [stories, setStories] = useState<Story[] | null | "unavailable">(null);
  const [reading, setReading] = useState<Story | null>(null);

  useEffect(() => {
    fetch(`${appBase(appUrl)}/api/public/stories`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setStories(Array.isArray(d.stories) ? d.stories : "unavailable"))
      .catch(() => setStories("unavailable"));
  }, [appUrl]);

  // Nothing to show, or Vambie can't be reached: nothing broken on the page. In
  // Framer's editor, a note says why the row is empty.
  if (stories === "unavailable" || (Array.isArray(stories) && stories.length === 0)) {
    if (RenderTarget.current() !== RenderTarget.canvas) return null;
    return (
      <div style={{ ...props.style, width: "100%", padding: 16, boxSizing: "border-box", border: "1.5px dashed #999", borderRadius: 12, fontFamily: props.textFont, fontSize: 13, color: "#555", textAlign: "center" }}>
        {stories === "unavailable"
          ? `Couldn't reach ${appBase(appUrl)}. Check the App address setting.`
          : "No featured stories yet. Feature some in Vambie's Admin → Featured stories and they'll appear here, with their pictures. (Only you see this note, in the editor.)"}
      </div>
    );
  }

  return (
    <div style={{ ...props.style, width: "100%" }}>
      <div style={{ display: "flex", gap: 16, overflowX: "auto", scrollSnapType: "x mandatory", padding: "4px 16px 12px", WebkitOverflowScrolling: "touch" }}>
        {stories === null
          ? [0, 1, 2].map((i) => <div key={i} style={{ ...cardBox(cardWidth), background: "#ECECEC", opacity: 0.6 }} aria-hidden="true" />)
          : stories.map((s) => <StoryCard key={s.slug} story={s} {...props} onOpen={() => setReading(s)} />)}
      </div>
      {reading && <StoryModal {...props} story={reading} onClose={() => setReading(null)} />}
    </div>
  );
}

// Cards grow to fit their picture and words; the row matches the tallest.
const cardBox = (width: number): CSSProperties => ({ flex: `0 0 ${width}px`, minHeight: Math.round(width * 1.22), borderRadius: 18, scrollSnapAlign: "start" });

function StoryCard(props: Props & { story: Story; onOpen: () => void }) {
  const { story, headingFont, textFont, cardWidth, onOpen } = props;
  const { paper, ink } = CARD_COLORS[story.color] ?? CARD_COLORS.yellow;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Read ${story.title}`}
      style={{ ...cardBox(cardWidth), background: paper, border: "none", padding: 14, cursor: "pointer", textAlign: "center", boxSizing: "border-box" }}
    >
      <div style={{ position: "relative", height: "100%", minHeight: Math.round(cardWidth * 1.22) - 28, border: `1.5px solid ${ink}66`, borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: story.cover ? "flex-start" : "center", padding: story.cover ? 10 : "18px 16px", boxSizing: "border-box" }}>
        {/* The story's own first picture; the V mark when it has none. */}
        {story.cover ? (
          <img src={story.cover} alt="" loading="lazy" style={{ display: "block", width: "100%", aspectRatio: "4 / 3", objectFit: "cover", borderRadius: 8, flex: "0 0 auto" }} />
        ) : (
          <VMark color={ink} />
        )}
        <span aria-hidden="true" style={{ position: "absolute", left: -9, top: "50%", color: ink, fontSize: 16 }}>
          ✦
        </span>
        <span aria-hidden="true" style={{ position: "absolute", right: -9, top: "50%", color: ink, fontSize: 16 }}>
          ✦
        </span>
        <span
          style={{
            fontFamily: headingFont,
            fontSize: Math.round(cardWidth * (story.cover ? (story.title.length > 18 ? 0.09 : 0.115) : story.title.length > 24 ? 0.1 : story.title.length > 14 ? 0.13 : 0.16)),
            lineHeight: 0.95,
            textTransform: "uppercase",
            color: ink,
            margin: story.cover ? "14px 4px 8px" : "14px 0 12px",
          }}
        >
          {story.title}
        </span>
        {story.blurb && <span style={{ fontFamily: textFont, fontSize: 13, lineHeight: 1.45, color: ink, padding: story.cover ? "0 6px" : 0 }}>{story.blurb}</span>}
      </div>
    </button>
  );
}

const VMark = ({ color }: { color: string }) => (
  <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
    <path d="M2 3 L20 38 L38 3 L26 9 L20 22 L14 9 Z" fill={color} />
  </svg>
);

function StoryModal(props: Props & { story: Story; onClose: () => void }) {
  const { appUrl, headingFont, textFont, endButtonLabel, buttonColor, buttonTextColor, story, onClose } = props;
  const [pages, setPages] = useState<Page[] | null | "unavailable">(null);
  const [index, setIndex] = useState(0);
  const [touchX, setTouchX] = useState<number | null>(null);
  const total = Array.isArray(pages) ? pages.length : 0;
  const go = (n: number) => setIndex((i) => Math.max(0, Math.min(total, n ?? i)));

  useEffect(() => {
    fetch(`${appBase(appUrl)}/api/public/stories/${encodeURIComponent(story.slug)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d) => setPages(Array.isArray(d.pages) ? d.pages : "unavailable"))
      .catch(() => setPages("unavailable"));
  }, [appUrl, story.slug]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  });

  // The lesson box listens for this and opens its modal; without one, the app's /try.
  const makeYourOwn = () => {
    onClose();
    const event = new CustomEvent("vambie:open-lesson", { detail: { handled: false } });
    window.dispatchEvent(event);
    if (!event.detail.handled) window.location.href = `${appBase(appUrl)}/try`;
  };

  const page = Array.isArray(pages) ? pages[index] : undefined;
  const pictureRatio = page && (page.pictureSize === "full" || page.pictureSize === "wordless") ? "2 / 3" : page && (page.pictureSize === "framed" || page.pictureSize === "vignette") ? "1" : "3 / 2";
  const navButton: CSSProperties = { border: "none", background: "none", fontFamily: textFont, fontSize: 15, fontWeight: 600, cursor: "pointer", color: "#111", padding: "8px 4px" };

  const modal = (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.78)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, fontFamily: textFont }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={story.title}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={(e) => setTouchX(e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX === null) return;
          const dx = e.changedTouches[0].clientX - touchX;
          setTouchX(null);
          if (Math.abs(dx) > 50) go(index + (dx < 0 ? 1 : -1));
        }}
        style={{ position: "relative", width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto", background: "#fff", borderRadius: 16, padding: "20px 20px 14px", boxSizing: "border-box", color: "#111" }}
      >
        <button type="button" onClick={onClose} aria-label="Close" style={{ position: "absolute", top: 8, right: 12, border: "none", background: "none", fontSize: 26, lineHeight: 1, cursor: "pointer", color: "#111" }}>
          ×
        </button>
        {/* Explicit, so the landing page's own heading styles don't reach into the modal. */}
        <h2 style={{ fontFamily: headingFont, fontSize: 26, lineHeight: 1, textTransform: "uppercase", textAlign: "left", color: "#111", background: "none", padding: 0, margin: "0 30px 14px 0" }}>{story.title}</h2>

        {pages === null && <p style={{ fontSize: 15, color: "#555" }}>Opening the book…</p>}
        {pages === "unavailable" && <p style={{ fontSize: 15, color: "#555" }}>This story isn't available right now.</p>}

        {page && (
          <>
            {page.image && (
              <img
                src={`${appBase(appUrl)}/${page.image}`}
                alt={page.visibleAction}
                style={{ display: "block", width: "100%", aspectRatio: pictureRatio, maxHeight: "52vh", objectFit: "contain", borderRadius: 10, background: "#F7F2E6" }}
              />
            )}
            {page.text && <p style={{ fontSize: 17, lineHeight: 1.5, margin: "14px 2px 6px" }}>{page.text}</p>}
          </>
        )}

        {Array.isArray(pages) && index >= total && (
          <div style={{ textAlign: "center", padding: "26px 0 8px" }}>
            <p style={{ fontFamily: headingFont, fontSize: 30, textTransform: "uppercase", margin: "0 0 18px" }}>The end</p>
            <button
              type="button"
              onClick={makeYourOwn}
              style={{ width: "100%", border: "none", borderRadius: 8, padding: "14px 18px", background: buttonColor, color: buttonTextColor, fontFamily: textFont, fontSize: 13, fontWeight: 600, letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer" }}
            >
              {endButtonLabel} ➤
            </button>
            <button type="button" onClick={() => go(0)} style={{ ...navButton, marginTop: 10 }}>
              Read again
            </button>
          </div>
        )}

        {Array.isArray(pages) && index < total && (
          <nav aria-label="Pages" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
            <button type="button" onClick={() => go(index - 1)} disabled={index === 0} style={{ ...navButton, opacity: index === 0 ? 0.3 : 1 }}>
              ‹ Previous
            </button>
            <span style={{ fontSize: 14, color: "#555" }}>
              {index + 1} / {total}
            </span>
            <button type="button" onClick={() => go(index + 1)} style={navButton}>
              {index === total - 1 ? "The end ›" : "Next ›"}
            </button>
          </nav>
        )}
      </div>
    </div>
  );
  // Framer renders pages on the server first; the modal only exists in the browser.
  return typeof document === "undefined" ? null : createPortal(modal, document.body);
}

StoryShelf.defaultProps = {
  appUrl: "https://vambie-storybook.fly.dev",
  headingFont: "Anton, Impact, sans-serif",
  textFont: "Inter, system-ui, sans-serif",
  cardWidth: 260,
  endButtonLabel: "Make your own story",
  buttonColor: "#000000",
  buttonTextColor: "#FFFFFF",
};

addPropertyControls(StoryShelf, {
  appUrl: { type: ControlType.String, title: "App address" },
  headingFont: { type: ControlType.String, title: "Title font" },
  textFont: { type: ControlType.String, title: "Text font" },
  cardWidth: { type: ControlType.Number, title: "Card width", min: 180, max: 420, step: 10 },
  endButtonLabel: { type: ControlType.String, title: "End button" },
  buttonColor: { type: ControlType.Color, title: "Button color" },
  buttonTextColor: { type: ControlType.Color, title: "Button text" },
});
