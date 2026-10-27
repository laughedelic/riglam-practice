// The cover of the installed app (src/pwa/cover.html, cover.ts): drawn from the first paint with the figure and the name, in the ground of the device's theme (or of the look the
// device saved), and gone once the app has drawn its first screen. A browser driven by a test has no one to welcome (navigator.webdriver): the cover goes at once there, so these
// tests say it is not.
import { test, expect } from "../../support/test.js";
import { ready } from "../../support/page.js";

const welcomed = () => Object.defineProperty(navigator, "webdriver", { get: () => false });

test("the cover shows the figure and the name from the first paint, and leaves when the app is ready", async ({ page }) => {
  await page.addInitScript(welcomed);
  await page.goto("/", { waitUntil: "commit" });
  const cover = page.locator("#cover");
  await expect(cover).toBeVisible();
  await expect(cover.getByRole("img", { name: "Riglam practice" })).toBeVisible();
  expect(await cover.locator("svg.cv-name text").allTextContents()).toEqual(["riglam", "practice"]);
  expect(await cover.locator("svg.cv-fig polygon").count(), "the three diamonds").toBe(3);
  const box = await cover.boundingBox(), vp = page.viewportSize();
  expect([box.x, box.y, box.width, box.height], "it covers the whole screen").toEqual([0, 0, vp.width, vp.height]);
  await ready(page);
  await expect(cover, "it goes once the first screen is there").toHaveCount(0, { timeout: 8000 });
});

test("the cover takes the ground of the theme, light or dark, and of the look the device saved", async ({ page }) => {
  await page.addInitScript(welcomed);
  const ground = async () => {
    await page.goto("/", { waitUntil: "commit" });
    await expect(page.locator("#cover")).toBeVisible();
    return page.locator("#cover").evaluate((n) => getComputedStyle(n).backgroundColor);
  };
  await page.emulateMedia({ colorScheme: "light" });
  expect(await ground()).toBe("rgb(251, 249, 242)");
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await ground()).toBe("rgb(22, 26, 32)");
  await page.addInitScript(() => localStorage.setItem("rd-look", JSON.stringify({ mode: "light" })));
  expect(await ground(), "the look says light whatever the device does").toBe("rgb(251, 249, 242)");
});

test("without anyone to welcome (a driven browser) the cover is gone as soon as the app is ready", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#cover")).toHaveCount(0);
});
