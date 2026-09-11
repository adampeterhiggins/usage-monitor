/** Ownership of the live theme preview.
 *
 *  Marketplace previews and the theme editor both paint draft palettes onto the
 *  document. Only one session may own the paint at a time: beginning a session
 *  supersedes the previous owner, so a late-finishing download or a stale
 *  cleanup can never repaint over the newer draft. Effects are injected so the
 *  ownership logic is testable without a DOM. */

import type { ThemeAppearance, ThemeColors } from "./types";

export interface ThemePreviewPaint {
  colors: ThemeColors;
  appearance: ThemeAppearance;
}

export interface ThemePreviewEffects {
  /** Paint a draft palette onto the document. */
  apply(paint: ThemePreviewPaint): void;
  /** Repaint the persisted appearance. Called only while the ending session
   *  still owns the document. */
  restore(): void | Promise<void>;
}

export interface ThemePreviewSession {
  readonly id: number;
  /** Aborted when the session is superseded or ended. Long-running preview
   *  work (downloads, imports) must honor it before calling `show`. */
  readonly signal: AbortSignal;
  isActive(): boolean;
  /** Paint a draft. Returns false when the session no longer owns the
   *  document — the caller should discard its result. */
  show(paint: ThemePreviewPaint): boolean;
  /** End the session. With `restore: true`, the persisted appearance is
   *  repainted — but only if this session still owns the document, so an
   *  already-superseded owner cannot restore over a newer draft. */
  end(options?: { restore?: boolean }): Promise<void>;
}

export interface ThemePreviewCoordinator {
  /** Start a session, superseding (and aborting) any current owner. */
  begin(): ThemePreviewSession;
  active(): ThemePreviewSession | null;
  /** Re-apply the active session's last paint — e.g. after an OS appearance
   *  change — without touching persisted settings. Returns false when no
   *  preview owns the document. */
  repaint(): boolean;
}

export function createThemePreviewCoordinator(
  effects: ThemePreviewEffects,
): ThemePreviewCoordinator {
  let nextId = 0;
  let current: {
    ended: boolean;
    lastPaint: ThemePreviewPaint | null;
    controller: AbortController;
    session: ThemePreviewSession;
  } | null = null;

  function begin(): ThemePreviewSession {
    if (current) {
      current.ended = true;
      current.controller.abort();
      current = null;
    }
    const controller = new AbortController();
    const record = {
      ended: false,
      lastPaint: null as ThemePreviewPaint | null,
      controller,
      session: null as unknown as ThemePreviewSession,
    };
    record.session = {
      id: ++nextId,
      signal: controller.signal,
      isActive: () => current?.session === record.session && !record.ended,
      show: (paint) => {
        if (!record.session.isActive()) return false;
        record.lastPaint = paint;
        effects.apply(paint);
        return true;
      },
      end: async (options) => {
        if (record.ended) return;
        record.ended = true;
        controller.abort();
        const wasActive = current?.session === record.session;
        if (wasActive) current = null;
        if (options?.restore && wasActive) await effects.restore();
      },
    };
    current = record;
    return record.session;
  }

  return {
    begin,
    active: () => (current && !current.ended ? current.session : null),
    repaint: () => {
      if (!current || current.ended || !current.lastPaint) return false;
      effects.apply(current.lastPaint);
      return true;
    },
  };
}
