import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import TopBar from "../components/TopBar";
import Vambie from "../components/Vambie";
import { apiGet } from "../lib/api";
import type { Prompt, Storybook } from "../types";

type Stage =
  | "prompt"
  | "requesting"
  | "mic-blocked"
  | "recording"
  | "paused"
  | "stopped"
  | "uploading"
  | "upload-error"
  | "saved";

const pickMimeType = () => {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"];
  return candidates.find((c) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(c)) ?? "";
};

export default function Recorder() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [storybook, setStorybook] = useState<Storybook | null>(null);
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [promptIndex, setPromptIndex] = useState(0);
  const [freeform, setFreeform] = useState(false);
  const [stage, setStage] = useState<Stage>("prompt");
  const [seconds, setSeconds] = useState(0);
  const [memoryTitle, setMemoryTitle] = useState("");
  const [eventDate, setEventDate] = useState("today");
  const [visibility, setVisibility] = useState("contributor_only");
  const [storyUse, setStoryUse] = useState(true);
  const [savedMemoryId, setSavedMemoryId] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const audioUrlRef = useRef<string | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    apiGet(`/api/storybooks/${id}`).then((data) => {
      setStorybook(data);
      setVisibility(data.defaultVisibility);
      setStoryUse(data.defaultStoryUse);
    });
    apiGet("/api/prompts?status=published").then(setPrompts);
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    };
  }, [id]);

  const startTimer = () => {
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000);
  };
  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickMimeType();
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const recordedBlob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        setBlob(recordedBlob);
        const url = URL.createObjectURL(recordedBlob);
        audioUrlRef.current = url;
        setAudioPreviewUrl(url);
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setSeconds(0);
      startTimer();
      setStage("recording");
    } catch {
      setStage("mic-blocked");
    }
  };

  const pauseResume = () => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) return;
    if (stage === "recording") {
      recorder.pause();
      stopTimer();
      setStage("paused");
    } else if (stage === "paused") {
      recorder.resume();
      startTimer();
      setStage("recording");
    }
  };

  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    stopTimer();
    setStage("stopped");
  };

  const reRecord = () => {
    if (audioUrlRef.current) URL.revokeObjectURL(audioUrlRef.current);
    setAudioPreviewUrl(null);
    setBlob(null);
    setSeconds(0);
    setStage("prompt");
  };

  const submit = async () => {
    if (!blob || !storybook?.defaultContributorId) return;
    setStage("uploading");
    try {
      const memRes = await fetch(`/api/storybooks/${id}/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contributorId: storybook.defaultContributorId,
          title: memoryTitle || null,
          eventDate: eventDate === "today" ? new Date().toISOString() : null,
          visibility,
          storyUseConsent: storyUse,
        }),
      });
      if (!memRes.ok) throw new Error("memory create failed");
      const memory = await memRes.json();

      const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("ogg") ? "ogg" : "webm";
      const formData = new FormData();
      formData.append("audio", blob, `memory.${ext}`);
      const audioRes = await fetch(`/api/memories/${memory.id}/audio`, { method: "POST", body: formData });
      if (!audioRes.ok) throw new Error("audio upload failed");

      setSavedMemoryId(memory.id);
      setStage("saved");
    } catch {
      setStage("upload-error");
    }
  };

  const downloadRecording = () => {
    if (!audioPreviewUrl) return;
    const a = document.createElement("a");
    a.href = audioPreviewUrl;
    a.download = "memory-recording.webm";
    a.click();
  };

  const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
  const ss = String(seconds % 60).padStart(2, "0");
  const currentPrompt = prompts[promptIndex];

  if (stage === "mic-blocked") {
    return (
      <div>
        <TopBar backTo={`/storybooks/${id}`} backLabel="Back" />
        <div className="hero">
          <div className="hero-mascot-stage">
            <Vambie mood="worried" size={90} />
            <h1 className="display" style={{ fontSize: "1.9rem" }}>
              Let's turn your mic on.
            </h1>
          </div>
        </div>
        <div className="screen-pad">
          <div className="card">
            <strong>Microphone access is blocked</strong>
            <p className="status-line">We need your permission to record your memory.</p>
            <p className="status-line">1. Open this site's browser permissions</p>
            <p className="status-line">2. Allow microphone access</p>
            <p className="status-line">3. Return here and try again</p>
            <button className="btn-primary chevron" onClick={startRecording}>
              Try microphone again
            </button>
            <button className="btn-secondary" style={{ marginTop: "0.6rem" }} onClick={() => setStage("prompt")}>
              Back to prompts
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "upload-error") {
    return (
      <div>
        <TopBar backTo={`/storybooks/${id}`} backLabel="Back" />
        <div className="screen-pad">
          <div className="banner warn">Not saved yet</div>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Let's finish saving this.</h2>
            {audioPreviewUrl && <audio src={audioPreviewUrl} controls style={{ width: "100%" }} />}
            <p className="status-line">The upload stopped before it finished. Keep this page open while you retry.</p>
            <button className="btn-primary chevron" onClick={submit}>
              Retry upload
            </button>
            <button className="btn-secondary" style={{ marginTop: "0.6rem" }} onClick={downloadRecording}>
              Download recording
            </button>
            <div className="banner danger" style={{ marginTop: "0.75rem" }}>
              If you leave now, this recording may be lost.
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (stage === "saved") {
    return (
      <div>
        <TopBar wordmark />
        <div className="hero">
          <div className="hero-mascot-stage">
            <Vambie mood="celebrating" size={100} />
            <h1 className="display" style={{ fontSize: "1.9rem" }}>
              A little moment.
              <br />
              Safely kept.
            </h1>
            <p className="subtitle" style={{ marginBottom: 0 }}>
              Your recording is saved in {storybook?.child.displayName}'s memories.
            </p>
          </div>
        </div>
        <div className="screen-pad">
          <div className="banner info">Preparing your memory. We'll let you know when a new chapter is ready.</div>
          <button className="btn-primary chevron" onClick={() => navigate(`/storybooks/${id}`)} style={{ marginTop: "1rem" }}>
            Back to {storybook?.child.displayName}'s story
          </button>
          <button
            className="btn-secondary"
            style={{ marginTop: "0.6rem" }}
            onClick={() => {
              setStage("prompt");
              reRecord();
            }}
          >
            Record another memory
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <TopBar backTo={`/storybooks/${id}`} backLabel="Back" />

      {stage === "prompt" && (
        <div className="hero">
          <div className="hero-mascot-stage">
            <Vambie mood="curious" size={90} />
            {currentPrompt && !freeform ? (
              <>
                <span className="pill" style={{ background: "var(--purple)", color: "white" }}>
                  {currentPrompt.category}
                </span>
                <h1 className="display" style={{ fontSize: "1.8rem" }}>
                  {currentPrompt.question}
                </h1>
                <p className="subtitle" style={{ marginBottom: 0 }}>
                  {currentPrompt.supportingText}
                </p>
              </>
            ) : (
              <>
                <h1 className="display" style={{ fontSize: "1.8rem" }}>
                  Something happen that you don't want to forget?
                </h1>
                <p className="subtitle" style={{ marginBottom: 0 }}>
                  Tell us what happened.
                </p>
              </>
            )}
          </div>
          <button className="btn-primary chevron" onClick={startRecording}>
            Record this memory
          </button>
          <div className="row inline" style={{ justifyContent: "center" }}>
            {prompts.length > 1 && !freeform && (
              <button
                className="btn-link"
                onClick={() => setPromptIndex((i) => (i + 1) % prompts.length)}
                style={{ width: "auto" }}
              >
                Next question
              </button>
            )}
            <button className="btn-link" onClick={() => setFreeform((f) => !f)} style={{ width: "auto" }}>
              {freeform ? "Use a prompt instead" : "Just let me talk"}
            </button>
          </div>
        </div>
      )}

      {(stage === "recording" || stage === "paused") && (
        <div className="record-stage">
          <button className={`record-button ${stage === "recording" ? "recording" : ""}`} onClick={stopRecording}>
            DONE
          </button>
          <div className="record-timer">
            {mm}:{ss}
          </div>
          <button className="btn-secondary" style={{ width: "auto" }} onClick={pauseResume}>
            {stage === "recording" ? "Pause" : "Resume"}
          </button>
        </div>
      )}

      {(stage === "stopped" || stage === "uploading") && audioPreviewUrl && (
        <div className="screen-pad">
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Keep this moment.</h2>
            <audio src={audioPreviewUrl} controls style={{ width: "100%" }} />
            <button className="btn-link" onClick={reRecord} style={{ marginTop: "0.5rem" }}>
              Re-record
            </button>

            <label htmlFor="memoryTitle">Give it a title (optional)</label>
            <input id="memoryTitle" value={memoryTitle} onChange={(e) => setMemoryTitle(e.target.value)} placeholder="e.g. First time at the park" />

            <label htmlFor="eventDate">When did it happen?</label>
            <select id="eventDate" value={eventDate} onChange={(e) => setEventDate(e.target.value)}>
              <option value="today">Today</option>
              <option value="unspecified">I'll add this later</option>
            </select>

            <label htmlFor="visibility">Original recording</label>
            <select id="visibility" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              <option value="contributor_only">Only me</option>
              <option value="household">Everyone in the household</option>
            </select>

            <div className="checkbox-row">
              <input type="checkbox" id="useInStory" checked={storyUse} onChange={(e) => setStoryUse(e.target.checked)} />
              <label htmlFor="useInStory" style={{ margin: 0 }}>
                Use this memory in {storybook?.child.displayName}'s story
              </label>
            </div>
            <p className="status-line">Your recording stays private. A story inspired by it can be shared with your family.</p>

            <button className="btn-primary chevron" onClick={submit} disabled={stage === "uploading"}>
              {stage === "uploading" ? "Saving…" : "Save memory"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
