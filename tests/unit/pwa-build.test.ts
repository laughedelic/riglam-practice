// Checks on dist/pwa (made by `npm run build:pwa`): the build carries the open data and the encrypted definitions,
// and nothing readable from the course tier; the site asks search engines to stay away.
// This is protection against accidental exposure, not access control (docs/DATA.md, docs/DEPLOY.md).
import { expect, test } from "vitest";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname, join } from "node:path";
import { readKey, readFull } from "../../scripts/lib/course-files.mjs";
import { DEV_MARK } from "../../src/pwa/dev-sample";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const dist = resolve(root, "dist/pwa");
const built = test.skipIf(!existsSync(join(dist, "index.html"))); // run `npm run build:pwa` first
const builtWithKey = test.skipIf(!existsSync(join(dist, "index.html")) || !readKey()); // also needs the data key

const files = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)]));

built("the build holds the open data and the encrypted definitions, and not the notes", () => {
  const names = files(dist).map((f) => f.slice(dist.length + 1));
  expect(names.filter((n) => /^assets\/drill-data-.*\.json$/.test(n)).length, "the open data").toBe(1);
  expect(names.filter((n) => /^assets\/course-definitions-.*\.enc$/.test(n)).length, "the encrypted definitions").toBe(1);
  expect(names.some((n) => /course-notes/.test(n)), "the notes stay out of the PWA").toBe(false);
  const sw = readFileSync(join(dist, "sw.js"), "utf8");
  expect(sw, "the encrypted definitions are precached, so they work offline").toMatch(/course-definitions-[\w-]+\.enc/);
});

built("the open data in the build has no definitions or notes", () => {
  const name = files(dist).find((f) => /assets\/drill-data-.*\.json$/.test(f))!;
  const open = JSON.parse(readFileSync(name, "utf8"));
  for (const [term, t] of Object.entries<object>(open.terms)) for (const f of ["d", "d_ru", "note"]) expect(f in t, `${term}.${f}`).toBe(false);
  expect("notes" in open).toBe(false);
});

builtWithKey("no text file of the build holds a definition or a note in the clear", async () => {
  const full = await readFull(readKey());
  const secrets: string[] = Object.values<{ d?: string; d_ru?: string; note?: string }>(full.terms)
    .flatMap((t) => [t.d, t.d_ru, t.note])
    .filter((s): s is string => typeof s === "string" && s.length > 30 && !s.startsWith("(no "));
  expect(secrets.length, `${secrets.length} texts to look for`).toBeGreaterThan(150);
  for (const f of files(dist).filter((f) => /\.(js|css|html|json|map|webmanifest|txt)$/.test(f))) {
    const content = readFileSync(f, "utf8");
    for (const s of secrets) expect(content.includes(s), `${f} holds: ${s.slice(0, 40)}`).toBe(false);
  }
});

built("search engines are asked to stay away: header, robots.txt and a meta tag", () => {
  expect(readFileSync(join(dist, "_headers"), "utf8")).toMatch(/^\/\*\n {2}X-Robots-Tag: noindex/m);
  expect(readFileSync(join(dist, "robots.txt"), "utf8")).toMatch(/^Disallow: \/$/m);
  expect(readFileSync(join(dist, "index.html"), "utf8")).toMatch(/<meta name="robots" content="noindex/);
});

built("the development stand-in for the model is not in the build", () => {
  for (const f of files(dist).filter((f) => /\.(js|map)$/.test(f))) expect(readFileSync(f, "utf8").includes(DEV_MARK), f).toBe(false);
});
