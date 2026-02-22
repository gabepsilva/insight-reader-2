export type ThemeMode = "dark" | "light";

export interface Config {
  voice_provider: string | null;
  selected_voice: string | null;
  selected_polly_voice: string | null;
  selected_microsoft_voice: string | null;
  ui_volume?: number | null;
  ui_muted?: boolean | null;
  ui_theme?: string | null;
  ui_playback_speed?: number | null;
}

export const PROVIDER_LABELS: Record<string, string> = {
  piper: "Piper",
  polly: "AWS Polly",
  microsoft: "Microsoft",
};

export function getProviderLabel(provider: string | null): string {
  if (!provider) return "Microsoft";
  return PROVIDER_LABELS[provider] ?? provider;
}

export function getVoiceLabel(config: Config): string {
  const provider = config.voice_provider ?? "microsoft";
  switch (provider) {
    case "piper":
      return config.selected_voice ?? "Not selected";
    case "polly":
      return config.selected_polly_voice ?? "Not selected";
    case "microsoft": {
      const voice = config.selected_microsoft_voice ?? "Not selected";
      return voice.replace(/^Microsoft Server Speech Text to Speech Voice \(/, "(");
    }
    default:
      return "Not selected";
  }
}
