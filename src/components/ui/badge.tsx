import { cn } from "../../lib/utils";

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

