import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import { apiSend } from "../lib/api";
import { useStorybookData } from "../hooks/useStorybookData";

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function SettingsReminders() {
  const { id } = useParams();
  const { storybook, status } = useStorybookData(id);
  const [form, setForm] = useState({
    reminderFrequency: "weekly",
    reminderDay: "Sunday",
    reminderTime: "19:00",
    reminderTimezone: "Pacific Time",
    reminderChannel: "SMS",
    remindersPaused: false,
  });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (storybook) {
      setForm({
        reminderFrequency: storybook.reminderFrequency,
        reminderDay: storybook.reminderDay,
        reminderTime: storybook.reminderTime,
        reminderTimezone: storybook.reminderTimezone,
        reminderChannel: storybook.reminderChannel,
        remindersPaused: storybook.remindersPaused,
      });
    }
  }, [storybook]);

  const save = async () => {
    await apiSend(`/api/storybooks/${id}/settings`, "PUT", form);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  if (status === "loading" || !storybook) return <p className="status-line screen-pad">Loading…</p>;

  return (
    <div>
      <TopBar backTo={`/storybooks/${id}/settings`} backLabel="Settings" />
      <div className="hero" style={{ paddingTop: 0 }}>
        <h1 className="display">Your pace. Your moments.</h1>
      </div>
      <div className="screen-pad">
        <div className="card">
          <div className="checkbox-row">
            <input
              type="checkbox"
              id="remindersOn"
              checked={!form.remindersPaused}
              onChange={(e) => setForm((f) => ({ ...f, remindersPaused: !e.target.checked }))}
            />
            <label htmlFor="remindersOn" style={{ margin: 0 }}>
              Memory reminders
            </label>
          </div>

          <label>Frequency</label>
          <div className="row inline">
            <button
              type="button"
              className={form.reminderFrequency === "weekly" ? "btn-primary" : "btn-secondary"}
              style={{ width: "auto" }}
              onClick={() => setForm((f) => ({ ...f, reminderFrequency: "weekly" }))}
            >
              Weekly
            </button>
            <button
              type="button"
              className={form.reminderFrequency === "daily" ? "btn-primary" : "btn-secondary"}
              style={{ width: "auto" }}
              onClick={() => setForm((f) => ({ ...f, reminderFrequency: "daily" }))}
            >
              Daily
            </button>
          </div>

          {form.reminderFrequency === "weekly" && (
            <>
              <label htmlFor="day">Day</label>
              <select id="day" value={form.reminderDay} onChange={(e) => setForm((f) => ({ ...f, reminderDay: e.target.value }))}>
                {DAYS.map((d) => (
                  <option key={d}>{d}</option>
                ))}
              </select>
            </>
          )}

          <label htmlFor="time">Time</label>
          <input id="time" type="time" value={form.reminderTime} onChange={(e) => setForm((f) => ({ ...f, reminderTime: e.target.value }))} />

          <label htmlFor="tz">Timezone</label>
          <select id="tz" value={form.reminderTimezone} onChange={(e) => setForm((f) => ({ ...f, reminderTimezone: e.target.value }))}>
            <option>Pacific Time</option>
            <option>Mountain Time</option>
            <option>Central Time</option>
            <option>Eastern Time</option>
          </select>

          <label htmlFor="channel">Delivery</label>
          <select id="channel" value={form.reminderChannel} onChange={(e) => setForm((f) => ({ ...f, reminderChannel: e.target.value }))}>
            <option>SMS</option>
            <option>Email</option>
          </select>
          <p className="status-line">
            Dev mode: no Twilio/email provider configured yet — reminders won't actually send until one is connected.
          </p>

          <button className="btn-primary chevron" onClick={save}>
            {saved ? "Saved" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
