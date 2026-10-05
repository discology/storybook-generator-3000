import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet, apiSend } from "../../lib/api";
import type { Prompt } from "../../types";

export default function AdminPromptLibrary() {
  const [prompts, setPrompts] = useState<Prompt[] | null>(null);
  const [tab, setTab] = useState<"published" | "draft" | "archived">("published");

  const load = () => {
    apiGet("/api/prompts").then(setPrompts);
  };
  useEffect(load, []);

  const createPrompt = async () => {
    const created = await apiSend("/api/prompts", "POST", { question: "New question", status: "draft" });
    window.location.href = `/admin/prompts/${created.id}`;
  };

  const archive = async (id: string) => {
    await apiSend(`/api/prompts/${id}`, "PUT", { status: "archived" });
    load();
  };

  if (!prompts) return <p>Loading…</p>;
  const filtered = prompts.filter((p) => p.status === tab);

  return (
    <div>
      <div className="row inline" style={{ justifyContent: "space-between", marginTop: 0 }}>
        <div>
          <h1 className="display" style={{ color: "var(--ink)", fontSize: "2rem" }}>
            Prompt Library
          </h1>
          <p style={{ color: "var(--ink-soft)", marginTop: 0 }}>Small questions. Meaningful memories.</p>
        </div>
        <button className="btn-primary chevron" style={{ width: "auto" }} onClick={createPrompt}>
          New prompt
        </button>
      </div>

      <div className="row inline" style={{ marginBottom: "1rem" }}>
        {(["published", "draft", "archived"] as const).map((t) => (
          <button key={t} className={tab === t ? "btn-primary" : "btn-secondary"} style={{ width: "auto" }} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)} ({prompts.filter((p) => p.status === t).length})
          </button>
        ))}
      </div>

      <table className="admin-table">
        <thead>
          <tr>
            <th>Prompt</th>
            <th>Category</th>
            <th>Audience</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((p) => (
            <tr key={p.id}>
              <td>{p.question}</td>
              <td>{p.category}</td>
              <td>{p.audience}</td>
              <td>
                <span className={p.status === "published" ? "pill good" : "pill dark"}>{p.status}</span>
              </td>
              <td>
                <Link className="btn-small btn-secondary" style={{ textDecoration: "none", marginRight: "0.4rem" }} to={`/admin/prompts/${p.id}`}>
                  Edit
                </Link>
                {p.status !== "archived" && (
                  <button className="btn-small btn-secondary" onClick={() => archive(p.id)}>
                    Archive
                  </button>
                )}
              </td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={5} style={{ color: "var(--ink-soft)", padding: "1.5rem" }}>
                Nothing here yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
