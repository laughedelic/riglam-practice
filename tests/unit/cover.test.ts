// The cover (src/pwa/cover.html): it draws before any module of the app has loaded, so it carries two small copies of things that live elsewhere. Its grain is the Hero's noise tile
// (scripts/lib/grain.mjs, fineNoiseTile) made by a few lines of inline script, and its name is the roadmap's lockup (src/app/path/brand.tsx) drawn at the same measures, which the
// zoom into the roadmap relies on. These tests keep the copies in step with what they copy.
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { fineNoiseTile } from "../../scripts/lib/grain.mjs";
import { NAME_ASCENT, NAME_DEPTH, NAME_LEAD, NAME_WIDTH } from "../../src/app/path/brand.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const html = readFileSync(resolve(root, "src/pwa/cover.html"), "utf8");
const script = (id: string) => {
  const m = html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`));
  if (!m) throw new Error(`cover.html has no script ${id}`);
  return m[1];
};

test("the cover's inline grain is the Hero's noise tile", () => {
  const scope: { __riglamGrain?: (strength: number) => Uint8ClampedArray } = {};
  new Function("window", script("cover-grain"))(scope);
  for (const strength of [0.55, 1]) {
    const mine = scope.__riglamGrain!(strength), theirs = fineNoiseTile(strength);
    expect(mine.length).toBe(theirs.length);
    let worst = 0;
    for (let i = 0; i < mine.length; i++) worst = Math.max(worst, Math.abs(mine[i] - theirs[i]));
    expect(worst, `strength ${strength}: same bytes`).toBe(0);
  }
});

test("the cover's name has the measures of the roadmap's lockup", () => {
  const draw = script("cover-draw");
  const num = (name: string) => Number(draw.match(new RegExp(`${name}=([0-9.]+)`))?.[1]);
  expect(num("ASC")).toBe(NAME_ASCENT);
  expect(num("DEPTH")).toBe(NAME_DEPTH);
  expect(num("LEAD")).toBe(NAME_LEAD);
  expect(num("NW")).toBe(NAME_WIDTH);
});
