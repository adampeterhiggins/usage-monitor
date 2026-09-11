/** Serialize a resolved palette into concrete `--ui-*` CSS variables.
 *
 *  Pure and DOM-free: the apply layer (production) and the preview bridge
 *  both call `paletteToCssVariables`, then set the same keys on the element
 *  they own. The manifest in `ui-tokens.ts` is the contract — the serializer
 *  emits every variable in it. */

import type { ResolvedUiPalette, UiContextPalette, UiStatefulPair, UiPair } from "./resolve-ui-palette";
import type { UiSurfaceContext } from "./ui-tokens";
import {
  UI_PROVIDER_TONES,
  UI_STATUS_TONES,
  uiContextVar,
  uiMaterialVar,
} from "./ui-tokens";

function setPair(vars: Record<string, string>, context: UiSurfaceContext, family: string, pair: UiPair): void {
  vars[uiContextVar(context, `${family}-background`)] = pair.background;
  vars[uiContextVar(context, `${family}-foreground`)] = pair.foreground;
}

function setStatefulPair(
  vars: Record<string, string>,
  context: UiSurfaceContext | null,
  family: string,
  pair: UiStatefulPair,
): void {
  const key = (token: string) =>
    context === null ? uiMaterialVar(token) : uiContextVar(context, token);
  vars[key(`${family}-rest-background`)] = pair.rest.background;
  vars[key(`${family}-rest-foreground`)] = pair.rest.foreground;
  vars[key(`${family}-hover-background`)] = pair.hover.background;
  vars[key(`${family}-hover-foreground`)] = pair.hover.foreground;
  vars[key(`${family}-pressed-background`)] = pair.pressed.background;
  vars[key(`${family}-pressed-foreground`)] = pair.pressed.foreground;
  vars[key(`${family}-disabled-background`)] = pair.disabled.background;
  vars[key(`${family}-disabled-foreground`)] = pair.disabled.foreground;
}

function setContext(vars: Record<string, string>, context: UiSurfaceContext, palette: UiContextPalette): void {
  const set = (token: string, value: string) => {
    vars[uiContextVar(context, token)] = value;
  };

  set("background", palette.background);
  set("text-primary", palette.text.primary);
  set("text-secondary", palette.text.secondary);
  set("text-tertiary", palette.text.tertiary);
  set("text-placeholder", palette.text.placeholder);
  set("text-disabled", palette.text.disabled);
  set("border-subtle", palette.borders.subtle);
  set("border-control", palette.borders.control);
  set("border-focus", palette.borders.focus);

  setStatefulPair(vars, context, "control", palette.control);
  setStatefulPair(vars, context, "action", palette.action);
  setStatefulPair(vars, context, "destructive", palette.destructive);
  setPair(vars, context, "selection", palette.selection.rest);
  setPair(vars, context, "selection-hover", palette.selection.hover);

  set("input-background", palette.input.background);
  set("input-foreground", palette.input.foreground);
  set("input-placeholder", palette.input.placeholder);
  set("input-border", palette.input.border);
  set("input-focus", palette.input.focus);
  set("accent-text", palette.accentText);
  set("track", palette.track);

  for (const tone of UI_STATUS_TONES) {
    const status = palette.status[tone];
    set(`status-${tone}-fill`, status.fill);
    set(`status-${tone}-text`, status.text);
    set(`status-${tone}-soft-background`, status.soft.background);
    set(`status-${tone}-soft-foreground`, status.soft.foreground);
  }
  for (const tone of UI_PROVIDER_TONES) {
    const provider = palette.providers[tone];
    set(`provider-${tone}-background`, provider.background);
    set(`provider-${tone}-foreground`, provider.foreground);
  }
}

export function paletteToCssVariables(palette: ResolvedUiPalette): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const context of ["canvas", "card", "menu", "toolbar"] as const) {
    setContext(vars, context, palette.contexts[context]);
  }
  vars[uiMaterialVar("panel-tint")] = palette.material.panelTint;
  vars[uiMaterialVar("panel-opacity")] = String(palette.material.panelOpacity);
  vars[uiMaterialVar("shadow")] = palette.material.shadow;
  vars[uiMaterialVar("scrim")] = palette.material.scrim;
  setStatefulPair(vars, null, "glass", palette.material.glass);
  return vars;
}
