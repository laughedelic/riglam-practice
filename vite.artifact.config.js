// Artifact build: the same sources as the PWA, bundled as one classic script and one stylesheet with every
// asset (the data) inlined. scripts/build-artifact.mjs then writes them into a single HTML page.
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { fullData } from "./scripts/vite-full-data.mjs";

const root = fileURLToPath(new URL(".", import.meta.url));

export default {
  configFile: false,
  root,
  logLevel: "warn",
  publicDir: false,
  plugins: [fullData()],
  build: {
    outDir: resolve(root, "dist/artifact/.parts"),
    emptyOutDir: true,
    target: "es2022",
    minify: false, // readable output: the artifact loop edits sources, but people read the published page too
    cssCodeSplit: false,
    assetsInlineLimit: Number.MAX_SAFE_INTEGER,
    lib: {
      entry: resolve(root, "src/entry-artifact.ts"),
      formats: ["iife"],
      name: "Riglam",
      fileName: () => "app.js",
      cssFileName: "app",
    },
  },
};
