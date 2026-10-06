import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import { apiGet, apiSend, ApiError } from "../lib/api";
import type { Chapter, StoryPage, UnresolvedPerson } from "../types";

interface FamilyOption {
  id: string;
  name: string;
  relationship: string;
  approvedVariants: string[];
}

type ChapterWithPages = Chapter & {
  pages: StoryPage[];
  cast?: { key: string; name: string }[];
  unresolved?: UnresolvedPerson[];
  familyCharacters?: FamilyOption[];
};
type Act = (key: string, run: () => Promise<ChapterWithPages>) => Promise<void>;

const parseList = (json: string | null): string[] => {
  try {
    return JSON.parse(json ?? "[]");
  } catch {
    return [];
  }
};

export default function ChapterPages() {
  const { id, chapterId } = useParams();
  const navigate = useNavigate();
  const [chapter, setChapter] = useState<ChapterWithPages | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    apiGet(`/api/chapters/${chapterId}/pages`)
      .then(setChapter)
      .catch((err: ApiError) => {
        if (err.status === 401) navigate(`/sign-in?next=${encodeURIComponent(location.pathname)}`);
        else setError(err.message);
      });
  }, [chapterId, navigate]);

  useEffect(load, [load]);

  // Poll while illustrations are being drawn.
  const drawing = chapter?.pages.some((p) => p.assets[0]?.status === "generating") || chapter?.pagesStatus === "illustrating";
  useEffect(() => {
    if (!drawing) return;
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [drawing, load]);

  // Runs an action that returns the updated chapter; `key` marks what's busy.
  const act = async (key: string, run: () => Promise<ChapterWithPages>) => {
    setBusy(key);
    setError(null);
    try {
      setChapter(await run());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  };

  if (!chapter) return <p className="status-line screen-pad">{error ?? "Loading…"}</p>;

  const approved = chapter.pages.filter((p) => p.approvedAt).length;
  const failed = chapter.pages.filter((p) => !p.assets[0] || p.assets[0].status === "failed").length;
  const waitingOnPeople = (chapter.unresolved ?? []).length > 0;
  const openFindings = (chapter.findings ?? []).filter((f) => f.status === "needs_revision");

  return (
    <div>
      <TopBar backTo={`/storybooks/${id}`} backLabel="Back" />
      <div className="screen-pad">
        <div className="status-line">CHAPTER {chapter.sequence}</div>
        <h1 className="display" style={{ fontSize: "1.7rem", marginTop: "0.25rem" }}>
          {chapter.title}
        </h1>
        <p className="status-line">
          {chapter.pages.length} pages · {approved} approved
          {chapter.ruleSetVersion ? ` · page rules v${chapter.ruleSetVersion}` : ""}
        </p>

        {drawing && <div className="banner info">Drawing illustrations… pages appear as they finish.</div>}
        {waitingOnPeople && <WhoIsWho chapter={chapter} storybookId={id!} busy={busy} act={act} />}
        {!drawing && !waitingOnPeople && failed > 0 && (
          <div className="banner info">
            {failed} {failed === 1 ? "illustration" : "illustrations"} didn't finish.{" "}
            <button
              className="btn-small btn-secondary"
              disabled={busy !== null}
              onClick={() => act("retry", () => apiSend(`/api/chapters/${chapterId}/pages/retry-failed`, "POST"))}
            >
              Retry
            </button>
          </div>
        )}
        {openFindings.length > 0 && (
          <div className="card dark">
            <strong>Story Guardian notes</strong>
            {openFindings.map((f) => (
              <p key={f.id} className="status-line">
                {f.category.replace("_", " ")}: {f.note}
              </p>
            ))}
          </div>
        )}
        {error && <p className="status-line" style={{ color: "#d94c4c" }}>{error}</p>}

        {chapter.pages.map((page) => (
          <PageCard
            key={page.id}
            page={page}
            busy={busy}
            act={act}
            chapterDrawing={chapter.pagesStatus === "illustrating"}
            waitingOnPeople={waitingOnPeople}
            castNames={Object.fromEntries([
              ...(chapter.cast ?? []).map((c) => [c.key, c.name]),
              ...(chapter.unresolved ?? []).map((u) => [u.ref, `${u.mention} (who?)`]),
            ])}
          />
        ))}

        <button
          className="btn-primary chevron"
          disabled={busy !== null || drawing || waitingOnPeople || failed > 0 || approved === chapter.pages.length}
          onClick={() => act("approve-all", () => apiSend(`/api/chapters/${chapterId}/pages/approve`, "PUT"))}
        >
          {approved === chapter.pages.length ? "All pages approved" : "Approve all pages"}
        </button>
        <p className="status-line">Approved pages appear in the family reader once the chapter is published.</p>
      </div>
    </div>
  );
}

// "Who is this?": people the planner couldn't match to a saved family
// character. Pictures wait until each is answered, instead of inventing a look.
function WhoIsWho({ chapter, storybookId, busy, act }: { chapter: ChapterWithPages; storybookId: string; busy: string | null; act: Act }) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const family = chapter.familyCharacters ?? [];
  const here = `/storybooks/${storybookId}/chapters/${chapter.id}/pages`;
  const describeVariant = (v: string) => (v === "today" ? "as they look today" : v);

  const submit = () => {
    const list = Object.entries(answers)
      .filter(([, value]) => value)
      .map(([ref, value]) => {
        if (value === "extra") return { ref, extra: {} };
        const [, characterId, variant] = value.split("|");
        return { ref, characterId, variant };
      });
    return act("people", () => apiSend(`/api/chapters/${chapter.id}/people`, "POST", { answers: list }));
  };

  return (
    <div className="card" style={{ borderColor: "var(--gold, #e0a622)" }}>
      <h3 style={{ marginTop: 0 }}>Who's who?</h3>
      <p className="status-line">
        Before drawing, tell us who these people are, so they look the same as in every other chapter. Nothing is drawn until you answer.
      </p>
      {(chapter.unresolved ?? []).map((u) => {
        const candidates = [...family].sort((a, b) => Number(u.candidates.includes(b.id)) - Number(u.candidates.includes(a.id)));
        const missingFor = u.kind === "missing_variant" ? family.find((f) => f.id === u.candidates[0]) : undefined;
        return (
          <div key={u.ref} style={{ borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: "0.75rem", marginTop: "0.75rem" }}>
            <strong>“{u.mention}”</strong>{" "}
            <span className="status-line">
              on page{u.appearances.length === 1 ? "" : "s"} {u.appearances.map((a) => a.pageNumber).join(", ")}
            </span>
            <p className="status-line" style={{ margin: "0.25rem 0" }}>
              {u.question}
            </p>
            <select value={answers[u.ref] ?? ""} onChange={(e) => setAnswers({ ...answers, [u.ref]: e.target.value })}>
              <option value="">Choose…</option>
              {candidates.flatMap((c) =>
                c.approvedVariants.map((v) => (
                  <option key={`${c.id}|${v}`} value={`char|${c.id}|${v}`}>
                    {c.name} — {describeVariant(v)}
                  </option>
                ))
              )}
              <option value="extra">Someone else: draw them just for this chapter</option>
            </select>
            <div className="row inline" style={{ flexWrap: "wrap", gap: "0.75rem", marginTop: "0.4rem" }}>
              {missingFor ? (
                <Link
                  className="btn-link"
                  to={`/storybooks/${storybookId}/characters/${missingFor.id}?variant=${encodeURIComponent(u.variant)}&back=${encodeURIComponent(here)}`}
                >
                  Design {missingFor.name} {u.variant === "today" ? "" : u.variant}
                </Link>
              ) : (
                <Link
                  className="btn-link"
                  to={`/storybooks/${storybookId}/characters?new=1&name=${encodeURIComponent(u.suggestedName || u.mention)}&relationship=${encodeURIComponent(
                    u.suggestedRelationship
                  )}&alias=${encodeURIComponent(u.mention)}&back=${encodeURIComponent(here)}`}
                >
                  Add {u.suggestedName || u.mention} to Our Characters
                </Link>
              )}
            </div>
          </div>
        );
      })}
      <button
        className="btn-primary chevron"
        style={{ marginTop: "1rem" }}
        disabled={busy !== null || !Object.values(answers).some(Boolean)}
        onClick={submit}
      >
        {busy === "people" ? "Saving…" : "Save answers"}
      </button>
    </div>
  );
}

