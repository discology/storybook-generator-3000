import { useEffect, useState } from "react";
import { apiGet, apiSend, ApiError } from "../../lib/api";
import { IconClose } from "../../components/icons";

// Admin → Guide Book (VSB-102): the numbered rules every storybook is checked
// against. Edits are local until saved as a new version.

interface GuideRule {
  id: string;
  section: string;
  title: string;
  rule: string;
  why: string;
  good: string;
  bad: string;
  enforcedIn: string[];
}

interface GuideData {
  version: number;
  rules: GuideRule[];
  note: string;
  createdAt: string | null;
  sections: Record<string, string>;
  targets: Record<string, string>;
  versions: { version: number; note: string; createdAt: string; createdBy: { name: string | null } | null }[];
}

export default function AdminGuideBook() {
  const [data, setData] = useState<GuideData | null>(null);
  const [rules, setRules] = useState<GuideRule[]>([]);
  const [viewing, setViewing] = useState<number | null>(null);
  const [editing, setEditing] = useState<GuideRule | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = (version?: number) =>
    apiGet(`/api/admin/guide${version ? `?version=${version}` : ""}`).then((d: GuideData) => {
      setData(d);
      setRules(d.rules);
    });
  useEffect(() => {
    void load();
  }, []);

  if (!data) return <p>Loading…</p>;
  const latest = data.versions[0]?.version ?? 0;
  const readOnly = viewing !== null && viewing !== latest;
  const dirty = JSON.stringify(rules) !== JSON.stringify(data.rules) || (data.version === 0 && !readOnly);

  const nextId = (section: string) => {
    const used = rules.filter((r) => r.section === section).map((r) => Number(r.id.split("-")[1]) || 0);
    return `${section}-${Math.max(0, ...used) + 1}`;
  };
  const saveRule = (rule: GuideRule) => {
    setRules((all) => (all.some((r) => r.id === rule.id) ? all.map((r) => (r.id === rule.id ? rule : r)) : [...all, rule]));
    setEditing(null);
  };
  const save = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const { version } = await apiSend("/api/admin/guide", "PUT", { rules, note });
      setNote("");
      setViewing(null);
      await load();
      setMessage(`Saved as version ${version}.`);
    } catch (e) {
      setMessage(e instanceof ApiError ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <h1 className="display" style={{ color: "var(--ink)", fontSize: "2rem" }}>
        Guide Book
      </h1>
      <p style={{ color: "var(--ink-soft)", marginTop: 0 }}>
        The rules a good Vambie storybook follows. Flags are analyzed against them (Feedback → Analysis), and each rule says where it's enforced, so a fix can
        name the exact place to change.
      </p>
      <div className="row inline" style={{ gap: 10, flexWrap: "wrap", marginTop: 0 }}>
        <span className="status-line" style={{ margin: 0 }}>
          {data.version === 0 ? (
            <>
              <span className="pill warn">Draft v1</span> Not saved yet: review the rules, edit anything, and save to make it version 1.
            </>
          ) : (
            <>
              Version {data.version}
              {data.createdAt ? `, saved ${new Date(data.createdAt).toLocaleDateString()}` : ""}
              {data.note ? `: ${data.note}` : ""}
            </>
          )}
        </span>
        {data.versions.length > 1 && (
          <select
            className="input"
            style={{ width: "auto", minHeight: 38, fontSize: 15 }}
            value={viewing ?? latest}
            aria-label="Version"
            onChange={(e) => {
              const v = Number(e.target.value);
              setViewing(v);
              void load(v);
            }}
          >
            {data.versions.map((v) => (
              <option key={v.version} value={v.version}>
                Version {v.version} · {new Date(v.createdAt).toLocaleDateString()}
                {v.note ? ` · ${v.note.slice(0, 40)}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>
      {readOnly && <p className="status-line">You're looking at an earlier version. Pick the newest one to edit.</p>}
      {message && <p className="status-line">{message}</p>}

      {Object.entries(data.sections).map(([key, name]) => (
        <section key={key} style={{ marginTop: 24 }}>
          <div className="row inline" style={{ justifyContent: "space-between", marginTop: 0 }}>
            <h2 style={{ margin: 0 }}>{name}</h2>
            {!readOnly && (
              <button className="btn-small btn-secondary" onClick={() => setEditing({ id: nextId(key), section: key, title: "", rule: "", why: "", good: "", bad: "", enforcedIn: [] })}>
                Add a rule
              </button>
            )}
          </div>
          {rules
            .filter((r) => r.section === key)
            .sort((a, b) => Number(a.id.split("-")[1]) - Number(b.id.split("-")[1]))
            .map((r) => (
              <article key={r.id} className="fb-card" style={{ gridTemplateColumns: "minmax(0, 1fr)", marginTop: 10 }}>
                <div>
                  <div className="row inline" style={{ justifyContent: "space-between", marginTop: 0, gap: 8 }}>
                    <strong style={{ fontSize: 17 }}>
                      {r.id} · {r.title}
                    </strong>
                    {!readOnly && (
                      <span className="row inline" style={{ gap: 6, margin: 0 }}>
                        <button className="btn-small btn-secondary" onClick={() => setEditing(r)}>
                          Edit
                        </button>
                        <button className="btn-small btn-secondary" onClick={() => window.confirm(`Remove ${r.id}?`) && setRules((all) => all.filter((x) => x.id !== r.id))}>
                          Remove
                        </button>
                      </span>
                    )}
                  </div>
                  <p style={{ margin: "6px 0 0" }}>{r.rule}</p>
                  {r.why && <p className="t-small t-muted" style={{ margin: "4px 0 0" }}>Why: {r.why}</p>}
                  {(r.good || r.bad) && (
                    <p className="t-small" style={{ margin: "6px 0 0" }}>
                      {r.good && (
                        <>
                          <strong>Like:</strong> {r.good}{" "}
                        </>
                      )}
                      {r.bad && (
                        <>
                          <strong>Not like:</strong> {r.bad}
                        </>
                      )}
                    </p>
                  )}
                  <div className="flag-chips">
                    {r.enforcedIn.map((t) => (
                      <span key={t} className="flag-chip" style={{ cursor: "default", fontSize: 12 }}>
                        {data.targets[t] ?? t}
                      </span>
                    ))}
                  </div>
                </div>
              </article>
            ))}
        </section>
      ))}

      {!readOnly && dirty && (
        <div className="fb-card" style={{ gridTemplateColumns: "minmax(0, 1fr) auto", position: "sticky", bottom: 12, marginTop: 20, alignItems: "center" }}>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="What changed (saved with the version)" aria-label="Version note" />
          <button className="btn-small btn-primary" disabled={busy} onClick={() => void save()}>
            {busy ? "Saving…" : `Save as version ${latest + 1}`}
          </button>
        </div>
      )}

      {editing && <RuleDialog rule={editing} targets={data.targets} sections={data.sections} onClose={() => setEditing(null)} onSave={saveRule} />}
    </div>
  );
}

function RuleDialog({ rule, targets, sections, onClose, onSave }: { rule: GuideRule; targets: Record<string, string>; sections: Record<string, string>; onClose: () => void; onSave: (r: GuideRule) => void }) {
  const [form, setForm] = useState(rule);
  const set = <K extends keyof GuideRule>(k: K, v: GuideRule[K]) => setForm({ ...form, [k]: v });
  const field = (k: "title" | "rule" | "why" | "good" | "bad", label: string, rows = 1) => (
    <>
      <label className="field__label" htmlFor={`rule-${k}`} style={{ marginTop: 10 }}>
        {label}
      </label>
      {rows > 1 ? (
        <textarea id={`rule-${k}`} className="input" rows={rows} value={form[k]} onChange={(e) => set(k, e.target.value)} />
      ) : (
        <input id={`rule-${k}`} className="input" value={form[k]} onChange={(e) => set(k, e.target.value)} />
      )}
    </>
  );
  return (
    <>
      <div className="backdrop" onClick={onClose} />
      <div className="adm-modal adm-modal--auto" role="dialog" aria-modal="true" aria-label={`Rule ${rule.id}`} style={{ width: "min(640px, calc(100vw - 32px))", overflowY: "auto" }}>
        <div className="adm-modal__head">
          <h2 className="h-title" style={{ fontSize: 24, margin: 0 }}>
            {rule.id} · {sections[rule.section]}
          </h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close">
            <IconClose size={22} />
          </button>
        </div>
        {field("title", "Title")}
        {field("rule", "The rule", 4)}
        {field("why", "Why it matters", 2)}
        {field("good", "Like this (a good example)", 2)}
        {field("bad", "Not like this (a bad example)", 2)}
        <span className="field__label" style={{ marginTop: 10, display: "block" }}>
          Where it's enforced
        </span>
        <div className="flag-chips">
          {Object.entries(targets).map(([key, name]) => (
            <button
              key={key}
              type="button"
              className={`flag-chip ${form.enforcedIn.includes(key) ? "flag-chip--on" : ""}`}
              aria-pressed={form.enforcedIn.includes(key)}
              onClick={() => set("enforcedIn", form.enforcedIn.includes(key) ? form.enforcedIn.filter((t) => t !== key) : [...form.enforcedIn, key])}
            >
              {name}
            </button>
          ))}
        </div>
        <div className="row inline" style={{ gap: 8, marginTop: 16 }}>
          <button className="btn-small btn-primary" disabled={!form.title.trim() || !form.rule.trim()} onClick={() => onSave({ ...form, title: form.title.trim(), rule: form.rule.trim() })}>
            Keep this rule
          </button>
          <button className="btn-small btn-secondary" onClick={onClose}>
            Cancel
          </button>
        </div>
        <p className="t-xs t-muted">Changes are saved together, as a new version, from the bar at the bottom of the page.</p>
      </div>
    </>
  );
}
