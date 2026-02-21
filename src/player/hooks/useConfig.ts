import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { Config } from "../types";
import type { ThemeMode } from "../types";
import {
  DEFAULT_VOLUME,
  clampVolume,
  hasMatchingUiPrefs,
  parseConfigVolume,
  parseThemeMode,
} from "../utils";

export interface UseConfigInput {
  volume: number;
  isMuted: boolean;
  themeMode: ThemeMode;
  setVolume: (v: number) => void;
  setIsMuted: (v: boolean) => void;
  setThemeMode: (v: ThemeMode | ((prev: ThemeMode) => ThemeMode)) => void;
  previousVolumeRef: MutableRefObject<number>;
  hasPendingUiPrefChangeRef: MutableRefObject<boolean>;
}

export function useConfig(input: UseConfigInput) {
  const {
    volume,
    isMuted,
    themeMode,
    setVolume,
    setIsMuted,
    setThemeMode,
    previousVolumeRef,
    hasPendingUiPrefChangeRef,
  } = input;

  const [config, setConfig] = useState<Config | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const hasHydratedUiPrefsRef = useRef(false);

  const applyUiPrefsFromConfig = useCallback((cfg: Config) => {
    const configVolume = parseConfigVolume(cfg.ui_volume);
    if (configVolume != null) {
      setVolume(configVolume);
      if (configVolume > 0) {
        previousVolumeRef.current = configVolume;
      }
    }
    if (cfg.ui_muted != null) {
      setIsMuted(cfg.ui_muted);
    }
    const parsedTheme = parseThemeMode(cfg.ui_theme);
    if (parsedTheme != null) {
      setThemeMode(parsedTheme);
    }
    return { configVolume, parsedTheme };
  }, [previousVolumeRef, setIsMuted, setThemeMode, setVolume]);

  const applyCurrentUiPrefsToConfig = useCallback(
    (baseConfig: Config): Config => ({
      ...baseConfig,
      ui_volume: clampVolume(volume),
      ui_muted: isMuted,
      ui_theme: themeMode,
    }),
    [isMuted, themeMode, volume],
  );

  useEffect(() => {
    void (async () => {
      try {
        const cfg = await invoke<Config>("get_config");
        const { configVolume, parsedTheme } = applyUiPrefsFromConfig(cfg);
        const normalizedConfig: Config = {
          ...cfg,
          ui_volume: configVolume ?? DEFAULT_VOLUME,
          ui_muted: cfg.ui_muted ?? false,
          ui_theme: parsedTheme ?? "dark",
        };
        setConfig(normalizedConfig);
        const shouldBackfillUiPrefs =
          cfg.ui_volume == null || cfg.ui_muted == null || parsedTheme == null;
        if (shouldBackfillUiPrefs) {
          await invoke("save_config", { configJson: JSON.stringify(normalizedConfig) });
        }
      } catch (e) {
        console.warn("[App] get_config failed:", e);
      } finally {
        setConfigLoaded(true);
      }
    })();
  }, [applyUiPrefsFromConfig]);

  useEffect(() => {
    const unlisten = listen("config-changed", async () => {
      try {
        const cfg = await invoke<Config>("get_config");
        setConfig(cfg);
        applyUiPrefsFromConfig(cfg);
      } catch (e) {
        console.warn("[App] config-changed get_config failed:", e);
      }
    });
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [applyUiPrefsFromConfig]);

  useEffect(() => {
    if (!configLoaded) return;
    if (!hasHydratedUiPrefsRef.current) {
      hasHydratedUiPrefsRef.current = true;
      if (!hasPendingUiPrefChangeRef.current) return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const latestConfig = await invoke<Config>("get_config");
        const nextConfig = applyCurrentUiPrefsToConfig(latestConfig);
        if (hasMatchingUiPrefs(latestConfig, nextConfig)) {
          hasPendingUiPrefChangeRef.current = false;
          return;
        }
        if (!cancelled) setConfig(nextConfig);
        await invoke("save_config", { configJson: JSON.stringify(nextConfig) });
        hasPendingUiPrefChangeRef.current = false;
      } catch (e) {
        if (!cancelled) console.warn("[App] save_config failed:", e);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [applyCurrentUiPrefsToConfig, configLoaded]);

  const saveConfigBeforeClose = useCallback(async () => {
    try {
      const latestConfig = await invoke<Config>("get_config");
      const nextConfig = applyCurrentUiPrefsToConfig(latestConfig);
      if (!hasMatchingUiPrefs(latestConfig, nextConfig)) {
        await invoke("save_config", { configJson: JSON.stringify(nextConfig) });
        hasPendingUiPrefChangeRef.current = false;
      }
    } catch (e) {
      console.warn("[App] pre-close save_config failed:", e);
    }
  }, [applyCurrentUiPrefsToConfig]);

  return {
    config,
    configLoaded,
    applyUiPrefsFromConfig,
    applyCurrentUiPrefsToConfig,
    saveConfigBeforeClose,
  };
}
