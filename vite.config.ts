import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolveDeploymentMeta } from "./scripts/resolve-deployment-meta.mjs";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

/**
 * `vite --mode mock` serves the frontend in a plain browser with every
 * @tauri-apps specifier aliased to src/testing/platform-mock/. Agents (and humans
 * without a signed-in desktop) get a fully drivable app on localhost:1420.
 */
const TAURI_MOCK_ALIASES: Record<string, string> = {
  "@tauri-apps/api/core": "core",
  "@tauri-apps/api/event": "event",
  "@tauri-apps/api/window": "window",
  "@tauri-apps/api/webviewWindow": "webview-window",
  "@tauri-apps/api/app": "app",
  "@tauri-apps/plugin-store": "store",
  "@tauri-apps/plugin-updater": "updater",
  "@tauri-apps/plugin-process": "process",
  "@tauri-apps/plugin-opener": "opener",
  "@tauri-apps/plugin-global-shortcut": "global-shortcut",
};

export default defineConfig(async ({ mode }) => {
  const deployment = resolveDeploymentMeta();
  const mock = mode === "mock";

  return {
    plugins: [react(), tailwindcss()],
    resolve: mock
      ? {
          alias: Object.fromEntries(
            Object.entries(TAURI_MOCK_ALIASES).map(([specifier, file]) => [
              specifier,
              fileURLToPath(new URL(`./src/testing/platform-mock/${file}.ts`, import.meta.url)),
            ]),
          ),
        }
      : undefined,
    define: {
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(deployment.version),
      "import.meta.env.VITE_GIT_BRANCH": JSON.stringify(deployment.branch),
      "import.meta.env.VITE_GIT_COMMIT": JSON.stringify(deployment.commit),
      "import.meta.env.VITE_PR_NUMBER": JSON.stringify(deployment.prNumber),
      "import.meta.env.VITE_PR_URL": JSON.stringify(deployment.prUrl),
    },
    clearScreen: false,
    server: {
      // Mock mode uses its own port range so it can run beside `tauri dev`.
      port: mock ? 1427 : 1420,
      strictPort: !mock,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        ignored: ["**/src-tauri/**", "**/.context/**"],
      },
    },
  };
});
