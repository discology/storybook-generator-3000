import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import { IconMic, IconRefresh, IconSpinner } from "../components/icons";
import { Chev, Field, Loading, Masthead, Note, Segmented, Select, Sheet, Switch } from "../components/ui";
import { useAuth } from "../auth/AuthContext";
import { apiGet, apiSend, ApiError } from "../lib/api";
import { fillPrompt, promptValues } from "../lib/promptVariables";
import { formatClock, possessive } from "../lib/format";
import { RELATIONSHIPS } from "../lib/relationships";
import type { Prompt } from "../types";

// Try before you sign up (server/guests.ts): a few details, one memory, a
// three-page preview of the storybook made from it, then "Save my story".
// Everything stays on this device for 7 days until they verify their number.

interface PreviewPage {
  pageNumber: number;
  text: string;
  pictureSize: string;
  visibleAction: string;
  image: string | null;
}

interface Draft {
  mode: "try" | "invite";
  child: { name: string; stage: string; birthDate: string | null };
  relationship: string | null;
  invite: { invitedBy: string | null; childName: string } | null;
  expiresAt: string;
  memory: { status: "processing" | "ready" | "failed"; kind: "audio" | "typed"; title: string | null; error: string | null } | null;
  preview: { status: "none" | "writing" | "drawing" | "ready" | "failed"; title?: string; totalPages?: number; pages?: PreviewPage[]; error?: string };
  limits: { canPreview: boolean; reason: "used" | "busy" | null; left: number };
}

const MAX_SECONDS = 5 * 60;
const KEEP_NOTE = "Saved on this device for 7 days. Verify your number to keep it.";

const pickMimeType = () => {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((c) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) ?? "";
};
const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

export default function TryStory() {
  const [params] = useSearchParams();
  const invite = params.get("invite");
  const [draft, setDraft] = useState<Draft | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user } = useAuth();

  const load = useCallback(
    () =>
      apiGet("/api/guest")
        .then((d: Draft) => setDraft(d))
        .catch((e: ApiError) => (e.status === 404 ? setDraft(null) : setError("We couldn't reach Vambie. Check your connection."))),
    []
  );

  // A relative's invite link starts (or resumes) a draft for that family's child.
  useEffect(() => {
    if (invite) {
      apiSend(`/api/guest/invite/${invite}`, "POST")
        .then(load)
        .catch((e: ApiError) => setError(e.status === 410 ? "This invitation has expired. Ask the family for a new link." : "This invitation link doesn't work."));
    } else void load();
  }, [invite, load]);

  // While the memory or the story is being made, check again every few seconds.
  const busy = draft && (draft.memory?.status === "processing" || draft.preview.status === "writing" || draft.preview.status === "drawing");
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => void load(), 3000);
    return () => clearInterval(t);
  }, [busy, load]);

  // Once the memory is ready, the story starts by itself (within today's limits).
  const started = useRef(false);
  useEffect(() => {
    if (!draft || draft.mode !== "try" || started.current) return;
    if (draft.memory?.status === "ready" && draft.preview.status === "none" && draft.limits.canPreview) {
      started.current = true;
      apiSend("/api/guest/preview", "POST")
        .then(load)
        .catch((e: ApiError) => {
          setError(e.message);
          void load();
        });
    }
  }, [draft, load]);

  const save = () => navigate(user ? "/try/save" : "/sign-in?next=/try/save");

  if (error && !draft) {
    return (
      <Shell>
        <Note kind="warn">{error}</Note>
        <Link className="btn btn--lime" style={{ marginTop: 18 }} to="/try">
          Start your own story <Chev />
        </Link>
      </Shell>
    );
  }
  if (draft === undefined) return <Loading />;
  if (draft === null) return <Details onDone={load} />;
  if (!draft.memory || draft.memory.status === "failed") return <Memory draft={draft} onDone={load} failed={draft.memory?.status === "failed"} />;
  if (draft.memory.status === "processing") return <Working title={<>Listening<br />closely…</>} sub={`Getting ${possessive(draft.child.name)} memory ready.`} />;

  if (draft.mode === "invite") {
    return (
      <Shell title={<>Add it to<br />{possessive(draft.child.name)}<br />storybook.</>}>
        <p className="t-body">
          Your memory{draft.memory.title ? <> “{draft.memory.title}”</> : null} is ready. Verify your number to add it to {possessive(draft.child.name)} storybook
          {draft.invite?.invitedBy ? ` and join ${draft.invite.invitedBy}'s family there` : ""}.
        </p>
        <button className="btn btn--lime btn--caps" style={{ marginTop: 20 }} onClick={save}>
          Add my memory <Chev />
        </button>
        <KeepNote />
      </Shell>
    );
  }

  const p = draft.preview;
  if (p.status === "ready" && p.pages?.length) return <Preview draft={draft} onSave={save} onRetry={() => void apiSend("/api/guest/preview", "POST").then(load).catch((e: ApiError) => setError(e.message))} />;
  if (p.status === "writing" || p.status === "drawing" || (p.status === "none" && draft.limits.canPreview)) {
    return (
      <Working
        title={p.status === "drawing" ? <>Drawing the<br />first pages…</> : <>Writing<br />{possessive(draft.child.name)}<br />story…</>}
        sub="This takes 2 to 3 minutes. You can leave this page open, or come back to it on this device."
      />
    );
  }
  // No preview: today's limit, the daily cap, or a failure. They can still save.
  return (
    <Shell title={<>Save {possessive(draft.child.name)}<br />story.</>}>
      <p className="t-body">
        {p.status === "failed"
          ? "We couldn't make the preview this time."
          : draft.limits.reason === "busy"
            ? "So many families are trying Vambie today that free previews are paused."
            : "You've used today's free preview."}{" "}
        Save your story and we'll make it right away.
      </p>
      {p.status === "failed" && draft.limits.canPreview && (
        <button className="btn btn--outline" style={{ marginTop: 16 }} onClick={() => void apiSend("/api/guest/preview", "POST").then(load)}>
          <IconRefresh size={18} /> Try once more
        </button>
      )}
      <button className="btn btn--lime btn--caps" style={{ marginTop: 16 }} onClick={save}>
        Save my story and text me a link <Chev />
      </button>
      <KeepNote />
    </Shell>
  );
}

