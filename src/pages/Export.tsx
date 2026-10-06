import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import AccessDenied from "../components/AccessDenied";
import { IconBook, IconCheck, IconClock, IconFileText, IconHelp, IconMic, IconWarning } from "../components/icons";
import { Chev, CheckMark, Field, Loading, Masthead, Note, Select, Sheet } from "../components/ui";
import { useStorybookData } from "../hooks/useStorybookData";
import { apiGet, apiSend, ApiError } from "../lib/api";
import { possessive } from "../lib/format";

interface ExportView {
  id: string;
  storybookId: string;
  status: "preparing" | "ready" | "failed" | "expired";
  createdAt: string;
  expiresAt: string | null;
  options: { includeRecordings: boolean; includeTranscripts: boolean; includeChapters: boolean; range: string };
  storybookTitle?: string;
  childName?: string;
}

// "a, b and c"
const listing = (items: string[]) => (items.length < 2 ? items.join("") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`);

const RANGES = [
  { value: "all", label: "All dates" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 3 months" },
  { value: "365", label: "This past year" },
];

// "Keep a copy of your moments": choose what goes in the download.
export default function ExportMemories() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { storybook, status } = useStorybookData(id);
  const [include, setInclude] = useState({ includeRecordings: true, includeTranscripts: true, includeChapters: true });
  const [range, setRange] = useState("all");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const prepare = async () => {
    setBusy(true);
    setError(null);
    try {
      const created: ExportView = await apiSend(`/api/storybooks/${id}/export`, "POST", { ...include, range });
      navigate(`/storybooks/${id}/settings/export/${created.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't start the export. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (status === "denied") return <AccessDenied />;
  if (!storybook) return <Loading />;
  const cover = storybook.chapters.find((c) => c.cover)?.cover;
  const options: [keyof typeof include, React.ReactNode, string][] = [
    ["includeRecordings", <IconMic size={22} key="m" />, "My original recordings"],
    ["includeTranscripts", <IconFileText size={22} key="t" />, "My transcripts"],
    ["includeChapters", <IconBook size={22} key="c" />, "Chapters I can access"],
  ];

  return (
    <div className="page">
      <TopBar back={`/storybooks/${id}/settings/privacy`} title="Privacy & data" />
      <Masthead title={<>Keep a copy of<br />your moments.</>} style={{ paddingTop: 0 }} size="md" />
      <Sheet grow>
        <h2 className="h-title">Export my memories</h2>
        <p className="t-body t-muted" style={{ marginTop: 4 }}>Choose what to include in your download.</p>
        <div className="inspired" style={{ marginTop: 14, borderWidth: 1.5, borderColor: "var(--line)" }}>
          {cover ? <img src={`/${cover}`} alt="" className="inspired__cover" style={{ width: 96, height: 64 }} /> : <span className="inspired__cover" style={{ width: 96, height: 64 }} />}
          <span className="inspired__title grow">{possessive(storybook.child.displayName)} story</span>
        </div>
        <div style={{ marginTop: 8 }}>
          {options.map(([key, icon, label]) => (
            <label key={key} className="pick-row" style={{ gap: 16 }}>
              <CheckMark checked={include[key]} onChange={(v) => setInclude((s) => ({ ...s, [key]: v }))} label={label} />
              <span className="menu__icon">{icon}</span>
              <span className="t-body grow">{label}</span>
            </label>
          ))}
        </div>
        <Field label="Date range" htmlFor="range">
          <Select id="range" value={range} onChange={setRange} options={RANGES} />
        </Field>
        <Note kind="info" style={{ marginTop: 16 }}>Other contributors' private recordings are not included.</Note>
        {error && <p className="error-text">{error}</p>}
        <button
          className="btn btn--lime btn--caps"
          style={{ marginTop: 18 }}
          onClick={() => void prepare()}
          disabled={busy || (!include.includeRecordings && !include.includeTranscripts && !include.includeChapters)}
        >
          {busy ? "Starting…" : "Prepare export"} <Chev />
        </button>
        <p className="t-center t-small t-muted" style={{ marginTop: 10 }}>We'll let you know when your download is ready.</p>
      </Sheet>
    </div>
  );
}

// An export's progress: preparing, ready, failed or expired.
export function ExportStatus() {
  const { id, exportId } = useParams();
  const navigate = useNavigate();
  const [view, setView] = useState<ExportView | null>(null);
  const [denied, setDenied] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const load = useCallback(() => {
    apiGet(`/api/exports/${exportId}`)
      .then(setView)
      .catch((err: ApiError) => err.status === 403 && setDenied(true));
  }, [exportId]);
  useEffect(load, [load]);

  useEffect(() => {
    if (view?.status !== "preparing") return;
    const t = setInterval(load, 2500);
    return () => clearInterval(t);
  }, [view?.status, load]);

  const again = async (sameOptions: boolean) => {
    if (!sameOptions) {
      navigate(`/storybooks/${id}/settings/export`);
      return;
    }
    setRetrying(true);
    try {
      const created: ExportView = await apiSend(`/api/exports/${exportId}/retry`, "POST");
      navigate(`/storybooks/${id}/settings/export/${created.id}`, { replace: true });
    } finally {
      setRetrying(false);
    }
  };

  if (denied) return <AccessDenied />;
  if (!view) return <Loading />;
  const base = `/storybooks/${id}`;
  const top = <TopBar back={`${base}/settings/privacy`} title="Your exports" avatar={`${base}/settings`} />;
  const included = [
    view.options.includeRecordings && "Your recordings",
    view.options.includeTranscripts && "Your transcripts",
    view.options.includeChapters && "Accessible chapters",
  ].filter(Boolean) as string[];

  if (view.status === "preparing") {
    return (
      <div className="page">
        {top}
        <Masthead title={<>Gathering<br />your moments.</>} art="papers" artMode="corner" style={{ paddingTop: 0 }} size="md" />
        <Sheet grow>
          <p className="h-title" style={{ fontSize: 26 }}>
            {possessive(view.childName ?? "")} story · Export
          </p>
          <div className="center-col" style={{ marginTop: 24 }}>
            <div className="spin-ring spin-ring--lg" />
            <h2 className="h-title" style={{ marginTop: 22 }}>Preparing your download</h2>
            <p className="t-body t-muted" style={{ marginTop: 8 }}>
              Your {listing(included.map((item) => item.toLowerCase().replace("your ", "")))} are being gathered.
            </p>
          </div>
          <Note kind="info" style={{ marginTop: 20 }}>
            You can leave this page. We'll let you know when it's ready.
          </Note>
          <Link className="btn btn--lime" to={`${base}/memories`} style={{ marginTop: 18 }}>
            Back to memories <Chev />
          </Link>
        </Sheet>
      </div>
    );
  }

  if (view.status === "ready") {
    const days = view.expiresAt ? Math.max(1, Math.round((new Date(view.expiresAt).getTime() - Date.now()) / 86400000)) : 7;
    return (
      <div className="page">
        {top}
        <Masthead title={<>Your memories,<br />ready to keep.</>} art="download" artMode="corner" style={{ paddingTop: 0 }} size="md" />
        <Sheet grow>
          <p className="h-title" style={{ fontSize: 26 }}>
            {possessive(view.childName ?? "")} story · Export
          </p>
          <div className="steps" style={{ marginTop: 8 }}>
            {included.map((item) => (
              <div key={item} className="step">
                <span className="step__icon step__icon--done" style={{ width: 36, height: 36 }}>
                  <IconCheck size={20} strokeWidth={3.2} />
                </span>
                <p className="t-body">{item}</p>
              </div>
            ))}
          </div>
          <a className="btn btn--lime btn--caps" href={`/api/exports/${view.id}/download`} style={{ marginTop: 16 }}>
            Download zip <Chev />
          </a>
          <p className="t-center t-small t-muted" style={{ marginTop: 10 }}>
            Sign in to download. This download link expires in {days} {days === 1 ? "day" : "days"}.
          </p>
          <Link className="btn btn--outline" to={`${base}/settings/privacy`} style={{ marginTop: 14 }}>
            Back to privacy settings
          </Link>
          <Note kind="info" style={{ marginTop: 16 }}>Downloading does not delete your memories.</Note>
        </Sheet>
      </div>
    );
  }

  if (view.status === "failed") {
    return (
      <div className="page">
        {top}
        <Masthead
          title={<>Your export needs<br />another try.</>}
          badge={
            <span className="badge badge--amber">
              <IconWarning size={18} /> Export failed
            </span>
          }
          art="peek-worried"
          artMode="corner"
          style={{ paddingTop: 0 }}
          size="md"
        />
        <Sheet grow>
          <div className="center-col">
            <span className="icon-circle icon-circle--amber">
              <IconWarning size={44} />
            </span>
            <h2 className="h-title" style={{ marginTop: 16 }}>We couldn't finish preparing this download.</h2>
            <p className="t-body t-muted" style={{ marginTop: 8 }}>Your saved memories are unaffected.</p>
          </div>
          <hr className="divider" />
          <div className="stack">
            <button className="btn btn--lime" onClick={() => void again(true)} disabled={retrying}>
              {retrying ? "Starting…" : "Try export again"} <Chev />
            </button>
            <Link className="btn btn--outline" to={`${base}/settings/privacy`}>
              Back to privacy settings
            </Link>
          </div>
          <p className="t-center" style={{ marginTop: 14 }}>
            <Link to="/help" className="tlink" style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
              <IconHelp size={20} /> Get help
            </Link>
          </p>
        </Sheet>
      </div>
    );
  }

  return (
    <div className="page">
      {top}
      <Masthead
        title={<>Let's make<br />a fresh copy.</>}
        badge={
          <span className="badge badge--amber">
            <IconClock size={18} /> Link expired
          </span>
        }
        art="download"
        artMode="corner"
        style={{ paddingTop: 0 }}
        size="md"
      />
      <Sheet grow>
        <div className="center-col">
          <span className="icon-circle icon-circle--amber">
            <IconClock size={44} />
          </span>
          <h2 className="h-title" style={{ marginTop: 16 }}>This export link expired after 7 days.</h2>
          <p className="t-body t-muted" style={{ marginTop: 8 }}>Your memories are still available. Prepare a new export to download them again.</p>
        </div>
        <hr className="divider" />
        <div className="stack">
          <button className="btn btn--lime" onClick={() => void again(true)} disabled={retrying}>
            {retrying ? "Starting…" : "Prepare new export"} <Chev />
          </button>
          <Link className="btn btn--outline" to={`${base}/memories`}>
            Back to memories
          </Link>
        </div>
      </Sheet>
    </div>
  );
}
