/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;
/** The build this page came from (vite.config.js); also served as build.json. */
declare const __BUILD__: { version: string; commit: string; builtAt: string };
/** Whether this is a Preview build (staging, a pull request) and not the real app (vite.config.js; scripts/lib/icon-set.mjs says which build is which). */
declare const __PREVIEW__: boolean;

/** The full term data as JSON text, merged at build time (scripts/vite-full-data.mjs); artifact build only. */
declare module "virtual:riglam-full-data" {
  const text: string;
  export default text;
}

/** The device part of the reference examples as JSON text, or null when this checkout has none (scripts/vite-full-data.mjs); artifact build only. */
declare module "virtual:riglam-examples" {
  const text: string | null;
  export default text;
}
