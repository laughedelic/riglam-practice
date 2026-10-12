// PWA build and dev server. The artifact build has its own config (vite.artifact.config.js, run by
// scripts/build-artifact.mjs). Both build the same sources in src/app.
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { fileURLToPath } from "node:url";
import { includeMarkup } from "./scripts/vite-include-markup.mjs";
import { appVersion } from "./scripts/lib/app-version.mjs";

export default defineConfig({
  // Relative asset paths: the app works from a domain root, a sub-path, or a Pages preview URL.
  base: process.env.BASE_PATH ?? "./",
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  plugins: [
    includeMarkup(fileURLToPath(new URL("./src/app/markup.html", import.meta.url))),
    VitePWA({
      registerType: "prompt", // an update waits until the app is reopened (see src/pwa/register-sw.js)
      injectRegister: false,
      includeAssets: ["icons/icon.svg", "icons/apple-touch-icon.png"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,json,enc,woff2,png,svg,ico}"],
        navigateFallback: "index.html",
        cleanupOutdatedCaches: true,
      },
      manifest: {
        id: "./",
        name: "Riglam practice",
        short_name: "Riglam",
        description: "Practice in logic and debate on the path of reasoning (Dudra and Tarig).",
        lang: "en",
        start_url: "./",
        scope: "./",
        display: "standalone",
        orientation: "any",
        background_color: "#ffffff",
        theme_color: "#ffffff",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  build: {
    outDir: "dist/pwa",
    emptyOutDir: true,
    target: "es2022",
    sourcemap: true,
  },
  server: { host: true },
  preview: { host: true, port: 4173 },
});
