import { test, expect } from "../../support/test.js";
import { ready } from "../../support/page.js";

test("after one visit the app starts without a network", async ({ page, context }) => {
  await page.goto("/");
  await ready(page); // the data loaded and a pair is on screen

  // the service worker installs in the background; it controls pages from the next load on
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

  await context.setOffline(true);
  await page.reload();
  await ready(page);
  // the self-hosted face the page is set in is served from the cache (a face is "loaded" only after its file was fetched)
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    const main = getComputedStyle(document.querySelector("#path .pa")).fontFamily.split(",")[0].trim().replace(/["']/g, "");
    return [main, [...document.fonts].some((x) => x.family.replace(/"/g, "") === main && x.status === "loaded")];
  });
  expect(loaded, `the face ${loaded[0]} must be loaded from the cache`).toEqual([loaded[0], true]);
  await context.setOffline(false);
});
