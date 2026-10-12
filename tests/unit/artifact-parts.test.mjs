import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { splitArtifact, toPublishedScript, extractHook, DEFAULT_HOOK, SplitError } from "../../scripts/lib/artifact-parts.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const legacy = readFileSync(resolve(root, "legacy/relations-drill.v63.html"), "utf8");

test("the legacy page splits into head, css, markup and a module body", () => {
  const p = splitArtifact(legacy);
  assert.deepEqual(Object.keys(p), ["src/artifact/head.html", "src/app/app.css", "src/app/markup.html", "src/app/app.js"]);
  assert.match(p["src/artifact/head.html"], /^<title>Dudra practice<\/title>/);
  assert.match(p["src/app/markup.html"], /id="app"/);
  assert.match(p["src/app/app.css"], /--paper:/);
  const js = p["src/app/app.js"];
  assert.ok(!js.startsWith("(function"), "the IIFE is unwrapped");
  assert.ok(js.includes("window.__riglam.fetchData()"));
  assert.ok(!js.includes('fetch("drill-data.json")'));
  assert.ok(js.trimEnd().endsWith("/* ---------- test hook (end) ---------- */"));
});

test("the seams are reversible: the published script comes back byte for byte", () => {
  const original = legacy.match(/<script>\n([\s\S]*)\n<\/script>/)[1].trim();
  assert.equal(toPublishedScript(splitArtifact(legacy)["src/app/app.js"]), original);
});

test("a kept test hook is carried over, and the default one is complete", () => {
  const custom = DEFAULT_HOOK.replace("decorateAns", "decorateAns,extraExport");
  const js = splitArtifact(legacy, { hook: custom })["src/app/app.js"];
  assert.equal(extractHook(js).hook, custom);
  assert.match(DEFAULT_HOOK, /window\.__riglamTest\(\{/);
});

test("pages that do not have the expected shape are refused with a reason", () => {
  assert.throws(() => splitArtifact("<title>x</title><style>a{}</style><p>hi</p>"), SplitError);
  assert.throws(() => splitArtifact(legacy.replace('fetch("drill-data.json")', "fetch('other.json')")), /drill-data\.json/);
  assert.throws(() => splitArtifact(legacy.replace("(function(){", "(()=>{")), /IIFE|function/);
  assert.throws(() => splitArtifact(legacy + "<p>trailing</p>"), /after the script/);
});
