import * as React from "react";
import { subscribeToasts, type Toast } from "../lib/toast";

export function ToastHost() {
  const [toasts, setToasts] = React.useState<Toast[]>([]);
  React.useEffect(() => subscribeToasts(setToasts), []);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed bottom-3 right-3 z-[80] flex w-72 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`rounded-xl px-3 py-2 text-[12px] shadow-lg ring-1 ${
            t.tone === "error"
              ? "bg-menu text-support-red ring-support-red/20"
              : "bg-menu text-ink ring-black/10"
          }`}
        >
          <div className="font-semibold">{t.title}</div>
          {t.description ? <div className="mt-0.5 text-secondary">{t.description}</div> : null}
        </div>
      ))}
    </div>
  );
}
