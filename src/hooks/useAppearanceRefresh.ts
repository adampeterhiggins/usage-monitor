import * as React from "react";
import { subscribe } from "../platform/events";
import { APPEARANCE_CHANGED_EVENT } from "../platform/appearance-window";
import {
  refreshAppliedAppearance,
  refreshAppearanceRespectingPreview,
} from "../lib/theme/controller";

/**
 * Keep this window's theme applied: once on mount, when the OS appearance
 * flips, and (unless disabled) when another window broadcasts a change. The
 * Appearance editor opts out of the broadcast — a refresh would wipe the
 * draft palette it is previewing.
 */
export function useAppearanceRefresh(options: { listenForExternalChanges?: boolean } = {}): void {
  const { listenForExternalChanges = true } = options;

  React.useEffect(() => {
    void refreshAppliedAppearance();
  }, []);

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      void refreshAppearanceRespectingPreview();
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  React.useEffect(() => {
    if (!listenForExternalChanges) return;
    return subscribe(APPEARANCE_CHANGED_EVENT, () => {
      void refreshAppearanceRespectingPreview();
    });
  }, [listenForExternalChanges]);
}