function Shell({ title, children }: { title?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="page">
      <TopBar back="/" wordmark />
      {title && <Masthead title={title} style={{ paddingTop: 0 }} />}
      <Sheet grow>{children}</Sheet>
    </div>
  );
}

const KeepNote = () => (
  <p className="t-small t-muted t-center" style={{ marginTop: 16 }}>
    {KEEP_NOTE}
  </p>
);

function Working({ title, sub }: { title: React.ReactNode; sub: string }) {
  return (
    <div className="page">
      <TopBar back="/" wordmark />
      <Masthead title={title} sub={sub} art="open-book" artMode="corner" style={{ paddingTop: 0 }} />
      <Sheet grow>
        <div className="try-working" role="status">
          <IconSpinner size={34} />
          <p className="t-body t-muted">{sub}</p>
        </div>
        <KeepNote />
      </Sheet>
    </div>
  );
}

// --- Step 1: only what the story needs ---

function Details({ onDone }: { onDone: () => void }) {
  const [childName, setChildName] = useState("");
  const [stage, setStage] = useState<"born" | "expecting">("born");
  const [birthDate, setBirthDate] = useState("");
  const [relationship, setRelationship] = useState("Parent");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await apiSend("/api/guest/start", "POST", { childName, stage, birthDate, relationship });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title={<>Start their<br />story.</>}>
      <p className="t-body" style={{ marginTop: 0 }}>
        Just what the story needs. No account yet: you'll see a preview first.
      </p>
      <form onSubmit={(e) => void submit(e)}>
        <Field label="Their name or nickname" htmlFor="child">
          <input id="child" className="input" value={childName} onChange={(e) => setChildName(e.target.value)} maxLength={40} autoComplete="off" placeholder="Mia" />
        </Field>
        <Field label="Are they here yet?">
          <Segmented options={[{ value: "born", label: "Born" }, { value: "expecting", label: "On the way" }]} value={stage} onChange={setStage} />
        </Field>
        {stage === "born" && (
          <Field label="Their birthday" htmlFor="birthday" hint="Stories are written for their age.">
            <input id="birthday" type="date" className="input" value={birthDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setBirthDate(e.target.value)} />
          </Field>
        )}
        <Field label="You are their…" htmlFor="relationship">
          <Select id="relationship" value={relationship} onChange={setRelationship} options={[...RELATIONSHIPS]} />
        </Field>
        {error && <p className="error-text">{error}</p>}
        <button className="btn btn--lime btn--caps" type="submit" style={{ marginTop: 20 }} disabled={busy || !childName.trim()}>
          {busy ? "One moment…" : "Next: a memory"} <Chev />
        </button>
      </form>
      <KeepNote />
    </Shell>
  );
}

