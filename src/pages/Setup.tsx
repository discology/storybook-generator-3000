import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import TopBar from "../components/TopBar";
import { IconCalendar, IconChevronDown, IconHeart, IconSmile } from "../components/icons";
import { Check, Chev, Field, Masthead, Note, ProgressSteps, RadioCard, Select, Sheet, Loading } from "../components/ui";
import YouInThePictures from "../components/YouInThePictures";
import { useAuth } from "../auth/AuthContext";
import { RELATIONSHIPS } from "../lib/relationships";
import { READING_STAGES, ageInYears, stageForAge, stageInfo } from "../lib/stages";
import { formatClock, possessive } from "../lib/format";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIMEZONES = ["Pacific Time", "Mountain Time", "Central Time", "Eastern Time", "Alaska Time", "Hawaii Time"];
const IANA: Record<string, string> = {
  "America/Los_Angeles": "Pacific Time",
  "America/Denver": "Mountain Time",
  "America/Phoenix": "Mountain Time",
  "America/Chicago": "Central Time",
  "America/New_York": "Eastern Time",
  "America/Anchorage": "Alaska Time",
  "Pacific/Honolulu": "Hawaii Time",
};
const TIMES = Array.from({ length: 33 }, (_, i) => {
  const minutes = 6 * 60 + i * 30;
  const value = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return { value, label: formatClock(value) };
});

const guessTimezone = () => {
  try {
    return IANA[Intl.DateTimeFormat().resolvedOptions().timeZone] ?? "Pacific Time";
  } catch {
    return "Pacific Time";
  }
};

