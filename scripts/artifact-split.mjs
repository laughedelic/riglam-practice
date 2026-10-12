#!/usr/bin/env node
// npm run artifact:import -- <page.html>   write the page's parts into src/ (see docs/ARTIFACT-LOOP.md)
// npm run artifact:drift  -- <page.html>   compare the page with src/; exit 1 when they differ
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { splitArtifact, extractHook, SplitError } from "./lib/artifact-parts.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [cmd, file] = process.argv.slice(2);
if (!["import", "drift"].includes(cmd) || !file) {
  console.error("usage: artifact-split.mjs import|drift <published-page.html>");
  process.exit(2);
}

const readOrNull = (p) => { try { return readFileSync(p, "utf8"); } catch { return null; } };
const appPath = resolve(root, "src/app/app.js");
const currentApp = readOrNull(appPath);
const keptHook = currentApp ? extractHook(currentApp).hook : null; // the test hook belongs to the repo's app.js

let parts;
try {
  parts = splitArtifact(readFileSync(resolve(file), "utf8"), { hook: keptHook });
} catch (e) {
  if (e instanceof SplitError) {
    console.error(`cannot split ${file}: ${e.message}`);
    process.exit(2);
  }
  throw e;
}

let differ = 0;
for (const [rel, text] of Object.entries(parts)) {
  const path = resolve(root, rel);
  const current = readOrNull(path);
  const same = current === text;
  if (cmd === "import") {
    mkdirSync(dirname(path), { recursive: true });
    if (!same) writeFileSync(path, text);
    console.log(`${same ? "unchanged" : "written  "} ${rel} (${text.length} chars)`);
  } else {
    if (!same) differ++;
    console.log(`${same ? "same     " : "DIFFERS  "} ${rel}`);
  }
}
if (cmd === "drift") {
  console.log(differ ? `\n${differ} part(s) differ. To see how: npm run artifact:import -- ${file} && git diff` : "\nNo drift.");
  process.exit(differ ? 1 : 0);
}
