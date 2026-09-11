/** The stock (unthemed) look expressed as app mode specs.
 *
 *  These are the app's own values — the tokens the classic stylesheet used —
 *  expressed as seeds + overrides so the stock appearance goes through the
 *  same resolver as every other theme. Values that used to be translucent are
 *  kept translucent; the resolver composites them over the real destination
 *  surface instead of hard-flattening here. */

import type { ThemeAppearance } from "./themePalettes";
import type { AppModeSpec } from "./source-types";

const STOCK_LIGHT: AppModeSpec = {
  seeds: { canvas: "#ffffff", accent: "#138af2" },
  overrides: {
    cardBackground: "#fcfcfc",
    menuBackground: "#fcfcfc",
    toolbarBackground: "#ffffff",
    textPrimary: "#000000",
    textSecondary: "rgb(0 0 0 / 60%)",
    controlBackground: "rgb(0 0 0 / 10%)",
    controlHoverBackground: "rgb(0 0 0 / 15%)",
    actionBackground: "#138af2",
    actionForeground: "#ffffff",
    borderSubtle: "rgb(0 0 0 / 10%)",
    inputBackground: "#fcfcfc",
    inputBorder: "rgb(0 0 0 / 18%)",
    focusRing: "#138af2",
  },
};

const STOCK_DARK: AppModeSpec = {
  seeds: { canvas: "#1c1c1e", accent: "#5aa0f0" },
  overrides: {
    cardBackground: "#2c2c2e",
    menuBackground: "#2c2c2e",
    toolbarBackground: "#1c1c1e",
    textPrimary: "#ffffff",
    textSecondary: "rgb(255 255 255 / 60%)",
    controlBackground: "rgb(255 255 255 / 12%)",
    controlHoverBackground: "rgb(255 255 255 / 18%)",
    actionBackground: "#5aa0f0",
    borderSubtle: "rgb(255 255 255 / 12%)",
    inputBackground: "#2c2c2e",
    inputBorder: "rgb(255 255 255 / 20%)",
    focusRing: "#5aa0f0",
  },
};

/** The stock spec for a mode — what `light`/`dark`/`system` resolve to. */
export function stockModeSpec(appearance: ThemeAppearance): AppModeSpec {
  return appearance === "dark" ? STOCK_DARK : STOCK_LIGHT;
}
