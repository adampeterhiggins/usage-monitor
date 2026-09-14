import * as React from "react";

import { cn } from "../../lib/utils";

export type BadgeColor =
  | "orange"
  | "green"
  | "blue"
  | "purple"
  | "red"
  | "secondary"
  | "healthy"
  | "warning"
  | "high"
  | "critical";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  color?: BadgeColor;
  size?: "medium" | "small";
  children: React.ReactNode;
}

/**
 * Provider tones (orange/green/blue/purple) read the resolved provider identity
 * palette — they stay stable regardless of the theme accent and never carry
 * usage meaning. Severity tones (healthy/warning/high/critical) read the
 * status palette's soft badge pairs.
 */
export function Badge({ color = "secondary", size = "medium", className, children, ...rest }: BadgeProps) {
  const colors: Record<BadgeColor, string> = {
    orange: "bg-ui-provider-orange text-ui-provider-orange-fg",
    green: "bg-ui-provider-green text-ui-provider-green-fg",
    blue: "bg-ui-provider-blue text-ui-provider-blue-fg",
    purple: "bg-ui-provider-purple text-ui-provider-purple-fg",
    red: "bg-ui-status-critical-soft text-ui-status-critical-soft-fg",
    secondary: "bg-ui-status-neutral-soft text-ui-status-neutral-soft-fg",
    healthy: "bg-ui-status-healthy-soft text-ui-status-healthy-soft-fg",
    warning: "bg-ui-status-warning-soft text-ui-status-warning-soft-fg",
    high: "bg-ui-status-high-soft text-ui-status-high-soft-fg",
    critical: "bg-ui-status-critical-soft text-ui-status-critical-soft-fg",
  };
  const sizes: Record<"medium" | "small", string> = {
    medium: "h-5 rounded-[6px] px-1.5 text-[11px]",
    small: "h-[18px] rounded-[5px] px-1 text-[10px]",
  };

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-0.5 font-medium leading-none",
        sizes[size],
        colors[color],
        className,
      )}
      {...rest}
    >
      {children}
    </span>
  );
}
