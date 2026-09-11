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
      onClick={onClick}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-full no-drag transition-colors disabled:opacity-40",
        iconOnly && size === "large" && "size-8",
        iconOnly && size === "medium" && "size-7",
        iconOnly && size === "small" && "size-6",
        !iconOnly && size === "small" && "h-7 px-2.5 text-[11px]",
        !iconOnly && size === "medium" && "h-8 px-3 text-[13px]",
        !iconOnly && size === "large" && "h-9 px-3.5 text-[13px]",
        variant === "glass" && "glass-button",
        variant === "filled" && "bg-control text-ink hover:bg-control",
        variant === "transparent" && "bg-transparent text-tertiary hover:bg-control-subtle",
        variant === "accent" && "bg-support-blue text-white hover:opacity-90",
        variant === "destructive" && "bg-support-red text-white hover:opacity-90",
        className,
      )}
    >
      {children}
    </button>
  );
});

