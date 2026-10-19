// The bars and the settings. The tab bar (Practice, Review, Options) is on every phone screen, also while a field is in use and under Options.
// What changes how an exercise looks or ticks opens from the exercise (the sliders button); Options keeps what belongs to the device and the account.
import { test, expect } from "../../support/test.js";
import { goTo, isPhone, ready, relOptions } from "../../support/page.js";

const hook = () => { window.__riglamTest = (t) => { window.__t = t; }; };
const blitz = () => { localStorage.setItem("rd-blitz", "1"); localStorage.setItem("rd-timer-rel", "2000"); localStorage.setItem("rd-timer", "2000"); };
const settingsBtn = (page, name = "Relations") => page.getByRole("button", { name: "Settings for " + name });
const rowNames = (page) => page.locator("#over .orow .tl").allInnerTexts().then((t) => t.map((s) => s.trim().toLowerCase()));
const level = (page) => page.evaluate(() => (history.state && history.state.riglamNav) || 0);

test("the tab bar stays while a field is in use", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the tab bar is the phone's");
  await page.goto("/");
  await ready(page);
  await relOptions(page).first().click();
  await page.locator("#stage input").first().focus();
  await expect(page.locator("html")).toHaveClass(/typing/);
  await expect(page.locator("#tabbar")).toBeVisible();
  await expect(page.locator('#tabbar [data-go="home"]')).toHaveAttribute("aria-current", "page");
  // lower than at rest, so that more of the exercise shows above the keyboard
  const h = await page.locator("#tabbar").evaluate((n) => n.getBoundingClientRect().height);
  expect(h).toBeLessThan(56);
});

test("Options is a place of the tab bar: the bar stays under it and marks it", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the tab bar is the phone's");
  await page.goto("/");
  await ready(page);
  await page.locator("#mopt").click();
  await expect(page.locator("#over")).toBeVisible();
  await expect(page.locator("#tabbar")).toBeVisible();
  const [over, bar] = await page.evaluate(() => ["over", "tabbar"].map((id) => { const r = document.getElementById(id).getBoundingClientRect(); return [r.top, r.bottom]; }));
  expect(over[1]).toBeLessThanOrEqual(bar[0] + 1);
  await expect(page.locator("#tabbar [aria-current]")).toHaveCount(0);
  await expect(page.locator("#mopt")).toHaveAttribute("aria-expanded", "true");
  // a tap on the marked item stays; another item leaves Options
  await page.locator("#mopt").click();
  await expect(page.locator("#over")).toBeVisible();
  await page.locator('#tabbar [data-go="review"]').click();
  await expect(page.locator("#over")).toBeHidden();
  await expect(page.locator('#tabbar [data-go="review"]')).toHaveAttribute("aria-current", "page");
});

test("the sliders button opens the settings of the exercise and Done closes them", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await settingsBtn(page).click();
  const sheet = page.locator("#over");
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute("aria-label", "Relations settings");
  expect(await rowNames(page)).toEqual(["notation", "definitions", "show", "relation time", "example time", "more"]);
  await page.locator("#over .oc").click();
  await expect(sheet).toBeHidden();
  await expect(settingsBtn(page)).toBeFocused();
  // Escape does the same
  await settingsBtn(page).click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

test("Pervasions adds the wording of its questions; Home and Review have no settings button", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".exr").first()).toBeEnabled();
  await expect(page.getByRole("button", { name: /^Settings for/ })).toHaveCount(0);
  await ready(page);
  await goTo(page, "Pervasions");
  await settingsBtn(page, "Pervasions").click();
  expect(await rowNames(page)).toEqual(["notation", "questions", "definitions", "show", "relation time", "example time", "more"]);
  await page.keyboard.press("Escape");
  await goTo(page, "Review");
  await expect(page.getByRole("button", { name: /^Settings for/ })).toHaveCount(0);
});

test("a setting changed in the sheet shows at once under it and is kept", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await settingsBtn(page).click();
  await page.locator("#over .seg").first().getByRole("button", { name: "Sets" }).click();
  await expect(page.locator("#over")).toBeVisible();
  await expect(page.locator("#over")).toContainText(/intersection/);
  expect(await page.evaluate(() => localStorage.getItem("rd-notation"))).toBe("sets");
  await page.locator("#over .oc").click();
  await expect(page.locator("#over")).toBeHidden();
});

test("Options keeps the device and the account, not the settings of an exercise", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: /options/i }).filter({ visible: true }).first().click();
  await expect(page.locator("#over")).toBeVisible();
  const rows = await rowNames(page);
  for (const gone of ["notation", "questions", "definitions", "show", "relation time", "example time", "ai tutor"]) expect(rows).not.toContain(gone);
  await expect(page.locator("#over")).toContainText(/set in the exercise/i);
});

test("the system Back closes the settings, then the exercise", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await expect.poll(() => level(page)).toBe(1);
  await settingsBtn(page).click();
  await expect.poll(() => level(page)).toBe(2);
  await page.goBack();
  await expect(page.locator("#over")).toBeHidden();
  await expect(page.locator("#stage .head .pair")).toBeVisible();
  await expect.poll(() => level(page)).toBe(1);
  await page.goBack();
  await expect(page.locator('.exr[data-go="practice"]')).toBeVisible();
});

test("the Blitz clock stands still behind the settings and starts again when they close", async ({ page }) => {
  await page.addInitScript(hook);
  await page.addInitScript(blitz);
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await expect.poll(() => page.evaluate(() => window.__t.ui.debate)).toBe(true);
  await settingsBtn(page, "Pervasions").click();
  await page.waitForTimeout(3000); // longer than the 2 s limit
  expect(await page.evaluate(() => window.__t.ui.step)).toBe(0);
  await page.locator("#over .oc").click();
  await expect(page.locator("#over")).toBeHidden();
  expect(await page.evaluate(() => window.__t.ui.step)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__t.ui.step), { timeout: 6000 }).toBeGreaterThan(0);
});

test("a Blitz time set in the sheet is stored for its own countdown", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await settingsBtn(page).click();
  await page.locator("#over .orow", { hasText: "Relation time" }).getByRole("button", { name: "30 s", exact: true }).click();
  await page.locator("#over .orow", { hasText: "Example time" }).getByRole("button", { name: "5 s", exact: true }).click();
  expect(await page.evaluate(() => [localStorage.getItem("rd-timer-rel"), localStorage.getItem("rd-timer")])).toEqual(["30000", "5000"]);
});
