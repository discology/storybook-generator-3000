import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import PagePicture from "../components/PagePicture";
import AccessDenied from "../components/AccessDenied";
import { IconBookmark as IconFlag, IconCheck, IconChevronDown, IconEdit, IconRefresh, IconSpinner, IconWand } from "../components/icons";
import { Chev, Loading, Note, RadioRow, Select } from "../components/ui";
import { PARENT_REASONS } from "../lib/flags";
import { apiGet, apiSend, ApiError } from "../lib/api";
import { chapterLabel } from "../lib/format";
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

const hasPicture = (page: StoryPage) => page.pictureSize !== "none";

// The parent looks through every page before the chapter joins the book:
// answer "who's who", fix words, redraw pictures, approve, then publish.
export default function ChapterPages() {
  const { id, chapterId } = useParams();
  const navigate = useNavigate();
  const [chapter, setChapter] = useState<ChapterWithPages | null>(null);
  const [denied, setDenied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    apiGet(`/api/chapters/${chapterId}/pages`)
      .then(setChapter)
      .catch((err: ApiError) => {
        if (err.status === 401) navigate(`/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
        else if (err.status === 403) setDenied(true);
        else setError(err.message);
      });
  }, [chapterId, navigate]);
  useEffect(load, [load]);

  // Poll while pictures are being drawn.
  const drawing = chapter?.pages.some((p) => p.assets[0]?.status === "generating") || chapter?.pagesStatus === "illustrating";
  useEffect(() => {
    if (!drawing) return;
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [drawing, load]);

  const act: Act = async (key, run) => {
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

  const publish = async () => {
    setBusy("publish");
    setError(null);
    try {
      await apiSend(`/api/chapters/${chapterId}/publish`, "PUT");
      navigate(`/storybooks/${id}/read/${chapterId}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't publish. Try again.");
    } finally {
      setBusy(null);
    }
  };

  if (denied) return <AccessDenied />;
  if (!chapter) return error ? <p className="loading">{error}</p> : <Loading />;

  const base = `/storybooks/${id}`;
  const approved = chapter.pages.filter((p) => p.approvedAt).length;
  const allApproved = approved === chapter.pages.length;
  const failed = chapter.pages.filter((p) => hasPicture(p) && (!p.assets[0] || p.assets[0].status === "failed")).length;
  const waitingOnPeople = (chapter.unresolved ?? []).length > 0;
  const openFindings = (chapter.findings ?? []).filter((f) => f.status === "needs_revision");
  const castNames = Object.fromEntries([
    ...(chapter.cast ?? []).map((c) => [c.key, c.name]),
    ...(chapter.unresolved ?? []).map((u) => [u.ref, `${u.mention} (who?)`]),
  ]);

  return (
    <div className="page">
      <TopBar back={base} title="Review pages" />
      <header className="masthead" style={{ paddingTop: 0, paddingBottom: 16 }}>
        <span className="chapter-tile__label masthead__title">{chapterLabel(chapter.sequence)}</span>
        <h1 className="h-display h-display--sm masthead__title" style={{ marginTop: 6, fontSize: 36 }}>
          {chapter.title}
        </h1>
        <p className="masthead__sub" style={{ fontSize: 17, marginTop: 8 }}>
          {chapter.pages.length} pages · {approved} approved
        </p>
      </header>

      <div className="pad stack">
        {drawing && (
          <Note kind="info" icon={<IconSpinner size={16} />} title="Drawing the pictures">
            Pages appear as they finish. This takes a few minutes; you can leave this page.
          </Note>
        )}
        {waitingOnPeople && <WhoIsWho chapter={chapter} storybookId={id!} busy={busy} act={act} />}
        {!drawing && !waitingOnPeople && failed > 0 && (
          <Note kind="warn" title={`${failed} ${failed === 1 ? "picture" : "pictures"} didn't finish`}>
            <button className="tlink" disabled={busy !== null} onClick={() => void act("retry", () => apiSend(`/api/chapters/${chapterId}/pages/retry-failed`, "POST"))}>
              {busy === "retry" ? "Trying again…" : "Try again"}
            </button>
          </Note>
        )}
        {openFindings.length > 0 && (
          <Note kind="warn" title="The Vambie team is taking a look">
            {openFindings.map((f) => (
              <span key={f.id} style={{ display: "block", marginTop: 4 }}>
                {f.note}
              </span>
            ))}
          </Note>
        )}
        {error && <p className="error-text">{error}</p>}
      </div>

      <div style={{ marginTop: 16 }}>
        {chapter.pages.map((page) => (
          <PageCard
            key={page.id}
            page={page}
            busy={busy}
            act={act}
            chapterDrawing={chapter.pagesStatus === "illustrating"}
            waitingOnPeople={waitingOnPeople}
            castNames={castNames}
          />
        ))}
      </div>

      <div className="pad" style={{ padding: "8px 20px calc(28px + var(--safe-bottom))" }}>
        {!allApproved ? (
          <>
            <button
              className="btn btn--lime btn--caps"
              disabled={busy !== null || drawing || waitingOnPeople || failed > 0}
              onClick={() => void act("approve-all", () => apiSend(`/api/chapters/${chapterId}/pages/approve`, "PUT"))}
            >
              {busy === "approve-all" ? "Approving…" : "Approve all pages"} <Chev />
            </button>
            <p className="t-center t-small t-muted-dark" style={{ marginTop: 10 }}>Approved pages join the family's book once you publish the chapter.</p>
          </>
        ) : chapter.status === "published" ? (
          <Link className="btn btn--lime btn--caps" to={`${base}/read/${chapterId}`}>
            Read the chapter <Chev />
          </Link>
        ) : chapter.guardianStatus === "approved" ? (
          <>
            <button className="btn btn--lime btn--caps" disabled={busy !== null} onClick={() => void publish()}>
              {busy === "publish" ? "Publishing…" : "Publish chapter"} <Chev />
            </button>
            <p className="t-center t-small t-muted-dark" style={{ marginTop: 10 }}>It joins the book for everyone it's shared with.</p>
          </>
        ) : (
          <Note kind="dark" title="Every page is approved">
            The Vambie team is giving the chapter a final read. You can publish it as soon as they're done.
          </Note>
        )}
      </div>
    </div>
  );
}

// "Who's who?": people the planner couldn't match to a saved family
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
    <div className="sheet" style={{ margin: 0 }}>
      <span className="attention__kicker">Who's who?</span>
      <h2 className="h-title" style={{ marginTop: 4 }}>Tell us who's in this memory</h2>
      <p className="t-small t-muted" style={{ marginTop: 6 }}>So they look the same as in every other chapter. Nothing is drawn until you answer.</p>
      {(chapter.unresolved ?? []).map((u) => {
        const candidates = [...family].sort((a, b) => Number(u.candidates.includes(b.id)) - Number(u.candidates.includes(a.id)));
        const missingFor = u.kind === "missing_variant" ? family.find((f) => f.id === u.candidates[0]) : undefined;
        return (
          <div key={u.ref} style={{ borderTop: "1px solid var(--line)", paddingTop: 14, marginTop: 14 }}>
            <p className="h-title h-title--sm" style={{ fontSize: 19 }}>
              “{u.mention}”{" "}
              <span className="t-small t-muted" style={{ fontFamily: "var(--font-body)", fontWeight: 400 }}>
                on page{u.appearances.length === 1 ? "" : "s"} {u.appearances.map((a) => a.pageNumber).join(", ")}
              </span>
            </p>
            <p className="t-small" style={{ margin: "4px 0 10px" }}>{u.question}</p>
            <Select
              value={answers[u.ref] ?? ""}
              onChange={(v) => setAnswers({ ...answers, [u.ref]: v })}
              ariaLabel={`Who is ${u.mention}?`}
              options={[
                { value: "", label: "Choose…" },
                ...candidates.flatMap((c) => c.approvedVariants.map((v) => ({ value: `char|${c.id}|${v}`, label: `${c.name} — ${describeVariant(v)}` }))),
                { value: "extra", label: "Someone else: draw them just for this chapter" },
              ]}
            />
            <p style={{ margin: "8px 0 0" }}>
              {missingFor ? (
                <Link className="tlink" to={`/storybooks/${storybookId}/characters/${missingFor.id}?variant=${encodeURIComponent(u.variant)}&back=${encodeURIComponent(here)}`}>
                  Design {missingFor.name} {u.variant === "today" ? "" : u.variant}
                </Link>
              ) : (
                <Link
                  className="tlink"
                  to={`/storybooks/${storybookId}/characters?new=1&name=${encodeURIComponent(u.suggestedName || u.mention)}&relationship=${encodeURIComponent(u.suggestedRelationship)}&alias=${encodeURIComponent(
                    u.mention
                  )}&back=${encodeURIComponent(here)}`}
                >
                  Add {u.suggestedName || u.mention} to the family's characters
                </Link>
              )}
            </p>
          </div>
        );
      })}
      <button className="btn btn--lime" style={{ marginTop: 16 }} disabled={busy !== null || !Object.values(answers).some(Boolean)} onClick={() => void submit()}>
        {busy === "people" ? "Saving…" : "Save answers"} <Chev />
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
  const [mode, setMode] = useState<"view" | "edit" | "revise" | "off">("view");
  const [text, setText] = useState(page.text);
  const [instructions, setInstructions] = useState("");
  // "Something's off" (VSB-107): a reason in the parent's words, for the Vambie team.
  const [offReason, setOffReason] = useState("");
  const [offNote, setOffNote] = useState("");
  const [offSent, setOffSent] = useState<{ picture: boolean } | null>(null);
  const [offBusy, setOffBusy] = useState(false);
  const [offError, setOffError] = useState<string | null>(null);
  const sendOff = async () => {
    setOffBusy(true);
    setOffError(null);
    try {
      const r = await apiSend(`/api/pages/${page.id}/feedback`, "POST", { reason: offReason, note: offNote });
      setOffSent({ picture: Boolean(r.picture) });
      setOffReason("");
      setOffNote("");
      setMode("view");
    } catch (e) {
      setOffError(e instanceof ApiError ? e.message : "Couldn't send it. Try again.");
    } finally {
      setOffBusy(false);
    }
  };

  useEffect(() => setText(page.text), [page.text]);

  const pictured = hasPicture(page);
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
  const disabled = busy !== null || asset?.status === "generating";
  const flagged = notes.length > 0 || ready?.checkStatus === "flagged";
  const shape = page.pictureSize === "vignette" || page.pictureSize === "framed" ? "1" : page.pictureSize ? "2 / 3" : "3 / 2";

  return (
    <section className="sheet" style={{ marginBottom: 14 }}>
      <div className="kv-row" style={{ marginBottom: 12 }}>
        <span className="eyebrow t-muted">
          Page {page.pageNumber}
          {page.pictureSize ? ` · ${page.pictureSize === "none" ? "words only" : page.pictureSize}` : ""}
        </span>
        {page.approvedAt ? (
          <span className="badge badge--green badge--sm">
            <IconCheck size={14} strokeWidth={3} /> Approved
          </span>
        ) : flagged ? (
          <span className="badge badge--amber badge--sm">Check this page</span>
        ) : null}
      </div>

      {pictured && (
        <div style={{ position: "relative", margin: page.pictureSize === "full" || page.pictureSize === "wordless" || !page.pictureSize ? "0 -20px" : 0 }}>
          {ready?.imagePath ? (
            <PagePicture src={`/${ready.imagePath}`} size={page.pictureSize} alt={page.visibleAction} dim={asset?.status === "generating"} />
          ) : (
            <div style={{ aspectRatio: shape, background: "#ece4d3", borderRadius: 14 }} />
          )}
          {(asset?.status === "generating" || (!asset && (chapterDrawing || waitingOnPeople))) && (
            <div className="center-col" style={{ position: "absolute", inset: 0, justifyContent: "center", color: "var(--purple)", padding: 16 }}>
              <IconSpinner size={34} />
              <p className="t-small" style={{ marginTop: 8, color: "var(--ink-2)" }}>
                {asset?.status === "generating" ? `Drawing page ${page.pageNumber}…` : waitingOnPeople ? "Waiting for your answers to “Who's who?”" : "Waiting to be drawn…"}
              </p>
            </div>
          )}
          {((!asset && !chapterDrawing && !waitingOnPeople) || asset?.status === "failed") && (
            <div className="center-col" style={{ position: "absolute", inset: 0, justifyContent: "center", padding: 16 }}>
              <p className="t-small t-muted">{asset?.error ? "This picture didn't finish." : "No picture yet."}</p>
              <button className="btn btn--outline btn--xs btn--auto" style={{ marginTop: 8 }} disabled={disabled} onClick={() => void act(`draw-${page.id}`, () => apiSend(`/api/pages/${page.id}/illustration`, "POST"))}>
                <IconRefresh size={16} /> Draw it again
              </button>
            </div>
          )}
        </div>
      )}

      {mode === "edit" ? (
        <div style={{ marginTop: 14 }}>
          <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} rows={4} aria-label={`Words on page ${page.pageNumber}`} />
          <p className="field__hint">{text.trim().split(/\s+/).filter(Boolean).length} words. {pictured ? "The picture stays the same." : ""}</p>
          <div className="hstack" style={{ marginTop: 10 }}>
            <button
              className="btn btn--purple btn--xs btn--auto"
              disabled={busy !== null || !text.trim()}
              onClick={() => void act(`text-${page.id}`, () => apiSend(`/api/pages/${page.id}/text`, "PUT", { text })).then(() => setMode("view"))}
            >
              {busy === `text-${page.id}` ? "Saving and checking…" : "Save words"}
            </button>
            <button
              className="btn btn--outline btn--xs btn--auto"
              onClick={() => {
                setText(page.text);
                setMode("view");
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : page.pictureSize === "wordless" ? (
        <p className="t-small t-muted" style={{ marginTop: 12 }}>No words on this page: the picture tells it.</p>
      ) : (
        <p style={{ fontFamily: "var(--font-book)", fontSize: 20, lineHeight: 1.5, margin: "14px 0 0", whiteSpace: "pre-wrap" }}>{page.text}</p>
      )}

      {notes.map((n, i) => (
        <Note key={i} kind="warn" style={{ marginTop: 10, fontSize: 15 }}>
          {n}
        </Note>
      ))}
      {ready?.checkStatus === "flagged" && ready.checkNote && (
        <Note kind="warn" style={{ marginTop: 10, fontSize: 15 }} title="About the picture">
          {ready.checkNote}
        </Note>
      )}

      {(page.appearances ?? []).length > 0 && (
        <div style={{ marginTop: 12 }}>
          {page.appearances!.map((a) => (
            <div key={a.id} className="hstack" style={{ gap: 10, margin: "8px 0", alignItems: "center" }}>
              {a.design.portraitPath && <img src={`/${a.design.portraitPath}`} alt="" style={{ width: 40, height: 40, borderRadius: 10, objectFit: "cover", flexShrink: 0 }} />}
              <span className="t-small grow">
                <strong>{a.familyCharacter.name}</strong>
                {a.design.variant !== "today" ? ` (${a.design.variant})` : ""}
                {a.outfit ? ` · wearing ${a.outfit}` : ""}
              </span>
              {ready && (
                <button
                  className="tlink"
                  style={{ fontSize: 14 }}
                  disabled={disabled}
                  onClick={() => void act(`fix-${page.id}`, () => apiSend(`/api/pages/${page.id}/illustration`, "POST", { fixCharacterIds: [a.familyCharacterId] }))}
                >
                  Doesn't look right
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <details className="disclosure" style={{ marginTop: 14 }}>
        <summary>
          <span className="grow t-small" style={{ fontWeight: 600 }}>Scene plan and sources</span>
          <IconChevronDown size={18} />
        </summary>
        <dl className="disclosure__body t-small" style={{ margin: 0 }}>
          <dt><strong>Story moment</strong></dt>
          <dd style={{ margin: "0 0 8px" }}>{page.storyMoment}</dd>
          <dt><strong>Characters</strong></dt>
          <dd style={{ margin: "0 0 8px" }}>{parseList(page.characters).map((c) => castNames[c] ?? c).join(", ")}</dd>
          <dt><strong>Setting</strong></dt>
          <dd style={{ margin: "0 0 8px" }}>{page.setting}</dd>
          <dt><strong>What the picture shows</strong></dt>
          <dd style={{ margin: "0 0 8px" }}>{page.visibleAction}</dd>
          <dt><strong>Mood</strong></dt>
          <dd style={{ margin: "0 0 8px" }}>{page.emotionalTone}</dd>
          {shot && (
            <>
              <dt><strong>Shot</strong></dt>
              <dd style={{ margin: "0 0 8px" }}>
                {shot.type}
                {shot.angle && `, ${shot.angle}`}
                {shot.focus && ` · focus: ${shot.focus}`}
              </dd>
            </>
          )}
          {page.continuity && (
            <>
              <dt><strong>Continuity</strong></dt>
              <dd style={{ margin: "0 0 8px" }}>{page.continuity}</dd>
            </>
          )}
          {page.sourceQuote && (
            <>
              <dt><strong>From the memory</strong></dt>
              <dd style={{ margin: "0 0 8px" }}>“{page.sourceQuote}”</dd>
            </>
          )}
          <dt><strong>Imagined or interpreted</strong></dt>
          <dd style={{ margin: 0 }}>{page.interpretationNote}</dd>
        </dl>
      </details>

      {mode === "revise" && (
        <div style={{ marginTop: 14 }}>
          <label className="field__label" htmlFor={`revise-${page.id}`}>
            What should change on this page?
          </label>
          <textarea
            id={`revise-${page.id}`}
            className="textarea"
            rows={2}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. Grandma should be the one who spots the sprout."
          />
          <p className="field__hint">Rewrites this page's moment and words, rechecks the pages beside it, then redraws the picture.</p>
          <div className="hstack" style={{ marginTop: 10 }}>
            <button
              className="btn btn--purple btn--xs btn--auto"
              disabled={busy !== null || !instructions.trim()}
              onClick={() =>
                void act(`revise-${page.id}`, () => apiSend(`/api/pages/${page.id}/revise`, "POST", { instructions })).then(() => {
                  setInstructions("");
                  setMode("view");
                })
              }
            >
              {busy === `revise-${page.id}` ? "Revising…" : "Revise page"}
            </button>
            <button className="btn btn--outline btn--xs btn--auto" onClick={() => setMode("view")}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {mode === "off" && (
        <div style={{ marginTop: 14 }}>
          <p className="field__label field__label--strong" style={{ margin: 0 }}>
            What's off on this page?
          </p>
          <div role="radiogroup" style={{ marginTop: 8 }}>
            {Object.entries(PARENT_REASONS)
              .filter(([, r]) => pictured || r.target === "words" || r.target === "both")
              .map(([key, r]) => (
                <RadioRow key={key} on={offReason === key} onClick={() => setOffReason(key)}>
                  {r.label}
                </RadioRow>
              ))}
          </div>
          <textarea className="textarea" rows={2} value={offNote} onChange={(e) => setOffNote(e.target.value)} maxLength={1000} placeholder="Anything else? (optional)" aria-label="Anything else" style={{ marginTop: 10 }} />
          <p className="field__hint">Goes to the Vambie team so the next pages come out better. It doesn't change this page.</p>
          {offError && <p className="error-text">{offError}</p>}
          <div className="hstack" style={{ marginTop: 10 }}>
            <button className="btn btn--purple btn--xs btn--auto" disabled={offBusy || !offReason} onClick={() => void sendOff()}>
              {offBusy ? "Sending…" : "Send to the Vambie team"}
            </button>
            <button className="btn btn--outline btn--xs btn--auto" onClick={() => setMode("view")}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {offSent && mode === "view" && (
        <Note kind="ok" style={{ marginTop: 14 }}>
          Thank you. The Vambie team will take a look.
          {offSent.picture && pictured && ready && (
            <>
              {" "}
              <button className="tlink" style={{ fontSize: 15 }} disabled={disabled} onClick={() => void act(`draw-${page.id}`, () => apiSend(`/api/pages/${page.id}/illustration`, "POST")).then(() => setOffSent(null))}>
                Redraw this picture now
              </button>
            </>
          )}
        </Note>
      )}

      {mode === "view" && (
        <div className="hstack" style={{ flexWrap: "wrap", gap: 8, marginTop: 14 }}>
          {!page.approvedAt && (
            <button
              className="btn btn--lime btn--xs btn--auto"
              disabled={disabled || (pictured && !ready)}
              onClick={() => void act(`approve-${page.id}`, () => apiSend(`/api/pages/${page.id}/approve`, "PUT"))}
            >
              <IconCheck size={16} strokeWidth={3} /> {busy === `approve-${page.id}` ? "Approving…" : "Approve page"}
            </button>
          )}
          <button className="btn btn--outline btn--xs btn--auto" disabled={disabled} onClick={() => setMode("edit")}>
            <IconEdit size={16} /> Edit words
          </button>
          {pictured && (
            <button className="btn btn--outline btn--xs btn--auto" disabled={disabled || !ready} onClick={() => void act(`draw-${page.id}`, () => apiSend(`/api/pages/${page.id}/illustration`, "POST"))}>
              <IconRefresh size={16} /> Redraw picture
            </button>
          )}
          <button className="btn btn--outline btn--xs btn--auto" disabled={disabled} onClick={() => setMode("revise")}>
            <IconWand size={16} /> Revise page
          </button>
          <button className="btn btn--outline btn--xs btn--auto" disabled={busy !== null} onClick={() => setMode("off")}>
            <IconFlag size={16} /> Something's off
          </button>
        </div>
      )}
    </section>
  );
}
