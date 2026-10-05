import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiGet, apiSend } from "../../lib/api";
import type { GuardianFinding } from "../../types";

interface ChapterDetail {
  id: string;
  title: string;
  content: string;
  status: string;
  guardianStatus: string;
  storybook: { title: string; child: { displayName: string } };
  findings: GuardianFinding[];
  sources: { memory: { interpretation: { events: string | null; themes: string | null } | null } }[];
}

const REASON_LABEL: Record<string, string> = {
  continuity: "Continuity",
  reader_fit: "Reader fit",
  private_details: "Private details",
  source_removed: "Source removed",
};

export default function AdminChapterReview() {
  const { chapterId } = useParams();
  const navigate = useNavigate();
  const [chapter, setChapter] = useState<ChapterDetail | null>(null);
  const [instructions, setInstructions] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => {
    apiGet(`/api/admin/chapters/${chapterId}`).then(setChapter);
  };
  useEffect(load, [chapterId]);

  const runGuardian = async () => {
    setBusy(true);
    try {
      await apiSend(`/api/admin/chapters/${chapterId}/run-guardian`, "POST");
      load();
    } finally {
      setBusy(false);
    }
  };

  const requestRevision = async () => {
    setBusy(true);
    try {
      await apiSend(`/api/admin/chapters/${chapterId}/request-revision`, "POST", { instructions });
      setInstructions("");
      load();
    } finally {
      setBusy(false);
    }
  };

  const approve = async () => {
    setBusy(true);
    try {
      await apiSend(`/api/admin/chapters/${chapterId}/approve`, "PUT");
      load();
    } catch {
      // open findings block approval — surfaced visually via pill colors already
    } finally {
      setBusy(false);
    }
  };

  const hold = async () => {
    setBusy(true);
    try {
      await apiSend(`/api/admin/chapters/${chapterId}/hold`, "PUT");
      load();
    } finally {
      setBusy(false);
    }
  };

  if (!chapter) return <p>Loading…</p>;

  const openFindings = chapter.findings.filter((f) => f.status === "needs_revision");

  return (
    <div>
      <div style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
        <Link to="/admin/review" style={{ color: "inherit" }}>
          Story Review
        </Link>{" "}
        / {chapter.storybook.child.displayName} / Chapter
      </div>

      <div className="row inline" style={{ justifyContent: "space-between", marginTop: 0 }}>
        <h1 style={{ margin: 0, color: "var(--ink)" }}>Review chapter</h1>
        {chapter.guardianStatus === "approved" ? (
          <span className="pill good">Approved</span>
        ) : (
          <span className="pill warn">Held</span>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "1.5rem", marginTop: "1rem" }}>
        <div className="card">
          <div className="status-line">Story draft</div>
          <h2>{chapter.title}</h2>
          <p className="chapter-body">{chapter.content}</p>
        </div>

        <div>
          <h3 style={{ color: "var(--ink)" }}>Guardian findings</h3>
          {chapter.findings.length === 0 && (
            <p className="status-line">No review yet.</p>
          )}
          {chapter.findings.map((f) => (
            <div key={f.id} className={`finding-card ${f.status === "needs_revision" ? "needs_revision" : "ok"}`}>
              <strong>{REASON_LABEL[f.category] || f.category}</strong> ·{" "}
              {f.status === "needs_revision" ? "Needs revision" : "OK"}
              <p style={{ margin: "0.4rem 0 0", fontSize: "0.85rem" }}>{f.note}</p>
            </div>
          ))}
          <button className="btn-secondary" onClick={runGuardian} disabled={busy} style={{ marginBottom: "1rem" }}>
            {busy ? "Running…" : "Run Guardian again"}
          </button>

          <label>Revision instructions</label>
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            maxLength={500}
            placeholder="e.g. Keep the fear consistent, show one small brave step."
          />

          <button className="btn-primary chevron" onClick={requestRevision} disabled={busy || !instructions.trim()} style={{ marginTop: "0.75rem" }}>
            Request revision
          </button>
          <button
            className="btn-secondary"
            onClick={approve}
            disabled={busy || openFindings.length > 0}
            style={{ marginTop: "0.5rem" }}
          >
            Approve chapter
          </button>
          {openFindings.length > 0 && <p className="status-line">Resolve the open finding first.</p>}
          <button className="btn-secondary" onClick={hold} disabled={busy} style={{ marginTop: "0.5rem" }}>
            Keep on hold
          </button>

          <div className="banner info" style={{ marginTop: "1rem", fontSize: "0.78rem" }}>
            Source context · restricted access. Approving a chapter does not automatically publish it.
          </div>
        </div>
      </div>
    </div>
  );
}
