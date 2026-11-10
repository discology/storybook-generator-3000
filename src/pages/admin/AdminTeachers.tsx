import { useCallback, useEffect, useState } from "react";
import { apiGet, apiSend, ApiError } from "../../lib/api";

// Teachers for lesson stories (VSB-147). Before a lesson story is planned, the
// active teacher whose ideas fit best replies to Baby Vambie; the story is
// planned from that reply. Families never see who.

interface Teacher {
  id: string;
  name: string;
  ideas: string;
  voice: string;
  never: string;
  bestFor: string;
  status: "draft" | "active" | "retired";
  version: number;
}

const STATUS_PILL: Record<Teacher["status"], string> = { active: "pill good", draft: "pill warn", retired: "pill dark" };
const EMPTY = { name: "", ideas: "", voice: "", never: "", bestFor: "" };

export default function AdminTeachers() {
  const [teachers, setTeachers] = useState<Teacher[] | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => apiGet("/api/admin/teachers").then((d) => setTeachers(d.teachers)), []);
  useEffect(() => void load(), [load]);

  const save = async (id: string | null, body: Partial<Teacher>) => {
    setError(null);
    try {
      await apiSend(id ? `/api/admin/teachers/${id}` : "/api/admin/teachers", id ? "PUT" : "POST", body);
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save the teacher.");
    }
  };

  if (!teachers) return <p>Loading…</p>;
  const active = teachers.filter((t) => t.status === "active").length;

  return (
    <div>
      <div className="row inline" style={{ justifyContent: "space-between", marginTop: 0 }}>
        <div>
          <h1 className="display" style={{ color: "var(--ink)", fontSize: "2rem" }}>
            Teachers
          </h1>
          <p style={{ color: "var(--ink-soft)", marginTop: 0, maxWidth: 720 }}>
            For lesson stories. Before one is planned, the active teacher whose ideas fit the lesson best replies to Baby Vambie and names the lesson underneath; the story is built from that reply. Families never see a teacher's name, only the lesson in plain words on the grown-ups page.
          </p>
        </div>
        {editing !== "new" && (
          <button className="btn-primary chevron" style={{ width: "auto" }} onClick={() => setEditing("new")}>
            New teacher
          </button>
        )}
      </div>
      {active === 0 && <p className="status-line">No teacher is active, so lesson stories use the Lesson stories rules alone. Turn a teacher on to use them.</p>}
      {error && (
        <p className="status-line" style={{ color: "#d94c4c" }}>
          {error}
        </p>
      )}
      {editing === "new" && <TeacherForm teacher={EMPTY} onSave={(body) => void save(null, body)} onCancel={() => setEditing(null)} />}

      {teachers.map((t) =>
        editing === t.id ? (
          <TeacherForm key={t.id} teacher={t} onSave={(body) => void save(t.id, body)} onCancel={() => setEditing(null)} />
        ) : (
          <div key={t.id} className="card">
            <div className="row inline" style={{ justifyContent: "space-between", marginTop: 0 }}>
              <h3 style={{ margin: 0 }}>
                {t.name} <span className={STATUS_PILL[t.status]}>{t.status}</span>
              </h3>
              <div className="row inline" style={{ gap: 8, marginTop: 0 }}>
                {t.status !== "active" && (
                  <button className="btn-small btn-primary" onClick={() => void save(t.id, { status: "active" })}>
                    Turn on
                  </button>
                )}
                {t.status === "active" && (
                  <button className="btn-small btn-secondary" onClick={() => void save(t.id, { status: "draft" })}>
                    Back to draft
                  </button>
                )}
                {t.status !== "retired" && (
                  <button className="btn-small btn-secondary" onClick={() => void save(t.id, { status: "retired" })}>
                    Retire
                  </button>
                )}
                <button className="btn-small btn-secondary" onClick={() => setEditing(t.id)}>
                  Edit
                </button>
              </div>
            </div>
            <p style={{ margin: "10px 0 4px" }}>
              <strong>Ideas:</strong> {t.ideas}
            </p>
            <p style={{ margin: "4px 0" }}>
              <strong>To a small child:</strong> {t.voice}
            </p>
            {t.never && (
              <p style={{ margin: "4px 0" }}>
                <strong>Never:</strong> {t.never}
              </p>
            )}
            {t.bestFor && (
              <p style={{ margin: "4px 0" }}>
                <strong>Best for:</strong> {t.bestFor}
              </p>
            )}
            <p className="status-line">Version {t.version}. Chapters keep the version they were made with.</p>
          </div>
        )
      )}
    </div>
  );
}

function TeacherForm({ teacher, onSave, onCancel }: { teacher: typeof EMPTY; onSave: (body: typeof EMPTY) => void; onCancel: () => void }) {
  const [form, setForm] = useState({ name: teacher.name, ideas: teacher.ideas, voice: teacher.voice, never: teacher.never, bestFor: teacher.bestFor });
  const field = (key: keyof typeof form, label: string, hint: string, rows = 3) => (
    <div style={{ marginTop: 10 }}>
      <label htmlFor={`teacher-${key}`}>{label}</label>
      {rows === 1 ? (
        <input id={`teacher-${key}`} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
      ) : (
        <textarea id={`teacher-${key}`} rows={rows} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
      )}
      <p className="status-line" style={{ marginTop: 4 }}>
        {hint}
      </p>
    </div>
  );
  return (
    <div className="card">
      <h3 style={{ marginTop: 0 }}>{teacher.name || "New teacher"}</h3>
      {field("name", "Name", "Used only inside the app. Families never see it.", 1)}
      {field("ideas", "Their core ideas", "A few lines in your own words, from their public teachings. No quotes.")}
      {field("voice", "How they'd speak to a small child", "The tone and the kind of picture they'd use.")}
      {field("never", "What they'd never do", "Optional.", 2)}
      {field("bestFor", "Lessons they suit best", "Optional. Helps the AI pick.", 2)}
      <div className="row inline">
        <button className="btn-primary" style={{ width: "auto" }} disabled={!form.name.trim() || !form.ideas.trim() || !form.voice.trim()} onClick={() => onSave(form)}>
          Save
        </button>
        <button className="btn-secondary" style={{ width: "auto" }} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}
