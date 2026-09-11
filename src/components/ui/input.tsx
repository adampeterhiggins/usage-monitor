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
        "h-8 w-full rounded-lg border border-separator bg-surface px-2.5 text-[13px] text-ink outline-none",
        "placeholder:text-quaternary focus:ring-2 focus:ring-support-blue/30",
        className,
      )}
    />
  );
}

