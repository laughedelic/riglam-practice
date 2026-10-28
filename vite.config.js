// PWA build and dev server. The artifact build has its own config (vite.artifact.config.js, run by
// scripts/build-artifact.mjs). Both build the same sources in src/app.
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { includeMarkup } from "./scripts/vite-include-markup.mjs";
import { iconSet } from "./scripts/lib/icon-set.mjs";

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

// Which icon set the build carries: the Main icons (public/icons), or the Preview icons (public/icons/preview) in staging and pull request
// builds, so that those apps are told apart from the real one on a home screen and in a tab (scripts/lib/icon-set.mjs says which build is which).
const iconDir = iconSet() === "preview" ? "icons/preview" : "icons";
const iconLinks = () => ({
  name: "riglam-icon-links",
  transformIndexHtml: (html) => html.replaceAll('href="icons/', `href="${iconDir}/`),
});

export default defineConfig({
  // Relative asset paths: the app works from a domain root, a sub-path, or a Pages preview URL.
  base: process.env.BASE_PATH ?? "./",
  define: { __APP_VERSION__: JSON.stringify(pkg.version), __BUILD__: JSON.stringify(build), __PREVIEW__: JSON.stringify(iconSet() === "preview") },
  plugins: [
    buildInfo(),
    iconLinks(),
    includeMarkup(fileURLToPath(new URL("./src/app/markup.html", import.meta.url))),
    includeMarkup(fileURLToPath(new URL("./src/pwa/cover.html", import.meta.url)), "cover"),
    VitePWA({
      registerType: "prompt", // the page asks the reader before it reloads onto a new version (src/pwa/updates.ts); the worker itself does not wait
      injectRegister: false,
      includeAssets: [`${iconDir}/icon.svg`, `${iconDir}/apple-touch-icon.png`],
      workbox: {
        globPatterns: ["**/*.{js,css,html,json,woff2,png,svg,ico}"],
        globIgnores: ["**/build.json", ...(iconDir === "icons" ? ["icons/preview/**"] : ["icons/*.png", "icons/*.svg"])], // build.json is fetched from the network on purpose: it is how the page finds out that a newer build is out
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
        // One dark ground, the Path's in dark mode (slate). Chrome on Android (before its installed apps draw edge to edge) paints the installed
        // app's bottom navigation strip from these two colors, which are fixed and cannot follow the page's light or dark; a white one showed as a white
        // strip under a dark page. The page sets its own colors for the status bar (the theme-color metas) and for the page itself.
        background_color: "#161a20",
        theme_color: "#161a20",
        icons: [
          { src: `${iconDir}/icon-192.png`, sizes: "192x192", type: "image/png" },
          { src: `${iconDir}/icon-512.png`, sizes: "512x512", type: "image/png" },
          { src: `${iconDir}/icon-maskable-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" },
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
