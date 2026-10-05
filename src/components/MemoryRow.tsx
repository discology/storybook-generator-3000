import { useEffect, useState } from "react";
import { apiGet, apiSend } from "../lib/api";
import type { Chapter, Memory } from "../types";

interface MemoryRowProps {
  memory: Memory;
  onChange: () => void;
  selected: boolean;
  onToggleSelected: (checked: boolean) => void;
}

export default function MemoryRow({ memory, onChange, selected, onToggleSelected }: MemoryRowProps) {
  const [busy, setBusy] = useState(false);
  const [manualTranscript, setManualTranscript] = useState("");
  const [transcribeNote, setTranscribeNote] = useState<string | null>(null);
  const [storyUse, setStoryUse] = useState(memory.storyUseConsent);
  const [deleteStep, setDeleteStep] = useState<"none" | "preview" | "confirm">("none");
  const [connectedChapters, setConnectedChapters] = useState<Chapter[]>([]);
  const [confirmText, setConfirmText] = useState("");
  const [understood, setUnderstood] = useState(false);

  useEffect(() => {
    setStoryUse(memory.storyUseConsent);
  }, [memory.storyUseConsent]);

  const latestTranscript = memory.transcripts[0];

  const transcribe = async () => {
    setBusy(true);
    setTranscribeNote(null);
    try {
      const data = await apiSend(`/api/memories/${memory.id}/transcribe`, "POST");
      if (!data.text) setTranscribeNote(data.reason || "Couldn't transcribe automatically — enter it manually below.");
      onChange();
    } finally {
      setBusy(false);
    }
  };

  const saveManualTranscript = async () => {
    if (!manualTranscript.trim()) return;
    setBusy(true);
    try {
      await apiSend(`/api/memories/${memory.id}/transcript`, "PUT", { text: manualTranscript });
      setManualTranscript("");
      onChange();
    } finally {
      setBusy(false);
    }
  };

  const interpret = async () => {
    setBusy(true);
    try {
      await apiSend(`/api/memories/${memory.id}/interpret`, "POST");
      onChange();
    } finally {
      setBusy(false);
    }
  };

  const toggleStoryUse = async (checked: boolean) => {
    setStoryUse(checked);
    await apiSend(`/api/memories/${memory.id}/story-use`, "PUT", { storyUseConsent: checked });
    onChange();
  };

  const startDelete = async () => {
    const data = await apiGet(`/api/memories/${memory.id}/deletion-preview`);
    setConnectedChapters(data.connectedChapters);
    setDeleteStep("preview");
  };

  const confirmDelete = async () => {
    await apiSend(`/api/memories/${memory.id}`, "DELETE");
    onChange();
  };

  if (deleteStep === "preview") {
    return (
      <div className="memory-list-item">
        <strong>Review what changes</strong>
        <p className="status-line">This removes:</p>
        <p className="status-line">— Original recording</p>
        <p className="status-line">— Transcript and interpretation</p>
        {connectedChapters.length > 0 && (
          <div className="banner warn">
            This memory feeds {connectedChapters.length} chapter{connectedChapters.length > 1 ? "s" : ""} (
            {connectedChapters.map((c) => c.title).join(", ")}). That chapter will be held for review while this
            memory's influence is removed.
          </div>
        )}
        <p className="status-line">Copies already downloaded or printed cannot be recalled.</p>
        <div className="row">
          <button className="btn-secondary" onClick={() => setDeleteStep("confirm")}>
            Continue to confirmation
          </button>
          <button className="btn-secondary" onClick={() => setDeleteStep("none")}>
            Keep memory
          </button>
        </div>
      </div>
    );
  }

  if (deleteStep === "confirm") {
    return (
      <div className="memory-list-item">
        <strong>Delete this memory?</strong>
        <p className="status-line">This can't be undone.</p>
        <label htmlFor={`confirm-${memory.id}`}>Type DELETE to confirm</label>
        <input id={`confirm-${memory.id}`} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="DELETE" />
        <div className="checkbox-row">
          <input type="checkbox" id={`understood-${memory.id}`} checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
          <label htmlFor={`understood-${memory.id}`} style={{ margin: 0 }}>
            I understand this cannot be undone.
          </label>
        </div>
        <div className="row">
          <button className="btn-danger" disabled={confirmText !== "DELETE" || !understood} onClick={confirmDelete}>
            Delete memory
          </button>
          <button className="btn-secondary" onClick={() => setDeleteStep("none")}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="memory-list-item">
      <div className="row inline" style={{ justifyContent: "space-between", marginTop: 0, width: "100%" }}>
        <div>
          <strong>{memory.title || "Untitled memory"}</strong>
          <span className="status-tag">{memory.status}</span>
          {memory.contributor && <span className="status-line"> — {memory.contributor.name}</span>}
        </div>
        {memory.audioUrl && <audio src={memory.audioUrl} controls style={{ height: 32 }} />}
      </div>

      {!latestTranscript && (
        <div className="row">
          <button className="btn-secondary" onClick={transcribe} disabled={busy}>
            {busy ? "Working…" : "Transcribe"}
          </button>
        </div>
      )}

      {transcribeNote && <p className="status-line">{transcribeNote}</p>}

      {!latestTranscript && (
        <div className="row" style={{ flexDirection: "column", alignItems: "stretch" }}>
          <textarea
            value={manualTranscript}
            onChange={(e) => setManualTranscript(e.target.value)}
            placeholder="Or type what was said…"
          />
          <button className="btn-secondary" onClick={saveManualTranscript} disabled={busy || !manualTranscript.trim()}>
            Save transcript
          </button>
        </div>
      )}

      {latestTranscript && (
        <div className="status-line">
          <strong>Transcript</strong> ({latestTranscript.source}): {latestTranscript.text}
        </div>
      )}

      {latestTranscript && !memory.interpretation && (
        <div className="row">
          <button className="btn-secondary" onClick={interpret} disabled={busy}>
            {busy ? "Working…" : "Interpret"}
          </button>
        </div>
      )}

      {memory.interpretation && (
        <div className="status-line">
          <strong>What happened:</strong> {memory.interpretation.events}
          {memory.interpretation.isMock ? (
            <div>No AI provider configured — emotions/themes left blank rather than guessed.</div>
          ) : (
            <>
              <br />
              <strong>Emotions:</strong> {memory.interpretation.emotions}
              <br />
              <strong>Themes:</strong> {memory.interpretation.themes}
            </>
          )}
        </div>
      )}

      <div className="checkbox-row">
        <input
          type="checkbox"
          id={`story-use-${memory.id}`}
          checked={storyUse}
          onChange={(e) => toggleStoryUse(e.target.checked)}
        />
        <label htmlFor={`story-use-${memory.id}`} style={{ margin: 0 }}>
          Okay to use in {memory.contributor ? "the" : "their"} shared story
        </label>
      </div>

      {storyUse && memory.interpretation && (
        <div className="checkbox-row">
          <input
            type="checkbox"
            id={`select-${memory.id}`}
            checked={selected}
            onChange={(e) => onToggleSelected(e.target.checked)}
          />
          <label htmlFor={`select-${memory.id}`} style={{ margin: 0 }}>
            Include in next chapter
          </label>
        </div>
      )}

      <div className="row">
        <button className="btn-secondary" style={{ width: "auto" }} onClick={startDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
