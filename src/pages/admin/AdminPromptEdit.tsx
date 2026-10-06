import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { flushSync } from "react-dom";
import { apiGet, apiSend, ApiError } from "../../lib/api";
import { IconImage, IconInfo, IconMenu, IconMic, IconSparkle, IconTrash, IconUpload } from "../../components/icons";
import { Chev, Field, Select } from "../../components/ui";
import { CARD_ART, PromptArt, PromptText } from "./AdminPromptLibrary";
import { PROMPT_VARIABLES, unknownPromptVariables } from "../../lib/promptVariables";
import PromptArtworkDialog, { type ArtworkTab } from "./PromptArtworkDialog";
import type { Prompt } from "../../types";

const COLORS = [
  { value: "purple", hex: "#7b24fd", label: "Purple" },
  { value: "gold", hex: "#f6c519", label: "Gold" },
  { value: "pink", hex: "#ff5ccf", label: "Pink" },
  { value: "green", hex: "#8cfa2c", label: "Green" },
];
const AUDIENCES = [
  { value: "Everyone", label: "All contributors" },
  { value: "Parents", label: "Parents" },
  { value: "Grandparents", label: "Grandparents" },
];
const STAGES = ["All stages", "Expecting", "Newborn", "Toddler"];
const NEW_CATEGORY = "__new__";

