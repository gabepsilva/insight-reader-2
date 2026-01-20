import type { IconProps } from "./IconProps";

export function MinimizeIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M4 9h12v2H4z" />
    </svg>
  );
}
