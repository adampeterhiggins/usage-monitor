# Usage Monitor

A native macOS menu-bar app that tracks usage allowances for **Claude**, **Codex**, and **Cursor** across multiple accounts. Summon it with a global shortcut (default **⌘⇧U**) or the menu-bar icon.

Tauri v2 shell (real `.app`, WKWebView) with all usage fetching, caching, and UI in TypeScript. Ported from the Glaze Usage Monitor panel.

## Setup

```bash
npm install
npm run tauri dev      # develop — the panel is hidden until you press ⌘⇧U
make app               # build and install into /Applications
```

On first launch the panel is empty. Add accounts from **Settings → Manage Accounts** (or **⌘K**). Each provider can **Sign in** to create a login session just for that account — the same idea as **Sign in with GitHub** for updates, and independent of your CLI logins. Leaving the credential blank still uses the local Claude Code / Codex / Cursor login when one exists.

### Providers

| Provider | Credential | Zero-setup |
|---|---|---|
| Claude | Sign in, `sessionKey` cookie, or blank | Reads Claude Code from the macOS Keychain / `~/.claude/.credentials.json` |
| Codex | Sign in, `~/.codex/auth.json` contents, or blank | Auto-reads the Keychain / `~/.codex/auth.json` |
| Cursor | Sign in, `WorkosCursorSessionToken` cookie, or blank | Reads the Cursor app login (`state.vscdb`) or `cursor-agent` from the Keychain |

Credentials stay in the app's data directory via `tauri-plugin-store`. They never leave this Mac except to the provider's own usage API.

## Using it

The app is an accessory — no Dock icon. Left-click the menu-bar icon or press the show/hide shortcut to open the panel. It hides when it loses focus, or when you press Escape.

**⌘K** opens Settings. **Manage Accounts** lets you add, edit, hide, remove, and reorder accounts. You can also switch layout (Wall, Grouped, Stacked, Ledger, Strip, Focus), change theme, and rebind the shortcuts.

## Releasing and updating

Modelled on github-monitor's release flow — preflight resolves the version, build produces artifacts, release publishes them, a final job updates the update manifest — implemented for Tauri, **stable channel only**.

### One-time setup

The signing key is what the app uses to prove an update is genuinely yours; without it, an update cannot be installed.

```bash
# 1. Generate a keypair (already done if .updater/ exists — it is gitignored)
make keygen

# 2. Give CI the private key
make secrets
```

The **public** key lives in `src-tauri/tauri.conf.json` and is committed — that is what each build trusts. **Back up `.updater/signing.key`.** Lose it and existing installs can never be updated again; they would need replacing by hand.

Updates are served from this private repository, so the running app needs GitHub credentials with read access. In **Settings → Updates**, use **Sign in with GitHub** (device flow). That asks for the `repo` scope. A PAT or **Import from gh** still works if you want a single-repo fine-grained token instead.

The OAuth App is already registered. Enable **Device Authorization Grant** on it if that is still off. The public client ID lives in `src/lib/updates/githubAuth.ts`; leave the client secret unused.

### Cutting a release

```bash
make release          # check, gate, bump if needed, commit, tag, push, watch CI, verify
make release-0.3.0    # release exactly 0.3.0
make release YES=1    # no prompts
make release PUSH=0   # rehearse: stops after tagging, pushes nothing
```

`make` on its own lists everything. `make doctor` checks the prerequisites (tooling, a `node_modules` that matches the lockfile, the universal-build target, the signing key, the repo secret, git state) before you find out the hard way. Every check and release path first runs `make deps`, which runs `npm ci` only when `node_modules` has drifted from `package-lock.json`, so a PR that added a dependency cannot fail typecheck on your machine after the version has been bumped.

The chain is: version gate → bump → `npm run check` → commit → tag → push → follow the CI run → **verify the published manifest is actually installable**.

| Knob | Effect |
|---|---|
| `FORCE=1` | skip the version gate (rebuild the same version) |
| `YES=1` | accept prompts; required in a non-interactive shell |
| `PUSH=0` | stop after tagging |
| `WATCH=0` | don't follow the CI run |

Other useful targets: `make version` (reports drift across the three files), `make set-version-0.3.0`, `make app` (build and install into `/Applications`, verifying the installed version), `make runs`, `make watch`, `make verify-release`, and `make release-local` if CI is broken and you need to publish from your laptop.

The workflow then builds a signed **universal** macOS bundle, publishes a GitHub Release with the `.dmg`, `.app.tar.gz` and `.app.tar.gz.sig`, and commits a `latest.json` to the `releases` branch. The running app picks it up on its next check — 15 seconds after launch, then every 6 hours — or immediately via **Settings → Updates → Check now**.

### How updates reach a private repo

This repository is private, so the updater cannot fetch anonymously. Two facts make it work without any Rust:

- the plugin sends configured request headers on **both** the manifest fetch and the binary download, defaulting `Accept` only when unset — `application/json` for the manifest, `application/octet-stream` for the download. Passing just `Authorization` therefore leaves both correct;
- `raw.githubusercontent.com` honours a bearer token on private repositories, and so does `api.github.com/repos/…/releases/assets/<id>`.

So the manifest lives on the `releases` branch (a stable URL, unlike per-release asset ids) and points the download at the asset's **API** URL.

**`raw.githubusercontent.com` caches**, so a freshly published manifest is not served immediately. Verification must not gate on raw — both the workflow and `make verify-release` check the `releases` branch through the contents API.

## Architecture

```
src/
  AppRoot.tsx        QueryClient, window selection, global hosts
  windows/           PanelApp + AppearanceApp — distinct lifecycles
  state/             observable stores (accounts, usage, appearance,
                     updates, preferences) — no rendering
  hooks/             React/browser lifecycle (panel keys, lifecycle,
                     updater poller, appearance refresh)
  components/        cards, layouts (views/), dialogs, ui/ primitives
  providers/         per-provider auth + usage translation
                     (claude/, codex/, cursor/, shared/, registry)
  contracts/         domain + capability shapes (no React/Tauri)
  lib/               non-React operations: accounts persistence,
                     usage policy/format, settings document, theme,
                     updates service + GitHub auth, utils
  platform/          the only layer importing @tauri-apps/* —
                     windows, credentials, persistence, events, http,
                     external actions, app lifecycle, updates, shortcuts
  testing/           fixtures + platform-mock (vite --mode mock)
src-tauri/
  src/lib.rs         tray, accessory policy, show/hide, keychain/home-file/Cursor IDE reads
```

`npm run check` includes `check:boundaries`, which rejects imports that
cross these lines (e.g. `@tauri-apps/*` outside `platform/`, React or
state inside `contracts/`, `lib/`, or `providers/`).
