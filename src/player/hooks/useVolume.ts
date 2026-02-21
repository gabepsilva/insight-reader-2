import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_VOLUME, clampVolume, getRestoredVolume } from "../utils";

export function useVolume(hasPendingUiPrefChangeRef: MutableRefObject<boolean>) {
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [isMuted, setIsMuted] = useState(false);
  const previousVolumeRef = useRef(DEFAULT_VOLUME);
  const effectiveVolume = isMuted ? 0 : volume;

  useEffect(() => {
    const sync = async (volumePercent: number) => {
      try {
        await invoke("tts_set_volume", { volumePercent });
      } catch (e) {
        console.warn("tts_set_volume failed:", e);
      }
    };
    void sync(effectiveVolume);
  }, [effectiveVolume]);

  const handleMuteToggle = useCallback(() => {
    hasPendingUiPrefChangeRef.current = true;
    if (isMuted) {
      const restored = getRestoredVolume(volume, previousVolumeRef.current);
      setVolume(restored);
      setIsMuted(false);
      return;
    }
    if (volume > 0) previousVolumeRef.current = volume;
    setIsMuted(true);
  }, [isMuted, volume]);

  const handleVolumeChange = useCallback((rawValue: string) => {
    const nextValue = Number.parseInt(rawValue, 10);
    if (Number.isNaN(nextValue)) return;
    hasPendingUiPrefChangeRef.current = true;
    const clamped = clampVolume(nextValue);
    setVolume(clamped);
    if (clamped === 0) {
      setIsMuted(true);
      return;
    }
    previousVolumeRef.current = clamped;
    setIsMuted(false);
  }, []);

  return {
    volume,
    setVolume,
    isMuted,
    setIsMuted,
    previousVolumeRef,
    effectiveVolume,
    handleMuteToggle,
    handleVolumeChange,
  };
}
