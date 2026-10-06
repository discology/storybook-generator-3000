import { Fragment, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiSend } from "../../lib/api";
import { IconArchive, IconEdit, IconGrip, IconPlus, IconRefresh, IconSearch, IconTrash } from "../../components/icons";
import { Mascot, Select, type MascotName } from "../../components/ui";
import { AdminDots } from "./AdminReviewQueue";
import type { Prompt } from "../../types";
import { PROMPT_VARIABLES, promptParts, samplePromptValues } from "../../lib/promptVariables";

type Tab = "published" | "draft" | "archived";
const TABS: { key: Tab; label: string }[] = [
  { key: "published", label: "Published" },
  { key: "draft", label: "Drafts" },
  { key: "archived", label: "Archived" },
];
// The Baby Vambie art a card shows when it has no artwork of its own (same as the recorder).
export const CARD_ART: MascotName[] = ["star", "book", "open-book", "hug-book", "envelope-happy", "closedbook"];
export const AUDIENCE_LABEL: Record<string, string> = { Everyone: "Everyone", Parents: "Parents", Grandparents: "Grandparents" };

const VARIABLE_LABEL: Record<string, string> = Object.fromEntries(PROMPT_VARIABLES.map((v) => [v.name, v.label]));

// A card's question with its variables highlighted: as labels ("Child's name"),
// or filled with sample values the way a family would see them.
export function PromptText({ text, samples = false, onCard = false }: { text: string; samples?: boolean; onCard?: boolean }) {
  return (
    <>
      {promptParts(text).map((part, i) =>
        part.variable ? (
          <span key={i} className={`pvar ${onCard ? "pvar--card" : ""} ${part.known ? "" : "pvar--bad"}`} title={part.known ? `<${part.variable}>` : `Unknown variable <${part.variable}>`}>
            {!part.known ? part.text : samples ? samplePromptValues[part.variable] : VARIABLE_LABEL[part.variable]}
          </span>
        ) : (
          <Fragment key={i}>{part.text}</Fragment>
        )
      )}
    </>
  );
}

export function PromptArt({ prompt, index, className, style }: { prompt: Pick<Prompt, "artworkPath">; index: number; className?: string; style?: React.CSSProperties }) {
  return prompt.artworkPath ? (
    <img src={`/${prompt.artworkPath}`} alt="" className={className} style={{ objectFit: "cover", ...style }} />
  ) : (
    <Mascot name={CARD_ART[index % CARD_ART.length]} className={className} style={{ objectFit: "contain", background: "#2a1b52", ...style }} />
  );
}

