// The page's stylesheet is split into files in src/app/styles that app.css imports in order. A file the index forgets
// silently drops its rules from both builds, and the order is part of the style (later files override earlier ones).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "vitest";

const app = resolve(__dirname, "../../src/app");
const index = readFileSync(resolve(app, "app.css"), "utf8");
const dir = resolve(app, "styles");
const files = readdirSync(dir).filter((f) => f.endsWith(".css"));
const imports = [...index.matchAll(/^@import\s+"\.\/styles\/([^"]+)";/gm)].map((m) => m[1]);

test("app.css imports every file of styles/ once, in the order of their numbers", () => {
  expect(files.length).toBeGreaterThan(5);
  expect(imports).toEqual([...files].sort());
});

test("the files are numbered NN-name.css without gaps or repeats", () => {
  const nums = files.map((f) => /^(\d\d)-[a-z0-9-]+\.css$/.exec(f)?.[1]);
  expect(nums.every((n) => n !== undefined)).toBe(true);
  expect(nums.map(Number)).toEqual(files.map((_, i) => i));
});

test("app.css holds the imports and comments only, and every file has rules", () => {
  const rest = index.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^@import\s+"[^"]+";/gm, "");
  expect(rest.trim()).toBe("");
  for (const f of files) expect(readFileSync(resolve(dir, f), "utf8").trim().length, f).toBeGreaterThan(20);
});

test("braces balance in each file, so no rule is cut at a file boundary", () => {
  for (const f of files) {
    const css = readFileSync(resolve(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/"[^"]*"/g, '""');
    let depth = 0;
    for (const c of css) {
      if (c === "{") depth++;
      if (c === "}") depth--;
      expect(depth, f).toBeGreaterThanOrEqual(0);
    }
    expect(depth, f).toBe(0);
  }
});

test("every relative url() in the styles names an existing file", () => {
  for (const f of files) {
    const css = readFileSync(resolve(dir, f), "utf8");
    for (const m of css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) {
      if (/^(data:|https?:|#)/.test(m[1])) continue;
      expect(existsSync(resolve(dirname(resolve(dir, f)), m[1])), `${f}: ${m[1]}`).toBe(true);
    }
  }
});
