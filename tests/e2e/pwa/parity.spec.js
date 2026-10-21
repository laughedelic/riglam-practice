// The PWA and the artifact build share one source. With the same random draw, the same fonts and an empty
// store, they must show the same page: same markup, same positions.
import { test, expect } from "../../support/test.js";
import { routeArtifact, seedRandom } from "../../support/artifact-host.js";
import { ready } from "../../support/page.js";

async function snapshot(page) {
  await ready(page);
  await page.evaluate(async () => { await document.fonts.ready; });
  return page.evaluate(() => {
    const boxes = [...document.querySelectorAll("#app [id], #app .rel, #app .brand, #app .btn")].map((n) => {
      const r = n.getBoundingClientRect();
      return [n.id || n.className || n.tagName, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
    });
    // the foot of the menu (the Magic Key button, the version and the update line) is the platform's own, and a wide screen shows the menu from the start
    const app = document.getElementById("app").cloneNode(true);
    app.querySelector("#menu .mfoot")?.remove();
    // Categories is in the menu only where the device holds reference examples (the artifact carries them, the PWA gets them with the Magic Key), and the exercises are headed in two groups only then
    app.querySelector('#menu [data-go="categories"]')?.remove();
    app.querySelectorAll("#menu .mgrp").forEach((n) => n.remove());
    return { html: app.outerHTML, boxes, scrollW: document.documentElement.scrollWidth, innerW: innerWidth };
  });
}

test("same first screen in both builds", async ({ page, browser }, testInfo) => {
  const viewport = page.viewportSize();
  await page.addInitScript(seedRandom);
  await page.goto("/");
  const pwa = await snapshot(page);

  const ctx = await browser.newContext({ viewport, isMobile: testInfo.project.name === "pwa-phone", hasTouch: testInfo.project.name === "pwa-phone", deviceScaleFactor: 1 });
  const art = await ctx.newPage();
  await art.addInitScript(seedRandom);
  await routeArtifact(art);
  await art.goto("http://artifact.test/");
  const artifact = await snapshot(art);
  await ctx.close();

  expect(artifact.html).toBe(pwa.html);
  expect(artifact.boxes).toEqual(pwa.boxes);
  expect(pwa.scrollW).toBeLessThanOrEqual(pwa.innerW);
});
