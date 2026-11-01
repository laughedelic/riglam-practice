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

// Safari (WebKit) lays a <tspan> inside a <text> that has `textLength` out wrongly: the spacing is spread over the text before the tspan and the tspan's letters land on top of
// the one before (the last two letters of "RIGLAM" and of "practice" on an iPhone). Chromium does not show it, and the specs run in Chromium, so this keeps the markup out of it.
test("the name's text lines have no tspan, in the cover and in the roadmap's lockup", () => {
  const lockup = readFileSync(resolve(root, "src/app/path/brand.tsx"), "utf8");
  for (const [where, src] of [["cover.html", html], ["brand.tsx", lockup]] as const) {
    const lines = src.match(/<text [^>]*textLength[^>]*>[^\n]*<\/text>/g) ?? [];
    expect(lines.length, `${where} draws two lines of text`).toBe(2);
    for (const line of lines) expect(line, where).not.toContain("<tspan");
  }
});

// The page moves itself from http:// to https:// (index.html, "https-guard"): workers.dev serves a plain http address without a redirect. Development addresses are left alone.
test("the page's https guard moves a public http address to https and leaves local ones", () => {
  const page = readFileSync(resolve(root, "index.html"), "utf8");
  const code = page.match(/<script id="https-guard">([\s\S]*?)<\/script>/)?.[1];
  expect(code, "index.html has the https guard").toBeTruthy();
  const run = (href: string) => {
    const u = new URL(href);
    const moved: string[] = [];
    new Function("location", code!)({ protocol: u.protocol, hostname: u.hostname, href, replace: (to: string) => moved.push(to) });
    return moved;
  };
  expect(run("http://staging-riglam-practice.laughedelic.workers.dev/?a=1#b")).toEqual(["https://staging-riglam-practice.laughedelic.workers.dev/?a=1#b"]);
  expect(run("http://riglam.example.org/x")).toEqual(["https://riglam.example.org/x"]);
  for (const href of ["https://riglam-practice.laughedelic.workers.dev/", "http://localhost:4173/", "http://127.0.0.1:5173/", "http://192.168.1.20:5173/", "http://[::1]:5173/", "http://maos-macbook.local:5173/"]) {
    expect(run(href), href).toEqual([]);
  }
});
