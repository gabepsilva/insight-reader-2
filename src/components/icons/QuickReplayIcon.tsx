import type { IconProps } from "./IconProps";

export function QuickReplayIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.1"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <rect x="2.5" y="4.5" width="15" height="11" rx="2.2" />
      <path d="M3.5 6l6.5 5 6.5-5" />
    </svg>
  );
}
