// The page's stylesheet is split into files in src/app/styles that app.css imports in order. A file the index forgets
// silently drops its rules from both builds, and the order is part of the style (later files override earlier ones).
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { expect, test } from "vitest";

const app = resolve(__dirname, "../../src/app");
const index = readFileSync(resolve(app, "app.css"), "utf8");
const dir = resolve(app, "styles");
// readdirSync does not promise an order, so sort once: the numbering and the import order are checked against this list
const files = readdirSync(dir).filter((f) => f.endsWith(".css")).sort();
const imports = [...index.matchAll(/^@import\s+"\.\/styles\/([^"]+)";/gm)].map((m) => m[1]);

test("app.css imports every file of styles/ once, in the order of their numbers", () => {
  expect(files.length).toBeGreaterThan(5);
  expect(imports).toEqual(files);
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

// The Path (src/app/path) draws into #path with its own rules, 33-path-base.css to 38-path-exercises.css (39 styles the classic parts it hosts).
// A class name it shares with a classic rule that stands alone (`.status{...}`, not `.sum .status`) would bring that rule onto the Path too.
const path = (f: string) => { const n = Number(f.slice(0, 2)); return n >= 33 && n <= 38; };
const classic = (f: string) => Number(f.slice(0, 2)) < 33;
const rules = (f: string) => [...readFileSync(resolve(dir, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{/g)].map((m) => m[1].trim()).filter((s) => !s.startsWith("@"));
const classesIn = (sel: string) => [...sel.matchAll(/\.([a-zA-Z][\w-]*)/g)].map((m) => m[1]);
// shared on purpose: the dotted underline of a term with a definition looks the same on both pages
const SHARED_ON_PURPOSE = new Set(["dterm"]);

test("the Path's class names do not pick up a classic rule that stands alone", () => {
  const ours = new Set(files.filter(path).flatMap(rules).flatMap((r) => r.split(",")).filter((s) => /\.pa\b/.test(s)).flatMap(classesIn));
  expect(ours.size).toBeGreaterThan(50);
  const clashes = files.filter(classic).flatMap((f) => rules(f).flatMap((r) => r.split(",").map((s) => s.trim())).filter((s) => !/[\s>+~]/.test(s.replace(/\([^)]*\)/g, "")))
    .filter((s) => { const cs = classesIn(s); return cs.length > 0 && cs.every((c) => ours.has(c) && !SHARED_ON_PURPOSE.has(c)); }).map((s) => f + ": " + s));
  expect(clashes).toEqual([]);
});

// The same for the class names the Path writes in its markup (src/app/path), whether or not a rule of its own names them: a classic rule that
// stands alone on one of them (`.pick{...}`) would draw over the Path's look. The names are the literal ones in `class` and `cls` attributes,
// except a Bridge's: the host of a classic part takes the classic container's class (card, opts) on purpose.
test("the class names in the Path's markup do not pick up a classic rule that stands alone", () => {
  const src = resolve(app, "path"), tsx = readdirSync(src).filter((f) => f.endsWith(".tsx")).map((f) => readFileSync(resolve(src, f), "utf8")).join("\n");
  const used = new Set([...tsx.matchAll(/(?<!<Bridge )\b(?:class|cls)=\{?"([^"]*)"/g), ...tsx.matchAll(/(?<!<Bridge )\b(?:class|cls)=\{"[^"]*" \+ \([^)]*\? "([^"]*)" : "([^"]*)"\)/g)]
    .flatMap((m) => m.slice(1).join(" ").split(/\s+/)).filter(Boolean));
  expect(used.size).toBeGreaterThan(50);
  const clashes = files.filter(classic).flatMap((f) => rules(f).flatMap((r) => r.split(",").map((s) => s.trim())).filter((s) => !/[\s>+~]/.test(s.replace(/\([^)]*\)/g, "")))
    .filter((s) => { const cs = classesIn(s); return cs.length > 0 && cs.every((c) => used.has(c) && !SHARED_ON_PURPOSE.has(c)); }).map((s) => f + ": " + s));
  expect(clashes).toEqual([]);
});
