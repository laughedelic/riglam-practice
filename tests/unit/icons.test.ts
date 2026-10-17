// The app icons (public/icons, made by `npm run icons`): the Main set every build carries and the Preview set that staging and pull request
// builds carry (RIGLAM_ICON_SET=preview, vite.config.js). Both must be the right sizes, keep their art inside the central 80% circle that
// every mask keeps, be told apart by their ground, and carry the generated grain that the SVGs leave out.
import { expect, test } from "vitest";
import sharp from "sharp";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { iconSet } from "../../scripts/lib/icon-set.mjs";
import { fineNoiseTile, stretchedTile, TILE } from "../../scripts/lib/grain.mjs";
import { renderIcon } from "../../scripts/lib/render-icon.mjs";

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
    // The flat SVG shows the geometry without the grain: outside the circle every pixel is the ground.
    const flat = await sharp(readFileSync(join(set.dir, "icon.svg")), { density: 384 }).resize(512, 512).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { data } = flat, size = flat.info.width;
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
    expect(wrong, `${name}: pixels outside the safe zone that are not the ground`).toBe(0);
  });

  test(`the ${name} icons: the PNGs are the SVG with the grain on, and are not out of date`, async () => {
    const svg = readFileSync(join(set.dir, "icon.svg"));
    for (const [file, size] of Object.entries(pngs)) {
      const have = await pixels(join(set.dir, file));
      const want = await sharp(await (await renderIcon(svg, size)).toBuffer()).ensureAlpha().raw().toBuffer();
      let diff = 0;
      for (let i = 0; i < want.length; i++) diff += Math.abs(want[i] - have.data[i]);
      expect(diff / want.length, `${name}/${file} differs from a fresh render: run npm run icons`).toBeLessThan(2);
      // The grain: the ground, one flat color in the SVG, varies from pixel to pixel in the PNG (a corner, outside every mask).
      const deviation = [0, 1, 2].map((k) => {
        const values: number[] = [];
        for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) values.push(have.data[(y * size + x) * 4 + k]);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
      });
      expect(Math.max(...deviation), `${name}/${file}: no grain on the ground`).toBeGreaterThan(5);
    }
  });
}

test("the grain is the same every time, centered on neutral gray, and stretches to the 512 px master", () => {
  const tile = fineNoiseTile();
  expect(tile.length).toBe(TILE * TILE);
  expect([...fineNoiseTile().slice(0, 64)]).toEqual([...tile.slice(0, 64)]);
  const mean = tile.reduce((a, b) => a + b, 0) / tile.length;
  const deviation = Math.sqrt(tile.reduce((a, b) => a + (b - mean) ** 2, 0) / tile.length);
  expect(Math.abs(mean - 128)).toBeLessThan(1.5);
  expect(deviation).toBeGreaterThan(55); // strong fine noise, a little under 1.6 * 42 where the tile is clipped at 0 and 255
  expect(deviation).toBeLessThan(68);
  const master = stretchedTile(tile);
  expect(master.length).toBe(512 * 512);
  expect(Math.abs(master.reduce((a, b) => a + b, 0) / master.length - 128)).toBeLessThan(1.5);
});

test("the Main and Preview icons have different grounds", () => {
  expect(sets.main.ground).not.toEqual(sets.preview.ground);
});

test("a build carries the Preview icons when it is told so, or when Workers Builds builds a branch other than main", () => {
  expect(iconSet({})).toBe("main"); // a local build, GitHub Actions
  expect(iconSet({ WORKERS_CI_BRANCH: "main" })).toBe("main"); // production
  expect(iconSet({ WORKERS_CI_BRANCH: "claude/some-branch" })).toBe("preview"); // a pull request Preview
  expect(iconSet({ WORKERS_CI_BRANCH: "staging" })).toBe("preview");
  expect(iconSet({ RIGLAM_ICON_SET: "preview" })).toBe("preview"); // the staging deploy from a machine
  expect(iconSet({ RIGLAM_ICON_SET: "main", WORKERS_CI_BRANCH: "x" })).toBe("main"); // an explicit choice wins
  expect(iconSet({ RIGLAM_ICON_SET: "bogus" })).toBe("main");
});

const dist = resolve(root, "dist/pwa");
test.skipIf(!existsSync(join(dist, "index.html")))("the built page and manifest point at icon files that the build holds", () => {
  const html = readFileSync(join(dist, "index.html"), "utf8");
  const manifest = JSON.parse(readFileSync(join(dist, "manifest.webmanifest"), "utf8")) as { icons: { src: string }[] };
  const hrefs = [...html.matchAll(/<link rel="(?:icon|apple-touch-icon)" href="([^"]+)"/g)].map((m) => m[1]);
  expect(hrefs.length).toBe(2);
  for (const src of [...hrefs, ...manifest.icons.map((i) => i.src)]) expect(existsSync(join(dist, src)), src).toBe(true);
});
