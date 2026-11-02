// A start that never finishes offers a way out (the inline script in index.html). No service worker here, so the page's own requests
// can be held back with page.route.
import { test, expect } from "../../support/test.js";
import { openMenu, openSettings, ready, roadmap } from "../../support/page.js";

test.use({ serviceWorkers: "block" });

test("a page stuck on its data offers a reload with fresh files, which keeps what is stored", async ({ page }) => {
  await page.addInitScript(() => { window.__riglamRecoverMs = 400; });
  await page.route("**/drill-data*.json", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("#recover")).toBeVisible({ timeout: 10_000 });
  await expect(page.locator("#recover")).toContainText("taking longer than usual");
  await page.evaluate(() => localStorage.setItem("probe", "kept"));

  await page.unroute("**/drill-data*.json");
  await page.locator("#recover").getByRole("button", { name: "Reload with fresh files" }).click();
  await ready(page);
  await expect(page.locator("#recover")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("probe"))).toBe("kept");
});

test("a page that starts normally never shows it", async ({ page }) => {
  await page.addInitScript(() => { window.__riglamRecoverMs = 400; });
  await page.goto("/");
  await ready(page);
  await page.waitForTimeout(2500);
  await expect(page.locator("#recover")).toHaveCount(0);
});

test("the panel says what the start is waiting for", async ({ page }) => {
  await page.addInitScript(() => { window.__riglamRecoverMs = 400; });
  await page.route("**/drill-data*.json", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("#recover")).toContainText("Waiting for the practice data.", { timeout: 10_000 });
});

test("a storage that never answers is named in the panel", async ({ page }) => {
  await page.addInitScript(() => {
    window.__riglamRecoverMs = 400;
    // a connection that never opens: neither success nor error
    const open = IDBFactory.prototype.open;
    IDBFactory.prototype.open = function (name, ...rest) { return name === "riglam" ? ({}) : open.call(this, name, ...rest); };
  });
  await page.goto("/");
  await expect(page.locator("#recover")).toContainText("Waiting for the saved batches, answers", { timeout: 10_000 });
});

/** The line above the roadmap's foot, and the one above the next station of the exercise under it (src/app/path/storage.tsx). */
const roadLine = (page) => roadmap(page).locator(".pinln.onroad.store");
const footLine = (page) => page.locator("#path .lay .pinln.onfoot.store");
/** The browser's storage for the app never opens: neither success nor error. */
const neverOpens = () => {
  const open = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function (name, ...rest) { return name === "riglam" ? ({}) : open.call(this, name, ...rest); };
};

test("a storage that never answers does not keep the page on Loading: it starts, and says on one line above the next station that nothing is saved", async ({ page }) => {
  await page.addInitScript(neverOpens);
  await page.goto("/");
  await expect(footLine(page)).toContainText("storage is not answering", { timeout: 20_000 });
  await expect(page.locator("#store"), "no bar over the page").toHaveCount(0);
  await expect(page.locator("#path .pstatus")).toHaveCount(0);
  if (process.env.DLG_SHOTS) await page.screenshot({ path: process.env.DLG_SHOTS + "storage-exercise-" + (await page.evaluate(() => (matchMedia("(max-width:700px)").matches ? "phone" : "desktop"))) + ".png" });
  // it covers nothing: the line stands on the thread right above the next station, far from the top bar and the question, and the station is still on the screen
  const [l, bar, station, vh] = await Promise.all([footLine(page).boundingBox(), page.locator("#path .ptb").boundingBox(), page.locator("#path .lay .foot").boundingBox(), page.evaluate(() => innerHeight)]);
  expect(l.height, "one line, or two at most").toBeLessThanOrEqual(60);
  expect(l.y, "far from the top bar and the question").toBeGreaterThan(bar.y + bar.height + 100);
  expect(l.y + l.height, "right above the next station").toBeLessThanOrEqual(station.y + 1);
  expect(station.y + station.height, "and the station is still on the screen").toBeLessThanOrEqual(vh + 1);
  // the roadmap says it too, above its foot
  await openMenu(page);
  await expect(roadLine(page)).toContainText("storage is not answering");
  const [line, foot] = await Promise.all([roadLine(page).boundingBox(), roadmap(page).locator(".rfoot").boundingBox()]);
  expect(line.height, "one line, or two at most").toBeLessThanOrEqual(60);
  expect(line.y + line.height, "right above the foot").toBeLessThanOrEqual(foot.y + 1);
  // its Reload is the way on; its words open the Storage page, with what a test database said, and the way back goes to the roadmap
  await expect(roadLine(page).getByRole("button", { name: "Reload" })).toBeVisible();
  await roadLine(page).getByRole("button", { name: /storage is not answering/ }).click();
  await expect(page.locator("#path .ptb-t", { hasText: "Storage" })).toBeVisible();
  await expect(page.locator("#path")).toContainText("A new test database opened", { timeout: 10_000 });
  await page.getByRole("button", { name: "Back to the roadmap", exact: true }).click();
  await expect(roadLine(page)).toBeVisible();
});

