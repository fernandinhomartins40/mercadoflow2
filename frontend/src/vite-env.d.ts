/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_SHOW_TEST_LOGINS?: string;
  /** 'gestao' no build do app MercadoFlow Gestão (src/lib/nativeApp.ts). */
  readonly VITE_NATIVE_APP?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
