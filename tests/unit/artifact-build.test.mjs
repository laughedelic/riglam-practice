// Checks on dist/artifact/index.html (made by `npm run build:artifact`) against the artifact page contract:
// one fragment, a name in the first 8 KB, everything inlined except the Google Fonts the page links.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { readKey, readFull } from "../../scripts/lib/course-files.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const file = resolve(root, "dist/artifact/index.html");
const skip = existsSync(file) ? false : "run `npm run build:artifact` first";
const page = skip ? "" : readFileSync(file, "utf8");

test("a fragment with a title in the first 8 KB", { skip }, () => {
  assert.ok(!/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(page), "the Artifact tool adds the document skeleton");
  const title = page.slice(0, 8192).match(/<title>([^<]+)<\/title>/)?.[1];
  assert.equal(title, "Dudra practice");
  const indexTitle = readFileSync(resolve(root, "index.html"), "utf8").match(/<title>([^<]+)<\/title>/)[1];
  assert.equal(indexTitle, title, "the PWA and the artifact carry the same name");
});

test("one style, one script, nothing loaded from the network but fonts", { skip }, () => {
  assert.equal((page.match(/<style>/g) ?? []).length, 1);
  assert.equal((page.match(/<script>/g) ?? []).length, 1);
  assert.ok(!/<script[^>]*\ssrc=/i.test(page));
  assert.ok(!page.includes('fetch("drill-data.json")'), "the data is embedded");
  assert.ok(!/url\(["']?felt-/.test(page), "the felt tiles are inlined as data URIs");
  const hosts = new Set([...page.matchAll(/(?:href|src)="(https?:\/\/[^/"]+)/g)].map((m) => m[1]));
  assert.deepEqual([...hosts].sort(), ["https://fonts.googleapis.com", "https://fonts.gstatic.com"]);
});

test("the data is the full data: every definition is in the page (a locked page must never be published)", { skip: skip || (readKey() ? false : "no data key") }, async () => {
  const full = await readFull(readKey());
  // the page holds the data as one JavaScript string literal of the JSON text, so a definition appears escaped twice
  const inPage = (text) => page.includes(JSON.stringify(JSON.stringify(text).slice(1, -1)).slice(1, -1));
  const missing = Object.values(full.terms).filter((t) => !inPage(t.d));
  assert.deepEqual(missing.map((t) => t.name), []);
  assert.ok(!page.includes("Locked: open your study group"));
});

test("within the page size limit, and within our own budget", { skip }, () => {
  const bytes = Buffer.byteLength(page);
  assert.ok(bytes < 16 * 1024 * 1024, `${bytes} bytes`);
  assert.ok(bytes < 1024 * 1024, `the page is ${(bytes / 1024).toFixed(0)} KiB; the budget is 1 MiB`);
});
