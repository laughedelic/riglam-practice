// The app icons (public/icons, made by `npm run icons`): the Main set every build carries and the Preview set that staging and pull request
// builds carry (RIGLAM_ICON_SET=preview, vite.config.js). Both must be the right sizes, keep their art inside the central 80% circle that
// every mask keeps, and be told apart by their ground.
import { expect, test } from "vitest";
import sharp from "sharp";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sets = { main: { dir: resolve(root, "public/icons"), ground: [0xb8, 0x35, 0x45] }, preview: { dir: resolve(root, "public/icons/preview"), ground: [0xfa, 0xaf, 0x3f] } };
const pngs = { "icon-192.png": 192, "icon-512.png": 512, "icon-maskable-512.png": 512, "apple-touch-icon.png": 180 };

async function pixels(file: string) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, size: info.width };
}

for (const [name, set] of Object.entries(sets)) {
  test(`the ${name} icons: an SVG and PNGs of the sizes the manifest and iOS ask for`, async () => {
    expect(readFileSync(join(set.dir, "icon.svg"), "utf8")).toMatch(/viewBox="0 0 512 512"/);
    for (const [file, size] of Object.entries(pngs)) {
      const meta = await sharp(join(set.dir, file)).metadata();
      expect([meta.width, meta.height], `${name}/${file}`).toEqual([size, size]);
    }
  });

  test(`the ${name} icons: the ground fills the square, and the art stays inside the central 80% circle`, async () => {
    for (const file of Object.keys(pngs)) {
      const { data, size } = await pixels(join(set.dir, file));
      const c = size / 2, safe = 0.4 * size; // the safe zone is a circle of 80% of the width
      let outside = 0, wrong = 0;
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          if (Math.hypot(x + 0.5 - c, y + 0.5 - c) <= safe + 1.5) continue; // a pixel of slack for the edge of a rhombus
          const i = (y * size + x) * 4;
          outside++;
          if (set.ground.some((v, k) => Math.abs(v - data[i + k]) > 2) || data[i + 3] !== 255) wrong++;
        }
      }
      expect(outside).toBeGreaterThan(size * size * 0.2);
      expect(wrong, `${name}/${file}: pixels outside the safe zone that are not the ground`).toBe(0);
    }
  });
}

test("the Main and Preview icons have different grounds", () => {
  expect(sets.main.ground).not.toEqual(sets.preview.ground);
});

const dist = resolve(root, "dist/pwa");
test.skipIf(!existsSync(join(dist, "index.html")))("the built page and manifest point at icon files that the build holds", () => {
  const html = readFileSync(join(dist, "index.html"), "utf8");
  const manifest = JSON.parse(readFileSync(join(dist, "manifest.webmanifest"), "utf8")) as { icons: { src: string }[] };
  const hrefs = [...html.matchAll(/<link rel="(?:icon|apple-touch-icon)" href="([^"]+)"/g)].map((m) => m[1]);
  expect(hrefs.length).toBe(2);
  for (const src of [...hrefs, ...manifest.icons.map((i) => i.src)]) expect(existsSync(join(dist, src)), src).toBe(true);
});
