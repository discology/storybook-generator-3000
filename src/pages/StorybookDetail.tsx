import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import Vambie from "../components/Vambie";
import MemoryRow from "../components/MemoryRow";
import { apiGet, apiSend, ApiError } from "../lib/api";
import { useStorybookData } from "../hooks/useStorybookData";
import AccessDenied from "../components/AccessDenied";

export default function StorybookDetail() {
  const { id } = useParams();
  const { storybook, status, reload } = useStorybookData(id);
  const [selected, setSelected] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [characters, setCharacters] = useState<{ key: string; name: string; castingMode: string; referenceImage: string | null }[]>([]);
  const [picked, setPicked] = useState<string[]>([]);

  useEffect(() => {
    apiGet("/api/characters").then(setCharacters).catch(() => setCharacters([]));
  }, []);

  const toggleSelected = (memoryId: string, checked: boolean) => {
    setSelected((prev) => (checked ? [...prev, memoryId] : prev.filter((m) => m !== memoryId)));
  };

  const generateChapter = async () => {
    if (selected.length === 0) return;
    setGenerating(true);
    setError(null);
    try {
      await apiSend(`/api/storybooks/${id}/chapters`, "POST", { memoryIds: selected, castKeys: picked });
      setSelected([]);
      setPicked([]);
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't write the chapter. Try again.");
    } finally {
      setGenerating(false);
    }
  };

  const publish = async (chapterId: string) => {
    setError(null);
    try {
      await apiSend(`/api/chapters/${chapterId}/publish`, "PUT");
      reload();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't publish. Try again.");
    }
  };

  if (status === "denied") return <AccessDenied />;
  if (status === "loading" || !storybook) return <p className="status-line screen-pad">Loading…</p>;

  const hasPublished = storybook.chapters.some((c) => c.status === "published");

  return (
    <div>
      <TopBar wordmark menuTo={`/storybooks/${id}/settings`} />

      {storybook.memories.length === 0 ? (
        <div className="hero">
          <div className="hero-mascot-stage">
            <Vambie mood="celebrating" size={100} />
            <h1 className="display" style={{ fontSize: "1.9rem" }}>
              Every story
              <br />
              starts somewhere.
            </h1>
            <p className="subtitle" style={{ marginBottom: 0 }}>
              {storybook.title}. Your first memory can be a tiny one.
            </p>
          </div>
          <Link className="btn-primary chevron" style={{ textDecoration: "none" }} to={`/storybooks/${id}/record`}>
            Record your first memory
          </Link>
          <Link className="btn-outline" style={{ textDecoration: "none", marginTop: "0.6rem" }} to={`/storybooks/${id}/family`}>
            Invite family
          </Link>
        </div>
      ) : (
        <div className="screen-pad">
          <h1 className="display" style={{ fontSize: "1.8rem" }}>
            {storybook.title}
          </h1>
          <p className="subtitle">
            {storybook.child.displayName} · reading level {storybook.readerAgeBand}
          </p>

          <div className="row">
            <Link className="btn-primary chevron" style={{ textDecoration: "none" }} to={`/storybooks/${id}/record`}>
              Record a memory
            </Link>
            {hasPublished && (
              <Link className="btn-secondary" style={{ textDecoration: "none" }} to={`/storybooks/${id}/read`}>
                Read their story
              </Link>
            )}
          </div>

          <div className="card" style={{ marginTop: "1.5rem" }}>
            <h2 style={{ marginTop: 0 }}>Memories ({storybook.memories.length})</h2>
            {storybook.memories.map((m) => (
              <MemoryRow
                key={m.id}
                memory={m}
                onChange={reload}
                selected={selected.includes(m.id)}
                onToggleSelected={(checked) => toggleSelected(m.id, checked)}
              />
            ))}

            {characters.length > 0 && (
              <>
                <label>Vambies in this chapter</label>
                <div className="row inline" style={{ flexWrap: "wrap", gap: "0.4rem", marginTop: 0 }}>
                  {characters.map((c) =>
                    c.castingMode === "always" ? (
                      <span key={c.key} className="pill good">
                        {c.name} · always
                      </span>
                    ) : (
                      <button
                        key={c.key}
                        type="button"
                        className={`btn-small ${picked.includes(c.key) ? "btn-primary" : "btn-secondary"}`}
                        onClick={() => setPicked((p) => (p.includes(c.key) ? p.filter((k) => k !== c.key) : [...p, c.key]))}
                      >
                        {picked.includes(c.key) ? "✓ " : "+ "}
                        {c.name}
                      </button>
                    )
                  )}
                </div>
                <p className="status-line">Pick any Vambies you want in this chapter. Others join only when the memory fits them.</p>
              </>
            )}

            <div className="row">
              <button className="btn-primary chevron" onClick={generateChapter} disabled={selected.length === 0 || generating}>
                {generating
                  ? "Planning and checking pages…"
                  : `Generate chapter from ${selected.length} memor${selected.length === 1 ? "y" : "ies"}`}
              </button>
            </div>
            {generating && <p className="status-line">This takes about a minute. Illustrations are drawn after that.</p>}
            {error && <p className="status-line" style={{ color: "#d94c4c" }}>{error}</p>}
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Chapters ({storybook.chapters.length})</h2>
            {storybook.chapters.length === 0 && <p className="status-line">No chapters yet.</p>}
            {storybook.chapters.map((c) => {
              const pages = c.pages ?? [];
              const approvedPages = pages.filter((p) => p.approvedAt).length;
              const pagesDone = pages.length === 0 || approvedPages === pages.length;
              const cover = pages[0]?.assets[0]?.imagePath;
              return (
              <div key={c.id} className="card dark">
                <div className="row inline" style={{ justifyContent: "space-between", marginTop: 0 }}>
                  <h3 style={{ margin: 0 }}>
                    Chapter {c.sequence}: {c.title}
                  </h3>
                  {c.status === "published" ? (
                    <span className="pill good">Published</span>
                  ) : c.pagesStatus === "illustrating" ? (
                    <span className="pill warn">Drawing pages</span>
                  ) : c.pagesStatus === "needs_attention" ? (
                    <span className="pill warn">Needs attention</span>
                  ) : !pagesDone ? (
                    <span className="pill warn">Review pages</span>
                  ) : c.guardianStatus === "approved" ? (
                    <span className="pill good">Ready to publish</span>
                  ) : (
                    <span className="pill warn">In review</span>
                  )}
                </div>
                {c.isMock && <p className="status-line">No AI provider configured — placeholder text.</p>}
                {pages.length > 0 ? (
                  <>
                    {cover && <img src={`/${cover}`} alt="" style={{ width: "100%", borderRadius: 12, marginTop: "0.75rem" }} />}
                    <p className="status-line">
                      {pages.length} pages · {approvedPages} approved
                    </p>
                    {c.status !== "published" && (
                      <Link className="btn-secondary" style={{ textDecoration: "none" }} to={`/storybooks/${id}/chapters/${c.id}/pages`}>
                        Review pages
                      </Link>
                    )}
                  </>
                ) : (
                  <p className="chapter-body">{c.content}</p>
                )}
                {c.status !== "published" && c.guardianStatus === "approved" && pagesDone && (
                  <button className="btn-primary chevron" onClick={() => publish(c.id)}>
                    Publish
                  </button>
                )}
                {c.status === "published" && (
                  <Link className="btn-secondary" style={{ textDecoration: "none" }} to={`/storybooks/${id}/chapters/${c.id}/share`}>
                    Share chapter
                  </Link>
                )}
              </div>
              );
            })}
          </div>
        </div>
      )}

      <BottomNav storybookId={id!} />
    </div>
  );
}
