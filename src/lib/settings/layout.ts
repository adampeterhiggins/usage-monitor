/** Panel layout identifiers and their persisted preference. */

import { settingsStore } from "./store";

export type Layout = "wall" | "grouped" | "stacked" | "ledger" | "strip" | "focus";

export const LAYOUTS: Array<{ id: Layout; label: string }> = [
  { id: "wall", label: "Wall" },
  { id: "grouped", label: "Grouped" },
  { id: "stacked", label: "Stacked" },
  { id: "ledger", label: "Ledger" },
  { id: "strip", label: "Strip" },
  { id: "focus", label: "Focus" },
];

export async function getLayout(): Promise<Layout> {
  return (await settingsStore.get<Layout>("layout")) ?? "wall";
}

export async function setLayout(layout: Layout): Promise<void> {
  await settingsStore.set("layout", layout);
  await settingsStore.save();
}

/** Column count for the Wall layout (default 2). */
export type WallColumns = 1 | 2 | 3 | 4;

export const WALL_COLUMNS: WallColumns[] = [1, 2, 3, 4];

export async function getWallColumns(): Promise<WallColumns> {
  const value = await settingsStore.get<WallColumns>("wallColumns");
  return value && WALL_COLUMNS.includes(value) ? value : 2;
}

export async function setWallColumns(columns: WallColumns): Promise<void> {
  await settingsStore.set("wallColumns", columns);
  await settingsStore.save();
}
