import { beforeEach, expect, it, vi } from "vitest";
const store = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), delete: vi.fn(), save: vi.fn() }));
vi.mock("./store", () => ({ settingsStore: store }));
import { getCustomThemes } from "../theme/custom-library";
import { parseThemeFile } from "../theme/theme-file";
import { installAndPersistTheme, updateAndPersistTheme } from "./custom-themes";
const row = { version: 2, id: "rollback", name: "Original", appearance: "light", seeds: { canvas: "#fff", accent: "#8844cc" } };
beforeEach(() => { vi.resetAllMocks(); });
it("rolls back both library and store cache after a failed save", async () => {
  store.get.mockResolvedValue([row]);
  store.save.mockRejectedValueOnce(new Error("Disk full"));
  await expect(updateAndPersistTheme("rollback", parseThemeFile({ ...row, name: "Edited" }))).rejects.toThrow("Disk full");
  expect(getCustomThemes()[0].label).toBe("Original");
  expect(store.set).toHaveBeenLastCalledWith("customThemes", [row]);
  await updateAndPersistTheme("rollback", parseThemeFile({ ...row, name: "Retry" }));
  expect(getCustomThemes()[0].label).toBe("Retry");
});
it("restores an absent key after a failed first installation", async () => {
  store.get.mockResolvedValue(undefined);
  store.save.mockRejectedValueOnce(new Error("Disk full"));
  await expect(installAndPersistTheme(parseThemeFile(row))).rejects.toThrow("Disk full");
  expect(getCustomThemes()).toEqual([]);
  expect(store.delete).toHaveBeenCalledWith("customThemes");
});
