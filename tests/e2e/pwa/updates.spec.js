// A newer version of the installed app: found while the app is open, offered, and started without closing the app, never reloaded behind
// the reader's back. The server is a small static server over dist/pwa whose service worker script can be made different
// (the browser then installs it as a new version, which takes over at once); the new worker answers /__which with "v2". A page marks
// itself with window.__old, so that a reload shows.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { test, expect } from "../../support/test.js";
import { ready, openMenu, openSettingsPage, roadmap } from "../../support/page.js";

const DIST = join(process.cwd(), "dist/pwa");
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json" };
const V2 = "\nself.addEventListener('fetch',(e)=>{ if(new URL(e.request.url).pathname.endsWith('/__which')) e.respondWith(new Response('v2')); });\n";

let server, origin, newVersion, newBuild, down;
test.beforeAll(async () => {
  server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let file = join(DIST, normalize(path));
    if (!file.startsWith(DIST) || !existsSync(file) || statSync(file).isDirectory()) file = join(DIST, "index.html");
    if (down && path === "/sw.js") { res.writeHead(503); return res.end(); }
    let body = readFileSync(file);
    if (path === "/sw.js" && newVersion) body = Buffer.concat([body, Buffer.from(V2)]);
    if (path === "/build.json" && newBuild) body = Buffer.from(JSON.stringify({ version: "9.9.9", commit: "b1ee7d5", builtAt: "2030-01-01T00:00:00Z" }));   // the server's build is another one (its commit and version are named in the notice)
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-cache" });
    res.end(body);
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://localhost:${server.address().port}`;
});
test.afterAll(() => server.close());
test.beforeEach(() => { newVersion = false; newBuild = false; down = false; });

const markOld = (page) => page.evaluate(() => { window.__old = true; });
const isOld = (page) => page.evaluate(() => window.__old === true);
const controlled = (page) => page.evaluate(() => !!navigator.serviceWorker.controller);
/** The Version and updates page of Settings: the status and its one button. */
const versionPage = (page) => page.locator("#path .ol").filter({ has: page.locator(".pver") });
const which = (page) => page.evaluate(async () => (await fetch("__which")).text().catch(() => ""));
async function installed(page) {
  await page.goto(origin + "/");
  await ready(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await ready(page);
  await expect.poll(() => controlled(page)).toBe(true);
  // the look the app makes as it opens (the registration answers a moment after the page is up) is over: a later change on the server is then found only by a look the test asks for
  await expect.poll(() => page.evaluate(() => window.__riglam.platform.updates.status())).toBe("current");
}

/** The line of a version that waits, above the bottom (src/app/path/news.tsx): in an exercise above the next station, on the roadmap above its foot. */
const footLine = (page) => page.locator("#path .lay .pinln.onfoot");
const roadLine = (page) => roadmap(page).locator(".pinln.onroad");
/** What's new as it opens: a page of Settings whose top bar says so. */
const newsPage = (page) => page.locator("#path .ptb-t", { hasText: "What's new" });

test("a newer version is said on one line above the next stop, covering nothing; Update starts it and opens What's new", async ({ page }) => {
  await installed(page);
  await markOld(page);
  // this device last saw an older item of What's new, so the new version has something to say
  await page.evaluate(() => localStorage.setItem("rd-news-seen", "2026-10-30-claude"));
  newVersion = true;
  await page.evaluate(() => window.__riglam.platform.updates.check());
  const line = footLine(page);
  await expect(line).toBeVisible();
  await expect(line).toContainText("New version ready");
  await expect(page.locator("#upd"), "no card over the page").toHaveCount(0);
  if (process.env.DLG_SHOTS) await page.screenshot({ path: process.env.DLG_SHOTS + "update-" + (await page.evaluate(() => (matchMedia("(max-width:700px)").matches ? "phone" : "desktop"))) + ".png" });
  const [l, foot, bar, vh] = await Promise.all([line.boundingBox(), page.locator("#path .lay .foot").boundingBox(), page.locator("#path .ptb").boundingBox(), page.evaluate(() => innerHeight)]);
  expect(l.height, "one line").toBeLessThanOrEqual(48);
  expect(l.y + l.height, "right above the next station").toBeLessThanOrEqual(foot.y + 1);
  expect(l.y, "far from the top bar and the question").toBeGreaterThan(bar.y + bar.height + 100);
  expect(foot.y + foot.height, "and the station is still on the screen").toBeLessThanOrEqual(vh + 1);
  expect(await isOld(page), "the page the reader is using is not reloaded behind their back").toBe(true);
  await line.getByRole("button", { name: "Update" }).click();
  await expect.poll(() => isOld(page).catch(() => true), { timeout: 15_000 }).toBe(false);
  expect(await which(page)).toBe("v2");
  await expect(newsPage(page), "the start after Update opens What's new").toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#path .nwi.new").first()).toBeVisible();
  // its way back is where the app opened, not the Settings list
  await page.locator("#path .ptb .tstn").click();
  await expect(newsPage(page)).toBeHidden();
  await expect(page.locator("#path .chs .crow")).toHaveCount(5);
});

test("the roadmap looks for a newer version each time it opens and says it on one line above its foot, with the one Update", async ({ page }) => {
  await installed(page);
  await markOld(page);
  newVersion = true;
  newBuild = true;
  await page.clock.install(); // a look from the last few seconds stands: let the time pass
  await page.clock.fastForward(10_000);
  await page.locator(".tstn").click();
  const line = roadLine(page);
  await expect(line).toContainText("New version ready", { timeout: 15_000 });
  await expect(roadmap(page).getByRole("button", { name: /^Update/ }), "one way to update, not two").toHaveCount(1);
  await expect(roadmap(page).locator(".rver"), "the real app shows no version row").toHaveCount(0);
  const [n, foot, tree] = await Promise.all([line.boundingBox(), page.locator("#path .rfoot").boundingBox(), roadmap(page).locator("svg.tree").boundingBox()]);
  expect(n.y + n.height, "above the foot").toBeLessThanOrEqual(foot.y + 1);
  expect(n.y, "below the top of the roadmap, not across the logo").toBeGreaterThan(tree.y + tree.height * 0.5);
  expect((await line.getByRole("button", { name: "Update" }).boundingBox()).height, "a link of a full touch height").toBeGreaterThanOrEqual(40);
  expect(await isOld(page), "the page the reader is using is not reloaded behind their back").toBe(true);
  await line.getByRole("button", { name: "Update" }).click();
  await expect.poll(() => isOld(page).catch(() => true), { timeout: 15_000 }).toBe(false);
  expect(await which(page)).toBe("v2");
});

test("a start with something new not read shows What's new on the roadmap's line; it opens the page, goes back to the roadmap, and is gone once read", async ({ page }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem("once")) { sessionStorage.setItem("once", "1"); localStorage.setItem("rd-news-seen", "2026-10-30-claude"); localStorage.setItem("rd-start", "road"); } });
  await page.goto(origin + "/");
  const line = roadLine(page);
  await expect(line).toContainText("What's new");
  await expect(newsPage(page), "never opened unasked").toBeHidden();
  await line.getByRole("button", { name: "Read" }).click();
  await expect(newsPage(page)).toBeVisible();
  await expect(page.locator("#path .nwi.new")).not.toHaveCount(0);
  await page.locator("#path .ptb .tstn").click();
  await expect(roadmap(page)).toBeVisible();
  await expect(line).toHaveCount(0);
  // and Settings keeps the page, under About
  await openSettingsPage(page, "What's new");
  await expect(page.locator("#path .nwi")).not.toHaveCount(0);
  await expect(page.locator("#path .nwi.new"), "nothing is new any more").toHaveCount(0);
});

