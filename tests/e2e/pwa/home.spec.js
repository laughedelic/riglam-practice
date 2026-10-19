// Home: the first screen lists the exercises under a line on today's practice. An exercise opens over it (a back arrow on a phone); an
// attempt begun and left is parked, "Continue" on its row, and comes back as it was. The system Back from an exercise goes Home.
import { test, expect } from "../../support/test.js";
import { goTo, ready, relOptions, isPhone, overflow } from "../../support/page.js";

const hook = () => { window.__riglamTest = (t) => { window.__t = t; }; };
const row = (page, k) => page.locator(`.exr[data-go="${k}"]`);
const pairOf = (page) => page.evaluate(() => { const p = window.__t.cur.p; return p.a + " / " + p.b; });

test("the app opens on Home: today's line and one row per exercise", async ({ page }, testInfo) => {
  await page.goto("/");
  await expect(row(page, "practice")).toBeEnabled();
  await expect(page.locator("#stage .hday")).toContainText(/today/i);
  await expect(page.locator("#stage .hday")).toContainText(/nothing practiced yet/i);
  await expect(page.locator(".exr")).toHaveText([/Relations/, /Pervasions/, /Find a pair/]);
  await expect(page.locator(".exr .exc")).toHaveCount(0);
  if (isPhone(testInfo)) {
    await expect(page.locator("#tabbar button")).toHaveText(["Practice", "Review", "Options"]);
    await expect(page.locator('#tabbar [data-go="home"]')).toHaveAttribute("aria-current", "page");
    await expect(page.locator("#mback")).toBeHidden();
  } else {
    await expect(page.locator('#tabs [data-go="home"]')).toHaveText("Practice");
    await expect(page.locator('#tabs [data-go="home"]')).toHaveAttribute("aria-current", "page");
  }
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("an exercise opens with its name and, on a phone, a back arrow to Home", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the top bar is the phone's");
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#mttl")).toHaveText("Relations");
  await expect(page.locator("#mback")).toBeVisible();
  await expect(page.locator("#mback")).toHaveAccessibleName("Back to Practice");
  // Home stays current in the tab bar: the exercise belongs to it
  await expect(page.locator('#tabbar [data-go="home"]')).toHaveAttribute("aria-current", "page");
  await page.locator("#mback").click();
  await expect(row(page, "practice")).toBeVisible();
  await expect(page.locator("#mback")).toBeHidden();
  // the focus comes back to the row of the exercise just left
  await expect(row(page, "practice")).toBeFocused();
});

test("an attempt begun and left says Continue on its row and comes back as it was", async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  const pair = await pairOf(page);
  await relOptions(page).first().click();
  await goTo(page, "Home");
  await expect(row(page, "practice").locator(".exc")).toHaveText(/continue/i);
  await expect(row(page, "debate").locator(".exc")).toHaveCount(0);
  await row(page, "practice").click();
  expect(await pairOf(page)).toBe(pair);
  expect(await page.evaluate(() => !!window.__t.ui.rel)).toBe(true);
  // a pair only drawn is not an attempt: Pervasions opened and left without an answer has no Continue
  await goTo(page, "Home");
  await row(page, "debate").click();
  await expect.poll(() => page.evaluate(() => window.__t.tab)).toBe("debate");
  await goTo(page, "Home");
  await expect(row(page, "debate").locator(".exc")).toHaveCount(0);
});

test("the system Back from an exercise goes to Home and keeps the attempt", async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  const pair = await pairOf(page);
  await relOptions(page).first().click();
  await page.goBack();
  await expect(row(page, "practice").locator(".exc")).toHaveText(/continue/i);
  await row(page, "practice").click();
  expect(await pairOf(page)).toBe(pair);
});

test("a result left open comes back as it was; Next pair moves on", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the answer flow is exercised in the phone layout");
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  const pair = await pairOf(page);
  await relOptions(page).first().click();
  for (let i = 0; i < 4 && (await page.locator("#cin").isVisible()); i++) {
    await page.fill("#cin", "thing " + (i + 1));
    await page.keyboard.press("Enter");
  }
  await expect.poll(() => page.evaluate(() => window.__t.ui.checked)).toBe(true);
  // through Home and the other exercise, back to the result
  await goTo(page, "Home");
  await expect(row(page, "practice").locator(".exc")).toHaveText(/continue/i);
  await goTo(page, "Pervasions");
  await goTo(page, "Relations");
  expect(await pairOf(page)).toBe(pair);
  expect(await page.evaluate(() => window.__t.ui.checked)).toBe(true);
  // Next pair leaves it: a new pair, and nothing to continue
  await page.getByRole("button", { name: "Next pair" }).filter({ visible: true }).first().click();
  await expect.poll(() => pairOf(page)).not.toBe(pair);
  await goTo(page, "Home");
  await expect(row(page, "practice").locator(".exc")).toHaveCount(0);
});
