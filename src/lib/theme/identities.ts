/** Visual identities: named `--form-*` overlays.
 *
 *  An identity re-proportions the panel — radii, meter shape, weight,
 *  tracking, type family — without touching the palette, so every identity
 *  composes with every installed theme and with both appearances. Each entry
 *  lists only what it changes; `resolveFormTokens` fills the rest from
 *  `DEFAULT_FORM_TOKENS` (the Standard identity).
 *
 *  Three of these were originally drawn with their own column structure
 *  (Paper and Hairline ran one account per row, Dial replaced the bar with an
 *  arc). Layout stays the user's choice, so only the arc survived as a token:
 *  Paper and Hairline keep their type and rule work and render in whichever
 *  of the six layouts is selected. */

import {
  DEFAULT_FORM_TOKENS,
  type FormToken,
  type FormTokenValues,
} from "./form-tokens";

export const IDENTITY_IDS = [
  "standard",
  "vibrancy",
  "graphite",
  "paper",
  "mono",
  "swiss",
  "bold",
  "soft",
  "dial",
  "tint",
  "hairline",
] as const;

export type IdentityId = (typeof IDENTITY_IDS)[number];

export const DEFAULT_IDENTITY: IdentityId = "standard";

export interface Identity {
  id: IdentityId;
  name: string;
  /** One line for the picker. */
  description: string;
  tokens: Partial<Record<FormToken, string>>;
}

/** Notched meter fill for Mono — blocks cut out of the bar with the card
 *  colour, so it reads as a terminal gauge rather than a progress bar. */
const MONO_NOTCH =
  "repeating-linear-gradient(90deg,transparent 0 6px,var(--ui-card-background) 6px 8px)";

