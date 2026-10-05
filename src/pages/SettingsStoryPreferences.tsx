import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import { apiSend } from "../lib/api";
import { useStorybookData } from "../hooks/useStorybookData";

const READER_LEVELS = [
  { value: "0-3", label: "Simple & short", sub: "Ages 0-3" },
  { value: "4-7", label: "A little more adventure", sub: "Ages 4-7" },
  { value: "8-12", label: "Longer stories", sub: "Ages 8-12" },
];

export default function SettingsStoryPreferences() {
  const { id } = useParams();
  const { storybook, status, reload } = useStorybookData(id);
  const [form, setForm] = useState({ title: "", readerAgeBand: "0-3", growWithChild: true, language: "English" });
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (storybook) {
      setForm({
        title: storybook.title,
        readerAgeBand: storybook.readerAgeBand,
        growWithChild: storybook.growWithChild,
        language: storybook.language,
      });
    }
  }, [storybook]);

  const save = async () => {
    await apiSend(`/api/storybooks/${id}/settings`, "PUT", form);
    setSaved(true);
    reload();
    setTimeout(() => setSaved(false), 2000);
  };

  if (status === "loading" || !storybook) return <p className="status-line screen-pad">Loading…</p>;

  return (
    <div>
      <TopBar backTo={`/storybooks/${id}/settings`} backLabel="Settings" />
      <div className="hero" style={{ paddingTop: 0 }}>
        <h1 className="display">Let their story grow.</h1>
      </div>
      <div className="screen-pad">
        <div className="card">
          <label htmlFor="title">Storybook title</label>
          <input id="title" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />

          <label>How should the stories read?</label>
          <div
            className={form.growWithChild ? "card dark" : "card dark"}
            style={{ padding: "0.9rem", cursor: "pointer", border: form.growWithChild ? "2px solid var(--purple-light)" : undefined }}
            onClick={() => setForm((f) => ({ ...f, growWithChild: true }))}
          >
            <div className="row inline" style={{ marginTop: 0, justifyContent: "space-between" }}>
              <strong>Grow with {storybook.child.displayName}</strong>
              <span className="pill dark">Automatic</span>
            </div>
            <p className="status-line">Stories gently grow in length, language and themes as they get older.</p>
          </div>

          {READER_LEVELS.map((lvl) => (
            <div
              key={lvl.value}
              className="card dark"
              style={{
                padding: "0.9rem",
                marginTop: "0.6rem",
                cursor: "pointer",
                border: !form.growWithChild && form.readerAgeBand === lvl.value ? "2px solid var(--purple-light)" : undefined,
              }}
              onClick={() => setForm((f) => ({ ...f, growWithChild: false, readerAgeBand: lvl.value }))}
            >
              <strong>{lvl.label}</strong>
              <div className="status-line">{lvl.sub}</div>
            </div>
          ))}

          <label htmlFor="language">Story language</label>
          <select id="language" value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}>
            <option>English</option>
            <option>Spanish</option>
            <option>French</option>
          </select>

          <div className="banner info">Changes apply to future chapters. Existing chapters stay as they are.</div>

          <button className="btn-primary chevron" onClick={save}>
            {saved ? "Saved" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
