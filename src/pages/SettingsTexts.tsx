import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import { Loading, Masthead, Note, Select, Sheet, Switch } from "../components/ui";
import { apiGet, apiSend, ApiError } from "../lib/api";
import { formatClock } from "../lib/format";
import { reminderSummary } from "./Settings";
import type { TextPrefs, TextSettingsView } from "../types";

// Text messages (VSB-138): which texts someone gets, and quiet hours. Signed in
// it's under Settings; the link in texts (<subscription_preferences>) opens it
// at /t/<key> without signing in. Every change saves as it's made.

const TIMES = Array.from({ length: 48 }, (_, i) => {
  const value = `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`;
  return { value, label: formatClock(value) };
});

function PrefRow({ title, sub, checked, onChange }: { title: string; sub?: React.ReactNode; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="text-pref">
      <span className="text-pref__text">
        <span className="text-pref__title">{title}</span>
        {sub && <span className="text-pref__sub">{sub}</span>}
      </span>
      <Switch checked={checked} onChange={onChange} label={title} />
    </div>
  );
}

export function SettingsTextsSignedIn() {
  const { id } = useParams();
  return <TextSettings api="/api/me/texts" back={`/storybooks/${id}/settings`} />;
}

export function SettingsTextsByLink() {
  const { key } = useParams();
  return <TextSettings api={`/api/texts/${encodeURIComponent(key ?? "")}`} viaLink />;
}

function TextSettings({ api, back, viaLink }: { api: string; back?: string; viaLink?: boolean }) {
  const [view, setView] = useState<TextSettingsView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<"" | "saving" | "saved">("");
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    apiGet(api)
      .then(setView)
      .catch((err) => setLoadError(err instanceof ApiError ? err.message : "Couldn't load your texts. Try again."));
  }, [api]);

  const save = async (patch: Record<string, unknown>, optimistic: TextSettingsView) => {
    const before = view;
    const call = ++latest.current;
    setView(optimistic);
    setStatus("saving");
    setError(null);
    try {
      const next = await apiSend(api, "PUT", patch);
      if (call === latest.current) {
        setView(next);
        setStatus("saved");
        window.setTimeout(() => call === latest.current && setStatus(""), 1800);
      }
    } catch (err) {
      if (call === latest.current) {
        setView(before);
        setStatus("");
        setError(err instanceof ApiError ? err.message : "Couldn't save. Try again.");
      }
    }
  };

  const setPref = <K extends keyof TextPrefs>(key: K, value: TextPrefs[K]) =>
    view && save({ [key]: value }, { ...view, prefs: { ...view.prefs, [key]: value } });

  const setReminder = (storybookId: string, on: boolean) =>
    view &&
    save(
      { reminders: { storybookId, on } },
      { ...view, reminders: view.reminders.map((r) => (r.storybookId === storybookId ? { ...r, remindersPaused: !on } : r)) }
    );

  if (loadError)
    return (
      <div className="page">
        <TopBar back={back} wordmark />
        <Masthead title={<>Your texts.</>} style={{ paddingTop: 0 }} />
        <Sheet grow>
          <Note kind="warn">{loadError}</Note>
          {viaLink && (
            <Link className="btn btn--lime btn--caps" to="/sign-in" style={{ marginTop: 16 }}>
              Sign in
            </Link>
          )}
        </Sheet>
      </div>
    );
  if (!view) return <Loading />;

  const p = view.prefs;
  const on = !p.textsPaused;
  const timeRow = (label: string, id: string, control: React.ReactNode) => (
    <div className="field kv-row">
      <label className="field__label" htmlFor={id} style={{ margin: 0 }}>
        {label}
      </label>
      <div style={{ width: "58%" }}>{control}</div>
    </div>
  );

  return (
    <div className="page">
      <TopBar back={back} wordmark />
      <Masthead title={<>Texts when<br />you want them.</>} style={{ paddingTop: 0 }} />
      <Sheet grow>
        {view.optedOut && (
          <Note kind="warn" title="Your phone is blocking our texts" style={{ marginBottom: 16 }}>
            You replied STOP, so no texts can reach you. Reply START to any Vambie text to turn them back on.
          </Note>
        )}
        <div className="toggle-row">
          <span className="text-pref__text">
            <span className="h-title" style={{ fontSize: 24 }}>Texts from Vambie</span>
            {view.phone && <span className="text-pref__sub">To {view.phone}</span>}
          </span>
          <Switch checked={on} onChange={(v) => setPref("textsPaused", !v)} label="Texts from Vambie" />
        </div>

        {on ? (
          <>
            <hr className="divider" />
            <p className="h-section">Text me when</p>
            <PrefRow
              title="A new chapter or page"
              sub="A chapter goes into the book, or your words become a page"
              checked={p.textNewChapters}
              onChange={(v) => setPref("textNewChapters", v)}
            />
            <PrefRow
              title="Family sends me something"
              sub="A chapter or a question someone picks for you"
              checked={p.textFromFamily}
              onChange={(v) => setPref("textFromFamily", v)}
            />
            {view.parent && (
              <PrefRow
                title="Someone joins the family"
                sub="Or asks for a new invitation link"
                checked={p.textFamilyNews}
                onChange={(v) => setPref("textFamilyNews", v)}
              />
            )}
            <PrefRow
              title="Something needs a fix"
              sub="A picture that didn't finish, or a memory we couldn't hear"
              checked={p.textFixes}
              onChange={(v) => setPref("textFixes", v)}
            />
            {view.reminders.map((r) => (
              <PrefRow
                key={r.storybookId}
                title={view.reminders.length > 1 && r.childName ? `Memory reminders · ${r.childName}` : "Memory reminders"}
                sub={
                  r.remindersPaused ? undefined : (
                    <>
                      {reminderSummary(r)} ·{" "}
                      <Link to={`/storybooks/${r.storybookId}/settings/reminders`} className="text-pref__link">
                        Change
                      </Link>
                    </>
                  )
                }
                checked={!r.remindersPaused}
                onChange={(v) => setReminder(r.storybookId, v)}
              />
            ))}

            <hr className="divider" />
            <p className="h-section">Quiet hours</p>
            <PrefRow
              title="Hold texts overnight"
              sub="Texts that come at night wait until morning."
              checked={p.quietHours}
              onChange={(v) => setPref("quietHours", v)}
            />
            {p.quietHours && (
              <>
                {timeRow("From", "quiet-start", <Select id="quiet-start" value={p.quietStart} onChange={(v) => setPref("quietStart", v)} options={TIMES} />)}
                {timeRow("Until", "quiet-end", <Select id="quiet-end" value={p.quietEnd} onChange={(v) => setPref("quietEnd", v)} options={TIMES} />)}
                {timeRow("Time zone", "quiet-tz", <Select id="quiet-tz" value={p.textTimezone} onChange={(v) => setPref("textTimezone", v)} options={view.timezones} />)}
                {view.parent && <p className="field__hint">Memory reminders still come at the time you picked.</p>}
              </>
            )}
          </>
        ) : (
          <Note kind="info" style={{ marginTop: 16 }}>
            We won't text you. You can still read and record anytime in the app.
          </Note>
        )}

        <p className="t-small t-muted" style={{ marginTop: 20 }}>
          Always sent: sign-in codes, and downloads you ask for.
        </p>
        {error && <p className="error-text">{error}</p>}
        <p className={`text-pref__status ${status === "saved" ? "text-pref__status--on" : ""}`} role="status" aria-live="polite">
          {status === "saved" ? "Saved" : ""}
        </p>
      </Sheet>
    </div>
  );
}
