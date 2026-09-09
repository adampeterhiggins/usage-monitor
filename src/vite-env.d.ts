/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string;
  readonly VITE_GIT_BRANCH?: string;
  readonly VITE_GIT_COMMIT?: string;
  readonly VITE_PR_NUMBER?: string;
  readonly VITE_PR_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
