import { useState } from "react";
import { Link } from "react-router-dom";
import { apiSend, ApiError } from "../../lib/api";

// Shot patterns flagged on enough pages to decide about (VSB-108): block one
// (a new Page Rules version) or accept it as fine. Shown on Feedback and on
// Page Rules.

export interface ShotReviewItem {
  signature: string;
  pages: number;
  examples: { type: string; angle: string; focus: string }[];
  flags: { id: string; note: string; source: string; picture: string | null; chapter: { id: string; title: string }; pageNumber: number | null; createdAt: string }[];
  draft: string;
  review: { status: string; count: number } | null;
}

const describe = (s: { type: string; angle: string; focus: string }) => [s.type, s.angle, s.focus && `focus: ${s.focus}`].filter(Boolean).join(", ");

export default function ShotReviews({
  items,
  threshold,
  onChanged,
  disabled,
  disabledNote,
}: {
  items: ShotReviewItem[];
  threshold: number;
  onChanged: (notice: string) => void;
  disabled?: boolean;
  disabledNote?: string;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const [form, setForm] = useState({ pattern: "", why: "", instead: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!items.length) return null;

  const startBlock = (item: ShotReviewItem) => {
    setOpen(item.signature);
    setForm({ pattern: item.draft, why: "", instead: "" });
    setError(null);
  };
  const block = async (item: ShotReviewItem) => {
    setBusy(item.signature);
    setError(null);
    try {
      const r = await apiSend("/api/admin/shot-reviews/block", "POST", { signature: item.signature, ...form });
      setOpen(null);
      onChanged(`Added ${r.rule.id} to Shots that don't work. Page Rules is now version ${r.version}; new chapters use it.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save it.");
    } finally {
      setBusy(null);
    }
  };
  const accept = async (item: ShotReviewItem) => {
    setBusy(`accept-${item.signature}`);
    setError(null);
    try {
      await apiSend("/api/admin/shot-reviews/accept", "POST", { signature: item.signature });
      onChanged(`"${item.signature}" accepted as fine. It comes back if it's flagged on more than ${item.pages} pages.`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save it.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="card" style={{ borderLeft: "4px solid var(--amber)" }}>
      <h3 style={{ marginTop: 0 }}>Shots to review</h3>
      <p className="status-line">
        Shot patterns flagged for camera or composition on {threshold} or more pages. Block one to add it to "Shots that don't work" (a new Page Rules version, used by new chapters), or accept it as fine.
      </p>
      {disabled && disabledNote && <p className="status-line">{disabledNote}</p>}
      {items.map((item, index) => (
        <article key={item.signature} className="fb-card" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
          <div>
            <div className="row inline" style={{ justifyContent: "space-between", marginTop: 0, gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 18 }}>{item.signature}</strong>
              <span className="pill warn">
                {item.pages} page{item.pages === 1 ? "" : "s"}
              </span>
            </div>
            <ul className="t-small" style={{ margin: "6px 0 0", paddingLeft: 18 }}>
              {item.examples.map((e, i) => (
                <li key={i}>{describe(e)}</li>
              ))}
            </ul>
            <div className="row inline" style={{ gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {item.flags
                .filter((f) => f.picture)
                .slice(0, 4)
                .map((f) => (
                  <Link key={f.id} to={`/admin/review/${f.chapter.id}`} title={`“${f.chapter.title}”${f.pageNumber ? `, page ${f.pageNumber}` : ""}: ${f.note}`}>
                    <img src={`/${f.picture}`} alt={`“${f.chapter.title}”${f.pageNumber ? `, page ${f.pageNumber}` : ""}`} style={{ width: 120, height: 120, objectFit: "cover", borderRadius: 6, display: "block" }} />
                  </Link>
                ))}
            </div>
            {open === item.signature ? (
              <div style={{ marginTop: 10 }}>
                <label className="field__label" htmlFor={`sr-pattern-${index}`}>
                  Words that mark the shot (comma-separated)
                </label>
                <input id={`sr-pattern-${index}`} className="input" value={form.pattern} onChange={(e) => setForm({ ...form, pattern: e.target.value })} placeholder="feet, ankle height" />
                <label className="field__label" htmlFor={`sr-why-${index}`} style={{ marginTop: 8 }}>
                  Why it doesn't work
                </label>
                <input id={`sr-why-${index}`} className="input" value={form.why} onChange={(e) => setForm({ ...form, why: e.target.value })} placeholder="Tiny legs under a huge head read as extra feet." />
                <label className="field__label" htmlFor={`sr-instead-${index}`} style={{ marginTop: 8 }}>
                  Use instead
                </label>
                <input id={`sr-instead-${index}`} className="input" value={form.instead} onChange={(e) => setForm({ ...form, instead: e.target.value })} placeholder="A medium shot from the side with the whole body in frame." />
                {error && <p className="error-text">{error}</p>}
                <div className="row inline" style={{ gap: 8, marginTop: 10 }}>
                  <button className="btn-small btn-primary" disabled={busy !== null || !form.pattern.trim()} onClick={() => void block(item)}>
                    {busy === item.signature ? "Saving…" : "Block this shot"}
                  </button>
                  <button className="btn-small btn-secondary" disabled={busy !== null} onClick={() => setOpen(null)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <div className="row inline" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
                <button className="btn-small btn-primary" disabled={disabled || busy !== null} onClick={() => startBlock(item)}>
                  Block this shot…
                </button>
                <button className="btn-small btn-secondary" disabled={disabled || busy !== null} onClick={() => void accept(item)}>
                  {busy === `accept-${item.signature}` ? "Saving…" : "Accept as fine"}
                </button>
                {error && open === null && busy === null && <span className="error-text">{error}</span>}
              </div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
