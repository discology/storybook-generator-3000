import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiGet, apiSend, ApiError } from "../../lib/api";
import type { CastingMode, CastingModes, LibraryCharacter } from "../../types";

type Form = Pick<
  LibraryCharacter,
  "name" | "group" | "storyRole" | "personality" | "appearance" | "neverRules" | "castingMode" | "castingNotes" | "status"
>;

const toForm = (c: LibraryCharacter): Form => ({
  name: c.name,
  group: c.group ?? "",
  storyRole: c.storyRole,
  personality: c.personality,
  appearance: c.appearance,
  neverRules: c.neverRules,
  castingMode: c.castingMode,
  castingNotes: c.castingNotes,
  status: c.status,
});

// Mirrors characterCard() in server/characters.ts: what <key> turns into.
const cardFor = (f: Form) => {
  const parts = [
    f.appearance && `look: ${f.appearance}`,
    f.neverRules && `never: ${f.neverRules}`,
    f.personality && `personality: ${f.personality}`,
    f.storyRole && `role: ${f.storyRole}`,
  ].filter(Boolean);
  return parts.length ? `${f.name} (${parts.join("; ")})` : f.name;
};

const EXPRESSIONS = ["happy", "sad", "excited", "angry", "surprised", "in_love", "amused"];
const VIEWS = ["front", "angle", "side"];
// Mirrors BOOK_EXPRESSIONS in server/characters.ts.
const BOOK_STYLE = "book style";
const BOOK_MOODS: [string, string][] = [
  ["happy", "happy"],
  ["sad", "sad"],
  ["scared", "scared"],
  ["excited", "excited"],
  ["angry", "angry"],
  ["surprised", "surprised"],
  ["in_love", "tender"],
  ["amused", "laughing"],
  ["sleepy", "sleepy"],
];

