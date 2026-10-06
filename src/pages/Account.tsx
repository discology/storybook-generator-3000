import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import { IconBook, IconChevronRight, IconSignOut, IconTrash, IconUser } from "../components/icons";
import { Check, Chev, Field, Loading, Masthead, MenuRow, Note, Sheet, StepRow } from "../components/ui";
import { useAuth } from "../auth/AuthContext";
import { apiGet, apiSend, ApiError } from "../lib/api";
import { possessive } from "../lib/format";

// "Account & sign-in": your name and phone number.
export default function Account() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, refresh, logout } = useAuth();
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (user) setName(user.name ?? "");
  }, [user]);

  const save = async () => {
    setError(null);
    try {
      await apiSend("/api/account", "PUT", { name });
      setSaved(true);
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
    }
  };

  if (!user) return <Loading />;
  const base = `/storybooks/${id}`;
  return (
    <div className="page">
      <TopBar back={`${base}/settings`} title="Account & sign-in" />
      <Masthead title="Your account." style={{ paddingTop: 0 }} />
      <Sheet grow>
        <Field label="Your name" htmlFor="name" hint="The family sees it on your memories and in Family.">
          <input
            id="name"
            className="input"
            value={name}
            onChange={(e) => {
              setSaved(false);
              setName(e.target.value);
            }}
            autoComplete="given-name"
          />
        </Field>
        <Field label="Mobile number" htmlFor="phone" hint="You sign in with a code texted to this number.">
          <input id="phone" className="input" value={user.phone ?? ""} disabled />
        </Field>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn--lime btn--caps" style={{ marginTop: 20 }} onClick={() => void save()} disabled={!name.trim()}>
          {saved ? "Saved" : "Save"} <Chev />
        </button>
        <hr className="divider" style={{ margin: "22px 0 4px" }} />
        <div className="menu">
          <MenuRow
            icon={<IconSignOut size={24} />}
            title="Sign out"
            onClick={async () => {
              await logout();
              navigate("/", { replace: true });
            }}
            right={<span />}
          />
          <MenuRow icon={<IconTrash size={24} />} title="Delete account" sub="Review what will be removed before confirming." to={`${base}/settings/delete-account`} danger />
        </div>
      </Sheet>
    </div>
  );
}

interface Plan {
  owned: { householdId: string; storybookId: string | null; title: string; childName: string; memoryCount: number; chapterCount: number; familyCount: number }[];
  contributing: { contributorId: string; storybookId: string | null; title: string; childName: string; memoryCount: number; heldChapterCount: number }[];
}

