import { emit, listen } from "@tauri-apps/api/event";

export type AppStatusTone = "info" | "success" | "warning" | "error";

export interface AppStatusMessage {
  text: string;
  tone?: AppStatusTone;
  ttlMs?: number;
}

const APP_STATUS_EVENT = "app-status-message";

function normalizeStatusMessage(
  message: string | AppStatusMessage,
): AppStatusMessage {
  if (typeof message === "string") {
    return { text: message };
  }

  return {
    text: message.text ?? "",
    tone: message.tone ?? "info",
    ttlMs: message.ttlMs,
  };
}

export async function publishAppStatus(
  message: string | AppStatusMessage,
): Promise<void> {
  const payload = normalizeStatusMessage(message);
  await emit(APP_STATUS_EVENT, payload);
}

export async function clearAppStatus(): Promise<void> {
  await emit(APP_STATUS_EVENT, { text: "", tone: "info" } as AppStatusMessage);
}

export function listenAppStatus(
  handler: (message: AppStatusMessage) => void,
): () => void {
  let active = true;
  const unlistenPromise = listen<string | AppStatusMessage>(
    APP_STATUS_EVENT,
    (event) => {
      if (!active) return;
      handler(normalizeStatusMessage(event.payload));
    },
  );

  return () => {
    active = false;
    unlistenPromise.then(
      (unlistenFn) => unlistenFn(),
      () => {},
    );
  };
}

export async function waitForUiUpdate(): Promise<void> {
  await new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });
}
