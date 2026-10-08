import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import AccessDenied from "../components/AccessDenied";
import { IconChevronRight, IconRefresh, IconSmile, IconTrash } from "../components/icons";
import { Avatar, BottomSheet, Chev, Field, Loading, Masthead, MenuRow, Note, Select, Sheet } from "../components/ui";
import { apiGet, apiSend, ApiError } from "../lib/api";
import { RELATIONSHIPS } from "../lib/relationships";
import { possessive } from "../lib/format";

// Phones can hand a message to Messages, WhatsApp and so on; elsewhere it's copied.
const canShare = typeof navigator !== "undefined" && "share" in navigator;

interface Person {
  id: string;
  name: string;
  relationship: string | null;
  role: string;
  inviteStatus: string;
  isMe: boolean;
  contact: string | null;
  invitedAt: string | null;
  inviteExpired: boolean;
  renewRequested: boolean;
}

interface FamilyData {
  myContributorId: string;
  isOwner: boolean;
  childName: string;
  contributors: Person[];
}

interface SentInvite {
  name: string;
  link: string;
  message: string | null;
  texted: boolean; // the app texted it (the number had already verified here)
}

export default function Family() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<FamilyData | null>(null);
  const [denied, setDenied] = useState(false);
  const [contact, setContact] = useState("");
  const [relationship, setRelationship] = useState("Grandparent");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<SentInvite | null>(null);
  const [selected, setSelected] = useState<Person | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(() => {
    apiGet(`/api/storybooks/${id}/family`)
      .then(setData)
      .catch((err: ApiError) => {
        if (err.status === 401) navigate(`/sign-in?next=${encodeURIComponent(window.location.pathname)}`);
        else if (err.status === 403) setDenied(true);
      });
  }, [id, navigate]);
  useEffect(load, [load]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contact.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiSend(`/api/storybooks/${id}/family/invite`, "POST", { contact: contact.trim(), relationship });
      setSent({ name: contact.trim(), link: res.inviteLink, message: res.inviteMessage, texted: Boolean(res.texted) });
      setContact("");
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create the invite. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const resend = async (person: Person) => {
    setSelected(null);
    try {
      const res = await apiSend(`/api/family/${person.id}/resend`, "POST");
      setSent({ name: person.name, link: res.inviteLink, message: res.inviteMessage, texted: Boolean(res.texted) });
      load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't make a new link.");
    }
  };

  const remove = async (person: Person) => {
    const question = person.inviteStatus === "pending" ? `Cancel the invite for ${person.name}?` : `Remove ${person.name} from the storybook? Their memories stay.`;
    if (!window.confirm(question)) return;
    setSelected(null);
    await apiSend(`/api/family/${person.id}`, "DELETE").catch(() => undefined);
    load();
  };

  const share = async (invite: SentInvite) => {
    const text = invite.message ?? invite.link;
    if (canShare) {
      await navigator.share({ text }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (denied) return <AccessDenied />;
  if (!data) return <Loading />;

  const base = `/storybooks/${id}`;
  const status = (p: Person) =>
    p.isMe && p.role === "owner" ? (
      <span className="badge badge--lime badge--sm">Owner</span>
    ) : p.inviteStatus === "pending" ? (
      <span className="hstack" style={{ gap: 8 }}>
        <span className="badge badge--amber badge--sm">{p.renewRequested ? "Wants a new link" : p.inviteExpired ? "Link expired" : "Invite pending"}</span>
      </span>
    ) : p.role === "owner" ? (
      <span className="badge badge--lime badge--sm">Owner</span>
    ) : (
      <span className="badge badge--green badge--sm" style={{ background: "#2a4a18", color: "#b9f77f" }}>
        Joined
      </span>
    );

  return (
    <div className="page page--nav">
      <TopBar wordmark menu={`${base}/settings`} />
      <Masthead title={<>The people in {possessive(data.childName)} story.</>} sub="More voices. More memories to keep." size="md" style={{ paddingTop: 0 }} />
      <div className="pad">
        {data.contributors.map((p) => (
          <div key={p.id} className="person">
            <button className="person__main" onClick={() => setSelected(p)}>
              <Avatar name={p.name} vambie={p.isMe} />
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="person__name" style={{ display: "block" }}>
                  {p.isMe ? "You" : p.name}
                </span>
                <span className="person__meta" style={{ display: "block" }}>
                  {p.relationship || "Family"}
                  {p.inviteStatus === "pending" ? "" : ` · ${p.role === "owner" ? "Owner" : "Contributor"}`}
                </span>
              </span>
            </button>
            <span className="person__status">
              {status(p)}
              {data.isOwner && p.inviteStatus === "pending" && (
                <button className="tlink tlink--light" onClick={() => void resend(p)}>
                  Resend
                </button>
              )}
            </span>
            <button className="tbar__icon" onClick={() => setSelected(p)} aria-label={`About ${p.isMe ? "you" : p.name}`} style={{ minWidth: 28 }}>
              <IconChevronRight size={20} />
            </button>
          </div>
        ))}

        <Link to={`${base}/characters`} className="week-card" style={{ marginTop: 14 }}>
          <span className="week-card__icon">
            <IconSmile size={24} />
          </span>
          <span className="grow">
            <span className="week-card__title" style={{ display: "block" }}>Who's in the pictures</span>
            <span className="week-card__sub" style={{ display: "block" }}>How family members look in {possessive(data.childName)} storybook</span>
          </span>
          <Chev />
        </Link>
      </div>

      {data.isOwner && (
        <Sheet style={{ marginTop: 18 }}>
          {sent ? (
            <div>
              <h2 className="h-title">{sent.texted ? `We texted ${sent.name} the invite` : `Send ${sent.name} the invite`}</h2>
              <p className="t-small t-muted" style={{ marginTop: 6 }}>
                {sent.texted
                  ? "They already use Vambie with that number, so the invitation went straight to their phone. The link works for 14 days."
                  : "That number hasn't signed up with Vambie yet, so send this yourself (we only text people who have agreed to texts). The link works for 14 days."}
              </p>
              {!sent.texted && (
                <div className="share-box" style={{ marginTop: 12 }}>
                  {sent.message ?? sent.link}
                </div>
              )}
              <div className="stack" style={{ marginTop: 14 }}>
                {!sent.texted && (
                  <button className="btn btn--lime btn--caps" onClick={() => void share(sent)}>
                    {copied ? "Copied" : canShare ? "Share invite" : "Copy message"} <Chev />
                  </button>
                )}
                <button className={sent.texted ? "btn btn--lime btn--caps" : "btn btn--outline"} onClick={() => setSent(null)}>
                  Invite someone else
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={invite}>
              <h2 className="h-title" style={{ marginBottom: 14 }}>Invite someone</h2>
              <Field label="Phone number or email" htmlFor="contact">
                <input id="contact" className="input" value={contact} onChange={(e) => setContact(e.target.value)} placeholder="Enter contact details" autoComplete="off" />
              </Field>
              <Field label={`Relationship to ${data.childName}`} htmlFor="relationship">
                <Select id="relationship" value={relationship} onChange={setRelationship} options={[...RELATIONSHIPS]} />
              </Field>
              {error && <p className="error-text">{error}</p>}
              <button className="btn btn--lime btn--caps" type="submit" disabled={busy || !contact.trim()} style={{ marginTop: 20 }}>
                {busy ? "Creating…" : "Send invitation"} <Chev />
              </button>
              <p className="t-center t-small t-muted" style={{ marginTop: 12 }}>Joining the storybook does not unlock private recordings.</p>
            </form>
          )}
        </Sheet>
      )}

      <BottomSheet open={!!selected} onClose={() => setSelected(null)} label="Family member">
        {selected && (
          <div>
            <div className="hstack" style={{ gap: 14 }}>
              <Avatar name={selected.name} vambie={selected.isMe} size="lg" />
              <div>
                <p className="h-title">{selected.isMe ? "You" : selected.name}</p>
                <p className="t-small t-muted">
                  {selected.relationship || "Family"}
                  {selected.contact && selected.contact !== selected.name ? ` · ${selected.contact}` : ""}
                </p>
              </div>
            </div>
            {selected.renewRequested && (
              <Note kind="warn" style={{ marginTop: 14 }}>
                {selected.name} asked for a new invitation link.
              </Note>
            )}
            <div className="menu" style={{ marginTop: 10 }}>
              {data.isOwner && selected.inviteStatus === "pending" && (
                <MenuRow icon={<IconRefresh size={22} />} title="Send a new invite link" sub="The old link stops working." onClick={() => void resend(selected)} />
              )}
              {data.isOwner && !selected.isMe && selected.role !== "owner" && (
                <MenuRow
                  icon={<IconTrash size={22} />}
                  title={selected.inviteStatus === "pending" ? "Cancel invite" : "Remove from storybook"}
                  sub={selected.inviteStatus === "pending" ? undefined : "Their memories stay in the storybook."}
                  onClick={() => void remove(selected)}
                  danger
                />
              )}
              {selected.isMe && <MenuRow title="Your account" sub="Name, phone and sign-in" to={`${base}/settings/account`} />}
            </div>
          </div>
        )}
      </BottomSheet>
      <BottomNav storybookId={id!} />
    </div>
  );
}
