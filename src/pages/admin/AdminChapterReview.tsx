import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet, apiSend, ApiError } from "../../lib/api";
import { IconCheck, IconChevronDown, IconHold, IconInfo, IconRefresh, IconSend } from "../../components/icons";
import { REASON_LABEL, statusPill } from "./AdminReviewQueue";

interface Finding {
  id: string;
  category: string;
  status: "ok" | "needs_revision";
  note: string;
  quote: string | null;
}

interface Feedback {
  id: string;
  reason: string;
  note: string;
  status: "open" | "resolved";
  createdAt: string;
  from: string;
}

interface ChapterDetail {
  id: string;
  title: string;
  sequence: number;
  version: number;
  content: string;
  status: string;
  guardianStatus: string;
  revisionRequested: boolean;
  pagesStatus: string;
  isMock: boolean;
  storybook: { id: string; title: string; childName: string; stage: string };
  pages: { id: string; pageNumber: number; text: string; pictureSize: string; image: string | null }[];
  findings: Finding[];
  feedback: Feedback[];
  sources: { id: string; title: string | null; recordedBy: string; events: string | null; emotions: string | null; themes: string | null }[];
}

const CATEGORIES = ["continuity", "reader_fit", "private_details", "source_removed"];
const FEEDBACK_LABEL: Record<string, string> = {
  missed_meaning: "It missed what they meant",
  too_private: "Something feels too private",
  reading_level: "The reading level feels off",
  wrong_detail: "A character or detail is wrong",
};

// Wraps every flagged passage in a highlight.
function highlight(text: string, quotes: string[]): ReactNode {
  const found = quotes.map((q) => q.trim()).filter((q) => q && text.includes(q));
  if (!found.length) return text;
  const parts: ReactNode[] = [];
  let rest = text;
  let key = 0;
  for (;;) {
    const next = found.map((q) => ({ q, at: rest.indexOf(q) })).filter((x) => x.at >= 0).sort((a, b) => a.at - b.at)[0];
    if (!next) break;
    parts.push(rest.slice(0, next.at), <mark key={key++} className="highlight">{next.q}</mark>);
    rest = rest.slice(next.at + next.q.length);
  }
  parts.push(rest);
  return parts;
}

