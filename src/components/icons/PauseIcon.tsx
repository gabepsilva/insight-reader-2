import type { IconProps } from "./IconProps";

export function PauseIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" className={className}>
      <rect x="6" y="4" width="3" height="12" />
      <rect x="11" y="4" width="3" height="12" />
    </svg>
  );
}
