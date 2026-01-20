import type { IconProps } from "./IconProps";

export function PencilIcon({ size = 20, className }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" className={className}>
      <path d="M2.5 14.375V17.5h3.125L14.84 8.28l-3.125-3.125L2.5 14.375zM17.26 5.87c.325-.325.325-.85 0-1.175l-1.95-1.95a.83.83 0 00-1.175 0l-1.525 1.525 3.125 3.125 1.525-1.525z" />
    </svg>
  );
}
