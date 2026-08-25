/** Appearance preference bounds and defaults (ported from t3code contracts). */

export const MIN_APPEARANCE_CONTRAST = 50;
export const MAX_APPEARANCE_CONTRAST = 200;
export const DEFAULT_APPEARANCE_CONTRAST = 100;
export type AppearanceContrast = number;

export const MIN_GLASS_OPACITY = 40;
export const MAX_GLASS_OPACITY = 100;
export const DEFAULT_GLASS_OPACITY = 80;
export type GlassOpacity = number;

export const MIN_INTERFACE_FONT_SIZE = 12;
export const MAX_INTERFACE_FONT_SIZE = 20;
export const DEFAULT_INTERFACE_FONT_SIZE = 13;

export const MIN_CODE_FONT_SIZE = 10;
export const MAX_CODE_FONT_SIZE = 18;
export const DEFAULT_CODE_FONT_SIZE = 12;

export type AppearanceSettings = {
  appearanceContrast: AppearanceContrast;
  glassOpacity: GlassOpacity;
  fontSizeInterface: number;
  fontFamilySans: string;
  fontSizeCode: number;
  fontFamilyCode: string;
  fontSmoothing: boolean;
};

export const DEFAULT_APPEARANCE_SETTINGS: AppearanceSettings = {
  appearanceContrast: DEFAULT_APPEARANCE_CONTRAST,
  glassOpacity: DEFAULT_GLASS_OPACITY,
  fontSizeInterface: DEFAULT_INTERFACE_FONT_SIZE,
  fontFamilySans: "",
  fontSizeCode: DEFAULT_CODE_FONT_SIZE,
  fontFamilyCode: "",
  fontSmoothing: true,
};

export type AppearancePreset = {
  id: string;
  name: string;
  settings: AppearanceSettings;
  /** Optional full look — older presets may omit these. */
  theme?: string;
  mode?: "system" | "light" | "dark";
  halves?: { light?: string; dark?: string } | null;
  updatedAt: number;
};

export function normalizeAppearanceSettings(
  value: Partial<AppearanceSettings> | null | undefined,
): AppearanceSettings {
  return { ...DEFAULT_APPEARANCE_SETTINGS, ...(value ?? {}) };
}

export function appearanceSettingsEqual(
  left: AppearanceSettings,
  right: AppearanceSettings,
): boolean {
  return (
    left.appearanceContrast === right.appearanceContrast &&
    left.glassOpacity === right.glassOpacity &&
    left.fontSizeInterface === right.fontSizeInterface &&
    left.fontFamilySans === right.fontFamilySans &&
    left.fontSizeCode === right.fontSizeCode &&
    left.fontFamilyCode === right.fontFamilyCode &&
    left.fontSmoothing === right.fontSmoothing
  );
}

export function appearancePresetMatches(
  preset: AppearancePreset,
  current: {
    settings: AppearanceSettings;
    theme: string;
    mode: "system" | "light" | "dark";
  },
): boolean {
  if (!appearanceSettingsEqual(preset.settings, current.settings)) return false;
  if (preset.theme !== undefined && preset.theme !== current.theme) return false;
  if (preset.mode !== undefined && preset.mode !== current.mode) return false;
  return true;
}
