import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={400} skipDelayDuration={200}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function Tooltip({
  children,
  label,
  shortcut,
  side = "bottom",
  disabled,
}: {
  children: React.ReactNode;
  label: string;
  shortcut?: string[];
  side?: "top" | "right" | "bottom" | "left";
  disabled?: boolean;
}) {
  return (
    <TooltipPrimitive.Root open={disabled ? false : undefined}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          collisionPadding={8}
          className="z-[100] flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-[12px] leading-[16px] text-ink shadow-[0_4px_16px_rgb(0_0_0/0.12)] ring-1 ring-black/8"
        >
          {label}
          {shortcut && shortcut.length > 0 ? (
            <span className="flex items-center gap-0.5 text-[11px] text-secondary">
              {shortcut.map((key) => (
                <kbd
                  key={key}
                  className="inline-flex min-w-4 items-center justify-center rounded-[5px] bg-control-subtle px-1 font-sans text-[11px] font-medium text-secondary"
                >
                  {key}
                </kbd>
              ))}
            </span>
          ) : null}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
