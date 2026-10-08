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
// Re-captured again for the Grok, OpenCode and Antigravity tones (slate, teal,
// pink); the regenerated index.css only gained lines.
const BASELINES = [
  [
    "light",
    50,
    40,
    "f42ae3f6fc8fff50b27abfe473f75918a26bd7555c3d839f3f0dff38eccf60d7"
  ],
  [
    "light",
    50,
    80,
    "f42ae3f6fc8fff50b27abfe473f75918a26bd7555c3d839f3f0dff38eccf60d7"
  ],
  [
    "light",
    50,
    100,
    "f42ae3f6fc8fff50b27abfe473f75918a26bd7555c3d839f3f0dff38eccf60d7"
  ],
  [
    "light",
    100,
    40,
    "5d74e326aa17a31312d544091703e78c8e854412d55ae8e45999df3e7b220c22"
  ],
  [
    "light",
    100,
    80,
    "5d74e326aa17a31312d544091703e78c8e854412d55ae8e45999df3e7b220c22"
  ],
  [
    "light",
    100,
    100,
    "5d74e326aa17a31312d544091703e78c8e854412d55ae8e45999df3e7b220c22"
  ],
  [
    "light",
    200,
    40,
    "396710882e42ec632378b4f413f28ce5678d24e75d46dfa39c44c83570ddb455"
  ],
  [
    "light",
    200,
    80,
    "396710882e42ec632378b4f413f28ce5678d24e75d46dfa39c44c83570ddb455"
  ],
  [
    "light",
    200,
    100,
    "396710882e42ec632378b4f413f28ce5678d24e75d46dfa39c44c83570ddb455"
  ],
  [
    "dark",
    50,
    40,
    "ca12acdb7358a31a45f195ddab2ee020b59b1830deec826450be8474629d641c"
  ],
  [
    "dark",
    50,
    80,
    "8841db161639645f36bb8c5693822146a96eecb792fff1bf3e5b1bf4151c289e"
  ],
  [
    "dark",
    50,
    100,
    "f9b25065e060656fcaf20467845a5e7abc9e97f19db4d8731535fa62cad57825"
  ],
  [
    "dark",
    100,
    40,
    "e55af6a91139fcb3d518c1f3e796ed074195512744b64e4bc2be73d149362b26"
  ],
  [
    "dark",
    100,
    80,
    "271949713bd25c4623e505b3823b4ae5ab47aa0ae297f686ce5d73b3db068ecc"
  ],
  [
    "dark",
    100,
    100,
    "305ad79961a5610502475c814898ac45fcd8415390c44a1de5f345a4887f4564"
  ],
  [
    "dark",
    200,
    40,
    "d00b084b73e23d65c13db19f5d61e099324d29075710ff8979e79fb27e998d97"
  ],
  [
    "dark",
    200,
    80,
    "f2f7bfd0fb5879f83ea88e519cc9a189b7ea1356b6ddd4cc70e458fb786b9db7"
  ],
  [
    "dark",
    200,
    100,
    "f53c5a1ee25ee6a9e34e63866edb695e19508b535047825526cc832716d7b3ec"
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
