import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { Command } from "cmdk";
import type { LucideIcon } from "lucide-react";
import { cn } from "../../lib/utils";
import { Badge } from "./badge";

/**
 * Shared menu kit: Radix Popover for anchoring/dismissal + cmdk for keyboard
 * navigation. cmdk selects the first item on open; MenuContent moves focus
 * into the command tree (the search input when present, otherwise the list)
 * so arrow keys and Enter work immediately.
 */

export function MenuRoot({ modal = false, ...props }: React.ComponentProps<typeof Popover.Root>) {
  return <Popover.Root modal={modal} {...props} />;
}

export const MenuTrigger = Popover.Trigger;

export const MenuContent = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Popover.Content>
>(function MenuContent({ className, onOpenAutoFocus, ...props }, ref) {
  return (
    <Popover.Portal>
      <Popover.Content
        ref={ref}
        data-ui-surface="menu"
        onOpenAutoFocus={(event) => {
          onOpenAutoFocus?.(event);
          if (event.defaultPrevented) return;
          event.preventDefault();
          const content = event.currentTarget as HTMLElement;
          const target =
            content.querySelector<HTMLElement>("[cmdk-input]") ??
            content.querySelector<HTMLElement>("[cmdk-list]");
          target?.focus();
        }}
        className={cn("ui-surface ring-1 ring-ui-subtle", className)}
        {...props}
      />
    </Popover.Portal>
  );
});

export function MenuCommand({ loop = true, ...props }: React.ComponentProps<typeof Command>) {
  return <Command loop={loop} {...props} />;
}

export const MenuInput = React.forwardRef<
  HTMLInputElement,
  React.ComponentPropsWithoutRef<typeof Command.Input>
>(function MenuInput({ className, ...props }, ref) {
  return (
    <Command.Input
      ref={ref}
      className={cn(
        "h-9 shrink-0 border-b border-ui-subtle bg-transparent px-3 text-[13px] text-ui-input-fg outline-none placeholder:text-ui-input-placeholder",
        className,
      )}
      {...props}
    />
  );
});

export const MenuList = React.forwardRef<
  HTMLDivElement,
  React.ComponentPropsWithoutRef<typeof Command.List>
>(function MenuList({ className, ...props }, ref) {
  return <Command.List ref={ref} tabIndex={-1} className={cn("outline-none", className)} {...props} />;
});

export function MenuEmpty({
  className,
  ...props
}: React.ComponentPropsWithoutRef<typeof Command.Empty>) {
  return (
    <Command.Empty
      className={cn("px-3 py-6 text-center text-[12px] text-ui-tertiary", className)}
      {...props}
    />
  );
}

export const MenuGroup = Command.Group;

export function MenuSeparator({ className }: { className?: string }) {
  return <Command.Separator className={cn("mx-1.5 my-1 h-px bg-ui-subtle", className)} />;
}

export function MenuItem({
  icon: Icon,
  label,
  chip,
  accessory,
  danger,
  disabled,
  onSelect,
}: {
  icon: LucideIcon;
  label: string;
  chip?: string;
  accessory?: string;
  danger?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      disabled={disabled}
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] outline-none data-[selected=true]:bg-ui-control-hover",
        disabled && "cursor-default opacity-40",
        danger && "text-ui-status-critical-text",
      )}
    >
      <Icon
        className={cn("size-4 shrink-0", danger ? "text-ui-status-critical-text" : "text-ui-secondary")}
      />
      <span className="flex flex-1 items-center gap-1.5">
        {label}
        {chip ? (
          <Badge size="small" color="secondary">
            {chip}
          </Badge>
        ) : null}
      </span>
      {accessory ? <span className="text-[11px] text-ui-tertiary">{accessory}</span> : null}
    </Command.Item>
  );
}