// --- Step 2: record or type one memory ---

function Memory({ draft, onDone, failed }: { draft: Draft; onDone: () => void; failed: boolean }) {
  const [prompts, setPrompts] = useState<string[]>([]);
  const [which, setWhich] = useState(0);
  const [mode, setMode] = useState<"record" | "type">("record");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(failed ? "We couldn't make out that recording. Try again, or type it instead." : null);
  const [busy, setBusy] = useState(false);
  const rec = useRecorder();
  const name = draft.child.name;

  useEffect(() => {
    const values = promptValues({
      child: { displayName: name, stage: draft.child.stage, birthDate: draft.child.birthDate },
      me: { name: "", relationship: draft.relationship },
      parentName: null,
    });
    apiGet("/api/prompts?status=published")
      .then((list: Prompt[]) =>
        setPrompts(
          list
            .filter((p) => p.audience === "Everyone" || (p.audience === "Parents" && draft.relationship === "Parent") || (p.audience === "Grandparents" && draft.relationship === "Grandparent"))
            .map((p) => fillPrompt(p.question, values))
        )
      )
      .catch(() => setPrompts([]));
  }, [name, draft.child.stage, draft.child.birthDate, draft.relationship]);

  const question = prompts[which % Math.max(1, prompts.length)] ?? `What's a moment with ${name} you want to remember?`;

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      if (mode === "type") {
        await apiSend("/api/guest/memory", "POST", { text, promptText: question });
      } else if (rec.blob) {
        const body = new FormData();
        body.append("audio", rec.blob, `memory.${rec.blob.type.includes("mp4") ? "m4a" : "webm"}`);
        body.append("durationSec", String(rec.seconds));
        body.append("promptText", question);
        const res = await fetch("/api/guest/memory/audio", { method: "POST", body });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "The recording didn't upload. Try again.");
      }
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title={draft.mode === "invite" ? <>A memory for<br />{possessive(name)}<br />storybook.</> : <>One<br />memory.</>}>
      {draft.invite?.invitedBy && (
        <p className="t-small t-muted" style={{ marginTop: 0 }}>
          {draft.invite.invitedBy} invited you to help write {possessive(name)} storybook. Record first; you'll verify your number after.
        </p>
      )}
      <div className="try-prompt prompt-card prompt-card--purple">
        <span className="prompt-card__q">{question}</span>
        {prompts.length > 1 && (
          <button type="button" className="tlink tlink--light" onClick={() => setWhich((w) => w + 1)}>
            Another question
          </button>
        )}
      </div>

      <Segmented
        options={[
          { value: "record", label: "Record it" },
          { value: "type", label: "Type it" },
        ]}
        value={mode}
        onChange={setMode}
      />

      {mode === "record" ? (
        <div className="try-recorder">
          {rec.state === "idle" && (
            <button type="button" className="btn btn--lime btn--caps" onClick={() => void rec.start()}>
              <IconMic size={20} filled /> Start recording
            </button>
          )}
          {rec.state === "recording" && (
            <>
              <p className="try-clock" aria-live="polite">
                {clock(rec.seconds)} <span className="t-small t-muted">of {clock(MAX_SECONDS)}</span>
              </p>
              <button type="button" className="btn btn--purple btn--caps" onClick={rec.stop}>
                Stop
              </button>
            </>
          )}
          {rec.state === "recorded" && rec.url && (
            <>
              <audio controls src={rec.url} style={{ width: "100%" }} />
              <div className="hstack" style={{ marginTop: 12, gap: 10 }}>
                <button type="button" className="btn btn--outline" onClick={rec.reset}>
                  Record again
                </button>
                <button type="button" className="btn btn--lime" onClick={() => void send()} disabled={busy}>
                  {busy ? "Sending…" : "Use this"} <Chev />
                </button>
              </div>
            </>
          )}
          {rec.error && <p className="error-text">{rec.error}</p>}
          <p className="t-small t-muted">Talk the way you'd tell a friend. A minute or two is plenty (up to 5).</p>
        </div>
      ) : (
        <div className="try-recorder">
          <textarea className="textarea" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} placeholder={`This morning ${name}…`} style={{ minHeight: 150 }} />
          <button type="button" className="btn btn--lime" style={{ marginTop: 12 }} onClick={() => void send()} disabled={busy || text.trim().length < 10}>
            {busy ? "Sending…" : "Use these words"} <Chev />
          </button>
        </div>
      )}
      {error && <p className="error-text">{error}</p>}
      <KeepNote />
    </Shell>
  );
}

