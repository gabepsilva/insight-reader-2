import type { ComponentType } from "react";
import type { IconProps } from "../icons";
import {
  ArrowRightIcon,
  BriefcaseIcon,
  CasualWaveIcon,
  ChatBubbleIcon,
  CheckBadgeIcon,
  DocumentIcon,
  EmailIcon,
  LettersIcon,
  LightbulbIcon,
  MegaphoneIcon,
  PinIcon,
  ScissorsIcon,
  SmileIcon,
  TargetIcon,
} from "../icons";

export type AssistantTabId = "tone" | "format" | "quick" | "prompt";

type IconComponent = ComponentType<IconProps>;

export interface ToneOption {
  id: string;
  label: string;
  icon: IconComponent;
  description: string;
}

export interface FormatOption {
  id: string;
  label: string;
  icon: IconComponent;
  subOptions: string[];
}

export interface QuickEditOption {
  label: string;
  icon: IconComponent;
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
    icon: BriefcaseIcon,
    description: "Clear and authoritative",
  },
  {
    id: "friendly",
    label: "Friendly",
    icon: SmileIcon,
    description: "Warm and approachable",
  },
  {
    id: "concise",
    label: "Concise",
    icon: LettersIcon,
    description: "Short and direct",
  },
  {
    id: "casual",
    label: "Casual",
    icon: CasualWaveIcon,
    description: "Relaxed and human",
  },
  {
    id: "confident",
    label: "Confident",
    icon: TargetIcon,
    description: "Bold and assertive",
  },
];

export const FORMAT_OPTIONS: ReadonlyArray<FormatOption> = [
  {
    id: "email",
    label: "Email",
    icon: EmailIcon,
    subOptions: ["Cold outreach", "Follow-up", "Internal", "Support reply"],
  },
  {
    id: "im",
    label: "IM / Slack",
    icon: ChatBubbleIcon,
    subOptions: ["Quick update", "Announcement", "DM", "Thread reply"],
  },
  {
    id: "doc",
    label: "Document",
    icon: DocumentIcon,
    subOptions: ["Report", "Proposal", "Brief", "Spec"],
  },
  {
    id: "social",
    label: "Social",
    icon: MegaphoneIcon,
    subOptions: ["LinkedIn", "Twitter/X", "Newsletter", "Blog"],
  },
];

export const QUICK_EDIT_OPTIONS: ReadonlyArray<QuickEditOption> = [
  { label: "Make shorter", icon: ScissorsIcon },
  { label: "Simplify language", icon: LettersIcon },
  { label: "Add call to action", icon: ArrowRightIcon },
  { label: "Fix grammar", icon: CheckBadgeIcon },
  { label: "More persuasive", icon: LightbulbIcon },
  { label: "Add subject line", icon: PinIcon },
];
