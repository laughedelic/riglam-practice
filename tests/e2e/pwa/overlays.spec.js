// Options opens over the page. The system Back closes it instead of leaving the app, it keeps its place when a setting changes, and the Blitz
// clock stands still while it is open (an attempt is never graded behind it).
import { test, expect } from "../../support/test.js";
import { ready } from "../../support/page.js";

const optionsBtn = (page) => page.getByRole("button", { name: /options/i }).filter({ visible: true }).first();
const hook = () => { window.__riglamTest = (t) => { window.__t = t; }; };
const blitz = () => { localStorage.setItem("rd-blitz", "1"); localStorage.setItem("rd-timer-rel", "2000"); localStorage.setItem("rd-timer", "2000"); };
const bodyText = (page) => page.evaluate(() => document.body.innerText);

test("Back closes Options and stays in the app", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  const url = page.url();
  await optionsBtn(page).click();
  await expect(page.locator("#over")).toBeVisible();
  await page.goBack();
  await expect(page.locator("#over")).toBeHidden();
  expect(page.url()).toBe(url);
  await ready(page);

  // Forward onto the entry of an overlay that is gone does not leave a dead step behind
  await page.goForward();
  await expect(page.locator("#over")).toBeHidden();
  await expect.poll(() => page.evaluate(() => history.state)).toBeNull();
});

test("closing Options with its own Back button or Escape leaves no extra step", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  for (const close of [() => page.locator("#over .oc").click(), () => page.keyboard.press("Escape")]) {
    await optionsBtn(page).click();
    await expect(page.locator("#over")).toBeVisible();
    await close();
    await expect(page.locator("#over")).toBeHidden();
    await expect.poll(() => page.evaluate(() => history.state)).toBeNull();
  }
  // from the first screen, Back leaves the app as it always did
  await page.goBack();
  await expect.poll(() => page.url()).toBe("about:blank");
});

test("Options keeps its place when a setting changes", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await optionsBtn(page).click();
  await expect(page.locator("#over .opts")).toBeVisible();
  // Each step is one page.evaluate: the panel is redrawn now and then in the background (fonts, the update check), and a locator that found the old
  // box before a redraw would read or set a box that is already gone.
  const room = await page.evaluate(() => { const n = document.getElementById("opts"); return n.scrollHeight - n.clientHeight; });
  test.skip(room < 60, "the whole list fits in this window");
  const before = await page.evaluate(() => { const n = document.getElementById("opts"); n.scrollTop = Math.floor((n.scrollHeight - n.clientHeight) / 2); return n.scrollTop; });
  expect(before).toBeGreaterThan(0);
  const was = await page.evaluate(() => { const b = document.querySelector("#over .opts .sw"); const v = b.getAttribute("aria-checked"); b.click(); return v; }); // a click that does not scroll the list itself
  await expect.poll(() => page.evaluate(() => document.querySelector("#over .opts .sw").getAttribute("aria-checked"))).not.toBe(was);
  await expect.poll(() => page.evaluate(() => document.getElementById("opts").scrollTop)).toBe(before);
});

test("the relation's Blitz clock stands still behind Options", async ({ page }) => {
  await page.addInitScript(blitz);
  await page.goto("/");
  await ready(page);
  await optionsBtn(page).click();
  await expect(page.locator("#over")).toBeVisible();
  await page.waitForTimeout(3000); // longer than the 2 s limit
  await page.locator("#over .oc").click();
  await expect(page.locator("#over")).toBeHidden();
  expect(await bodyText(page)).not.toMatch(/time ran out/i);
  // it runs again, from the start, once the panel is closed
  await expect.poll(() => bodyText(page), { timeout: 6000 }).toMatch(/time ran out/i);
});

test("a Pervasions question's clock stands still behind Options", async ({ page }) => {
  await page.addInitScript(hook);
  await page.addInitScript(blitz);
  await page.goto("/");
  await ready(page);
  await page.getByRole("tab", { name: /pervasions/i }).filter({ visible: true }).first().click();
  await expect.poll(() => page.evaluate(() => window.__t.ui.debate)).toBe(true);
  await optionsBtn(page).click();
  await page.waitForTimeout(3000);
  expect(await page.evaluate(() => window.__t.ui.step)).toBe(0);
  await page.locator("#over .oc").click();
  await expect(page.locator("#over")).toBeHidden();
  expect(await page.evaluate(() => window.__t.ui.step)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__t.ui.step), { timeout: 6000 }).toBeGreaterThan(0);
});