test("a storage that was only slow is back by itself: the line goes, the saved answers are shown again and what was done meanwhile is saved", async ({ page }) => {
  const put = (id, doc) => page.evaluate(async ([i, d]) => { await (await window.__riglam.platform.db()).collection("labruns").doc(i).set(d); }, [id, doc]);
  const get = (id) => page.evaluate(async (i) => { const s = await (await window.__riglam.platform.db()).collection("labruns").doc(i).get(); return s.exists ? s.data() : null; }, id);
  await page.goto("/");
  await ready(page);
  await put("lr_kept", { kind: "run", at: "2026-10-01T10:00:00.000Z" });
  // from the next start on the connection to the database opens only when the test says so (sessionStorage keeps the test's word across the reload)
  await page.evaluate(() => sessionStorage.setItem("hold", "on"));
  await page.addInitScript(() => {
    const open = IDBFactory.prototype.open;
    const held = [];
    IDBFactory.prototype.open = function (name, ...rest) {
      const req = open.call(this, name, ...rest);
      if (name !== "riglam" || sessionStorage.getItem("hold") !== "on") return req;
      let handler = null;
      Object.defineProperty(req, "onsuccess", { set(f) { handler = f; }, get() { return handler; }, configurable: true });
      req.addEventListener("success", (e) => { if (handler) held.push(() => handler.call(req, e)); });
      return req;
    };
    window.__release = () => { sessionStorage.setItem("hold", "off"); held.splice(0).forEach((f) => f()); };
  });
  await page.reload();
  await expect(footLine(page)).toContainText("storage is not answering", { timeout: 20_000 });
  expect(await get("lr_kept"), "the saved answers are not shown while it does not answer").toBeNull();
  await put("lr_meanwhile", { kind: "run", at: "2026-10-02T10:00:00.000Z" });
  await page.evaluate(() => window.__release());
  await expect(footLine(page), "the line goes when the storage answers").toHaveCount(0, { timeout: 10_000 });
  expect(await get("lr_kept"), "the saved answers are shown again").toMatchObject({ kind: "run" });
  // Settings keeps a line that says it was away and is back
  await openSettings(page);
  await expect(page.locator("#path .ol", { hasText: "Storage" })).toContainText("answered again");
  await page.getByRole("button", { name: "Storage: more" }).click();
  await expect(page.locator("#path")).toContainText("What you did meanwhile has been saved");
  // what was done meanwhile was saved: a start with no hold finds both
  await page.reload();
  await ready(page);
  expect(await get("lr_kept")).toMatchObject({ kind: "run" });
  expect(await get("lr_meanwhile"), "what was done while it did not answer was saved").toMatchObject({ kind: "run" });
});
