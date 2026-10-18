#!/usr/bin/env node
// Writes the app icons from the numbers in scripts/lib/icon-art.mjs: the flat SVG of each set (public/icons/icon.svg, the Main icon in
// every build, and public/icons/preview/icon.svg, the Preview icon in staging and pull request builds: RIGLAM_ICON_SET=preview, see
// vite.config.js) and the PNGs the manifest and iOS need, which get the generated grain (scripts/lib/grain.mjs, laid on by
// scripts/lib/render-icon.mjs) that the SVG leaves out because at favicon size it would only average out.
// Run `npm run icons` after changing icon-art.mjs; the SVGs and PNGs are committed.
import { writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { iconSvg } from "./lib/icon-art.mjs";
import { renderIcon } from "./lib/render-icon.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../public/icons");
// The maskable icon is the same picture: the figure sits inside the central 80% circle, which is all a mask keeps (the bands run to the
// edge, so a round mask shows the page with the bands' ends at its sides).
const sizes = { "icon-192.png": 192, "icon-512.png": 512, "icon-maskable-512.png": 512, "apple-touch-icon.png": 180 };
for (const [set, dir] of [["main", root], ["preview", resolve(root, "preview")]]) {
  writeFileSync(resolve(dir, "icon.svg"), iconSvg(set));
  console.log("wrote", dir.slice(root.length - "public/icons".length), "icon.svg");
  for (const [name, size] of Object.entries(sizes)) {
    await (await renderIcon(set, size)).toFile(resolve(dir, name));
    console.log("wrote", dir.slice(root.length - "public/icons".length), name);
  }
}
