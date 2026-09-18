---
name: headless-dev
description: Run and test usage-monitor headlessly in a browser with mocked Tauri IPC. Use when an agent needs to verify UI behavior, take screenshots, or exercise the app without building the native shell. Covers dev:mock lifecycle, the __TAURI_MOCK__ driver handle, and fixture/stub maintenance.
---

# Headless dev (browser mock)

`npm run dev:mock` runs `vite --mode mock`, which serves the frontend at
http://localhost:1427 with every `@tauri-apps/*` import aliased to
`src/testing/platform-mock/`. The whole UI is drivable with browser automation
(Playwright, agent-browser, or the Devin browser preview) — no native build,
no real keychain, no real network.

## Surfaces

- `http://localhost:1427/` — the tray panel (Shell). Appearance is an
  in-panel dialog: Settings (⌘K or the gear button) → Appearance….

`data-mock-tauri="true"` is set on `<html>` when the mock bundle is active;
assert on it to confirm you are not talking to a real build.

## Driving it

`window.__TAURI_MOCK__` is installed by `src/testing/platform-mock/runtime.ts`:

- `__TAURI_MOCK__.emit("window:shown")` — simulate the tray panel being shown
- `__TAURI_MOCK__.invokeLog` — every `invoke` call with args, for assertions
- `__TAURI_MOCK__.reset()` — clear persisted mock stores back to fixtures

Fixture stores persist to localStorage across reloads, so settings/theme edits
survive refresh — reset them with `reset()` or a fresh browser context.

## What is real vs. fake

Real: all React rendering, provider usage
parsing (fixtures flow through `parseUsage`, `parseAuthJson`,
`sessionCookieFromJwt`, etc.), the settings/theme persistence stack (mock
LazyStore → localStorage), and the appearance-changed event bus.

Fake: `invoke` commands (dispatch table in `src/testing/mock-commands.ts`),
provider HTTP (`MOCK_HTTP_ROUTES` in `src/testing/fixtures.ts`, keyed by URL
substring — unstubbed URLs return 501 so nothing silently fakes success),
keychain/file reads (canned secrets — never the real Keychain), updater
(always up-to-date), global shortcuts, shell `gh auth token` (returns a canned
token), and native window chrome (hide/show/drag are recorded no-ops).

## Extending the mock

- New invoke command → add a case in `mock-commands.ts`;
  `src/testing/mock-commands.test.ts` scans the source and fails if a command
  is unstubbed.
- New provider endpoint or canned response → add a `[prefix, response]` pair
  to `MOCK_HTTP_ROUTES` (order matters; first substring match wins).
- New seeded state → extend `MOCK_STORES`, `MOCK_KEYCHAIN_*`, or
  `MOCK_HOME_FILES` in `fixtures.ts`.

## Lifecycle

Keep the dev server running across an iteration loop; it is cheap. Tear it
down when the task is done. If port 1427 is taken, Vite auto-offsets — read
the actual port from its stdout.
