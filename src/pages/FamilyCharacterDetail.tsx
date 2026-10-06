import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import { apiGet, apiSend, ApiError } from "../lib/api";
import type { CharacterDesign, FamilyCharacterDetail as Detail } from "../types";

type Act = (key: string, run: () => Promise<Detail>) => Promise<Detail | null>;

const formatDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString() : "");
const variantLabel = (variant: string) => (variant === "today" ? "Today" : variant[0].toUpperCase() + variant.slice(1));

export default function FamilyCharacterDetail() {
  const { id, characterId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [character, setCharacter] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [details, setDetails] = useState({ name: "", relationship: "", aliases: "", context: "" });
  const [newVariant, setNewVariant] = useState(params.get("variant") && params.get("variant") !== "today" ? params.get("variant")! : "");

  const load = useCallback(() => {
    apiGet(`/api/family-characters/${characterId}`)
      .then(setCharacter)
      .catch((err: ApiError) => {
        if (err.status === 401) navigate(`/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`);
        else setError(err.message);
      });
  }, [characterId, navigate]);
  useEffect(load, [load]);

  // Reference sheets are drawn in the background after approval.
  const preparing = character?.designs.some((d) => d.sheetStatus === "generating");
  useEffect(() => {
    if (!preparing) return;
    const timer = setInterval(load, 5000);
    return () => clearInterval(timer);
  }, [preparing, load]);

  const act: Act = async (key, run) => {
    setBusy(key);
    setError(null);
    try {
      const updated = await run();
      setCharacter(updated);
      return updated;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      return null;
    } finally {
      setBusy(null);
    }
  };

  if (!character) return <p className="status-line screen-pad">{error ?? "Loading…"}</p>;

  const variants = [...new Set(character.designs.map((d) => d.variant))].sort((a, b) => (a === "today" ? -1 : b === "today" ? 1 : a.localeCompare(b)));
  const back = params.get("back");

  return (
    <div>
      <TopBar backTo={`/storybooks/${id}/characters${back ? `?back=${encodeURIComponent(back)}` : ""}`} backLabel="Our Characters" />
      <div className="screen-pad">
        {back && (
          <div className="banner info">
            When {character.name}'s look is approved,{" "}
            <Link to={back} style={{ color: "inherit" }}>
              go back to your chapter
            </Link>{" "}
            to continue.
          </div>
        )}

        {editing ? (
          <div className="card">
            <label htmlFor="name">Name</label>
            <input id="name" value={details.name} onChange={(e) => setDetails({ ...details, name: e.target.value })} />
            <label htmlFor="relationship">Relationship</label>
            <input id="relationship" value={details.relationship} onChange={(e) => setDetails({ ...details, relationship: e.target.value })} />
            <label htmlFor="aliases">Also called (comma-separated)</label>
            <input id="aliases" value={details.aliases} onChange={(e) => setDetails({ ...details, aliases: e.target.value })} />
            <label htmlFor="context">Anything that tells them apart</label>
            <input id="context" value={details.context} onChange={(e) => setDetails({ ...details, context: e.target.value })} />
            <div className="row inline">
              <button
                className="btn-small btn-primary"
                disabled={busy !== null}
                onClick={() => act("details", () => apiSend(`/api/family-characters/${characterId}`, "PUT", details)).then((ok) => ok && setEditing(false))}
              >
                Save
              </button>
              <button className="btn-small btn-secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="display" style={{ fontSize: "1.8rem", marginBottom: "0.25rem" }}>
              {character.name}
            </h1>
            <p className="subtitle" style={{ marginTop: 0 }}>
              {[character.relationship, character.aliases.length ? `also called ${character.aliases.join(", ")}` : ""].filter(Boolean).join(" · ")}
            </p>
            {character.context && <p className="status-line">{character.context}</p>}
            <button
              className="btn-link"
              onClick={() => {
                setDetails({ name: character.name, relationship: character.relationship, aliases: character.aliases.join(", "), context: character.context });
                setEditing(true);
              }}
            >
              Edit details
            </button>
          </>
        )}
        {error && <p className="status-line" style={{ color: "#d94c4c" }}>{error}</p>}

        {variants.map((variant) => {
          const designs = character.designs.filter((d) => d.variant === variant);
          const approved = designs.find((d) => character.approvedDesignIds.includes(d.id));
          const draft = designs.find((d) => d.status === "draft");
          const history = designs.filter((d) => d.status === "superseded");
          return (
            <section key={variant} style={{ marginTop: "1.5rem" }}>
              <h2 style={{ marginBottom: "0.5rem" }}>{variantLabel(variant)}</h2>
              {approved && (
                <ApprovedDesign
                  design={approved}
                  name={character.name}
                  busy={busy}
                  act={act}
                  canChange={!draft}
                  onChange={() => act(`change-${variant}`, () => apiSend(`/api/family-characters/${characterId}/designs`, "POST", { variant }))}
                />
              )}
              {draft && <DraftEditor design={draft} name={character.name} previous={approved ?? null} busy={busy} act={act} fixedIdentity={character.fixedIdentity ?? ""} />}
              {history.length > 0 && (
                <details style={{ marginTop: "0.5rem" }}>
                  <summary className="status-line" style={{ cursor: "pointer" }}>
                    Earlier looks ({history.length})
                  </summary>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "0.5rem", marginTop: "0.5rem" }}>
                    {history.map((d) => (
                      <div key={d.id}>
                        {d.portraitPath && <img src={`/${d.portraitPath}`} alt="" style={{ width: "100%", borderRadius: 10, display: "block" }} />}
                        <div className="status-line" style={{ fontSize: "0.75rem" }}>
                          v{d.version} · {formatDate(d.approvedAt)} · on {d.pages} pages
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </section>
          );
        })}

        <div className="card" style={{ marginTop: "1.5rem" }}>
          <h3 style={{ marginTop: 0 }}>Add an age variant</h3>
          <p className="status-line">
            For memories from another time, like {character.name} as a child. They'll keep recognizable traits that connect them to today's look.
          </p>
          <div className="row inline">
            <input value={newVariant} onChange={(e) => setNewVariant(e.target.value)} placeholder="e.g. as a child" style={{ flex: 1 }} />
            <button
              className="btn-small btn-secondary"
              disabled={busy !== null || !newVariant.trim() || character.approvedDesignIds.length === 0}
              onClick={() =>
                act("variant", () => apiSend(`/api/family-characters/${characterId}/designs`, "POST", { variant: newVariant.trim() })).then(
                  (ok) => ok && setNewVariant("")
                )
              }
            >
              Add
            </button>
          </div>
          {character.approvedDesignIds.length === 0 && <p className="status-line">Approve today's look first.</p>}
        </div>

        <div className="card">
          <strong>Always the same</strong>
          <p className="status-line">{character.fixedIdentity}.</p>
          <strong>Can change from scene to scene</strong>
          <p className="status-line">{character.allowedVariations}. Outfits stay the same through one continuous scene.</p>
        </div>
      </div>
      <BottomNav storybookId={id!} />
    </div>
  );
}

function ApprovedDesign({
  design,
  name,
  busy,
  act,
  canChange,
  onChange,
}: {
  design: CharacterDesign;
  name: string;
  busy: string | null;
  act: Act;
  canChange: boolean;
  onChange: () => void;
}) {
  return (
    <div className="card">
      <div className="row inline" style={{ justifyContent: "space-between", marginTop: 0 }}>
        <span className="pill good">Approved · v{design.version}</span>
        <span className="status-line">
          {formatDate(design.approvedAt)} · on {design.pages} {design.pages === 1 ? "page" : "pages"}
        </span>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "0.75rem", marginTop: "0.75rem" }}>
        {design.portraitPath && <img src={`/${design.portraitPath}`} alt={`${name}'s approved look`} style={{ width: "100%", borderRadius: 12 }} />}
        {design.sheetPath ? (
          <img src={`/${design.sheetPath}`} alt={`${name} from the front, side and three-quarter views, with expressions`} style={{ width: "100%", borderRadius: 12 }} />
        ) : (
          <div className="status-line" style={{ display: "grid", placeItems: "center", background: "#ece4d3", borderRadius: 12, padding: "1rem", textAlign: "center" }}>
            {design.sheetStatus === "failed" ? (
              <div>
                The reference views didn't finish.
                <br />
                <button className="btn-small btn-secondary" disabled={busy !== null} onClick={() => act(`sheet-${design.id}`, () => apiSend(`/api/designs/${design.id}/sheet`, "POST"))}>
                  Try again
                </button>
              </div>
            ) : (
              "Preparing front, side and three-quarter views and expressions…"
            )}
          </div>
        )}
      </div>
      {design.identity && (
        <p className="status-line">
          <strong>Always:</strong> {design.identity}
        </p>
      )}
      {design.usualClothing && (
        <p className="status-line">
          <strong>Usually wears:</strong> {design.usualClothing}
        </p>
      )}
      {canChange && (
        <button className="btn-small btn-secondary" disabled={busy !== null} onClick={onChange}>
          Change {name}'s appearance
        </button>
      )}
    </div>
  );
}

function DraftEditor({
  design,
  name,
  previous,
  busy,
  act,
  fixedIdentity,
}: {
  design: CharacterDesign;
  name: string;
  previous: CharacterDesign | null;
  busy: string | null;
  act: Act;
  fixedIdentity: string;
}) {
  const [form, setForm] = useState({ identity: design.identity, usualClothing: design.usualClothing, changeNote: design.changeNote });
  const [scope, setScope] = useState<"new_chapters" | "include_drafts">("new_chapters");
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => setForm({ identity: design.identity, usualClothing: design.usualClothing, changeNote: design.changeNote }), [design.id, design.identity, design.usualClothing, design.changeNote]);

  const dirty = form.identity !== design.identity || form.usualClothing !== design.usualClothing || form.changeNote !== design.changeNote;
  const isChange = previous !== null && previous.variant === design.variant;
  const isVariant = previous === null && design.version === 1 && design.variant !== "today";
  const draftPages = previous ? previous.pages - previous.publishedPages : 0;
  const save = () => apiSend(`/api/designs/${design.id}`, "PUT", form);

  const uploadPhoto = async (file: File) => {
    const body = new FormData();
    body.append("photo", file);
    const updated = await act("photo", async () => {
      if (dirty) await save();
      const res = await fetch(`/api/designs/${design.id}/photo`, { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new ApiError(res.status, data.error || "Upload failed.");
      return data;
    });
    if (updated) setNotice("Photo saved privately. It's only used to design the look, never shown in the book.");
  };

  return (
    <div className="card" style={{ borderColor: "var(--gold, #e0a622)" }}>
      <div className="row inline" style={{ justifyContent: "space-between", marginTop: 0 }}>
        <span className="pill warn">{isChange ? `New look in progress · v${design.version}` : "Design in progress"}</span>
        <button className="btn-link" disabled={busy !== null} onClick={() => act(`discard-${design.id}`, () => apiSend(`/api/designs/${design.id}`, "DELETE"))}>
          Discard
        </button>
      </div>

      {isChange && (
        <>
          <label htmlFor={`change-${design.id}`}>What's changing?</label>
          <input
            id={`change-${design.id}`}
            value={form.changeNote}
            onChange={(e) => setForm({ ...form, changeNote: e.target.value })}
            placeholder="e.g. She cut her hair short and now wears red glasses"
          />
        </>
      )}
      {isVariant && <p className="status-line">Drawn from {name}'s approved look, {design.variant}, keeping the traits that make them recognizable.</p>}

      <label htmlFor={`identity-${design.id}`}>{isVariant ? `What ${name} looked like ${design.variant} (optional)` : "Always the same about them"}</label>
      <textarea
        id={`identity-${design.id}`}
        rows={3}
        value={form.identity}
        onChange={(e) => setForm({ ...form, identity: e.target.value })}
        placeholder={isVariant ? "e.g. long black braids, a gap-toothed smile. Leave blank to work from today's look." : undefined}
      />
      <p className="status-line">
        {isVariant
          ? "Face shape, skin tone, eyes and distinctive features carry over from today's look; hair, height, glasses and clothes follow the age."
          : `Include ${fixedIdentity}.`}
      </p>
      <label htmlFor={`clothing-${design.id}`}>What they usually wear (scenes can change it)</label>
      <input id={`clothing-${design.id}`} value={form.usualClothing} onChange={(e) => setForm({ ...form, usualClothing: e.target.value })} />

      <label>Reference photo (optional)</label>
      {design.hasPhoto ? (
        <div className="row inline">
          <img src={`/api/designs/${design.id}/photo`} alt="" style={{ width: 64, height: 64, objectFit: "cover", borderRadius: 10 }} />
          <span className="status-line">Saved privately: only used to design the look.</span>
          <button className="btn-small btn-secondary" disabled={busy !== null} onClick={() => act("photo-remove", () => apiSend(`/api/designs/${design.id}/photo`, "DELETE"))}>
            Remove
          </button>
        </div>
      ) : (
        <label className="btn-small btn-secondary" style={{ cursor: "pointer", display: "inline-block", width: "auto" }}>
          {busy === "photo" ? "Reading the photo…" : "Upload a photo"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            style={{ display: "none" }}
            disabled={busy !== null}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) uploadPhoto(file);
              e.target.value = "";
            }}
          />
        </label>
      )}
      {notice && <p className="status-line">{notice}</p>}

      <div className="row inline" style={{ marginTop: "0.75rem", flexWrap: "wrap" }}>
        {dirty && (
          <button className="btn-small btn-secondary" disabled={busy !== null} onClick={() => act(`save-${design.id}`, save)}>
            Save notes
          </button>
        )}
        <button
          className="btn-small btn-primary"
          disabled={busy !== null || (!form.identity.trim() && !design.hasPhoto && !isChange && !isVariant)}
          onClick={() =>
            act(`propose-${design.id}`, async () => {
              if (dirty) await save();
              return apiSend(`/api/designs/${design.id}/proposals`, "POST");
            })
          }
        >
          {busy === `propose-${design.id}` ? "Drawing… (about a minute)" : design.proposals.length ? "Draw another option" : "Draw a proposed look"}
        </button>
      </div>

      {design.proposals.length > 0 && (
        <>
          <label>Proposed looks</label>
          {isChange && (
            <div style={{ margin: "0.25rem 0 0.75rem" }}>
              <label style={{ display: "flex", gap: "0.5rem", fontWeight: "normal", margin: "0.25rem 0" }}>
                <input type="radio" checked={scope === "new_chapters"} onChange={() => setScope("new_chapters")} style={{ width: "auto" }} />
                Use the new look in new chapters only
              </label>
              <label style={{ display: "flex", gap: "0.5rem", fontWeight: "normal", margin: "0.25rem 0" }}>
                <input type="radio" checked={scope === "include_drafts"} onChange={() => setScope("include_drafts")} style={{ width: "auto" }} />
                Also redraw unpublished draft chapters{draftPages ? ` (${draftPages} ${draftPages === 1 ? "page" : "pages"})` : ""}
              </label>
              <p className="status-line">Published chapters always keep the look they were made with.</p>
            </div>
          )}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
            {design.proposals.map((p) => (
              <div key={p.id}>
                <img src={`/${p.imagePath}`} alt={`Proposed look for ${name}`} style={{ width: "100%", borderRadius: 12, display: "block" }} />
                <button
                  className="btn-small btn-primary"
                  style={{ marginTop: "0.4rem", width: "100%" }}
                  disabled={busy !== null}
                  onClick={() => act(`approve-${p.id}`, () => apiSend(`/api/designs/${design.id}/approve`, "POST", { proposalId: p.id, scope }))}
                >
                  This is {name}
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
