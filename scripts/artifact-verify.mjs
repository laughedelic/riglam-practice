#!/usr/bin/env node
// npm run artifact:verify -- <page.html>
// Compares a published artifact page with dist/artifact/index.html (npm run build:artifact) and says which part differs:
// the head, the style, the markup, the script or the wrapper. Exit 0 when they are the same, 1 when they differ, 2 on a usage problem.
// The build comment (it names the commit) and the document skeleton the Artifact tool puts around a page are ignored; anything else
// outside the page is reported as a difference in the part "wrapper".
// See docs/ARTIFACT-LOOP.md.
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { comparePages } from "./lib/artifact-page.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [file] = process.argv.slice(2);
const built = resolve(root, "dist/artifact/index.html");

if (!file) {
  console.error("usage: artifact-verify.mjs <published-page.html>");
  process.exit(2);
}
if (!existsSync(built)) {
  console.error("dist/artifact/index.html does not exist: run `npm run build:artifact` first");
  process.exit(2);
}

let result;
try {
  result = comparePages(readFileSync(resolve(file), "utf8"), readFileSync(built, "utf8"));
} catch (e) {
  console.error(`cannot compare: ${e.message}`);
  process.exit(2);
}

for (const p of result.parts) {
  console.log(`${p.same ? "same     " : "DIFFERS  "} ${p.name} (${p.publishedChars} chars published, ${p.buildChars} in the build)`);
  if (p.difference) {
    console.log(`           first difference at ${p.difference.at}:\n           published: ${p.difference.published}\n           build:     ${p.difference.build}`);
  }
}
console.log(result.same ? "\nThe published page is the build." : "\nThe published page is not this build. If it was changed outside the repo, bring that change into src/ by hand (docs/ARTIFACT-LOOP.md).");
process.exit(result.same ? 0 : 1);
