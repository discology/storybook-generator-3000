import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import Vambie from "../components/Vambie";
import { useAuth } from "../auth/AuthContext";
import type { StorybookSummary } from "../types";
import { RELATIONSHIPS } from "../lib/relationships";

const emptyForm = {
  childName: "",
  stage: "born",
  birthDate: "",
  dueDate: "",
  readerAgeBand: "0-3",
  parentName: "",
  parentPhone: "",
  relationship: "Parent",
};

export default function Home() {
  const { user, loading: authLoading } = useAuth();
  const [storybooks, setStorybooks] = useState<StorybookSummary[] | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const load = () => {
    if (!user) return;
    fetch("/api/storybooks")
      .then((res) => (res.ok ? res.json() : []))
      .then(setStorybooks);
  };

  useEffect(load, [user]);

  useEffect(() => {
    if (user && params.get("start") === "1") setShowForm(true);
  }, [user, params]);

  useEffect(() => {
    if (showForm && user?.phone) setForm((f) => (f.parentPhone ? f : { ...f, parentPhone: user.phone! }));
  }, [showForm, user]);

  const startClicked = () => {
    if (!user) {
      navigate(`/sign-in?next=${encodeURIComponent("/?start=1")}`);
      return;
    }
    setShowForm(true);
  };

  const field = (key: keyof typeof emptyForm) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      const res = await fetch("/api/storybooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Something went wrong. Try again.");
        return;
      }
      navigate(`/storybooks/${data.storybook.id}`);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div>
      <TopBar wordmark menuTo="/account" />

      {!showForm && (
        <div className="hero">
          <div className="hero-mascot-stage">
            <Vambie mood="happy" size={110} />
            <h1 className="display" style={{ fontSize: "2.3rem" }}>
              Little moments.
              <br />A story for life.
            </h1>
            <p className="subtitle" style={{ marginBottom: 0 }}>
              Your voice. Their childhood. One growing Vambie storybook.
            </p>
          </div>
          <button className="btn-primary chevron" onClick={startClicked} disabled={authLoading}>
            Start their story
          </button>
        </div>
      )}

      {showForm && (
        <div className="screen-pad">
          <form className="card" onSubmit={submit}>
            <h2 style={{ marginTop: 0 }}>Who is this story for?</h2>
            <p className="status-line">This is their story. The parent supplies the memory — we do the rest.</p>

            <label htmlFor="childName">Child's name or nickname</label>
            <input id="childName" required {...field("childName")} placeholder="e.g. Mia" />

            <label>Is your little one...</label>
            <div className="row inline">
              <button
                type="button"
                className={form.stage === "born" ? "btn-primary" : "btn-secondary"}
                style={{ width: "auto" }}
                onClick={() => setForm((f) => ({ ...f, stage: "born" }))}
              >
                Already here
              </button>
              <button
                type="button"
                className={form.stage === "expecting" ? "btn-primary" : "btn-secondary"}
                style={{ width: "auto" }}
                onClick={() => setForm((f) => ({ ...f, stage: "expecting" }))}
              >
                On the way
              </button>
            </div>

            {form.stage === "born" ? (
              <>
                <label htmlFor="birthDate">Date of birth</label>
                <input id="birthDate" type="date" {...field("birthDate")} />
              </>
            ) : (
              <>
                <label htmlFor="dueDate">Due date</label>
                <input id="dueDate" type="date" {...field("dueDate")} />
              </>
            )}

            <label htmlFor="readerAgeBand">How should the stories read?</label>
            <select id="readerAgeBand" {...field("readerAgeBand")}>
              <option value="0-3">Simple & short · Ages 0-3</option>
              <option value="4-7">A little more adventure · Ages 4-7</option>
              <option value="8-12">Longer stories · Ages 8-12</option>
            </select>

            <label htmlFor="parentName">Your name</label>
            <input id="parentName" required {...field("parentName")} placeholder="e.g. Jordan" />

            <label htmlFor="relationship">Your relationship to them</label>
            <select id="relationship" required {...field("relationship")}>
              {RELATIONSHIPS.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>

            <label htmlFor="parentPhone">Mobile number</label>
            <input id="parentPhone" type="tel" required {...field("parentPhone")} placeholder="e.g. +1 555 123 4567" />
            <p className="status-line">We text your reminder links here.</p>

            {error && <p className="status-line" style={{ color: "#d94c4c" }}>{error}</p>}

            <div className="row">
              <button className="btn-primary chevron" type="submit" disabled={creating}>
                {creating ? "Creating…" : "Continue"}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setShowForm(false)}>
                Back
              </button>
            </div>
          </form>
        </div>
      )}

      {storybooks && storybooks.length > 0 && (
        <div className="screen-pad">
          <h2>Storybooks</h2>
          <div className="storybook-grid">
            {storybooks.map((s) => (
              <Link key={s.id} to={`/storybooks/${s.id}`} className="storybook-card" style={{ textDecoration: "none", color: "inherit" }}>
                <strong>{s.title}</strong>
                <div className="status-line">{s.child.displayName}</div>
                <div className="status-line">
                  {s._count.memories} memories · {s._count.chapters} chapters
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
