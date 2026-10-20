// `npm run data:fixture` writes made-up course text into data-private/. It must never replace a file that is already there
// without --replace, whether data-private/ holds both files or only one. Runs the script in a scratch copy of the repository
// layout, so the real data-private/ is never touched.
import { afterEach, beforeEach, expect, test } from "vitest";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { root } from "../../scripts/lib/course-files.mjs";

let dir = "";
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "riglam-fixture-"));
  cpSync(join(root, "scripts"), join(dir, "scripts"), { recursive: true });
  mkdirSync(join(dir, "src"), { recursive: true });
  cpSync(join(root, "src/data"), join(dir, "src/data"), { recursive: true });
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

const fixture = (...flags: string[]) => spawnSync(process.execPath, [join(dir, "scripts/data.mjs"), "fixture", ...flags], { cwd: dir, encoding: "utf8" });
const priv = (name: string) => join(dir, "data-private", name);
const keep = (name: string) => {
  mkdirSync(join(dir, "data-private"), { recursive: true });
  writeFileSync(priv(name), "REAL");
};

test("writes the course files and the examples into an empty data-private/", () => {
  const run = fixture();
  expect(run.status, run.stderr).toBe(0);
  for (const f of ["definitions.json", "notes.json", "examples.json", "examples-device.json"]) expect(existsSync(priv(f)), f).toBe(true);
});

test.each(["definitions.json", "notes.json", "examples.json"])("refuses when only %s is there, and leaves it alone", (name) => {
  keep(name);
  const run = fixture();
  expect(run.status).not.toBe(0);
  expect(run.stderr).toMatch(/already holds course data/);
  expect(readFileSync(priv(name), "utf8")).toBe("REAL");
});

test("--replace overwrites what is there", () => {
  keep("notes.json");
  expect(fixture("--replace").status).toBe(0);
  expect(readFileSync(priv("notes.json"), "utf8")).not.toBe("REAL");
  expect(existsSync(priv("definitions.json"))).toBe(true);
});

const check = () => spawnSync(process.execPath, [join(dir, "scripts/data.mjs"), "check"], { cwd: dir, encoding: "utf8" });

test("check passes with no data-private/ and with both files, and refuses a data-private/ with only one", () => {
  const none = check();
  expect(none.status, none.stderr).toBe(0);
  expect(fixture().status).toBe(0);
  const both = check();
  expect(both.status, both.stderr).toBe(0);
  rmSync(priv("notes.json"));
  const half = check();
  expect(half.status).not.toBe(0);
  expect(half.stderr).toMatch(/only one of definitions\.json and notes\.json/);
});

test("check and publish refuse data-private/ when a term of the open data has no definition", () => {
  expect(fixture().status).toBe(0);
  const file = priv("definitions.json");
  const definitions = JSON.parse(readFileSync(file, "utf8"));
  const gone = Object.keys(definitions).slice(0, 2);
  for (const k of gone) delete definitions[k];
  writeFileSync(file, JSON.stringify(definitions));
  for (const run of [check(), spawnSync(process.execPath, [join(dir, "scripts/data.mjs"), "publish", "--local"], { cwd: dir, encoding: "utf8" })]) {
    expect(run.status).not.toBe(0);
    expect(run.stderr).toMatch(/2 of \d+ terms of the open data have no definition/);
    expect(run.stderr).toContain(gone[0]);
    expect(run.stderr).not.toMatch(/wrangler/);
  }
});


const data = (...a: string[]) => spawnSync(process.execPath, [join(dir, "scripts/data.mjs"), ...a], { cwd: dir, encoding: "utf8" });

test("import-examples checks the examples against the open data and writes both parts; check refuses a device part not made from them", () => {
  expect(fixture().status).toBe(0);
  const full = JSON.parse(readFileSync(priv("examples.json"), "utf8"));
  const exported = join(dir, "exported.json");
  writeFileSync(exported, JSON.stringify({ ...full, items: full.items.slice(0, 10) }));
  const run = data("import-examples", exported);
  expect(run.status, run.stderr).toBe(0);
  expect(run.stdout).toMatch(/written: data-private\/examples\.json, data-private\/examples-device\.json \(10 examples\)/);
  expect(JSON.parse(readFileSync(priv("examples-device.json"), "utf8")).items).toHaveLength(10);
  expect(data("import-examples", exported).stdout).toMatch(/nothing changed/);
  expect(data("check").stdout).toMatch(/10 examples/);

  writeFileSync(exported, JSON.stringify({ ...full, items: [{ ...full.items[0], cls: ["Not a term here"] }] }));
  const bad = data("import-examples", exported);
  expect(bad.status).not.toBe(0);
  expect(bad.stderr).toMatch(/"Not a term here" in cls, which is not a term of the open data/);
  expect(JSON.parse(readFileSync(priv("examples.json"), "utf8")).items, "a refused import writes nothing").toHaveLength(10);

  const device = JSON.parse(readFileSync(priv("examples-device.json"), "utf8"));
  writeFileSync(priv("examples-device.json"), JSON.stringify({ ...device, items: device.items.slice(1) }));
  const stale = data("check");
  expect(stale.status).not.toBe(0);
  expect(stale.stderr).toMatch(/examples-device\.json was not made from examples\.json/);
  rmSync(priv("examples-device.json"));
  expect(data("check").stderr).toMatch(/only one of examples\.json and examples-device\.json/);
});

test("sql loads the examples rows when data-private/ has them, and only the definitions and notes otherwise", () => {
  expect(fixture().status).toBe(0);
  const kinds = () => [...data("sql").stdout.matchAll(/VALUES \('([a-z_]+)'/g)].map((m) => m[1]);
  expect(kinds()).toEqual(["definitions", "notes", "examples", "examples_device"]);
  rmSync(priv("examples.json"));
  rmSync(priv("examples-device.json"));
  expect(kinds()).toEqual(["definitions", "notes"]);
});
