#!/usr/bin/env node
// Draws the README hero (a light and a dark picture, docs/images/hero-*.png) and the 2:1 picture for GitHub's social preview
// (docs/images/social-preview.png) from scripts/social/settings.json, and from that same drawing the picture the app's page offers to chats and forums for a link
// (`linkPreview` there: public/link-preview.jpg, 1200 x 600, a JPEG so that the grain stays under the 300 KB some chat apps allow and the service worker, which keeps
// every PNG, does not keep it). The drawing is scripts/social/draw.js on a canvas, run in the Chromium
// that Playwright already uses for the browser tests, with the two fonts in scripts/social/fonts and the generated grain of scripts/lib/grain.mjs;
// sharp stores the result as a palette PNG, because noise does not compress.
// Run `npm run social` after changing the settings; the PNGs are committed. `npm run social -- --check` redraws without writing and fails if a
// committed PNG would look different.
// GitHub shows the social preview only when the repository's owner uploads it (Settings, Social preview): upload docs/images/social-preview.png.
import { readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import sharp from "sharp";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const scripts = resolve(root, "scripts");
const settings = JSON.parse(readFileSync(resolve(scripts, "social/settings.json"), "utf8"));
const check = process.argv.includes("--check");
const ORIGIN = "http://riglam-social.test";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".woff2": "font/woff2" };

// The page and what it imports are served from the repository under a made-up address, so that its modules load and nothing else is read.
function serve(route) {
  const file = resolve(scripts, "." + new URL(route.request().url()).pathname);
  const allowed = file.startsWith(resolve(scripts, "social") + sep) || file === resolve(scripts, "lib/grain.mjs");
  if (!allowed || !existsSync(file)) return route.fulfill({ status: 404, body: "not found" });
  return route.fulfill({ path: file, contentType: TYPES[extname(file)] ?? "application/octet-stream" });
}

// 256 colors with dithering: the grain survives (the mean change is a few gray levels), and a picture stays a few hundred KB.
const store = (png) => sharp(png).png({ palette: true, quality: 80, effort: 10, dither: 1 }).toBuffer();

const browser = await chromium.launch();
let failed = false;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  page.on("pageerror", (e) => {
    throw e;
  });
  await page.route(`${ORIGIN}/**`, serve);
  await page.goto(`${ORIGIN}/social/page.html`);
  await page.waitForFunction(() => globalThis.ready === true);
  // what is stored at `file`: the same picture as `buf`, or the file is missing or different (`check`)
  const put = async (file, buf) => {
    const path = resolve(root, file);
    if (check) {
      const same = existsSync(path) && (await sharp(path).raw().toBuffer()).equals(await sharp(buf).raw().toBuffer());
      console.log(same ? "same" : "DIFFERENT", file);
      failed ||= !same;
    } else {
      writeFileSync(path, buf);
      console.log("wrote", file, `${Math.round(statSync(path).size / 1024)} KB`);
    }
  };
  const drawn = {};
  for (const [name, image] of Object.entries(settings.images)) {
    const { png } = await page.evaluate(([text, img]) => globalThis.render(text, img), [settings.text, image]);
    drawn[name] = Buffer.from(png.split(",")[1], "base64");
    await put(image.file, await store(drawn[name]));
  }
  const link = settings.linkPreview;
  if (link) await put(link.file, await sharp(drawn[link.from]).resize(link.width, link.height).jpeg({ quality: link.quality, mozjpeg: true }).toBuffer());
} finally {
  await browser.close();
}
if (failed) process.exit(1);
