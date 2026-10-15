// A start that never finishes offers a way out (the inline script in index.html). No service worker here, so the page's own requests
// can be held back with page.route.
import { test, expect } from "../../support/test.js";
import { ready } from "../../support/page.js";

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
