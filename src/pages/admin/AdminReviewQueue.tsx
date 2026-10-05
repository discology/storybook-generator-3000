import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../../lib/api";

interface QueueChapter {
  id: string;
  title: string;
  childName: string;
  storybookId: string;
  status: string;
  guardianStatus: string;
  tab: "needs_review" | "in_revision" | "approved";
  reasons: string[];
}

const TABS: { key: QueueChapter["tab"]; label: string }[] = [
  { key: "needs_review", label: "Needs review" },
  { key: "in_revision", label: "In revision" },
  { key: "approved", label: "Approved" },
];

const REASON_LABEL: Record<string, string> = {
  continuity: "Continuity",
  reader_fit: "Reader fit",
  private_details: "Private detail",
  source_removed: "Source removed",
};

export default function AdminReviewQueue() {
  const [chapters, setChapters] = useState<QueueChapter[] | null>(null);
  const [tab, setTab] = useState<QueueChapter["tab"]>("needs_review");

  useEffect(() => {
    apiGet("/api/admin/chapters").then(setChapters);
  }, []);

  if (!chapters) return <p>Loading…</p>;

  const filtered = chapters.filter((c) => c.tab === tab);
  const sharedHeldChapter = tab !== "approved" && filtered.length > 0;

  return (
    <div>
      <h1 className="display" style={{ color: "var(--ink)", fontSize: "2rem" }}>
        Story Review
      </h1>
      <p style={{ color: "var(--ink-soft)", marginTop: 0 }}>Help every chapter find its way.</p>

      <div className="row inline" style={{ marginBottom: "1rem" }}>
        {TABS.map((t) => (
          <button
            key={t.key}
            className={tab === t.key ? "btn-primary" : "btn-secondary"}
            style={{ width: "auto" }}
            onClick={() => setTab(t.key)}
          >
            {t.label} ({chapters.filter((c) => c.tab === t.key).length})
          </button>
        ))}
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Chapter</th>
            <th>Storybook</th>
            <th>Reason</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((c) => (
            <tr key={c.id}>
              <td>{c.title}</td>
              <td>{c.childName}</td>
              <td>{c.reasons.map((r) => REASON_LABEL[r] || r).join(", ") || "—"}</td>
              <td>
                {c.guardianStatus === "approved" ? (
                  <span className="pill good">Approved</span>
                ) : (
                  <span className="pill warn">Held</span>
                )}
              </td>
              <td>
                <Link className="btn-small btn-primary" style={{ textDecoration: "none" }} to={`/admin/review/${c.id}`}>
                  Review
                </Link>
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={5} style={{ color: "var(--ink-soft)", padding: "1.5rem" }}>
                Nothing here right now.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {sharedHeldChapter && (
        <div className="banner info" style={{ background: "#ece5ff" }}>
          No held chapter is shared with a family. Resolve findings before publication.
        </div>
      )}
    </div>
  );
}
