import * as React from "react";
import { cn } from "../../lib/utils";

export const Button = React.forwardRef<
  HTMLButtonElement,
  {
    children: React.ReactNode;
    onClick?: React.MouseEventHandler<HTMLButtonElement>;
    disabled?: boolean;
    variant?: "filled" | "glass" | "transparent" | "accent" | "destructive";
    size?: "small" | "medium" | "large";
    iconOnly?: boolean;
    className?: string;
    style?: React.CSSProperties;
    type?: "button" | "submit";
    "aria-label"?: string;
  }
>(function Button(
  {
    children,
    onClick,
    disabled,
    variant = "filled",
    size = "medium",
    iconOnly,
    className,
    style,
    type = "button",
    "aria-label": ariaLabel,
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={ariaLabel}
      disabled={disabled}
      data-variant={variant}
      onClick={onClick}
      style={style}
      className={cn(
        "ui-button inline-flex items-center justify-center gap-1.5 rounded-full no-drag transition-colors disabled:opacity-40",
        iconOnly && size === "large" && "size-8",
        iconOnly && size === "medium" && "size-7",
        iconOnly && size === "small" && "size-6",
        !iconOnly && size === "small" && "h-7 px-2.5 text-[11px]",
        !iconOnly && size === "medium" && "h-8 px-3 text-[13px]",
        !iconOnly && size === "large" && "h-9 px-3.5 text-[13px]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ui-focus/40",
        variant === "glass" && "glass-button",
        variant === "filled" &&
          "bg-ui-control text-ui-control-fg hover:bg-ui-control-hover hover:text-ui-control-hover-fg active:bg-ui-control-pressed active:text-ui-control-pressed-fg",
        variant === "transparent" &&
          "bg-transparent text-ui-tertiary hover:bg-ui-control-hover hover:text-ui-primary",
        variant === "accent" &&
          "bg-ui-action text-ui-action-fg hover:bg-ui-action-hover hover:text-ui-action-hover-fg active:bg-ui-action-pressed active:text-ui-action-pressed-fg",
        variant === "destructive" &&
          "bg-ui-destructive text-ui-destructive-fg hover:bg-ui-destructive-hover hover:text-ui-destructive-hover-fg active:bg-ui-destructive-pressed active:text-ui-destructive-pressed-fg",
        className,
      )}
    >
      {children}
    </button>
  );
});
