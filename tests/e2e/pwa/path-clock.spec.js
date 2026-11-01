// The Blitz clock on the Path (src/app/path/clock.tsx): the bar keeps the countdown's time when the page is redrawn, it stays in sight while an example is written on a phone,
// it fills up and steps once a second with reduced motion, and says the last seconds in a number. Which countdown belongs to which step is shell/timers.js; the sounds are path-sounds.spec.js.
import { test, expect } from "../../support/test.js";
import { isPhone, ready, relOptions } from "../../support/page.js";

/** Blitz on from the start, with `ms` for the relation and for each example (the page reads them as the times of Relations). */
const blitz = (page, ms) => page.addInitScript((t) => { localStorage.setItem("rd-blitz", "1"); localStorage.setItem("rd-timer", String(t)); localStorage.setItem("rd-timer-rel", String(t)); window.__riglamTest = (x) => { window.__t = x; }; }, ms);
const clock = (page) => page.locator("#path .pclock");
const elapsed = (page) => clock(page).evaluate((e) => parseFloat(e.style.getPropertyValue("--e")));
/** How far the bar's animation has got, less how far the countdown has: both as a share of the countdown. */
const drift = (page) => page.evaluate(() => {
  const tq = window.__t.ui.tq, a = document.querySelector("#path .pclock i").getAnimations()[0];
  return a.effect.getComputedTiming().progress - (performance.now() - tq.t0) / tq.limit;
});

test("the bar keeps the time of its countdown when the page is redrawn: a letter typed does not move it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await blitz(page, 20000);
  await page.goto("/");
  await ready(page);
  await relOptions(page).nth(3).click();   // four possibilities: the examples, one countdown for the four cases (80 s)
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  const from = await elapsed(page);
  await page.waitForTimeout(2000);
  expect(Math.abs(await drift(page)), "before any redraw").toBeLessThan(0.01);
  await field.pressSequentially("ab");
  expect(await elapsed(page), "the offset it began with").toBe(from);
  expect(Math.abs(await drift(page)), "after the redraws of two letters (the bar once went ahead by the time gone)").toBeLessThan(0.01);
});

test("on a phone the clock stays in sight while an example is written, though the top bar has stepped aside", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the layout with the keyboard up is a touch screen's");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await blitz(page, 20000);
  await page.goto("/");
  await ready(page);
  await expect(clock(page)).toBeVisible();   // choosing the relation: on the lower edge of the top bar
  await relOptions(page).first().click();
  await expect(page.locator("#cin")).toBeFocused();
  await expect(page.locator(".pa")).toHaveClass(/kbup/);
  await expect.poll(async () => (await page.locator(".ptb").boundingBox()).y + (await page.locator(".ptb").boundingBox()).height, { message: "the top bar has gone out of sight" }).toBeLessThanOrEqual(1);
  await expect.poll(async () => { const b = await clock(page).boundingBox(); return b.y >= -1 && b.y + b.height > 1 && b.y < 8; }, { message: "the line is at the top of the screen" }).toBe(true);
});

test("with reduced motion the bar steps up once a second instead of staying empty", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await blitz(page, 6000);
  await page.goto("/");
  await ready(page);
  const left = () => page.locator("#path .pclock i").evaluate((i) => ({ scale: new DOMMatrix(getComputedStyle(i).transform).a, animations: i.getAnimations().length }));
  await expect.poll(async () => (await left()).scale, { timeout: 5000, message: "the bar has begun to fill" }).toBeGreaterThan(0.2);
  expect((await left()).animations, "by steps, not an animation").toBe(0);
});

test("the last seconds are a number at the right end of the line, and the line is red", async ({ page }) => {
  await blitz(page, 3000);
  await page.goto("/");
  await ready(page);
  await expect(clock(page)).not.toHaveClass(/low/);
  await expect(page.locator("#path .pclock.low")).toBeVisible({ timeout: 4000 });
  await expect(page.locator("#path .pclk-s")).toHaveText(/^[12]$/);
});

test("the beat of the last seconds speeds up in two steps", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await blitz(page, 6000);
  await page.goto("/");
  await ready(page);
  // the beat's length is watched as the clock runs down: calm, quicker, quickest
  await page.evaluate(() => { window.__beats = []; setInterval(() => { const c = document.querySelector("#path .pclock.low"); if (!c) return; const d = getComputedStyle(c).animationDuration; if (window.__beats.at(-1) !== d) window.__beats.push(d); }, 40); });
  await expect.poll(() => page.evaluate(() => window.__beats.length), { timeout: 9000, message: "all three beats were seen" }).toBeGreaterThanOrEqual(3);
  expect(await page.evaluate(() => window.__beats.slice(0, 3))).toEqual(["0.9s", "0.55s", "0.34s"]);
});
