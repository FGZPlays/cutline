/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_VERSION?: string;
  readonly VITE_RELEASE_DOWNLOAD_BASE?: string;
  readonly VITE_SOURCE_REPOSITORY?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
