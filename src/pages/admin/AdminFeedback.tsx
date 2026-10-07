import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiSend, ApiError } from "../../lib/api";
import { ACTION_AREAS, FLAG_CATEGORIES, PICTURE_CATEGORIES } from "../../lib/flags";
import FeedbackAnalysis from "./FeedbackAnalysis";

// Admin → Feedback (VSB-94): flags on pages from the team and parents, how often
// each problem comes up, redraws to compare, action items (and Jira), and export.

interface Redraw {
  id: string;
  status: "drawing" | "ready" | "failed";
  imagePath: string | null;
  ruleSetVersion: number | null;
  error: string | null;
  createdAt: string;
  prompt: string;
}

interface Flag {
  id: string;
  createdAt: string;
  source: "team" | "family";
  from: string;
  target: "picture" | "words" | "both" | "chapter";
  categories: string[];
  note: string;
  shouldBe: string;
  status: string;
  chapter: { id: string; title: string };
  pageId: string | null;
  snapshot: {
    parentReason?: string | null;
    stage?: string | null;
    ruleSetVersion?: number | null;
    pageNumber?: number;
    text?: string;
    plan?: { visibleAction?: string; emotionalTone?: string; setting?: string; shot?: { type?: string; angle?: string; focus?: string } | null };
    picture?: { imagePath: string | null; prompt: string; model: string | null; version: number } | null;
  };
  actionItem: { id: string; title: string; status: string; jiraKey: string | null } | null;
  redraws: Redraw[];
}

interface ActionItem {
  id: string;
  title: string;
  area: string;
  details: string;
  status: "open" | "done";
  jiraKey: string | null;
  createdAt: string;
  flags: { id: string; categories: string[]; note: string; chapter: { title: string } }[];
}

const STATUS_LABEL: Record<string, string> = { new: "New", reviewed: "Reviewed", action: "Action item", dismissed: "Dismissed" };
const STAGES: [string, string][] = [
  ["read_to_me", "Read to me"],
  ["picture_book", "Picture book"],
  ["early_reader", "Early reader"],
  ["chapter_book", "Chapter book"],
  ["big_kid", "Big kid"],
];
const label = (key: string) => FLAG_CATEGORIES[key] ?? key;
const FILTER = { width: "auto", minHeight: 40, fontSize: 15, padding: "0 10px" };

