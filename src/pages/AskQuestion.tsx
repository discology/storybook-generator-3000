import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import AccessDenied from "../components/AccessDenied";
import { IconLock, IconMic } from "../components/icons";
import { Avatar, CheckMark, Chev, Loading, Masthead, Note, Sheet } from "../components/ui";
import { apiGet, apiSend, ApiError } from "../lib/api";

// Phones can hand a message to Messages, WhatsApp and so on; elsewhere it's copied.
const canShare = typeof navigator !== "undefined" && "share" in navigator;

interface AskData {
  question: string;
  category: string;
  answered: boolean; // you've answered it yourself, so you can pass it on
  family: { id: string; name: string; relationship: string | null; answered: boolean; asked: boolean }[];
}

interface AskResult {
  text: string;
  asked: string[];
  texted: string[];
  notTexted: { name: string; reason: string }[];
}

const listNames = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

// "Ask someone else" (VSB-131): after answering a card, pass the question on to
// family members who have joined. They get the question, never your answer.
export default function AskQuestion() {
  const { id, promptId } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<AskData | null>(null);
  const [problem, setProblem] = useState<"denied" | "gone" | null>(null);
  const [to, setTo] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AskResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet(`/api/storybooks/${id}/prompts/${promptId}/ask`)
      .then((d: AskData) => {
        setData(d);
        // With one person to ask, they're already picked.
        const open = d.family.filter((f) => !f.answered);
        if (open.length === 1) setTo([open[0].id]);
      })
      .catch((err: ApiError) => setProblem(err.status === 403 ? "denied" : "gone"));
  }, [id, promptId]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      setResult(await apiSend(`/api/storybooks/${id}/prompts/${promptId}/ask`, "POST", { recipientIds: to, message }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const shareOut = async () => {
    if (!result) return;
    if (canShare) {
      await navigator.share({ text: result.text }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(result.text);
    setCopied(true);
  };

  const base = `/storybooks/${id}`;
  if (problem === "denied") return <AccessDenied />;
  if (problem === "gone")
    return (
      <div className="page">
        <TopBar back={base} title="Ask someone else" />
        <p className="loading">That question isn't here anymore.</p>
      </div>
    );
  if (!data) return <Loading />;

  return (
    <div className="page">
      <TopBar back={() => navigate(-1)} title="Ask someone else" />
      <Masthead title={<>Pass the<br />question on.</>} style={{ paddingTop: 0, paddingRight: 140 }} />
      <Sheet peek="peek" grow>
        <div className="ask-question">
          <span className="badge badge--purple badge--caps badge--sm">{data.category}</span>
          <p className="ask-question__q">{data.question}</p>
        </div>
        {!data.answered ? (
          <>
            <Note kind="info" style={{ marginTop: 16 }}>
              Answer this one yourself first, then pass it on.
            </Note>
            <Link className="btn btn--lime btn--caps" to={`${base}/record?card=${promptId}`} style={{ marginTop: 14 }}>
              <IconMic size={22} filled /> Answer it <Chev />
            </Link>
          </>
        ) : result ? (
          <div style={{ marginTop: 18 }}>
            <h2 className="h-title" style={{ fontSize: 24 }}>Asked</h2>
            <p className="t-small" style={{ marginTop: 6 }}>
              {listNames(result.asked)} will see it on their home{result.texted.length ? `, and we texted ${listNames(result.texted)}` : ""}.
            </p>
            {result.notTexted.length > 0 && (
              <>
                <p className="t-small t-muted" style={{ marginTop: 8 }}>
                  {listNames(result.notTexted.map((n) => (n.reason === "couldn't be texted" ? n.name : `${n.name} (${n.reason})`)))} couldn't be texted, so send this yourself:
                </p>
                <div className="share-box" style={{ marginTop: 12 }}>{result.text}</div>
                <button className="btn btn--lime btn--caps" style={{ marginTop: 14 }} onClick={() => void shareOut()}>
                  {copied ? "Copied" : canShare ? "Share message" : "Copy message"} <Chev />
                </button>
              </>
            )}
            <Link className={`btn btn--caps ${result.notTexted.length ? "btn--outline" : "btn--lime"}`} to={base} style={{ marginTop: 14 }}>
              Back to the story <Chev />
            </Link>
          </div>
        ) : (
          <>
            <h2 className="h-title" style={{ fontSize: 24, margin: "20px 0 8px" }}>Ask</h2>
            {data.family.length === 0 ? (
              <Note kind="info">
                No one else has joined yet. <Link to={`${base}/family`} className="tlink">Invite family</Link>
              </Note>
            ) : (
              data.family.map((f) => (
                <label key={f.id} className={`pick-row${f.answered ? " pick-row--done" : ""}`}>
                  <Avatar name={f.name} size="sm" />
                  <span className="grow">
                    <span className="h-title h-title--sm" style={{ display: "block", fontSize: 19 }}>{f.name}</span>
                    <span className="t-small t-muted">{f.answered ? "Already answered" : f.asked ? "Asked, not answered yet" : f.relationship || "Family"}</span>
                  </span>
                  {!f.answered && (
                    <CheckMark checked={to.includes(f.id)} onChange={() => setTo((t) => (t.includes(f.id) ? t.filter((x) => x !== f.id) : [...t, f.id]))} label={`Ask ${f.name}`} />
                  )}
                </label>
              ))
            )}
            {data.family.length > 0 && (
              <>
                <div className="field" style={{ marginTop: 18 }}>
                  <label className="field__label field__label--strong" htmlFor="message">
                    Add a note <span className="t-muted" style={{ fontWeight: 400 }}>(optional)</span>
                  </label>
                  <span className="with-counter" style={{ display: "block" }}>
                    <textarea id="message" className="textarea" value={message} maxLength={200} placeholder="A few words to go with it" onChange={(e) => setMessage(e.target.value)} style={{ minHeight: 90 }} />
                    <span className="counter">{message.length}/200</span>
                  </span>
                </div>
                {error && <p className="error-text">{error}</p>}
                <button className="btn btn--lime btn--caps" style={{ marginTop: 18 }} onClick={() => void send()} disabled={busy || to.length === 0}>
                  {busy ? "Sending…" : "Send the question"} <Chev />
                </button>
                <p className="t-center t-small t-muted hstack" style={{ marginTop: 10, justifyContent: "center", gap: 6 }}>
                  <IconLock size={16} /> They get the question, not your answer.
                </p>
              </>
            )}
          </>
        )}
      </Sheet>
    </div>
  );
}
