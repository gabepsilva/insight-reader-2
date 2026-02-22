import type { Config } from "./types";
import type { ThemeMode } from "./types";

export const DEFAULT_VOLUME = 80;

export function formatTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function clampVolume(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function parseConfigVolume(value: number | null | undefined): number | null {
  if (value == null) return null;
  if (!Number.isFinite(value)) return null;
  return clampVolume(Math.round(value));
}

export function parseThemeMode(value: string | null | undefined): ThemeMode | null {
  if (value === "dark" || value === "light") return value;
  return null;
}

export const PLAYBACK_SPEEDS = [0.75, 1, 1.25, 1.5, 1.75, 2] as const;

function isValidPlaybackSpeed(value: number): boolean {
  return (PLAYBACK_SPEEDS as readonly number[]).includes(value);
}

export function parseConfigPlaybackSpeed(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 100) / 100;
  return isValidPlaybackSpeed(rounded) ? rounded : null;
}

export const DEFAULT_PLAYBACK_SPEED = 1;

export function getRestoredVolume(currentVolume: number, previousVolume: number): number {
  if (currentVolume > 0) return currentVolume;
  if (previousVolume > 0) return previousVolume;
  return DEFAULT_VOLUME;
}

export function hasMatchingUiPrefs(left: Config, right: Config): boolean {
  return (
    (left.ui_volume ?? null) === (right.ui_volume ?? null) &&
    (left.ui_muted ?? null) === (right.ui_muted ?? null) &&
    (left.ui_theme ?? null) === (right.ui_theme ?? null) &&
    (left.ui_playback_speed ?? null) === (right.ui_playback_speed ?? null)
  );
}
