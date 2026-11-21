import { useEffect, useRef, useState } from "react";
import { IconPause, IconPlay } from "./icons";
import { formatDuration } from "../lib/format";

// Peaks are computed once per recording from the audio itself, so every
// waveform is the recording's real shape.
const peakCache = new Map<string, Promise<number[]>>();

function loadPeaks(src: string, bars: number): Promise<number[]> {
  const key = `${src}#${bars}`;
  if (!peakCache.has(key)) {
    peakCache.set(
      key,
      fetch(src)
        .then((res) => res.arrayBuffer())
        .then((data) => {
          const ctx = new AudioContext();
          return ctx
            .decodeAudioData(data)
            .finally(() => void ctx.close().catch(() => undefined));
        })
        .then((audio) => {
          const channel = audio.getChannelData(0);
          const size = Math.floor(channel.length / bars) || 1;
          const peaks = Array.from({ length: bars }, (_, i) => {
            let max = 0;
            for (let j = i * size; j < (i + 1) * size && j < channel.length; j += 32) max = Math.max(max, Math.abs(channel[j]));
            return max;
          });
          const top = Math.max(...peaks, 0.01);
          return peaks.map((p) => Math.max(0.12, p / top));
        })
        .catch(() => placeholderPeaks(bars))
    );
  }
  return peakCache.get(key)!;
}

const placeholderPeaks = (bars: number) => Array.from({ length: bars }, (_, i) => 0.25 + 0.55 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)));

export default function AudioPlayer({
  src,
  durationSec,
  variant = "light",
  bars = 44,
}: {
  src: string | null;
  durationSec?: number | null;
  variant?: "light" | "purple";
  bars?: number;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const scrubbingRef = useRef<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationSec ?? 0);
  const [peaks, setPeaks] = useState(() => placeholderPeaks(bars));

  useEffect(() => {
    setPlaying(false);
    setProgress(0);
    setCurrentTime(0);
    setDuration(durationSec ?? 0);
  }, [src, durationSec]);

  useEffect(() => {
    if (!src) return;
    let live = true;
    loadPeaks(src, bars).then((p) => live && setPeaks(p));
    return () => {
      live = false;
    };
  }, [src, bars]);

  useEffect(() => () => audioRef.current?.pause(), []);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  };

  const seekToRatio = (ratio: number) => {
    const clamped = Math.max(0, Math.min(1, ratio));
    const audio = audioRef.current;
    const total = audio && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
    if (!audio || !total) return;
    const nextTime = clamped * total;
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      audio.currentTime = nextTime;
    }
    setCurrentTime(nextTime);
    setProgress(clamped);
  };

  const seekFromPointer = (el: HTMLDivElement, clientX: number) => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    seekToRatio((clientX - rect.left) / rect.width);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!src) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    scrubbingRef.current = e.pointerId;
    seekFromPointer(e.currentTarget, e.clientX);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (scrubbingRef.current !== e.pointerId) return;
    seekFromPointer(e.currentTarget, e.clientX);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (scrubbingRef.current !== e.pointerId) return;
    scrubbingRef.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    const total = audio && Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : duration;
    if (!audio || !total) return;
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const step = Math.min(5, Math.max(1, total * 0.05));
      const delta = e.key === "ArrowRight" ? step : -step;
      seekToRatio((currentTime + delta) / total);
    }
  };

  const shown = playing || progress > 0 ? currentTime : duration;

  return (
    <div className={`player ${variant === "purple" ? "player--purple" : ""}`}>
      {src && (
        <audio
          ref={audioRef}
          src={src}
          preload="metadata"
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => {
            setPlaying(false);
            setProgress(0);
            setCurrentTime(0);
          }}
          onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => {
            if (scrubbingRef.current !== null) return;
            const a = e.currentTarget;
            setCurrentTime(a.currentTime);
            if (a.duration && Number.isFinite(a.duration)) setProgress(a.currentTime / a.duration);
          }}
        />
      )}
      <button type="button" className="player__btn" onClick={toggle} disabled={!src} aria-label={playing ? "Pause" : "Play"}>
        {playing ? <IconPause size={24} /> : <IconPlay size={24} />}
      </button>
      <div
        className="player__wave"
        role="slider"
        tabIndex={src ? 0 : -1}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(shown)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
      >
        {peaks.map((p, i) => (
          <span key={i} className={i / peaks.length < progress || (!playing && progress === 0) ? "on" : ""} style={{ height: `${Math.round(p * 100)}%` }} />
        ))}
      </div>
      <span className="player__time">{formatDuration(shown)}</span>
    </div>
  );
}
