import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiSend, ApiError } from "../../lib/api";
import { FLAG_CATEGORIES } from "../../lib/flags";

// Admin → Feedback → Analysis (VSB-103, VSB-104): the AI groups flags into
// patterns against the Guide Book and suggests fixes; a suggestion can be
// accepted (an action item), dismissed, or tried on a test copy of the rules.

interface RunSummary {
  id: string;
  createdAt: string;
  trigger: "manual" | "weekly";
  status: "running" | "ready" | "failed";
  error: string | null;
  flags: number;
  suggestions: number;
  costUsd: number | null;
  summary: string;
}

interface Pattern {
  name: string;
  summary: string;
  flagIds: string[];
  ruleIds: string[];
  rootCause: string;
  rootCauseNote: string;
  trend: string;
}

interface Trial {
  id: string;
  flagId: string;
  status: "drawing" | "ready" | "failed";
  imagePath: string | null;
  error: string | null;
  createdAt: string;
}

interface Suggestion {
  id: string;
  pattern: string;
  title: string;
  target: string;
  targetLabel: string;
  before: string;
  after: string;
  why: string;
  verify: string;
  confidence: "high" | "medium" | "low";
  status: "open" | "accepted" | "dismissed";
  flagIds: string[];
  ruleIds: string[];
  canTry: boolean;
  trials: Trial[];
}

interface MiniFlag {
  id: string;
  note: string;
  categories: string[];
  target: string;
  picture: string | null;
  chapter: { id: string; title: string };
  pageNumber: number | null;
}

interface RunDetail {
  id: string;
  createdAt: string;
  trigger: string;
  status: string;
  error: string | null;
  summary: string;
  guideVersion: number | null;
  ruleSetVersion: number | null;
  costUsd: number | null;
  flagIds: string[];
  patterns: Pattern[];
  flags: Record<string, MiniFlag>;
  suggestions: Suggestion[];
}

const ROOT_CAUSE: Record<string, string> = {
  picture_prompt: "Picture prompt / camera and acting",
  page_rules: "Page Rules wording",
  planner: "Planner wording",
  characters: "Character art",
  guide_gap: "Missing from the Guide Book",
  model_limit: "A limit of the image model",
  other: "Other",
};
const TREND_PILL: Record<string, string> = { new: "pill warn", growing: "pill bad", steady: "pill", shrinking: "pill good" };

