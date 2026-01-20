import type { IconProps } from "./IconProps";

export function StopIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" className={className}>
      <rect x="4" y="4" width="12" height="12" />
    </svg>
  );
}
