import { Link } from "react-router-dom";
import { IconDotsVertical, IconPause, IconPlay, IconSpinner } from "./icons";
import { Avatar } from "./ui";
import { formatDate, formatDuration } from "../lib/format";
import type { StorybookMemory } from "../types";

const PROCESSING = ["recorded", "transcribing", "transcribed"];

export const memoryTitle = (m: { title: string | null; status: string }) =>
  m.title || (PROCESSING.includes(m.status) ? "Preparing your memory…" : "A little moment");

// One memory in the Memories list: who it's from, as their Vambie look (or
// their initials until they have one), the title, and who and when (VSB-135).
export default function MemoryListRow({
  memory,
  to,
  playing,
  onPlay,
}: {
  memory: StorybookMemory;
  to: string;
  playing: boolean;
  onPlay: () => void;
}) {
  const busy = PROCESSING.includes(memory.status);
  const who = memory.mine ? "You" : memory.contributor.name;
  return (
    <div className="mem-row">
      <span className="mem-row__who" title={memory.contributor.name}>
        <Avatar name={memory.contributor.name} src={memory.contributor.portrait} />
      </span>
      <Link to={to} className="mem-row__text" style={{ color: "inherit", textDecoration: "none" }}>
        <div className="mem-row__title">{memoryTitle(memory)}</div>
        <div className="mem-row__meta">
          {who} · {formatDate(memory.eventDate ?? memory.recordedAt)}
          {memory.status === "failed" ? " · Needs another try" : ""}
        </div>
      </Link>
      {memory.durationSec ? <span className="mem-row__dur">{formatDuration(memory.durationSec)}</span> : null}
      {memory.audioSrc ? (
        <button type="button" className="mem-row__play" onClick={onPlay} aria-label={playing ? "Pause" : `Play ${memoryTitle(memory)}`}>
          {playing ? <IconPause size={20} /> : <IconPlay size={20} />}
        </button>
      ) : busy ? (
        <span className="mem-row__play mem-row__play--off" aria-label="Preparing">
          <IconSpinner size={20} />
        </span>
      ) : null}
      <Link to={to} className="tbar__icon" aria-label="Memory options" style={{ minWidth: 32 }}>
        <IconDotsVertical size={22} />
      </Link>
    </div>
  );
}
