import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import Vambie from "../components/Vambie";
import { useAuth } from "../auth/AuthContext";
import { apiSend, ApiError } from "../lib/api";

interface InvitationInfo {
  status: string;
  invitedByName: string | null;
  relationship: string | null;
  childName: string;
  storybookTitle: string | null;
  storybookId: string | null;
}

export default function InvitationAccept() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [info, setInfo] = useState<InvitationInfo | null>(null);
  const [errorKind, setErrorKind] = useState<"not_found" | "expired" | "revoked" | null>(null);
  const [requested, setRequested] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/invitations/${token}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json();
          setErrorKind(data.error === "expired" ? "expired" : data.error === "revoked" ? "revoked" : "not_found");
          return;
        }
        setInfo(await res.json());
      })
      .catch(() => setErrorKind("not_found"));
  }, [token]);

  const requestNew = async () => {
    setBusy(true);
    try {
      await apiSend(`/api/invitations/${token}/request-new`, "POST");
      setRequested(true);
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
    try {
      const data = await apiSend(`/api/invitations/${token}/accept`, "POST");
      navigate(data.storybookId ? `/storybooks/${data.storybookId}` : "/");
    } catch (err) {
      if (err instanceof ApiError) setErrorKind(err.message === "revoked" ? "revoked" : "expired");
    } finally {
      setBusy(false);
    }
  };

  if (errorKind === "expired" || errorKind === "revoked") {
    return (
      <div>
        <TopBar wordmark />
        <div className="hero">
          <div className="hero-mascot-stage">
            <Vambie mood="worried" size={90} />
            <h1 className="display" style={{ fontSize: "1.9rem" }}>
              {requested ? "Your request is on its way." : "Let's get you a fresh invite."}
            </h1>
          </div>
        </div>
        <div className="screen-pad">
          <div className="card">
            {requested ? (
              <p className="status-line">
                If this invitation can be renewed, the inviter will receive your request. When a new link arrives,
                open it to verify your details and join.
              </p>
            ) : (
              <>
                <p className="status-line">
                  This invitation link is no longer active. Ask the person who invited you for a new link, or
                  request one below.
                </p>
                <button className="btn-primary chevron" onClick={requestNew} disabled={busy}>
                  Request a new invitation
                </button>
              </>
            )}
            <button className="btn-secondary" onClick={() => navigate("/sign-in")} style={{ marginTop: "0.6rem" }}>
              Back to sign in
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!info) return <p className="status-line screen-pad">Loading…</p>;

  return (
    <div>
      <TopBar wordmark />
      <div className="hero">
        <div className="hero-mascot-stage">
          <Vambie mood="celebrating" size={100} />
          <span className="pill" style={{ background: "#e6198b", color: "white", marginBottom: "0.5rem" }}>
            You're invited
          </span>
          <h1 className="display" style={{ fontSize: "1.9rem" }}>
            Your voice belongs
            <br />
            in {info.childName}'s story.
          </h1>
          <p className="subtitle" style={{ marginBottom: 0 }}>
            {info.invitedByName || "Someone"} invited you to add memories to {info.storybookTitle || `${info.childName}'s storybook`}.
          </p>
        </div>
      </div>
      <div className="screen-pad">
        <div className="card">
          <h3>You'll be able to</h3>
          <p className="status-line">Record your own memories</p>
          <p className="status-line">Read shared chapters</p>
          <p className="status-line">Choose how your memories are used</p>
          <button className="btn-primary chevron" onClick={accept} disabled={busy || authLoading}>
            {busy ? "Joining…" : "Accept invitation"}
          </button>
          <button className="btn-secondary" style={{ marginTop: "0.6rem" }} onClick={() => navigate("/")}>
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
