import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import Vambie from "../components/Vambie";
import { apiGet, apiSend } from "../lib/api";
import type { Storybook } from "../types";

const PAGE_COLORS: Record<string, { bg: string; text: string }> = {
  cream: { bg: "#f7f1e4", text: "#16151a" },
  white: { bg: "#ffffff", text: "#16151a" },
  dark: { bg: "#16151a", text: "#f5f1e8" },
};

const FEEDBACK_REASONS = [
  "It missed what I meant",
  "Something feels too private",
  "The reading level feels off",
  "A character or detail is wrong",
];

export default function Reader() {
  const { id } = useParams();
  const [storybook, setStorybook] = useState<Storybook | null>(null);
  const [index, setIndex] = useState(0);
  const [pageIndex, setPageIndex] = useState(0);
  const [showControls, setShowControls] = useState(false);
  const [textSize, setTextSize] = useState(1);
  const [pageColor, setPageColor] = useState<"cream" | "white" | "dark">("cream");
  const [ended, setEnded] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [reason, setReason] = useState(FEEDBACK_REASONS[0]);
  const [feedbackNote, setFeedbackNote] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);

  useEffect(() => {
    apiGet(`/api/storybooks/${id}`).then(setStorybook);
  }, [id]);

  if (!storybook) return <p className="status-line screen-pad">Loading…</p>;

  const published = storybook.chapters.filter((c) => c.status === "published");
  if (published.length === 0) {
    return (
      <div>
        <TopBar backTo={`/storybooks/${id}`} backLabel="Back" />
        <p className="status-line screen-pad">No published chapters yet.</p>
      </div>
    );
  }

  const chapter = published[index];
  const colors = PAGE_COLORS[pageColor];
  const pages = chapter.pages ?? [];
  const page = pages[pageIndex];
  const pageCount = (c: (typeof published)[number]) => Math.max(c.pages?.length ?? 0, 1);

  const next = () => {
    if (pageIndex < pages.length - 1) setPageIndex((p) => p + 1);
    else if (index < published.length - 1) {
      setIndex((i) => i + 1);
      setPageIndex(0);
    } else setEnded(true);
  };

  const previous = () => {
    if (pageIndex > 0) setPageIndex((p) => p - 1);
    else if (index > 0) {
      setPageIndex(pageCount(published[index - 1]) - 1);
      setIndex((i) => i - 1);
    }
  };

  const sendFeedback = async () => {
    // Dev mode: no feedback storage table wired up yet — acknowledged locally.
    setFeedbackSent(true);
  };

  if (showFeedback) {
    return (
      <div>
        <TopBar backTo={`/storybooks/${id}/read`} backLabel="Story feedback" />
        <div className="hero" style={{ paddingTop: 0 }}>
          <h1 className="display">Help us get it right.</h1>
        </div>
        <div className="screen-pad">
          <div className="card">
            <strong>{chapter.title}</strong>
            <div className="status-line">Chapter {chapter.sequence}</div>

            {feedbackSent ? (
              <div className="banner info" style={{ marginTop: "1rem" }}>
                Thanks — your current chapter stays available while we review your feedback.
              </div>
            ) : (
              <>
                <label>What needs attention?</label>
                {FEEDBACK_REASONS.map((r) => (
                  <div className="checkbox-row" key={r}>
                    <input type="radio" id={r} name="reason" checked={reason === r} onChange={() => setReason(r)} />
                    <label htmlFor={r} style={{ margin: 0 }}>
                      {r}
                    </label>
                  </div>
                ))}
                <label htmlFor="note">Anything else we should know?</label>
                <textarea id="note" value={feedbackNote} onChange={(e) => setFeedbackNote(e.target.value)} placeholder="Tell us what felt different." />
                <button className="btn-primary chevron" onClick={sendFeedback}>
                  Send feedback
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (ended) {
    return (
      <div style={{ background: colors.bg, color: colors.text, minHeight: "100vh" }}>
        <div className="screen-pad" style={{ paddingTop: "2rem", textAlign: "center" }}>
          <Vambie size={90} mood="happy" />
          <h1 className="display" style={{ color: colors.text, fontSize: "1.8rem", marginTop: "1rem" }}>
            {chapter.title}
          </h1>
          <div className="status-line" style={{ color: colors.text, opacity: 0.6 }}>
            End of Chapter {chapter.sequence}
          </div>
          <button
            className="btn-primary chevron"
            style={{ marginTop: "1.5rem" }}
            onClick={() => {
              setEnded(false);
              setPageIndex(0);
            }}
          >
            Read again
          </button>
          <Link className="btn-secondary" style={{ textDecoration: "none", marginTop: "0.6rem" }} to={`/storybooks/${id}`}>
            Close the book
          </Link>
          <button className="btn-link" style={{ marginTop: "0.75rem" }} onClick={() => setShowFeedback(true)}>
            For grown-ups: story feedback
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: colors.bg, color: colors.text, minHeight: "100vh" }}>
      <div className="top-bar" style={{ background: colors.bg }}>
        <Link to={`/storybooks/${id}`} style={{ color: colors.text, textDecoration: "none", fontSize: "0.85rem" }}>
          ‹ {storybook.title}
        </Link>
        <button
          className="top-bar-icon-btn"
          style={{ color: colors.text }}
          onClick={() => setShowControls((s) => !s)}
          aria-label="Reading settings"
        >
          Aa
        </button>
      </div>

      <div className="screen-pad" style={{ textAlign: "center" }}>
        {pageIndex === 0 && (
          <>
            <div className="status-line" style={{ color: colors.text, opacity: 0.6 }}>
              CHAPTER {chapter.sequence}
            </div>
            <h2 className="display" style={{ color: colors.text, fontSize: "1.6rem" }}>
              {chapter.title}
            </h2>
          </>
        )}
        {page ? (
          <>
            {/* Illustration on top; the page's exact text in its own area beneath, never inside the image. */}
            {page.assets[0]?.imagePath && (
              <img
                src={`/${page.assets[0].imagePath}`}
                alt={page.visibleAction}
                style={{ width: "100%", aspectRatio: "3 / 2", objectFit: "cover", borderRadius: 14, display: "block", marginTop: pageIndex === 0 ? 0 : "0.5rem" }}
              />
            )}
            <p style={{ fontSize: `${1.15 * textSize}rem`, lineHeight: 1.6, textAlign: "left", margin: "1.1rem 0.25rem 0", overflowWrap: "break-word" }}>
              {page.text}
            </p>
          </>
        ) : (
          <p style={{ fontSize: `${1 * textSize}rem`, lineHeight: 1.7, textAlign: "left", whiteSpace: "pre-wrap" }}>{chapter.content}</p>
        )}
      </div>

      <div className="row inline" style={{ justifyContent: "space-between", padding: "0 1.25rem" }}>
        <button className="btn-secondary" style={{ width: "auto" }} disabled={index === 0 && pageIndex === 0} onClick={previous}>
          ‹ Previous
        </button>
        <span className="status-line" style={{ color: colors.text }}>
          {pages.length > 0 ? `Page ${pageIndex + 1} / ${pages.length}` : `${index + 1} / ${published.length}`}
        </span>
        <button className="btn-primary" style={{ width: "auto" }} onClick={next}>
          Next page ›
        </button>
      </div>

      {showControls && (
        <div className="card" style={{ margin: "1.25rem", color: "var(--ink)" }}>
          <h3 style={{ marginTop: 0 }}>Make yourself comfortable</h3>
          <label>Text size</label>
          <div className="row inline">
            <button className="btn-secondary" style={{ width: "auto" }} onClick={() => setTextSize((s) => Math.max(0.8, s - 0.1))}>
              A-
            </button>
            <span>Sample text</span>
            <button className="btn-secondary" style={{ width: "auto" }} onClick={() => setTextSize((s) => Math.min(1.5, s + 0.1))}>
              A+
            </button>
          </div>
          <label>Page color</label>
          <div className="row inline">
            {(Object.keys(PAGE_COLORS) as Array<"cream" | "white" | "dark">).map((c) => (
              <button
                key={c}
                className={pageColor === c ? "btn-primary" : "btn-secondary"}
                style={{ width: "auto", textTransform: "capitalize" }}
                onClick={() => setPageColor(c)}
              >
                {c}
              </button>
            ))}
          </div>
          <button className="btn-primary chevron" onClick={() => setShowControls(false)}>
            Done
          </button>
        </div>
      )}
    </div>
  );
}
