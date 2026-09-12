# Security Policy

## What this app handles

Usage Monitor reads provider credentials to fetch usage data:

- macOS Keychain entries for `Claude Code-credentials`, `Codex Auth`, and `cursor-access-token`
- `~/.claude/.credentials.json`, `~/.codex/auth.json`, `~/.cursor/auth.json`, and the Cursor app's `state.vscdb`
- Credentials you enter directly, stored via `tauri-plugin-store` in the app's data directory

Credentials are only ever sent to the provider's own API (Anthropic, OpenAI, Cursor). There is no telemetry and no third-party endpoint. The webview's command surface is restricted to a host allowlist (`src-tauri/src/http.rs`), a Keychain service allowlist (`src-tauri/src/credentials/keychain.rs`), and home-relative file reads (`src-tauri/src/credentials.rs`).

## Reporting a vulnerability

Please report security issues privately via GitHub: [report a vulnerability](https://github.com/adampeterhiggins/usage-monitor/security/advisories/new).

Do not open a public issue for security reports.
