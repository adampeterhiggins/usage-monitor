import { describe, expect, it } from "vitest";
import { parseAuthJson } from "../lib/usage/codex";
import { parseUsage } from "../lib/usage/claude";
import { sessionCookieFromJwt } from "../lib/usage/cursor";
import { MOCK_CURSOR_SESSION_JWT } from "./fixtures";
import { handleCommand } from "./mock-commands";

// Raw source of every app module, inlined by Vite — lets the test scan for
// invoke("cmd") call sites without node builtins (no @types/node here).
const SOURCES: Record<string, string> = import.meta.glob("../**/*.{ts,tsx}", {
  query: "?raw",
  import: "default",
  eager: true,
});

function commandsUsedInSource(): string[] {
  const names = new Set<string>();
  for (const [file, text] of Object.entries(SOURCES)) {
    if (file.includes("/testing/") || file.endsWith(".test.ts")) continue;
    for (const m of text.matchAll(/invoke[^(]*\(\s*"([^"]+)"/g)) names.add(m[1]);
  }
  return [...names].sort();
}

const ARGS: Record<string, unknown> = {
  http_request: { url: "https://api.anthropic.com/api/oauth/usage" },
  list_keychain_accounts: { service: "Claude Code-credentials" },
  read_keychain_password: { service: "Claude Code-credentials" },
  read_home_file: { relPath: ".codex/auth.json" },
};

describe("mock invoke coverage", () => {
  it("stubs every invoke command the frontend issues", () => {
    const used = commandsUsedInSource();
    expect(used.length).toBeGreaterThan(0);
    for (const cmd of used) {
      expect(() => handleCommand(cmd, ARGS[cmd]), cmd).not.toThrow(/unstubbed/);
    }
  });

  it("returns 501 for unstubbed URLs instead of lying", () => {
    const res = handleCommand("http_request", { url: "https://example.com/x" }) as { status: number };
    expect(res.status).toBe(501);
  });
});

describe("fixtures parse through the real parsers", () => {
  it("claude usage body feeds parseUsage", () => {
    const res = handleCommand("http_request", {
      url: "https://api.anthropic.com/api/oauth/usage",
    }) as { status: number; body: string };
    expect(res.status).toBe(200);
    const windows = parseUsage(JSON.parse(res.body));
    expect(windows.length).toBeGreaterThan(0);
  });

  it("codex auth.json fixture feeds parseAuthJson", () => {
    const raw = handleCommand("read_home_file", { relPath: ".codex/auth.json" }) as string;
    expect(parseAuthJson(raw, "mock").accountId).toBe("acct_mock_codex");
  });

  it("cursor session JWT feeds sessionCookieFromJwt", () => {
    const cookie = sessionCookieFromJwt(MOCK_CURSOR_SESSION_JWT, "mock");
    expect(cookie).toContain("user_mock_1234::");
  });
});