export default function AdminFeedback() {
  const [tab, setTab] = useState<"flags" | "analysis" | "actions">("flags");
  const [filters, setFilters] = useState({ target: "", category: "", source: "", status: "open", stage: "", from: "", to: "" });
  const [data, setData] = useState<{ flags: Flag[]; counts: { key: string; label: string; count: number }[]; jira: boolean } | null>(null);
  const [actions, setActions] = useState<{ items: ActionItem[]; jira: boolean } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [creating, setCreating] = useState<string[] | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const query = new URLSearchParams(Object.entries(filters).filter(([, v]) => v)).toString();
  const load = useCallback(() => apiGet(`/api/admin/flags?${query}`).then(setData), [query]);
  const loadActions = () => apiGet("/api/admin/action-items").then(setActions);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadActions();
  }, []);

  const act = async (key: string, run: () => Promise<unknown>, done?: string) => {
    setBusy(key);
    setNotice(null);
    try {
      await run();
      if (done) setNotice(done);
    } catch (e) {
      setNotice(e instanceof ApiError ? e.message : "Something went wrong.");
    } finally {
      setBusy(null);
      void load();
      void loadActions();
    }
  };

  const retest = async (category: string) => {
    const { count, estimate } = await apiSend("/api/admin/flags/retest", "POST", { category });
    if (!count) return setNotice(`No open picture flags in "${label(category)}".`);
    if (!window.confirm(`Redraw ${count} flagged picture${count === 1 ? "" : "s"} in "${label(category)}" with today's rules? About $${estimate.toFixed(2)}.`)) return;
    await act(`retest-${category}`, () => apiSend("/api/admin/flags/retest", "POST", { category, confirm: true }), `Re-testing ${count} picture${count === 1 ? "" : "s"}. They appear on each flag as they're drawn; refresh to see them.`);
  };

  const set = (k: keyof typeof filters, v: string) => {
    setFilters({ ...filters, [k]: v });
    setSelected([]);
  };

  return (
    <div>
      <h1 className="display" style={{ color: "var(--ink)", fontSize: "2rem" }}>
        Feedback
      </h1>
      <p style={{ color: "var(--ink-soft)", marginTop: 0 }}>
        Flagged pictures and words, from the team (Story Review → Flag this page) and from parents. Spot patterns, check fixes, and turn them into action items.
      </p>
      <div className="adm-tabs" role="tablist">
        <button role="tab" aria-selected={tab === "flags"} className={`adm-tab ${tab === "flags" ? "adm-tab--on" : ""}`} onClick={() => setTab("flags")}>
          Flags{data ? ` (${data.flags.length})` : ""}
        </button>
        <button role="tab" aria-selected={tab === "analysis"} className={`adm-tab ${tab === "analysis" ? "adm-tab--on" : ""}`} onClick={() => setTab("analysis")}>
          Analysis
        </button>
        <button role="tab" aria-selected={tab === "actions"} className={`adm-tab ${tab === "actions" ? "adm-tab--on" : ""}`} onClick={() => setTab("actions")}>
          Action items{actions ? ` (${actions.items.filter((i) => i.status === "open").length} open)` : ""}
        </button>
      </div>
      {notice && <p className="status-line">{notice}</p>}

      {tab === "flags" && (
        <>
          <div className="row inline" style={{ flexWrap: "wrap", gap: 8, alignItems: "flex-end", marginTop: 0 }}>
            <select className="input" style={FILTER} value={filters.target} onChange={(e) => set("target", e.target.value)} aria-label="Picture or words">
              <option value="">Pictures and words</option>
              <option value="picture">Pictures</option>
              <option value="words">Words</option>
            </select>
            <select className="input" style={FILTER} value={filters.category} onChange={(e) => set("category", e.target.value)} aria-label="Category">
              <option value="">Every category</option>
              {Object.entries(FLAG_CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select className="input" style={FILTER} value={filters.source} onChange={(e) => set("source", e.target.value)} aria-label="From">
              <option value="">Team and families</option>
              <option value="team">Team</option>
              <option value="family">Families</option>
            </select>
            <select className="input" style={FILTER} value={filters.status} onChange={(e) => set("status", e.target.value)} aria-label="Status">
              <option value="open">Open</option>
              <option value="">Every status</option>
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select className="input" style={FILTER} value={filters.stage} onChange={(e) => set("stage", e.target.value)} aria-label="Reading stage">
              <option value="">Every stage</option>
              {STAGES.map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <input className="input" style={FILTER} type="date" value={filters.from} onChange={(e) => set("from", e.target.value)} aria-label="From date" />
            <input className="input" style={FILTER} type="date" value={filters.to} onChange={(e) => set("to", e.target.value)} aria-label="To date" />
            <a className="btn-small btn-secondary" href={`/api/admin/flags/export?${query}`} style={{ textDecoration: "none" }}>
              Export
            </a>
          </div>

          {data && data.counts.length > 0 && (
            <div className="fb-counts" aria-label="How often each problem comes up">
              {data.counts.map((c) => (
                <span key={c.key} className="row inline" style={{ gap: 4, margin: 0 }}>
                  <button className={`flag-chip ${filters.category === c.key ? "flag-chip--on" : ""}`} onClick={() => set("category", filters.category === c.key ? "" : c.key)}>
                    {c.label} · {c.count}
                  </button>
                  {filters.category === c.key && c.key in PICTURE_CATEGORIES && (
                    <button className="btn-small btn-secondary" disabled={busy !== null} onClick={() => void retest(c.key)}>
                      {busy === `retest-${c.key}` ? "Starting…" : "Re-test all with today's rules"}
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}

          {selected.length > 0 && (
            <p className="status-line">
              {selected.length} selected ·{" "}
              <button className="tlink" onClick={() => setCreating(selected)}>
                Make an action item from them
              </button>
            </p>
          )}

          {!data ? (
            <p>Loading…</p>
          ) : data.flags.length === 0 ? (
            <p className="status-line">Nothing flagged here yet. Flag a page from Story Review, or wait for parents' feedback.</p>
          ) : (
            data.flags.map((f) => <FlagCard key={f.id} flag={f} busy={busy} act={act} selected={selected.includes(f.id)} onSelect={(on) => setSelected((s) => (on ? [...s, f.id] : s.filter((x) => x !== f.id)))} onAction={() => setCreating([f.id])} />)
          )}
        </>
      )}

      {tab === "analysis" && <FeedbackAnalysis filters={Object.fromEntries(Object.entries(filters).filter(([, v]) => v))} />}

      {tab === "actions" && actions && <ActionItems data={actions} busy={busy} act={act} onNew={() => setCreating([])} />}

      {creating && (
        <ActionDialog
          flagIds={creating}
          onClose={() => setCreating(null)}
          onSaved={() => {
            setCreating(null);
            setSelected([]);
            setNotice("Action item created.");
            void load();
            void loadActions();
          }}
        />
      )}
    </div>
  );
}

type Act = (key: string, run: () => Promise<unknown>, done?: string) => Promise<void>;

function FlagCard({ flag: f, busy, act, selected, onSelect, onAction }: { flag: Flag; busy: string | null; act: Act; selected: boolean; onSelect: (on: boolean) => void; onAction: () => void }) {
  const picture = f.snapshot.picture?.imagePath ?? null;
  const latest = f.redraws[0];
  const plan = f.snapshot.plan;
  return (
    <article className="fb-card" style={latest ? { gridTemplateColumns: "400px minmax(0, 1fr)" } : undefined}>
      <div>
        {f.target !== "words" && picture ? (
          latest ? (
            // The flagged picture and the latest redraw with today's rules, side by side.
            <div className="fb-compare" style={{ marginTop: 0 }}>
              <figure style={{ margin: 0 }}>
                <img src={`/${picture}`} alt="Flagged picture" />
                <figcaption className="t-xs t-muted">Flagged (rules v{f.snapshot.ruleSetVersion ?? "?"})</figcaption>
              </figure>
              <figure style={{ margin: 0 }}>
                {latest.status === "ready" && latest.imagePath && <img src={`/${latest.imagePath}`} alt="Redrawn with today's rules" />}
                {latest.status === "drawing" && <p className="t-small t-muted">Drawing…</p>}
                {latest.status === "failed" && <p className="error-text">{latest.error}</p>}
                <figcaption className="t-xs t-muted">
                  Today's rules{latest.ruleSetVersion ? ` (v${latest.ruleSetVersion})` : ""}, {new Date(latest.createdAt).toLocaleDateString()}
                </figcaption>
              </figure>
            </div>
          ) : (
            <img src={`/${picture}`} alt="Flagged picture" />
          )
        ) : (
          <p className="t-small" style={{ margin: 0, color: "var(--ink-soft)" }}>
            {f.snapshot.text || (f.target === "chapter" ? "About the whole chapter" : "")}
          </p>
        )}
      </div>
      <div>
        <div className="row inline" style={{ justifyContent: "space-between", marginTop: 0, gap: 8, flexWrap: "wrap" }}>
          <label className="row inline" style={{ gap: 6, margin: 0, fontWeight: 400 }}>
            <input type="checkbox" checked={selected} onChange={(e) => onSelect(e.target.checked)} style={{ width: "auto" }} />
            <span className="t-small">
              <strong>{f.source === "family" ? `From a family (${f.from})` : `From ${f.from}`}</strong> · {new Date(f.createdAt).toLocaleDateString()} ·{" "}
              <Link to={`/admin/review/${f.chapter.id}`}>“{f.chapter.title}”</Link>
              {f.snapshot.pageNumber ? `, page ${f.snapshot.pageNumber}` : ""}
            </span>
          </label>
          <select
            className="input"
            style={{ width: "auto", minHeight: 34, padding: "0 8px" }}
            value={f.status}
            disabled={busy !== null}
            aria-label="Status"
            onChange={(e) => void act(`status-${f.id}`, () => apiSend(`/api/admin/flags/${f.id}`, "PUT", { status: e.target.value }))}
          >
            {Object.entries(STATUS_LABEL).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div className="flag-chips">
          {f.categories.map((c) => (
            <span key={c} className="flag-chip" style={{ cursor: "default" }}>
              {label(c)}
            </span>
          ))}
        </div>
        {f.snapshot.parentReason && (
          <p className="t-small" style={{ margin: "8px 0 0" }}>
            <strong>In their words:</strong> {f.snapshot.parentReason}
          </p>
        )}
        <p style={{ margin: "10px 0 0" }}>{f.note || <em className="t-muted">No note.</em>}</p>
        {f.shouldBe && (
          <p className="t-small" style={{ margin: "6px 0 0" }}>
            <strong>Should be:</strong> {f.shouldBe}
          </p>
        )}
        {f.target !== "chapter" && (
          <details style={{ marginTop: 8 }}>
            <summary className="t-small" style={{ cursor: "pointer" }}>
              What it was made from
            </summary>
            {f.snapshot.text && f.target !== "picture" && (
              <p className="t-small">
                <strong>Words:</strong> {f.snapshot.text}
              </p>
            )}
            {plan && (
              <p className="t-small">
                <strong>Camera:</strong> {[plan.shot?.type, plan.shot?.angle, plan.shot?.focus && `focus: ${plan.shot.focus}`].filter(Boolean).join(", ") || "none"}
                <br />
                <strong>Action:</strong> {plan.visibleAction}
                <br />
                <strong>Mood:</strong> {plan.emotionalTone}
              </p>
            )}
            <p className="t-xs t-muted">
              Rules v{f.snapshot.ruleSetVersion ?? "?"}
              {f.snapshot.stage ? ` · ${f.snapshot.stage.replace(/_/g, " ")}` : ""}
              {f.snapshot.picture?.model ? ` · ${f.snapshot.picture.model}` : ""}
            </p>
            {f.snapshot.picture?.prompt && <div className="fb-pre">{f.snapshot.picture.prompt}</div>}
          </details>
        )}
        <div className="row inline" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          {f.target !== "words" && f.target !== "chapter" && f.pageId && (
            <button className="btn-small btn-secondary" disabled={busy !== null || latest?.status === "drawing"} onClick={() => void act(`redraw-${f.id}`, () => apiSend(`/api/admin/flags/${f.id}/redraw`, "POST"), "Redrawn with today's rules.")}>
              {busy === `redraw-${f.id}` ? "Redrawing… (about a minute)" : "Redraw to compare"}
            </button>
          )}
          {f.actionItem ? (
            <span className="t-small">
              Action item: <strong>{f.actionItem.title}</strong> ({f.actionItem.status}
              {f.actionItem.jiraKey ? `, ${f.actionItem.jiraKey}` : ""})
            </span>
          ) : (
            <button className="btn-small btn-secondary" onClick={onAction}>
              Make action item
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function ActionItems({ data, busy, act, onNew }: { data: { items: ActionItem[]; jira: boolean }; busy: string | null; act: Act; onNew: () => void }) {
  const [types, setTypes] = useState<Record<string, "Story" | "Task">>({});
  return (
    <>
      <div className="row inline" style={{ justifyContent: "space-between", marginTop: 0 }}>
        <p className="status-line" style={{ margin: 0 }}>
          {data.jira ? "Send to Jira creates a VSB ticket: a Story for development work, a Task otherwise." : "Jira isn't connected on this server yet; see the admin guide to add a Jira API token."}
        </p>
        <button className="btn-small btn-secondary" onClick={onNew}>
          New action item
        </button>
      </div>
      {data.items.length === 0 && <p className="status-line">No action items yet. Select flags and make one, or start a new one.</p>}
      {data.items.map((i) => (
        <article key={i.id} className="fb-card" style={{ gridTemplateColumns: "minmax(0, 1fr)" }}>
          <div>
            <div className="row inline" style={{ justifyContent: "space-between", marginTop: 0, gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 18 }}>{i.title}</strong>
              <span className={i.status === "done" ? "pill good" : "pill warn"}>{i.status === "done" ? "Done" : "Open"}</span>
            </div>
            <p className="t-small t-muted" style={{ margin: "4px 0 0" }}>
              {ACTION_AREAS[i.area] ?? i.area} · {new Date(i.createdAt).toLocaleDateString()} · {i.flags.length} flag{i.flags.length === 1 ? "" : "s"}
            </p>
            {i.details && <p style={{ margin: "8px 0 0", whiteSpace: "pre-wrap" }}>{i.details}</p>}
            {i.flags.length > 0 && (
              <ul className="t-small" style={{ margin: "8px 0 0", paddingLeft: 18 }}>
                {i.flags.map((f) => (
                  <li key={f.id}>
                    “{f.chapter.title}” ({f.categories.map(label).join(", ")}): {f.note}
                  </li>
                ))}
              </ul>
            )}
            <div className="row inline" style={{ gap: 8, flexWrap: "wrap", marginTop: 10 }}>
              <button className="btn-small btn-secondary" disabled={busy !== null} onClick={() => void act(`done-${i.id}`, () => apiSend(`/api/admin/action-items/${i.id}`, "PUT", { status: i.status === "done" ? "open" : "done" }))}>
                {i.status === "done" ? "Reopen" : "Mark done"}
              </button>
              {i.jiraKey ? (
                <a className="t-small" href={`https://discologyinc.atlassian.net/browse/${i.jiraKey}`} target="_blank" rel="noreferrer">
                  {i.jiraKey}
                </a>
              ) : (
                <>
                  <select className="input" style={{ width: "auto", minHeight: 34, padding: "0 8px" }} value={types[i.id] ?? "Task"} onChange={(e) => setTypes({ ...types, [i.id]: e.target.value as "Story" | "Task" })} aria-label="Jira type">
                    <option value="Task">Task</option>
                    <option value="Story">Story (development)</option>
                  </select>
                  <button className="btn-small btn-secondary" disabled={busy !== null} onClick={() => void act(`jira-${i.id}`, () => apiSend(`/api/admin/action-items/${i.id}/jira`, "POST", { type: types[i.id] ?? "Task" }), "Sent to Jira.")}>
                    {busy === `jira-${i.id}` ? "Sending…" : "Send to Jira"}
                  </button>
                </>
              )}
            </div>
          </div>
        </article>
      ))}
    </>
  );
}

function ActionDialog({ flagIds, onClose, onSaved }: { flagIds: string[]; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [area, setArea] = useState("picture_prompt");
  const [details, setDetails] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiSend("/api/admin/action-items", "POST", { title, area, details, flagIds });
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Couldn't save it.");
      setBusy(false);
    }
  };
  return (
    <>
      <div className="backdrop" onClick={() => !busy && onClose()} />
      <div className="adm-modal adm-modal--auto" role="dialog" aria-modal="true" aria-label="New action item" style={{ width: "min(560px, calc(100vw - 32px))" }}>
        <h2 className="h-title" style={{ fontSize: 26, margin: "0 0 12px" }}>
          New action item
        </h2>
        <p className="t-small t-muted" style={{ marginTop: 0 }}>
          {flagIds.length ? `From ${flagIds.length} flag${flagIds.length === 1 ? "" : "s"}; they'll be marked "Action item".` : "Not linked to any flags."}
        </p>
        <label className="field__label" htmlFor="ai-title">
          Title
        </label>
        <input id="ai-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Close-ups drift back to medium shots" />
        <label className="field__label" htmlFor="ai-area" style={{ marginTop: 10 }}>
          What to change
        </label>
        <select id="ai-area" className="input" value={area} onChange={(e) => setArea(e.target.value)}>
          {Object.entries(ACTION_AREAS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>
        <label className="field__label" htmlFor="ai-details" style={{ marginTop: 10 }}>
          Details
        </label>
        <textarea id="ai-details" className="input" rows={4} value={details} onChange={(e) => setDetails(e.target.value)} placeholder="What to try, and how we'll know it worked." />
        {error && <p className="error-text">{error}</p>}
        <div className="row inline" style={{ gap: 8, marginTop: 14 }}>
          <button className="btn-small btn-primary" disabled={busy || !title.trim()} onClick={() => void save()}>
            {busy ? "Saving…" : "Create action item"}
          </button>
          <button className="btn-small btn-secondary" disabled={busy} onClick={onClose}>
            Cancel
          </button>
        </div>
      </div>
    </>
  );
}
