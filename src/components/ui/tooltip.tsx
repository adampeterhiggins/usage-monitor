import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";

import { cn } from "../../lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;

interface TooltipProps {
  label: string;
  shortcut?: string[];
  side?: "top" | "right" | "bottom" | "left";
  disabled?: boolean;
  children: React.ReactElement;
}

export function Tooltip({ label, shortcut, side = "top", disabled, children }: TooltipProps) {
  if (disabled) return children;

  return (
    <TooltipPrimitive.Root delayDuration={400}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          data-ui-surface="menu"
          className={cn(
            "ui-surface z-[100] max-w-xs rounded-lg px-2.5 py-1.5 text-[11px] shadow-menu ring-1 ring-ui-subtle",
            "animate-in fade-in-0 zoom-in-95 duration-100",
          )}
        >
          <span className="text-ui-primary">{label}</span>
          {shortcut ? (
            <span className="ml-1.5 text-ui-tertiary">{shortcut.join(" ")}</span>
          ) : null}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
