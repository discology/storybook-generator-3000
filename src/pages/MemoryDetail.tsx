import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import AudioPlayer from "../components/AudioPlayer";
import AccessDenied from "../components/AccessDenied";
import { memoryTitle } from "../components/MemoryListRow";
import { IconBook, IconBookmark, IconChevronRight, IconDots, IconDownload, IconEdit, IconLock, IconSpinner, IconTrash } from "../components/icons";
import { BottomSheet, Chev, Loading, MenuRow, Note, RadioRow, Sheet } from "../components/ui";
import { apiGet, apiSend, ApiError } from "../lib/api";
import { formatDate, possessive } from "../lib/format";
import type { MemoryDetail as Detail } from "../types";

const PROCESSING = ["recorded", "transcribing", "transcribed"];

export default function MemoryDetail() {
  const { id, memoryId } = useParams();
  const navigate = useNavigate();
  const [memory, setMemory] = useState<Detail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "denied" | "missing">("loading");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState(false);

  const load = useCallback(() => {
    apiGet(`/api/memories/${memoryId}`)
      .then((m: Detail) => {
        setMemory(m);
        setState("ready");
      })
      .catch((err: ApiError) => {
        if (err.status === 401) navigate(`/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
        else setState(err.status === 403 ? "denied" : "missing");
      });
  }, [memoryId, navigate]);
  useEffect(load, [load]);

  const busy = !!memory && (PROCESSING.includes(memory.status) || (memory.status === "transcribed" && !memory.interpretation));
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(load, 4000);
    return () => clearInterval(t);
  }, [busy, load]);

  const update = async (data: Partial<Pick<Detail, "visibility" | "storyUseConsent">>) => {
    if (!memory) return;
    setMemory({ ...memory, ...data });
    try {
      await apiSend(`/api/memories/${memory.id}`, "PUT", data);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save that change.");
      load();
    }
  };

  const toggleFavorite = async () => {
    if (!memory) return;
    const favorite = !memory.favorite;
    setMemory({ ...memory, favorite });
    await apiSend(`/api/memories/${memory.id}/favorite`, "PUT", { favorite }).catch(load);
  };

  const saveWords = async () => {
    if (!memory || !draft.trim()) return;
    setSaving(true);
    setError(null);
    try {
      await apiSend(`/api/memories/${memory.id}/transcript`, "PUT", { text: draft.trim() });
      setEditing(false);
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your words.");
    } finally {
      setSaving(false);
    }
  };

  const retry = async () => {
    if (!memory) return;
    await apiSend(`/api/memories/${memory.id}/process`, "POST");
    load();
  };

  if (state === "denied") return <AccessDenied />;
  if (state === "missing")
    return (
      <div className="page">
        <TopBar back={`/storybooks/${id}/memories?tab=memories`} title="Memories" />
        <p className="loading">This memory isn't here anymore.</p>
      </div>
    );
  if (!memory) return <Loading />;

  const base = `/storybooks/${memory.storybook.id}`;
  const recordedBy = memory.mine ? "you" : memory.contributor.name;
  const words = memory.transcript?.text;
  const nextDay = new Date(memory.nextChapterAt).toLocaleDateString("en-US", { weekday: "long" });

  return (
    <div className="page">
      <TopBar
        back={`${base}/memories?tab=memories`}
        title={`${possessive(memory.storybook.childName)} memories`}
        right={
          <button className="tbar__icon" onClick={() => void toggleFavorite()} aria-pressed={memory.favorite} aria-label={memory.favorite ? "Remove bookmark" : "Bookmark this memory"}>
            <IconBookmark size={26} filled={memory.favorite} />
          </button>
        }
      />
      <header className="masthead" style={{ paddingTop: 0, paddingBottom: 18 }}>
        <h1 className="h-display h-display--md masthead__title">{memoryTitle(memory)}.</h1>
        <p className="masthead__sub" style={{ fontSize: 18, marginTop: 8 }}>
          {memory.typed ? "Written" : "Recorded"} by {recordedBy} · {formatDate(memory.eventDate ?? memory.recordedAt)}
        </p>
      </header>
      {!memory.typed && (
        <div className="pad">
          {memory.audioSrc ? (
            <AudioPlayer src={memory.audioSrc} durationSec={memory.durationSec} variant="purple" />
          ) : (
            <Note kind="dark">
              {memory.recordingKept ? "The recording isn't available." : "Only the words were kept. The recording was deleted once it was transcribed."}
            </Note>
          )}
        </div>
      )}

      <Sheet grow style={{ marginTop: 16 }}>
        <div className="kv-row">
          <h2 className="h-title">{memory.mine ? "Your words" : `${memory.contributor.name}'s words`}</h2>
          {memory.mine && words && !editing && (
            <button
              className="tlink"
              onClick={() => {
                setDraft(words);
                setEditing(true);
              }}
            >
              <IconEdit size={18} /> {memory.typed ? "Edit your words" : "Edit transcript"}
            </button>
          )}
        </div>
        {editing ? (
          <div style={{ marginTop: 10 }}>
            <textarea className="textarea" value={draft} onChange={(e) => setDraft(e.target.value)} rows={7} maxLength={4000} aria-label={memory.typed ? "Your words" : "Transcript"} />
            <p className="field__hint">{memory.typed ? "Change anything you like. The story uses your latest words." : "Fix anything we heard wrong. The story uses your corrected words."}</p>
            <div className="hstack" style={{ marginTop: 12 }}>
              <button className="btn btn--purple btn--sm btn--auto" onClick={() => void saveWords()} disabled={saving || !draft.trim()}>
                {saving ? "Saving…" : "Save words"}
              </button>
              <button className="btn btn--outline btn--sm btn--auto" onClick={() => setEditing(false)}>
                Cancel
              </button>
            </div>
          </div>
        ) : words ? (
          <p className="t-body" style={{ marginTop: 10, whiteSpace: "pre-wrap" }}>
            {words}
          </p>
        ) : memory.status === "failed" ? (
          <Note kind="warn" style={{ marginTop: 10 }} title="We couldn't make out the words">
            {memory.processingError}{" "}
            <button className="tlink" onClick={() => void retry()}>
              Try again
            </button>
          </Note>
        ) : (
          <p className="t-body t-muted hstack" style={{ marginTop: 10 }}>
            <IconSpinner size={22} /> Preparing your words…
          </p>
        )}
        {error && <p className="error-text">{error}</p>}

        <div style={{ marginTop: 18 }}>
          <details className="disclosure">
            <summary>
              <IconLock size={22} />
              <span className="grow">
                <strong style={{ fontWeight: 600, fontSize: 18 }}>Original recording</strong>
                <span className="disclosure__value">{memory.visibility === "household" ? "Everyone in the family" : memory.mine ? "Only me" : `Only ${memory.contributor.name}`}</span>
              </span>
              <IconChevronRight size={20} className="menu__chev" />
            </summary>
            <div className="disclosure__body">
              {memory.mine ? (
                <div role="radiogroup">
                  <RadioRow on={memory.visibility !== "household"} onClick={() => void update({ visibility: "contributor_only" })}>
                    Only me
                  </RadioRow>
                  <RadioRow on={memory.visibility === "household"} onClick={() => void update({ visibility: "household" })}>
                    Everyone in the family
                  </RadioRow>
                </div>
              ) : null}
              <p className="field__hint">Who can listen to the recording and read its words. Stories made from it can still be shared.</p>
            </div>
          </details>
          <details className="disclosure">
            <summary>
              <IconBook size={22} />
              <span className="grow">
                <strong style={{ fontWeight: 600, fontSize: 18 }}>Story use</strong>
                <span className="disclosure__value">{memory.storyUseConsent ? "Allowed" : "Not used in stories"}</span>
              </span>
              <IconChevronRight size={20} className="menu__chev" />
            </summary>
            <div className="disclosure__body">
              {memory.mine ? (
                <div role="radiogroup">
                  <RadioRow on={memory.storyUseConsent} onClick={() => void update({ storyUseConsent: true })}>
                    Allowed
                  </RadioRow>
                  <RadioRow on={!memory.storyUseConsent} onClick={() => void update({ storyUseConsent: false })}>
                    Not used in stories
                  </RadioRow>
                </div>
              ) : null}
              <p className="field__hint">Whether this memory can inspire new chapters. Chapters already made from it stay as they are.</p>
            </div>
          </details>
        </div>

        <div style={{ marginTop: 16 }}>
          {memory.chapters.map((c) => (
            <Link key={c.id} to={c.status === "published" ? `${base}/read/${c.id}` : `${base}/chapters/${c.id}/pages`} className="inspired">
              {c.cover ? <img src={`/${c.cover}`} alt="" className="inspired__cover" /> : <span className="inspired__cover" />}
              <span className="grow">
                <span className="inspired__kicker">{c.status === "published" ? "Inspired a chapter" : "In a chapter being made"}</span>
                <span className="inspired__title" style={{ display: "block" }}>{c.title}</span>
              </span>
              <IconChevronRight size={22} />
            </Link>
          ))}
          {memory.chapters.length === 0 && memory.storyUseConsent && memory.status !== "failed" && (
            <Link to={`${base}/this-week`} className="inspired" style={{ borderColor: "var(--purple-line)" }}>
              <span className="inspired__cover" />
              <span className="grow">
                <span className="inspired__kicker">Joins this week's chapter</span>
                <span className="inspired__title" style={{ display: "block" }}>Made {nextDay} morning</span>
              </span>
              <IconChevronRight size={22} />
            </Link>
          )}
        </div>

        <button className="btn btn--dark" style={{ marginTop: 18, justifyContent: "space-between" }} onClick={() => setOptions(true)}>
          <span className="hstack">
            <IconDots size={24} /> Memory options
          </span>
          <Chev />
        </button>
      </Sheet>

      <BottomSheet open={options} onClose={() => setOptions(false)} label="Memory options">
        <h2 className="h-title" style={{ marginBottom: 6 }}>
          Memory options
        </h2>
        <div className="menu">
          <a className="menu__row" href={`/api/memories/${memory.id}/export`} download onClick={() => setOptions(false)}>
            <span className="menu__icon">
              <IconDownload size={24} />
            </span>
            <span className="menu__text">
              <span className="menu__title">Export this memory</span>
              <span className="menu__sub" style={{ display: "block" }}>The recording and its words, as a download.</span>
            </span>
          </a>
          {memory.canDelete && (
            <MenuRow icon={<IconTrash size={24} />} title="Delete memory" sub="Review what will be removed before confirming." to={`${base}/memories/${memory.id}/delete`} danger />
          )}
        </div>
      </BottomSheet>
    </div>
  );
}
