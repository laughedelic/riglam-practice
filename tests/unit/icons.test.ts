// The app icons (public/icons, made by `npm run icons` from scripts/lib/icon-art.mjs): the Main set every build carries (the booklet page
// between vermilion bands) and the Preview set that staging and pull request builds carry (the divider page between crimson bands,
// RIGLAM_ICON_SET=preview, vite.config.js). Both must be the right sizes, keep the figure inside the central 80% circle that every mask
// keeps, be told apart by their page, and carry the generated grain that the SVGs leave out, mild on the page and strong elsewhere.
import { expect, test } from "vitest";
import sharp from "sharp";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { iconSet } from "../../scripts/lib/icon-set.mjs";
import { fineNoiseTile, stretchedTile, zonedGrain, MID, STRONG, TILE } from "../../scripts/lib/grain.mjs";
import { BAND, FIGURE, A_OF_B, SAFE_RADIUS, SETS, figure, grainMaskSvg, iconSvg } from "../../scripts/lib/icon-art.mjs";
import { renderIcon } from "../../scripts/lib/render-icon.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dirs = { main: resolve(root, "public/icons"), preview: resolve(root, "public/icons/preview") } as const;
const pngs = { "icon-192.png": 192, "icon-512.png": 512, "icon-maskable-512.png": 512, "apple-touch-icon.png": 180 };
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

async function pixels(file: string) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, size: info.width };
}

for (const name of ["main", "preview"] as const) {
  const dir = dirs[name], set = SETS[name];

  test(`the ${name} icons: an SVG and PNGs of the sizes the manifest and iOS ask for`, async () => {
    expect(readFileSync(join(dir, "icon.svg"), "utf8")).toMatch(/viewBox="0 0 512 512"/);
    for (const [file, size] of Object.entries(pngs)) {
      const meta = await sharp(join(dir, file)).metadata();
      expect([meta.width, meta.height], `${name}/${file}`).toEqual([size, size]);
    }
  });

  test(`the ${name} icons: the SVG is what scripts/lib/icon-art.mjs draws`, () => {
    expect(readFileSync(join(dir, "icon.svg"), "utf8"), `${name}/icon.svg is out of date: run npm run icons`).toBe(iconSvg(name));
  });

  test(`the ${name} icons: outside the central 80% circle there is only the page and the bands, and both reach it`, async () => {
    // The flat SVG shows the geometry without the grain: the figure is inside the circle every mask keeps, the bands run to the edge.
    const flat = await sharp(readFileSync(join(dir, "icon.svg")), { density: 384 }).resize(512, 512).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const { data } = flat, size = flat.info.width;
    const c = size / 2, safe = SAFE_RADIUS + 1.5; // a pixel of slack for the edge of a rhombus
    const [page, bands] = [rgb(set.page), rgb(set.bands)];
    const near = (i: number, want: number[]) => want.every((v, k) => Math.abs(v - data[i + k]) <= 2);
    let outside = 0, wrong = 0, onPage = 0, onBands = 0;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (Math.hypot(x + 0.5 - c, y + 0.5 - c) <= safe) continue;
        if (Math.abs(x + 0.5 - BAND * size) < 1.5 || Math.abs(x + 0.5 - (1 - BAND) * size) < 1.5) continue; // the antialiased edge of a band
        const i = (y * size + x) * 4;
        outside++;
        if (data[i + 3] !== 255) wrong++;
        else if (near(i, page)) onPage++;
        else if (near(i, bands)) onBands++;
        else wrong++;
      }
    }
    expect(outside).toBeGreaterThan(size * size * 0.2);
    expect(wrong, `${name}: pixels outside the safe zone that are neither page nor bands`).toBe(0);
    expect(onPage, `${name}: the page reaches the corners of the safe zone's square`).toBeGreaterThan(0);
    expect(onBands / (size * size), `${name}: the bands are about ${BAND * 2 * 100}% of the icon`).toBeGreaterThan(BAND * 2 * 0.95);
  });

  test(`the ${name} icons: the PNGs are the SVG with the grain on, and are not out of date`, async () => {
    for (const [file, size] of Object.entries(pngs)) {
      const have = await pixels(join(dir, file));
      const want = await sharp(await (await renderIcon(name, size)).toBuffer()).ensureAlpha().raw().toBuffer();
      let diff = 0;
      for (let i = 0; i < want.length; i++) diff += Math.abs(want[i] - have.data[i]);
      expect(diff / want.length, `${name}/${file} differs from a fresh render: run npm run icons`).toBeLessThan(2);
      // The grain: a band, one flat color in the SVG, varies from pixel to pixel in the PNG (the left edge, outside every mask's circle).
      const deviation = [0, 1, 2].map((k) => {
        const values: number[] = [];
        for (let y = 0; y < 24; y++) for (let x = 0; x < 24; x++) values.push(have.data[((Math.round(size * 0.4) + y) * size + x) * 4 + k]);
        const mean = values.reduce((a, b) => a + b, 0) / values.length;
        return Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length);
      });
      expect(Math.max(...deviation), `${name}/${file}: no grain on the bands`).toBeGreaterThan(5);
    }
  });
}

