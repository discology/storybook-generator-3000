import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import { IconBook, IconCheck, IconClock, IconMic, IconPeople, IconWarning } from "../components/icons";
import { Chev, Field, Loading, Mascot, Masthead, Note, Sheet } from "../components/ui";
import { useAuth } from "../auth/AuthContext";
import { apiGet, apiSend, ApiError } from "../lib/api";
import YouInThePictures from "../components/YouInThePictures";
import { possessive } from "../lib/format";

interface InvitationInfo {
  status: string;
  invitedByName: string | null;
  relationship: string | null;
  childName: string;
  storybookTitle: string | null;
  storybookId: string | null;
  joinedByMe: boolean;
  signedInName: string | null;
}

type Problem = "expired" | "revoked" | "not_found" | "requested";

// Opening an invitation link: welcome, or the reason it no longer works.
export default function InvitationAccept() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading, refresh } = useAuth();
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // After joining: "You, in the pictures", unless the family already drew this person.
  const [joined, setJoined] = useState<{ storybookId: string; name: string } | null>(null);
  // Joining refreshes the signed-in user, which re-runs the invitation lookup below;
  // its "already a member" redirect must not skip the step that follows joining.
  const justJoined = useRef(false);

  useEffect(() => {
    fetch(`/api/invitations/${token}`)
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) {
          setProblem(data.error === "expired" ? (data.renewRequested ? "requested" : "expired") : data.error === "revoked" ? "revoked" : "not_found");
          return;
        }
        setInfo(data);
        if (data.joinedByMe && data.storybookId && !justJoined.current) navigate(`/storybooks/${data.storybookId}`, { replace: true });
      })
      .catch(() => setProblem("not_found"));
  }, [token, navigate, user]);

  const requestNew = async () => {
    setBusy(true);
    try {
      await apiSend(`/api/invitations/${token}/request-new`, "POST");
      setProblem("requested");
    } finally {
      setBusy(false);
    }
  };

  const accept = async () => {
    if (!user) {
      navigate(`/sign-in?next=${encodeURIComponent(`/invitations/${token}`)}`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const data = await apiSend(`/api/invitations/${token}/accept`, "POST", { name: name.trim() });
      justJoined.current = true;
      refresh();
      const myName = (name.trim() || user.name || "").trim();
      if (!data.storybookId) return navigate("/", { replace: true });
      const list = await apiGet(`/api/storybooks/${data.storybookId}/characters`).catch(() => null);
      const characters: { name: string }[] = Array.isArray(list) ? list : list?.characters ?? [];
      const alreadyDrawn = characters.some((c) => c.name.trim().toLowerCase() === myName.toLowerCase());
      if (alreadyDrawn || !myName) return navigate(`/storybooks/${data.storybookId}`, { replace: true });
      setJoined({ storybookId: data.storybookId, name: myName });
    } catch (err) {
      if (err instanceof ApiError && (err.message === "revoked" || err.message === "expired")) setProblem(err.message);
      else setError(err instanceof ApiError ? err.message : "Couldn't join. Try again.");
    } finally {
      setBusy(false);
    }
  };

  if (joined) {
    return (
      <div className="page">
        <TopBar back={() => navigate(`/storybooks/${joined.storybookId}`, { replace: true })} wordmark />
        <YouInThePictures
          storybookId={joined.storybookId}
          childName={info?.childName ?? ""}
          myName={joined.name}
          relationship={info?.relationship ?? null}
          onDone={() => navigate(`/storybooks/${joined.storybookId}`, { replace: true })}
        />
      </div>
    );
  }

  if (problem === "revoked" || problem === "not_found") {
    return (
      <div className="page">
        <TopBar back="/sign-in" wordmark />
        <Masthead
          badge={
            <span className="badge badge--amber badge--caps">
              <IconWarning size={18} /> Invitation unavailable
            </span>
          }
          title={<>This invitation is<br />no longer active.</>}
          art="envelope"
          center
          size="md"
        />
        <Sheet grow>
          <h2 className="h-title">{problem === "revoked" ? "The invitation was withdrawn." : "We couldn't find this invitation."}</h2>
          <p className="t-body t-muted" style={{ marginTop: 8 }}>Contact the person who invited you if you think this was a mistake.</p>
          <Link className="btn btn--lime" to="/sign-in" style={{ marginTop: 22 }}>
            Back to sign in <Chev />
          </Link>
        </Sheet>
      </div>
    );
  }

  if (problem === "expired") {
    return (
      <div className="page">
        <TopBar back="/sign-in" wordmark />
        <Masthead
          plate="tall"
          badge={
            <span className="badge badge--amber badge--caps">
              <IconClock size={18} /> Link expired
            </span>
          }
          title={<>Let's get you<br />a fresh invite.</>}
          art="envelope"
          center
          size="md"
        />
        <Sheet grow>
          <h2 className="h-title">This invitation link is no longer active.</h2>
          <p className="t-body t-muted" style={{ marginTop: 8 }}>Ask the person who invited you for a new link, or request one below.</p>
          <div className="stack" style={{ marginTop: 22 }}>
            <button className="btn btn--lime btn--caps" onClick={() => void requestNew()} disabled={busy}>
              Request a new invitation <Chev />
            </button>
            <Link className="btn btn--outline" to="/sign-in">
              Back to sign in
            </Link>
          </div>
          <p className="t-center t-small t-muted" style={{ marginTop: 14 }}>This won't give access until a new invitation is accepted.</p>
        </Sheet>
      </div>
    );
  }

  if (problem === "requested") {
    return (
      <div className="page">
        <TopBar back="/sign-in" wordmark />
        <header className="masthead masthead--plate masthead--center">
          <span className="icon-circle icon-circle--purple masthead__title" style={{ width: 64, height: 64, marginBottom: 14 }}>
            <IconCheck size={32} strokeWidth={3} />
          </span>
          <h1 className="h-display h-display--md masthead__title">Your request<br />is on its way.</h1>
          <Mascot name="envelope-happy" className="masthead__art masthead__art--scene" />
        </header>
        <Sheet grow>
          <h2 className="h-title">If this invitation can be renewed, the inviter will receive your request.</h2>
          <p className="t-body t-muted" style={{ marginTop: 8 }}>When a new link arrives, open it to verify your details and join.</p>
          <Link className="btn btn--lime btn--caps" to="/sign-in" style={{ marginTop: 22 }}>
            Back to sign in <Chev />
          </Link>
          <Note kind="info" style={{ marginTop: 16 }}>A request does not grant access to a storybook.</Note>
        </Sheet>
      </div>
    );
  }

  if (!info || authLoading) return <Loading />;

  const needsName = !!user && !user.name;
  return (
    <div className="page">
      <TopBar wordmark />
      <header className="masthead masthead--plate masthead--center">
        <span className="badge badge--pink badge--caps masthead__title">You're invited</span>
        <h1 className="h-display h-display--md masthead__title" style={{ marginTop: 12 }}>
          Your voice belongs
          <br />
          in {possessive(info.childName)} story.
        </h1>
        <Mascot name="star" className="masthead__art masthead__art--scene" />
        <p className="masthead__sub" style={{ fontSize: 18, marginTop: 4 }}>
          {info.invitedByName || "Someone in the family"} invited you to add memories to {possessive(info.childName)} storybook.
        </p>
      </header>
      <Sheet grow>
        <h2 className="h-title">You'll be able to</h2>
        <div className="menu" style={{ marginTop: 4 }}>
          {[
            [<IconMic size={22} key="m" />, "Record your own memories"],
            [<IconBook size={22} key="b" />, "Read shared chapters"],
            [<IconPeople size={22} key="p" />, "Choose how your memories are used"],
          ].map(([icon, text]) => (
            <div key={text as string} className="menu__row" style={{ cursor: "default", padding: "12px 2px" }}>
              <span className="menu__icon">{icon}</span>
              <span className="menu__title" style={{ fontSize: 18 }}>{text}</span>
            </div>
          ))}
        </div>
        {needsName && (
          <Field label="Your name" htmlFor="name" hint="The family sees it on your memories.">
            <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. June" autoComplete="given-name" />
          </Field>
        )}
        {error && <p className="error-text">{error}</p>}
        <div className="stack" style={{ marginTop: 20 }}>
          <button className="btn btn--lime btn--caps" onClick={() => void accept()} disabled={busy || (needsName && !name.trim())}>
            {busy ? "Joining…" : "Accept invitation"} <Chev />
          </button>
          {!user && (
            <Link className="btn btn--outline" to={`/try?invite=${token}`}>
              Record a memory first
            </Link>
          )}
          <Link className="btn btn--dark" to="/">
            Not now
          </Link>
        </div>
        <p className="t-center t-small t-muted" style={{ marginTop: 14 }}>
          {user ? "Joining doesn't unlock anyone's private recordings." : "Next: verify your phone number and set up your profile."}
        </p>
        <p className="t-center t-xs t-muted" style={{ marginTop: 8 }}>
          <Link to="/terms">Terms</Link> · <Link to="/privacy">Privacy Policy</Link>
        </p>
      </Sheet>
    </div>
  );
}
