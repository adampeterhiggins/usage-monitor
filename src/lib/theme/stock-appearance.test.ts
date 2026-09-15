import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { expect, it } from "vitest";
import { resolveUiPalette } from "./resolve-ui-palette";
import { stockModeSpec } from "./stock-source";
import { paletteToCssVariables } from "./ui-palette-css";

// Captured from PR #32 before these amendments. This is an exact regression
// guard for Default, including all context/state colours and material values.
// Re-captured when the Devin provider added the `purple` identity tone: every
// pre-existing colour was verified byte-identical, only the new pair is added.
const BASELINES = [
  [
    "light",
    50,
    40,
    "ef6127bef7ccfe89b9d84c19c0471f3478b6e5fe6df1dadcf48a598ca17955ce"
  ],
  [
    "light",
    50,
    80,
    "ef6127bef7ccfe89b9d84c19c0471f3478b6e5fe6df1dadcf48a598ca17955ce"
  ],
  [
    "light",
    50,
    100,
    "ef6127bef7ccfe89b9d84c19c0471f3478b6e5fe6df1dadcf48a598ca17955ce"
  ],
  [
    "light",
    100,
    40,
    "88a7f052376a2dccedb916e3f21979dad3f5eabd2608a7d15d779bdf487cba44"
  ],
  [
    "light",
    100,
    80,
    "88a7f052376a2dccedb916e3f21979dad3f5eabd2608a7d15d779bdf487cba44"
  ],
  [
    "light",
    100,
    100,
    "88a7f052376a2dccedb916e3f21979dad3f5eabd2608a7d15d779bdf487cba44"
  ],
  [
    "light",
    200,
    40,
    "f7e68f1613443634baf5cc99f01c3f1addcadab6cab8e57841696d67793ff82c"
  ],
  [
    "light",
    200,
    80,
    "f7e68f1613443634baf5cc99f01c3f1addcadab6cab8e57841696d67793ff82c"
  ],
  [
    "light",
    200,
    100,
    "f7e68f1613443634baf5cc99f01c3f1addcadab6cab8e57841696d67793ff82c"
  ],
  [
    "dark",
    50,
    40,
    "f3a8069608df0464988bd4e71ec95fcc07de0e70e60bb0588c56ffa5fb8d2578"
  ],
  [
    "dark",
    50,
    80,
    "2078d1625fee8426699a8e033804b432fdee2b6ebaa286726a3094fe66c7512b"
  ],
  [
    "dark",
    50,
    100,
    "69b218751e8644b23536083e817a667f68ff334d42f5aea0ac6a0c925f013976"
  ],
  [
    "dark",
    100,
    40,
    "62f866488a02f2c7ef6f3162dfb4fa77dd91c426035112d754326796ff980df6"
  ],
  [
    "dark",
    100,
    80,
    "dd3bc309b91114318bf89634ba41af1a263d9132f2e059ba6975d8278f8ef115"
  ],
  [
    "dark",
    100,
    100,
    "e0f9897282eacd1b27997517a6dd4c15b753e226f8689582942ed8ac27b2462e"
  ],
  [
    "dark",
    200,
    40,
    "d28532b6b2d81fae83bd9f69f040042e917789bef6f1cf37660268a7a451369a"
  ],
  [
    "dark",
    200,
    80,
    "e9b8e6d79705913c212c3dc148bc07881ff44cf4b62109fe45eeda0937a76e7d"
  ],
  [
    "dark",
    200,
    100,
    "c0f35523717c05a7274097f74b570881842a997fa9d1181caca42361cca4d504"
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
