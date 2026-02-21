import { useRef, useState, useEffect } from "react";
import { useConfig } from "./hooks/useConfig";
import { useTtsPlayback } from "./hooks/useTtsPlayback";
import { useWindowChrome } from "./hooks/useWindowChrome";
import { useVolume } from "./hooks/useVolume";
import { PlayerCardHeader } from "./PlayerCardHeader";
import { TimeDisplay } from "./TimeDisplay";
import { ControlsRow } from "./ControlsRow";
import { VolumeRow } from "./VolumeRow";
import { ActionRow } from "./ActionRow";
import { StatusBar } from "./StatusBar";
import { ResizeGrip } from "./ResizeGrip";

export function PlayerCard() {
  const hasPendingUiPrefChangeRef = useRef(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [showTooltip, setShowTooltip] = useState(false);
  const [isSummarizing, setIsSummarizing] = useState(false);

  const volumeState = useVolume(hasPendingUiPrefChangeRef);
  const windowChrome = useWindowChrome(hasPendingUiPrefChangeRef);
  const configState = useConfig({
    volume: volumeState.volume,
    isMuted: volumeState.isMuted,
    themeMode: windowChrome.themeMode,
    setVolume: volumeState.setVolume,
    setIsMuted: volumeState.setIsMuted,
    setThemeMode: windowChrome.setThemeMode,
    previousVolumeRef: volumeState.previousVolumeRef,
    hasPendingUiPrefChangeRef,
  });
  const ttsState = useTtsPlayback(windowChrome.platform);

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
      />
      <div className="card-content">
        <TimeDisplay
          currentTimeMs={ttsState.currentTimeMs}
          totalTimeMs={ttsState.totalTimeMs}
        />
        <ControlsRow
          isPlaying={ttsState.isPlaying}
          isPaused={ttsState.isPaused}
          currentTimeMs={ttsState.currentTimeMs}
          atEnd={ttsState.atEnd}
          platform={windowChrome.platform}
          onBackward={ttsState.handleBackward}
          onForward={ttsState.handleForward}
          onPlayPause={ttsState.handlePlayPause}
          onStop={ttsState.handleStop}
        />
        <VolumeRow
          effectiveVolume={volumeState.effectiveVolume}
          isMuted={volumeState.isMuted}
          onMuteToggle={volumeState.handleMuteToggle}
          onVolumeChange={volumeState.handleVolumeChange}
        />
        <ActionRow
          platform={windowChrome.platform}
          isSummarizing={isSummarizing}
          onSummarizingChange={setIsSummarizing}
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
