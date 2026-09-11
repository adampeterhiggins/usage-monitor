/** The resolved-palette CSS contract.
 *
 *  The resolver emits one `--ui-{context}-{token}` variable per entry below,
 *  plus the context-free material variables. Elements opt into a surface
 *  context with `data-ui-surface="{context}"`; the stylesheet maps each
 *  context's variables onto `--local-*` aliases, and Tailwind utilities
 *  (`@theme inline`) read the aliases:
 *
 *    --local-background                    bg-ui-surface
 *    --local-text-{level}                  text-ui-{level}
 *    --local-border-subtle|-control|-focus border-ui-{subtle|outline|focus}
 *    --local-{family}-{state}-{part}       bg-ui-{family}(-hover|-pressed|-disabled)
 *                                          text-ui-{family}-fg(-disabled)
 *    --local-selection(-hover)-*           bg-ui-selection(-hover) / text-ui-selection-fg
 *    --local-input-*                       bg-ui-input, text-ui-input-fg,
 *                                          placeholder:text-ui-input-placeholder,
 *                                          border-ui-input-border, ring-ui-input-focus
 *    --local-accent-text                   text-ui-accent
 *    --local-track                         bg-ui-track
 *    --local-status-{tone}-{fill|text|soft-background|soft-foreground}
 *                                          bg-ui-status-{tone}, text-ui-status-{tone},
 *                                          bg-ui-status-{tone}-soft, text-ui-status-{tone}-soft-fg
 *    --local-provider-{tone}-{background|foreground}
 *                                          bg-ui-provider-{tone}, text-ui-provider-{tone}-fg
 *
 *  Material variables stay global (not per-context): --ui-panel-tint,
 *  --ui-panel-opacity, --ui-glass-{state}-{part}, --ui-shadow, --ui-scrim.
 *  Their utilities are bg-ui-glass(-hover|-pressed|-disabled),
 *  text-ui-glass-fg(-disabled), bg-ui-scrim, shadow-menu. */

export const UI_SURFACE_CONTEXTS = ["canvas", "card", "menu", "toolbar"] as const;
export type UiSurfaceContext = (typeof UI_SURFACE_CONTEXTS)[number];

/** Usage-severity tones plus informational (accent) and neutral. */
export const UI_STATUS_TONES = [
  "healthy",
  "warning",
  "high",
  "critical",
  "info",
  "neutral",
] as const;
export type UiStatusTone = (typeof UI_STATUS_TONES)[number];

/** Provider identity tones — deliberately independent of status/accent. */
export const UI_PROVIDER_TONES = ["orange", "green", "blue"] as const;
export type UiProviderTone = (typeof UI_PROVIDER_TONES)[number];

export const UI_PAIR_STATES = ["rest", "hover", "pressed", "disabled"] as const;
export type UiPairState = (typeof UI_PAIR_STATES)[number];

/** Tokens emitted once per surface context. */
export const UI_CONTEXT_TOKENS = [
  "background",
  "text-primary",
  "text-secondary",
  "text-tertiary",
  "text-placeholder",
  "text-disabled",
  "border-subtle",
  "border-control",
  "border-focus",
  "control-rest-background",
  "control-rest-foreground",
  "control-hover-background",
  "control-hover-foreground",
  "control-pressed-background",
  "control-pressed-foreground",
  "control-disabled-background",
  "control-disabled-foreground",
  "action-rest-background",
  "action-rest-foreground",
  "action-hover-background",
  "action-hover-foreground",
  "action-pressed-background",
  "action-pressed-foreground",
  "action-disabled-background",
  "action-disabled-foreground",
  "destructive-rest-background",
  "destructive-rest-foreground",
  "destructive-hover-background",
  "destructive-hover-foreground",
  "destructive-pressed-background",
  "destructive-pressed-foreground",
  "destructive-disabled-background",
  "destructive-disabled-foreground",
  "selection-background",
  "selection-foreground",
  "selection-hover-background",
  "selection-hover-foreground",
  "input-background",
  "input-foreground",
  "input-placeholder",
  "input-border",
  "input-focus",
  "accent-text",
  "track",
] as const;
export type UiContextToken = (typeof UI_CONTEXT_TOKENS)[number];

export const UI_STATUS_TOKEN_PARTS = ["fill", "text", "soft-background", "soft-foreground"] as const;
export const UI_PROVIDER_TOKEN_PARTS = ["background", "foreground"] as const;

/** Context-free material tokens. */
export const UI_MATERIAL_TOKENS = [
  "panel-tint",
  "panel-opacity",
  "shadow",
  "scrim",
  ...UI_PAIR_STATES.flatMap(
    (state) => [`glass-${state}-background`, `glass-${state}-foreground`] as const,
  ),
] as const;
export type UiMaterialToken = (typeof UI_MATERIAL_TOKENS)[number];

export function uiContextVar(context: UiSurfaceContext, token: string): string {
  return `--ui-${context}-${token}`;
}

export function uiMaterialVar(token: string): string {
  return `--ui-${token}`;
}

/** The complete manifest of `--ui-*` variable names the serializer emits. */
export const UI_PALETTE_VARIABLES: ReadonlyArray<string> = [
  ...UI_SURFACE_CONTEXTS.flatMap((context) => [
    ...UI_CONTEXT_TOKENS.map((token) => uiContextVar(context, token)),
    ...UI_STATUS_TONES.flatMap((tone) =>
      UI_STATUS_TOKEN_PARTS.map((part) => uiContextVar(context, `status-${tone}-${part}`)),
    ),
    ...UI_PROVIDER_TONES.flatMap((tone) =>
      UI_PROVIDER_TOKEN_PARTS.map((part) => uiContextVar(context, `provider-${tone}-${part}`)),
    ),
  ]),
  ...UI_MATERIAL_TOKENS.map(uiMaterialVar),
];

/** Every `--local-*` alias a `data-ui-surface` scope re-points. */
export const UI_LOCAL_TOKENS: ReadonlyArray<string> = [
  ...UI_CONTEXT_TOKENS,
  ...UI_STATUS_TONES.flatMap((tone) =>
    UI_STATUS_TOKEN_PARTS.map((part) => `status-${tone}-${part}`),
  ),
  ...UI_PROVIDER_TONES.flatMap((tone) =>
    UI_PROVIDER_TOKEN_PARTS.map((part) => `provider-${tone}-${part}`),
  ),
];