// Deleting an account: what goes, then confirm, then it's gone.
export function DeleteAccount() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();
  const [plan, setPlan] = useState<Plan | null>(null);
  const [step, setStep] = useState<"review" | "confirm" | "deleting" | "done">("review");
  const [typed, setTyped] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet("/api/account/deletion-preview")
      .then(setPlan)
      .catch((err: ApiError) => (err.status === 401 ? navigate("/sign-in") : setError(err.message)));
  }, [navigate]);

  const remove = async () => {
    setStep("deleting");
    setError(null);
    try {
      await apiSend("/api/account", "DELETE", { confirm: "DELETE" });
      setStep("done");
      refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't delete your account. Try again.");
      setStep("confirm");
    }
  };

  if (!plan) return error ? <p className="loading">{error}</p> : <Loading />;
  const base = `/storybooks/${id}`;

  if (step === "done") {
    return (
      <div className="page">
        <TopBar wordmark />
        <Masthead title={<>Account<br />deleted.</>} art="hug-book" style={{ paddingTop: 0 }} center />
        <Sheet grow>
          <h2 className="h-title">Thank you for every memory you kept here.</h2>
          <p className="t-body t-muted" style={{ marginTop: 8 }}>Your account and everything listed is gone. Copies you downloaded or printed are still yours.</p>
          <Link className="btn btn--lime btn--caps" to="/" style={{ marginTop: 22 }}>
            Back to Vambie <Chev />
          </Link>
        </Sheet>
      </div>
    );
  }

  if (step === "deleting") {
    return (
      <div className="page">
        <TopBar title="Privacy & data" />
        <Masthead title={<>Deleting your<br />account.</>} style={{ paddingTop: 0 }} />
        <Sheet grow>
          <div className="steps">
            <StepRow state="active" title="Removing your memories and account" sub="In progress…" />
            {plan.contributing.some((c) => c.heldChapterCount > 0) && <StepRow state="held" title="Connected chapters held" sub="On hold during review." />}
          </div>
        </Sheet>
      </div>
    );
  }

  if (step === "confirm") {
    const ready = typed.trim() === "DELETE" && understood;
    return (
      <div className="page">
        <TopBar back={() => setStep("review")} />
        <Masthead title={<>Delete your<br />account?</>} style={{ paddingTop: 0 }} />
        <Sheet grow>
          <span className="icon-circle icon-circle--red icon-circle--sm">
            <IconTrash size={30} />
          </span>
          <p className="t-body t-muted" style={{ marginTop: 14 }}>
            {plan.owned.length > 0
              ? "This deletes the storybooks you started, with every memory and chapter in them, and your account."
              : "This deletes your memories and your account. Chapters made from your memories will be held for review."}
          </p>
          <div className="field" style={{ marginTop: 20 }}>
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
              Delete account <Chev />
            </button>
            <button className="btn btn--outline" onClick={() => navigate(`${base}/settings`)}>
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
      <TopBar back={`${base}/settings/privacy`} title="Privacy & data" />
      <Masthead title={<>Review what<br />changes.</>} style={{ paddingTop: 0 }} />
      <Sheet grow>
        <p className="h-section">This removes</p>
        <div className="menu" style={{ marginTop: 4 }}>
          {plan.owned.map((b) => (
            <div key={b.householdId} className="menu__row" style={{ cursor: "default", alignItems: "flex-start" }}>
              <span className="menu__icon t-red">
                <IconBook size={24} />
              </span>
              <span className="menu__text">
                <span className="menu__title">{possessive(b.childName)} whole storybook</span>
                <span className="menu__sub" style={{ display: "block" }}>
                  {b.memoryCount} {b.memoryCount === 1 ? "memory" : "memories"} and {b.chapterCount} {b.chapterCount === 1 ? "chapter" : "chapters"}
                  {b.familyCount > 0 ? `, including what ${b.familyCount} family ${b.familyCount === 1 ? "member" : "members"} recorded. They lose access too.` : "."}
                </span>
              </span>
            </div>
          ))}
          {plan.contributing.map((b) => (
            <div key={b.contributorId} className="menu__row" style={{ cursor: "default", alignItems: "flex-start" }}>
              <span className="menu__icon">
                <IconBook size={24} />
              </span>
              <span className="menu__text">
                <span className="menu__title">
                  Your {b.memoryCount} {b.memoryCount === 1 ? "memory" : "memories"} in {possessive(b.childName)} story
                </span>
                {b.heldChapterCount > 0 && (
                  <span className="menu__sub" style={{ display: "block" }}>
                    {b.heldChapterCount} {b.heldChapterCount === 1 ? "chapter" : "chapters"} made from them will be held for review.
                  </span>
                )}
              </span>
            </div>
          ))}
          <div className="menu__row" style={{ cursor: "default" }}>
            <span className="menu__icon">
              <IconUser size={24} />
            </span>
            <span className="menu__title">Your account and sign-in</span>
          </div>
        </div>
        {plan.owned.some((b) => b.familyCount > 0) && (
          <Note kind="warn" style={{ marginTop: 12 }}>
            Storybooks you started are deleted for everyone in them. Family members keep their accounts.
          </Note>
        )}
        <p className="t-center t-small t-muted" style={{ margin: "14px 0 0" }}>Copies already downloaded or printed cannot be recalled.</p>
        <div className="stack" style={{ marginTop: 16 }}>
          <Link className="btn btn--outline" to={`${base}/settings/export`}>
            Export my memories first
          </Link>
          <button className="btn btn--danger" onClick={() => setStep("confirm")}>
            Continue to confirmation <Chev />
          </button>
          <Link className="btn btn--soft" to={`${base}/settings`}>
            Keep my account
          </Link>
        </div>
      </Sheet>
    </div>
  );
}

const FAQ: [string, string][] = [
  [
    "My microphone won't record",
    "Your browser needs permission. Open this site's settings (the lock or tune icon next to the address), allow the microphone, then come back and tap Try microphone again.",
  ],
  [
    "When is a new chapter made?",
    "Once a week. Everything recorded that week becomes one chapter the morning after your weekly reminder. The person who started the storybook can also make it right away from This week's chapter.",
  ],
  [
    "Who can hear my recordings?",
    "Only you, unless you choose Everyone in the family when you save a memory. Chapters inspired by your memories can be shared, but the original recording and its words stay private.",
  ],
  [
    "Something in a chapter isn't right",
    "Before a chapter is published, the parent who started the storybook looks through every page and can redraw pictures or change words. After that, open the chapter and use For grown-ups: story feedback.",
  ],
  [
    "Can I get a copy of everything?",
    "Yes. Go to Settings, Privacy & data, Export my memories. The download holds your recordings, your words and the chapters you can read.",
  ],
  [
    "How do I delete a memory or my account?",
    "Open a memory and choose Memory options, Delete memory. To delete your account, go to Settings, Account & sign-in, Delete account. You'll see what's removed before anything happens.",
  ],
];

// Help: answers to common questions.
export function Help() {
  return (
    <div className="page">
      <TopBar back={true} wordmark />
      <Masthead title={<>How can<br />we help?</>} art="magnifier" artMode="corner" style={{ paddingTop: 0 }} />
      <Sheet grow>
        <Link to="/how-it-works" className="menu__row" style={{ textDecoration: "none", paddingTop: 4 }}>
          <span className="menu__icon">
            <IconBook size={24} />
          </span>
          <span className="menu__text">
            <span className="menu__title">How Vambie works</span>
            <span className="menu__sub" style={{ display: "block" }}>A four-page introduction</span>
          </span>
          <IconChevronRight size={20} className="menu__chev" />
        </Link>
        {FAQ.map(([q, a]) => (
          <details key={q} className="disclosure">
            <summary>
              <span className="grow menu__title" style={{ fontWeight: 600 }}>{q}</span>
              <IconChevronRight size={20} className="menu__chev" />
            </summary>
            <div className="disclosure__body">
              <p className="t-body t-muted" style={{ margin: 0 }}>{a}</p>
            </div>
          </details>
        ))}
      </Sheet>
    </div>
  );
}
