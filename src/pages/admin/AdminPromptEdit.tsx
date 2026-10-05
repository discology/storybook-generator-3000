import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiGet, apiSend } from "../../lib/api";
import Vambie from "../../components/Vambie";
import type { Prompt } from "../../types";

const COLORS = ["purple", "gold", "pink", "green"];
const COLOR_HEX: Record<string, string> = { purple: "#6b4fe8", gold: "#e0a622", pink: "#e6198b", green: "#2f8f3f" };

export default function AdminPromptEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState<Prompt | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    apiGet(`/api/prompts/${id}`).then(setForm);
  }, [id]);

  const field = (key: keyof Prompt) => ({
    value: (form?.[key] as string) ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setForm((f) => (f ? { ...f, [key]: e.target.value } : f));
      setDirty(true);
    },
  });

  const save = async (status?: Prompt["status"]) => {
    if (!form) return;
    const updated = await apiSend(`/api/prompts/${id}`, "PUT", { ...form, ...(status ? { status } : {}) });
    setForm(updated);
    setDirty(false);
    if (status === "published") navigate("/admin/prompts");
  };

  if (!form) return <p>Loading…</p>;

  return (
    <div>
      <div style={{ color: "var(--ink-soft)", fontSize: "0.85rem", marginBottom: "0.5rem" }}>
        <Link to="/admin/prompts" style={{ color: "inherit" }}>
          Prompt Library
        </Link>{" "}
        / Edit prompt
      </div>
      <div className="row inline" style={{ justifyContent: "space-between", marginTop: 0 }}>
        <h1 style={{ margin: 0, color: "var(--ink)" }}>Edit prompt</h1>
        <div className="row inline">
          {dirty && <span className="pill warn">Unpublished changes</span>}
          <button className="btn-secondary" style={{ width: "auto" }} onClick={() => save("draft")}>
            Save draft
          </button>
          <button className="btn-primary" style={{ width: "auto" }} onClick={() => save("published")}>
            Publish changes
          </button>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: "1.5rem", marginTop: "1rem" }}>
        <div className="card">
          <label>Question</label>
          <input {...field("question")} />
          <label>Supporting text</label>
          <input {...field("supportingText")} />
          <div className="row">
            <div style={{ flex: 1 }}>
              <label>Category</label>
              <input {...field("category")} />
            </div>
            <div style={{ flex: 1 }}>
              <label>Audience</label>
              <select {...field("audience")}>
                <option>Everyone</option>
                <option>Parents</option>
                <option>Grandparents</option>
              </select>
            </div>
          </div>
          <label>Child stage</label>
          <select {...field("childStage")}>
            <option>All stages</option>
            <option>Expecting</option>
            <option>Newborn</option>
            <option>Toddler</option>
          </select>
          <label>Card color</label>
          <div className="row inline">
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => {
                  setForm((f) => (f ? { ...f, cardColor: c } : f));
                  setDirty(true);
                }}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: "50%",
                  background: COLOR_HEX[c],
                  border: form.cardColor === c ? "3px solid var(--ink)" : "none",
                  padding: 0,
                }}
              />
            ))}
          </div>
        </div>

        <div>
          <h3 style={{ color: "var(--ink)" }}>Mobile preview</h3>
          <div style={{ background: "#0a0a0c", borderRadius: 16, padding: "1.5rem", color: "white" }}>
            <div
              style={{
                background: COLOR_HEX[form.cardColor] || "#6b4fe8",
                borderRadius: 14,
                padding: "1.25rem",
                textAlign: "center",
              }}
            >
              <span className="pill" style={{ background: "rgba(255,255,255,0.25)", color: "white", marginBottom: "0.5rem" }}>
                {form.category}
              </span>
              <h3 style={{ color: "white", fontSize: "1.3rem", margin: "0.5rem 0" }}>{form.question}</h3>
              <Vambie size={70} />
            </div>
            <button className="btn-primary chevron" style={{ marginTop: "1rem" }}>
              Record this memory
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
