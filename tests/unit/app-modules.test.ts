// The shape of the page code in src/app: shared state in one object, a leaf `core/`, and no module that the entry cannot reach.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { expect, test } from "vitest";

const root = resolve(__dirname, "../../src/app");

function sources(dir = root): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? sources(join(dir, e.name)) : e.name.endsWith(".js") ? [join(dir, e.name)] : []));
}

const files = sources();
const rel = (f: string) => relative(root, f).split("\\").join("/");

/** The modules a file imports, as paths relative to src/app. */
function importsOf(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const out: string[] = [];
  for (const m of text.matchAll(/^import\s+(?:[^"']*?from\s+)?["']([^"']+)["'];?/gm)) {
    if (m[1].startsWith(".")) out.push(rel(resolve(dirname(file), m[1])));
  }
  return out;
}

test("the page code is split into modules", () => {
  expect(files.length).toBeGreaterThan(10);
  expect(files.map(rel)).toContain("app.js");
  expect(files.map(rel)).toContain("state.js");
});

test("shared state lives in `state`: no module-level let or var outside state.js", () => {
  for (const f of files.filter((f) => rel(f) !== "state.js")) {
    const bad = readFileSync(f, "utf8").split("\n").filter((l) => /^(let|var)\s/.test(l));
    expect(bad, `${rel(f)} declares module-level variables; put them in state.js`).toEqual([]);
  }
});

test("core/ and state.js depend only on each other", () => {
  for (const f of files.filter((f) => rel(f).startsWith("core/") || rel(f) === "state.js")) {
    for (const i of importsOf(f)) expect(i === "state.js" || i.startsWith("core/"), `${rel(f)} imports ${i}`).toBe(true);
  }
});

test("every module is reachable from the entry, so nothing is left out of the build", () => {
  const seen = new Set<string>();
  const visit = (r: string) => {
    if (seen.has(r)) return;
    seen.add(r);
    for (const i of importsOf(join(root, r))) visit(i);
  };
  visit("app.js");
  expect(files.map(rel).filter((r) => !seen.has(r))).toEqual([]);
});

test("the entry still exports startApp", () => {
  expect(readFileSync(join(root, "app.js"), "utf8")).toMatch(/export function startApp\(/);
});
