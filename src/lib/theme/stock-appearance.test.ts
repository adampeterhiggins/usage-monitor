import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { expect, it } from "vitest";
import { resolveUiPalette } from "./resolve-ui-palette";
import { stockModeSpec } from "./stock-source";
import { paletteToCssVariables } from "./ui-palette-css";

// Captured from PR #32 before these amendments. This is an exact regression
// guard for Default, including all context/state colours and material values.
const BASELINES = [
  [
    "light",
    50,
    40,
    "343bc74e66122212cbd591cdfc1c47dea6fc4adcbe7c825dd3e7f216cd0a7938"
  ],
  [
    "light",
    50,
    80,
    "343bc74e66122212cbd591cdfc1c47dea6fc4adcbe7c825dd3e7f216cd0a7938"
  ],
  [
    "light",
    50,
    100,
    "343bc74e66122212cbd591cdfc1c47dea6fc4adcbe7c825dd3e7f216cd0a7938"
  ],
  [
    "light",
    100,
    40,
    "aef93640d51ba5bdfa26a44f77563c21453865ec02d1e89642ce5ea4942bfbe2"
  ],
  [
    "light",
    100,
    80,
    "aef93640d51ba5bdfa26a44f77563c21453865ec02d1e89642ce5ea4942bfbe2"
  ],
  [
    "light",
    100,
    100,
    "aef93640d51ba5bdfa26a44f77563c21453865ec02d1e89642ce5ea4942bfbe2"
  ],
  [
    "light",
    200,
    40,
    "2f79445893d943d2125f4744f7ade5c9e0f00df3435644c9c60ffda74f7664b8"
  ],
  [
    "light",
    200,
    80,
    "2f79445893d943d2125f4744f7ade5c9e0f00df3435644c9c60ffda74f7664b8"
  ],
  [
    "light",
    200,
    100,
    "2f79445893d943d2125f4744f7ade5c9e0f00df3435644c9c60ffda74f7664b8"
  ],
  [
    "dark",
    50,
    40,
    "c48a8f16edd0079535bc8abe97f04d511363a41e5b35e734f2d89728f20fe9ac"
  ],
  [
    "dark",
    50,
    80,
    "fc12e139bc5896d8f40fececf15c50186c2ae17dcbe6e8434e9eec832b497dfa"
  ],
  [
    "dark",
    50,
    100,
    "4d58a26582792106366d6572aab2461085a74ac134924264585982fcefc8fb29"
  ],
  [
    "dark",
    100,
    40,
    "d57dc355d96a6a0827e8750c159e5fe6232bbf0cd926ed9a6107b81324e9b0da"
  ],
  [
    "dark",
    100,
    80,
    "983c830bbc4f3d238fae2eb5a3aefe90424eae468b31b652ad1a97e803d4c911"
  ],
  [
    "dark",
    100,
    100,
    "e42d7534b6903f58ea57d5dc98e68a329af52ce4616ed5293aa961c701945b2f"
  ],
  [
    "dark",
    200,
    40,
    "fdf1d28e6a43477cedebb59bf9a7deeb4c7bfdcba27df13df86c7049edd2d072"
  ],
  [
    "dark",
    200,
    80,
    "f8de833f6c894d146923097eb4fb163b38715c1d333fe46a1ee2d0f08798c972"
  ],
  [
    "dark",
    200,
    100,
    "32b1af97b153c1475b2046cc6439058f5de3c0cd3a467eaa4e2c12c79c794b0c"
  ]
] as const;

it.each(BASELINES)("preserves Default %s at contrast %i and glass %i", (mode, appearanceContrast, glassOpacity, expected) => {
  const palette = resolveUiPalette(stockModeSpec(mode), mode, { appearanceContrast, glassOpacity });
  const hash = bytesToHex(sha256(new TextEncoder().encode(JSON.stringify({ contexts: palette.contexts, material: palette.material }))));
  expect(hash).toBe(expected);
  expect(palette.stock).toBe(true);
  expect(palette.contexts.toolbar.text.primary).toBe(palette.contexts.canvas.text.primary);
  // New state foreground utilities must have no visual effect on Default.
  for (const context of Object.values(palette.contexts)) {
    for (const family of [context.control, context.action, context.destructive]) {
      expect(family.hover.foreground).toBe(family.rest.foreground);
      expect(family.pressed.foreground).toBe(family.rest.foreground);
    }
  }
  expect(paletteToCssVariables(palette)["--ui-toolbar-paint"]).toBe("transparent");
});

it("does not grant the Default exception to a user-authored copy", () => {
  const palette = resolveUiPalette(structuredClone(stockModeSpec("dark")), "dark");
  expect(palette.stock).toBe(false);
  expect(paletteToCssVariables(palette)["--ui-toolbar-paint"]).toBe(palette.contexts.toolbar.background);
});
