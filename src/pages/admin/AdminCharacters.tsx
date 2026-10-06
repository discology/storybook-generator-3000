import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { apiGet, apiSend, ApiError } from "../../lib/api";
import type { CastingModes, LibraryCharacter } from "../../types";

const STATUS_PILL: Record<LibraryCharacter["status"], string> = { active: "pill good", draft: "pill warn", retired: "pill dark" };

export default function AdminCharacters() {
  const navigate = useNavigate();
  const [characters, setCharacters] = useState<LibraryCharacter[] | null>(null);
  const [castingModes, setCastingModes] = useState<CastingModes | null>(null);
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet("/api/admin/characters").then((d) => {
      setCharacters(d.characters);
      setCastingModes(d.castingModes);
    });
  }, []);

  // Suggest the variable name from the character's name until it's edited.
  const suggestedKey = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").replace(/^[^a-z]+/, "");
  const effectiveKey = keyTouched ? key : suggestedKey;

  const create = async () => {
    setError(null);
    try {
      const created: LibraryCharacter = await apiSend("/api/admin/characters", "POST", { key: effectiveKey, name });
      navigate(`/admin/characters/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add the character.");
    }
  };

  if (!characters || !castingModes) return <p>Loading…</p>;

  return (
    <div>
      <div className="row inline" style={{ justifyContent: "space-between", marginTop: 0 }}>
        <div>
          <h1 className="display" style={{ color: "var(--ink)", fontSize: "2rem" }}>
            Characters
          </h1>
          <p style={{ color: "var(--ink-soft)", marginTop: 0 }}>
            The recurring Vambies. Reference one anywhere in AI Instructions as <code>&lt;key&gt;</code>.
          </p>
        </div>
        {!adding && (
          <button className="btn-primary chevron" style={{ width: "auto" }} onClick={() => setAdding(true)}>
            New character
          </button>
        )}
      </div>

      {adding && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>New character</h3>
          <div className="row">
            <div style={{ flex: 1 }}>
              <label htmlFor="new-name">Name</label>
              <input id="new-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Wolf Vambie" />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="new-key">Variable name (can't be changed later)</label>
              <input
                id="new-key"
                value={effectiveKey}
                onChange={(e) => {
                  setKeyTouched(true);
                  setKey(e.target.value);
                }}
                placeholder="e.g. wolf_vambie"
              />
            </div>
          </div>
          {effectiveKey && <p className="status-line">Referenced as &lt;{effectiveKey}&gt;</p>}
          {error && <p className="status-line" style={{ color: "#d94c4c" }}>{error}</p>}
          <div className="row inline">
            <button className="btn-primary" style={{ width: "auto" }} disabled={!name.trim() || !effectiveKey} onClick={create}>
              Add as draft
            </button>
            <button className="btn-secondary" style={{ width: "auto" }} onClick={() => setAdding(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      <table className="admin-table">
        <thead>
          <tr>
            <th>Art</th>
            <th>Character</th>
            <th>Variable</th>
            <th>Appears</th>
            <th>Status</th>
            <th>Chapters</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {characters.map((c) => (
            <tr key={c.id}>
              <td>
                {c.referenceImage ? (
                  <img src={`/${c.referenceImage}`} alt="" style={{ width: 56, height: 56, objectFit: "cover", borderRadius: 10, display: "block" }} />
                ) : (
                  <span className="status-line">No art</span>
                )}
              </td>
              <td>
                <strong>{c.name}</strong>
                {c.group && <div className="status-line">{c.group}</div>}
              </td>
              <td>
                <code>&lt;{c.key}&gt;</code>
              </td>
              <td>{castingModes[c.castingMode]?.label ?? c.castingMode}</td>
              <td>
                <span className={STATUS_PILL[c.status]}>{c.status}</span>
              </td>
              <td>{c.chaptersUsing}</td>
              <td>
                <Link className="btn-small btn-secondary" style={{ textDecoration: "none" }} to={`/admin/characters/${c.id}`}>
                  Edit
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="status-line">
        Only active characters appear in stories. Drafts are safe to edit; each chapter keeps the version of a character it was made with.
      </p>
    </div>
  );
}
