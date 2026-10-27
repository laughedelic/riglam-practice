// A newer version of the installed app: found while the app is open, offered, and started without closing the app, never reloaded behind
// the reader's back. The server is a small static server over dist/pwa whose service worker script can be made different
// (the browser then installs it as a new version, which takes over at once); the new worker answers /__which with "v2". A page marks
// itself with window.__old, so that a reload shows.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";
import { test, expect } from "../../support/test.js";
import { ready, openSettings, openMenu } from "../../support/page.js";

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

test("a newer version is found, offered, and started from the toast without closing the app", async ({ page }) => {
  await installed(page);
  expect(await which(page)).not.toBe("v2");
  await expect(page.locator("#upd")).toBeHidden();
  await markOld(page);

  newVersion = true;
  await page.evaluate(() => window.__riglam.platform.updates.check());
  await expect(page.locator("#upd")).toBeVisible();
  await expect(page.locator("#upd")).toContainText("New version ready");
  // a small card under the top bar, not a bar across the screen: it leaves the pair bar and the foot of the screen alone
  const [t, vp, top] = await Promise.all([page.locator("#upd").boundingBox(), page.viewportSize(), page.locator(".mbar").boundingBox()]);
  expect(t.width).toBeLessThan(vp.width - 20);
  expect(t.y).toBeGreaterThanOrEqual(top.y + top.height);
  expect(t.y + t.height).toBeLessThan(vp.height / 2);
  expect(await isOld(page), "the page the reader is using is not reloaded behind their back").toBe(true);

  await page.locator("#upd").getByRole("button", { name: "Update now" }).click();
  await expect.poll(() => isOld(page).catch(() => true), { timeout: 15_000 }).toBe(false);
  await ready(page);
  expect(await which(page)).toBe("v2");
  await expect(page.locator("#upd")).toBeHidden();
});

test("on the Path the toast is the Path's own notice: an ink block in mono under the top bar, its two answers as text buttons", async ({ page }) => {
  await page.addInitScript(() => { if (localStorage.getItem("rd-design") === null) localStorage.setItem("rd-design", "path"); });
  const onPath = () => expect(page.locator("#path .chs .crow")).toHaveCount(5);
  await page.goto(origin + "/");
  await onPath();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await onPath();
  await expect.poll(() => controlled(page)).toBe(true);
  await markOld(page);
  newVersion = true;
  await page.evaluate(() => window.__riglam.platform.updates.check());
  const toast = page.locator("#upd");
  await expect(toast).toBeVisible();
  await expect(toast).toContainText("New version ready");
  const look = await page.evaluate(() => {
    const t = document.querySelector("#upd"), pa = document.querySelector("#path .pa"), cs = getComputedStyle(t), ground = getComputedStyle(pa);
    const buttons = [...t.querySelectorAll("button")].map((b) => getComputedStyle(b));
    return { ink: cs.backgroundColor === ground.color, paper: cs.color === ground.backgroundColor, flat: cs.boxShadow === "none" && cs.borderTopWidth === "0px", mono: /Plex Mono|monospace/.test(cs.fontFamily),
      quiet: buttons.length === 2 && buttons.every((b) => b.backgroundColor === "rgba(0, 0, 0, 0)" && b.boxShadow === "none" && b.textTransform === "none") };
  });
  expect(look).toEqual({ ink: true, paper: true, flat: true, mono: true, quiet: true });
  if (process.env.DLG_SHOTS) await page.screenshot({ path: process.env.DLG_SHOTS + "update-" + (await page.evaluate(() => (matchMedia("(max-width:700px)").matches ? "phone" : "desktop"))) + ".png" });
  const [t, bar] = await Promise.all([toast.boundingBox(), page.locator("#path .ptb").boundingBox()]);
  expect(t.y).toBeGreaterThanOrEqual(bar.y + bar.height);
  expect(await isOld(page), "the page the reader is using is not reloaded behind their back").toBe(true);
  await toast.getByRole("button", { name: "Update now" }).click();
  await expect.poll(() => isOld(page).catch(() => true), { timeout: 15_000 }).toBe(false);
  await onPath();
  expect(await which(page)).toBe("v2");
});

