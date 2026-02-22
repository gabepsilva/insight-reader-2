export type AssistantTabId = "tone" | "format" | "quick" | "prompt";

export interface ToneOption {
  id: string;
  label: string;
  icon: string;
  description: string;
}

export interface FormatOption {
  id: string;
  label: string;
  icon: string;
  subOptions: string[];
}

export interface QuickEditOption {
  label: string;
  icon: string;
}

export const ASSISTANT_TABS: ReadonlyArray<{ id: AssistantTabId; label: string }> = [
  { id: "tone", label: "Tone" },
  { id: "format", label: "Format" },
  { id: "quick", label: "Edits" },
  { id: "prompt", label: "Prompt" },
];

export const TONE_OPTIONS: ReadonlyArray<ToneOption> = [
  {
    id: "professional",
    label: "Professional",
    icon: "💼",
    description: "Clear and authoritative",
  },
  {
    id: "friendly",
    label: "Friendly",
    icon: "😊",
    description: "Warm and approachable",
  },
  {
    id: "concise",
    label: "Concise",
    icon: "⚡",
    description: "Short and direct",
  },
  {
    id: "formal",
    label: "Formal",
    icon: "🎩",
    description: "Structured and precise",
  },
  {
    id: "casual",
    label: "Casual",
    icon: "✌️",
    description: "Relaxed and human",
  },
  {
    id: "confident",
    label: "Confident",
    icon: "🎯",
    description: "Bold and assertive",
  },
];

export const FORMAT_OPTIONS: ReadonlyArray<FormatOption> = [
  {
    id: "email",
    label: "Email",
    icon: "✉️",
    subOptions: ["Cold outreach", "Follow-up", "Internal", "Support reply"],
  },
  {
    id: "im",
    label: "IM / Slack",
    icon: "💬",
    subOptions: ["Quick update", "Announcement", "DM", "Thread reply"],
  },
  {
    id: "doc",
    label: "Document",
    icon: "📄",
    subOptions: ["Report", "Proposal", "Brief", "Spec"],
  },
  {
    id: "social",
    label: "Social",
    icon: "📣",
    subOptions: ["LinkedIn", "Twitter/X", "Newsletter", "Blog"],
  },
];

export const QUICK_EDIT_OPTIONS: ReadonlyArray<QuickEditOption> = [
  { label: "Make shorter", icon: "✂️" },
  { label: "Simplify language", icon: "🔤" },
  { label: "Add call to action", icon: "👉" },
  { label: "Fix grammar", icon: "✅" },
  { label: "More persuasive", icon: "💡" },
  { label: "Add subject line", icon: "📌" },
];
