import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import AccessDenied from "../components/AccessDenied";
import { IconChevronRight, IconPeople } from "../components/icons";
import { Avatar, CheckMark, Chev, Loading, Masthead, Note, RadioCard, Sheet } from "../components/ui";
import { apiGet, apiSend, ApiError } from "../lib/api";
import { chapterLabel, formatDate } from "../lib/format";

// Phones can hand a message to Messages, WhatsApp and so on; elsewhere it's copied.
const canShare = typeof navigator !== "undefined" && "share" in navigator;

interface AccessData {
  chapter: { id: string; title: string; sequence: number; status: string; publishedAt: string | null; cover: string | null };
  shareMode: "family" | "selected" | "private";
  allowedContributorIds: string[];
  myContributorId: string;
  family: { id: string; name: string; relationship: string | null; inviteStatus: string }[];
}

function useAccess(chapterId: string | undefined) {
  const [data, setData] = useState<AccessData | null>(null);
  const [denied, setDenied] = useState(false);
  useEffect(() => {
    apiGet(`/api/chapters/${chapterId}/access`)
      .then(setData)
      .catch((err: ApiError) => err.status === 403 && setDenied(true));
  }, [chapterId]);
  return { data, setData, denied };
}

function ChapterCard({ chapter }: { chapter: AccessData["chapter"] }) {
  return (
    <div className="hstack" style={{ gap: 14 }}>
      {chapter.cover ? <img src={`/${chapter.cover}`} alt="" className="thumb" style={{ width: 128, height: 100 }} /> : <span className="thumb" style={{ width: 128, height: 100 }} />}
      <div>
        <span className="chapter-tile__label" style={{ color: "var(--purple-ink)" }}>{chapterLabel(chapter.sequence)}</span>
        <p className="h-title" style={{ fontSize: 24, margin: "2px 0 4px" }}>{chapter.title}</p>
        {chapter.publishedAt && <p className="t-small t-muted">{formatDate(chapter.publishedAt)}</p>}
      </div>
    </div>
  );
}

const canRead = (data: AccessData, id: string) =>
  data.shareMode === "family" || (data.shareMode === "selected" && data.allowedContributorIds.includes(id));

// "Choose who can read": everyone in the family, selected people, or only you.
export function ChapterAccess() {
  const { id, chapterId } = useParams();
  const navigate = useNavigate();
  const { data, denied } = useAccess(chapterId);
  const [mode, setMode] = useState<AccessData["shareMode"]>("family");
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!data) return;
    setMode(data.shareMode);
    setPicked(data.shareMode === "selected" ? data.allowedContributorIds : data.family.map((f) => f.id));
  }, [data]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      await apiSend(`/api/chapters/${chapterId}/access`, "PUT", { shareMode: mode, contributorIds: picked });
      setSaved(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (denied) return <AccessDenied />;
  if (!data) return <Loading />;
  const base = `/storybooks/${id}`;
  const toggle = (pid: string) => {
    setSaved(false);
    setPicked((p) => (p.includes(pid) ? p.filter((x) => x !== pid) : [...p, pid]));
  };

  return (
    <div className="page">
      <TopBar back={() => navigate(-1)} title="Chapter sharing" />
      <Masthead title={<>Choose who<br />can read.</>} style={{ paddingTop: 0 }} />
      <Sheet grow>
        <ChapterCard chapter={data.chapter} />
        <h2 className="h-title" style={{ fontSize: 24, margin: "20px 0 12px" }}>Who can read this chapter?</h2>
        <div role="radiogroup">
          <RadioCard
            on={mode === "family"}
            onClick={() => {
              setMode("family");
              setSaved(false);
            }}
            title="Everyone in the family"
            sub={data.family.length ? `All ${data.family.length + 1} people in the storybook.` : "Everyone you invite to the storybook."}
          />
          <RadioCard
            on={mode === "selected"}
            onClick={() => {
              setMode("selected");
              setSaved(false);
            }}
            title="Selected family members"
            sub="Choose which family members can read."
          />
          <RadioCard
            on={mode === "private"}
            onClick={() => {
              setMode("private");
              setSaved(false);
            }}
            title="Only me"
            sub="Keep this chapter private."
          />
        </div>
        {mode === "selected" && (
          <div style={{ marginTop: 14 }}>
            {data.family.length === 0 ? (
              <p className="t-small t-muted">No one else is in the storybook yet.</p>
            ) : (
              data.family.map((f) => (
                <label key={f.id} className="pick-row">
                  <Avatar name={f.name} size="sm" />
                  <span className="grow">
                    <span className="h-title h-title--sm" style={{ display: "block", fontSize: 19 }}>{f.name}</span>
                    <span className="t-small t-muted">{f.relationship || "Family"}{f.inviteStatus === "pending" ? " · invited" : ""}</span>
                  </span>
                  <CheckMark checked={picked.includes(f.id)} onChange={() => toggle(f.id)} label={`${f.name} can read`} />
                </label>
              ))
            )}
            <p className="field__hint">Only selected members can open this chapter.</p>
          </div>
        )}
        <Note kind="info" style={{ marginTop: 16 }}>Original recordings and transcripts stay private.</Note>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn--lime btn--caps" style={{ marginTop: 18 }} onClick={() => void save()} disabled={saving}>
          {saved ? "Saved" : saving ? "Saving…" : "Save access"} <Chev />
        </button>
        {data.chapter.status === "published" && (
          <p className="t-center" style={{ marginTop: 14 }}>
            <Link to={`${base}/chapters/${chapterId}/share`} className="tlink">
              Send this chapter to someone
            </Link>
          </p>
        )}
      </Sheet>
    </div>
  );
}

