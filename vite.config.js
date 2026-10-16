// PWA build and dev server. The artifact build has its own config (vite.artifact.config.js, run by
// scripts/build-artifact.mjs). Both build the same sources in src/app.
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { includeMarkup } from "./scripts/vite-include-markup.mjs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

// Which build this is: the commit it was made from (BUILD_SHA in CI, else git), the version and the time. The page shows it in Options
// and compares it with build.json on the server to say whether a newer build is out (src/pwa/about.ts).
function git(...args) {
  try { return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); } catch { return ""; }
}
const commit = (process.env.BUILD_SHA || git("rev-parse", "HEAD")).slice(0, 7) || "unknown";
const build = { version: pkg.version, commit: commit + (!process.env.BUILD_SHA && git("status", "--porcelain", "--untracked-files=no") ? "+local" : ""), builtAt: new Date().toISOString() };
const buildInfo = () => ({
  name: "riglam-build-info",
  generateBundle() { this.emitFile({ type: "asset", fileName: "build.json", source: JSON.stringify(build) + "\n" }); },
});

export default defineConfig({
  // Relative asset paths: the app works from a domain root, a sub-path, or a Pages preview URL.
  base: process.env.BASE_PATH ?? "./",
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __BUILD__: JSON.stringify(build) },
  plugins: [
    buildInfo(),
    includeMarkup(fileURLToPath(new URL("./src/app/markup.html", import.meta.url))),
    VitePWA({
      registerType: "prompt", // the page asks the reader before it reloads onto a new version (src/pwa/updates.ts); the worker itself does not wait
      injectRegister: false,
      includeAssets: ["icons/icon.svg", "icons/apple-touch-icon.png"],
      workbox: {
        globPatterns: ["**/*.{js,css,html,json,woff2,png,svg,ico}"],
        globIgnores: ["**/build.json"], // fetched from the network on purpose: it is how the page finds out that a newer build is out
        navigateFallback: "index.html",
        navigateFallbackDenylist: [/^\/api\//], // the server's paths are the server's, also when opened in a tab
        cleanupOutdatedCaches: true,
        skipWaiting: true, // a new worker takes over at once: one that waits for every page to close never gets its turn on a phone
      },
      manifest: {
        id: "./",
        // The staging deploy sets these so that its app can be installed next to the real one and told apart (docs/STAGING.md).
        name: process.env.RIGLAM_APP_NAME ?? "Riglam practice",
        short_name: process.env.RIGLAM_APP_SHORT_NAME ?? "Riglam",
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
