import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import { apiGet, apiSend, ApiError } from "../lib/api";
import { useNavigate, useLocation } from "react-router-dom";
import type { Contributor } from "../types";
import { RELATIONSHIPS } from "../lib/relationships";

export default function Family() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [contributors, setContributors] = useState<Contributor[] | null>(null);
  const [contact, setContact] = useState("");
  const [relationship, setRelationship] = useState("Grandparent");
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    apiGet(`/api/storybooks/${id}/family`)
      .then((data) => setContributors(data.contributors))
      .catch((err: ApiError) => {
        if (err.status === 401) navigate(`/sign-in?next=${encodeURIComponent(location.pathname)}`);
      });
  };

  useEffect(load, [id]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact.trim()) return;
    setBusy(true);
    setInviteLink(null);
    try {
      const data = await apiSend(`/api/storybooks/${id}/family/invite`, "POST", { contact: contact.trim(), relationship });
      setInviteLink(data.inviteLink);
      setInviteMessage(data.inviteMessage);
      setContact("");
      load();
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (contributorId: string) => {
    await apiSend(`/api/family/${contributorId}`, "DELETE");
    load();
  };

  if (!contributors) return <p className="status-line screen-pad">Loading…</p>;

  return (
    <div>
      <TopBar backTo={`/storybooks/${id}`} backLabel="Mia's story" menuTo={`/storybooks/${id}/settings`} />
      <div className="hero" style={{ paddingTop: 0 }}>
        <h1 className="display">The people in her story.</h1>
        <p className="subtitle">More voices. More memories to keep.</p>
      </div>

      <div className="screen-pad">
        <div className="card">
          {contributors.map((c, i) => (
            <div key={c.id} className="link-row" style={{ textDecoration: "none" }}>
              <div>
                <strong>{c.name}</strong>
                <div className="status-line">
                  {c.relationship || "Contributor"} {c.role === "owner" ? "· Owner" : ""}
                </div>
              </div>
              {c.inviteStatus === "pending" ? (
                <span className="pill warn">Invite pending</span>
              ) : c.inviteStatus === "revoked" ? (
                <button className="btn-small btn-secondary" disabled>
                  Revoked
                </button>
              ) : c.role === "owner" ? (
                <span className="pill good">Owner</span>
              ) : (
                <button className="btn-small btn-secondary" onClick={() => revoke(c.id)}>
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>

        <form className="card" onSubmit={invite}>
          <h3>Invite someone</h3>
          <label htmlFor="contact">Phone number or email</label>
          <input id="contact" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Enter contact details" />

          <label htmlFor="relationship">Relationship to the child</label>
          <select id="relationship" value={relationship} onChange={(e) => setRelationship(e.target.value)}>
            {RELATIONSHIPS.map((r) => (
              <option key={r}>{r}</option>
            ))}
          </select>

          <button className="btn-primary chevron" type="submit" disabled={busy}>
            {busy ? "Sending…" : "Send invitation"}
          </button>

          {inviteLink && inviteMessage && (
            <div className="banner info">
              Texting invites isn't switched on yet. Send them this message yourself:
              <p style={{ whiteSpace: "pre-wrap", margin: "0.5rem 0" }}>{inviteMessage}</p>
              <button type="button" className="btn-small btn-secondary" onClick={() => navigator.clipboard.writeText(inviteMessage)}>
                Copy message
              </button>
            </div>
          )}
          {inviteLink && !inviteMessage && (
            <div className="banner info">
              Invite texts are turned off. Share this link directly:{" "}
              <a href={inviteLink} style={{ color: "inherit" }}>
                {inviteLink}
              </a>
            </div>
          )}

          <p className="status-line">Joining the storybook does not unlock private recordings.</p>
        </form>
      </div>
      <BottomNav storybookId={id!} />
    </div>
  );
}
