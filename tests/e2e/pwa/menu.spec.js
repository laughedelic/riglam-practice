// The menu: where you are and where else you can go. The app opens on the exercise; the menu lists today's line (it opens Review), the exercises (a
// "continue" tag on one whose attempt waits), Review and Settings. A drawer over the exercise on a phone (the system Back from the exercise opens it); on a
// wide screen a panel the menu button pins beside the exercise, which also peeks from the left edge.
import { test, expect } from "../../support/test.js";
import { goTo, openMenu, ready, relOptions, isPhone, overflow } from "../../support/page.js";

const hook = () => { window.__riglamTest = (t) => { window.__t = t; }; };
const row = (page, k) => page.locator(`#menu .mrow[data-go="${k}"]`);
const pairOf = (page) => page.evaluate(() => { const p = window.__t.cur.p; return p.a + " / " + p.b; });
const level = (page) => page.evaluate(() => (history.state && history.state.riglamNav) || 0);
const menuState = (page) => page.locator("#app").getAttribute("data-menu");

test("the app opens on the exercise, with a menu button and no tab bar", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#mttl")).toHaveText("Relations");
  await expect(page.locator("#menubtn")).toBeVisible();
  await expect(page.locator("#menubtn")).toHaveAccessibleName(/menu/i);
  await expect(page.locator("#tabbar, #tabs, .rail")).toHaveCount(0);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("the menu has today's line, one row per exercise, Review and Settings", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await openMenu(page);
  await expect(page.locator("#menu .mtoday")).toContainText(/today/i);
  await expect(page.locator("#menu .mtoday")).toContainText(/nothing practiced yet/i);
  await expect(page.locator("#menu .mrow")).toHaveText([/Relations/, /Pervasions/, /Find a pair/]);
  await expect(page.locator("#menu .mrow .cont")).toHaveCount(0);
  await expect(row(page, "practice")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#menu .fbtn")).toHaveText(["Review", "Settings"]);
  await expect(page.locator("#menu .ver")).toContainText(/^v\d/);
  // no Magic Key on this device in the plain test; with the key stored (this test) the key button is not there
  await expect(page.locator("#menu .keyb")).toHaveCount(0);
});

test("a phone's menu is a drawer: the scrim, Escape and a choice close it", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the drawer is the phone's");
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#menu")).toBeHidden();
  await page.locator("#menubtn").click();
  await expect(page.locator("#menu")).toBeVisible();
  expect(await menuState(page)).toBe("open");
  await expect(page.locator("#menubtn")).toHaveAttribute("aria-expanded", "true");
  await page.mouse.click(400, 400); // on the scrim, right of the drawer
  await expect(page.locator("#menu")).toBeHidden();
  await page.locator("#menubtn").click();
  await page.keyboard.press("Escape");
  await expect(page.locator("#menu")).toBeHidden();
  await expect(page.locator("#menubtn")).toBeFocused();
  // a choice closes it and the screen takes the exercise's name
  await page.locator("#menubtn").click();
  await row(page, "debate").click();
  await expect(page.locator("#menu")).toBeHidden();
  await expect(page.locator("#mttl")).toHaveText("Pervasions");
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("a wide screen's menu is pinned open by the menu button, kept across a reload, and peeks from the left edge", async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo), "the panel is the wide screen's");
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#menu")).toBeHidden();
  // resting on the strip at the left edge shows it over the exercise; leaving takes it away
  await page.mouse.move(30, 400); // onto the strip (inside the red band): the panel then covers it, so the pointer is moved, not "hovered"
  await expect(page.locator("#menu")).toBeVisible();
  expect(await menuState(page)).toBe("peek");
  await expect(page.locator("#menu .mclose")).toHaveCount(1); // the peeking panel covers the menu button, so it has a button of its own
  await page.mouse.move(700, 400);
  await expect(page.locator("#menu")).toBeHidden();
  // the button pins it beside the exercise
  await page.locator("#menubtn").click();
  expect(await menuState(page)).toBe("pinned");
  await expect(page.locator("#menu")).toBeVisible();
  const [menuRight, stageLeft] = await page.evaluate(() => [document.getElementById("menu").getBoundingClientRect().right, document.getElementById("stage").getBoundingClientRect().left]);
  expect(stageLeft).toBeGreaterThanOrEqual(menuRight - 1);
  await page.reload();
  await ready(page);
  await expect(page.locator("#menu")).toBeVisible();
  // beside the exercise it has no close button of its own: the menu button, which is not covered, does that
  await expect(page.locator("#menu .mclose")).toHaveCount(0);
  await page.locator("#menubtn").click();
  await expect(page.locator("#menu")).toBeHidden();
  await page.reload();
  await ready(page);
  await expect(page.locator("#menu")).toBeHidden();
});

test("an attempt begun and left says continue on its row and comes back as it was", async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  const pair = await pairOf(page);
  await relOptions(page).first().click();
  await goTo(page, "Pervasions");
  await openMenu(page);
  await expect(row(page, "practice").locator(".cont")).toHaveText(/continue/i);
  await expect(row(page, "debate").locator(".cont")).toHaveCount(0);
  await row(page, "practice").click();
  expect(await pairOf(page)).toBe(pair);
  expect(await page.evaluate(() => !!window.__t.ui.rel)).toBe(true);
  // a pair only drawn is not an attempt: Pervasions opened and left without an answer has no continue
  await goTo(page, "Pervasions");
  await expect.poll(() => page.evaluate(() => window.__t.tab)).toBe("debate");
  await goTo(page, "Relations");
  await openMenu(page);
  await expect(row(page, "debate").locator(".cont")).toHaveCount(0);
});

