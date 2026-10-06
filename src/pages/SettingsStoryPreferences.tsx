import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import AccessDenied from "../components/AccessDenied";
import { IconCalendar, IconChevronDown } from "../components/icons";
import { Chev, Field, Loading, Masthead, Note, RadioCard, Select, Sheet } from "../components/ui";
import { useStorybookData } from "../hooks/useStorybookData";
import { apiSend, ApiError } from "../lib/api";
import { READING_STAGES, ageInYears, normalizeStage, stageForAge, stageInfo } from "../lib/stages";

const NAME_AGES = [
  ...Array.from({ length: 8 }, (_, i) => ({ value: String(i + 2), label: `At age ${i + 2}${i + 2 === 4 ? " (recommended)" : ""}` })),
  { value: "13", label: "Keep calling him Baby Vambie" },
];

// Birth dates are stored at UTC midnight; show the same calendar date.
const toDateInput = (iso: string | null) => (iso ? new Date(iso).toISOString().slice(0, 10) : "");

export default function SettingsStoryPreferences() {
  const { id } = useParams();
  const { storybook, status, reload } = useStorybookData(id);
  const [form, setForm] = useState({ title: "", childName: "", birthDate: "", growWithChild: true, readerAgeBand: "read_to_me", vambieNameAge: "4" });
  const [showLevels, setShowLevels] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!storybook) return;
    setForm({
      title: storybook.title,
      childName: storybook.child.displayName,
      birthDate: toDateInput(storybook.child.birthDate),
      growWithChild: storybook.growWithChild,
      readerAgeBand: normalizeStage(storybook.readerAgeBand),
      vambieNameAge: String(storybook.vambieNameAge),
    });
    setShowLevels(!storybook.growWithChild);
  }, [storybook]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  };

  const expecting = storybook?.child.stage === "expecting";
  const age = expecting ? null : ageInYears(form.birthDate || null);
  const current = form.growWithChild ? stageForAge(age) : form.readerAgeBand;
  const nameNow = useMemo(() => (age !== null && age >= Number(form.vambieNameAge) ? "Vambie" : "Baby Vambie"), [age, form.vambieNameAge]);

  const save = async () => {
    setError(null);
    try {
      await apiSend(`/api/storybooks/${id}/settings`, "PUT", {
        title: form.title,
        childName: form.childName,
        ...(form.birthDate ? { birthDate: form.birthDate } : {}),
        growWithChild: form.growWithChild,
        readerAgeBand: form.readerAgeBand,
        vambieNameAge: Number(form.vambieNameAge),
      });
      setSaved(true);
      reload(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
    }
  };

  if (status === "denied") return <AccessDenied />;
  if (!storybook) return <Loading />;
  const name = form.childName.trim() || storybook.child.displayName;

  return (
    <div className="page">
      <TopBar back={`/storybooks/${id}/settings`} wordmark />
      <Masthead title={<>Let their<br />story grow.</>} style={{ paddingTop: 0, paddingRight: 140 }} />
      <Sheet peek="peek" grow>
        <Field label="Storybook title" htmlFor="title">
          <input id="title" className="input" value={form.title} onChange={(e) => set("title", e.target.value)} />
        </Field>
        <Field label="Child's name or nickname" htmlFor="childName">
          <input id="childName" className="input" value={form.childName} onChange={(e) => set("childName", e.target.value)} />
        </Field>
        {!expecting && (
          <Field label="Date of birth" htmlFor="birthDate">
            <span className="input-icon">
              <input id="birthDate" type="date" className="input" value={form.birthDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => set("birthDate", e.target.value)} />
              <span className="input-icon__icon">
                <IconCalendar size={24} />
              </span>
            </span>
          </Field>
        )}

        <div className="field">
          <span className="field__label field__label--strong">How should the stories read?</span>
          <RadioCard
            on={form.growWithChild}
            onClick={() => set("growWithChild", true)}
            title={`Grow with ${name}`}
            badge={<span className="badge badge--lavender badge--sm">Automatic</span>}
            sub={`Stories gently grow in length, language and themes as ${name} gets older.`}
          />
          {form.growWithChild && (
            <div className="kv-row card card--white" style={{ marginTop: 10, padding: "12px 16px" }}>
              <span className="t-small t-muted">Current stage</span>
              <span className="h-title h-title--sm" style={{ fontSize: 19 }}>
                {stageInfo(current).label} · ages {stageInfo(current).ages}
              </span>
            </div>
          )}
          {showLevels ? (
            <div style={{ marginTop: 10 }}>
              {READING_STAGES.map((s) => (
                <RadioCard
                  key={s.key}
                  on={!form.growWithChild && form.readerAgeBand === s.key}
                  onClick={() => setForm((f) => ({ ...f, growWithChild: false, readerAgeBand: s.key }))}
                  title={s.label}
                  sub={`Ages ${s.ages} · ${s.summary}`}
                />
              ))}
            </div>
          ) : (
            <button type="button" className="radio-card" style={{ marginTop: 10, justifyContent: "space-between", alignItems: "center", borderColor: "var(--purple)" }} onClick={() => setShowLevels(true)}>
              <span className="radio-card__title" style={{ fontSize: 20 }}>Choose a fixed reading level</span>
              <IconChevronDown size={22} />
            </button>
          )}
          <p className="field__hint">Choose who you're reading to, even if {name} is still a baby.</p>
        </div>

        <Field label="When does Baby Vambie become just “Vambie”?" htmlFor="nameAge" hint={`Right now he's called ${nameNow}. Chapters keep the name they were written with.`}>
          <Select id="nameAge" value={form.vambieNameAge} onChange={(v) => set("vambieNameAge", v)} options={NAME_AGES} />
        </Field>

        <Field label="Story language" htmlFor="language" hint="More languages are on the way.">
          <Select id="language" value="English" onChange={() => undefined} options={["English"]} disabled />
        </Field>

        <Note kind="info" style={{ marginTop: 18 }}>Only new chapters adapt. Existing chapters stay just as you remember them.</Note>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn--lime btn--caps" style={{ marginTop: 18 }} onClick={() => void save()}>
          {saved ? "Saved" : "Save changes"} <Chev />
        </button>
      </Sheet>
    </div>
  );
}
