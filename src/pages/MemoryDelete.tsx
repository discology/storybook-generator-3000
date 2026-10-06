import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import AccessDenied from "../components/AccessDenied";
import { memoryTitle } from "../components/MemoryListRow";
import { IconCheck, IconChevronRight, IconFileText, IconMic, IconPlay, IconSpinner, IconTrash } from "../components/icons";
import { Check, Chev, Loading, Masthead, Note, Sheet, StepRow } from "../components/ui";
import { apiGet, apiSend, ApiError } from "../lib/api";
import { formatDate } from "../lib/format";

interface Preview {
  memory: { id: string; title: string | null; recordedAt: string; hasAudio: boolean; hasTranscript: boolean; mine: boolean };
  connectedChapters: { id: string; title: string; sequence: number; status: string; cover: string | null }[];
}

type Step = "review" | "confirm" | "removing" | "removed";

// Deleting a memory: see what changes, confirm, then watch it go.
export default function MemoryDelete() {
  const { id, memoryId } = useParams();
  const navigate = useNavigate();
  const [preview, setPreview] = useState<Preview | null>(null);
  const [denied, setDenied] = useState(false);
  const [step, setStep] = useState<Step>("review");
  const [typed, setTyped] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet(`/api/memories/${memoryId}/deletion-preview`)
      .then(setPreview)
      .catch((err: ApiError) => (err.status === 403 ? setDenied(true) : setError(err.message)));
  }, [memoryId]);

  const remove = async () => {
    setStep("removing");
    setError(null);
    const started = Date.now();
    try {
      await apiSend(`/api/memories/${memoryId}`, "DELETE");
      // Keep the progress visible long enough to read.
      await new Promise((r) => setTimeout(r, Math.max(0, 1600 - (Date.now() - started))));
      setStep("removed");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete the memory. Try again.");
      setStep("confirm");
    }
  };

  if (denied) return <AccessDenied />;
  if (!preview) return error ? <p className="loading">{error}</p> : <Loading />;

  const base = `/storybooks/${id}`;
  const title = memoryTitle({ title: preview.memory.title, status: "ready" });
  const held = preview.connectedChapters;
  const backToMemories = `${base}/memories?tab=memories`;

  if (step === "removing" || step === "removed") {
    const done = step === "removed";
    return (
      <div className="page">
        <TopBar back={done ? backToMemories : undefined} title="Privacy & data" />
        <Masthead title={done ? <>Memory<br />removed.</> : <>Removing<br />your memory.</>} style={{ paddingTop: 0 }} />
        <Sheet grow>
          <div className="hstack" style={{ gap: 16, alignItems: "center" }}>
            <span className="step__icon step__icon--purple" style={{ width: 64, height: 64 }}>
              {done ? <IconCheck size={32} strokeWidth={3.2} /> : <IconSpinner size={36} />}
            </span>
            <div>
              <p className="h-title" style={{ fontSize: 26 }}>{title}</p>
              <p className="t-body t-muted" style={{ marginTop: 2 }}>
                {done ? "The original recording, transcript and interpretation have been removed." : "Deletion in progress."}
              </p>
            </div>
          </div>
          <hr className="divider" />
          {done ? (
            <>
              {held.length > 0 && (
                <Note kind="warn" title="Connected story review continues.">
                  The affected chapter stays on hold until its review is complete.
                </Note>
              )}
              <Note kind="plain" style={{ marginTop: 14 }}>
                Previously downloaded or printed copies cannot be recalled.
              </Note>
              <div className="stack" style={{ marginTop: 20 }}>
                <Link className="btn btn--lime btn--caps" to={backToMemories}>
                  Back to memories <Chev />
                </Link>
                {held.length > 0 && (
                  <Link className="btn btn--outline" to={base}>
                    View request status <Chev />
                  </Link>
                )}
              </div>
            </>
          ) : (
            <>
              <div className="steps">
                <StepRow state="active" title="Removing recording and transcript" sub="In progress…" />
                {held.length > 0 && <StepRow state="held" title="Connected chapter held" sub="On hold during review." />}
                {held.length > 0 && <StepRow state="pending" title="Reviewing related story content" sub="Pending." />}
              </div>
              <Note kind="info" style={{ marginTop: 14 }}>
                We'll confirm when the original memory is removed. Connected story review may take longer.
              </Note>
            </>
          )}
        </Sheet>
      </div>
    );
  }

  if (step === "confirm") {
    const ready = typed.trim() === "DELETE" && understood;
    return (
      <div className="page">
        <TopBar back={() => setStep("review")} />
        <Masthead title={<>Delete this<br />memory?</>} style={{ paddingTop: 0 }} />
        <Sheet grow>
          <span className="icon-circle icon-circle--red icon-circle--sm">
            <IconTrash size={30} />
          </span>
          <h2 className="h-title" style={{ fontSize: 28, marginTop: 14 }}>{title}</h2>
          <p className="t-body t-muted" style={{ marginTop: 8 }}>
            This removes the recording and its transcript.{held.length > 0 && " Connected story content will be held for review."}
          </p>
          <div className="field" style={{ marginTop: 22 }}>
            <label className="field__label field__label--strong" htmlFor="typed">
              Type DELETE to confirm
            </label>
            <input id="typed" className="input" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="DELETE" autoComplete="off" autoCapitalize="characters" />
          </div>
          <div style={{ marginTop: 16 }}>
            <Check checked={understood} onChange={setUnderstood}>
              I understand this cannot be undone.
            </Check>
          </div>
          {error && <p className="error-text">{error}</p>}
          <div className="stack" style={{ marginTop: 22 }}>
            <button className={`btn btn--caps ${ready ? "btn--danger-solid" : ""}`} disabled={!ready} onClick={() => void remove()}>
              Delete memory <Chev />
            </button>
            <button className="btn btn--outline" onClick={() => navigate(`${base}/memories/${memoryId}`)}>
              Cancel
            </button>
          </div>
          <p className="t-center t-small t-muted" style={{ marginTop: 14 }}>Nothing is deleted until you confirm.</p>
        </Sheet>
      </div>
    );
  }

  return (
    <div className="page">
      <TopBar back={`${base}/memories/${memoryId}`} title="Memory options" />
      <Masthead title={<>Review what<br />changes.</>} style={{ paddingTop: 0 }} />
      <Sheet grow>
        <div className="hstack" style={{ gap: 14 }}>
          <span className="step__icon step__icon--purple">
            <IconPlay size={20} />
          </span>
          <div>
            <p className="h-title h-title--sm">{title}</p>
            <p className="t-small t-muted">
              Recorded by {preview.memory.mine ? "you" : "a family member"} · {formatDate(preview.memory.recordedAt)}
            </p>
          </div>
        </div>
        <hr className="divider" />
        <p className="h-section">This removes</p>
        <div className="menu" style={{ marginTop: 4 }}>
          <div className="menu__row" style={{ cursor: "default", padding: "12px 2px" }}>
            <span className="menu__icon">
              <IconMic size={22} />
            </span>
            <span className="menu__title" style={{ fontSize: 17 }}>Original recording</span>
          </div>
          <div className="menu__row" style={{ cursor: "default", padding: "12px 2px" }}>
            <span className="menu__icon">
              <IconFileText size={22} />
            </span>
            <span className="menu__title" style={{ fontSize: 17 }}>Transcript and interpretation</span>
          </div>
        </div>
        {held.length > 0 && (
          <>
            <p className="h-section" style={{ marginTop: 14 }}>Connected chapter{held.length > 1 ? "s" : ""}</p>
            {held.map((c) => (
              <div key={c.id} className="inspired" style={{ marginTop: 8, borderColor: "var(--line)", borderWidth: 1.5 }}>
                {c.cover ? <img src={`/${c.cover}`} alt="" className="inspired__cover" /> : <span className="inspired__cover" />}
                <span className="inspired__title grow">{c.title}</span>
                <IconChevronRight size={20} />
              </div>
            ))}
            <Note kind="warn" style={{ marginTop: 12 }}>
              {held.length > 1 ? "These chapters" : "This chapter"} will be held while we remove this memory's influence and review related story details.
            </Note>
          </>
        )}
        <p className="t-center t-small t-muted" style={{ margin: "14px 0 0" }}>Copies already downloaded or printed cannot be recalled.</p>
        <div className="stack" style={{ marginTop: 16 }}>
          <a className="btn btn--outline" href={`/api/memories/${memoryId}/export`} download>
            Export this memory first
          </a>
          <button className="btn btn--danger" onClick={() => setStep("confirm")}>
            Continue to confirmation <Chev />
          </button>
          <Link className="btn btn--soft" to={`${base}/memories/${memoryId}`}>
            Keep memory
          </Link>
        </div>
      </Sheet>
    </div>
  );
}
