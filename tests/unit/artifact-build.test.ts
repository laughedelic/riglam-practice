// Checks on dist/artifact/index.html (made by `npm run build:artifact`) against the artifact page contract:
// one fragment, a name in the first 8 KB, everything inlined except the Google Fonts the page links.
import { expect, test } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve, dirname } from "node:path";
import { hasCourse, readFull } from "../../scripts/lib/course-files.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const file = resolve(root, "dist/artifact/index.html");
const exists = existsSync(file);
const built = test.skipIf(!exists); // run `npm run build:artifact` first
const builtWithCourse = test.skipIf(!exists || !hasCourse()); // also needs data-private/
const page = exists ? readFileSync(file, "utf8") : "";

built("a fragment with a title in the first 8 KB", () => {
  expect(/<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(page), "the Artifact tool adds the document skeleton").toBe(false);
  const title = page.slice(0, 8192).match(/<title>([^<]+)<\/title>/)?.[1];
  expect(title).toBe("Dudra practice");
  const indexTitle = readFileSync(resolve(root, "index.html"), "utf8").match(/<title>([^<]+)<\/title>/)![1];
  expect(indexTitle, "the PWA and the artifact carry the same name").toBe(title);
});

built("one style, one script, nothing loaded from the network but fonts", () => {
  expect((page.match(/<style>/g) ?? []).length).toBe(1);
  expect((page.match(/<script>/g) ?? []).length).toBe(1);
  expect(/<script[^>]*\ssrc=/i.test(page)).toBe(false);
  expect(page.includes('fetch("drill-data.json")'), "the data is embedded").toBe(false);
  expect(/url\(["']?felt-/.test(page), "the felt tiles are inlined as data URIs").toBe(false);
  const hosts = new Set([...page.matchAll(/(?:href|src)="(https?:\/\/[^/"]+)/g)].map((m) => m[1]));
  expect([...hosts].sort()).toEqual(["https://fonts.googleapis.com", "https://fonts.gstatic.com"]);
});

builtWithCourse("the data is the full data: every definition is in the page (a locked page must never be published)", async () => {
  const full = readFull();
  // the page holds the data as one JavaScript string literal of the JSON text, so a definition appears escaped twice
  const inPage = (text: string) => page.includes(JSON.stringify(JSON.stringify(text).slice(1, -1)).slice(1, -1));
  const missing = Object.values<{ name: string; d: string }>(full.terms).filter((t) => !inPage(t.d));
  expect(missing.map((t) => t.name)).toEqual([]);
  expect(page.includes("Locked: open your study group")).toBe(false);
});

built("within the page size limit, and within our own budget", () => {
  const bytes = Buffer.byteLength(page);
  expect(bytes, `${bytes} bytes`).toBeLessThan(16 * 1024 * 1024);
  expect(bytes, `the page is ${(bytes / 1024).toFixed(0)} KiB; the budget is 1 MiB`).toBeLessThan(1024 * 1024);
});