function useRecorder() {
  const [state, setState] = useState<"idle" | "recording" | "recorded">("idle");
  const [seconds, setSeconds] = useState(0);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  useEffect(() => () => stop(), [stop]);
  useEffect(() => () => void (url && URL.revokeObjectURL(url)), [url]);
  useEffect(() => {
    if (seconds >= MAX_SECONDS) stop();
  }, [seconds, stop]);

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = pickMimeType();
      const r = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks: Blob[] = [];
      r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      r.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const b = new Blob(chunks, { type: r.mimeType || "audio/webm" });
        setBlob(b);
        setUrl(URL.createObjectURL(b));
        setState("recorded");
      };
      recorder.current = r;
      r.start();
      setSeconds(0);
      setState("recording");
      timer.current = setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch {
      setError("Your browser didn't let Vambie use the microphone. Allow it in your settings, or type the memory instead.");
    }
  };

  const reset = () => {
    setBlob(null);
    setUrl(null);
    setSeconds(0);
    setState("idle");
  };

  return { state, seconds, blob, url, error, start, stop, reset };
}

// --- Step 3: the three-page preview ---

function Preview({ draft, onSave, onRetry }: { draft: Draft; onSave: () => void; onRetry: () => void }) {
  const pages = draft.preview.pages ?? [];
  const more = Math.max(0, (draft.preview.totalPages ?? pages.length) - pages.length);
  const slides = pages.length + 1;
  const track = useRef<HTMLDivElement | null>(null);
  const [index, setIndex] = useState(0);

  const goTo = (i: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: Math.max(0, Math.min(slides - 1, i)) * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="page how">
      <div className="tbar">
        <Link to="/" className="wordmark" style={{ marginLeft: 8 }}>
          Vambie
        </Link>
      </div>
      <p className="try-title">
        <span className="reader__chapter">{possessive(draft.child.name)} storybook</span>
        <span className="try-title__name">{draft.preview.title}</span>
      </p>
      <div
        className="how-track"
        ref={track}
        onScroll={() => track.current && setIndex(Math.round(track.current.scrollLeft / track.current.clientWidth))}
        aria-roledescription="carousel"
        aria-label="Story preview"
      >
        {pages.map((p) => (
          <section key={p.pageNumber} className="how-slide" aria-roledescription="slide" aria-label={`Page ${p.pageNumber}`}>
            <div className="how-paper try-page">
              {p.image && (
                <div className="how-art">
                  <img src={`/${p.image}`} alt={p.visibleAction} />
                </div>
              )}
              <p className="try-page__text">{p.text}</p>
              <span className="try-page__num">{p.pageNumber}</span>
            </div>
          </section>
        ))}
        <section className="how-slide" aria-roledescription="slide" aria-label="Save your story">
          <div className="how-paper try-page try-page--end">
            <h2 className="how-title">{more ? `${more} more pages are waiting` : "Keep this story"}</h2>
            <p className="try-page__text">
              Save {possessive(draft.child.name)} story to read it all, and keep adding memories every week with the family.
            </p>
            <button className="btn btn--lime btn--caps" onClick={onSave}>
              Save my story and text me a link <Chev />
            </button>
            {draft.limits.left > 0 && (
              <button className="tlink" style={{ marginTop: 14 }} onClick={onRetry}>
                Make a different version (once)
              </button>
            )}
          </div>
        </section>
      </div>
      <div className="how-nav">
        <span className="how-btn how-btn--spacer" aria-hidden="true" />
        <div className="how-dots" aria-hidden="true">
          {Array.from({ length: slides }, (_, i) => (
            <span key={i} className={i === index ? "on" : ""} />
          ))}
        </div>
        {index < slides - 1 ? (
          <button type="button" className="how-btn how-btn--next" onClick={() => goTo(index + 1)} aria-label="Next page">
            <Chev size={24} />
          </button>
        ) : (
          <span className="how-btn how-btn--spacer" aria-hidden="true" />
        )}
      </div>
      {index < slides - 1 && (
        <button className="btn btn--lime btn--caps try-save" onClick={onSave}>
          Save my story and text me a link <Chev />
        </button>
      )}
      <p className="how-count">{KEEP_NOTE}</p>
    </div>
  );
}

