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

/** The fill each tone paints when the identity asks for a filled badge. */
const TONE_BACKGROUND: Record<BadgeColor, string> = {
  orange: "var(--local-provider-orange-background)",
  green: "var(--local-provider-green-background)",
  blue: "var(--local-provider-blue-background)",
  purple: "var(--local-provider-purple-background)",
  red: "var(--local-status-critical-soft-background)",
  secondary: "var(--local-status-neutral-soft-background)",
  healthy: "var(--local-status-healthy-soft-background)",
  warning: "var(--local-status-warning-soft-background)",
  high: "var(--local-status-high-soft-background)",
  critical: "var(--local-status-critical-soft-background)",
};

/**
 * Provider tones (orange/green/blue/purple) read the resolved provider identity
 * palette — they stay stable regardless of the theme accent and never carry
 * usage meaning. Severity tones (healthy/warning/high/critical) read the
 * status palette's soft badge pairs.
 *
 * Shape comes from the visual identity: radius, case, tracking, weight, and
 * whether the tone paints a fill at all. `--form-badge-background` is
 * `initial` for filled identities, so the `var()` fallback — this badge's own
 * tone — wins; bare identities set it to `transparent` and only the
 * foreground colour survives.
 */
export function Badge({ color = "secondary", size = "medium", className, children, ...rest }: BadgeProps) {
  const colors: Record<BadgeColor, string> = {
    orange: "text-ui-provider-orange-fg",
    green: "text-ui-provider-green-fg",
    blue: "text-ui-provider-blue-fg",
    purple: "text-ui-provider-purple-fg",
    red: "text-ui-status-critical-soft-fg",
    secondary: "text-ui-status-neutral-soft-fg",
    healthy: "text-ui-status-healthy-soft-fg",
    warning: "text-ui-status-warning-soft-fg",
    high: "text-ui-status-high-soft-fg",
    critical: "text-ui-status-critical-soft-fg",
  };
  const sizes: Record<"medium" | "small", string> = {
    medium: "h-5 px-1.5 text-[11px]",
    small: "h-[18px] px-1 text-[10px]",
  };

  return (
    <span
      style={{
        background: `var(--form-badge-background, ${TONE_BACKGROUND[color]})`,
        borderRadius: "var(--form-badge-radius)",
        textTransform: "var(--form-badge-transform)" as React.CSSProperties["textTransform"],
        letterSpacing: "var(--form-badge-tracking)",
        fontWeight: "var(--form-badge-weight)" as React.CSSProperties["fontWeight"],
      }}
      className={cn(
        "inline-flex shrink-0 items-center justify-center gap-0.5 leading-none",
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
