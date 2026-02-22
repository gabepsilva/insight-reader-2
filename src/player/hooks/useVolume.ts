import { useEffect, useRef, useState, type MutableRefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { DEFAULT_VOLUME } from "../utils";

export function useVolume(_hasPendingUiPrefChangeRef: MutableRefObject<boolean>) {
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

  return {
    volume,
    setVolume,
    isMuted,
    setIsMuted,
    previousVolumeRef,
  };
}
