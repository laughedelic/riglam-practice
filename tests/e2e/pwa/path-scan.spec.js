// The Check of the examples on the Path (src/app/path/scan.tsx): it opens into a scanner that slides up through the cases in one move, marking each as it passes it
// (from the bottom up), covers the heading, marks the relation at the strip, and becomes the result's node; the result's page comes in around it. The look's
// check: ride takes it as any station. With the keyboard up the page opens first and the scan runs over it. At the foot the station that comes next takes the Check's place as the
// scanner leaves it. The rules of the practice are the other specs'.
import { test, expect } from "../../support/test.js";
import { isPhone } from "../../support/page.js";

test.use({ reducedMotion: "no-preference" });

const onPath = () => {
  if (localStorage.getItem("rd-design") === null) localStorage.setItem("rd-design", "path");
  if (localStorage.getItem("rd-look") === null) localStorage.setItem("rd-look", JSON.stringify({ check: "scan" }));   // the replaced result page, which this spec is about (the page that goes on is the default: path-push.spec.js)
  window.__vib = []; navigator.vibrate = (v) => { window.__vib.push(v); return true; };
};
const choices = (page) => page.locator("#path .chs .crow");

/** Four possibilities, its four cases written (the last one left without Enter); the Check is ready. */
async function written(page, { enter = false } = {}) {
  await page.addInitScript(onPath);
  await page.goto("/");
  await expect(choices(page)).toHaveCount(5);
  await choices(page).nth(3).click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (const t of ["a red book", "a red pot", "a blue book"]) { await field.fill(t); await field.press("Enter"); }
  await field.fill("a cloud");
  if (!enter) await field.blur();
  await page.evaluate(() => {
    window.__scan = []; window.__marks = 0; window.__open = null; window.__next = false;
    new MutationObserver((ms) => { window.__marks = Math.max(window.__marks, document.querySelectorAll("#path .sb .pscm").length);
      const nx = document.querySelector("#path #stn.scn-next"); if (nx && document.querySelector("#path .pscan") && nx.textContent.includes("Next pair")) window.__next = true;   // the next station is there while the scanner is still on its way
      for (const m of ms) { const e = m.target; if (!(e instanceof HTMLElement)) continue;
      if (e.matches(".sb.scn") && !e.dataset.seen) { e.dataset.seen = "1"; if (window.__open === null) window.__open = !document.querySelector(".pa.kbup") && !!document.querySelector("#path .foot #stn"); window.__scan.push("case:" + [...document.querySelectorAll("#path .sx.cur .sb")].indexOf(e)); }
      if (e.matches(".sechead.scn-gone") && !e.dataset.seen) { e.dataset.seen = "1"; window.__scan.push("head"); }
      if (e.matches(".pn.scn-rel") && !e.dataset.seen) { e.dataset.seen = "1"; window.__scan.push("rel"); } } })
      .observe(document.getElementById("path"), { subtree: true, attributes: true, attributeFilter: ["class"], childList: true });
  });
}

test("the Check slides up through the cases marking each from the bottom, then the heading, then the relation at the strip, and becomes the result's node", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await written(page);
  await page.locator("#stn").focus();
  await page.keyboard.press("Enter");
  const scn = page.locator("#path .pscan");
  await expect(scn).toHaveCount(1);
  const word = await scn.locator(".pscw b").textContent();
  await expect(page.locator(".pvline")).toBeVisible();
  expect(await page.evaluate(() => window.__marks), "each case had its mark after the example").toBe(4);   // (seen by the observer: on a slow machine the marks are on the page only for a moment)
  await expect(scn).toHaveCount(0);
  expect(await page.evaluate(() => window.__scan)).toEqual(["case:3", "case:2", "case:1", "case:0", "head", "rel"]);
  await expect(page.locator(".pvline")).toContainText(word);
  expect(await page.evaluate(() => window.__vib.length), "a knock at the relation").toBeGreaterThan(0);
  await expect(page.locator("#stn")).toContainText("Next pair");
  expect(await page.evaluate(() => window.__next), "Next pair took the Check's place at the foot while the scanner was still sliding").toBe(true);
  await expect(page.locator("#path .main")).not.toHaveClass(/sc-run/);
  expect(errors).toEqual([]);
});

test("the scanner glides into the result's node and the page does not move under it", async ({ page }) => {
  await written(page);
  await page.locator("#stn").click();
  await expect(page.locator(".pvline")).toBeVisible();
  const at = () => page.locator(".pvline .d.big").boundingBox().then((b) => Math.round(b.y));
  const y0 = await at();
  await expect(page.locator("#path .pscan")).toHaveCount(0);
  expect(await at(), "the result's page stays where it was drawn").toBe(y0);
  await expect(page.locator(".pvline .d.big")).toBeVisible();
});

test("with the keyboard up, Enter on the last example opens the page first, and the scan runs over it from the foot", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "a touch screen's keyboard");
  await written(page, { enter: true });
  await expect(page.locator("#path .cnode #stn")).toBeVisible();
  await page.locator("#cin").press("Enter");
  await expect(page.locator("#path .pscan")).toHaveCount(1);
  await expect(page.locator(".pa")).not.toHaveClass(/\bkbup\b/);
  await expect(page.locator("#path .pstrip")).toBeVisible();
  await expect(page.locator(".pvline")).toBeVisible();
  expect(await page.evaluate(() => window.__scan)).toEqual(["case:3", "case:2", "case:1", "case:0", "head", "rel"]);
  expect(await page.evaluate(() => window.__open), "the page was open (the foot there, the keyboard's layout gone) at the first mark").toBe(true);
  expect(await page.evaluate(() => window.__next), "Next pair took the Check's place at the foot while the scanner was still sliding").toBe(true);
  await expect(page.locator("#stn")).toContainText("Next pair");
});

test("with the look's check: ride the Check rides as any station", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rd-look", JSON.stringify({ ride: "fold", check: "ride" })));
  await written(page);
  await page.evaluate(() => { window.__ran = false; new MutationObserver(() => { if (document.querySelector("#path .main.tk-run")) window.__ran = true; }).observe(document.querySelector("#path .main"), { attributes: true }); });
  await page.locator("#stn").click();
  await expect(page.locator(".pvline")).toBeVisible();
  expect(await page.evaluate(() => window.__ran)).toBe(true);
  expect(await page.evaluate(() => window.__scan)).toEqual([]);
});
