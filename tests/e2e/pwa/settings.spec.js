// The practice options and Settings. What changes how an exercise looks, ticks or is checked opens from the exercise (the sliders button at the top: a sheet from
// the bottom of a phone, a popover on a wide screen); each option with its own page. Settings (from the menu) keeps what belongs to the app, the device and the account.
import { test, expect } from "../../support/test.js";
import { goTo, isPhone, openSettings, ready } from "../../support/page.js";

const hook = () => { window.__riglamTest = (t) => { window.__t = t; }; };
const blitz = () => { localStorage.setItem("rd-blitz", "1"); localStorage.setItem("rd-timer-rel", "2000"); localStorage.setItem("rd-timer", "2000"); };
const sessBtn = (page) => page.locator("#msess");
const AI = ["check every answer with ai", "several models explain"]; // there when the tutor can answer
const names = (page) => page.locator("#over .ocard .om > b, #over .sw .swl").allInnerTexts().then((t) => t.map((s) => s.trim().toLowerCase()).filter((s) => !AI.includes(s)));
const sections = (page) => page.locator("#over .grp").allInnerTexts().then((t) => t.map((s) => s.trim().toLowerCase()).filter((s) => s !== "ai tutor"));
const rowNames = (page) => page.locator("#over .orow .tl").allInnerTexts().then((t) => t.map((s) => s.trim().toLowerCase()));
const level = (page) => page.evaluate(() => (history.state && history.state.riglamNav) || 0);
const base = (testInfo) => (isPhone(testInfo) ? 1 : 0); // a phone has the menu under the exercise

test("the sliders button opens the practice options of the exercise and the X closes them", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await expect(sessBtn(page)).toHaveAccessibleName("Practice options");
  await sessBtn(page).click();
  const sheet = page.locator("#over");
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute("aria-label", "Practice options");
  await expect(sheet.locator(".shh h2")).toHaveText("Practice options");
  await expect(sheet.locator(".shh small")).toHaveCount(0); // the exercise is not a subtitle of the sheet: what only it has is a section
  expect(await names(page)).toEqual(["notation", "blitz times", "a/b markers", "definitions"]);
  expect(await sections(page)).toEqual([]); // Relations has nothing of its own yet
  await page.locator("#over .oc").click();
  await expect(sheet).toBeHidden();
  await expect(sessBtn(page)).toBeFocused();
  // Escape does the same
  await sessBtn(page).click();
  await expect(sheet).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

test("each exercise lists what it uses; Review has no practice options", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await sessBtn(page).click();
  expect(await names(page)).toEqual(["wording of the questions", "full phrases", "notation", "blitz times", "a/b markers", "definitions"]);
  expect(await sections(page)).toEqual(["pervasions", "every exercise"]); // what only Pervasions has, then what every exercise has
  await page.keyboard.press("Escape");
  await goTo(page, "Find a pair");
  await sessBtn(page).click();
  expect(await names(page)).toEqual(["suggest terms", "notation", "a/b markers", "definitions"]);
  expect(await sections(page)).toEqual(["find a pair", "every exercise"]);
  await page.keyboard.press("Escape");
  await goTo(page, "Review");
  await expect(sessBtn(page)).toBeHidden();
});

test("a choice made in the sheet shows at once under it and is kept", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await sessBtn(page).click();
  await page.locator("#over .ocard .seg").first().getByRole("button", { name: "Sets" }).click();
  await expect(page.locator("#over")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("rd-notation"))).toBe("sets");
  await expect(page.locator("#over .ocard .seg").first().getByRole("button", { name: "Sets" })).toHaveAttribute("aria-pressed", "true");
  await page.locator("#over .oc").click();
  await expect(page.locator("#over")).toBeHidden();
});

test("an option's chevron opens its page, where each choice says what it means; Back returns to the list", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await sessBtn(page).click();
  await page.getByRole("button", { name: "Notation: details" }).click();
  await expect(page.locator("#over .shh h2")).toHaveText("Notation");
  await expect(page.locator("#over .shh small")).toHaveText("Practice options");
  await expect(page.locator("#over .pick")).toHaveCount(3);
  await expect(page.locator("#over")).toContainText(/mutually exclusive/);
  await page.locator("#over .pick", { hasText: "Logic" }).click();
  expect(await page.evaluate(() => localStorage.getItem("rd-notation"))).toBe("logic");
  await expect(page.locator("#over .pick", { hasText: "Logic" })).toHaveAttribute("aria-pressed", "true");
  await page.locator("#over .ob").click();
  await expect(page.locator("#over .shh h2")).toHaveText("Practice options");
  await expect(page.locator("#over .ocard .seg").first().getByRole("button", { name: "Logic" })).toHaveAttribute("aria-pressed", "true");
  // Escape goes from a page to the list, and from the list to the exercise
  await page.getByRole("button", { name: "Definitions: details" }).click();
  await expect(page.locator("#over .shh h2")).toHaveText("Definitions");
  await page.keyboard.press("Escape");
  await expect(page.locator("#over .shh h2")).toHaveText("Practice options");
  await page.keyboard.press("Escape");
  await expect(page.locator("#over")).toBeHidden();
});

