import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import {
  isFontFamilyAvailable,
  isMonospaceFamily,
  listInterfaceFontFamilies,
  listMonoFontFamilies,
  resolveDefaultMonoLabel,
  resolveDefaultSansLabel,
} from "../../lib/theme/fonts";
import { Button, cn } from "../ui";

const DEFAULT_VALUE = "";

type FontKind = "sans" | "mono";

const EXTRA_FONTS_KEYS: Record<FontKind, string> = {
  sans: "usage-monitor:extra-sans-fonts:v1",
  mono: "usage-monitor:extra-mono-fonts:v1",
};

function loadExtraFonts(kind: FontKind): string[] {
  try {
    const raw = window.localStorage.getItem(EXTRA_FONTS_KEYS[kind]);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
  } catch {
    return [];
  }
}

function saveExtraFonts(kind: FontKind, fonts: readonly string[]): void {
  try {
    window.localStorage.setItem(EXTRA_FONTS_KEYS[kind], JSON.stringify([...fonts]));
  } catch {
    // localStorage may be unavailable.
  }
}

export function FontFamilySelect({
  value,
  onValueChange,
  kind = "sans",
  ariaLabel,
}: {
  value: string;
  onValueChange: (family: string) => void;
  kind?: FontKind;
  ariaLabel?: string;
}) {
  const resolvedAriaLabel = ariaLabel ?? (kind === "mono" ? "Code font" : "Interface font");
  const [open, setOpen] = React.useState(false);
  const [addOpen, setAddOpen] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [families, setFamilies] = React.useState<readonly string[]>([]);
  const [extraFamilies, setExtraFamilies] = React.useState<readonly string[]>(() =>
    loadExtraFonts(kind),
  );
  const defaultLabel = React.useMemo(
    () => (kind === "mono" ? resolveDefaultMonoLabel() : resolveDefaultSansLabel()),
    [kind],
  );
  const inputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    let cancelled = false;
    const load = kind === "mono" ? listMonoFontFamilies : listInterfaceFontFamilies;
    void load().then((next) => {
      if (!cancelled) setFamilies(next);
    });
    return () => {
      cancelled = true;
    };
  }, [kind]);

  const options = React.useMemo(() => {
    const merged = new Set<string>([...families, ...extraFamilies]);
    const trimmed = value.trim();
    if (trimmed.length > 0) merged.add(trimmed);
    return [...merged].sort((left, right) => left.localeCompare(right));
  }, [extraFamilies, families, value]);

  const selectedLabel = value.trim().length === 0 ? defaultLabel : value.trim();
  const selectedFamilyCss =
    value.trim().length === 0
      ? defaultLabel === "System default"
        ? undefined
        : `"${defaultLabel.replace(/"/g, "")}"`
      : `"${value.trim().replace(/"/g, "")}"`;

  function commitCustomFont() {
    const family = draft.trim();
    if (family.length === 0) {
      setError("Enter a font family name.");
      return;
    }
    if (!isFontFamilyAvailable(family)) {
      setError("That font doesn’t appear to be installed.");
      return;
    }
    if (kind === "mono" && !isMonospaceFamily(family)) {
      setError("That font doesn’t look monospace.");
      return;
    }
    const nextExtras = extraFamilies.includes(family)
      ? extraFamilies
      : [...extraFamilies, family].sort((left, right) => left.localeCompare(right));
    setExtraFamilies(nextExtras);
    saveExtraFonts(kind, nextExtras);
    onValueChange(family);
    setDraft("");
    setError(null);
    setAddOpen(false);
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        <DropdownMenu.Root open={open} onOpenChange={setOpen}>
          <DropdownMenu.Trigger asChild>
            <button
              type="button"
              aria-label={resolvedAriaLabel}
              className={cn(
                "flex h-8 min-w-0 flex-1 items-center justify-between gap-2 rounded-lg border border-separator bg-transparent px-2 text-left text-[13px] text-ink outline-none",
                "hover:bg-control-subtle focus-visible:ring-2 focus-visible:ring-support-blue/30",
              )}
            >
              <span className="min-w-0 truncate" style={{ fontFamily: selectedFamilyCss }}>
                {selectedLabel}
                {value.trim().length === 0 ? (
                  <span className="ml-1.5 font-sans text-[11px] text-tertiary">default</span>
                ) : null}
              </span>
              <ChevronDown className="size-3.5 shrink-0 text-tertiary" />
            </button>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="start"
              sideOffset={4}
              collisionPadding={12}
              className="z-[90] max-h-64 min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-y-auto rounded-xl bg-surface p-1 shadow-[0_8px_24px_rgb(0_0_0/0.12)] ring-1 ring-black/8"
            >
              <FontOption
                label={defaultLabel}
                familyCss={
                  defaultLabel === "System default"
                    ? undefined
                    : `"${defaultLabel.replace(/"/g, "")}"`
                }
                selected={value.trim().length === 0}
                badge="default"
                onSelect={() => {
                  onValueChange(DEFAULT_VALUE);
                  setOpen(false);
                }}
              />
              {options.map((family) => (
                <FontOption
                  key={family}
                  label={family}
                  familyCss={`"${family.replace(/"/g, "")}"`}
                  selected={value.trim() === family}
                  onSelect={() => {
                    onValueChange(family);
                    setOpen(false);
                  }}
                />
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <Button
          iconOnly
          size="small"
          variant="transparent"
          aria-label={kind === "mono" ? "Add monospace font" : "Add system font"}
          className="h-8 w-8 shrink-0 rounded-lg border border-separator"
          onClick={() => {
            setDraft("");
            setError(null);
            setAddOpen(true);
          }}
        >
          <Plus className="size-3.5" />
        </Button>
      </div>

      <Dialog.Root
        open={addOpen}
        onOpenChange={(next) => {
          setAddOpen(next);
          if (!next) {
            setDraft("");
            setError(null);
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[95] bg-black/30" />
          <Dialog.Content
            className="fixed left-1/2 top-1/2 z-[100] w-[min(360px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface p-4 shadow-xl ring-1 ring-black/10"
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              inputRef.current?.focus();
            }}
          >
            <div className="mb-3 flex items-center justify-between">
              <Dialog.Title className="text-[14px] font-medium">
                {kind === "mono" ? "Add monospace font" : "Add system font"}
              </Dialog.Title>
              <Dialog.Close asChild>
                <Button iconOnly variant="transparent" size="small" aria-label="Close">
                  <X className="size-4" />
                </Button>
              </Dialog.Close>
            </div>
            <p className="mb-3 text-[12px] text-tertiary">
              Type the exact PostScript / family name of an installed
              {kind === "mono" ? " monospace" : ""} font.
            </p>
            <input
              ref={inputRef}
              className="h-9 w-full rounded-lg border border-separator bg-transparent px-2.5 text-[13px] outline-none"
              placeholder={kind === "mono" ? "e.g. JetBrains Mono" : "e.g. Hiragino Sans"}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                if (error) setError(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitCustomFont();
                }
              }}
              style={{
                fontFamily: draft.trim()
                  ? `"${draft.trim().replace(/"/g, "")}", ${kind === "mono" ? "var(--font-mono)" : "var(--font-sans)"}`
                  : undefined,
              }}
            />
            {error ? <p className="mt-2 text-[12px] text-support-red">{error}</p> : null}
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="glass" onClick={() => setAddOpen(false)}>
                Cancel
              </Button>
              <Button variant="filled" onClick={commitCustomFont}>
                Add
              </Button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}

function FontOption({
  label,
  familyCss,
  selected,
  badge,
  onSelect,
}: {
  label: string;
  familyCss: string | undefined;
  selected: boolean;
  badge?: string;
  onSelect: () => void;
}) {
  return (
    <DropdownMenu.Item
      onSelect={(event) => {
        event.preventDefault();
        onSelect();
      }}
      className={cn(
        "flex cursor-pointer items-center justify-between gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-ink outline-none",
        "data-[highlighted]:bg-control-subtle",
      )}
    >
      <span className="min-w-0 truncate" style={{ fontFamily: familyCss }}>
        {label}
        {badge ? (
          <span className="ml-1.5 font-sans text-[10px] text-tertiary">{badge}</span>
        ) : null}
      </span>
      {selected ? <Check className="size-3.5 shrink-0 text-tertiary" /> : null}
    </DropdownMenu.Item>
  );
}
