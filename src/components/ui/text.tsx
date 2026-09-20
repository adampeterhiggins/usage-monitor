import * as React from "react";

import { cn } from "../../lib/utils";

/** `usage-*` variants read the active visual identity's `--form-*` tokens.
 *  The fixed variants stay fixed — identity re-proportions the usage surfaces,
 *  not every label in the app. */
type Variant =
  | "body"
  | "small"
  | "mini"
  | "strong"
  | "small-strong"
  | "large-strong"
  | "usage-label"
  | "usage-value"
  | "usage-caption"
  | "usage-account";

type Color = "default" | "secondary" | "tertiary" | "quaternary" | "red" | "orange";

interface TextProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: Variant;
  color?: Color;
  children: React.ReactNode;
}

export function Text({ variant = "body", color = "default", className, children, ...rest }: TextProps) {
  const variants: Record<Variant, string> = {
    body: "text-[13px] leading-[18px]",
    small: "text-[11px] leading-[14px]",
    mini: "text-[10px] leading-[13px]",
    strong: "text-[13px] leading-[18px] font-semibold",
    "small-strong": "text-[12px] leading-[16px] font-semibold",
    "large-strong": "text-[15px] leading-[19px] font-semibold",
    "usage-label":
      "leading-[1.3] [font-size:var(--form-label-size)] [font-weight:var(--form-label-weight)] [text-transform:var(--form-label-transform)] [letter-spacing:var(--form-label-tracking)]",
    "usage-value":
      "leading-[1.3] tabular-nums [font-size:var(--form-value-size)] [font-weight:var(--form-value-weight)]",
    "usage-caption": "leading-[1.35] [font-size:var(--form-caption-size)]",
    "usage-account":
      "leading-[1.3] [font-size:var(--form-account-size)] [font-weight:var(--form-account-weight)]",
  };

  const colors: Record<Color, string> = {
    default: "text-ui-primary",
    secondary: "text-ui-secondary",
    tertiary: "text-ui-tertiary",
    quaternary: "text-ui-placeholder",
    red: "text-ui-status-critical-text",
    orange: "text-ui-status-high-text",
  };

  return (
    <span className={cn(variants[variant], colors[color], className)} {...rest}>
      {children}
    </span>
  );
}
