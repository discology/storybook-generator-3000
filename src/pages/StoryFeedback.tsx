import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import AccessDenied from "../components/AccessDenied";
import { IconCheck } from "../components/icons";
import { Chev, Loading, Masthead, RadioRow, Sheet } from "../components/ui";
import { apiGet, apiSend, ApiError } from "../lib/api";
import { chapterLabel } from "../lib/format";
import type { ReaderChapter } from "../types";

const REASONS = [
  { value: "missed_meaning", label: "It missed what I meant" },
  { value: "too_private", label: "Something feels too private" },
  { value: "reading_level", label: "The reading level feels off" },
  { value: "wrong_detail", label: "A character or detail is wrong" },
];

// "For grown-ups": what felt off about a chapter. Goes to the Vambie team.
export default function StoryFeedback() {
  const { id, chapterId } = useParams();
  const navigate = useNavigate();
  const [chapter, setChapter] = useState<ReaderChapter | null>(null);
  const [denied, setDenied] = useState(false);
  const [reason, setReason] = useState(REASONS[0].value);
  const [note, setNote] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet(`/api/chapters/${chapterId}/read`)
      .then(setChapter)
      .catch((err: ApiError) => (err.status === 403 ? setDenied(true) : setError(err.message)));
  }, [chapterId]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await apiSend(`/api/chapters/${chapterId}/feedback`, "POST", { reason, note });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send your feedback. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (denied) return <AccessDenied />;
  if (!chapter) return error ? <p className="loading">{error}</p> : <Loading />;

  const base = `/storybooks/${id}`;
  const cover = chapter.pages.find((p) => p.image)?.image;

  return (
    <div className="page">
      <TopBar back={() => navigate(-1)} title="Story feedback" />
      <Masthead title="Help us get it right." style={{ paddingTop: 0 }} size="md" />
      <Sheet grow>
        <div className="hstack" style={{ gap: 16 }}>
          {cover ? <img src={`/${cover}`} alt="" className="thumb" style={{ width: 110, height: 92 }} /> : <span className="thumb" />}
          <div>
            <p className="h-title" style={{ fontSize: 25 }}>{chapter.title}</p>
            <p className="t-small t-muted" style={{ marginTop: 4 }}>{chapterLabel(chapter.sequence)}</p>
          </div>
        </div>
        <hr className="divider" />
        {sent ? (
          <div className="center-col" style={{ padding: "12px 0" }}>
            <span className="step__icon step__icon--done" style={{ width: 60, height: 60 }}>
              <IconCheck size={30} strokeWidth={3} />
            </span>
            <h2 className="h-title" style={{ marginTop: 14 }}>Thank you. We'll take a look.</h2>
            <p className="t-body t-muted" style={{ marginTop: 8 }}>Your current chapter stays available while we review your feedback.</p>
            <Link className="btn btn--lime btn--caps" to={`${base}/read/${chapter.id}`} style={{ marginTop: 20 }}>
              Back to the chapter <Chev />
            </Link>
          </div>
        ) : (
          <>
            <p className="h-section" style={{ fontSize: 22 }}>What needs attention?</p>
            <div role="radiogroup" style={{ marginTop: 8 }}>
              {REASONS.map((r) => (
                <RadioRow key={r.value} on={reason === r.value} onClick={() => setReason(r.value)}>
                  {r.label}
                </RadioRow>
              ))}
            </div>
            <div className="field" style={{ marginTop: 18 }}>
              <label className="field__label field__label--strong" htmlFor="note">
                Anything else we should know?
              </label>
              <textarea id="note" className="textarea" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} placeholder="Tell us what felt different." />
            </div>
            {error && <p className="error-text">{error}</p>}
            <button className="btn btn--lime" style={{ marginTop: 18 }} onClick={() => void send()} disabled={busy}>
              {busy ? "Sending…" : "Send feedback"} <Chev />
            </button>
            <p className="t-center t-small t-muted" style={{ marginTop: 12 }}>Your current chapter stays available while we review your feedback.</p>
            {chapter.canShare && (
              <p className="t-center" style={{ marginTop: 10 }}>
                <Link to={`${base}/chapters/${chapter.id}/share`} className="tlink">
                  Manage chapter sharing
                </Link>
              </p>
            )}
          </>
        )}
      </Sheet>
    </div>
  );
}
