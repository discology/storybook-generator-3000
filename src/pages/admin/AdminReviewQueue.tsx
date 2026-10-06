import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiGet, apiSend } from "../../lib/api";
import { IconBook, IconDots, IconEdit, IconFileText, IconSearch, IconShield, IconSort, IconWarning } from "../../components/icons";

interface QueueChapter {
  id: string;
  title: string;
  sequence: number;
  childName: string;
  storybookTitle: string;
  storybookId: string;
  status: string;
  guardianStatus: string;
  version: number;
  cover: string | null;
  tab: "needs_review" | "in_revision" | "approved";
  reasons: string[];
  openFeedback: number;
  createdAt: string;
}

const TABS: { key: QueueChapter["tab"]; label: string }[] = [
  { key: "needs_review", label: "Needs review" },
  { key: "in_revision", label: "In revision" },
  { key: "approved", label: "Approved" },
];

export const REASON_LABEL: Record<string, string> = {
  continuity: "Continuity",
  reader_fit: "Reader fit",
  private_details: "Private detail",
  source_removed: "Source removed",
  family_feedback: "Family feedback",
};

type SortKey = "chapter" | "storybook" | "reason" | "status";

export const statusPill = (c: { status: string; guardianStatus: string }) =>
  c.guardianStatus === "needs_revision" || c.guardianStatus === "not_reviewed" ? (
    <span className="pill-status pill-status--held">Held</span>
  ) : c.status === "published" ? (
    <span className="pill-status pill-status--published">Published</span>
  ) : (
    <span className="pill-status pill-status--approved">Approved</span>
  );

