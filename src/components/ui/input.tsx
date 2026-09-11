import * as React from "react";
import { cn } from "../../lib/utils";

export function Input({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        "h-8 w-full rounded-lg border border-ui-input-border bg-ui-input px-2.5 text-[13px] text-ui-input-fg outline-none",
        "placeholder:text-ui-input-placeholder focus:border-ui-input-focus focus:ring-1 focus:ring-ui-focus/40",
        className,
      )}
    />
  );
}

