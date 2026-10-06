import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiGet } from "../../lib/api";
import { Field, Select } from "../../components/ui";
import { IconDownload, IconInfo, IconSort } from "../../components/icons";

// What the AI costs: per chapter, per family and week by week (server/costRoutes.ts).

type Kind = "text" | "image" | "voice";

interface CostChapter {
  id: string;
  title: string;
  familyId: string;
  family: string;
  storybookId: string;
  createdAt: string;
  status: string;
  stage: string;
  madeBy: string | null;
  pages: number;
  pictures: number;
  drawn: number;
  rewrites: number;
  tracked: boolean;
  cost: number | null;
  byKind: Record<Kind, number> | null;
}

interface CostFamily {
  id: string;
  name: string;
  owner: string | null;
  stage: string;
  joined: string;
  chapters: number;
  chaptersPerWeek: number;
  avgPerChapter: number | null;
  spend: number;
  chapterSpend: number;
  memorySpend: number;
  characterSpend: number;
  monthly: number | null;
}

interface CostData {
  trackingSince: string | null;
  pricesChecked: string;
  prices: Record<string, { input: number; cached?: number; imageInput?: number; output: number }>;
  period: { from: string | null; to: string };
  options: { families: { id: string; name: string; owner: string | null }[]; stages: { key: string; label: string }[] };
  totals: {
    spend: number;
    byKind: Record<Kind, number>;
    calls: number;
    estimatedCalls: number;
    chapters: number;
    trackedChapters: number;
    avgPerChapter: number | null;
    medianPerChapter: number | null;
    maxPerChapter: number | null;
    allInPerChapter: number | null;
    perPage: number | null;
    perPicture: number | null;
    redrawShare: number | null;
    families: number;
    activeFamilies: number;
    chaptersPerFamilyWeek: number | null;
    perDay: number | null;
    monthly: number | null;
  };
  weeks: { start: string; spend: number; text: number; image: number; voice: number; chapters: number; activeFamilies: number }[];
  steps: { step: string; label: string; kind: Kind; group: string; calls: number; spend: number; perCall: number; perChapter: number | null; models: string[] }[];
  families: CostFamily[];
  chapters: CostChapter[];
  moreChapters: number;
  unattributedSpend: number;
}

const PERIODS = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom" },
];

const MADE_BY: Record<string, string> = {
  family: "Family",
  weekly: "Weekly batch",
  admin: "Vambie team",
  visitor: "Visitor (not signed up)",
  system: "After a restart",
};

const KIND_LABEL: Record<Kind, string> = { image: "Pictures", text: "Writing & checks", voice: "Voice" };
const KIND_COLOR: Record<Kind, string> = { image: "var(--purple)", text: "var(--amber)", voice: "var(--pink)" };
const KINDS: Kind[] = ["image", "text", "voice"];

const usd = (v: number | null | undefined, precise = false) => {
  if (v === null || v === undefined) return "—";
  if (v > 0 && v < 0.005 && !precise) return "<$0.01";
  const digits = precise && v < 0.1 ? 3 : 2;
  return v.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });
};
const num = (v: number | null | undefined, digits = 1) => (v === null || v === undefined ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: digits }));
const day = (iso: string | null, year = false) =>
  iso
    ? (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? localDay(iso) : new Date(iso)).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(year ? { year: "numeric" } : {}) })
    : "—";
function inputDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function localDay(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

// The period as instants in the viewer's time zone: from the start of the first
// day up to the start of the day after the last.
function periodRange(period: string, customFrom: string, customTo: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today.getTime());
  tomorrow.setDate(tomorrow.getDate() + 1);
  const daysBack = (n: number) => {
    const d = new Date(today.getTime());
    d.setDate(d.getDate() - n + 1);
    return d;
  };
  switch (period) {
    case "7d":
      return { from: daysBack(7), to: tomorrow };
    case "30d":
      return { from: daysBack(30), to: tomorrow };
    case "90d":
      return { from: daysBack(90), to: tomorrow };
    case "month":
      return { from: new Date(today.getFullYear(), today.getMonth(), 1), to: tomorrow };
    case "last_month":
      return { from: new Date(today.getFullYear(), today.getMonth() - 1, 1), to: new Date(today.getFullYear(), today.getMonth(), 1) };
    case "custom": {
      const from = customFrom ? localDay(customFrom) : null;
      const to = customTo ? localDay(customTo) : today;
      to.setDate(to.getDate() + 1);
      return { from, to };
    }
    default:
      return { from: null, to: tomorrow };
  }
}

