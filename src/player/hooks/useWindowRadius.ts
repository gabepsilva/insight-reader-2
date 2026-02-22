import { useEffect } from "react";
import { usePlatform } from "./usePlatform";

/** Platform-specific window corner radius in px. Mac: 10, others: 0 for now. */
const WINDOW_RADIUS_MACOS = 10;
const WINDOW_RADIUS_DEFAULT = 0;

/**
 * Sets --window-radius CSS variable based on platform.
 * Mac-only for now; Linux/Windows will use different values later.
 */
export function useWindowRadius(): void {
  const platform = usePlatform();

  useEffect(() => {
    const radius =
      platform === "macos" ? WINDOW_RADIUS_MACOS : WINDOW_RADIUS_DEFAULT;
    document.documentElement.style.setProperty(
      "--window-radius",
      `${radius}px`,
    );
  }, [platform]);
}
