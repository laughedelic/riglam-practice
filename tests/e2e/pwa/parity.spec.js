// The PWA and the artifact build share one source. With the same random draw, the same fonts and an empty
// store, they must show the same page: same markup, same positions.
import { test, expect, SETTLED_TERMS } from "../../support/test.js";
import { routeArtifact, seedRandom } from "../../support/artifact-host.js";
import { ready } from "../../support/page.js";

async function snapshot(page) {
  await ready(page);
  await page.evaluate(async () => { await document.fonts.ready; });
  return page.evaluate(() => {
    const boxes = [...document.querySelectorAll("#path [id], #path .crow, #path .pbtn")].map((n) => {
      const r = n.getBoundingClientRect();
      return [n.id || n.className || n.tagName, Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
    });
    // the foot of the roadmap (the Magic Key button, the version and the update line) is the platform's own
    const app = document.getElementById("path").cloneNode(true);
    app.querySelector(".road .rfoot")?.remove();
    return { html: app.outerHTML, boxes, scrollW: document.documentElement.scrollWidth, innerW: innerWidth };
  });
}

// the same stages, terms and first screen in both (the fixture's stored settings make the PWA's device one used before, which a new artifact page is not,
// with every term met, and starting on the exercise, not on the roadmap)
const sameStages = (terms) => { try { localStorage.setItem("rd-stages", "1,2,3"); localStorage.setItem("rd-start", "exercise"); localStorage.setItem("rd-terms", terms); } catch { /* storage unavailable */ } };

test("same first screen in both builds", async ({ page, browser }, testInfo) => {
  const viewport = page.viewportSize();
  await page.addInitScript(seedRandom);
  await page.addInitScript(sameStages, SETTLED_TERMS);
  await page.goto("/");
  const pwa = await snapshot(page);

  const ctx = await browser.newContext({ viewport, isMobile: testInfo.project.name === "pwa-phone", hasTouch: testInfo.project.name === "pwa-phone", deviceScaleFactor: 1 });
  const art = await ctx.newPage();
  await art.addInitScript(seedRandom);
  await art.addInitScript(sameStages, SETTLED_TERMS);
  await routeArtifact(art);
  await art.goto("http://artifact.test/");
  const artifact = await snapshot(art);
  await ctx.close();

  expect(artifact.html).toBe(pwa.html);
  expect(artifact.boxes).toEqual(pwa.boxes);
  expect(pwa.scrollW).toBeLessThanOrEqual(pwa.innerW);
});
