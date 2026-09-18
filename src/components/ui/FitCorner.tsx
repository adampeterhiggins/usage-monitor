import * as React from "react";
import { fitPanelToContent } from "../../platform/windows";

export function FitCorner({
  contentRef,
  headerRef,
}: {
  contentRef: React.RefObject<HTMLElement | null>;
  headerRef: React.RefObject<HTMLElement | null>;
}) {
  // A borderless `.resizable` window hands the outer ~15px of each corner to
  // macOS's native resize hit-testing — pointer events there never reach the
  // webview — so the grip must sit further in to stay clickable.
  return (
    <button
      type="button"
      aria-label="Fit window to content"
      title="Fit to content"
      className="fit-corner no-drag absolute bottom-5 right-5 z-50 transition-opacity hover:opacity-100"
      onClick={() => {
        const content = contentRef.current;
        if (!content) return;
        void fitPanelToContent(content, headerRef.current);
      }}
    >
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M8 20.5A12.5 12.5 0 0 0 20.5 8"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
