import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export function useTtsPlayback(platform: string | null) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [totalTimeMs, setTotalTimeMs] = useState(0);
  const [atEnd, setAtEnd] = useState(false);

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const status = await invoke<[boolean, boolean]>("tts_get_status");
        const [isPlayingBackend, isPausedBackend] = status;
        setIsPlaying(isPlayingBackend && !isPausedBackend);
        setIsPaused(isPausedBackend);
        if (isPlayingBackend) {
          const position = await invoke<[number, number]>("tts_get_position");
          const [currentMs, totalMs] = position;
          if (totalMs > 0) {
            setCurrentTimeMs(currentMs);
            setTotalTimeMs(totalMs);
          }
          setAtEnd(currentMs >= totalMs);
        } else {
          setCurrentTimeMs(0);
          setTotalTimeMs(0);
          setAtEnd(false);
        }
      } catch {
        setIsPlaying(false);
        setIsPaused(false);
        setCurrentTimeMs(0);
        setTotalTimeMs(0);
        setAtEnd(false);
      }
    }, 500);
    return () => clearInterval(interval);
  }, []);

  const handlePlayPause = async () => {
    try {
      const [isPlayingBackend] = await invoke<[boolean, boolean]>("tts_get_status");
      if (isPlayingBackend) {
        const newPausedState = await invoke<boolean>("tts_toggle_pause");
        setIsPlaying(!newPausedState);
      } else {
        const cmd = platform === "macos" ? "get_clipboard_text" : "get_selected_text";
        const text = await invoke<string | null>(cmd);
        if (text != null && text.length > 0) {
          await invoke("tts_speak", { text });
          setIsPlaying(true);
        }
      }
    } catch (e) {
      console.error("handlePlayPause failed:", e);
    }
  };

  const handleStop = async () => {
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentTimeMs(0);
    setTotalTimeMs(0);
    setAtEnd(false);
    try {
      await invoke("tts_stop");
    } catch (e) {
      console.warn("tts_stop failed:", e);
    }
  };

  const handleSeek = async (offsetMs: number, disabled: boolean) => {
    if (disabled) return;
    try {
      await invoke<[boolean, boolean, boolean]>("tts_seek", { offsetMs });
      const [currentMs, totalMs] = await invoke<[number, number]>("tts_get_position");
      setAtEnd(currentMs >= totalMs);
      setCurrentTimeMs(currentMs);
    } catch (e) {
      console.warn("tts_seek failed:", e);
    }
  };

  const handleBackward = () => handleSeek(-5000, isPaused || currentTimeMs < 5000);
  const handleForward = () => handleSeek(5000, isPaused || atEnd);

  return {
    isPlaying,
    isPaused,
    currentTimeMs,
    totalTimeMs,
    atEnd,
    handlePlayPause,
    handleStop,
    handleBackward,
    handleForward,
  };
}
