import type { IconProps } from "./IconProps";

export function PlayIcon({ size = 20, className }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
    >
      <path d="M6 4l12 6-12 6V4z" />
    </svg>
  );
}