function PageCard({
  page,
  busy,
  act,
  chapterDrawing,
  waitingOnPeople,
  castNames,
}: {
  page: StoryPage;
  busy: string | null;
  act: Act;
  chapterDrawing: boolean;
  waitingOnPeople: boolean;
  castNames: Record<string, string>; // character key or ref → name
}) {
  const [mode, setMode] = useState<"view" | "edit" | "revise">("view");
  const [text, setText] = useState(page.text);
  const [instructions, setInstructions] = useState("");

  useEffect(() => setText(page.text), [page.text]);

  const asset = page.assets[0];
  const ready = page.assets.find((a) => a.status === "ready");
  const shot = (() => {
    try {
      return page.shot ? (JSON.parse(page.shot) as { type: string; angle: string; focus: string }) : null;
    } catch {
      return null;
    }
  })();
  const notes = parseList(page.checkNotes);
  const isBusy = busy?.endsWith(page.id) ?? false;
  const disabled = busy !== null || asset?.status === "generating";

  return (
    <div className="card" style={{ padding: 0, overflow: "hidden" }}>
      <div
        style={{
          position: "relative",
          background: "#ece4d3",
          aspectRatio: page.pictureSize === "vignette" || page.pictureSize === "framed" ? "1" : page.pictureSize ? "2 / 3" : "3 / 2",
        }}
      >
        {ready?.imagePath && (
          <img
            src={`/${ready.imagePath}`}
            alt={page.visibleAction}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              display: "block",
              opacity: asset?.status === "generating" ? 0.4 : 1,
              ...(page.pictureSize === "vignette"
                ? { maskImage: "radial-gradient(ellipse 62% 62% at 50% 50%, #000 58%, transparent 76%)", WebkitMaskImage: "radial-gradient(ellipse 62% 62% at 50% 50%, #000 58%, transparent 76%)" }
                : {}),
            }}
          />
        )}
        {asset?.status === "generating" && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center" }} className="status-line">
            Drawing page {page.pageNumber}…
          </div>
        )}
        {!asset && (chapterDrawing || waitingOnPeople) && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: "1rem", textAlign: "center" }} className="status-line">
            {waitingOnPeople ? "Waiting for your answers to “Who's who?”" : "Waiting to be drawn…"}
          </div>
        )}
        {((!asset && !chapterDrawing && !waitingOnPeople) || asset?.status === "failed") && (
          <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: "1rem", textAlign: "center" }}>
            <div>
              <p className="status-line">{asset?.error ?? "No illustration yet."}</p>
              <button
                className="btn-small btn-secondary"
                disabled={disabled}
                onClick={() => act(`draw-${page.id}`, () => apiSend(`/api/pages/${page.id}/illustration`, "POST"))}
              >
                Retry illustration
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={{ padding: "1rem 1.1rem" }}>
        <div className="row inline" style={{ justifyContent: "space-between", marginTop: 0 }}>
          <span className="status-line">
            PAGE {page.pageNumber}
            {page.pictureSize ? ` · ${page.pictureSize}` : ""}
          </span>
          {page.approvedAt ? (
            <span className="pill good">Approved</span>
          ) : notes.length > 0 || ready?.checkStatus === "flagged" ? (
            <span className="pill warn">Check this page</span>
          ) : null}
        </div>

        {mode === "edit" ? (
          <>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} />
            <p className="status-line">{text.trim().split(/\s+/).filter(Boolean).length} words. The illustration stays the same.</p>
            <div className="row inline">
              <button
                className="btn-small btn-primary"
                disabled={busy !== null || !text.trim()}
                onClick={() =>
                  act(`text-${page.id}`, () => apiSend(`/api/pages/${page.id}/text`, "PUT", { text })).then(() => setMode("view"))
                }
              >
                {busy === `text-${page.id}` ? "Saving and checking…" : "Save text"}
              </button>
              <button className="btn-small btn-secondary" onClick={() => { setText(page.text); setMode("view"); }}>
                Cancel
              </button>
            </div>
          </>
        ) : page.pictureSize === "wordless" ? (
          <p className="status-line" style={{ margin: "0.5rem 0" }}>
            No words on this page: the picture tells it.
          </p>
        ) : (
          <p style={{ fontSize: "1.1rem", lineHeight: 1.6, margin: "0.5rem 0" }}>{page.text}</p>
        )}

        {notes.map((n, i) => (
          <p key={i} className="status-line" style={{ color: "#b4560f" }}>
            ⚠ {n}
          </p>
        ))}
        {ready?.checkStatus === "flagged" && ready.checkNote && (
          <p className="status-line" style={{ color: "#b4560f" }}>
            ⚠ Illustration: {ready.checkNote}
          </p>
        )}

        {(page.appearances ?? []).length > 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            {page.appearances!.map((a) => (
              <div key={a.id} style={{ margin: "0.5rem 0" }}>
                <div style={{ display: "flex", gap: "0.5rem", alignItems: "flex-start" }}>
                  {a.design.portraitPath && (
                    <img src={`/${a.design.portraitPath}`} alt="" style={{ width: 36, height: 36, borderRadius: 8, objectFit: "cover", flexShrink: 0 }} />
                  )}
                  <span className="status-line" style={{ margin: 0 }}>
                    <strong>{a.familyCharacter.name}</strong>
                    {a.design.variant !== "today" ? ` (${a.design.variant})` : ""} · look v{a.design.version}
                    {a.outfit ? ` · wearing ${a.outfit}` : ""}
                  </span>
                </div>
                {ready && (
                  <button
                    className="btn-small btn-secondary"
                    style={{ marginTop: "0.35rem" }}
                    disabled={disabled}
                    onClick={() => act(`fix-${page.id}`, () => apiSend(`/api/pages/${page.id}/illustration`, "POST", { fixCharacterIds: [a.familyCharacterId] }))}
                  >
                    {a.familyCharacter.name.split(" ")[0]} doesn't look right
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <details style={{ marginTop: "0.5rem" }}>
          <summary className="status-line" style={{ cursor: "pointer" }}>
            Scene plan and sources
          </summary>
          <dl className="status-line" style={{ margin: "0.5rem 0 0" }}>
            <dt><strong>Story moment</strong></dt>
            <dd>{page.storyMoment}</dd>
            <dt><strong>Characters</strong></dt>
            <dd>{parseList(page.characters).map((c) => castNames[c] ?? c).join(", ")}</dd>
            <dt><strong>Setting</strong></dt>
            <dd>{page.setting}</dd>
            <dt><strong>What the picture shows</strong></dt>
            <dd>{page.visibleAction}</dd>
            <dt><strong>Mood</strong></dt>
            <dd>{page.emotionalTone}</dd>
            {shot && (
              <>
                <dt><strong>Shot</strong></dt>
                <dd>
                  {shot.type}
                  {shot.angle && `, ${shot.angle}`}
                  {shot.focus && ` · focus: ${shot.focus}`}
                </dd>
              </>
            )}
            {page.continuity && (
              <>
                <dt><strong>Continuity</strong></dt>
                <dd>{page.continuity}</dd>
              </>
            )}
            {page.sourceQuote && (
              <>
                <dt><strong>From your memory</strong></dt>
                <dd>"{page.sourceQuote}"</dd>
              </>
            )}
            <dt><strong>Imagined or interpreted</strong></dt>
            <dd>{page.interpretationNote}</dd>
          </dl>
        </details>

        {mode === "revise" && (
          <>
            <label htmlFor={`revise-${page.id}`}>What should change on this page?</label>
            <textarea
              id={`revise-${page.id}`}
              rows={2}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Grandma should be the one who spots the sprout."
            />
            <p className="status-line">Rewrites this page's moment and text, rechecks the pages beside it, then redraws the picture.</p>
            <div className="row inline">
              <button
                className="btn-small btn-primary"
                disabled={busy !== null || !instructions.trim()}
                onClick={() =>
                  act(`revise-${page.id}`, () => apiSend(`/api/pages/${page.id}/revise`, "POST", { instructions })).then(() => {
                    setInstructions("");
                    setMode("view");
                  })
                }
              >
                {busy === `revise-${page.id}` ? "Revising…" : "Revise page"}
              </button>
              <button className="btn-small btn-secondary" onClick={() => setMode("view")}>
                Cancel
              </button>
            </div>
          </>
        )}

        {mode === "view" && (
          <div className="row inline" style={{ flexWrap: "wrap", gap: "0.4rem" }}>
            <button className="btn-small btn-secondary" disabled={disabled} onClick={() => setMode("edit")}>
              Edit text
            </button>
            <button
              className="btn-small btn-secondary"
              disabled={disabled || !ready}
              onClick={() => act(`draw-${page.id}`, () => apiSend(`/api/pages/${page.id}/illustration`, "POST"))}
            >
              Regenerate illustration
            </button>
            <button className="btn-small btn-secondary" disabled={disabled} onClick={() => setMode("revise")}>
              Revise this page
            </button>
            {!page.approvedAt && (
              <button
                className="btn-small btn-primary"
                disabled={disabled || !ready}
                onClick={() => act(`approve-${page.id}`, () => apiSend(`/api/pages/${page.id}/approve`, "PUT"))}
              >
                {isBusy ? "…" : "Approve page"}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
