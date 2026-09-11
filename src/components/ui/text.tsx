import * as React from "react";

import { cn } from "../../lib/utils";

type Variant = "body" | "small" | "mini" | "strong" | "small-strong" | "large-strong";

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
