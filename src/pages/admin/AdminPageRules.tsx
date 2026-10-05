import { useEffect, useState } from "react";
import { apiGet, apiSend, ApiError } from "../../lib/api";

interface ReadingProfile {
  label: string;
  pagesMin: number;
  pagesMax: number;
  maxWordsPerPage: number;
  maxWordsPerSentence: number;
  vocabulary: string;
}

interface PageRules {
  readingProfiles: Record<string, ReadingProfile>;
  embellishment: string;
  illustrationStyle: string;
  babyVambieAppearance: string;
  peopleStyle: string;
  imageModel: string;
  imageQuality: string;
}

interface RulesResponse {
  version: number;
  rules: PageRules;
  defaults: PageRules;
  embellishmentLevels: Record<string, { label: string; rule: string }>;
  imageModels: string[];
  history: { version: number; createdAt: string; chapters: number }[];
}

const NUMBER_FIELDS: { key: keyof ReadingProfile; label: string }[] = [
  { key: "pagesMin", label: "Min pages" },
  { key: "pagesMax", label: "Max pages" },
  { key: "maxWordsPerPage", label: "Max words / page" },
  { key: "maxWordsPerSentence", label: "Max words / sentence" },
];

export default function AdminPageRules() {
  const [data, setData] = useState<RulesResponse | null>(null);
  const [rules, setRules] = useState<PageRules | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const load = () =>
    apiGet("/api/admin/page-rules").then((d: RulesResponse) => {
      setData(d);
      setRules(d.rules);
    });
  useEffect(() => {
    load();
  }, []);

  if (!data || !rules) return <p>Loading…</p>;

  const dirty = JSON.stringify(rules) !== JSON.stringify(data.rules);
  const update = (next: PageRules) => {
    setRules(next);
    setSaved(false);
    setError(null);
  };
  const setProfile = (band: string, key: keyof ReadingProfile, value: string | number) =>
    update({ ...rules, readingProfiles: { ...rules.readingProfiles, [band]: { ...rules.readingProfiles[band], [key]: value } } });

  const save = async () => {
    try {
      await apiSend("/api/admin/page-rules", "PUT", { rules });
      await load();
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
    }
  };

  return (
    <div>
      <div className="row inline" style={{ justifyContent: "space-between", marginTop: 0 }}>
        <div>
          <h1 className="display" style={{ color: "var(--ink)", fontSize: "2rem" }}>
            Page Rules
          </h1>
          <p style={{ color: "var(--ink-soft)", marginTop: 0 }}>
            How chapters become illustrated pages. Currently version {data.version}.
          </p>
        </div>
        <div className="row inline">
          {dirty && <span className="pill warn">Unsaved changes</span>}
          {saved && !dirty && <span className="pill good">Saved as version {data.version}</span>}
          <button className="btn-primary" style={{ width: "auto" }} onClick={save} disabled={!dirty}>
            Save as new version
          </button>
        </div>
      </div>
      <p className="status-line">
        Saving creates a new version used for new chapters only. Existing chapters keep the version they were made with. How the AI plans and
        checks pages is worded under AI Instructions → Plan pages / Check pages.
      </p>
      {error && <p className="status-line" style={{ color: "#d94c4c" }}>{error}</p>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Reading levels</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Reading level</th>
              {NUMBER_FIELDS.map((f) => (
                <th key={f.key}>{f.label}</th>
              ))}
              <th>Vocabulary</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(rules.readingProfiles).map(([band, p]) => (
              <tr key={band}>
                <td style={{ whiteSpace: "nowrap" }}>
                  <strong>Ages {band}</strong>
                </td>
                {NUMBER_FIELDS.map((f) => (
                  <td key={f.key}>
                    <input
                      type="number"
                      min={1}
                      value={p[f.key] as number}
                      onChange={(e) => setProfile(band, f.key, Number(e.target.value))}
                      style={{ width: 70 }}
                    />
                  </td>
                ))}
                <td>
                  <textarea rows={2} value={p.vocabulary} onChange={(e) => setProfile(band, "vocabulary", e.target.value)} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="status-line">Word and sentence limits are checked in code on every page; pages over a limit are flagged for review.</p>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Fictional embellishment</h3>
        <p className="status-line">How much Baby Vambie's story may add beyond what the parent said.</p>
        {Object.entries(data.embellishmentLevels).map(([key, level]) => (
          <label key={key} style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", fontWeight: "normal" }}>
            <input
              type="radio"
              name="embellishment"
              checked={rules.embellishment === key}
              onChange={() => update({ ...rules, embellishment: key })}
              style={{ width: "auto", marginTop: "0.3rem" }}
            />
            <span>
              <strong>{level.label}</strong>
              {key === data.defaults.embellishment && " (default)"}
              <br />
              <span className="status-line">{level.rule}</span>
            </span>
          </label>
        ))}
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Illustrations</h3>
        <label htmlFor="style">Art style</label>
        <textarea id="style" rows={3} value={rules.illustrationStyle} onChange={(e) => update({ ...rules, illustrationStyle: e.target.value })} />
        <label htmlFor="vambie">How Baby Vambie looks</label>
        <textarea id="vambie" rows={2} value={rules.babyVambieAppearance} onChange={(e) => update({ ...rules, babyVambieAppearance: e.target.value })} />
        <label htmlFor="people">How family members are drawn</label>
        <textarea id="people" rows={2} value={rules.peopleStyle} onChange={(e) => update({ ...rules, peopleStyle: e.target.value })} />
        <div className="row">
          <div style={{ flex: 1 }}>
            <label htmlFor="model">Image model</label>
            <select id="model" value={rules.imageModel} onChange={(e) => update({ ...rules, imageModel: e.target.value })}>
              {data.imageModels.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label htmlFor="quality">Image quality</label>
            <select id="quality" value={rules.imageQuality} onChange={(e) => update({ ...rules, imageQuality: e.target.value })}>
              <option value="low">Low (fastest, cheapest)</option>
              <option value="medium">Medium</option>
              <option value="high">High (slowest, most expensive)</option>
            </select>
          </div>
        </div>
        <p className="status-line">Pictures are 1536×1024 (landscape). Every page after the first uses page 1's picture as a reference so characters stay consistent.</p>
      </div>

      {JSON.stringify(rules) !== JSON.stringify(data.defaults) && (
        <button className="btn-link" onClick={() => update(data.defaults)}>
          Reset all to the default rules
        </button>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Version history</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Version</th>
              <th>Saved</th>
              <th>Chapters made with it</th>
            </tr>
          </thead>
          <tbody>
            {data.history.map((h) => (
              <tr key={h.version}>
                <td>
                  v{h.version}
                  {h.version === data.version && " (current)"}
                </td>
                <td>{new Date(h.createdAt).toLocaleString()}</td>
                <td>{h.chapters}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
