import { useEffect, useState, type MouseEvent, type MutableRefObject } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";
import type { ThemeMode } from "../types";
import { useWindowSize } from "./useWindowSize";

export function useWindowChrome(hasPendingUiPrefChangeRef: MutableRefObject<boolean>) {
  const windowSize = useWindowSize();
  const [platform, setPlatform] = useState<string | null>(null);
  const [resizeGripHovered, setResizeGripHovered] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");

  useEffect(() => {
    invoke<string>("get_platform")
      .then(setPlatform)
      .catch(() => setPlatform(null));
  }, []);

  const handleMouseDown = async (e: MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.closest("button, input, [data-no-drag='true']")) return;
    const appWindow = getCurrentWindow();
    await appWindow.startDragging();
  };

  const handleMinimize = async () => {
    const appWindow = getCurrentWindow();
    await appWindow.minimize();
  };

  const handleClose = async (saveConfigBeforeClose: () => Promise<void>) => {
    await saveConfigBeforeClose();
    const appWindow = getCurrentWindow();
    await appWindow.close();
  };

  const handleOpenSettings = () => {
    void invoke("open_settings_window");
  };

  const handleThemeToggle = () => {
    hasPendingUiPrefChangeRef.current = true;
    setThemeMode((current) => (current === "dark" ? "light" : "dark"));
  };

  return {
    windowSize,
    platform,
    resizeGripHovered,
    setResizeGripHovered,
    themeMode,
    setThemeMode,
    handleMouseDown,
    handleMinimize,
    handleClose,
    handleOpenSettings,
    handleThemeToggle,
  };
}
