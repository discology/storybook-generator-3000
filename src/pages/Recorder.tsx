import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import BottomNav from "../components/BottomNav";
import AudioPlayer from "../components/AudioPlayer";
import AccessDenied from "../components/AccessDenied";
import { IconCheck, IconChevronLeft, IconDownload, IconEdit, IconLock, IconMic, IconRefresh, IconSparkle, IconUpload, IconWarning } from "../components/icons";
import { Chev, Field, Loading, Mascot, Masthead, Note, Select, Sheet, Switch, type MascotName } from "../components/ui";
import { useStorybookData } from "../hooks/useStorybookData";
import { apiGet, apiSend } from "../lib/api";
import { formatDuration, possessive } from "../lib/format";
import { ageInYears } from "../lib/stages";
import { fillPrompt, promptValues } from "../lib/promptVariables";
import type { Prompt, StorybookView } from "../types";

type Stage = "deck" | "typing" | "requesting" | "mic-blocked" | "recording" | "paused" | "review" | "uploading" | "upload-error" | "saved";
const MAX_TYPED = 4000;

interface DeckCard {
  id: string | null;
  question: string;
  supportingText: string;
  category: string;
  color: string;
  art: string | null;
}

const MAX_SECONDS = 15 * 60;
const BARS = 26;
const CARD_ART: MascotName[] = ["star", "book", "open-book", "hug-book", "envelope-happy", "closedbook"];
const FREEFORM: DeckCard = { id: null, question: "What would you like to remember?", supportingText: "Tell it in your own words.", category: "Just talk", color: "purple", art: null };

const pickMimeType = () => {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((c) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) ?? "";
};

const audienceFor = (relationship: string | null) =>
  relationship === "Parent" || relationship === "Guardian" ? "Parents" : relationship === "Grandparent" ? "Grandparents" : null;

function childStageFor(storybook: StorybookView) {
  if (storybook.child.stage === "expecting") return "Expecting";
  const age = ageInYears(storybook.child.birthDate);
  if (age === null) return null;
  return age < 1 ? "Newborn" : age < 4 ? "Toddler" : null;
}

// Cards can use variables like <child_name>; they're filled in for the person
// recording, and the memory keeps the question as they saw it.
const toCard = (p: Prompt, values: Record<string, string>): DeckCard => ({
  id: p.id,
  question: fillPrompt(p.question, values),
  supportingText: fillPrompt(p.supportingText || "Tell it in your own words.", values),
  category: p.category,
  color: p.cardColor,
  art: p.artworkPath,
});