test("a first start shows no backlog of What's new", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rd-start", "road"));
  await page.goto(origin + "/");
  await expect(roadmap(page)).toBeVisible();
  await expect(roadmap(page).locator(".rfoot")).toBeVisible();
  await expect(roadLine(page)).toHaveCount(0);
});

test("a redraw of the roadmap by an update keeps the focus on the control the reader is on", async ({ page }) => {
  await installed(page);
  await openMenu(page);
  const row = roadmap(page).locator(".rfoot").getByRole("button", { name: "Settings" });
  await row.focus();
  newVersion = true;
  await page.evaluate(() => window.__riglam.platform.updates.check());
  await expect(roadLine(page)).toContainText("New version ready");
  await expect(row).toBeFocused();
});

test("Settings offers the update too", async ({ page }) => {
  await installed(page);
  newVersion = true;
  await page.evaluate(() => window.__riglam.platform.updates.check());
  await expect(footLine(page)).toBeVisible();
  await openSettingsPage(page, "Version and updates");
  const row = versionPage(page);
  await expect(row).toContainText("A newer version is ready.");
  await markOld(page);
  await row.getByRole("button", { name: "Update now" }).click();
  await expect.poll(() => isOld(page).catch(() => true), { timeout: 15_000 }).toBe(false);
});

test("Version and updates says when there is no newer version, and the Check button finds one", async ({ page }) => {
  await installed(page);
  // the roadmap on the way looks for a newer version each time it opens (it is the test above), so the server changes only once the page is up
  await openSettingsPage(page, "Version and updates");
  const row = versionPage(page);
  await expect(row).toContainText("This is the newest version.");
  newVersion = true;
  await row.getByRole("button", { name: "Check for updates" }).click();
  await expect(row).toContainText("A newer version is ready.");
});

test("a version that takes over as the app opens is offered, not started", async ({ page }) => {
  await installed(page);
  await markOld(page);
  newVersion = true;
  // the browser looks for a new worker script when the page loads; the new one takes over within seconds
  await page.reload();
  await markOld(page);
  await expect(footLine(page)).toBeVisible({ timeout: 15_000 });
  expect(await which(page)).toBe("v2");
  expect(await isOld(page), "the page is not reloaded without the reader's word").toBe(true);
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
  await openSettingsPage(page, "Version and updates");
  await expect(versionPage(page)).toContainText("Could not check for a newer version");
});
