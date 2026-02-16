import type { IconProps } from "./IconProps";

export function SummaryIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M3.5 4.5h13" />
      <path d="M3.5 8h9.5" />
      <path d="M3.5 11.5h8" />
      <path d="M3.5 15h7" />
      <path d="M15.5 9.5l.7 1.4 1.6.2-1.15 1.1.27 1.6-1.42-.75-1.42.75.27-1.6-1.15-1.1 1.6-.2.7-1.4z" />
    </svg>
  );
}