export default function AdminCosts() {
  const [params, setParams] = useSearchParams();
  const period = params.get("period") ?? "30d";
  const family = params.get("family") ?? "";
  const stage = params.get("stage") ?? "";
  const madeBy = params.get("madeBy") ?? "";
  const kind = params.get("kind") ?? "";
  const customFrom = params.get("from") ?? inputDate(new Date(Date.now() - 29 * 86400000));
  const customTo = params.get("to") ?? inputDate(new Date());
  const [data, setData] = useState<CostData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<{ key: "date" | "cost" | "family"; dir: 1 | -1 }>({ key: "date", dir: -1 });

  const set = (key: string, value: string) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key === "period" && value === "custom") {
          next.set("from", customFrom);
          next.set("to", customTo);
        }
        return next;
      },
      { replace: true }
    );

  useEffect(() => {
    const { from, to } = periodRange(period, customFrom, customTo);
    const q = new URLSearchParams({ to: to.toISOString(), tz: String(new Date().getTimezoneOffset()) });
    if (from) q.set("from", from.toISOString());
    if (family) q.set("family", family);
    if (stage) q.set("stage", stage);
    if (madeBy) q.set("madeBy", madeBy);
    if (kind) q.set("kind", kind);
    setLoading(true);
    apiGet(`/api/admin/costs?${q}`)
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((e) => setError(e.message || "Couldn't load costs."))
      .finally(() => setLoading(false));
  }, [period, family, stage, madeBy, kind, customFrom, customTo]);

  const chapters = useMemo(() => {
    const list = [...(data?.chapters ?? [])];
    const value = (c: CostChapter) => (sort.key === "cost" ? (c.cost ?? -1) : sort.key === "family" ? c.family : c.createdAt);
    return list.sort((a, b) => {
      const x = value(a);
      const y = value(b);
      return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y))) * sort.dir;
    });
  }, [data, sort]);

  // Average chapter cost at each reading stage (stages differ most in how many pictures they draw).
  const byStage = useMemo(() => {
    const groups = new Map<string, CostChapter[]>();
    for (const c of data?.chapters ?? []) if (c.tracked) groups.set(c.stage, [...(groups.get(c.stage) ?? []), c]);
    return [...groups.entries()].map(([label, list]) => ({
      label,
      chapters: list.length,
      avg: list.reduce((a, c) => a + (c.cost ?? 0), 0) / list.length,
      pictures: list.reduce((a, c) => a + c.pictures, 0) / list.length,
      pages: list.reduce((a, c) => a + c.pages, 0) / list.length,
    }));
  }, [data]);

  const downloadCsv = () => {
    if (!data) return;
    const header = ["Chapter", "Family", "Made", "Made by", "Reading stage", "Pages", "Pictures", "Pictures drawn", "Rewrites", "Writing & checks ($)", "Pictures ($)", "Total ($)"];
    const lines = chapters.map((c) => [
      c.title,
      c.family,
      new Date(c.createdAt).toISOString().slice(0, 10),
      c.madeBy ? MADE_BY[c.madeBy] : "",
      c.stage,
      c.pages,
      c.pictures,
      c.drawn,
      c.rewrites,
      c.byKind ? c.byKind.text.toFixed(4) : "",
      c.byKind ? c.byKind.image.toFixed(4) : "",
      c.cost !== null ? c.cost.toFixed(4) : "not tracked",
    ]);
    const csv = [header, ...lines].map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `vambie-chapter-costs-${inputDate(new Date())}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const t = data?.totals;
  const sortHeader = (key: "date" | "cost" | "family", label: string, right = false) => (
    <th className={right ? "num" : undefined}>
      <button onClick={() => setSort((s) => ({ key, dir: s.key === key ? (s.dir === 1 ? -1 : 1) : -1 }))}>
        {label} <IconSort size={16} />
      </button>
    </th>
  );

  return (
    <div>
      <h1 className="adm-title">Costs</h1>
      <p className="adm-sub">What the AI costs to run: per chapter, per family and week by week.</p>

      <div className="adm-tabs" role="tablist" aria-label="Period">
        {PERIODS.map((p) => (
          <button key={p.value} role="tab" aria-selected={period === p.value} className={`adm-tab ${period === p.value ? "adm-tab--on" : ""}`} onClick={() => set("period", p.value)}>
            {p.label}
          </button>
        ))}
      </div>

      <div className="cost-filters">
        {period === "custom" && (
          <>
            <Field label="From" htmlFor="cost-from">
              <input id="cost-from" type="date" className="input" value={customFrom} max={customTo} onChange={(e) => set("from", e.target.value)} />
            </Field>
            <Field label="To" htmlFor="cost-to">
              <input id="cost-to" type="date" className="input" value={customTo} min={customFrom} onChange={(e) => set("to", e.target.value)} />
            </Field>
          </>
        )}
        <Field label="Family" htmlFor="cost-family">
          <Select
            id="cost-family"
            value={family}
            onChange={(v) => set("family", v)}
            options={[{ value: "", label: "All families" }, ...(data?.options.families ?? []).map((f) => ({ value: f.id, label: f.owner ? `${f.name} (${f.owner})` : f.name }))]}
          />
        </Field>
        <Field label="Reading stage" htmlFor="cost-stage">
          <Select id="cost-stage" value={stage} onChange={(v) => set("stage", v)} options={[{ value: "", label: "All stages" }, ...(data?.options.stages ?? []).map((s) => ({ value: s.key, label: s.label }))]} />
        </Field>
        <Field label="Started by" htmlFor="cost-made-by">
          <Select id="cost-made-by" value={madeBy} onChange={(v) => set("madeBy", v)} options={[{ value: "", label: "Anyone" }, ...Object.entries(MADE_BY).map(([value, label]) => ({ value, label }))]} />
        </Field>
        <Field label="Cost type" htmlFor="cost-kind">
          <Select id="cost-kind" value={kind} onChange={(v) => set("kind", v)} options={[{ value: "", label: "Everything" }, ...KINDS.map((k) => ({ value: k, label: KIND_LABEL[k] }))]} />
        </Field>
      </div>

      {error && (
        <p className="t-small" role="alert" style={{ color: "var(--red)", marginTop: 16 }}>
          {error}
        </p>
      )}
      {!data && !error && <p style={{ marginTop: 22 }}>Loading…</p>}

      {data && t && (
        <div style={{ opacity: loading ? 0.55 : 1, transition: "opacity 0.15s" }}>
          <div className="cost-note">
            <IconInfo size={20} />
            <span>
              {data.trackingSince
                ? `Costs are tracked from ${day(data.trackingSince, true)}. Chapters made before then are counted but have no cost.`
                : "No AI costs recorded yet. They're recorded from the next AI call on."}
              {t.estimatedCalls > 0 && ` ${t.estimatedCalls} of ${t.calls} calls didn't report their usage and are estimated.`}
            </span>
          </div>

          <div className="stat-grid" style={{ marginTop: 18 }}>
            <Stat value={usd(t.spend)} label="Spent on AI" sub={KINDS.filter((k) => t.byKind[k] > 0).map((k) => `${KIND_LABEL[k]} ${usd(t.byKind[k])}`).join(" · ") || "Nothing in this period"} />
            <Stat
              value={usd(t.avgPerChapter)}
              label="Average per chapter"
              sub={t.trackedChapters ? `Median ${usd(t.medianPerChapter)} · highest ${usd(t.maxPerChapter)}` : "No tracked chapters yet"}
            />
            <Stat value={usd(t.allInPerChapter)} label="All-in per chapter" sub="Adds each family's memories and character designs" />
            <Stat value={String(t.chapters)} label="Chapters made" sub={t.trackedChapters !== t.chapters ? `${t.trackedChapters} with costs tracked` : `${t.activeFamilies} of ${t.families} families`} />
            <Stat value={num(t.chaptersPerFamilyWeek, 2)} label="Chapters per family a week" sub={`Across ${t.families} ${t.families === 1 ? "family" : "families"}`} />
            <Stat value={usd(t.monthly)} label="A month at this pace" sub={t.perDay !== null ? `${usd(t.perDay)} a day` : "—"} />
            <Stat value={usd(t.perPicture, true)} label="Per page picture" sub={`${usd(t.perPage, true)} per page, all in`} />
            <Stat value={t.redrawShare === null ? "—" : `${Math.round(t.redrawShare * 100)}%`} label="Of picture spend on redraws" sub="Automatic fixes plus redraws people asked for" />
          </div>

          <h2 className="adm-section-title">Week by week</h2>
          <div className="adm-panel">
            <WeeklyChart weeks={data.weeks} />
          </div>

          <div className="cost-two">
            <section>
              <h2 className="adm-section-title">Where the money goes</h2>
              <div className="adm-scroll">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Step</th>
                      <th className="num">Calls</th>
                      <th className="num">Each</th>
                      <th className="num">Per chapter</th>
                      <th className="num">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.steps.map((s) => (
                      <tr key={s.step}>
                        <td>
                          <span className="cost-dot" style={{ background: KIND_COLOR[s.kind] }} />
                          {s.label}
                          <span className="t-xs t-muted" style={{ display: "block", marginLeft: 18 }}>
                            {s.models.join(", ")}
                          </span>
                        </td>
                        <td className="num">{s.calls}</td>
                        <td className="num">{usd(s.perCall, true)}</td>
                        <td className="num">{s.perChapter === null ? "—" : usd(s.perChapter)}</td>
                        <td className="num">
                          <strong>{usd(s.spend)}</strong>
                          <span className="t-xs t-muted" style={{ display: "block" }}>
                            {t.spend ? `${Math.round((s.spend / t.spend) * 100)}%` : ""}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {data.steps.length === 0 && (
                      <tr>
                        <td colSpan={5} className="t-muted">
                          No AI calls in this period.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>
            <section>
              <h2 className="adm-section-title">By reading stage</h2>
              <div className="adm-scroll">
                <table className="adm-table">
                  <thead>
                    <tr>
                      <th>Stage</th>
                      <th className="num">Chapters</th>
                      <th className="num">Pictures</th>
                      <th className="num">Average</th>
                    </tr>
                  </thead>
                  <tbody>
                    {byStage.map((s) => (
                      <tr key={s.label}>
                        <td>{s.label}</td>
                        <td className="num">{s.chapters}</td>
                        <td className="num">{num(s.pictures)}</td>
                        <td className="num">
                          <strong>{usd(s.avg)}</strong>
                        </td>
                      </tr>
                    ))}
                    {byStage.length === 0 && (
                      <tr>
                        <td colSpan={4} className="t-muted">
                          No tracked chapters yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <p className="t-xs t-muted" style={{ marginTop: 8 }}>
                Pictures are the biggest cost, so stages with more pictures per chapter cost more.
              </p>
            </section>
          </div>

          <h2 className="adm-section-title">Families</h2>
          <div className="adm-scroll">
            <table className="adm-table cost-table--wide">
              <thead>
                <tr>
                  <th>Family</th>
                  <th className="num">Chapters</th>
                  <th className="num">A week</th>
                  <th className="num">Per chapter</th>
                  <th className="num">Chapter spend</th>
                  <th className="num">Memory spend</th>
                  <th className="num">Character spend</th>
                  <th className="num">Total</th>
                  <th className="num">A month</th>
                </tr>
              </thead>
              <tbody>
                {data.families.map((f) => (
                  <tr key={f.id}>
                    <td>
                      <button className="cost-link" onClick={() => set("family", family === f.id ? "" : f.id)} title={family === f.id ? "Show all families" : "Show only this family"}>
                        <span className="adm-cell-title" style={{ display: "block" }}>{f.name}</span>
                      </button>
                      <span className="t-xs t-muted" style={{ display: "block" }}>
                        {[f.owner, f.stage, `joined ${day(f.joined)}`].filter(Boolean).join(" · ")}
                      </span>
                    </td>
                    <td className="num">{f.chapters}</td>
                    <td className="num">{num(f.chaptersPerWeek, 2)}</td>
                    <td className="num">{usd(f.avgPerChapter)}</td>
                    <td className="num">{usd(f.chapterSpend)}</td>
                    <td className="num">{usd(f.memorySpend)}</td>
                    <td className="num">{usd(f.characterSpend)}</td>
                    <td className="num">
                      <strong>{usd(f.spend)}</strong>
                    </td>
                    <td className="num">{usd(f.monthly)}</td>
                  </tr>
                ))}
                {data.families.length === 0 && (
                  <tr>
                    <td colSpan={9} className="t-muted">
                      No family activity in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {data.unattributedSpend > 0 && !family && (
            <p className="t-xs t-muted" style={{ marginTop: 8 }}>
              {usd(data.unattributedSpend)} isn't tied to a family: Vambie library art, admin test runs, and families who deleted their account.
            </p>
          )}

          <div className="adm-head" style={{ marginTop: 34, marginBottom: 12, alignItems: "flex-end" }}>
            <h2 className="adm-section-title" style={{ margin: 0 }}>
              Chapters
            </h2>
            <button className="btn btn--outline btn--xs btn--auto" onClick={downloadCsv} disabled={!chapters.length}>
              <IconDownload size={18} /> Download CSV
            </button>
          </div>
          <div className="adm-scroll">
            <table className="adm-table cost-table--wide">
              <thead>
                <tr>
                  <th style={{ minWidth: 220 }}>Chapter</th>
                  {sortHeader("family", "Family")}
                  {sortHeader("date", "Made")}
                  <th>Started by</th>
                  <th className="num">Pages</th>
                  <th className="num">Pictures drawn</th>
                  <th className="num">Writing</th>
                  <th className="num">Pictures</th>
                  {sortHeader("cost", "Total", true)}
                </tr>
              </thead>
              <tbody>
                {chapters.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/admin/review/${c.id}`} className="adm-cell-title cost-link">
                        {c.title}
                      </Link>
                      <span className="t-xs t-muted" style={{ display: "block" }}>
                        {c.stage}
                        {c.rewrites ? ` · rewritten ${c.rewrites}×` : ""}
                      </span>
                    </td>
                    <td>{c.family}</td>
                    <td>{day(c.createdAt)}</td>
                    <td>{c.madeBy ? MADE_BY[c.madeBy] : "—"}</td>
                    <td className="num">{c.pages}</td>
                    <td className="num" title={`${c.pictures} pages with a picture`}>
                      {c.drawn}
                      {c.drawn > c.pictures ? <span className="t-xs t-muted"> of {c.pictures}</span> : null}
                    </td>
                    <td className="num">{c.byKind ? usd(c.byKind.text) : "—"}</td>
                    <td className="num">{c.byKind ? usd(c.byKind.image) : "—"}</td>
                    <td className="num">{c.tracked ? <strong>{usd(c.cost)}</strong> : <span className="t-xs t-muted">Not tracked</span>}</td>
                  </tr>
                ))}
                {chapters.length === 0 && (
                  <tr>
                    <td colSpan={9} className="t-muted">
                      No chapters in this period.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {data.moreChapters > 0 && <p className="t-xs t-muted" style={{ marginTop: 8 }}>Showing the newest 500 chapters; {data.moreChapters} more are in the totals.</p>}

          <details className="cost-prices">
            <summary>Prices used (checked {day(data.pricesChecked, true)})</summary>
            <p className="t-small t-muted">
              Standard OpenAI prices in US dollars per million tokens. Each call's cost is saved when it's made, so changing a price only affects new calls. Prices are set in
              server/aiUsage.ts.
            </p>
            <div className="adm-scroll">
              <table className="adm-table">
                <thead>
                  <tr>
                    <th>Model</th>
                    <th className="num">Input</th>
                    <th className="num">Cached input</th>
                    <th className="num">Picture input</th>
                    <th className="num">Output</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(data.prices).map(([model, p]) => (
                    <tr key={model}>
                      <td>{model}</td>
                      <td className="num">{usd(p.input)}</td>
                      <td className="num">{p.cached !== undefined ? usd(p.cached, true) : "—"}</td>
                      <td className="num">{p.imageInput !== undefined ? usd(p.imageInput) : "—"}</td>
                      <td className="num">{usd(p.output)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </div>
  );
}

function Stat({ value, label, sub }: { value: string; label: string; sub?: string }) {
  return (
    <div className="stat">
      <div className="stat__n">{value}</div>
      <div className="stat__label">{label}</div>
      {sub && <div className="stat__sub">{sub}</div>}
    </div>
  );
}

// Stacked bars of spend per week, with the number of chapters made above each.
function WeeklyChart({ weeks }: { weeks: CostData["weeks"] }) {
  if (weeks.length === 0) return <p className="t-small t-muted">Nothing in this period.</p>;
  const max = Math.max(...weeks.map((w) => w.spend), 0.01);
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const H = 170;
  const left = 54;
  const W = Math.max(56, (760 - left - 8) / weeks.length);
  const barW = Math.min(44, W - 20);
  const width = left + weeks.length * W + 8;
  const labelEvery = Math.ceil(weeks.length / 14);
  const y = (v: number) => 24 + H - (v / top) * H;
  const ticks = Array.from({ length: Math.round(top / step) + 1 }, (_, i) => i * step);

  return (
    <>
      <div className="cost-legend">
        {KINDS.map((k) => (
          <span key={k}>
            <span className="cost-dot" style={{ background: KIND_COLOR[k] }} />
            {KIND_LABEL[k]}
          </span>
        ))}
        <span className="t-muted">Number above each bar: chapters made that week</span>
      </div>
      <div className="adm-scroll">
        <svg className="cost-chart" viewBox={`0 0 ${width} ${H + 56}`} style={{ minWidth: width > 800 ? width * 0.8 : 560 }} role="img" aria-label="AI spend per week">
          {ticks.map((v) => (
            <g key={v}>
              <line x1={left} x2={width} y1={y(v)} y2={y(v)} stroke="#ece6da" />
              <text x={left - 8} y={y(v) + 4} textAnchor="end" className="cost-chart__axis">
                {v === 0 ? "$0" : usd(v)}
              </text>
            </g>
          ))}
          {weeks.map((w, i) => {
            const x = left + i * W + (W - barW) / 2;
            let base = 0;
            return (
              <g key={w.start}>
                <title>{`Week of ${day(w.start)}: ${usd(w.spend)} · ${w.chapters} ${w.chapters === 1 ? "chapter" : "chapters"}${w.activeFamilies ? ` from ${w.activeFamilies} ${w.activeFamilies === 1 ? "family" : "families"}` : ""}`}</title>
                <rect x={left + i * W} y={24} width={W} height={H} fill="transparent" />
                {KINDS.map((k) => {
                  const h = (w[k] / top) * H;
                  const rect = h > 0 ? <rect key={k} x={x} y={y(base + w[k])} width={barW} height={Math.max(h, 1)} rx={3} fill={KIND_COLOR[k]} /> : null;
                  base += w[k];
                  return rect;
                })}
                {w.chapters > 0 && (
                  <text x={x + barW / 2} y={y(w.spend) - 7} textAnchor="middle" className="cost-chart__count">
                    {w.chapters}
                  </text>
                )}
                {i % labelEvery === 0 && (
                  <text x={x + barW / 2} y={H + 46} textAnchor="middle" className="cost-chart__axis">
                    {day(w.start)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </>
  );
}

// 1, 2 or 5 times a power of ten, giving about four gridlines.
function niceStep(max: number) {
  const raw = max / 4;
  const power = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 5, 10].map((m) => m * power).find((s) => s >= raw) ?? raw;
}
