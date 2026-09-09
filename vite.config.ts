import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolveDeploymentMeta } from "./scripts/resolve-deployment-meta.mjs";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(async () => {
  const deployment = resolveDeploymentMeta();

  return {
    plugins: [react(), tailwindcss()],
    define: {
      "import.meta.env.VITE_APP_VERSION": JSON.stringify(deployment.version),
      "import.meta.env.VITE_GIT_BRANCH": JSON.stringify(deployment.branch),
      "import.meta.env.VITE_GIT_COMMIT": JSON.stringify(deployment.commit),
      "import.meta.env.VITE_PR_NUMBER": JSON.stringify(deployment.prNumber),
      "import.meta.env.VITE_PR_URL": JSON.stringify(deployment.prUrl),
    },
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        ignored: ["**/src-tauri/**"],
      },
    },
  };
});
