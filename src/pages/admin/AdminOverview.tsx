import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiGet, apiSend } from "../../lib/api";
import { IconChat, IconChevronRight, IconFileText, IconSearch, IconSettings } from "../../components/icons";

interface Overview {
  counts: { families: number; memoriesThisWeek: number; chaptersThisWeek: number; held: number; openFeedback: number; failedMemories: number; pendingInvites: number };
  needsAttention: { id: string; title: string; childName: string }[];
  recentFeedback: { id: string; chapterId: string; chapterTitle: string; reason: string; note: string; from: string; createdAt: string }[];
}

const FEEDBACK_LABEL: Record<string, string> = {
  missed_meaning: "It missed what they meant",
  too_private: "Something feels too private",
  reading_level: "The reading level feels off",
  wrong_detail: "A character or detail is wrong",
};

export default function AdminOverview() {
  const [data, setData] = useState<Overview | null>(null);
  useEffect(() => {
    apiGet("/api/admin/overview").then(setData);
  }, []);
  if (!data) return <p>Loading…</p>;
  const c = data.counts;
  const stat = (n: number, label: string, to?: string, alert = false) => {
    const body = (
      <>
        <div className="stat__n">{n}</div>
        <div className="stat__label">{label}</div>
      </>
    );
    return to ? (
      <Link to={to} className={`stat ${alert && n > 0 ? "stat--alert" : ""}`}>
        {body}
      </Link>
    ) : (
      <div className="stat">{body}</div>
    );
  };

  return (
    <div>
      <h1 className="adm-title">Overview</h1>
      <p className="adm-sub">How the families' stories are coming along.</p>
      <div className="stat-grid" style={{ marginTop: 22 }}>
        {stat(c.held, "Chapters held for review", "/admin/review", true)}
        {stat(c.openFeedback, "Open family feedback", "/admin/review", true)}
        {stat(c.memoriesThisWeek, "Memories this week")}
        {stat(c.chaptersThisWeek, "Chapters made this week")}
        {stat(c.families, "Storybooks", "/admin/families")}
        {stat(c.pendingInvites, "Invites waiting")}
        {stat(c.failedMemories, "Memories that couldn't be transcribed", undefined, true)}
      </div>

      {data.needsAttention.length > 0 && (
        <>
          <h2 className="adm-section-title">Pictures that need another try</h2>
          <div className="adm-panel" style={{ padding: "6px 18px" }}>
            {data.needsAttention.map((ch) => (
              <Link key={ch.id} to={`/admin/review/${ch.id}`} className="menu__row" style={{ textDecoration: "none" }}>
                <span className="menu__text">
                  <span className="menu__title">{ch.title}</span>
                  <span className="menu__sub" style={{ display: "block" }}>
                    {ch.childName}'s storybook · the parent can redraw failed pictures from the chapter's pages
                  </span>
                </span>
                <IconChevronRight size={20} />
              </Link>
            ))}
          </div>
        </>
      )}

      <h2 className="adm-section-title">Latest family feedback</h2>
      <div className="adm-panel" style={{ padding: "6px 18px" }}>
        {data.recentFeedback.length === 0 ? (
          <p className="t-small t-muted" style={{ padding: "12px 0" }}>No open feedback.</p>
        ) : (
          data.recentFeedback.map((f) => (
            <Link key={f.id} to={`/admin/review/${f.chapterId}`} className="menu__row" style={{ textDecoration: "none" }}>
              <span className="menu__icon">
                <IconChat size={22} />
              </span>
              <span className="menu__text">
                <span className="menu__title">{FEEDBACK_LABEL[f.reason] ?? f.reason}</span>
                <span className="menu__sub" style={{ display: "block" }}>
                  “{f.chapterTitle}” · {f.from}
                  {f.note ? ` · “${f.note.slice(0, 90)}${f.note.length > 90 ? "…" : ""}”` : ""}
                </span>
              </span>
              <IconChevronRight size={20} />
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

interface FamilyRow {
  id: string;
  title: string;
  childName: string;
  owner: string | null;
  members: number;
  invited: number;
  memories: number;
  chapters: number;
  stage: string;
  lastMemoryAt: string | null;
  createdAt: string;
}

export function AdminFamilies() {
  const [params] = useSearchParams();
  const [rows, setRows] = useState<FamilyRow[] | null>(null);
  const [query, setQuery] = useState(params.get("q") ?? "");
  useEffect(() => {
    apiGet("/api/admin/families").then(setRows);
  }, []);
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (rows ?? []).filter((r) => !q || [r.childName, r.title, r.owner ?? ""].some((t) => t.toLowerCase().includes(q)));
  }, [rows, query]);
  if (!rows) return <p>Loading…</p>;
  const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—");

  return (
    <div>
      <h1 className="adm-title">Families</h1>
      <p className="adm-sub">Every storybook and who's writing it.</p>
      <div className="search" style={{ marginTop: 18 }}>
        <span className="search__icon">
          <IconSearch size={22} />
        </span>
        <input className="input" style={{ borderColor: "#dcd7cd", minHeight: 50 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search families…" aria-label="Search families" />
      </div>
      <table className="adm-table" style={{ marginTop: 16 }}>
        <thead>
          <tr>
            <th>Storybook</th>
            <th>Started by</th>
            <th>Family</th>
            <th>Reading stage</th>
            <th>Memories</th>
            <th>Chapters</th>
            <th>Last memory</th>
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => (
            <tr key={r.id}>
              <td>
                <span className="adm-cell-title" style={{ display: "block" }}>{r.childName}</span>
                <span className="t-xs t-muted">{r.title}</span>
              </td>
              <td>{r.owner ?? "—"}</td>
              <td>
                {r.members} joined{r.invited ? ` · ${r.invited} invited` : ""}
              </td>
              <td>{r.stage}</td>
              <td>{r.memories}</td>
              <td>{r.chapters}</td>
              <td>{date(r.lastMemoryAt)}</td>
            </tr>
          ))}
          {shown.length === 0 && (
            <tr>
              <td colSpan={7} style={{ color: "var(--ink-3)", padding: "22px 16px" }}>
                No families match.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="t-small t-muted" style={{ marginTop: 12 }}>Recordings and words stay private to each family; chapters are reviewed in Story Review.</p>
    </div>
  );
}

export function AdminSettings() {
  const items = [
    { to: "/admin/messages", icon: <IconChat size={24} />, title: "Text messages", sub: "Wording of the welcome, invite, reminder and chapter-ready texts" },
    { to: "/admin/ai", icon: <IconFileText size={24} />, title: "AI instructions", sub: "What the AI is told at each step, and which model it uses" },
    { to: "/admin/page-rules", icon: <IconSettings size={24} />, title: "Page rules", sub: "Reading stages, art direction, image model and quality" },
    { to: "/admin/visitors", icon: <IconSearch size={24} />, title: "Visitors", sub: "Free story previews before sign-up: the daily cap" },
  ];
  return (
    <div>
      <h1 className="adm-title">Settings</h1>
      <p className="adm-sub">How stories are written, drawn and sent.</p>
      <div className="adm-panel" style={{ marginTop: 22, padding: "6px 18px" }}>
        {items.map((i) => (
          <Link key={i.to} to={i.to} className="menu__row" style={{ textDecoration: "none" }}>
            <span className="menu__icon">{i.icon}</span>
            <span className="menu__text">
              <span className="menu__title">{i.title}</span>
              <span className="menu__sub" style={{ display: "block" }}>{i.sub}</span>
            </span>
            <IconChevronRight size={20} />
          </Link>
        ))}
      </div>
    </div>
  );
}

// Try before sign-up (server/guests.ts): how many free previews visitors get a day.
export function AdminVisitors() {
  const [data, setData] = useState<{ cap: number; previewsToday: number; drafts: number; perDevice: number; keptDays: number } | null>(null);
  const [cap, setCap] = useState("");
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiGet("/api/admin/visitors").then((d) => {
      setData(d);
      setCap(String(d.cap));
    });
  }, []);
  if (!data) return <p>Loading…</p>;
  const save = async () => {
    setError(null);
    try {
      const r = await apiSend("/api/admin/visitors", "PUT", { cap: Number(cap) });
      setData({ ...data, cap: r.cap });
      setSaved("Saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't save.");
    }
  };
  return (
    <div>
      <div className="adm-crumbs">
        <Link to="/admin/settings">Settings</Link> / Visitors
      </div>
      <h1 className="adm-title">Visitors</h1>
      <p className="adm-sub">People trying Vambie before they sign up get a free three-page preview of their story.</p>
      <div className="stat-grid" style={{ marginTop: 22 }}>
        <div className="stat">
          <div className="stat__n">
            {data.previewsToday} / {data.cap}
          </div>
          <div className="stat__label">Free previews in the last 24 hours</div>
        </div>
        <div className="stat">
          <div className="stat__n">{data.drafts}</div>
          <div className="stat__label">Unsaved drafts on visitors' devices</div>
        </div>
      </div>
      <div className="adm-panel" style={{ marginTop: 22, maxWidth: 620 }}>
        <label className="field__label" htmlFor="cap">
          Free previews a day, across all visitors
        </label>
        <div className="hstack" style={{ gap: 12 }}>
          <input id="cap" className="input" type="number" min={0} max={10000} value={cap} onChange={(e) => { setCap(e.target.value); setSaved(null); }} style={{ maxWidth: 160 }} />
          <button className="btn btn--purple btn--sm btn--auto" onClick={() => void save()}>
            Save
          </button>
          {saved && <span className="t-small t-muted">{saved}</span>}
        </div>
        {error && <p className="error-text">{error}</p>}
        <p className="field__hint" style={{ marginTop: 12 }}>
          Each preview costs about $0.40, so {Number(cap) || 0} a day is at most about ${Math.round((Number(cap) || 0) * 0.4)}. Past the cap, visitors can still record and save; their story is made once they verify their number. Each device and network also gets {data.perDevice - 1} preview and {data.perDevice - 1} retry a day, and unsaved drafts are deleted after {data.keptDays} days. 0 pauses free previews.
        </p>
      </div>
    </div>
  );
}
