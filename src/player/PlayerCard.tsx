import { useRef, useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useConfig } from "./hooks/useConfig";
import { useTtsPlayback } from "./hooks/useTtsPlayback";
import { useWindowChrome } from "./hooks/useWindowChrome";
import { useWindowRadius } from "./hooks/useWindowRadius";
import { useVolume } from "./hooks/useVolume";
import { DEFAULT_PLAYBACK_SPEED } from "./utils";
import { PlayerCardHeader } from "./PlayerCardHeader";
import { TimeDisplay } from "./TimeDisplay";
import { ControlsRow } from "./ControlsRow";
import { ActionRow } from "./ActionRow";
import { StatusBar } from "./StatusBar";
import { ResizeGrip } from "./ResizeGrip";

export function PlayerCard() {
  const hasPendingUiPrefChangeRef = useRef(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [summaryMuted, setSummaryMuted] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(DEFAULT_PLAYBACK_SPEED);

  const volumeState = useVolume(hasPendingUiPrefChangeRef);
  const windowChrome = useWindowChrome(hasPendingUiPrefChangeRef);
  useWindowRadius();
  const configState = useConfig({
    volume: volumeState.volume,
    isMuted: volumeState.isMuted,
    themeMode: windowChrome.themeMode,
    playbackSpeed,
    setVolume: volumeState.setVolume,
    setIsMuted: volumeState.setIsMuted,
    setThemeMode: windowChrome.setThemeMode,
    setPlaybackSpeed,
    previousVolumeRef: volumeState.previousVolumeRef,
    hasPendingUiPrefChangeRef,
  });
  const ttsState = useTtsPlayback(windowChrome.platform);

  useEffect(() => {
    if (!configState.configLoaded) return;
    invoke("tts_set_speed", { speed: playbackSpeed }).catch((e) =>
      console.warn("tts_set_speed on load failed:", e)
    );
  }, [configState.configLoaded, playbackSpeed]);

  useEffect(() => {
    if (typeof console === "undefined") return;
    const originalError = console.error;
    console.error = (...args) => {
      originalError.apply(console, args);
      const msg = args
        .map((a) => {
          try {
            return typeof a === "object" ? JSON.stringify(a) : String(a);
          } catch {
            return "[unserializable]";
          }
        })
        .join(" ");
      setErrors((prev) => [...prev, msg].slice(-5));
    };
    return () => {
      console.error = originalError;
    };
  }, []);

  const handleClose = () =>
    windowChrome.handleClose(configState.saveConfigBeforeClose);

  return (
    <main
      className={`main-shell main-shell--${windowChrome.themeMode}`}
      data-tauri-drag-region
      onMouseDown={windowChrome.handleMouseDown}
    >
      <section className="player-card">
      <PlayerCardHeader
        themeMode={windowChrome.themeMode}
        onThemeToggle={windowChrome.handleThemeToggle}
        onOpenSettings={windowChrome.handleOpenSettings}
        onMinimize={windowChrome.handleMinimize}
        onClose={handleClose}
        errors={errors}
        showTooltip={showTooltip}
        onTooltipEnter={() => setShowTooltip(true)}
        onTooltipLeave={() => setShowTooltip(false)}
        platform={windowChrome.platform}
      />
      <div className="card-content">
        <TimeDisplay
          currentTimeMs={ttsState.currentTimeMs}
          totalTimeMs={ttsState.totalTimeMs}
        />
        <ControlsRow
          isPlaying={ttsState.isPlaying}
          isPaused={ttsState.isPaused}
          isPreparing={ttsState.isPreparing}
          currentTimeMs={ttsState.currentTimeMs}
          atEnd={ttsState.atEnd}
          platform={windowChrome.platform}
          playbackSpeed={playbackSpeed}
          onPlaybackSpeedChange={(speed) => {
            hasPendingUiPrefChangeRef.current = true;
            setPlaybackSpeed(speed);
            invoke("tts_set_speed", { speed }).catch((e) =>
              console.warn("tts_set_speed failed:", e)
            );
          }}
          onBackward={ttsState.handleBackward}
          onForward={ttsState.handleForward}
          onPlayPause={ttsState.handlePlayPause}
          onStop={ttsState.handleStop}
        />
        <ActionRow
          platform={windowChrome.platform}
          isSummarizing={isSummarizing}
          onSummarizingChange={setIsSummarizing}
          summaryMuted={summaryMuted}
          onSummaryMutedChange={setSummaryMuted}
          onErrorsAdd={(msg) =>
            setErrors((prev) => [...prev.slice(-4), msg])
          }
        />
      </div>
      <StatusBar config={configState.config} />
      <ResizeGrip
        windowSize={windowChrome.windowSize}
        hovered={windowChrome.resizeGripHovered}
        onMouseEnter={() => windowChrome.setResizeGripHovered(true)}
        onMouseLeave={() => windowChrome.setResizeGripHovered(false)}
      />
    </section>
    </main>
  );
}
