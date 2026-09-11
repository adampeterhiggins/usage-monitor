import { cn } from "../../lib/utils";

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

