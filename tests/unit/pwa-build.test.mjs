// Checks on dist/pwa (made by `npm run build:pwa`): the build carries the open data and the encrypted definitions,
// and nothing readable from the course tier; the site asks search engines to stay away.
// This is protection against accidental exposure, not access control (docs/DATA.md, docs/DEPLOY.md).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, join } from "node:path";
import { readKey, readFull } from "../../scripts/lib/course-files.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dist = resolve(root, "dist/pwa");
const skip = existsSync(join(dist, "index.html")) ? false : "run `npm run build:pwa` first";

const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));

test("the build holds the open data and the encrypted definitions, and not the notes", { skip }, () => {
  const names = files(dist).map((f) => f.slice(dist.length + 1));
  assert.equal(names.filter((n) => /^assets\/drill-data-.*\.json$/.test(n)).length, 1, "the open data");
  assert.equal(names.filter((n) => /^assets\/course-definitions-.*\.enc$/.test(n)).length, 1, "the encrypted definitions");
  assert.ok(!names.some((n) => /course-notes/.test(n)), "the notes stay out of the PWA");
  const sw = readFileSync(join(dist, "sw.js"), "utf8");
  assert.match(sw, /course-definitions-[\w-]+\.enc/, "the encrypted definitions are precached, so they work offline");
});

test("the open data in the build has no definitions or notes", { skip }, () => {
  const name = files(dist).find((f) => /assets\/drill-data-.*\.json$/.test(f));
  const open = JSON.parse(readFileSync(name, "utf8"));
  for (const [term, t] of Object.entries(open.terms)) for (const f of ["d", "d_ru", "note"]) assert.ok(!(f in t), `${term}.${f}`);
  assert.ok(!("notes" in open));
});

test("no text file of the build holds a definition or a note in the clear", { skip: skip || (readKey() ? false : "no data key") }, async () => {
  const full = await readFull(readKey());
  const secrets = Object.values(full.terms).flatMap((t) => [t.d, t.d_ru, t.note]).filter((s) => typeof s === "string" && s.length > 30 && !s.startsWith("(no "));
  assert.ok(secrets.length > 150, `${secrets.length} texts to look for`);
  for (const f of files(dist).filter((f) => /\.(js|css|html|json|map|webmanifest|txt)$/.test(f))) {
    const content = readFileSync(f, "utf8");
    for (const s of secrets) assert.ok(!content.includes(s), `${f} holds: ${s.slice(0, 40)}`);
  }
});

test("search engines are asked to stay away: header, robots.txt and a meta tag", { skip }, () => {
  assert.match(readFileSync(join(dist, "_headers"), "utf8"), /^\/\*\n {2}X-Robots-Tag: noindex/m);
  assert.match(readFileSync(join(dist, "robots.txt"), "utf8"), /^Disallow: \/$/m);
  assert.match(readFileSync(join(dist, "index.html"), "utf8"), /<meta name="robots" content="noindex/);
});
