import * as React from "react";
import { subscribeToasts, type Toast } from "./toast";

export function ToastHost() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  React.useEffect(() => subscribeToasts(setToasts), []);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-[80] flex w-72 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          data-ui-surface="menu"
          className={`ui-surface rounded-xl px-3 py-2 text-[12px] shadow-lg ring-1 ${
            t.tone === "error"
              ? "text-ui-status-critical-text ring-ui-status-critical/40"
              : "text-ui-primary ring-ui-subtle"
          }`}
        >
          <div className="font-semibold">{t.title}</div>
          {t.description ? <div className="mt-0.5 text-ui-secondary">{t.description}</div> : null}
        </div>
      ))}
    </div>
  );
}