// Creating a storybook: who it's for, how it reads, and the reminder rhythm.
export default function Setup() {
  const { user, loading, logout } = useAuth();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  // Step 4 comes after the storybook exists: the parent's own family character.
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLevels, setShowLevels] = useState(false);
  const [form, setForm] = useState({
    childName: "",
    stage: "born" as "born" | "expecting",
    birthDate: "",
    dueDate: "",
    relationship: "Parent",
    parentName: "",
    title: "",
    growWithChild: true,
    readerAgeBand: "read_to_me",
    keepRecordings: true,
    defaultStoryUse: true,
    reminderFrequency: "weekly" as "weekly" | "daily" | "off",
    reminderDay: "Sunday",
    reminderTime: "19:00",
    reminderTimezone: guessTimezone(),
    smsConsent: true,
  });

  useEffect(() => {
    if (!loading && !user) navigate("/sign-in?next=/start", { replace: true });
  }, [loading, user, navigate]);

  useEffect(() => {
    if (user?.name) setForm((f) => (f.parentName ? f : { ...f, parentName: user.name! }));
  }, [user]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => setForm((f) => ({ ...f, [key]: value }));
  const name = form.childName.trim() || "your child";
  const startStage = useMemo(
    () => (form.growWithChild ? stageForAge(form.stage === "expecting" ? null : ageInYears(form.birthDate || null)) : form.readerAgeBand),
    [form.growWithChild, form.stage, form.birthDate, form.readerAgeBand]
  );
  const chapterDay = DAYS[(DAYS.indexOf(form.reminderDay) + 1) % 7];

  const goTo = (n: number) => {
    setError(null);
    setStep(n);
    window.scrollTo(0, 0);
  };

  const create = async (skipReminders = false) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/storybooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          title: form.title.trim() || `${possessive(form.childName.trim())} growing story`,
          reminderFrequency: skipReminders ? "off" : form.reminderFrequency,
          birthDate: form.stage === "born" ? form.birthDate : "",
          dueDate: form.stage === "expecting" ? form.dueDate : "",
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Try again.");
        return;
      }
      setCreatedId(data.storybook.id);
      goTo(4);
    } catch {
      setError("We couldn't reach Vambie. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !user) return <Loading />;

  if (user.canStart === false) {
    return (
      <div className="page">
        <TopBar back="/" wordmark />
        <Masthead title={<>Vambie is<br />invite-only for now.</>} art="envelope" artMode="corner" />
        <Sheet grow>
          <h2 className="h-title">Joining someone's storybook?</h2>
          <p className="t-body t-muted" style={{ marginTop: 8 }}>
            Open the invitation link they sent you. It brings you straight to their child's story.
          </p>
          <p className="t-body t-muted" style={{ marginTop: 12 }}>
            Want to start a storybook of your own? We're opening Vambie to more families soon.
          </p>
          <button
            className="btn btn--outline"
            style={{ marginTop: 22 }}
            onClick={async () => {
              await logout();
              navigate("/", { replace: true });
            }}
          >
            Sign out
          </button>
        </Sheet>
      </div>
    );
  }

  const step1Valid = form.childName.trim() && form.parentName.trim() && form.relationship;

  return (
    <div className="page">
      <TopBar back={step === 1 ? true : step === 4 && createdId ? () => navigate(`/storybooks/${createdId}`, { replace: true }) : () => goTo(step - 1)} wordmark />
      <div className="setup-head">
        <ProgressSteps step={step} total={4} />
      </div>

      {step === 1 && (
        <>
          <Masthead
            title={
              <>
                Who is this
                <br />
                story for?
              </>
            }
            style={{ paddingTop: 0, paddingRight: 140 }}
          />
          <Sheet peek="peek" grow>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (step1Valid) goTo(2);
              }}
            >
              <Field label="Child's name or nickname" htmlFor="childName">
                <input id="childName" className="input" value={form.childName} onChange={(e) => set("childName", e.target.value)} placeholder="e.g. Mia" autoComplete="off" required />
              </Field>
              <Field label="Is your little one…">
                <div className="choices">
                  <button type="button" className={`choice ${form.stage === "born" ? "choice--on" : ""}`} onClick={() => set("stage", "born")}>
                    <IconSmile size={22} /> Already here
                  </button>
                  <button type="button" className={`choice ${form.stage === "expecting" ? "choice--on" : ""}`} onClick={() => set("stage", "expecting")}>
                    <IconHeart size={22} /> On the way
                  </button>
                </div>
              </Field>
              {form.stage === "born" ? (
                <Field label="Date of birth" htmlFor="birthDate">
                  <span className="input-icon">
                    <input id="birthDate" type="date" className="input" value={form.birthDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set("birthDate", e.target.value)} />
                    <span className="input-icon__icon">
                      <IconCalendar size={24} />
                    </span>
                  </span>
                </Field>
              ) : (
                <Field label="Due date" htmlFor="dueDate">
                  <span className="input-icon">
                    <input id="dueDate" type="date" className="input" value={form.dueDate} onChange={(e) => set("dueDate", e.target.value)} />
                    <span className="input-icon__icon">
                      <IconCalendar size={24} />
                    </span>
                  </span>
                </Field>
              )}
              <Field label="Your relationship" htmlFor="relationship">
                <Select id="relationship" value={form.relationship} onChange={(v) => set("relationship", v)} options={[...RELATIONSHIPS]} />
              </Field>
              <Field label="Your first name" htmlFor="parentName" hint="Family members see it when you invite them.">
                <input id="parentName" className="input" value={form.parentName} onChange={(e) => set("parentName", e.target.value)} placeholder="e.g. Jordan" autoComplete="given-name" required />
              </Field>
              <button className="btn btn--lime btn--caps" type="submit" disabled={!step1Valid} style={{ marginTop: 24 }}>
                Continue <Chev />
              </button>
            </form>
          </Sheet>
        </>
      )}

      {step === 2 && (
        <>
          <Masthead
            title={
              <>
                Make it
                <br />
                their story.
              </>
            }
            sub={`${possessive(name)} storybook.`}
            style={{ paddingTop: 0, paddingRight: 140 }}
          />
          <Sheet peek="peek" grow>
            <Field label="Storybook title" htmlFor="title">
              <input id="title" className="input" value={form.title} onChange={(e) => set("title", e.target.value)} placeholder={`${possessive(form.childName.trim() || "Mia")} growing story`} />
            </Field>
            <div className="field">
              <span className="field__label field__label--strong">How should the stories read?</span>
              <div role="radiogroup">
                <RadioCard
                  on={form.growWithChild}
                  onClick={() => set("growWithChild", true)}
                  title={`Grow with ${name}`}
                  badge={<span className="badge badge--lavender badge--sm">Automatic</span>}
                  sub={`Stories gently grow in length, language and themes as ${name} gets older.`}
                />
                {!showLevels && form.growWithChild ? (
                  <button type="button" className="radio-card" onClick={() => setShowLevels(true)} style={{ justifyContent: "space-between", alignItems: "center" }}>
                    <span className="radio-card__title" style={{ fontSize: 20 }}>
                      Choose a fixed reading level
                    </span>
                    <IconChevronDown size={22} />
                  </button>
                ) : (
                  READING_STAGES.map((s) => (
                    <RadioCard
                      key={s.key}
                      on={!form.growWithChild && form.readerAgeBand === s.key}
                      onClick={() => setForm((f) => ({ ...f, growWithChild: false, readerAgeBand: s.key }))}
                      title={s.label}
                      sub={`Ages ${s.ages}`}
                    />
                  ))
                )}
              </div>
              <p className="field__hint">
                {form.growWithChild ? "Starts at" : "Every chapter is written for"} {stageInfo(startStage).label} (ages {stageInfo(startStage).ages}). {stageInfo(startStage).summary}
              </p>
            </div>
            <div className="stack-lg" style={{ marginTop: 22 }}>
              <Check checked={form.keepRecordings} onChange={(v) => set("keepRecordings", v)} sub="When this is off, only the words are kept. The audio is deleted once it's transcribed.">
                Store my voice recordings
              </Check>
              <Check checked={form.defaultStoryUse} onChange={(v) => set("defaultStoryUse", v)} sub="Vambie turns your memories into illustrated chapters. You control sharing for each memory.">
                Use my memories to create AI-generated stories
              </Check>
            </div>
            <button className="btn btn--lime btn--caps" type="button" disabled={!form.defaultStoryUse} onClick={() => goTo(3)} style={{ marginTop: 24 }}>
              Continue <Chev />
            </button>
            {!form.defaultStoryUse && <p className="field__hint t-center">Chapters are made from your memories, so this is needed to continue.</p>}
            <p className="t-center" style={{ marginTop: 16 }}>
              <button type="button" className="tlink" onClick={() => goTo(1)}>
                Back
              </button>
            </p>
          </Sheet>
        </>
      )}

      {step === 3 && (
        <>
          <Masthead
            title={
              <>
                A gentle
                <br />
                nudge.
              </>
            }
            sub="Keep the memories coming."
            style={{ paddingTop: 0, paddingRight: 140 }}
          />
          <Sheet peek="peek" grow>
            <div className="field">
              <span className="field__label field__label--strong">Remind me</span>
              <div className="choices" role="radiogroup">
                {(
                  [
                    ["weekly", "Weekly"],
                    ["daily", "Daily"],
                    ["off", "Not now"],
                  ] as const
                ).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={form.reminderFrequency === value}
                    className={`choice choice--radio ${form.reminderFrequency === value ? "choice--on" : ""}`}
                    onClick={() => set("reminderFrequency", value)}
                  >
                    <span className="radio-card__dot" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
            {form.reminderFrequency !== "off" && (
              <>
                {form.reminderFrequency === "weekly" && (
                  <div className="field kv-row">
                    <label className="field__label" htmlFor="day" style={{ margin: 0 }}>
                      Day
                    </label>
                    <div style={{ width: "58%" }}>
                      <Select id="day" value={form.reminderDay} onChange={(v) => set("reminderDay", v)} options={DAYS} />
                    </div>
                  </div>
                )}
                <div className="field kv-row">
                  <label className="field__label" htmlFor="time" style={{ margin: 0 }}>
                    Time
                  </label>
                  <div style={{ width: "58%" }}>
                    <Select id="time" value={form.reminderTime} onChange={(v) => set("reminderTime", v)} options={TIMES} />
                  </div>
                </div>
                <div className="field kv-row">
                  <label className="field__label" htmlFor="tz" style={{ margin: 0 }}>
                    Timezone
                  </label>
                  <div style={{ width: "58%" }}>
                    <Select id="tz" value={form.reminderTimezone} onChange={(v) => set("reminderTimezone", v)} options={TIMEZONES} />
                  </div>
                </div>
                <div className="field kv-row">
                  <label className="field__label" htmlFor="channel" style={{ margin: 0 }}>
                    Send reminders by
                  </label>
                  <div style={{ width: "58%" }}>
                    <Select id="channel" value="SMS" onChange={() => undefined} options={["SMS"]} />
                  </div>
                </div>
                <div style={{ marginTop: 20 }}>
                  <Check checked={form.smsConsent} onChange={(v) => set("smsConsent", v)} sub="Pause or change this anytime.">
                    Send me memory reminders by SMS
                  </Check>
                </div>
              </>
            )}
            <Note kind="info" style={{ marginTop: 20 }}>
              Each week's memories become a new chapter on {chapterDay} morning.
            </Note>
            {error && <p className="error-text">{error}</p>}
            <button className="btn btn--lime btn--caps" type="button" disabled={busy} onClick={() => void create()} style={{ marginTop: 20 }}>
              {busy ? "Creating…" : `Create ${possessive(name)} storybook`} <Chev />
            </button>
            <p className="t-center" style={{ marginTop: 16 }}>
              <button type="button" className="tlink" onClick={() => void create(true)} disabled={busy}>
                Skip reminders
              </button>
            </p>
          </Sheet>
        </>
      )}
      {step === 4 && createdId && (
        <YouInThePictures
          storybookId={createdId}
          childName={form.childName}
          myName={form.parentName}
          relationship={form.relationship}
          expecting={form.stage === "expecting"}
          onDone={() => navigate(`/storybooks/${createdId}`, { replace: true })}
        />
      )}
    </div>
  );
}