test("the Path's roadmap looks for a newer version each time it opens, says that it is looking, and offers a newer one at its foot", async ({ page }) => {
  await page.addInitScript(() => { if (localStorage.getItem("rd-design") === null) localStorage.setItem("rd-design", "path"); });
  const onPath = () => expect(page.locator("#path .chs .crow")).toHaveCount(5);
  await page.goto(origin + "/");
  await onPath();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await onPath();
  await expect.poll(() => controlled(page)).toBe(true);
  await page.evaluate(() => window.__riglam.platform.updates.check());
  await markOld(page);
  await page.clock.install(); // a look from the last few seconds stands: let the time pass
  await page.clock.fastForward(10_000);
  await page.locator(".tstn").click();
  const road = page.getByRole("dialog", { name: "Roadmap" }), row = road.locator(".rver");
  await expect(row).toContainText("Checking for updates");
  await expect(row).toContainText("Up to date");
  const again = row.getByRole("button", { name: "Check again" });
  expect((await again.boundingBox()).height, "a link of a full touch height").toBeGreaterThanOrEqual(40);

  newVersion = true;
  newBuild = true;
  await again.click();
  await expect(row).toContainText(/Checking for updates|Downloading the update|Update ready/);
  const note = road.locator(".rnote");
  await expect(note).toBeVisible();
  await expect(note).toContainText("New version ready");
  await expect(note, "it names what is ready and what updating does").toContainText("New version ready (9.9.9). Updating reloads the app; your answers stay.");
  await expect(row).toContainText("Update ready");
  await expect(page.locator("#upd"), "the notice under the top bar gives way: the roadmap has its own").toBeHidden();
  // at the bottom, above the panel, clear of the logo
  const [n, foot, tree] = await Promise.all([note.boundingBox(), page.locator("#path .rfoot").boundingBox(), road.locator("svg.tree").boundingBox()]);
  expect(n.y + n.height, "above the foot").toBeLessThanOrEqual(foot.y);
  expect(n.y, "below the top of the roadmap, not across the logo").toBeGreaterThan(tree.y + tree.height * 0.5);
  expect(await isOld(page), "the page the reader is using is not reloaded behind their back").toBe(true);
  await note.getByRole("button", { name: "Update now" }).click();
  await expect.poll(() => isOld(page).catch(() => true), { timeout: 15_000 }).toBe(false);
  await onPath();
  expect(await which(page)).toBe("v2");
});

test("the toast goes away by itself after a while, and the menu keeps the way to update", async ({ page }) => {
  await installed(page);
  await page.clock.install(); // the toast's timer is made after this, so the clock can run it
  newVersion = true;
  await page.evaluate(() => window.__riglam.platform.updates.check());
  await expect(page.locator("#upd")).toBeVisible();
  await page.clock.fastForward(25_000);
  await expect(page.locator("#upd")).toBeHidden();
  await openMenu(page);
  await expect(page.locator("#menu .ver")).toContainText("Update available");
});

test("the toast waits while the pointer or the focus is on it, and goes only when neither is", async ({ page }) => {
  await installed(page);
  await page.clock.install();
  newVersion = true;
  await page.evaluate(() => window.__riglam.platform.updates.check());
  const toast = page.locator("#upd");
  await expect(toast).toBeVisible();
  await toast.getByRole("button", { name: "Update now" }).focus();
  await toast.hover();
  await page.clock.runFor(25_000);
  await expect(toast).toBeVisible();
  // the pointer leaves and the focus stays: the notice stays too
  await page.mouse.move(2, 2);
  await page.clock.runFor(25_000);
  await expect(toast).toBeVisible();
  // the focus leaves as well: now it counts down
  await page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement).blur());
  await page.clock.runFor(25_000);
  await expect(toast).toBeHidden();
});

test("a redraw of the menu by an update keeps the focus on the control the reader is on", async ({ page }) => {
  await installed(page);
  await openMenu(page);
  const row = page.locator('#menu .mrow[data-go="debate"]');
  await row.focus();
  newVersion = true;
  await page.evaluate(() => window.__riglam.platform.updates.check());
  await expect(page.locator("#menu .ver")).toContainText("Update available");
  await expect(row).toBeFocused();
});

test("Later hides the toast, and Settings still offers the update", async ({ page }) => {
  await installed(page);
  newVersion = true;
  await page.evaluate(() => window.__riglam.platform.updates.check());
  await expect(page.locator("#upd")).toBeVisible();
  await page.locator("#upd").getByRole("button", { name: "Later" }).click();
  await expect(page.locator("#upd")).toBeHidden();

  await openSettings(page);
  const row = page.locator(".orow", { hasText: "Version" });
  await expect(row).toContainText("A newer version is ready.");
  await markOld(page);
  await row.getByRole("button", { name: "Update now" }).click();
  await expect.poll(() => isOld(page).catch(() => true), { timeout: 15_000 }).toBe(false);
});

test("Settings looks for a newer version when it opens, and says when there is none", async ({ page }) => {
  await installed(page);
  await page.waitForTimeout(100);
  newVersion = true;
  // a look younger than a minute is not repeated, so ask the way the Check button does
  await openSettings(page);
  const row = page.locator(".orow", { hasText: "Version" });
  await expect(row).toContainText("This is the newest version.");
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
  await expect(page.locator("#upd")).toBeVisible({ timeout: 15_000 });
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
  await openSettings(page);
  await expect(page.locator(".orow", { hasText: "Version" })).toContainText("Could not check for a newer version");
});
