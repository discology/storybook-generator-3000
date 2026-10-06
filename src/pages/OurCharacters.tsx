import { useEffect, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import { apiGet, apiSend, ApiError } from "../lib/api";
import type { FamilyCharacterDetail, FamilyCharacterSummary } from "../types";

interface CharactersResponse {
  childName: string;
  fixedIdentity: string;
  characters: FamilyCharacterSummary[];
}

export default function OurCharacters() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [data, setData] = useState<CharactersResponse | null>(null);
  const [adding, setAdding] = useState(params.get("new") === "1");
  const [form, setForm] = useState({
    name: params.get("name") ?? "",
    relationship: params.get("relationship") ?? "",
    aliases: params.get("alias") ?? "",
    context: "",
    identity: "",
    usualClothing: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet(`/api/storybooks/${id}/characters`)
      .then(setData)
      .catch((err: ApiError) => {
        if (err.status === 401) navigate(`/sign-in?next=${encodeURIComponent(location.pathname + location.search)}`);
        else setError(err.message);
      });
  }, [id, navigate]);

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const created: FamilyCharacterDetail = await apiSend(`/api/storybooks/${id}/characters`, "POST", form);
      const back = params.get("back");
      navigate(`/storybooks/${id}/characters/${created.id}${back ? `?back=${encodeURIComponent(back)}` : ""}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add them. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!data) return <p className="status-line screen-pad">{error ?? "Loading…"}</p>;

  return (
    <div>
      <TopBar backTo={params.get("back") ?? `/storybooks/${id}`} backLabel="Back" />
      <div className="screen-pad">
        <h1 className="display" style={{ fontSize: "1.8rem" }}>
          Our Characters
        </h1>
        <p className="subtitle">
          The people in {data.childName}'s stories. Once you approve how someone looks, every new page draws them that way.
        </p>
        <p className="status-line">{data.childName} appears as Baby Vambie, so you don't need to add them.</p>

        {data.characters.map((c) => (
          <Link
            key={c.id}
            to={`/storybooks/${id}/characters/${c.id}`}
            className="card"
            style={{ display: "flex", gap: "1rem", alignItems: "center", textDecoration: "none", color: "var(--ink, #16151a)" }}
          >
            {c.portraitPath ? (
              <img src={`/${c.portraitPath}`} alt="" style={{ width: 72, height: 72, objectFit: "cover", borderRadius: 14, flexShrink: 0 }} />
            ) : (
              <div style={{ width: 72, height: 72, borderRadius: 14, background: "#ece4d3", flexShrink: 0, display: "grid", placeItems: "center" }} className="status-line">
                ?
              </div>
            )}
            <div>
              <strong>{c.name}</strong>
              {c.relationship && <div className="status-line">{c.relationship}</div>}
              {c.aliases.length > 0 && <div className="status-line">Also called {c.aliases.join(", ")}</div>}
              <div className="row inline" style={{ gap: "0.3rem", marginTop: "0.3rem", flexWrap: "wrap" }}>
                {c.variants.length ? (
                  c.variants.map((v) => (
                    <span key={v} className="pill good">
                      {v}
                    </span>
                  ))
                ) : (
                  <span className="pill warn">Look not approved yet</span>
                )}
                {c.hasDraft && c.variants.length > 0 && <span className="pill warn">Change in progress</span>}
              </div>
            </div>
          </Link>
        ))}

        {adding ? (
          <form className="card" onSubmit={create}>
            <h3 style={{ marginTop: 0 }}>Add someone</h3>
            <label htmlFor="name">Name</label>
            <input id="name" required {...field("name")} placeholder="e.g. Grandma Rose" />
            <label htmlFor="relationship">Relationship to {data.childName}</label>
            <input id="relationship" {...field("relationship")} placeholder="e.g. Grandmother (Mom's mother)" />
            <label htmlFor="aliases">Also called (comma-separated)</label>
            <input id="aliases" {...field("aliases")} placeholder="e.g. Grandma, Nana" />
            <label htmlFor="context">Anything that tells them apart</label>
            <input id="context" {...field("context")} placeholder="e.g. Lives on the farm; the other grandma is Grandma Lee" />
            <label htmlFor="identity">How they look (never changes)</label>
            <textarea
              id="identity"
              rows={3}
              {...field("identity")}
              placeholder="Face shape, skin tone, eyes, hair color and style, build, glasses or a signature accessory. Or upload a photo on the next screen."
            />
            <label htmlFor="clothing">What they usually wear (can change)</label>
            <input id="clothing" {...field("usualClothing")} placeholder="e.g. a green cardigan and comfortable trousers" />
            {error && <p className="status-line" style={{ color: "#d94c4c" }}>{error}</p>}
            <button className="btn-primary chevron" type="submit" disabled={saving}>
              {saving ? "Saving…" : "Next: design their look"}
            </button>
            <button type="button" className="btn-secondary" style={{ marginTop: "0.5rem" }} onClick={() => setAdding(false)}>
              Cancel
            </button>
          </form>
        ) : (
          <button className="btn-primary chevron" onClick={() => setAdding(true)}>
            Add someone
          </button>
        )}
      </div>
      <BottomNav storybookId={id!} />
    </div>
  );
}