export default function AdminChapterReview() {
  const { chapterId } = useParams();
  const [chapter, setChapter] = useState<ChapterDetail | null>(null);
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    apiGet(`/api/admin/chapters/${chapterId}`).then(setChapter);
  }, [chapterId]);
  useEffect(load, [load]);

  // A rewrite plans new pages and redraws them; keep the view fresh meanwhile.
  useEffect(() => {
    if (chapter?.pagesStatus !== "illustrating") return;
    const t = setInterval(load, 6000);
    return () => clearInterval(t);
  }, [chapter?.pagesStatus, load]);

  const act = async (name: string, run: () => Promise<unknown>) => {
    setBusy(name);
    setError(null);
    try {
      await run();
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  };

  if (!chapter) return <p>Loading…</p>;

  const open = chapter.findings.filter((f) => f.status === "needs_revision");
  const openFeedback = chapter.feedback.filter((f) => f.status === "open");
  const quotes = open.map((f) => f.quote ?? "").filter(Boolean);
  const byCategory = CATEGORIES.map((category) => chapter.findings.find((f) => f.category === category)).filter((f): f is Finding => Boolean(f));
  const held = chapter.guardianStatus !== "approved";

  return (
    <div>
      <div className="adm-head" style={{ marginBottom: 14 }}>
        <div>
          <div className="adm-crumbs">
            <Link to="/admin/review">Story Review</Link> / {chapter.storybook.childName} / Chapter {String(chapter.sequence).padStart(2, "0")}
          </div>
          <h1 className="adm-title" style={{ fontSize: 48 }}>Review chapter</h1>
        </div>
        <span style={{ transform: "scale(1.15)", transformOrigin: "right top" }}>{statusPill(chapter)}</span>
      </div>

      <div className="adm-grid">
        <section className="adm-panel">
          <div className="kv-row">
            <strong className="h-title h-title--sm">
              Story draft · Version {chapter.version}
            </strong>
            <span className="t-xs t-muted">{chapter.isMock ? "Placeholder text (no AI provider)" : "Illustrative draft"}</span>
          </div>
          <h2 className="h-title h-title--lg" style={{ margin: "14px 0 6px" }}>{chapter.title}</h2>
          <p className="t-small t-muted" style={{ margin: "0 0 10px" }}>
            {chapter.storybook.title} · {chapter.storybook.stage}
          </p>
          {chapter.pages.length ? (
            chapter.pages.map((p) => (
              <div key={p.id} className="draft-page">
                {p.image ? <img src={`/${p.image}`} alt="" /> : <span className="draft-page__none">{p.pictureSize === "none" ? "Text-only page" : "Picture not drawn yet"}</span>}
                <div>
                  <span className="draft-page__n">
                    Page {p.pageNumber}
                    {p.pictureSize ? ` · ${p.pictureSize === "none" ? "text only" : p.pictureSize}` : ""}
                  </span>
                  <p className="draft-page__text">{p.text ? highlight(p.text, quotes) : <em className="t-muted">No words on this page: the picture tells it.</em>}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="chapter-body">{highlight(chapter.content, quotes)}</p>
          )}
        </section>

        <aside>
          <section className="adm-panel" style={{ padding: 16 }}>
            <h2 className="h-title" style={{ marginBottom: 10 }}>Guardian findings</h2>
            {byCategory.length === 0 && <p className="t-small t-muted">No review yet.</p>}
            {byCategory.map((f) => (
              <details key={f.id} className={`finding ${f.status === "needs_revision" ? "finding--open" : ""}`} open={f.status === "needs_revision"}>
                <summary>
                  <span className="finding__dot" />
                  <span>
                    <span className="finding__title" style={{ display: "block" }}>
                      {REASON_LABEL[f.category] ?? f.category}
                      {f.status === "needs_revision" ? " · Needs revision" : ""}
                    </span>
                    {f.status === "ok" && <span className="finding__sub" style={{ display: "block" }}>{f.category === "reader_fit" ? chapter.storybook.stage : "No issue flagged"}</span>}
                  </span>
                  <IconChevronDown size={20} className="finding__chev" />
                </summary>
                <div className="finding__body">
                  <p style={{ margin: 0 }}>{f.note}</p>
                  {f.quote && f.status === "needs_revision" && <p className="t-small" style={{ margin: "8px 0 0" }}>Highlighted in the draft.</p>}
                  <button
                    className="tlink"
                    style={{ marginTop: 8, fontSize: 14 }}
                    onClick={() => void act(`finding-${f.id}`, () => apiSend(`/api/admin/findings/${f.id}`, "PUT", { status: f.status === "ok" ? "needs_revision" : "ok" }))}
                    disabled={busy !== null}
                  >
                    {f.status === "ok" ? "Flag it again" : "Mark as resolved"}
                  </button>
                </div>
              </details>
            ))}

            {chapter.feedback.length > 0 && (
              <>
                <h3 className="h-section" style={{ margin: "16px 0 8px", fontSize: 18 }}>Family feedback</h3>
                {chapter.feedback.map((f) => (
                  <div key={f.id} className={`finding ${f.status === "open" ? "finding--open" : ""}`} style={{ padding: "12px 14px" }}>
                    <div className="finding__title" style={{ fontSize: 16 }}>{FEEDBACK_LABEL[f.reason] ?? f.reason}</div>
                    {f.note && <p className="t-small" style={{ margin: "4px 0 0" }}>“{f.note}”</p>}
                    <p className="t-xs t-muted" style={{ margin: "4px 0 0" }}>
                      {f.from} · {new Date(f.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                    <button
                      className="tlink"
                      style={{ marginTop: 6, fontSize: 14 }}
                      onClick={() => void act(`fb-${f.id}`, () => apiSend(`/api/admin/feedback/${f.id}`, "PUT", { status: f.status === "open" ? "resolved" : "open" }))}
                      disabled={busy !== null}
                    >
                      {f.status === "open" ? "Mark as handled" : "Reopen"}
                    </button>
                  </div>
                ))}
              </>
            )}

            <label className="field__label field__label--strong" htmlFor="instructions" style={{ marginTop: 18, fontSize: 18 }}>
              Revision instructions
            </label>
            <span className="with-counter" style={{ display: "block" }}>
              <textarea
                id="instructions"
                className="textarea"
                value={instructions}
                maxLength={500}
                onChange={(e) => setInstructions(e.target.value)}
                placeholder="e.g. Keep the fear consistent. Show one small brave step."
              />
              <span className="counter">{instructions.length}/500</span>
            </span>
            {error && <p className="error-text">{error}</p>}
            <div className="stack-sm" style={{ marginTop: 12 }}>
              <button
                className="btn btn--purple btn--sm"
                disabled={busy !== null || !instructions.trim()}
                onClick={() =>
                  void act("revise", async () => {
                    await apiSend(`/api/admin/chapters/${chapter.id}/request-revision`, "POST", { instructions });
                    setInstructions("");
                  })
                }
              >
                <IconSend size={18} /> {busy === "revise" ? "Rewriting the chapter…" : "Request revision"}
              </button>
              <button className="btn btn--outline btn--sm" disabled={busy !== null || open.length > 0 || !held} onClick={() => void act("approve", () => apiSend(`/api/admin/chapters/${chapter.id}/approve`, "PUT"))}>
                <IconCheck size={18} /> {held ? "Approve chapter" : "Approved"}
              </button>
              {open.length > 0 && <p className="t-xs t-muted t-center" style={{ margin: 0 }}>Resolve the open finding{open.length > 1 ? "s" : ""} first.</p>}
              <button className="btn btn--outline btn--sm" disabled={busy !== null} onClick={() => void act("hold", () => apiSend(`/api/admin/chapters/${chapter.id}/hold`, "PUT"))}>
                <IconHold size={18} /> Keep on hold
              </button>
              <button className="btn btn--soft btn--sm" disabled={busy !== null} onClick={() => void act("guardian", () => apiSend(`/api/admin/chapters/${chapter.id}/run-guardian`, "POST"))}>
                <IconRefresh size={18} /> {busy === "guardian" ? "Checking…" : "Run the Guardian again"}
              </button>
            </div>
            {busy === "revise" && <p className="t-xs t-muted" style={{ marginTop: 8 }}>This plans new pages and takes about a minute. New pictures are drawn after that.</p>}
            {openFeedback.length > 0 && !open.length && <p className="t-xs t-muted" style={{ marginTop: 8 }}>Family feedback doesn't block approval; mark it handled when you've acted on it.</p>}
          </section>

          <details className="disclosure" style={{ marginTop: 12 }}>
            <summary>
              <IconInfo size={20} />
              <span className="grow" style={{ fontWeight: 600 }}>Source context · Restricted access</span>
              <IconChevronDown size={20} />
            </summary>
            <div className="disclosure__body">
              {chapter.sources.map((s) => (
                <div key={s.id} style={{ marginBottom: 10 }}>
                  <strong>{s.title || "Untitled memory"}</strong> <span className="t-xs t-muted">· {s.recordedBy}</span>
                  {s.events && <p className="t-small" style={{ margin: "4px 0 0" }}>{s.events}</p>}
                  {s.themes && <p className="t-xs t-muted" style={{ margin: "2px 0 0" }}>Themes: {s.themes}</p>}
                </div>
              ))}
              {chapter.sources.length === 0 && <p className="t-small t-muted">No source memories remain.</p>}
            </div>
          </details>
          <div className="note note--info" style={{ marginTop: 12, fontSize: 14 }}>
            <span className="note__icon">
              <IconInfo size={14} />
            </span>
            <span className="note__body">Approving a chapter does not automatically publish it. The parent approves the pages and publishes.</span>
          </div>
        </aside>
      </div>
    </div>
  );
}
