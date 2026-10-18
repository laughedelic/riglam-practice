/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_VERSION__: string;
/** The build this page came from (vite.config.js); also served as build.json. */
declare const __BUILD__: { version: string; commit: string; builtAt: string };

/** The full term data as JSON text, merged at build time (scripts/vite-full-data.mjs); artifact build only. */
declare module "virtual:riglam-full-data" {
  const text: string;
  export default text;
}
