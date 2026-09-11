import * as React from "react";

/** Titled block used by every Appearance section. */
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-2">
      <h3 className="text-[11px] font-medium uppercase tracking-wide text-ui-tertiary">{title}</h3>
      {children}
    </section>
  );
}