export default function Recorder() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { storybook, status } = useStorybookData(id);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [category, setCategory] = useState("All");
  const [cardIndex, setCardIndex] = useState(0);
  const [chosen, setChosen] = useState<DeckCard | null>(null);
  const [stage, setStage] = useState<Stage>("deck");
  const [seconds, setSeconds] = useState(0);
  const [levels, setLevels] = useState<number[]>(() => Array(BARS).fill(0.08));
  const [blob, setBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [when, setWhen] = useState("today");
  const [pickedDate, setPickedDate] = useState("");
  const [visibility, setVisibility] = useState("contributor_only");
  const [storyUse, setStoryUse] = useState(true);
  const [memoryId, setMemoryId] = useState<string | null>(null);
  // A memory is recorded or typed (VSB-85).
  const [typed, setTyped] = useState(false);
  const [text, setText] = useState("");

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const rafRef = useRef<number | null>(null);
  const deckRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    apiGet("/api/prompts?status=published").then(setPrompts).catch(() => setPrompts([]));
  }, []);

  useEffect(() => {
    if (storybook) {
      setVisibility(storybook.defaultVisibility === "household" ? "household" : "contributor_only");
      setStoryUse(storybook.defaultStoryUse);
    }
  }, [storybook]);

  const stopEverything = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    void audioCtxRef.current?.close().catch(() => undefined);
    audioCtxRef.current = null;
  }, []);

  useEffect(() => () => stopEverything(), [stopEverything]);
  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  // Leaving with an unsaved recording loses it.
  const unsaved = ["recording", "paused", "review", "uploading", "upload-error"].includes(stage);
  useEffect(() => {
    if (!unsaved) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  const cards = useMemo(() => {
    if (!storybook) return [];
    const audience = audienceFor(storybook.me.relationship);
    const childStage = childStageFor(storybook);
    const fitting = prompts.filter(
      (p) => (p.audience === "Everyone" || p.audience === audience) && (p.childStage === "All stages" || p.childStage === childStage)
    );
    const values = promptValues({
      child: storybook.child,
      me: storybook.me,
      parentName: storybook.family.find((f) => f.role === "owner")?.name ?? null,
    });
    const list = fitting.filter((p) => category === "All" || p.category === category).map((p) => toCard(p, values));
    const asked = params.get("q");
    return asked && category === "All" ? [{ ...FREEFORM, question: asked, category: "Sample prompt" }, ...list] : list;
  }, [prompts, storybook, category, params]);

  const categories = useMemo(() => ["All", ...new Set(prompts.map((p) => p.category))], [prompts]);

  const onDeckScroll = () => {
    const el = deckRef.current;
    if (!el || !el.firstElementChild) return;
    const width = (el.firstElementChild as HTMLElement).offsetWidth + 14;
    setCardIndex(Math.min(cards.length - 1, Math.max(0, Math.round(el.scrollLeft / width))));
  };

  const meter = (stream: MediaStream) => {
    try {
      const ctx = new AudioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      audioCtxRef.current = ctx;
      const data = new Uint8Array(analyser.frequencyBinCount);
      let last = 0;
      const tick = (t: number) => {
        rafRef.current = requestAnimationFrame(tick);
        if (t - last < 60) return;
        last = t;
        analyser.getByteFrequencyData(data);
        const step = Math.floor(data.length / BARS);
        const next = Array.from({ length: BARS }, (_, i) => {
          const mirrored = i < BARS / 2 ? BARS / 2 - 1 - i : i - BARS / 2;
          const v = data[Math.min(data.length - 1, 2 + mirrored * step)] / 255;
          return Math.max(0.08, Math.min(1, v * 1.4));
        });
        setLevels(next);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      // The waveform is decoration; recording works without it.
    }
  };

  const startTimer = () => {
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };

  // Recordings stop on their own at the length limit.
  useEffect(() => {
    if (seconds >= MAX_SECONDS && stage === "recording") finishRecording();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, stage]);

  const startRecording = async (card: DeckCard) => {
    setChosen(card);
    setStage("requesting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      recorder.onstop = () => {
        const recorded = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setBlob(recorded);
        setPreviewUrl(URL.createObjectURL(recorded));
      };
      recorderRef.current = recorder;
      recorder.start(1000);
      setSeconds(0);
      startTimer();
      meter(stream);
      setStage("recording");
    } catch {
      setStage("mic-blocked");
    }
  };

  const togglePause = () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    if (stage === "recording") {
      recorder.pause();
      if (timerRef.current) clearInterval(timerRef.current);
      setStage("paused");
    } else if (stage === "paused") {
      recorder.resume();
      startTimer();
      setStage("recording");
    }
  };

  function finishRecording() {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    stopEverything();
    setLevels(Array(BARS).fill(0.08));
    setStage("review");
  }

  const discard = () => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
    stopEverything();
    setBlob(null);
    setPreviewUrl(null);
    setMemoryId(null);
    setSeconds(0);
    setTyped(false);
    setText("");
    setStage("deck");
  };

  const leaveRecording = () => {
    if (typed ? !text.trim() || window.confirm("Discard what you've written?") : window.confirm("Stop and discard this recording?")) discard();
  };

  const startTyping = (card: DeckCard) => {
    setChosen(card);
    setTyped(true);
    setStage("typing");
  };

  const eventDate = () => {
    const d = new Date();
    if (when === "yesterday") d.setDate(d.getDate() - 1);
    if (when === "week") d.setDate(d.getDate() - 3);
    if (when === "pick") return pickedDate ? new Date(`${pickedDate}T12:00:00`).toISOString() : null;
    return d.toISOString();
  };

  const save = async () => {
    if (typed) return saveTyped();
    if (!blob || !storybook) return;
    setStage("uploading");
    try {
      let savedId = memoryId;
      if (!savedId) {
        const res = await fetch(`/api/storybooks/${storybook.id}/memories`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            eventDate: eventDate(),
            visibility,
            storyUseConsent: storyUse,
            durationSec: seconds,
            promptId: chosen?.id ?? null,
            promptText: chosen?.question ?? null,
          }),
        });
        if (!res.ok) throw new Error("memory");
        savedId = (await res.json()).id as string;
        setMemoryId(savedId);
      }
      const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
      const form = new FormData();
      form.append("audio", blob, `memory.${ext}`);
      const upload = await fetch(`/api/memories/${savedId}/audio`, { method: "POST", body: form });
      if (!upload.ok) throw new Error("upload");
      setStage("saved");
    } catch {
      setStage("upload-error");
    }
  };

  // Typed words are saved with the memory itself; there's nothing to upload.
  const saveTyped = async () => {
    if (!storybook) return;
    setStage("uploading");
    try {
      const memory = await apiSend(`/api/storybooks/${storybook.id}/memories`, "POST", {
        text: text.trim(),
        eventDate: eventDate(),
        visibility,
        storyUseConsent: storyUse,
        promptId: chosen?.id ?? null,
        promptText: chosen?.question ?? null,
      });
      setMemoryId(memory.id);
      setStage("saved");
    } catch {
      setStage("upload-error");
    }
  };

  const download = () => {
    if (!previewUrl || !blob) return;
    const a = document.createElement("a");
    a.href = previewUrl;
    a.download = `vambie-memory.${blob.type.includes("mp4") ? "m4a" : "webm"}`;
    a.click();
  };

  if (status === "denied") return <AccessDenied />;
  if (!storybook) return <Loading />;

  const base = `/storybooks/${storybook.id}`;
  const child = storybook.child.displayName;
  const nextDay = new Date(storybook.nextChapterAt).toLocaleDateString("en-US", { weekday: "long" });

  if (stage === "mic-blocked") {
    return (
      <div className="page">
        <TopBar back={() => setStage("deck")} wordmark menu={`${base}/settings`} />
        <Masthead plate="tall" title={<>Let's turn<br />your mic on.</>} art="mic" center />
        <Sheet grow>
          <div className="hstack" style={{ alignItems: "flex-start", gap: 14 }}>
            <span className="icon-circle" style={{ width: 58, height: 58, background: "var(--red)", color: "var(--white)", flex: "none" }}>
              <IconMic size={28} />
            </span>
            <div>
              <h2 className="h-title" style={{ fontSize: 24 }}>Microphone access is blocked</h2>
              <p className="t-small t-muted" style={{ marginTop: 4 }}>We need your permission to record your memory.</p>
            </div>
          </div>
          <ol className="num-steps">
            {["Open this site's browser permissions.", "Allow microphone access.", "Return here and try again."].map((text, i) => (
              <li key={text}>
                <span className="num-steps__n">{i + 1}</span>
                {text}
              </li>
            ))}
          </ol>
          <hr className="divider" />
          <p className="t-center t-small t-muted" style={{ margin: 0 }}>No recording has started yet.</p>
          <div className="stack" style={{ marginTop: 16 }}>
            <button className="btn btn--lime btn--caps" onClick={() => void startRecording(chosen ?? FREEFORM)}>
              <IconMic size={22} filled /> Try microphone again <Chev />
            </button>
            <button className="btn btn--dark btn--caps" onClick={() => setStage("deck")}>
              <IconChevronLeft size={22} strokeWidth={3} /> Back to prompts
            </button>
          </div>
          <p className="t-center" style={{ marginTop: 14 }}>
            <Link to="/help" className="tlink">Need help?</Link>
          </p>
        </Sheet>
      </div>
    );
  }

  if (stage === "upload-error") {
    return (
      <div className="page">
        <TopBar back={leaveRecording} wordmark menu={`${base}/settings`} />
        <Masthead
          badge={
            <span className="badge badge--amber badge--caps">
              <IconWarning size={18} /> Not saved yet
            </span>
          }
          title={<>Let's finish<br />saving this.</>}
          style={{ paddingBottom: 40, paddingRight: 150 }}
        />
        <Sheet peek="peek" grow>
          {typed ? <blockquote className="typed-words">{text}</blockquote> : <AudioPlayer src={previewUrl} durationSec={seconds} />}
          <h2 className="h-title" style={{ marginTop: 18 }}>{typed ? "Your words didn't save yet." : "The upload stopped before it finished."}</h2>
          <p className="t-body t-muted" style={{ marginTop: 6 }}>Keep this page open while you retry.</p>
          <div className="stack" style={{ marginTop: 18 }}>
            <button className="btn btn--lime btn--caps" onClick={() => void save()}>
              <IconUpload size={22} /> {typed ? "Try saving again" : "Retry upload"} <Chev />
            </button>
            {typed ? (
              <button className="btn btn--outline btn--caps" onClick={() => void navigator.clipboard?.writeText(text)}>
                Copy my words <Chev />
              </button>
            ) : (
              <button className="btn btn--outline btn--caps" onClick={download}>
                <IconDownload size={22} /> Download recording <Chev />
              </button>
            )}
          </div>
          <Note kind="danger" style={{ marginTop: 16 }}>
            If you leave now, {typed ? "what you wrote" : "this recording"} may be lost.{" "}
            <Link to="/help" className="tlink">Get help</Link>
          </Note>
        </Sheet>
      </div>
    );
  }

  if (stage === "saved") {
    return (
      <div className="page">
        <div className="saved-screen">
          <span className="badge badge--lime badge--caps">
            <IconCheck size={18} strokeWidth={3} /> Saved
          </span>
          <h1 className="h-display" style={{ marginTop: 16 }}>
            A little moment.
            <br />
            Safely kept.
          </h1>
          <Mascot name="hug-book" className="saved-screen__art" />
          <p className="t-body">Your {typed ? "words are" : "recording is"} saved in {possessive(child)} memories.</p>
          <div className="preparing-card">
            <IconSparkle size={30} />
            <div>
              <p className="preparing-card__title">Preparing your memory</p>
              <p className="t-small" style={{ margin: 0, opacity: 0.92 }}>
                {storyUse
                  ? `It joins this week's chapter, made ${nextDay} morning. We'll let you know when it's ready.`
                  : "It stays in your memories and won't be used in stories."}
              </p>
            </div>
          </div>
          <div className="stack" style={{ width: "100%", marginTop: 16 }}>
            <Link className="btn btn--lime btn--caps" to={base}>
              Back to {possessive(child)} story <Chev />
            </Link>
            <button className="btn btn--ghost btn--caps" onClick={discard}>
              Add another memory
            </button>
          </div>
          {memoryId && (
            <p style={{ marginTop: 14 }}>
              <Link to={`${base}/memories/${memoryId}`} className="tlink tlink--light">
                View saved memory
              </Link>
            </p>
          )}
        </div>
      </div>
    );
  }

  if (stage === "review" || stage === "uploading") {
    return (
      <div className="page">
        <TopBar back={leaveRecording} />
        <Masthead title="Keep this moment." style={{ paddingTop: 0 }} />
        <Sheet grow>
          {typed ? (
            <>
              <blockquote className="typed-words">{text}</blockquote>
              <p className="t-center" style={{ margin: "12px 0 0" }}>
                <button className="tlink" onClick={() => setStage("typing")}>
                  <IconEdit size={18} /> Edit
                </button>
              </p>
            </>
          ) : (
            <>
              <AudioPlayer src={previewUrl} durationSec={seconds} />
              <p className="t-center" style={{ margin: "12px 0 0" }}>
                <button className="tlink" onClick={() => window.confirm("Record it again? This recording will be discarded.") && discard()}>
                  <IconRefresh size={18} /> Re-record
                </button>
              </p>
            </>
          )}
          <Field label="When did it happen?" htmlFor="when">
            <Select
              id="when"
              value={when}
              onChange={setWhen}
              options={[
                { value: "today", label: "Today" },
                { value: "yesterday", label: "Yesterday" },
                { value: "week", label: "Earlier this week" },
                { value: "pick", label: "Pick a date…" },
              ]}
            />
            {when === "pick" && (
              <input type="date" className="input" style={{ marginTop: 8 }} value={pickedDate} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setPickedDate(e.target.value)} />
            )}
          </Field>
          <Field label={typed ? "Who can read your words" : "Original recording"} htmlFor="visibility">
            <Select
              id="visibility"
              value={visibility}
              onChange={setVisibility}
              icon={<IconLock size={20} />}
              options={[
                { value: "contributor_only", label: "Only me" },
                { value: "household", label: "Everyone in the family" },
              ]}
            />
          </Field>
          <hr className="divider" />
          <div className="toggle-row">
            <span className="t-body" style={{ fontWeight: 500 }}>Use this memory in {possessive(child)} story</span>
            <Switch checked={storyUse} onChange={setStoryUse} label={`Use this memory in ${possessive(child)} story`} />
          </div>
          <p className="field__hint">Your {typed ? "words stay" : "recording stays"} private. A story inspired by it can be shared with your family.</p>
          <button className="btn btn--lime btn--caps" style={{ marginTop: 22 }} onClick={() => void save()} disabled={stage === "uploading"}>
            {stage === "uploading" ? "Saving…" : "Save memory"} <Chev />
          </button>
        </Sheet>
      </div>
    );
  }

  if (stage === "typing") {
    const card = chosen ?? FREEFORM;
    const tooShort = text.trim().length < 10;
    return (
      <div className="page">
        <TopBar back={leaveRecording} />
        <div className="rec-screen rec-screen--typing">
          <span className="badge badge--purple badge--caps">{card.category}</span>
          <h1 className="h-display h-display--md">{card.question}</h1>
          <p className="t-body" style={{ marginTop: 8 }}>{card.supportingText}</p>
        </div>
        <Sheet grow>
          <label className="field__label" htmlFor="typed">
            Write it the way you'd tell it
          </label>
          <textarea
            id="typed"
            className="textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={MAX_TYPED}
            rows={9}
            autoFocus
            placeholder={`Today ${child}…`}
          />
          <p className="field__hint" style={{ textAlign: "right" }}>
            {text.length.toLocaleString()} / {MAX_TYPED.toLocaleString()}
          </p>
          <button className="btn btn--lime btn--caps" style={{ marginTop: 12 }} onClick={() => setStage("review")} disabled={tooShort}>
            Next <Chev />
          </button>
          {tooShort && text.trim() && <p className="t-small t-muted t-center">A sentence or two is plenty.</p>}
        </Sheet>
      </div>
    );
  }

  if (stage === "recording" || stage === "paused" || stage === "requesting") {
    const card = chosen ?? FREEFORM;
    return (
      <div className="page">
        <TopBar back={stage === "requesting" ? () => setStage("deck") : leaveRecording} />
        <div className="rec-screen">
          <span className="badge badge--purple badge--caps">{card.category}</span>
          <h1 className="h-display">{card.question}</h1>
          <p className="t-body" style={{ marginTop: 8 }}>{card.supportingText}</p>
          <Mascot name="mic" className="rec-screen__art" />
          <div className="live-wave" aria-hidden="true">
            {levels.map((v, i) => (
              <span key={i} style={{ height: `${Math.round(v * 100)}%`, opacity: stage === "paused" ? 0.4 : 1 }} />
            ))}
          </div>
          <p className="rec-timer" aria-live="off">{formatDuration(seconds)}</p>
          <button
            className={`mic-btn ${stage === "recording" ? "mic-btn--live" : ""}`}
            onClick={togglePause}
            aria-label={stage === "recording" ? "Pause recording" : "Resume recording"}
            style={{ marginTop: 14 }}
            disabled={stage === "requesting"}
          >
            <IconMic size={52} filled />
          </button>
          <div className="rec-actions">
            <button className="btn btn--ghost btn--caps" onClick={togglePause} disabled={stage === "requesting"}>
              {stage === "paused" ? "Resume" : "Pause"}
            </button>
            <button className="btn btn--lime btn--caps" onClick={finishRecording} disabled={stage === "requesting" || seconds < 1}>
              Finish <Chev />
            </button>
          </div>
          <p className="t-small t-muted-dark" style={{ marginTop: 16 }}>
            {stage === "requesting" ? "Allow the microphone to start." : "A little moment is enough."}
          </p>
        </div>
      </div>
    );
  }

  // Prompt deck
  const current = cards[cardIndex];
  return (
    <div className="page page--nav">
      <TopBar wordmark menu={`${base}/settings`} />
      <Masthead title={<>A little nudge.<br />A real memory.</>} style={{ paddingTop: 0, paddingBottom: 14 }} />
      <div className="pad" style={{ overflowX: "auto" }}>
        <div className="chips" style={{ flexWrap: "nowrap" }}>
          {categories.map((c) => (
            <button
              key={c}
              className={`chip ${category === c ? "chip--on" : ""}`}
              onClick={() => {
                setCategory(c);
                setCardIndex(0);
                deckRef.current?.scrollTo({ left: 0 });
              }}
            >
              {c}
            </button>
          ))}
        </div>
      </div>
      {cards.length === 0 ? (
        <p className="loading">No questions here yet. Try another category, or just talk.</p>
      ) : (
        <>
          <div className="deck" ref={deckRef} onScroll={onDeckScroll} style={{ marginTop: 16 }}>
            {cards.map((c, i) => (
              <button
                key={`${c.id}-${i}`}
                className={`prompt-card prompt-card--${c.color}`}
                onClick={() => void startRecording(c)}
                aria-label={`Record: ${c.question}`}
                style={{ border: 0, cursor: "pointer", font: "inherit" }}
              >
                <span className={`badge badge--caps badge--sm prompt-card__badge ${c.color === "purple" ? "badge--pink" : "badge--purple"}`}>{c.category}</span>
                <span className="prompt-card__q">{c.question}</span>
                {c.art ? (
                  <img src={`/${c.art}`} alt="" className="prompt-card__art" style={{ borderRadius: 16, aspectRatio: "1", objectFit: "cover" }} />
                ) : (
                  <Mascot name={CARD_ART[i % CARD_ART.length]} className="prompt-card__art" />
                )}
              </button>
            ))}
          </div>
          <div className="deck-dots" aria-hidden="true">
            {cards.slice(0, 8).map((c, i) => (
              <span key={i} className={i === Math.min(cardIndex, 7) ? "on" : ""} />
            ))}
          </div>
          <p className="t-center t-small t-muted-dark" style={{ margin: "8px 0 0" }}>Swipe for another question</p>
        </>
      )}
      <div className="pad" style={{ marginTop: 16 }}>
        <div className="rec-choice">
          <button className="btn btn--lime btn--caps" onClick={() => void startRecording(current ?? FREEFORM)}>
            <IconMic size={24} filled /> Record it <Chev />
          </button>
          <button className="btn btn--ghost btn--caps" onClick={() => startTyping(current ?? FREEFORM)}>
            <IconEdit size={22} /> Type it
          </button>
        </div>
        <p className="t-center" style={{ margin: "14px 0 0" }}>
          <button className="tlink tlink--light" onClick={() => void startRecording(FREEFORM)}>
            Just let me talk
          </button>
          <span className="t-muted-dark" aria-hidden="true">{" · "}</span>
          <button className="tlink tlink--light" onClick={() => startTyping({ ...FREEFORM, question: "What would you like to remember?", category: "Just write" })}>
            Just let me write
          </button>
        </p>
      </div>
      <BottomNav storybookId={storybook.id} />
    </div>
  );
}
