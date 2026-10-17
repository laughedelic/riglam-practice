#!/usr/bin/env node
// Renders the PNG icons the manifest and iOS need from the two SVGs: public/icons/icon.svg (the Main icon, in every build) and
// public/icons/preview/icon.svg (the Preview icon, in staging and pull request builds: RIGLAM_ICON_SET=preview, see vite.config.js).
// Run `npm run icons` after changing an SVG; the PNGs are committed.
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../public/icons");
// The maskable icon is the same picture: the art sits inside the central 80% circle, which is all a mask keeps.
const sizes = { "icon-192.png": 192, "icon-512.png": 512, "icon-maskable-512.png": 512, "apple-touch-icon.png": 180 };
for (const dir of [root, resolve(root, "preview")]) {
  const svg = readFileSync(resolve(dir, "icon.svg"));
  for (const [name, size] of Object.entries(sizes)) {
    await sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(resolve(dir, name));
    console.log("wrote", dir.slice(root.length - "public/icons".length), name);
  }
}