export default function AdminReviewQueue() {
  const navigate = useNavigate();
  const [data, setData] = useState<{ chapters: QueueChapter[]; heldShared: number } | null>(null);
  const [tab, setTab] = useState<QueueChapter["tab"]>("needs_review");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "chapter", dir: 1 });
  const [menu, setMenu] = useState<string | null>(null);

  const load = () => {
    apiGet("/api/admin/chapters").then(setData);
  };
  useEffect(load, []);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLowerCase();
    const value = (c: QueueChapter) =>
      sort.key === "chapter" ? c.title : sort.key === "storybook" ? c.childName : sort.key === "reason" ? c.reasons.join(",") : c.guardianStatus;
    return data.chapters
      .filter((c) => c.tab === tab)
      .filter((c) => !q || [c.title, c.childName, c.storybookTitle].some((t) => t.toLowerCase().includes(q)))
      .sort((a, b) => value(a).localeCompare(value(b)) * sort.dir);
  }, [data, tab, query, sort]);

  const holdChapter = async (id: string) => {
    setMenu(null);
    await apiSend(`/api/admin/chapters/${id}/hold`, "PUT");
    load();
  };

  if (!data) return <p>Loading…</p>;
  const count = (t: QueueChapter["tab"]) => data.chapters.filter((c) => c.tab === t).length;
  const header = (key: SortKey, label: string) => (
    <th>
      <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
        {label} <IconSort size={16} />
      </button>
    </th>
  );

  return (
    <div>
      <h1 className="adm-title">Story Review</h1>
      <p className="adm-sub">Help every chapter find its way.</p>

      <div className="search" style={{ marginTop: 18 }}>
        <span className="search__icon">
          <IconSearch size={22} />
        </span>
        <input className="input" style={{ borderColor: "#dcd7cd", minHeight: 50 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search chapters or storybooks…" aria-label="Search chapters or storybooks" />
      </div>

      <div className="adm-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`adm-tab ${tab === t.key ? "adm-tab--on" : ""}`} onClick={() => setTab(t.key)}>
            {t.label}
            {t.key !== "approved" || count(t.key) ? ` (${count(t.key)})` : ""}
          </button>
        ))}
      </div>

      <table className="adm-table">
        <thead>
          <tr>
            {header("chapter", "Chapter")}
            {header("storybook", "Storybook")}
            {header("reason", "Reason")}
            {header("status", "Status")}
            <th style={{ textAlign: "right" }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => (
            <tr key={c.id}>
              <td>
                <div className="hstack" style={{ gap: 14 }}>
                  {c.cover ? <img src={`/${c.cover}`} alt="" className="adm-thumb" /> : <span className="adm-thumb" />}
                  <span>
                    <span className="adm-cell-title" style={{ display: "block" }}>{c.title}</span>
                    <span className="t-xs t-muted">
                      Chapter {c.sequence}
                      {c.version > 1 ? ` · version ${c.version}` : ""}
                    </span>
                  </span>
                </div>
              </td>
              <td>{c.childName}</td>
              <td>{c.reasons.map((r) => REASON_LABEL[r] || r).join(", ") || "—"}</td>
              <td>{statusPill(c)}</td>
              <td>
                <div className="adm-actions">
                  <Link className="btn btn--purple btn--xs btn--auto" to={`/admin/review/${c.id}`}>
                    Review
                  </Link>
                  <AdminDots open={menu === c.id} onToggle={() => setMenu((m) => (m === c.id ? null : c.id))} onClose={() => setMenu(null)}>
                    <button onClick={() => navigate(`/admin/review/${c.id}`)}>
                      <IconFileText size={18} /> Open review
                    </button>
                    {c.guardianStatus === "approved" && (
                      <button className="danger" onClick={() => void holdChapter(c.id)}>
                        <IconWarning size={18} /> Hold this chapter
                      </button>
                    )}
                    <button onClick={() => navigate(`/admin/families?q=${encodeURIComponent(c.childName)}`)}>
                      <IconBook size={18} /> Show the family
                    </button>
                  </AdminDots>
                </div>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} style={{ color: "var(--ink-3)", padding: "22px 16px" }}>
                {query ? "No chapters match your search." : "Nothing here right now."}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {data.heldShared === 0 ? (
        <div className="adm-banner">
          <span className="adm-banner__icon">
            <IconShield size={24} />
          </span>
          <div>
            <strong>No held chapter is shared with a family.</strong>
            Resolve findings before publication.
          </div>
        </div>
      ) : (
        <div className="adm-banner adm-banner--warn">
          <span className="adm-banner__icon">
            <IconWarning size={24} />
          </span>
          <div>
            <strong>
              {data.heldShared} held {data.heldShared === 1 ? "chapter is" : "chapters are"} still readable by a family.
            </strong>
            Open it and choose Keep on hold.
          </div>
        </div>
      )}

      <h2 className="adm-section-title">Review workflow</h2>
      <div className="adm-flow">
        {[
          [<IconFileText size={24} key="d" />, "Draft", "Generated chapter", false],
          [<IconSearch size={24} key="r" />, "Review", "Check for accuracy and appropriateness", true],
          [<IconEdit size={24} key="e" />, "Revise or approve", "Request changes or approve", false],
          [<IconBook size={24} key="p" />, "Publish", "The parent approves the pages and publishes", false],
        ].map(([icon, title, sub, on], i, all) => (
          <div key={title as string} style={{ display: "contents" }}>
            <div className={`adm-flow__step ${on ? "adm-flow__step--on" : ""}`}>
              <span style={{ color: on ? "var(--purple)" : "var(--ink)" }}>{icon}</span>
              <div>
                <div className="adm-flow__title">{title}</div>
                <div className="adm-flow__sub">{sub}</div>
              </div>
            </div>
            {i < all.length - 1 && <span className="adm-flow__arrow">→</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// A "…" button with a small menu; closes when clicking elsewhere.
export function AdminDots({ open, onToggle, onClose, children }: { open: boolean; onToggle: () => void; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && onClose();
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, onClose]);
  return (
    <div className="adm-dots" ref={ref}>
      <button onClick={onToggle} aria-label="More actions" aria-expanded={open}>
        <IconDots size={20} />
      </button>
      {open && (
        <div className="adm-menu" role="menu" onClick={onClose}>
          {children}
        </div>
      )}
    </div>
  );
}