test("the figure: two rhombi, the upper one 80% of the lower, inside the central 80% circle, overlapping where the green is", () => {
  const { a, b, overlap } = figure() as { a: number[][]; b: number[][]; overlap: number[][] };
  const width = (p: number[][]) => Math.max(...p.map((q) => q[0])) - Math.min(...p.map((q) => q[0]));
  expect(width(a) / width(b)).toBeCloseTo(A_OF_B, 2);
  for (const q of [...a, ...b]) expect(Math.hypot(q[0] - 256, q[1] - 256)).toBeLessThanOrEqual(FIGURE * SAFE_RADIUS + 0.01);
  expect(Math.max(...[...a, ...b].map((q) => Math.hypot(q[0] - 256, q[1] - 256)))).toBeCloseTo(FIGURE * SAFE_RADIUS, 1); // the reach is the size asked for
  expect(Math.max(...a.map((q) => q[1]))).toBeLessThan(Math.max(...b.map((q) => q[1]))); // the smaller rhombus is the upper one
  expect(overlap.length).toBeGreaterThanOrEqual(3);
  const inside = (p: number[], poly: number[][]) => poly.every((q, i) => {
    const r = poly[(i + 1) % poly.length];
    const side = (r[0] - q[0]) * (p[1] - q[1]) - (r[1] - q[1]) * (p[0] - q[0]);
    return Math.sign(side) === Math.sign((poly[1][0] - poly[0][0]) * (poly[2][1] - poly[0][1]) - (poly[1][1] - poly[0][1]) * (poly[2][0] - poly[0][0])) || Math.abs(side) < 1e-6;
  });
  for (const q of overlap) {
    expect(inside(q, a), "the overlap lies inside the upper rhombus").toBe(true);
    expect(inside(q, b), "the overlap lies inside the lower rhombus").toBe(true);
  }
});

test("the grain is the same every time, centered on neutral gray, stronger at the strong level, and stretches to the 512 px master", () => {
  const strong = fineNoiseTile(STRONG), mild = fineNoiseTile(MID);
  expect(strong.length).toBe(TILE * TILE);
  expect([...fineNoiseTile(STRONG).slice(0, 64)]).toEqual([...strong.slice(0, 64)]);
  const stats = (tile: Uint8ClampedArray) => {
    const mean = tile.reduce((a, b) => a + b, 0) / tile.length;
    return { mean, deviation: Math.sqrt(tile.reduce((a, b) => a + (b - mean) ** 2, 0) / tile.length) };
  };
  expect(Math.abs(stats(strong).mean - 128)).toBeLessThan(1.5);
  expect(Math.abs(stats(mild).mean - 128)).toBeLessThan(1.5);
  expect(stats(strong).deviation).toBeGreaterThan(55); // a little under 1.6 * 42 where the tile is clipped at 0 and 255
  expect(stats(strong).deviation).toBeLessThan(68);
  expect(stats(mild).deviation).toBeGreaterThan(38); // about 42
  expect(stats(mild).deviation).toBeLessThan(44);
  const master = stretchedTile(strong);
  expect(master.length).toBe(512 * 512);
  expect(Math.abs(master.reduce((a, b) => a + b, 0) / master.length - 128)).toBeLessThan(1.5);
});

test("the grain map joins the mild and the strong grain by the mask, with the page mild and the bands and the figure strong", async () => {
  expect([...zonedGrain(Uint8ClampedArray.of(100, 100, 100), Uint8ClampedArray.of(200, 200, 200), Uint8ClampedArray.of(255, 0, 128))]).toEqual([100, 200, 150]);
  const mask = await sharp(Buffer.from(grainMaskSvg()), { density: 384 }).resize(512, 512).extractChannel(0).raw().toBuffer();
  const at = (x: number, y: number) => mask[y * 512 + x];
  expect(at(256, 20)).toBe(255); // the page above the figure
  expect(at(100, 480)).toBe(255); // the page below it
  expect(at(10, 256)).toBe(0); // a band
  expect(at(502, 256)).toBe(0);
  expect(at(256, 120)).toBe(0); // the upper rhombus
  expect(at(256, 380)).toBe(0); // the lower rhombus
});

test("the Main and Preview icons have different pages and different bands", () => {
  expect(SETS.main.page).not.toBe(SETS.preview.page);
  expect(SETS.main.bands).not.toBe(SETS.preview.bands);
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

test.skipIf(!existsSync(join(dist, "index.html")))("the manifest's colors are one dark ground: Chrome on Android paints an installed app's bottom strip from them, and they cannot follow the page", () => {
  const manifest = JSON.parse(readFileSync(join(dist, "manifest.webmanifest"), "utf8")) as { theme_color: string; background_color: string };
  expect(manifest.theme_color).toBe(manifest.background_color);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(manifest.theme_color.slice(i, i + 2), 16));
  expect(0.2126 * r + 0.7152 * g + 0.0722 * b).toBeLessThan(60);
});
