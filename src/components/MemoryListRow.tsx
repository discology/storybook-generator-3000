import { Link } from "react-router-dom";
import { IconDotsVertical, IconEdit, IconMic, IconPause, IconPlay, IconSpinner } from "./icons";
import { formatDate, formatDuration } from "../lib/format";
import type { StorybookMemory } from "../types";

const PROCESSING = ["recorded", "transcribing", "transcribed"];

export const memoryTitle = (m: { title: string | null; status: string }) =>
  m.title || (PROCESSING.includes(m.status) ? "Preparing your memory…" : "A little moment");

export default function MemoryListRow({
  memory,
  to,
  playing,
  onPlay,
  showWho,
}: {
  memory: StorybookMemory;
  to: string;
  playing: boolean;
  onPlay: () => void;
  showWho?: boolean;
}) {
  const busy = PROCESSING.includes(memory.status);
  return (
    <div className="mem-row">
      {memory.audioSrc ? (
        <button type="button" className="mem-row__play" onClick={onPlay} aria-label={playing ? "Pause" : `Play ${memoryTitle(memory)}`}>
          {playing ? <IconPause size={20} /> : <IconPlay size={20} />}
        </button>
      ) : (
        <span className="mem-row__play mem-row__play--off" aria-hidden="true">
          {busy ? <IconSpinner size={20} /> : memory.typed ? <IconEdit size={20} /> : <IconMic size={20} />}
        </span>
      )}
      <Link to={to} className="mem-row__text" style={{ color: "inherit", textDecoration: "none" }}>
        <div className="mem-row__title">{memoryTitle(memory)}</div>
        <div className="mem-row__meta">
          {formatDate(memory.eventDate ?? memory.recordedAt)}
          {showWho && !memory.mine ? ` · ${memory.contributor.name}` : ""}
          {memory.status === "failed" ? " · Needs another try" : ""}
        </div>
      </Link>
      {memory.durationSec ? <span className="mem-row__dur">{formatDuration(memory.durationSec)}</span> : null}
      <Link to={to} className="tbar__icon" aria-label="Memory options" style={{ minWidth: 32 }}>
        <IconDotsVertical size={22} />
      </Link>
    </div>
  );
}
