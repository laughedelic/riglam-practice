// Runs the browser tests migrated from the practice session (tests/legacy). Each file is a node script that
// drives Chromium through harness.js against the ARTIFACT build (dist/artifact/index.html) with a mocked
// `window.claude`, prints PASS/FAIL lines, and exits non-zero on a crash. This wrapper turns every file into one
// Playwright test, so CI shows them per file and keeps their output as an attachment.
// New tests belong in native Playwright specs next to this file; these stay as the regression net of the page. The layout scans that were
// part of this suite are the layout specs now (tests/e2e/layout).
import { test, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const dir = resolve(here, "../legacy");
const cwd = resolve(dir, "out"); // some tests save screenshots to ./t
mkdirSync(resolve(cwd, "t"), { recursive: true });

// Order as in the practice session's runall.sh, then the Blitz test that was not in that list.
const TESTS = [
  "test40b", "test40f", "test40k", "test40n", "test40q", "test40r", "test40v", "test40w",
  "test45", "test45d", "test46", "test47", "test48", "test49", "test51", "test52", "test53", "test54",
  "test55", "test56", "test58", "test59", "test60", "test61", "test62", "test63", "t55b",
];

function run(file) {
  return new Promise((done) => {
    // Playwright workers set FORCE_COLOR, which makes node colour the numbers it prints; the checks below read plain text.
    const p = spawn(process.execPath, [resolve(dir, `${file}.js`)], { cwd, env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" } });
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.stderr.on("data", (d) => (out += d));
    // eslint-disable-next-line no-control-regex
    p.on("close", (code) => done({ out: out.replace(/\x1b\[[0-9;]*m/g, ""), code }));
  });
}
const FAILS = /^FAIL|THROWN|TimeoutError|^Error|^TypeError|^CRASH/;

test.describe.configure({ mode: "parallel" });
test.setTimeout(300_000);

for (const file of TESTS) {
  // eslint-disable-next-line no-empty-pattern -- Playwright requires the destructured fixtures argument
  test(`${file}`, async ({}, testInfo) => {
    const { out, code } = await run(file);
    await testInfo.attach(`${file}.txt`, { body: out, contentType: "text/plain" });
    const failed = out.split("\n").filter((l) => FAILS.test(l));
    expect(failed, `${failed.length} failing line(s) in ${file}`).toEqual([]);
    expect(out, `${file} printed no PASS line`).toMatch(/^PASS/m);
    expect(code, `exit code of ${file}`).toBe(0);
  });
}