export default function AdminPromptLibrary() {
  const navigate = useNavigate();
  const [prompts, setPrompts] = useState<Prompt[] | null>(null);
  const [tab, setTab] = useState<Tab>("published");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [menu, setMenu] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const load = () => {
    apiGet("/api/prompts").then(setPrompts);
  };
  useEffect(load, []);

  const categories = useMemo(() => [...new Set((prompts ?? []).map((p) => p.category))], [prompts]);
  const published = useMemo(() => (prompts ?? []).filter((p) => p.status === "published"), [prompts]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (prompts ?? [])
      .filter((p) => p.status === tab)
      .filter((p) => !category || p.category === category)
      .filter((p) => !q || [p.question, p.supportingText, p.category].some((t) => t?.toLowerCase().includes(q)));
  }, [prompts, tab, category, query]);
  const canDrag = tab === "published" && !query && !category;

  const createPrompt = async () => {
    const created = await apiSend("/api/prompts", "POST", { question: "New question", status: "draft" });
    navigate(`/admin/prompts/${created.id}`);
  };

  const setStatus = async (id: string, status: Tab) => {
    await apiSend(`/api/prompts/${id}`, "PUT", { status });
    load();
  };

  const remove = async (p: Prompt) => {
    if (!window.confirm(`Delete "${p.question}"? Memories recorded with it keep the question.`)) return;
    await apiSend(`/api/prompts/${p.id}`, "DELETE");
    load();
  };

  const drop = async (targetId: string) => {
    if (!prompts || !dragging || dragging === targetId) return;
    const order = published.map((p) => p.id).filter((id) => id !== dragging);
    order.splice(order.indexOf(targetId), 0, dragging);
    const byId = new Map(prompts.map((p) => [p.id, p]));
    setPrompts([...order.map((id, i) => ({ ...byId.get(id)!, sortOrder: i })), ...prompts.filter((p) => p.status !== "published")]);
    setDragging(null);
    setOver(null);
    await apiSend("/api/prompts/order", "PUT", { ids: order });
  };

  if (!prompts) return <p>Loading…</p>;
  const count = (t: Tab) => prompts.filter((p) => p.status === t).length;

  return (
    <div>
      <div className="adm-head">
        <div>
          <h1 className="adm-title">Prompt Library</h1>
          <p className="adm-sub">Small questions. Meaningful memories.</p>
        </div>
        <button className="btn btn--lime btn--auto" onClick={() => void createPrompt()}>
          <IconPlus size={22} strokeWidth={3} /> New prompt
        </button>
      </div>

      <div className="adm-filters">
        <div className="search">
          <span className="search__icon">
            <IconSearch size={22} />
          </span>
          <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search prompts…" aria-label="Search prompts" />
        </div>
        <Select value={category} onChange={setCategory} ariaLabel="Category" options={[{ value: "", label: "All categories" }, ...categories.map((c) => ({ value: c, label: c }))]} />
      </div>

      <div className="adm-tabs" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} className={`adm-tab ${tab === t.key ? "adm-tab--on" : ""}`} onClick={() => setTab(t.key)}>
            {t.label} ({count(t.key)})
          </button>
        ))}
      </div>

      <table className="adm-table">
        <thead>
          <tr>
            <th style={{ width: 36 }} />
            <th>Prompt</th>
            <th>Category</th>
            <th>Audience</th>
            <th>Status</th>
            <th style={{ textAlign: "right" }}>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p) => {
            const index = published.indexOf(p);
            return (
              <tr
                key={p.id}
                className={`${canDrag ? "adm-row-drag" : ""} ${over === p.id && dragging !== p.id ? "is-over" : ""} ${dragging === p.id ? "is-dragging" : ""}`}
                draggable={canDrag}
                onDragStart={() => setDragging(p.id)}
                onDragEnd={() => {
                  setDragging(null);
                  setOver(null);
                }}
                onDragOver={(e) => {
                  if (!canDrag) return;
                  e.preventDefault();
                  setOver(p.id);
                }}
                onDrop={() => void drop(p.id)}
              >
                <td>{canDrag && <span className="adm-grip" title="Drag to reorder"><IconGrip size={20} /></span>}</td>
                <td>
                  <div className="hstack" style={{ gap: 14 }}>
                    <PromptArt prompt={p} index={Math.max(0, index)} className="adm-thumb" />
                    <span className="adm-cell-title" style={{ fontSize: 18 }}>
                      <PromptText text={p.question} />
                    </span>
                  </div>
                </td>
                <td>{p.category}</td>
                <td>{AUDIENCE_LABEL[p.audience] ?? p.audience}</td>
                <td>
                  <span className={`pill-status pill-status--${p.status}`}>{p.status === "draft" ? "Draft" : p.status === "archived" ? "Archived" : "Published"}</span>
                </td>
                <td>
                  <div className="adm-actions">
                    <button className="btn btn--outline btn--xs btn--auto" onClick={() => navigate(`/admin/prompts/${p.id}`)}>
                      <IconEdit size={16} /> Edit
                    </button>
                    <AdminDots open={menu === p.id} onToggle={() => setMenu((m) => (m === p.id ? null : p.id))} onClose={() => setMenu(null)}>
                      {p.status !== "published" && (
                        <button onClick={() => void setStatus(p.id, "published")}>
                          <IconRefresh size={18} /> Publish
                        </button>
                      )}
                      {p.status === "published" && (
                        <button onClick={() => void setStatus(p.id, "draft")}>
                          <IconEdit size={18} /> Move to drafts
                        </button>
                      )}
                      {p.status !== "archived" && (
                        <button onClick={() => void setStatus(p.id, "archived")}>
                          <IconArchive size={18} /> Archive
                        </button>
                      )}
                      <button className="danger" onClick={() => void remove(p)}>
                        <IconTrash size={18} /> Delete
                      </button>
                    </AdminDots>
                  </div>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} style={{ color: "var(--ink-3)", padding: "22px 16px" }}>
                {query || category ? "No prompts match." : "Nothing here yet."}
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="hstack" style={{ alignItems: "baseline", margin: "26px 0 10px" }}>
        <h2 className="h-title" style={{ fontSize: 24 }}>Deck preview</h2>
        <span className="t-small t-muted">These prompts appear in this order for your families.</span>
      </div>
      <div className="deck-preview">
        {published.map((p, i) => (
          <div key={p.id} className={`deck-preview__card prompt-card--${p.cardColor}`}>
            <span className={`badge badge--caps badge--sm ${p.cardColor === "purple" ? "badge--pink" : "badge--purple"}`}>{p.category}</span>
            <div className="deck-preview__q">
              <PromptText text={p.question} samples onCard />
            </div>
            <PromptArt prompt={p} index={i} className="deck-preview__art" style={{ background: "none", borderRadius: p.artworkPath ? 14 : 0 }} />
          </div>
        ))}
      </div>
      <p className="t-small t-muted hstack" style={{ marginTop: 10, gap: 6 }}>
        <IconGrip size={18} /> Drag prompts in the Published tab to change the order.
      </p>
    </div>
  );
}