export default function AdminPromptEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<Prompt | null>(null);
  const [saved, setSaved] = useState<Prompt | null>(null);
  const [all, setAll] = useState<Prompt[]>([]);
  const [newCategory, setNewCategory] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [artDialog, setArtDialog] = useState<ArtworkTab | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const questionRef = useRef<HTMLInputElement | null>(null);
  const supportingRef = useRef<HTMLInputElement | null>(null);
  const [lastField, setLastField] = useState<"question" | "supportingText">("question");

  useEffect(() => {
    apiGet(`/api/prompts/${id}`).then((p: Prompt) => {
      setForm(p);
      setSaved(p);
    });
    apiGet("/api/prompts").then(setAll);
  }, [id]);

  const categories = useMemo(() => [...new Set(all.map((p) => p.category))], [all]);
  const dirty =
    !!form && !!saved && (["question", "supportingText", "category", "audience", "childStage", "cardColor", "artworkPath"] as const).some((k) => (form[k] ?? "") !== (saved[k] ?? ""));
  const index = Math.max(0, all.filter((p) => p.status === "published").findIndex((p) => p.id === id));

  const set = <K extends keyof Prompt>(key: K, value: Prompt[K]) => setForm((f) => (f ? { ...f, [key]: value } : f));

  const unknown = form ? [...new Set([...unknownPromptVariables(form.question), ...unknownPromptVariables(form.supportingText)])] : [];

  // Inserts a variable at the cursor in the field last edited, then puts the
  // cursor after it (committed first, so typing straight away lands there).
  const insertVariable = (name: string) => {
    const input = lastField === "question" ? questionRef.current : supportingRef.current;
    if (!input) return;
    const value = input.value;
    const start = input.selectionStart ?? value.length;
    const end = input.selectionEnd ?? value.length;
    const token = `<${name}>`;
    flushSync(() => set(lastField, value.slice(0, start) + token + value.slice(end)));
    input.focus();
    input.setSelectionRange(start + token.length, start + token.length);
  };

  const save = async (status: Prompt["status"]) => {
    if (!form) return;
    if (!form.question.trim()) {
      setError("The question can't be empty.");
      return;
    }
    if (unknown.length) {
      setError("Fix the unknown variables first.");
      return;
    }
    setBusy(status);
    setError(null);
    try {
      const updated: Prompt = await apiSend(`/api/prompts/${id}`, "PUT", {
        question: form.question.trim(),
        supportingText: form.supportingText,
        category: form.category.trim() || "General",
        audience: form.audience,
        childStage: form.childStage,
        cardColor: form.cardColor,
        artworkPath: form.artworkPath,
        status,
      });
      setForm(updated);
      setSaved(updated);
      setNewCategory(false);
      if (status === "published") navigate("/admin/prompts");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
    } finally {
      setBusy(null);
    }
  };

  const uploadArt = async (file: File) => {
    setBusy("art");
    setError(null);
    try {
      const body = new FormData();
      body.append("image", file);
      body.append("question", form?.question ?? "");
      const res = await fetch(`/api/prompts/${id}/artwork`, { method: "POST", body });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");
      set("artworkPath", data.imagePath);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setBusy(null);
    }
  };

  const archive = async () => {
    if (!window.confirm("Archive this prompt? Families stop seeing it; memories recorded with it keep the question.")) return;
    await apiSend(`/api/prompts/${id}`, "PUT", { status: "archived" });
    navigate("/admin/prompts");
  };

  if (!form) return <p>Loading…</p>;

  return (
    <div>
      <div className="adm-head">
        <div>
          <div className="adm-crumbs">
            <Link to="/admin/prompts">Prompt Library</Link> / Edit prompt
          </div>
          <h1 className="adm-title" style={{ fontSize: 48 }}>Edit prompt</h1>
        </div>
        <div className="hstack">
          {dirty && <span className="pill-status pill-status--held">Unpublished changes</span>}
          {form.status === "archived" && !dirty && <span className="pill-status pill-status--archived">Archived</span>}
          <button className="btn btn--soft btn--sm btn--auto" onClick={() => void save("draft")} disabled={busy !== null || unknown.length > 0}>
            {busy === "draft" ? "Saving…" : "Save draft"}
          </button>
          <button className="btn btn--lime btn--sm btn--auto" onClick={() => void save("published")} disabled={busy !== null || unknown.length > 0}>
            {busy === "published" ? "Publishing…" : "Publish changes"}
          </button>
        </div>
      </div>

      <div className="adm-grid" style={{ gridTemplateColumns: "minmax(0, 1fr) 320px" }}>
        <section>
          <Field label="Question" htmlFor="question">
            <input
              id="question"
              ref={questionRef}
              className="input"
              value={form.question}
              onChange={(e) => set("question", e.target.value)}
              onFocus={() => setLastField("question")}
              maxLength={90}
            />
          </Field>
          <Field label="Supporting text" htmlFor="supporting">
            <input
              id="supporting"
              ref={supportingRef}
              className="input"
              value={form.supportingText ?? ""}
              onChange={(e) => set("supportingText", e.target.value)}
              onFocus={() => setLastField("supportingText")}
              placeholder="Tell it in your own words."
              maxLength={120}
            />
          </Field>
          <div className="field">
            <span className="field__label">Variables</span>
            <div className="var-chips">
              {PROMPT_VARIABLES.map((v) => (
                <button
                  key={v.name}
                  type="button"
                  className="var-chip"
                  title={`${v.description}. Example: ${v.sample}`}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => insertVariable(v.name)}
                >
                  {v.label} <code>&lt;{v.name}&gt;</code>
                </button>
              ))}
            </div>
            <p className="field__hint">
              Click to add one to the {lastField === "question" ? "question" : "supporting text"} at the cursor. Each family sees their own: “What is something you'd like to tell Mia in the future?”
            </p>
            {unknown.length > 0 && (
              <p className="error-text" role="alert" style={{ marginTop: 6 }}>
                {unknown.map((n) => `<${n}>`).join(", ")} isn't a card variable. Use one from the list above.
              </p>
            )}
          </div>
          <div className="form-grid">
            <Field label="Category" htmlFor="category">
              {newCategory || !categories.includes(form.category) ? (
                <input id="category" className="input" value={form.category} onChange={(e) => set("category", e.target.value)} placeholder="New category" autoFocus={newCategory} />
              ) : (
                <Select
                  id="category"
                  value={form.category}
                  onChange={(v) => {
                    if (v === NEW_CATEGORY) {
                      setNewCategory(true);
                      set("category", "");
                    } else set("category", v);
                  }}
                  options={[...categories.map((c) => ({ value: c, label: c })), { value: NEW_CATEGORY, label: "New category…" }]}
                />
              )}
            </Field>
            <Field label="Audience" htmlFor="audience">
              <Select id="audience" value={form.audience} onChange={(v) => set("audience", v)} options={AUDIENCES} />
            </Field>
            <Field label="Child stage" htmlFor="stage">
              <Select id="stage" value={form.childStage} onChange={(v) => set("childStage", v)} options={STAGES} />
            </Field>
            <div className="field">
              <span className="field__label">Card color</span>
              <div className="swatches" role="radiogroup">
                {COLORS.map((c) => (
                  <button
                    key={c.value}
                    role="radio"
                    aria-checked={form.cardColor === c.value}
                    aria-label={c.label}
                    className={`swatch ${form.cardColor === c.value ? "swatch--on" : ""}`}
                    style={{ background: c.hex }}
                    onClick={() => set("cardColor", c.value)}
                  />
                ))}
              </div>
            </div>
          </div>

          <div className="field">
            <span className="field__label">Artwork</span>
            <div className="hstack" style={{ gap: 18, alignItems: "flex-start" }}>
              <PromptArt prompt={form} index={index} className="artwork-box" />
              <div>
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  hidden
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadArt(file);
                    e.target.value = "";
                  }}
                />
                <div className="art-actions">
                  <button className="btn btn--purple btn--sm btn--auto" onClick={() => setArtDialog("generate")} disabled={busy !== null}>
                    <IconSparkle size={18} /> Generate from the question
                  </button>
                  <button className="btn btn--soft btn--sm btn--auto" onClick={() => setArtDialog("poses")} disabled={busy !== null}>
                    <IconImage size={18} /> Choose from library
                  </button>
                  <button className="btn btn--soft btn--sm btn--auto" onClick={() => fileRef.current?.click()} disabled={busy !== null}>
                    <IconUpload size={18} /> {busy === "art" ? "Uploading…" : "Upload"}
                  </button>
                </div>
                <p className="field__hint">Uploads should be square, ideally 1024 × 1024. Families see new artwork once you publish the card.</p>
                {form.artworkPath ? (
                  <button className="tlink" style={{ fontSize: 14 }} onClick={() => set("artworkPath", null)}>
                    Use Baby Vambie art instead
                  </button>
                ) : (
                  <p className="field__hint">Without artwork, the card shows Baby Vambie.</p>
                )}
              </div>
            </div>
          </div>

          {error && <p className="error-text">{error}</p>}
          <div className="note note--info" style={{ marginTop: 22, fontSize: 15 }}>
            <span className="note__icon">
              <IconInfo size={14} />
            </span>
            <span className="note__body">Publishing updates future cards. Previous recordings keep the prompt version they used.</span>
          </div>
          {form.status !== "archived" && (
            <button className="tlink t-red" style={{ marginTop: 18, display: "inline-flex", gap: 6, alignItems: "center", color: "var(--red)" }} onClick={() => void archive()}>
              <IconTrash size={18} /> Archive prompt
            </button>
          )}
        </section>

        {artDialog && (
          <PromptArtworkDialog
            promptId={form.id}
            card={form}
            defaultPose={CARD_ART[index % CARD_ART.length]}
            initialTab={artDialog}
            onClose={() => setArtDialog(null)}
            onPick={(path) => {
              set("artworkPath", path);
              setArtDialog(null);
            }}
          />
        )}

        <aside>
          <h2 className="h-title" style={{ fontSize: 22, marginBottom: 12 }}>Mobile preview</h2>
          <div className="phone-preview">
            <div className="kv-row" style={{ marginBottom: 12 }}>
              <span className="wordmark" style={{ fontSize: 20 }}>Vambie</span>
              <IconMenu size={24} />
            </div>
            <div className={`prompt-card prompt-card--${form.cardColor}`}>
              <span className={`badge badge--caps badge--sm prompt-card__badge ${form.cardColor === "purple" ? "badge--pink" : "badge--purple"}`}>{form.category || "Category"}</span>
              <span className="prompt-card__q">{form.question ? <PromptText text={form.question} samples onCard /> : "Your question"}</span>
              <PromptArt prompt={form} index={index} className="prompt-card__art" style={{ background: "none", borderRadius: form.artworkPath ? 16 : 0, aspectRatio: "1" }} />
            </div>
            <div className="deck-dots" aria-hidden="true">
              {[0, 1, 2, 3, 4].map((i) => (
                <span key={i} className={i === 0 ? "on" : ""} />
              ))}
            </div>
            <span className="btn btn--lime btn--caps" style={{ marginTop: 14, fontSize: 18, minHeight: 50 }}>
              <IconMic size={20} filled /> Record this memory <Chev />
            </span>
          </div>
        </aside>
      </div>
    </div>
  );
}