export default function AdminCharacterEdit() {
  const { id } = useParams();
  const [character, setCharacter] = useState<(LibraryCharacter & { castingModes?: CastingModes }) | null>(null);
  const [castingModes, setCastingModes] = useState<CastingModes | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState<"upload" | "generate" | "restyle" | "expressions" | null>(null);

  const apply = (c: LibraryCharacter & { castingModes?: CastingModes }) => {
    setCharacter(c);
    setForm(toForm(c));
    if (c.castingModes) setCastingModes(c.castingModes);
  };

  useEffect(() => {
    apiGet(`/api/admin/characters/${id}`).then(apply);
  }, [id]);

  if (!character || !form || !castingModes) return <p>Loading…</p>;

  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(character));
  // Labeled 3D renders show as a view × expression grid per look set (usual look first).
  const renderSets = [...new Set((character.art ?? []).filter((a) => a.view && a.expression && a.artSet !== BOOK_STYLE).map((a) => a.artSet))].sort();
  // Book-style expressions are drawn from book-style reference art (not a 3D render).
  const referenceArt = (character.art ?? []).find((a) => a.id === character.referenceArtId);
  const bookReference = Boolean(referenceArt && !referenceArt.view);
  const bookExpressions = (character.art ?? []).filter((a) => a.artSet === BOOK_STYLE && a.expression);
  const otherArt = (character.art ?? []).filter((a) => !a.view || !a.expression);
  const set = <K extends keyof Form>(key: K, value: Form[K]) => {
    setForm({ ...form, [key]: value });
    setSaved(false);
    setError(null);
  };
  const field = (key: "name" | "group" | "storyRole" | "personality" | "appearance" | "neverRules" | "castingNotes") => ({
    value: (form[key] as string) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => set(key, e.target.value),
  });

  const run = async (action: () => Promise<LibraryCharacter>, kind?: "upload" | "generate" | "restyle" | "expressions") => {
    setError(null);
    if (kind) setBusy(kind);
    try {
      const updated = await action();
      setCharacter({ ...updated, castingModes });
      return updated;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      return null;
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    const updated = await run(() => apiSend(`/api/admin/characters/${id}`, "PUT", form));
    if (updated) {
      setForm(toForm(updated));
      setSaved(true);
    }
  };

  const uploadArt = async (file: File) => {
    const body = new FormData();
    body.append("image", file);
    await run(async () => {
      const res = await fetch(`/api/admin/characters/${id}/art`, { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new ApiError(res.status, data.error || "Upload failed.");
      return data;
    }, "upload");
  };

  return (
    <div>
      <div style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
        <Link to="/admin/characters" style={{ color: "inherit" }}>
          Characters
        </Link>{" "}
        / {character.name}
      </div>
      <div className="row inline" style={{ justifyContent: "space-between", marginTop: 0 }}>
        <div>
          <h1 style={{ margin: 0, color: "var(--ink)" }}>{character.name}</h1>
          <p className="status-line" style={{ margin: "0.25rem 0 0" }}>
            <code>&lt;{character.key}&gt;</code> · version {character.version} · in {character.chaptersUsing}{" "}
            {character.chaptersUsing === 1 ? "chapter" : "chapters"}
            {character.importedFrom?.startsWith("voot:") && " · imported from the VOOT Character Bible"}
          </p>
        </div>
        <div className="row inline">
          {dirty && <span className="pill warn">Unsaved changes</span>}
          {saved && !dirty && <span className="pill good">Saved</span>}
          <button className="btn-primary" style={{ width: "auto" }} onClick={save} disabled={!dirty}>
            Save changes
          </button>
        </div>
      </div>
      {error && <p className="status-line" style={{ color: "#d94c4c" }}>{error}</p>}
      <p className="status-line">Changes apply to new chapters only. Chapters already made keep the version they used.</p>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 360px", gap: "1.5rem", alignItems: "start" }}>
        <div className="card">
          <div className="row">
            <div style={{ flex: 1 }}>
              <label htmlFor="name">Name</label>
              <input id="name" {...field("name")} />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="group">Group</label>
              <input id="group" {...field("group")} placeholder="e.g. The Vambies (Band)" />
            </div>
            <div style={{ flex: 1 }}>
              <label htmlFor="status">Status</label>
              <select id="status" value={form.status} onChange={(e) => set("status", e.target.value as Form["status"])}>
                <option value="draft">Draft: never in stories</option>
                <option value="active">Active: can appear in stories</option>
                <option value="retired">Retired: no new stories</option>
              </select>
            </div>
          </div>

          <label htmlFor="appearance">Look (locked: used in every picture)</label>
          <textarea id="appearance" rows={3} {...field("appearance")} placeholder="Colors, shape, features, and any clothing that is always part of them." />
          <label htmlFor="never">Never</label>
          <textarea id="never" rows={2} {...field("neverRules")} placeholder="e.g. No spikes, horns, wings or tail." />
          <label htmlFor="personality">Personality and voice</label>
          <textarea id="personality" rows={3} {...field("personality")} />
          <label htmlFor="role">Role in stories</label>
          <textarea id="role" rows={2} {...field("storyRole")} />

          <label>When they appear</label>
          {(Object.entries(castingModes) as [CastingMode, { label: string; description: string }][]).map(([mode, info]) => (
            <label key={mode} style={{ display: "flex", gap: "0.6rem", alignItems: "flex-start", fontWeight: "normal", margin: "0.3rem 0" }}>
              <input type="radio" name="castingMode" checked={form.castingMode === mode} onChange={() => set("castingMode", mode)} style={{ width: "auto", marginTop: "0.3rem" }} />
              <span>
                <strong>{info.label}</strong>
                <br />
                <span className="status-line">{info.description}</span>
              </span>
            </label>
          ))}
          {form.castingMode === "when_it_fits" && (
            <>
              <label htmlFor="casting">Casting notes: when should a story include them?</label>
              <textarea id="casting" rows={2} {...field("castingNotes")} placeholder="e.g. When someone needs courage, or a family member is being protective." />
            </>
          )}

          <label>What &lt;{character.key}&gt; becomes in AI instructions</label>
          <p className="status-line" style={{ background: "var(--paper, #f6f0e4)", padding: "0.75rem", borderRadius: 8, fontFamily: "ui-monospace, monospace", fontSize: "0.8rem" }}>
            {cardFor(form)}
          </p>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Reference art</h3>
          {character.referenceImage ? (
            <img src={`/${character.referenceImage}`} alt={`${character.name} reference`} style={{ width: "100%", borderRadius: 12, display: "block" }} />
          ) : (
            <p className="status-line">
              No reference art yet. Pictures will rely on the written look, which can drift from page to page. Upload official art or generate some.
            </p>
          )}
          <p className="status-line">
            Attached to every picture {character.name} appears in{bookExpressions.length ? ", unless one of the expressions below fits the page's mood" : ""}.
          </p>

          <div className="row inline" style={{ flexWrap: "wrap" }}>
            <label className="btn-small btn-secondary" style={{ cursor: busy ? "default" : "pointer", margin: 0 }}>
              {busy === "upload" ? "Uploading…" : "Upload artwork"}
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                style={{ display: "none" }}
                disabled={busy !== null}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) uploadArt(file);
                  e.target.value = "";
                }}
              />
            </label>
            <button
              className="btn-small btn-secondary"
              disabled={busy !== null || dirty || !character.appearance}
              onClick={() => run(() => apiSend(`/api/admin/characters/${id}/art/generate`, "POST"), "generate")}
            >
              {busy === "generate" ? "Drawing… (about 30s)" : "Generate artwork"}
            </button>
            <button
              className="btn-small btn-secondary"
              disabled={busy !== null || !character.referenceImage}
              title="Redraw the reference art in the book's current art style"
              onClick={() => run(() => apiSend(`/api/admin/characters/${id}/art/restyle`, "POST"), "restyle")}
            >
              {busy === "restyle" ? "Redrawing… (about 30s)" : "Redraw in the book's style"}
            </button>
          </div>
          {dirty && <p className="status-line">Save your changes before generating, so the art uses the new look.</p>}

          {bookReference && (
            <>
              <label>Expressions in the book's style</label>
              {bookExpressions.length > 0 ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: "0.35rem" }}>
                  {BOOK_MOODS.map(([mood, label]) => {
                    const a = bookExpressions.find((x) => x.expression === mood);
                    return (
                      <figure key={mood} style={{ margin: 0 }}>
                        {a ? (
                          <img src={`/${a.imagePath}`} alt={`${character.name} ${label}`} style={{ width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 6, display: "block", background: "#fff" }} />
                        ) : (
                          <div style={{ width: "100%", aspectRatio: "1", borderRadius: 6, background: "#ece4d3" }} />
                        )}
                        <figcaption className="status-line" style={{ fontSize: "0.65rem", textAlign: "center" }}>{label}</figcaption>
                      </figure>
                    );
                  })}
                </div>
              ) : (
                <p className="status-line">None yet. Each picture uses the one neutral reference art, so {character.name}'s face looks the same on every page.</p>
              )}
              <p className="status-line">Each picture attaches the expression matching the page's mood in place of the reference art.</p>
              <button
                className="btn-small btn-secondary"
                disabled={busy !== null}
                onClick={() => run(() => apiSend(`/api/admin/characters/${id}/art/expressions`, "POST"), "expressions")}
              >
                {busy === "expressions" ? "Drawing 9 expressions… (about 2 minutes)" : bookExpressions.length ? "Redraw the expressions" : "Draw expressions in the book's style"}
              </button>
            </>
          )}

          {renderSets.map((set) => (
            <div key={set || "main"}>
              <label>{set ? `3D renders ${set}` : "3D renders"}</label>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    <th />
                    {EXPRESSIONS.map((e) => (
                      <th key={e} className="status-line" style={{ fontSize: "0.6rem", fontWeight: 600, padding: "0 0 0.2rem" }}>
                        {e.replace("_", " ")}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {VIEWS.map((view) => (
                    <tr key={view}>
                      <td className="status-line" style={{ fontSize: "0.65rem", paddingRight: "0.25rem" }}>
                        {view}
                      </td>
                      {EXPRESSIONS.map((expression) => {
                        const a = character.art!.find((x) => x.artSet === set && x.view === view && x.expression === expression);
                        if (!a) return <td key={expression} />;
                        const isReference = a.id === character.referenceArtId;
                        return (
                          <td key={expression} style={{ padding: 1 }}>
                            <button
                              type="button"
                              title={isReference ? "Reference art" : `Use ${view} ${expression.replace("_", " ")} as the reference art`}
                              disabled={busy !== null || isReference}
                              onClick={() => run(() => apiSend(`/api/admin/characters/${id}/reference`, "PUT", { artId: a.id }))}
                              style={{ padding: 0, border: "none", background: "none", width: "100%", cursor: isReference ? "default" : "pointer" }}
                            >
                              <img
                                src={`/${a.imagePath}`}
                                alt={`${view} ${expression}`}
                                style={{
                                  width: "100%",
                                  aspectRatio: "1",
                                  objectFit: "cover",
                                  borderRadius: 6,
                                  display: "block",
                                  background: "#fff",
                                  outline: isReference ? "3px solid var(--green, #2f8f3f)" : "none",
                                }}
                              />
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {renderSets.length > 0 && (
            <p className="status-line">
              Each picture gets the reference art plus the render matching the page's mood and camera angle
              {renderSets.some(Boolean) ? ", and an alternate set when the scene calls for it (like a guitar)" : ""}. Click a render to make it the
              reference art.
            </p>
          )}

          {otherArt.length > 0 && (
            <>
              <label>{renderSets.length ? "Other artwork" : "All artwork"}</label>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.5rem" }}>
                {otherArt.map((a) => (
                  <div key={a.id}>
                    <img
                      src={`/${a.imagePath}`}
                      alt=""
                      style={{
                        width: "100%",
                        aspectRatio: "1",
                        objectFit: "cover",
                        borderRadius: 10,
                        display: "block",
                        outline: a.id === character.referenceArtId ? "3px solid var(--green, #2f8f3f)" : "none",
                      }}
                    />
                    <div className="status-line" style={{ fontSize: "0.75rem" }}>
                      {a.artSet === "book style" ? "In the book's style" : a.source === "upload" ? "Uploaded" : "Generated"}
                    </div>
                    {a.id === character.referenceArtId ? (
                      <span className="pill good">Reference</span>
                    ) : (
                      <button
                        className="btn-small btn-secondary"
                        disabled={busy !== null}
                        onClick={() => run(() => apiSend(`/api/admin/characters/${id}/reference`, "PUT", { artId: a.id }))}
                      >
                        Use as reference
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