export default function FeedbackAnalysis({ filters }: { filters: Record<string, string> }) {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<RunDetail | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const loadRuns = useCallback(() => apiGet("/api/admin/analyses").then((r: RunSummary[]) => {
    setRuns(r);
    setOpen((o) => o ?? r.find((x) => x.status !== "failed")?.id ?? null);
  }), []);
  const loadDetail = useCallback((id: string) => apiGet(`/api/admin/analyses/${id}`).then(setDetail), []);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns]);
  useEffect(() => {
    if (open) void loadDetail(open);
  }, [open, loadDetail]);

  // While an analysis or a trial is running, check back every few seconds.
  const running = runs?.some((r) => r.status === "running") || detail?.suggestions.some((s) => s.trials.some((t) => t.status === "drawing"));
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => {
      void loadRuns();
      if (open) void loadDetail(open);
    }, 5000);
    return () => clearInterval(t);
  }, [running, open, loadRuns, loadDetail]);

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
      void loadRuns();
      if (open) void loadDetail(open);
    }
  };

  const analyze = async () => {
    const est = await apiSend("/api/admin/analyses", "POST", { filters });
    if (!window.confirm(`Analyze ${est.flags} flag${est.flags === 1 ? "" : "s"} (${est.pictures} picture${est.pictures === 1 ? "" : "s"}) against the Guide Book? About $${est.estimate.toFixed(2)}.`)) return;
    await act("analyze", async () => {
      const { id } = await apiSend("/api/admin/analyses", "POST", { filters, confirm: true });
      setOpen(id);
    }, "Analyzing. It takes a minute or two; this page updates when it's ready.");
  };

  const tryIt = async (s: Suggestion) => {
    const est = await apiSend(`/api/admin/suggestions/${s.id}/try`, "POST", {});
    if (!window.confirm(`Redraw ${est.count} flagged picture${est.count === 1 ? "" : "s"} with this change applied to a test copy of the rules? The live rules don't change. About $${est.estimate.toFixed(2)}.`)) return;
    await act(`try-${s.id}`, () => apiSend(`/api/admin/suggestions/${s.id}/try`, "POST", { confirm: true }), "Drawing the trial pictures; they appear on the suggestion as they land.");
  };

  return (
    <div>
      <div className="row inline" style={{ justifyContent: "space-between", marginTop: 0, gap: 10, flexWrap: "wrap" }}>
        <p className="status-line" style={{ margin: 0 }}>
          The AI groups the flags in the current view into patterns, checks them against the <Link to="/admin/guide">Guide Book</Link>, and suggests fixes. A weekly digest
          runs every Monday morning when there are new flags.
        </p>
        <button className="btn-small btn-primary" disabled={busy !== null} onClick={() => void analyze().catch((e) => setNotice(e instanceof ApiError ? e.message : "Couldn't start."))}>
          {busy === "analyze" ? "Starting…" : "Analyze flags in this view"}
        </button>
      </div>
      {notice && <p className="status-line">{notice}</p>}

      {runs && runs.length > 0 && (
        <div className="fb-counts">
          {runs.map((r) => (
            <button key={r.id} className={`flag-chip ${open === r.id ? "flag-chip--on" : ""}`} onClick={() => setOpen(r.id)}>
              {new Date(r.createdAt).toLocaleDateString()} · {r.trigger === "weekly" ? "weekly" : "manual"} · {r.flags} flags
              {r.status === "running" ? " · running…" : r.status === "failed" ? " · failed" : ` · ${r.suggestions} suggestions`}
              {r.costUsd != null ? ` · $${r.costUsd.toFixed(2)}` : ""}
            </button>
          ))}
        </div>
      )}
      {runs && runs.length === 0 && <p className="status-line">No analyses yet.</p>}

      {detail && detail.id === open && (
        <div>
          {detail.status === "running" && <p className="status-line">Analyzing {detail.flagIds.length} flags…</p>}
          {detail.status === "failed" && <p className="error-text">{detail.error}</p>}
          {detail.status === "ready" && (
            <>
              <p style={{ fontSize: 17 }}>{detail.summary}</p>
              <p className="t-xs t-muted">
                Guide Book v{detail.guideVersion || "draft"} · Page Rules v{detail.ruleSetVersion} · {detail.flagIds.length} flags
              </p>
              {detail.patterns.length === 0 && <p className="status-line">No patterns found in these flags.</p>}
              {detail.patterns.map((p) => (
                <PatternCard
                  key={p.name}
                  pattern={p}
                  flags={detail.flags}
                  suggestions={detail.suggestions.filter((s) => s.pattern === p.name)}
                  busy={busy}
                  act={act}
                  tryIt={tryIt}
                />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

type Act = (key: string, run: () => Promise<unknown>, done?: string) => Promise<void>;

function PatternCard({ pattern: p, flags, suggestions, busy, act, tryIt }: { pattern: Pattern; flags: Record<string, MiniFlag>; suggestions: Suggestion[]; busy: string | null; act: Act; tryIt: (s: Suggestion) => Promise<void> }) {
  return (
    <article className="fb-card" style={{ gridTemplateColumns: "minmax(0, 1fr)", marginTop: 14 }}>
      <div>
        <div className="row inline" style={{ justifyContent: "space-between", marginTop: 0, gap: 8, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 19 }}>{p.name}</strong>
          <span className="row inline" style={{ gap: 6, margin: 0 }}>
            <span className={TREND_PILL[p.trend] ?? "pill"}>{p.trend}</span>
            <span className="pill">{p.flagIds.length} flags</span>
          </span>
        </div>
        <p style={{ margin: "6px 0 0" }}>{p.summary}</p>
        <p className="t-small" style={{ margin: "6px 0 0" }}>
          <strong>Root cause:</strong> {ROOT_CAUSE[p.rootCause] ?? p.rootCause}
          {p.rootCauseNote ? `: ${p.rootCauseNote}` : ""}
        </p>
        {p.ruleIds.length > 0 && (
          <p className="t-small" style={{ margin: "4px 0 0" }}>
            <strong>Guide Book rules broken:</strong>{" "}
            {p.ruleIds.map((id) => (
              <Link key={id} to="/admin/guide" style={{ marginRight: 6 }}>
                {id}
              </Link>
            ))}
          </p>
        )}
        <div className="fb-compare" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(90px, 1fr))" }}>
          {p.flagIds.map((id) => {
            const f = flags[id];
            if (!f) return null;
            return (
              <figure key={id} style={{ margin: 0 }} title={`${f.chapter.title}${f.pageNumber ? `, page ${f.pageNumber}` : ""}: ${f.note}`}>
                {f.picture && f.target !== "words" ? (
                  <img src={`/${f.picture}`} alt={f.note} style={{ width: "100%", borderRadius: 8, display: "block" }} />
                ) : (
                  <div className="t-xs" style={{ background: "#f6f2e8", borderRadius: 8, padding: 6, minHeight: 60 }}>
                    {f.note}
                  </div>
                )}
                <figcaption className="t-xs t-muted">{f.categories.map((c) => FLAG_CATEGORIES[c] ?? c).join(", ")}</figcaption>
              </figure>
            );
          })}
        </div>
        {suggestions.map((s) => (
          <SuggestionCard key={s.id} s={s} flags={flags} busy={busy} act={act} tryIt={tryIt} />
        ))}
      </div>
    </article>
  );
}

function SuggestionCard({ s, flags, busy, act, tryIt }: { s: Suggestion; flags: Record<string, MiniFlag>; busy: string | null; act: Act; tryIt: (s: Suggestion) => Promise<void> }) {
  // The newest trial redraw for each flagged picture.
  const latestTrial = (flagId: string) => s.trials.find((t) => t.flagId === flagId);
  const tried = s.flagIds.filter((id) => latestTrial(id));
  return (
    <div style={{ borderTop: "1px solid #e7e2d6", marginTop: 14, paddingTop: 12 }}>
      <div className="row inline" style={{ justifyContent: "space-between", marginTop: 0, gap: 8, flexWrap: "wrap" }}>
        <strong>{s.title}</strong>
        <span className="row inline" style={{ gap: 6, margin: 0 }}>
          <span className={s.confidence === "high" ? "pill good" : s.confidence === "low" ? "pill dark" : "pill warn"}>{s.confidence} confidence</span>
          {s.status !== "open" && <span className="pill">{s.status}</span>}
        </span>
      </div>
      <p className="t-small t-muted" style={{ margin: "4px 0 0" }}>
        Where: {s.targetLabel}
      </p>
      {s.why && <p style={{ margin: "6px 0 0" }}>{s.why}</p>}
      {(s.before || s.after) && (
        <div className="fb-compare" style={{ gridTemplateColumns: s.before ? "1fr 1fr" : "1fr" }}>
          {s.before && (
            <div>
              <span className="t-xs t-muted">Replace</span>
              <div className="fb-pre" style={{ textDecoration: "line-through", textDecorationColor: "#c96" }}>
                {s.before}
              </div>
            </div>
          )}
          <div>
            <span className="t-xs t-muted">{s.before ? "With" : "Add"}</span>
            <div className="fb-pre" style={{ background: "#eef6e4" }}>
              {s.after}
            </div>
          </div>
        </div>
      )}
      {s.verify && (
        <p className="t-small" style={{ margin: "6px 0 0" }}>
          <strong>Verify:</strong> {s.verify}
        </p>
      )}
      {s.status === "open" && (
        <div className="row inline" style={{ gap: 8, marginTop: 10, flexWrap: "wrap" }}>
          <button className="btn-small btn-primary" disabled={busy !== null} onClick={() => void act(`accept-${s.id}`, () => apiSend(`/api/admin/suggestions/${s.id}/accept`, "POST"), "Accepted: it's now an action item, linked to the pattern's flags.")}>
            Accept as action item
          </button>
          {s.canTry && (
            <button className="btn-small btn-secondary" disabled={busy !== null || s.trials.some((t) => t.status === "drawing")} onClick={() => void tryIt(s).catch((e) => console.error(e))}>
              {busy === `try-${s.id}` ? "Starting…" : "Try it"}
            </button>
          )}
          <button className="btn-small btn-secondary" disabled={busy !== null} onClick={() => void act(`dismiss-${s.id}`, () => apiSend(`/api/admin/suggestions/${s.id}/dismiss`, "POST"))}>
            Dismiss
          </button>
        </div>
      )}
      {tried.length > 0 && (
        <>
          <p className="t-xs t-muted" style={{ margin: "10px 0 0" }}>
            Tried on a test copy of the rules: flagged picture, then the trial.
          </p>
          <div className="fb-compare" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))" }}>
            {tried.map((id) => {
              const f = flags[id];
              const t = latestTrial(id)!;
              return (
                <div key={id} className="fb-compare" style={{ marginTop: 0 }}>
                  {f?.picture ? <img src={`/${f.picture}`} alt="Flagged" style={{ width: "100%", borderRadius: 8 }} /> : <span />}
                  {t.status === "ready" && t.imagePath ? (
                    <img src={`/${t.imagePath}`} alt="Trial" style={{ width: "100%", borderRadius: 8 }} />
                  ) : t.status === "failed" ? (
                    <p className="error-text">{t.error}</p>
                  ) : (
                    <p className="t-small t-muted">Drawing…</p>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
