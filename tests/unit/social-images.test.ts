// The README hero and the link preview picture (docs/images, made by `npm run social` from scripts/social/settings.json): the pictures that
// the README and GitHub's social preview show must exist at their sizes, the README must point at them, and the script's fonts must carry
// their licence. Redrawing needs Chromium, so `npm run social -- --check` does that, not this test.
import { expect, test } from "vitest";
import sharp from "sharp";
import { existsSync, readFileSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const settings = JSON.parse(readFileSync(resolve(root, "scripts/social/settings.json"), "utf8"));
const images = Object.entries(settings.images) as [string, { file: string; height: number }][];

test("the settings name the three pictures: a light and a dark hero for the README and the 2:1 link preview", () => {
  expect(images.map(([name]) => name)).toEqual(["hero-light", "hero-dark", "social-preview"]);
  const preview = settings.images["social-preview"];
  expect(preview.height * 2).toBe(1280); // GitHub recommends 2:1, 1280 x 640
});

for (const [name, image] of images) {
  test(`${name}: the committed PNG is 1280 wide, ${image.height} tall and small enough for GitHub (under 1 MB)`, async () => {
    const file = resolve(root, image.file);
    expect(existsSync(file), image.file).toBe(true);
    const meta = await sharp(file).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(["png", 1280, image.height]);
    expect(statSync(file).size).toBeLessThan(1024 * 1024);
  });
}

test("the README opens with the hero as a picture that follows the reader's theme", () => {
  const readme = readFileSync(resolve(root, "README.md"), "utf8");
  expect(readme.startsWith("<picture>")).toBe(true);
  expect(readme).toMatch(/<source media="\(prefers-color-scheme: dark\)" srcset="docs\/images\/hero-dark\.png">/);
  expect(readme).toMatch(/<img alt="[^"]+" src="docs\/images\/hero-light\.png">/);
});

test("the two fonts of the script are there, each with its copyright notice and the licence text", () => {
  for (const file of ["sorts-mill-goudy-latin.woff2", "noto-serif-tibetan-600-riglam.woff2"]) {
    expect(existsSync(resolve(root, "scripts/social/fonts", file)), file).toBe(true);
  }
  const licence = readFileSync(resolve(root, "scripts/social/fonts/LICENSE.txt"), "utf8");
  expect(licence).toContain("Barry Schwartz");
  expect(licence).toContain("The Noto Project Authors");
  expect(licence).toContain("SIL OPEN FONT LICENSE Version 1.1");
});
