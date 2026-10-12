#!/usr/bin/env node
// Renders the PNG icons the manifest and iOS need from public/icons/icon.svg (a marigold rhombus on the
// crimson of the booklet bands). Run `npm run icons` after changing the SVG; the PNGs are committed.
import sharp from "sharp";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../public/icons");
const svg = readFileSync(resolve(dir, "icon.svg"));
const sizes = { "icon-192.png": 192, "icon-512.png": 512, "apple-touch-icon.png": 180 };
for (const [name, size] of Object.entries(sizes)) {
  await sharp(svg, { density: 384 }).resize(size, size).png({ compressionLevel: 9 }).toFile(resolve(dir, name));
  console.log("wrote", name);
}
// Maskable: the rhombus must sit inside the central 80% circle, so draw it smaller on the same ground.
const maskable = Buffer.from(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512" fill="#b83545"/><polygon points="256,136 376,256 256,376 136,256" fill="#faaf3f"/></svg>`,
);
await sharp(maskable, { density: 384 }).resize(512, 512).png({ compressionLevel: 9 }).toFile(resolve(dir, "icon-maskable-512.png"));
console.log("wrote icon-maskable-512.png");
