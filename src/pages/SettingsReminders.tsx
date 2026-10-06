import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import AccessDenied from "../components/AccessDenied";
import { IconHold } from "../components/icons";
import { Chev, Loading, Masthead, Note, Segmented, Select, Sheet, Switch } from "../components/ui";
import { useStorybookData } from "../hooks/useStorybookData";
import { apiSend, ApiError } from "../lib/api";
import { formatClock, formatDate } from "../lib/format";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIMEZONES = ["Pacific Time", "Mountain Time", "Central Time", "Eastern Time", "Alaska Time", "Hawaii Time"];
const TIMES = Array.from({ length: 33 }, (_, i) => {
  const minutes = 6 * 60 + i * 30;
  const value = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return { value, label: formatClock(value) };
});
const TWO_WEEKS = 14 * 86400000;

export default function SettingsReminders() {
  const { id } = useParams();
  const { storybook, status, reload } = useStorybookData(id);
  const [form, setForm] = useState({
    enabled: true,
    reminderFrequency: "weekly",
    reminderDay: "Sunday",
    reminderTime: "19:00",
    reminderTimezone: "Pacific Time",
    remindersPausedUntil: null as string | null,
  });
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!storybook) return;
    setForm({
      enabled: !storybook.remindersPaused,
      reminderFrequency: storybook.reminderFrequency,
      reminderDay: storybook.reminderDay,
      reminderTime: storybook.reminderTime,
      reminderTimezone: storybook.reminderTimezone,
      remindersPausedUntil: storybook.remindersPausedUntil && new Date(storybook.remindersPausedUntil) > new Date() ? storybook.remindersPausedUntil : null,
    });
  }, [storybook]);

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) => {
    setSaved(false);
    setForm((f) => ({ ...f, [key]: value }));
  };

  const save = async (override?: Partial<typeof form>) => {
    const next = { ...form, ...override };
    setError(null);
    try {
      await apiSend(`/api/storybooks/${id}/settings`, "PUT", {
        remindersPaused: !next.enabled,
        reminderFrequency: next.reminderFrequency,
        reminderDay: next.reminderDay,
        reminderTime: next.reminderTime,
        reminderTimezone: next.reminderTimezone,
        reminderChannel: "SMS",
        remindersPausedUntil: next.remindersPausedUntil,
      });
      setSaved(true);
      reload(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
    }
  };

  const pause = () => {
    const until = form.remindersPausedUntil ? null : new Date(Date.now() + TWO_WEEKS).toISOString();
    set("remindersPausedUntil", until);
    void save({ remindersPausedUntil: until });
  };

  if (status === "denied") return <AccessDenied />;
  if (!storybook) return <Loading />;

  const chapterDay = DAYS[(DAYS.indexOf(form.reminderDay) + 1) % 7];
  const row = (label: string, idAttr: string, control: React.ReactNode) => (
    <div className="field kv-row">
      <label className="field__label" htmlFor={idAttr} style={{ margin: 0 }}>
        {label}
      </label>
      <div style={{ width: "58%" }}>{control}</div>
    </div>
  );

  return (
    <div className="page">
      <TopBar back={`/storybooks/${id}/settings`} wordmark />
      <Masthead title={<>Your pace.<br />Your moments.</>} style={{ paddingTop: 0, paddingRight: 140 }} />
      <Sheet peek="peek" grow>
        <div className="toggle-row">
          <span className="h-title" style={{ fontSize: 24 }}>Memory reminders</span>
          <Switch checked={form.enabled} onChange={(v) => set("enabled", v)} label="Memory reminders" />
        </div>
        {form.enabled && (
          <>
            <div className="field" style={{ marginTop: 18 }}>
              <span className="field__label">Frequency</span>
              <Segmented
                value={form.reminderFrequency as "weekly" | "daily"}
                onChange={(v) => set("reminderFrequency", v)}
                options={[
                  { value: "weekly", label: "Weekly" },
                  { value: "daily", label: "Daily" },
                ]}
              />
            </div>
            {form.reminderFrequency === "weekly" && row("Day", "day", <Select id="day" value={form.reminderDay} onChange={(v) => set("reminderDay", v)} options={DAYS} />)}
            {row("Time", "time", <Select id="time" value={form.reminderTime} onChange={(v) => set("reminderTime", v)} options={TIMES} />)}
            {row("Timezone", "tz", <Select id="tz" value={form.reminderTimezone} onChange={(v) => set("reminderTimezone", v)} options={TIMEZONES} />)}
            {row("Delivery", "delivery", <Select id="delivery" value="SMS" onChange={() => undefined} options={["SMS"]} />)}
            <hr className="divider" />
            <p className="h-section">Need a break?</p>
            <button className="btn btn--outline-purple" style={{ marginTop: 10 }} onClick={pause}>
              <IconHold size={20} /> {form.remindersPausedUntil ? `Paused until ${formatDate(form.remindersPausedUntil, { month: "short", day: "numeric" })} · Resume now` : "Pause for 2 weeks"}
            </button>
            <p className="t-center t-small t-muted" style={{ marginTop: 8 }}>You can still record anytime.</p>
          </>
        )}
        <Note kind="info" style={{ marginTop: 16 }}>
          Each week's memories become a new chapter on {chapterDay} morning{form.enabled ? ", after your reminder" : ""}.
        </Note>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn--lime btn--caps" style={{ marginTop: 18 }} onClick={() => void save()}>
          {saved ? "Saved" : "Save changes"} <Chev />
        </button>
        <p className="t-center t-small t-muted" style={{ marginTop: 10 }}>Chapter-ready alerts are managed separately.</p>
      </Sheet>
    </div>
  );
}
