import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

const POLL_FAST_MS = 500;
const POLL_SLOW_MS = 10000;

/**
 * Polls backend GET /health. Uses 2s interval until first success, then 10s.
 * Returns true when backend is reachable.
 */
export function useBackendHealth(): boolean {
  const [healthy, setHealthy] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const intervalMsRef = useRef(POLL_FAST_MS);

  useEffect(() => {
    const schedule = (ms: number) => {
      intervalMsRef.current = ms;
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = setInterval(check, ms);
    };

    const check = async () => {
      try {
        const ok = await invoke<boolean>("backend_health_check");
        setHealthy(ok);
        const current = intervalMsRef.current;
        if (ok && current === POLL_FAST_MS) {
          schedule(POLL_SLOW_MS);
        } else if (!ok && current === POLL_SLOW_MS) {
          schedule(POLL_FAST_MS);
        }
      } catch {
        setHealthy(false);
        if (intervalMsRef.current === POLL_SLOW_MS) {
          schedule(POLL_FAST_MS);
        }
      }
    };

    check();
    schedule(POLL_FAST_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, []);

  return healthy;
}
