import * as React from "react";
import { Text } from "./text";

export function EmptyState({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
      <Text variant="strong">{title}</Text>
      <Text color="secondary" className="max-w-sm">
        {description}
      </Text>
      {actions ? <div className="mt-2">{actions}</div> : null}
    </div>
  );
}
