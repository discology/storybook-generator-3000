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
        .then((data) => new AudioContext().decodeAudioData(data))
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
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(durationSec ?? 0);
  const [peaks, setPeaks] = useState(() => placeholderPeaks(bars));

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

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current;
    if (!audio || !audio.duration || !Number.isFinite(audio.duration)) return;
    const rect = e.currentTarget.getBoundingClientRect();
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
  };

  const shown = playing || progress > 0 ? (audioRef.current?.currentTime ?? 0) : duration;

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
          }}
          onLoadedMetadata={(e) => Number.isFinite(e.currentTarget.duration) && setDuration(e.currentTarget.duration)}
          onTimeUpdate={(e) => {
            const a = e.currentTarget;
            if (a.duration && Number.isFinite(a.duration)) setProgress(a.currentTime / a.duration);
          }}
        />
      )}
      <button type="button" className="player__btn" onClick={toggle} disabled={!src} aria-label={playing ? "Pause" : "Play"}>
        {playing ? <IconPause size={24} /> : <IconPlay size={24} />}
      </button>
      <div className="player__wave" onClick={seek} aria-hidden="true">
        {peaks.map((p, i) => (
          <span key={i} className={i / peaks.length < progress || (!playing && progress === 0) ? "on" : ""} style={{ height: `${Math.round(p * 100)}%` }} />
        ))}
      </div>
      <span className="player__time">{formatDuration(shown)}</span>
    </div>
  );
}
