import { create } from "zustand";

import type { ThemeAppearance, ThemeDefinition } from "../../lib/theme/palette";

export type ThemeEditorSession = {
  editingThemeId: string | null;
  seedThemeId: string | null;
  preferredAppearance: ThemeAppearance;
};

type ThemeEditorStore = {
  session: ThemeEditorSession | null;
  openCreate: (seedThemeId?: string | null, appearance?: ThemeAppearance) => void;
  openEdit: (theme: ThemeDefinition, appearance?: ThemeAppearance) => void;
  closeThemeEditor: () => void;
};

export const useThemeEditorStore = create<ThemeEditorStore>((set) => ({
  session: null,
  openCreate: (seedThemeId = null, appearance = "light") =>
    set({
      session: {
        editingThemeId: null,
        seedThemeId,
        preferredAppearance: appearance,
      },
    }),
  openEdit: (theme, appearance) =>
    set({
      session: {
        editingThemeId: theme.id,
        seedThemeId: theme.id,
        preferredAppearance: appearance ?? theme.appearance,
      },
    }),
  closeThemeEditor: () => set({ session: null }),
}));
