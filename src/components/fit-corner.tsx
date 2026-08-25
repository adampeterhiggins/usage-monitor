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
      className="fit-corner no-drag absolute bottom-1 right-1 z-50 flex size-5 items-center justify-center transition-opacity hover:opacity-100"
      onClick={() => {
        const content = contentRef.current;
        if (!content) return;
        void fitWindowToContent(content, headerRef.current);
      }}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
        <path d="M9 1L1 9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        <path d="M9 4.5L4.5 9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
        <path d="M9 8L8 9" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
      </svg>
    </button>
  );
}
