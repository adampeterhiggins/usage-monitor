import * as React from "react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

const MIN_WIDTH = 560;
const MIN_HEIGHT = 280;

export async function fitWindowToContent(content: HTMLElement, header: HTMLElement | null) {
  const win = getCurrentWindow();
  const factor = await win.scaleFactor();
  const inner = await win.innerSize();
  const width = Math.max(MIN_WIDTH, Math.round(inner.width / factor));
  const height = Math.max(MIN_HEIGHT, Math.round((header?.offsetHeight ?? 0) + content.scrollHeight));
  await win.setSize(new LogicalSize(width, height));
}

export function FitCorner({
  contentRef,
  headerRef,
}: {
  contentRef: React.RefObject<HTMLElement | null>;
  headerRef: React.RefObject<HTMLElement | null>;
}) {
  return (
    <button
      type="button"
      aria-label="Fit window to content"
      title="Fit to content"
      className="no-drag absolute bottom-0 right-0 z-20 size-6 text-quaternary transition-colors hover:text-secondary"
      onClick={() => {
        const content = contentRef.current;
        if (!content) return;
        void fitWindowToContent(content, headerRef.current);
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
