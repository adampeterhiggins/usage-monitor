import * as React from "react";
import { clsx } from "clsx";

export function cn(...inputs: Array<string | false | null | undefined>) {
  return clsx(inputs);
}

export function Text({
  children,
  variant = "body",
  color = "primary",
  className,
}: {
  children: React.ReactNode;
  variant?: "body" | "strong" | "small" | "small-strong" | "mini" | "large-strong";
  color?: "primary" | "secondary" | "tertiary" | "quaternary" | "red" | "orange";
  className?: string;
}) {
  return (
    <span
      className={cn(
        variant === "strong" && "text-[13px] font-medium leading-[18px]",
        variant === "small" && "text-[11px] font-normal leading-[14px]",
        variant === "small-strong" && "text-[11px] font-medium leading-[14px]",
        variant === "mini" && "text-[8px] font-normal leading-[10px]",
        variant === "large-strong" && "text-[16px] font-medium leading-[22px]",
        variant === "body" && "text-[13px] font-normal leading-[18px]",
        color === "primary" && "text-ink",
        color === "secondary" && "text-secondary",
        color === "tertiary" && "text-tertiary",
        color === "quaternary" && "text-quaternary",
        color === "red" && "text-support-red",
        color === "orange" && "text-support-orange",
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Badge({
  children,
  color,
  size = "medium",
  className,
}: {
  children: React.ReactNode;
  color: "orange" | "green" | "blue" | "red" | "yellow" | "secondary";
  size?: "small" | "medium";
  className?: string;
}) {
  const tones: Record<string, string> = {
    orange: "text-support-orange bg-support-orange/10",
    green: "text-support-green bg-support-green/10",
    blue: "text-support-blue bg-support-blue/10",
    red: "text-support-red bg-support-red/10",
    yellow: "text-support-yellow bg-support-yellow/10",
    secondary: "text-secondary bg-control-subtle",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full font-medium",
        size === "small" ? "px-1.5 py-px text-[10px]" : "px-2 py-0.5 text-[11px] leading-[14px]",
        tones[color],
        className,
      )}
    >
      {children}
    </span>
  );
}

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

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-8 w-full rounded-lg border border-separator bg-surface px-2.5 text-[13px] text-ink outline-none",
        "placeholder:text-quaternary focus:ring-2 focus:ring-support-blue/30",
        className,
      )}
    />
  );
}

export function EmptyState({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
      <Text variant="strong">{title}</Text>
      <Text color="secondary" className="max-w-sm">
        {description}
      </Text>
      {actions ? <div className="mt-2">{actions}</div> : null}
    </div>
  );
}
