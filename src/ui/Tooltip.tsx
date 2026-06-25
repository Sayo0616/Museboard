import type { PropsWithChildren } from "react";

type TooltipProps = PropsWithChildren<{
  label: string;
}>;

export function Tooltip({ label, children }: TooltipProps) {
  return (
    <span className="tooltip-wrap" data-tooltip={label}>
      {children}
    </span>
  );
}
