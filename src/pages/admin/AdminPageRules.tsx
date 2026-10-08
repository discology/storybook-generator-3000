import { useEffect, useState } from "react";
import { apiGet, apiSend, ApiError } from "../../lib/api";
import ShotReviews, { type ShotReviewItem } from "./ShotReviews";

interface ReadingProfile {
  label: string;
  pagesMin: number;
  pagesMax: number;
  maxWordsPerPage: number;
  maxWordsPerSentence: number;
  vocabulary: string;
  pictures?: string;
}

interface ShotType {
  key: string;
  label: string;
  framing: string;
}

interface BlockedShot {
  id: string;
  pattern: string;
  why: string;
  instead: string;
}

interface PageRules {
  readingProfiles: Record<string, ReadingProfile>;
  embellishment: string;
  illustrationStyle: string;
  peopleStyle: string;
  pictureDirection?: string;
  shotTypes?: ShotType[];
  blockedShots?: BlockedShot[];
  shotReviewThreshold?: number;
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
  const [notice, setNotice] = useState<string | null>(null);
  const [reviews, setReviews] = useState<{ threshold: number; items: ShotReviewItem[] } | null>(null);

  const load = () =>
    apiGet("/api/admin/page-rules").then((d: RulesResponse) => {
      // Versions from before the Shot list existed show the defaults, so saving keeps them.
      const filled: PageRules = {
        ...d.rules,
        shotTypes: d.rules.shotTypes ?? d.defaults.shotTypes,
        blockedShots: d.rules.blockedShots ?? d.defaults.blockedShots,
        shotReviewThreshold: d.rules.shotReviewThreshold ?? d.defaults.shotReviewThreshold,
      };
      setData({ ...d, rules: filled });
      setRules(filled);
    });
  const loadReviews = () => apiGet("/api/admin/shot-reviews").then(setReviews);
  useEffect(() => {
    load();
    loadReviews();
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
  const shotTypes = rules.shotTypes ?? [];
  const blockedShots = rules.blockedShots ?? [];
  const setShotType = (i: number, key: "label" | "framing", value: string) => update({ ...rules, shotTypes: shotTypes.map((t, j) => (j === i ? { ...t, [key]: value } : t)) });
  const setBlocked = (i: number, key: "pattern" | "why" | "instead", value: string) => update({ ...rules, blockedShots: blockedShots.map((b, j) => (j === i ? { ...b, [key]: value } : b)) });
  const addBlocked = () => {
    const next = Math.max(0, ...blockedShots.map((b) => Number(b.id.replace(/\D/g, "")) || 0)) + 1;
    update({ ...rules, blockedShots: [...blockedShots, { id: `B-${next}`, pattern: "", why: "", instead: "" }] });
  };

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
      {notice && <p className="status-line">{notice}</p>}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Reading stages</h3>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Reading level</th>
              {NUMBER_FIELDS.map((f) => (
                <th key={f.key}>{f.label}</th>
              ))}
              <th>Vocabulary</th>
              <th>Pictures</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(rules.readingProfiles).map(([band, p]) => (
              <tr key={band}>
                <td style={{ whiteSpace: "nowrap" }}>
                  <strong>{p.label}</strong>
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
                  <textarea rows={3} value={p.vocabulary} onChange={(e) => setProfile(band, "vocabulary", e.target.value)} />
                </td>
                <td>
                  <textarea rows={3} value={p.pictures ?? ""} onChange={(e) => setProfile(band, "pictures", e.target.value)} placeholder="e.g. A picture on every page" />
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
        <label htmlFor="people">How people are drawn</label>
        <textarea id="people" rows={4} value={rules.peopleStyle} onChange={(e) => update({ ...rules, peopleStyle: e.target.value })} />
        <label htmlFor="direction">Camera and acting (page pictures only)</label>
        <textarea id="direction" rows={5} value={rules.pictureDirection ?? ""} onChange={(e) => update({ ...rules, pictureDirection: e.target.value })} />
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
        <p className="status-line">
          Pictures are 1536×1024 (landscape). How Baby Vambie and the other Vambies look is set on the Characters page, and their reference art is
          attached to every picture they're in.
        </p>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Shot list</h3>
        <p className="status-line">
          The shot types the planner may use, each with the framing line its picture prompt gets, and the shots that don't work on a Vambie. Before anything is drawn, a planned shot that
          mixes types, isn't on the list or matches a blocked shot is replanned once; if it still doesn't fit, the page is flagged and drawn anyway. The planner is always asked for one
          focus per shot.
        </p>
        <table className="admin-table">
          <thead>
            <tr>
              <th>Shot type</th>
              <th>Framing line in the picture prompt</th>
            </tr>
          </thead>
          <tbody>
            {shotTypes.map((t, i) => (
              <tr key={t.key}>
                <td style={{ whiteSpace: "nowrap" }}>
                  <input value={t.label} onChange={(e) => setShotType(i, "label", e.target.value)} style={{ width: 170 }} aria-label={`Name of the ${t.key} shot`} />
                </td>
                <td>
                  <textarea rows={2} value={t.framing} onChange={(e) => setShotType(i, "framing", e.target.value)} aria-label={`Framing line for ${t.label}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h4 style={{ margin: "16px 0 4px" }}>Shots that don't work on a Vambie</h4>
        <p className="status-line">A shot matches when any of its words appear in the planned type, angle or focus.</p>
        <table className="admin-table">
          <thead>
            <tr>
              <th></th>
              <th>Words that mark the shot</th>
              <th>Why it doesn't work</th>
              <th>Use instead</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {blockedShots.map((b, i) => (
              <tr key={b.id}>
                <td style={{ whiteSpace: "nowrap" }}>
                  <strong>{b.id}</strong>
                </td>
                <td>
                  <textarea rows={2} value={b.pattern} onChange={(e) => setBlocked(i, "pattern", e.target.value)} placeholder="feet, ankle height" aria-label={`${b.id} words`} />
                </td>
                <td>
                  <textarea rows={2} value={b.why} onChange={(e) => setBlocked(i, "why", e.target.value)} aria-label={`${b.id} why`} />
                </td>
                <td>
                  <textarea rows={2} value={b.instead} onChange={(e) => setBlocked(i, "instead", e.target.value)} aria-label={`${b.id} use instead`} />
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn-link" onClick={() => update({ ...rules, blockedShots: blockedShots.filter((_, j) => j !== i) })}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <button className="btn-link" onClick={addBlocked}>
          Add a shot that doesn't work
        </button>
        <div className="row" style={{ alignItems: "center", gap: 12 }}>
          <label htmlFor="shot-threshold" style={{ margin: 0 }}>
            Propose a shot for review once it's flagged on this many pages
          </label>
          <input
            id="shot-threshold"
            type="number"
            min={1}
            max={50}
            value={rules.shotReviewThreshold ?? 3}
            onChange={(e) => update({ ...rules, shotReviewThreshold: Number(e.target.value) })}
            style={{ width: 70 }}
          />
        </div>
      </div>

      {reviews && (
        <ShotReviews
          items={reviews.items}
          threshold={reviews.threshold}
          disabled={dirty}
          disabledNote="Save or discard your changes above first: blocking a shot saves a new version."
          onChanged={(n) => {
            setNotice(n);
            void load();
            void loadReviews();
          }}
        />
      )}

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
