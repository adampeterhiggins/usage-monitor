import * as React from "react";

import { formTokensToCssVariables } from "../../lib/theme/form-tokens";
import {
  IDENTITY_LIST,
  resolveFormTokens,
  type Identity,
  type IdentityId,
} from "../../lib/theme/identities";
import { cn } from "../../lib/utils";
import { Section } from "./Section";

/** The identity's own `--form-*` set, scoped to one element. */
function identityStyle(id: IdentityId): React.CSSProperties {
  return formTokensToCssVariables(resolveFormTokens(id)) as React.CSSProperties;
}

/**
 * A true miniature: one card, one window, drawn from the identity's own
 * tokens rather than a painted thumbnail — so a swatch can never drift from
 * what selecting it produces.
 */
function IdentitySwatch({ identity }: { identity: Identity }) {
  return (
    <div
      style={{
        ...identityStyle(identity.id),
        background: "var(--form-card-tint-orange, var(--form-card-background))",
        borderRadius: "var(--form-card-radius)",
        borderWidth: "var(--form-card-border-width)",
        borderColor: "var(--form-card-border-color)",
        boxShadow: "var(--form-card-shadow)",
        fontFamily: "var(--form-font-family)",
      }}
      className="pointer-events-none flex flex-col gap-1 border-solid p-1.5"
      aria-hidden="true"
    >
      <div className="flex items-baseline justify-between gap-1">
        <span
          className="truncate text-ui-secondary [font-size:var(--form-label-size)] [font-weight:var(--form-label-weight)] [letter-spacing:var(--form-label-tracking)] [text-transform:var(--form-label-transform)]"
          style={{ lineHeight: 1.3 }}
        >
          Weekly
        </span>
        <span className="shrink-0 tabular-nums [display:var(--form-value-display)] [font-size:var(--form-value-size)] [font-weight:var(--form-value-weight)]">
          53%
        </span>
      </div>

      <div className="w-full overflow-hidden bg-ui-track [border-radius:var(--form-meter-radius)] [display:var(--form-meter-bar-display)] [height:var(--form-meter-height)]">
        <div className="relative h-full w-[53%] rounded-[inherit] bg-ui-status-warning after:absolute after:inset-0 after:[background-image:var(--form-meter-notch)]" />
      </div>

      <div className="relative mx-auto [display:var(--form-meter-ring-display)] [height:var(--form-meter-ring-size)] [width:var(--form-meter-ring-size)]">
        <svg viewBox="0 0 52 52" className="size-full -rotate-90">
          <circle
            cx="26"
            cy="26"
            r="22"
            fill="none"
            className="stroke-ui-track"
            style={{ strokeWidth: "var(--form-meter-ring-width)" }}
          />
          <circle
            cx="26"
            cy="26"
            r="22"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 22}
            strokeDashoffset={2 * Math.PI * 22 * 0.47}
            className="stroke-ui-status-warning"
            style={{ strokeWidth: "var(--form-meter-ring-width)" }}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center tabular-nums [font-size:var(--form-value-size)] [font-weight:var(--form-value-weight)]">
          53%
        </span>
      </div>
    </div>
  );
}

/**
 * Visual identity picker. Identity is the shape-and-type half of the look —
 * it composes with whatever theme, appearance, and layout are selected, so
 * this control never touches the palette.
 */
export function IdentityControl({
  identity,
  onSelect,
}: {
  identity: IdentityId;
  onSelect: (next: IdentityId) => void;
}) {
  return (
    <Section title="Visual identity">
      <div className="grid grid-cols-3 gap-1.5">
        {IDENTITY_LIST.map((entry) => {
          const active = entry.id === identity;
          return (
            <button
              key={entry.id}
              type="button"
              title={entry.description}
              aria-pressed={active}
              onClick={() => onSelect(entry.id)}
              className={cn(
                "group grid gap-1.5 rounded-lg p-1.5 text-left ring-1",
                active
                  ? "bg-ui-control ring-ui-focus"
                  : "bg-transparent ring-ui-subtle hover:bg-ui-control-hover",
              )}
            >
              <div className="h-[46px] overflow-hidden rounded-md bg-ui-canvas p-1">
                <IdentitySwatch identity={entry} />
              </div>
              <span className="truncate px-0.5 text-[11.5px] text-ui-primary">{entry.name}</span>
            </button>
          );
        })}
      </div>
      <p className="text-[11px] leading-[1.45] text-ui-tertiary">
        Shape, weight, and type only — identity composes with any theme and any layout.
      </p>
    </Section>
  );
}