export const IDENTITIES: Record<IdentityId, Identity> = {
  standard: {
    id: "standard",
    name: "Standard",
    description: "The panel as it ships — rounded cards, pill meters.",
    tokens: {},
  },

  vibrancy: {
    id: "vibrancy",
    name: "Vibrancy",
    description: "macOS inset groups: tighter radii, a hairline lift, system proportions.",
    tokens: {
      "card-radius": "10px",
      "card-padding": "12px",
      "card-gap": "8px",
      "card-inner-gap": "10px",
      "card-shadow": "0 0.5px 1.5px rgba(0,0,0,0.05)",
      "body-padding": "10px",
      "meter-height": "6px",
      "label-size": "12px",
      "value-size": "12px",
      "value-weight": "590",
    },
  },

  graphite: {
    id: "graphite",
    name: "Graphite",
    description: "Pro-tool density: 1px borders, small radii, thin meters, tight type.",
    tokens: {
      "card-radius": "10px",
      "card-padding": "12px",
      "card-gap": "8px",
      "card-inner-gap": "10px",
      "body-padding": "10px",
      "meter-height": "4px",
      "meter-radius": "2px",
      "label-size": "11.5px",
      "value-size": "12.5px",
      "caption-size": "10.5px",
      "badge-radius": "5px",
    },
  },

  paper: {
    id: "paper",
    name: "Paper",
    description: "Editorial: serif numerals set large, uppercase micro-labels, rule-thin meters.",
    tokens: {
      "font-family": 'ui-serif, "New York", "Iowan Old Style", Georgia, serif',
      "card-radius": "2px",
      "card-padding": "16px",
      "card-shadow": "none",
      "card-inner-gap": "12px",
      "meter-height": "2px",
      "meter-radius": "0",
      "window-gap": "13px",
      "window-inner-gap": "7px",
      "label-size": "10px",
      "label-weight": "600",
      "label-transform": "uppercase",
      "label-tracking": "0.11em",
      "value-size": "20px",
      "value-weight": "400",
      "caption-size": "11.5px",
      "account-size": "13.5px",
      "account-weight": "500",
      "badge-background": "transparent",
      "badge-radius": "0",
      "badge-transform": "uppercase",
      "badge-tracking": "0.12em",
      "badge-weight": "600",
    },
  },

  mono: {
    id: "mono",
    name: "Mono",
    description: "Terminal: monospaced throughout, segmented block meters, lowercase labels.",
    tokens: {
      "font-family": "var(--font-mono)",
      "card-radius": "6px",
      "card-padding": "11px",
      "card-gap": "8px",
      "card-inner-gap": "10px",
      "body-padding": "10px",
      "meter-height": "8px",
      "meter-radius": "0",
      "meter-notch": MONO_NOTCH,
      "window-inner-gap": "3px",
      "label-size": "10.5px",
      "label-transform": "lowercase",
      "value-size": "11.5px",
      "caption-size": "10px",
      "account-size": "12px",
      "account-weight": "500",
      "badge-background": "transparent",
      "badge-radius": "0",
      "badge-weight": "500",
    },
  },

  swiss: {
    id: "swiss",
    name: "Swiss",
    description: "Strict grid: square meters, letterspaced caps, nothing decorative.",
    tokens: {
      "card-radius": "0",
      "card-padding": "13px",
      "card-shadow": "none",
      "meter-height": "3px",
      "meter-radius": "0",
      "label-size": "9.5px",
      "label-weight": "600",
      "label-transform": "uppercase",
      "label-tracking": "0.12em",
      "value-size": "13px",
      "value-weight": "500",
      "caption-size": "10px",
      "account-size": "12px",
      "account-weight": "500",
      "badge-background": "transparent",
      "badge-radius": "0",
      "badge-transform": "uppercase",
      "badge-tracking": "0.12em",
      "badge-weight": "700",
    },
  },

  bold: {
    id: "bold",
    name: "Bold",
    description: "Printed weight: chunky meters, 2px keylines, a hard offset shadow.",
    tokens: {
      "card-radius": "3px",
      "card-padding": "12px",
      "card-border-width": "2px",
      "card-border-color": "var(--local-text-primary)",
      "card-shadow": "3px 3px 0 var(--local-text-primary)",
      "card-gap": "14px",
      "body-padding": "16px",
      "meter-height": "11px",
      "meter-radius": "0",
      "label-size": "10.5px",
      "label-weight": "700",
      "label-transform": "uppercase",
      "label-tracking": "0.05em",
      "value-size": "17px",
      "value-weight": "800",
      "caption-size": "10.5px",
      "account-size": "12.5px",
      "account-weight": "700",
      "badge-radius": "0",
      "badge-transform": "uppercase",
      "badge-tracking": "0.06em",
      "badge-weight": "800",
    },
  },

  soft: {
    id: "soft",
    name: "Soft",
    description: "Rounded and calm: pillowy shadows, generous padding, no borders.",
    tokens: {
      "font-family": 'ui-rounded, "SF Pro Rounded", var(--font-sans)',
      "card-radius": "18px",
      "card-padding": "15px",
      "card-border-width": "0",
      "card-shadow": "0 1px 2px rgba(0,0,0,0.05), 0 10px 22px -10px rgba(0,0,0,0.16)",
      "card-gap": "11px",
      "card-inner-gap": "12px",
      "meter-height": "8px",
      "window-gap": "12px",
      "window-inner-gap": "5px",
      "label-size": "12px",
      "label-weight": "500",
      "value-size": "14px",
      "value-weight": "650",
      "caption-size": "11px",
      "badge-radius": "9999px",
    },
  },

  dial: {
    id: "dial",
    name: "Dial",
    description: "Arcs instead of bars — the meter becomes a ring with the number inside.",
    tokens: {
      "card-radius": "14px",
      "card-padding": "13px",
      "card-gap": "10px",
      "meter-bar-display": "none",
      "meter-ring-display": "block",
      "value-display": "none",
      "window-gap": "12px",
      "label-size": "10.5px",
      "caption-size": "9.5px",
      "account-size": "12.5px",
    },
  },

  tint: {
    id: "tint",
    name: "Tint",
    description: "Provider colour floods the card — whose account it is, before you read a word.",
    tokens: {
      "card-radius": "13px",
      "card-padding": "13px",
      "card-border-color": "transparent",
      "card-tint-orange": "var(--ui-card-provider-orange-background)",
      "card-tint-green": "var(--ui-card-provider-green-background)",
      "card-tint-blue": "var(--ui-card-provider-blue-background)",
      "card-tint-purple": "var(--ui-card-provider-purple-background)",
      "label-size": "11.5px",
      "value-size": "13px",
      "value-weight": "650",
      "caption-size": "10.5px",
      "account-size": "12.5px",
      "badge-background": "transparent",
      "badge-radius": "0",
      "badge-transform": "uppercase",
      "badge-tracking": "0.1em",
      "badge-weight": "700",
    },
  },

  hairline: {
    id: "hairline",
    name: "Hairline",
    description: "Near-nothing: cards dissolve, meters thin to a rule, one number per row.",
    tokens: {
      "card-background": "transparent",
      "card-radius": "0",
      "card-border-width": "0",
      "card-shadow": "none",
      "card-padding": "14px 4px",
      "card-gap": "4px",
      "card-inner-gap": "11px",
      "meter-height": "2px",
      "meter-radius": "0",
      "window-gap": "12px",
      "window-inner-gap": "6px",
      "label-size": "11.5px",
      "value-size": "12px",
      "value-weight": "620",
      "caption-size": "10.5px",
      "account-size": "12.5px",
      "account-weight": "550",
      "badge-background": "transparent",
      "badge-radius": "0",
    },
  },
};

/** The ordered list the picker renders. */
export const IDENTITY_LIST: readonly Identity[] = IDENTITY_IDS.map((id) => IDENTITIES[id]);

export function isIdentityId(value: unknown): value is IdentityId {
  return typeof value === "string" && (IDENTITY_IDS as readonly string[]).includes(value);
}

export function getIdentity(id: IdentityId | string | null | undefined): Identity {
  return isIdentityId(id) ? IDENTITIES[id] : IDENTITIES[DEFAULT_IDENTITY];
}

/**
 * A complete token set for an identity.
 *
 * `customSansFontStack` is the user's explicit interface-font choice. When one
 * is set it wins over the identity's family — the font picker in Appearance
 * must not be silently overruled by the identity picker.
 */
export function resolveFormTokens(
  id: IdentityId | string | null | undefined,
  options: { customSansFontStack?: string } = {},
): FormTokenValues {
  const identity = getIdentity(id);
  const values: FormTokenValues = { ...DEFAULT_FORM_TOKENS, ...identity.tokens };
  if (options.customSansFontStack && options.customSansFontStack.trim().length > 0) {
    values["font-family"] = "var(--font-sans)";
  }
  return values;
}
