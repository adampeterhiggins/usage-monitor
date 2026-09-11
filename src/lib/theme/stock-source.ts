/** Stock app specs — the built-in "Default" look authored as seeds +
 *  overrides. These values reproduce the original hand-tuned stylesheet:
 *  every override is a verbatim old `--*` token, so the resolved stock
 *  palette matches the previous default appearance exactly. Anything left
 *  out (pressed states, selection, glass) is derived by the resolver. */

import type { AppModeSpec } from "./source-types";
import type { ThemeAppearance } from "./themePalettes";

const STOCK_LIGHT: AppModeSpec = {
  seeds: { canvas: "#ffffff", accent: "#138af2" },
  overrides: {
    // Surfaces
    cardBackground: "#fcfcfc",
    menuBackground: "#fcfcfc",
    toolbarBackground: "#ffffff",
    // Text ladder (old --text-* percentages)
    textPrimary: "#000000",
    textSecondary: "rgb(0 0 0 / 60%)",
    textTertiary: "rgb(0 0 0 / 40%)",
    placeholder: "rgb(0 0 0 / 20%)",
    // Neutral controls (old --control / --control-subtle)
    controlBackground: "rgb(0 0 0 / 10%)",
    controlForeground: "#000000",
    controlHoverBackground: "rgb(0 0 0 / 5%)",
    // Primary action — old accent button was white text on support-blue
    actionBackground: "#138af2",
    actionForeground: "#ffffff",
    // Old destructive button was white text on support-red
    destructiveForeground: "#ffffff",
    accentText: "#138af2",
    // Inputs — old bg-surface + border-separator + placeholder quaternary
    inputBackground: "#fcfcfc",
    inputBorder: "rgb(0 0 0 / 10%)",
    inputPlaceholder: "rgb(0 0 0 / 20%)",
    // Borders — old stylesheet used --separator for every boundary
    borderSubtle: "rgb(0 0 0 / 10%)",
    borderControl: "rgb(0 0 0 / 10%)",
    focusRing: "#138af2",
    // Usage status — old --support-* tokens
    healthy: "#006b4f",
    warning: "#f8a300",
    high: "#c75d07",
    critical: "#b12424",
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
    textTertiary: "rgb(255 255 255 / 40%)",
    placeholder: "rgb(255 255 255 / 22%)",
    controlBackground: "rgb(255 255 255 / 12%)",
    controlForeground: "#ffffff",
    controlHoverBackground: "rgb(255 255 255 / 7%)",
    actionBackground: "#5aa0f0",
    actionForeground: "#ffffff",
    destructiveForeground: "#ffffff",
    accentText: "#5aa0f0",
    inputBackground: "#2c2c2e",
    inputBorder: "rgb(255 255 255 / 12%)",
    inputPlaceholder: "rgb(255 255 255 / 22%)",
    borderSubtle: "rgb(255 255 255 / 12%)",
    borderControl: "rgb(255 255 255 / 12%)",
    focusRing: "#5aa0f0",
    healthy: "#3dba7a",
    warning: "#e0c04a",
    high: "#f0a15a",
    critical: "#e66767",
  },
};

export function stockModeSpec(appearance: ThemeAppearance): AppModeSpec {
  return appearance === "dark" ? STOCK_DARK : STOCK_LIGHT;
}
