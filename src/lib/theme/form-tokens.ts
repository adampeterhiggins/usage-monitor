/** The `--form-*` token contract — the shape-and-type half of a look.
 *
 *  The `--ui-*` palette decides what colour everything is; these decide what
 *  shape and weight it has. The two axes are deliberately independent: a
 *  visual identity re-proportions the panel without touching the palette, so
 *  any identity composes with any installed theme, light or dark.
 *
 *  Same discipline as `ui-tokens.ts`: this manifest is the contract, the
 *  serializer emits every variable in it, and the CSS generator writes the
 *  default set into `:root` so first paint matches post-boot.
 *
 *  Values are raw CSS. A token set to the CSS-wide keyword `initial` is
 *  guaranteed-invalid at computed-value time, so `var(--form-x, fallback)`
 *  resolves to its fallback — that is how "leave this alone" is expressed
 *  for the optional tints and the badge fill. */

export const FORM_TOKENS = [
  // Card surface
  "card-background",
  "card-radius",
  "card-padding",
  "card-border-width",
  "card-border-color",
  "card-shadow",
  "card-gap",
  "card-inner-gap",
  "body-padding",
  // Per-provider card wash. `initial` → the card falls back to card-background.
  "card-tint-orange",
  "card-tint-green",
  "card-tint-blue",
  "card-tint-purple",
  // Meter
  "meter-height",
  "meter-radius",
  "meter-notch",
  "meter-bar-display",
  "meter-ring-display",
  "meter-ring-size",
  "meter-ring-width",
  "window-gap",
  "window-inner-gap",
  // Typography
  "font-family",
  "label-size",
  "label-weight",
  "label-transform",
  "label-tracking",
  "value-size",
  "value-weight",
  "value-display",
  "caption-size",
  "account-size",
  "account-weight",
  // Badge
  "badge-background",
  "badge-radius",
  "badge-transform",
  "badge-tracking",
  "badge-weight",
] as const;

export type FormToken = (typeof FORM_TOKENS)[number];
export type FormTokenValues = Record<FormToken, string>;

export function formVar(token: FormToken): string {
  return `--form-${token}`;
}

export const FORM_TOKEN_VARIABLES: readonly string[] = FORM_TOKENS.map(formVar);

/** The Standard identity — byte-for-byte the proportions the panel shipped
 *  with, so an install that never opens the picker sees no change. */
export const DEFAULT_FORM_TOKENS: FormTokenValues = {
  "card-background": "var(--ui-card-background)",
  "card-radius": "18px",
  "card-padding": "14px",
  "card-border-width": "1px",
  "card-border-color": "var(--local-border-subtle)",
  "card-shadow": "none",
  "card-gap": "12px",
  "card-inner-gap": "12px",
  "body-padding": "16px",
  "card-tint-orange": "initial",
  "card-tint-green": "initial",
  "card-tint-blue": "initial",
  "card-tint-purple": "initial",
  "meter-height": "6px",
  "meter-radius": "9999px",
  "meter-notch": "none",
  "meter-bar-display": "block",
  "meter-ring-display": "none",
  "meter-ring-size": "52px",
  "meter-ring-width": "5px",
  "window-gap": "10px",
  "window-inner-gap": "4px",
  "font-family": "var(--font-sans)",
  "label-size": "11px",
  "label-weight": "400",
  "label-transform": "none",
  "label-tracking": "0",
  "value-size": "12px",
  "value-weight": "600",
  "value-display": "block",
  "caption-size": "10px",
  "account-size": "13px",
  "account-weight": "600",
  "badge-background": "initial",
  "badge-radius": "6px",
  "badge-transform": "none",
  "badge-tracking": "0",
  "badge-weight": "500",
};

/** Serialize a complete token set into `--form-*` CSS variables. */
export function formTokensToCssVariables(values: FormTokenValues): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const token of FORM_TOKENS) vars[formVar(token)] = values[token];
  return vars;
}
