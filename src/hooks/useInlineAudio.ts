import { useEffect, useRef, useState } from "react";

// One shared player for lists of recordings: starting one stops the other.
export function useInlineAudio() {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playingId, setPlayingId] = useState<string | null>(null);

  useEffect(
    () => () => {
      audio.current?.pause();
    },
    []
  );

  const toggle = (id: string, src: string) => {
    if (playingId === id) {
      audio.current?.pause();
      setPlayingId(null);
      return;
    }
    audio.current?.pause();
    const player = new Audio(src);
    player.onended = () => setPlayingId(null);
    player.onerror = () => setPlayingId(null);
    audio.current = player;
    void player.play().catch(() => setPlayingId(null));
    setPlayingId(id);
  };

  return { playingId, toggle };
}