// --- After verifying: keep everything, then reminders as a separate choice ---

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const TIMES = Array.from({ length: 33 }, (_, i) => {
  const minutes = 6 * 60 + i * 30;
  const value = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return { value, label: formatClock(value) };
});

export function TrySave() {
  const { user, loading, refresh } = useAuth();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [result, setResult] = useState<{ storybookId: string; joined: boolean } | null>(null);
  const [childName, setChildName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [remind, setRemind] = useState(false);
  const [day, setDay] = useState("Sunday");
  const [time, setTime] = useState("19:00");
  const tried = useRef(false);

  const claim = useCallback(
    async (withName?: string) => {
      setBusy(true);
      setError(null);
      try {
        const draft: Draft = await apiGet("/api/guest");
        setChildName(draft.child.name);
        const r = await apiSend("/api/guest/claim", "POST", { name: withName ?? "" });
        refresh();
        setResult(r);
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) setError("This story was already saved, or it's been more than 7 days.");
        else setError(e instanceof ApiError ? e.message : "Something went wrong. Try again.");
      } finally {
        setBusy(false);
      }
    },
    [refresh]
  );

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate("/sign-in?next=/try/save", { replace: true });
      return;
    }
    if (user.name && !tried.current) {
      tried.current = true;
      void claim();
    }
  }, [user, loading, navigate, claim]);

  const finish = async () => {
    if (!result) return;
    if (remind && !result.joined) {
      await apiSend(`/api/storybooks/${result.storybookId}/settings`, "PUT", {
        remindersPaused: false,
        reminderFrequency: "weekly",
        reminderDay: day,
        reminderTime: time,
      }).catch(() => undefined);
    }
    navigate(`/storybooks/${result.storybookId}`, { replace: true });
  };

  if (loading || (busy && !result)) return <Working title={<>Saving<br />your story…</>} sub="Keeping everything you've made." />;

  if (!result) {
    return (
      <Shell title={<>Almost<br />there.</>}>
        {error && <Note kind="warn">{error}</Note>}
        {!user?.name && !error?.includes("already saved") && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) void claim(name.trim());
            }}
          >
            <Field label="What should the family call you?" htmlFor="name">
              <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} placeholder="Rose" autoComplete="given-name" />
            </Field>
            <button className="btn btn--lime btn--caps" type="submit" style={{ marginTop: 18 }} disabled={busy || !name.trim()}>
              Save my story <Chev />
            </button>
          </form>
        )}
        {error?.includes("already saved") && (
          <Link className="btn btn--lime" to="/" style={{ marginTop: 18 }}>
            Go to my storybooks <Chev />
          </Link>
        )}
      </Shell>
    );
  }

  return (
    <Shell title={result.joined ? <>You're<br />in.</> : <>Saved.</>}>
      {result.joined ? (
        <p className="t-body" style={{ marginTop: 0 }}>
          Your memory is in {possessive(childName)} storybook, and you're part of the family there now.
        </p>
      ) : (
        <>
          <p className="t-body" style={{ marginTop: 0 }}>
            {possessive(childName)} storybook is yours. We're drawing the rest of the pages now; open the storybook to see them arrive.
          </p>
          <div className="try-remind">
            <div className="toggle-row">
              <span className="field__label" style={{ margin: 0 }}>
                Text me a weekly reminder to record a memory
              </span>
              <Switch checked={remind} onChange={setRemind} label="Weekly reminder" />
            </div>
            {remind && (
              <div className="form-grid">
                <Field label="Day" htmlFor="day">
                  <Select id="day" value={day} onChange={setDay} options={DAYS} />
                </Field>
                <Field label="Time" htmlFor="time">
                  <Select id="time" value={time} onChange={setTime} options={TIMES} />
                </Field>
              </div>
            )}
            <p className="t-small t-muted" style={{ margin: "10px 0 0" }}>
              Optional. You can change it any time in Settings.
            </p>
          </div>
        </>
      )}
      <button className="btn btn--lime btn--caps" style={{ marginTop: 20 }} onClick={() => void finish()}>
        Open {possessive(childName)} storybook <Chev />
      </button>
    </Shell>
  );
}
