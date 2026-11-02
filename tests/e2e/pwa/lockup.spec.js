// The name of the app, "RIGLAM" over "practice": two lines of SVG text set to one width by `textLength`, on the cover (src/pwa/cover.html) and at the head of the roadmap (src/app/path/brand.tsx).
// Engines lay such text out differently: Safari (WebKit) put the last letter of each line on top of the one before when it stood in a <tspan>, and no Chromium spec saw it. These tests read where
// the letters stand and fail on that in any engine; the `pwa-iphone` project (playwright.config.js) runs them in WebKit, the engine under every browser on an iPhone.
import { test, expect } from "../../support/test.js";

const welcomed = () => Object.defineProperty(navigator, "webdriver", { get: () => false });   // a driven browser has no one to welcome: the cover goes at once unless it is told it is not

/** Per line of a lockup, where its letters start and how wide they are, and the width the lockup was set to (its invisible box when it has one, else the drawing's own width). */
const letters = (root) => root.evaluate(async (svg) => {
  await document.fonts.ready;
  const lines = [...svg.querySelectorAll("text")].map((t) => ({
    text: t.textContent,
    glyphs: Array.from({ length: t.getNumberOfChars() }, (_, i) => { const e = t.getExtentOfChar(i); return { x: e.x, width: e.width }; }),
  }));
  const box = svg.querySelector(".rbox");
  return { lines, width: box ? box.getBBox().width : Number(svg.getAttribute("viewBox").split(" ")[2]) };
});

function expectSetEndToEnd({ lines, width }, where) {
  expect(lines.map((l) => l.text), where).toEqual(["RIGLAM", "practice"]);
  for (const { text, glyphs } of lines) {
    for (let i = 1; i < glyphs.length; i++) {
      const before = glyphs[i - 1], g = glyphs[i];
      expect(g.x, `${where}: "${text[i]}" starts after "${text[i - 1]}" ends (no letter on top of another)`).toBeGreaterThanOrEqual(before.x + before.width - 1.5);
    }
    const first = glyphs[0], last = glyphs[glyphs.length - 1];
    expect(Math.abs(last.x + last.width - (first.x + width)), `${where}: "${text}" fills the width it was set to`).toBeLessThan(1.5);
  }
}

test("the cover's name has every letter in its own place", async ({ page }) => {
  await page.addInitScript(welcomed);
  let release;
  const held = new Promise((done) => { release = done; });
  await page.route("**/drill-data*.json", async (route) => { await held; await route.continue().catch(() => {}); });   // the app waits for its data, and the cover stays
  await page.goto("/", { waitUntil: "commit" });
  await expect(page.locator("#cover svg.cv-name")).toBeVisible();
  expectSetEndToEnd(await letters(page.locator("#cover svg.cv-name")), "the cover");
  release();
});

test("the roadmap's name has every letter in its own place", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("rd-start", "road"); });
  await page.goto("/");
  await expect(page.getByRole("dialog", { name: "Roadmap" })).toBeVisible();
  await expect(page.locator("#cover")).toHaveCount(0);
  expectSetEndToEnd(await letters(page.locator(".pa .tree .rname")), "the roadmap");
});