test("on a phone the system Back from the exercise opens the menu and keeps the attempt; Back from the menu leaves the app", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the menu is the phone's root");
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  await expect.poll(() => level(page)).toBe(1);
  const pair = await pairOf(page);
  await relOptions(page).first().click();
  await page.goBack();
  await expect(page.locator("#menu")).toBeVisible();
  await expect.poll(() => level(page)).toBe(0);
  await expect(row(page, "practice")).toHaveAttribute("aria-current", "page");
  await row(page, "practice").click();
  expect(await pairOf(page)).toBe(pair);
  await expect.poll(() => level(page)).toBe(1);
  await page.goBack();
  await expect(page.locator("#menu")).toBeVisible();
  await page.goBack();
  await expect.poll(() => page.url()).toBe("about:blank");
});

test("a wide screen has no menu step: Back from the exercise leaves the app", async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo), "the wide screen's");
  await page.goto("/");
  await ready(page);
  await expect.poll(() => level(page)).toBe(0);
  await page.goBack();
  await expect.poll(() => page.url()).toBe("about:blank");
});

test("on a phone a reload keeps its history entry instead of adding one", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the menu is the phone's root");
  await page.goto("/");
  await ready(page);
  const entries = () => page.evaluate(() => history.length);
  const before = await entries();
  await page.reload();
  await ready(page);
  expect(await entries(), "a reload leaves the history as long as it was").toBe(before);
  await expect.poll(() => level(page)).toBe(1);
  await page.goBack();
  await expect(page.locator("#menu")).toBeVisible();
  await page.goBack();
  await expect.poll(() => page.url()).toBe("about:blank");
});

test("the phone's drawer is a modal: the exercise behind it is out of reach until it closes", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the drawer is the phone's");
  await page.goto("/");
  await ready(page);
  const behind = page.locator("#app > .col");
  await expect(behind).toHaveJSProperty("inert", false);
  await page.locator("#menubtn").click();
  await expect(page.locator("#menu")).toHaveAttribute("role", "dialog");
  await expect(page.locator("#menu")).toHaveAttribute("aria-modal", "true");
  await expect(behind).toHaveJSProperty("inert", true);
  // Tab goes round the menu (and out to the browser's own controls) but never into the exercise
  for (let i = 0; i < 14; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement.closest("#app > .col"))).toBe(false);
  }
  await page.locator("#menu .mclose").click();
  await expect(page.locator("#menu")).toBeHidden();
  await expect(behind).toHaveJSProperty("inert", false);
  await expect(page.locator("#menubtn")).toBeFocused();
});

test("on a wide screen the menu is not a modal: the exercise stays within reach", async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo), "the wide screen's");
  await page.goto("/");
  await ready(page);
  await openMenu(page);
  await expect(page.locator("#app > .col")).toHaveJSProperty("inert", false);
  await expect(page.locator("#menu")).not.toHaveAttribute("aria-modal", /.*/);
  await expect(page.locator("#menu")).not.toHaveAttribute("role", /.*/);
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
  // through the other exercise, back to the result
  await goTo(page, "Pervasions");
  await openMenu(page);
  await expect(row(page, "practice").locator(".cont")).toHaveText(/continue/i);
  await goTo(page, "Relations");
  expect(await pairOf(page)).toBe(pair);
  expect(await page.evaluate(() => window.__t.ui.checked)).toBe(true);
  // Next pair leaves it: a new pair, and nothing to continue
  await page.getByRole("button", { name: "Next pair" }).filter({ visible: true }).first().click();
  await expect.poll(() => pairOf(page)).not.toBe(pair);
  await openMenu(page);
  await expect(row(page, "practice").locator(".cont")).toHaveCount(0);
});

test("today's line opens Review; its back arrow returns to the exercise", async ({ page }, testInfo) => {
  await page.goto("/");
  await ready(page);
  await openMenu(page);
  await page.locator("#menu .mtoday").click();
  await expect(page.locator("#mttl")).toHaveText("Review");
  await expect(page.locator("#mback")).toBeVisible();
  await expect(page.locator("#mback")).toHaveAccessibleName(/back/i);
  if (isPhone(testInfo)) await expect(page.locator("#menubtn")).toBeHidden();
  else {
    // the menu button keeps its place at the left of the bar, the back arrow follows it, and the pinned menu adds no third button of the same kind
    const [m, b] = await Promise.all([page.locator("#menubtn").boundingBox(), page.locator("#mback").boundingBox()]);
    expect(m.x).toBeLessThan(b.x);
    await expect(page.locator("#menu .mclose")).toHaveCount(0);
  }
  await page.locator("#mback").click();
  await expect(page.locator("#mttl")).toHaveText("Relations");
  await expect(page.locator("#mback")).toBeHidden();
  await expect(page.locator("#stage .head .pair")).toBeVisible();
});

test("the last exercise is the one the app opens on", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await expect(page.locator("#mttl")).toHaveText("Pervasions");
  await page.reload();
  await expect(page.locator("#mttl")).toHaveText("Pervasions");
  await expect(page.locator("#stage")).toBeVisible();
});
