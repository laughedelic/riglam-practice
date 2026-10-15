// A newer version of the installed app: found while the app is open, offered, and started without closing the app; one that takes over as
// the app opens starts by itself. The server is a small static server over dist/pwa whose service worker script can be made different
// (the browser then installs it as a new version, which takes over at once); the new worker answers /__which with "v2". A page marks
// itself with window.__old, so that a reload shows.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { test, expect } from "../../support/test.js";
import { ready } from "../../support/page.js";

const DIST = join(process.cwd(), "dist/pwa");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
const V2 = "\nself.addEventListener('fetch',(e)=>{ if(new URL(e.request.url).pathname.endsWith('/__which')) e.respondWith(new Response('v2')); });\n";

let server, origin, newVersion, down;
test.beforeAll(async () => {
  server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = join(DIST, normalize(path));
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, "index.html");
    if (down && path === "/sw.js") { res.writeHead(503); return res.end(); }
    let body = readFileSync(file);
    if (path === "/sw.js" && newVersion) body = Buffer.concat([body, Buffer.from(V2)]);
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://localhost:${server.address().port}`;
});
test.afterAll(() => server.close());
test.beforeEach(() => { newVersion = false; down = false; });

const markOld = (page) => page.evaluate(() => { window.__old = true; });
const isOld = (page) => page.evaluate(() => window.__old === true);
const controlled = (page) => page.evaluate(() => !!navigator.serviceWorker.controller);
const which = (page) => page.evaluate(async () => (await fetch("__which")).text().catch(() => ""));
// `later`: the page counts as in use from the start, so a version that takes over is offered, not started
async function installed(page, { later = true } = {}) {
  if (later) await page.addInitScript(() => { window.__riglamAtOnceMs = 0; });
  await page.goto(origin + "/");
  await ready(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await ready(page);
  await expect.poll(() => controlled(page)).toBe(true);
}

test("a newer version is found, offered, and started from the banner without closing the app", async ({ page }) => {
  await installed(page);
  expect(await which(page)).not.toBe("v2");
  await expect(page.locator("#upd")).toBeHidden();
  await markOld(page);

  newVersion = true;
  await page.evaluate(() => window.__riglam.platform.updates.check());
  await expect(page.locator("#upd")).toBeVisible();
  await expect(page.locator("#upd")).toContainText("New version ready");
  expect(await isOld(page), "the page the reader is using is not reloaded behind their back").toBe(true);

  await page.locator("#upd").getByRole("button", { name: "Update now" }).click();
  await expect.poll(() => isOld(page).catch(() => true), { timeout: 15_000 }).toBe(false);
  await ready(page);
  expect(await which(page)).toBe("v2");
  await expect(page.locator("#upd")).toBeHidden();
});

test("Later hides the banner, and Options still offers the update", async ({ page }) => {
  await installed(page);
  newVersion = true;
  await page.evaluate(() => window.__riglam.platform.updates.check());
  await expect(page.locator("#upd")).toBeVisible();
  await page.locator("#upd").getByRole("button", { name: "Later" }).click();
  await expect(page.locator("#upd")).toBeHidden();

  await page.getByRole("button", { name: /options/i }).filter({ visible: true }).first().click();
  const row = page.locator(".orow", { hasText: "Version" });
  await expect(row).toContainText("A newer version is ready.");
  await markOld(page);
  await row.getByRole("button", { name: "Update now" }).click();
  await expect.poll(() => isOld(page).catch(() => true), { timeout: 15_000 }).toBe(false);
});

test("Options looks for a newer version when it opens, and says when there is none", async ({ page }) => {
  await installed(page);
  await page.waitForTimeout(100);
  newVersion = true;
  // a look younger than a minute is not repeated, so ask the way the Check button does
  await page.getByRole("button", { name: /options/i }).filter({ visible: true }).first().click();
  const row = page.locator(".orow", { hasText: "Version" });
  await expect(row).toContainText("This is the newest version.");
  await row.getByRole("button", { name: "Check for updates" }).click();
  await expect(row).toContainText("A newer version is ready.");
});

test("a version that takes over as the app opens starts by itself", async ({ page }) => {
  await installed(page, { later: false });
  await markOld(page);
  newVersion = true;
  // the browser looks for a new worker script when the page loads; the new one takes over within seconds and the page reloads onto it
  await page.reload();
  await expect.poll(() => which(page).catch(() => ""), { timeout: 15_000 }).toBe("v2");
  await ready(page);
  await expect(page.locator("#upd")).toBeHidden();
});

test("a worker that is already waiting from an older build is replaced and takes over (a phone stuck on an old version)", async ({ page }) => {
  await installed(page);
  newVersion = true;
  await page.evaluate(() => window.__riglam.platform.updates.check());
  await expect.poll(() => which(page).catch(() => ""), { timeout: 15_000 }).toBe("v2");
  // another visit, as after force-stopping the browser: the page is served by the new version at once
  await page.reload();
  await ready(page);
  expect(await which(page)).toBe("v2");
});

test("a check the server does not answer says so and does not break the page", async ({ page }) => {
  await installed(page);
  down = true;
  await page.evaluate(() => window.__riglam.platform.updates.check());
  await page.getByRole("button", { name: /options/i }).filter({ visible: true }).first().click();
  await expect(page.locator(".orow", { hasText: "Version" })).toContainText("Could not check for a newer version");
});