test("Settings keeps the device and the account, not the practice options", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await openSettings(page);
  await expect(page.locator("#over")).toBeVisible();
  await expect(page.locator("#over")).toHaveAttribute("aria-label", "Settings");
  await expect(page.locator("#over .oh h2")).toHaveText("Settings");
  const rows = await rowNames(page);
  for (const gone of ["notation", "questions", "definitions", "show", "relation time", "example time", "ai tutor"]) expect(rows).not.toContain(gone);
  await expect(page.locator("#over")).toContainText(/Practice options/);
  // the back arrow returns to the exercise
  await page.locator("#over .oc").click();
  await expect(page.locator("#over")).toBeHidden();
  await expect(page.locator("#stage .head .pair")).toBeVisible();
});

test("the system Back closes a page, then the sheet, then the exercise's level", async ({ page }, testInfo) => {
  await page.goto("/");
  await ready(page);
  const b = base(testInfo);
  await expect.poll(() => level(page)).toBe(b);
  await sessBtn(page).click();
  await expect.poll(() => level(page)).toBe(b + 1);
  await page.getByRole("button", { name: "Blitz times: details" }).click();
  await expect.poll(() => level(page)).toBe(b + 2);
  await page.goBack();
  await expect(page.locator("#over .shh h2")).toHaveText("Practice options");
  await expect.poll(() => level(page)).toBe(b + 1);
  await page.goBack();
  await expect(page.locator("#over")).toBeHidden();
  await expect(page.locator("#stage .head .pair")).toBeVisible();
  await expect.poll(() => level(page)).toBe(b);
});

test("the Blitz clock stands still behind the practice options and starts again when they close", async ({ page }) => {
  await page.addInitScript(hook);
  await page.addInitScript(blitz);
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await expect.poll(() => page.evaluate(() => window.__t.ui.debate)).toBe(true);
  await sessBtn(page).click();
  await page.waitForTimeout(3000); // longer than the 2 s limit
  expect(await page.evaluate(() => window.__t.ui.step)).toBe(0);
  await page.locator("#over .oc").click();
  await expect(page.locator("#over")).toBeHidden();
  expect(await page.evaluate(() => window.__t.ui.step)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.__t.ui.step), { timeout: 6000 }).toBeGreaterThan(0);
});

test("a Blitz time set on its page is stored for its own countdown", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await sessBtn(page).click();
  await expect(page.locator("#over .ocard", { hasText: "Blitz times" })).toContainText(/Relation \d+ s · Example \d+ s/);
  await page.getByRole("button", { name: "Blitz times: details" }).click();
  await page.locator("#over .orow", { hasText: "Relation time" }).getByRole("button", { name: "30 s", exact: true }).click();
  await page.locator("#over .orow", { hasText: "Example time" }).getByRole("button", { name: "5 s", exact: true }).click();
  expect(await page.evaluate(() => [localStorage.getItem("rd-timer-rel"), localStorage.getItem("rd-timer")])).toEqual(["30000", "5000"]);
  await page.locator("#over .ob").click();
  await expect(page.locator("#over .ocard", { hasText: "Blitz times" })).toContainText("Relation 30 s · Example 5 s");
});

test("a custom Blitz time is stored on leaving the field, and Escape drops what was typed and goes back one level", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await ready(page);
  await sessBtn(page).click();
  await page.getByRole("button", { name: "Blitz times: details" }).click();
  const field = page.locator("#over .orow", { hasText: "Example time" }).locator(".tcustom");
  await field.fill("7");
  await field.press("Tab");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("rd-timer"))).toBe("7000");
  await field.fill("99");
  await field.press("Escape");
  await expect(page.locator("#over .shh h2")).toHaveText("Practice options"); // one level back: the page is closed, the sheet is not
  expect(await page.evaluate(() => localStorage.getItem("rd-timer"))).toBe("7000");
  await page.getByRole("button", { name: "Blitz times: details" }).click();
  await expect(field).toHaveValue("7");
  expect(errors).toEqual([]);
});

test("the A/B markers and Full phrases switches are kept", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await sessBtn(page).click();
  const sw = page.getByRole("switch", { name: /A\/B markers/ });
  const was = await sw.getAttribute("aria-checked");
  await sw.click();
  await expect(sw).not.toHaveAttribute("aria-checked", was);
  expect(await page.evaluate(() => localStorage.getItem("rd-ab"))).toBe(was === "true" ? "0" : "1");
});
