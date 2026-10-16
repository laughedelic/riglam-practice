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

test("writes both files into an empty data-private/", () => {
  const run = fixture();
  expect(run.status, run.stderr).toBe(0);
  expect(existsSync(priv("definitions.json")) && existsSync(priv("notes.json"))).toBe(true);
});

test.each(["definitions.json", "notes.json"])("refuses when only %s is there, and leaves it alone", (name) => {
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