// "Send a little story": a chapter link (and a note) for chosen family members.
const listNames = (names: string[]) => (names.length <= 1 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);
export default function ShareChapter() {
  const { id, chapterId } = useParams();
  const navigate = useNavigate();
  const { data, denied } = useAccess(chapterId);
  const [to, setTo] = useState<string[]>([]);
  const [message, setMessage] = useState("A little story to read together.");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ text: string; link: string; texted?: string[]; notTexted?: { name: string; reason: string }[] } | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const joined = useMemo(() => data?.family.filter((f) => f.inviteStatus === "joined") ?? [], [data]);
  useEffect(() => {
    if (data) setTo(joined.filter((f) => canRead(data, f.id)).map((f) => f.id));
  }, [data, joined]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend(`/api/chapters/${chapterId}/share`, "POST", { recipientIds: to, message });
      setResult(res);
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

  if (denied) return <AccessDenied />;
  if (!data) return <Loading />;
  const base = `/storybooks/${id}`;
  const newAccess = to.filter((pid) => !canRead(data, pid));

  return (
    <div className="page">
      <TopBar back={() => navigate(-1)} title="Share chapter" />
      <Masthead title={<>Send a little<br />story.</>} style={{ paddingTop: 0, paddingRight: 140 }} />
      <Sheet peek="peek" grow>
        <ChapterCard chapter={data.chapter} />
        {data.chapter.status !== "published" ? (
          <Note kind="warn" style={{ marginTop: 16 }}>Publish this chapter before sending it to anyone.</Note>
        ) : result ? (
          <div style={{ marginTop: 18 }}>
            <h2 className="h-title" style={{ fontSize: 24 }}>{result.texted?.length ? "Sent" : "Ready to send"}</h2>
            {result.texted?.length ? (
              <p className="t-small" style={{ marginTop: 6 }}>
                It's in their storybook, and we texted {listNames(result.texted)}.
              </p>
            ) : (
              <p className="t-small t-muted" style={{ marginTop: 6 }}>
                It's in their storybook now.
              </p>
            )}
            {result.notTexted?.length ? (
              <>
                <p className="t-small t-muted" style={{ marginTop: 8 }}>
                  {listNames(result.notTexted.map((n) => (n.reason === "couldn't be texted" ? n.name : `${n.name} (${n.reason})`)))} couldn't be texted, so send this
                  yourself:
                </p>
                <div className="share-box" style={{ marginTop: 12 }}>{result.text}</div>
                <button className="btn btn--lime btn--caps" style={{ marginTop: 14 }} onClick={() => void shareOut()}>
                  {copied ? "Copied" : canShare ? "Share message" : "Copy message"} <Chev />
                </button>
              </>
            ) : (
              <Link className="btn btn--lime btn--caps" to={`${base}/read/${chapterId}`} style={{ marginTop: 14 }}>
                Back to the chapter <Chev />
              </Link>
            )}
          </div>
        ) : (
          <>
            <h2 className="h-title" style={{ fontSize: 24, margin: "20px 0 8px" }}>Send to</h2>
            {joined.length === 0 ? (
              <Note kind="info">
                No one else has joined yet. <Link to={`${base}/family`} className="tlink">Invite family</Link>
              </Note>
            ) : (
              joined.map((f) => (
                <label key={f.id} className="pick-row">
                  <Avatar name={f.name} size="sm" />
                  <span className="grow">
                    <span className="h-title h-title--sm" style={{ display: "block", fontSize: 19 }}>{f.name}</span>
                    <span className="t-small t-muted">{f.relationship || "Family"}</span>
                  </span>
                  <CheckMark checked={to.includes(f.id)} onChange={() => setTo((t) => (t.includes(f.id) ? t.filter((x) => x !== f.id) : [...t, f.id]))} label={`Send to ${f.name}`} />
                </label>
              ))
            )}
            {to.length > 0 &&
              (newAccess.length === 0 ? (
                <Note kind="ok" icon={<IconPeople size={16} />} style={{ marginTop: 12 }}>
                  They already have access to this chapter.
                </Note>
              ) : (
                <Note kind="warn" style={{ marginTop: 12 }}>
                  Sending gives {newAccess.length === 1 ? "them" : `these ${newAccess.length} people`} access to this chapter.
                </Note>
              ))}
            <div className="field" style={{ marginTop: 18 }}>
              <label className="field__label field__label--strong" htmlFor="message">
                Add a message <span className="t-muted" style={{ fontWeight: 400 }}>(optional)</span>
              </label>
              <span className="with-counter" style={{ display: "block" }}>
                <textarea id="message" className="textarea" value={message} maxLength={200} onChange={(e) => setMessage(e.target.value)} style={{ minHeight: 90 }} />
                <span className="counter">{message.length}/200</span>
              </span>
            </div>
            {error && <p className="error-text">{error}</p>}
            <button className="btn btn--lime btn--caps" style={{ marginTop: 18 }} onClick={() => void send()} disabled={busy || to.length === 0}>
              {busy ? "Sending…" : "Send chapter link"} <Chev />
            </button>
            <p className="t-center t-small t-muted" style={{ marginTop: 10 }}>Recipients must sign in. Forwarding the link does not grant access.</p>
          </>
        )}
        <Link to={`${base}/chapters/${chapterId}/access`} className="btn btn--outline" style={{ marginTop: 16, justifyContent: "space-between" }}>
          Manage access <IconChevronRight size={22} />
        </Link>
      </Sheet>
    </div>
  );
}
