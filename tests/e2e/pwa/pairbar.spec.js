// The pair bar at the foot of an exercise (src/app/shell/pbar.js): Skip and the star at the left, the forward button (Next cell, Check, Next pair) at the right. A skip
// after part of a pair is answered asks first; the key N goes on to the next pair, and the focus after Check goes where the next step is. The Blitz countdown is not on
// this bar but on the lower edge of the top bar (the test of Blitz below).
import { test, expect } from "../../support/test.js";
import { ready, relOptions, isPhone, goTo } from "../../support/page.js";

const hook = () => { window.__riglamTest = (t) => { window.__t = t; }; };
const ORDER = { mi: 0, "3ab": 1, "3ba": 2, 4: 3, con: 4 };
const bar = (page) => page.locator("#stage .pbar");
const fwd = (page) => page.locator("#stage .pbar .fwd");
const pairOf = (page) => page.evaluate(() => { const p = window.__t.cur.p; return p.a + " / " + p.b; });
/** The relation of the pair on screen, picked. */
async function pickRight(page) {
  const rel = await page.evaluate(() => window.__t.cur.p.relation);
  await relOptions(page).nth(ORDER[rel]).click();
}
/** Types into the first cell on screen. */
async function typeFirst(page, testInfo) {
  const field = isPhone(testInfo) ? page.locator("#cin") : page.locator(".cell input:not([disabled])").first();
  await field.fill("something");
}
/** Fills every cell the relation leaves open and asks for the result. */
async function checkAll(page, testInfo) {
  if (isPhone(testInfo)) {
    for (let i = 0; i < 4 && (await page.locator("#cin").isVisible()); i++) { await page.fill("#cin", "thing " + (i + 1)); await fwd(page).click(); }
  } else {
    const ids = await page.locator(".cell input:not([disabled])").evaluateAll((a) => a.map((x) => x.id));
    for (const id of ids) await page.fill("#" + id, "thing");
    await fwd(page).click();
  }
  await expect.poll(() => page.evaluate(() => window.__t.ui.checked)).toBe(true);
}

test("the pair bar is at the foot: Skip and the star at the left, the forward button at the right", async ({ page }, testInfo) => {
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  await expect(bar(page)).toBeVisible();
  await expect(bar(page).locator(".skipw")).toBeVisible();
  await expect(bar(page).locator(".starb")).toBeVisible();
  const vh = page.viewportSize().height;
  const b = await bar(page).boundingBox();
  expect(Math.abs(b.y + b.height - vh)).toBeLessThanOrEqual(2);
  await pickRight(page);
  await expect(fwd(page)).toBeVisible();
  const [s, f] = await Promise.all([bar(page).locator(".skipw").boundingBox(), fwd(page).boundingBox()]);
  expect(f.x).toBeGreaterThan(s.x + s.width);
  expect(f.x + f.width).toBeGreaterThan(b.x + b.width - 40);
  if (isPhone(testInfo)) await expect(fwd(page)).toHaveText(/Next cell|Check/);
});

test("the forward button says Next cell until the last cell, then Check, then Next pair", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the cells are one at a time on a phone");
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  await pickRight(page);
  const labels = [];
  for (let i = 0; i < 4 && (await page.locator("#cin").isVisible()); i++) {
    labels.push((await fwd(page).textContent()).trim()); // innerText would be the capitals the buttons are drawn in
    await page.fill("#cin", "thing " + (i + 1));
    await fwd(page).click();
  }
  expect(labels.length).toBeGreaterThan(1);
  expect(labels.slice(0, -1)).toEqual(Array(labels.length - 1).fill("Next cell"));
  expect(labels.at(-1)).toBe("Check");
  await expect.poll(() => page.evaluate(() => window.__t.ui.checked)).toBe(true);
  await expect(fwd(page)).toHaveText("Next pair");
  // the focus is on it, so that Enter goes on
  await expect(fwd(page)).toBeFocused();
});

test("a skip after part of a pair is answered asks first; Keep going keeps what was typed, Skip anyway sets the pair aside and Undo gives it back", async ({ page }, testInfo) => {
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  const pair = await pairOf(page);
  await pickRight(page);
  await typeFirst(page, testInfo);
  await bar(page).locator(".skipw").click();
  const dlg = page.getByRole("alertdialog");
  await expect(dlg).toBeVisible();
  await expect(dlg).toContainText("Skip this pair?");
  await expect(dlg.getByRole("button", { name: "Keep going" })).toBeFocused();
  // Keep going, and Escape, leave everything as it was
  await dlg.getByRole("button", { name: "Keep going" }).click();
  await expect(dlg).toBeHidden();
  expect(await pairOf(page)).toBe(pair);
  await bar(page).locator(".skipw").click();
  await page.keyboard.press("Escape");
  await expect(dlg).toBeHidden();
  expect(await pairOf(page)).toBe(pair);
  expect(await page.evaluate(() => window.__t.ui.cells.both.t || window.__t.ui.cells.anb.t || window.__t.ui.cells.bna.t || window.__t.ui.cells.nei.t)).toBe("something");
  // Skip anyway: another pair, the note with Undo in the bar, and the skipped pair waits in Review
  await bar(page).locator(".skipw").click();
  await dlg.getByRole("button", { name: "Skip anyway" }).click();
  await expect(dlg).toBeHidden();
  expect(await pairOf(page)).not.toBe(pair);
  await expect(bar(page).locator(".pnote")).toBeVisible();
  expect(await page.evaluate(() => Object.keys(window.__t.skips).length)).toBe(1);
  await bar(page).getByRole("button", { name: "Undo" }).click();
  expect(await pairOf(page)).toBe(pair);
  expect(await page.evaluate(() => Object.keys(window.__t.skips).length)).toBe(0);
});


test("behind the question before a skip the exercise cannot be reached by the keyboard; Escape gives it back", async ({ page }, testInfo) => {
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  await pickRight(page);
  await typeFirst(page, testInfo);
  await bar(page).locator(".skipw").click();
  const dlg = page.getByRole("alertdialog");
  await expect(dlg.getByRole("button", { name: "Keep going" })).toBeFocused();
  const behind = page.locator("#app > .col > main.work");
  await expect(behind).toHaveJSProperty("inert", true);
  await expect(page.locator("#app > .col > header.mbar")).toHaveJSProperty("inert", true);
  // Shift+Tab and Tab go round the question (and out to the browser's controls), never to the Check or Skip button behind it
  for (let i = 0; i < 8; i++) {
    await page.keyboard.press(i % 2 ? "Tab" : "Shift+Tab");
    expect(await page.evaluate(() => !!document.activeElement.closest("main.work, header.mbar"))).toBe(false);
  }
  await page.keyboard.press("Escape");
  await expect(dlg).toBeHidden();
  await expect(behind).toHaveJSProperty("inert", false);
  await expect(page.locator("#app > .col > header.mbar")).toHaveJSProperty("inert", false);
});

test("a pair only drawn is skipped at once, with the note and Undo and no question", async ({ page }) => {
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  const pair = await pairOf(page);
  await bar(page).locator(".skipw").click();
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  expect(await pairOf(page)).not.toBe(pair);
  await expect(bar(page).locator(".pnote")).toContainText(/skipped/i);
  await bar(page).getByRole("button", { name: "Undo" }).click();
  expect(await pairOf(page)).toBe(pair);
});

test("Blitz is the stopwatch in the top bar; its countdown runs along the lower edge of the top bar, over its line", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  const sw = page.locator("#mbz"), mbt = page.locator("#mbar .mbt");
  const stageTop = () => page.locator("#stage").evaluate((n) => n.getBoundingClientRect().top);
  await expect(sw).toHaveAttribute("role", "switch");
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(mbt).toHaveCount(0);
  const top = await stageTop();
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(mbt).toBeVisible();
  // over the bar's line, across its whole width; nothing under it moves, and the pair bar has no countdown of its own
  const [h, b] = await Promise.all([page.locator("#mbar").boundingBox(), mbt.boundingBox()]);
  expect(b.x).toBeCloseTo(h.x, 0);
  expect(b.width).toBeCloseTo(h.width, 0);
  expect(b.y).toBeLessThan(h.y + h.height - 1.5);
  expect(b.y + b.height).toBeGreaterThanOrEqual(h.y + h.height);
  expect(await stageTop()).toBe(top);
  await expect(bar(page).locator(".tbar")).toHaveCount(0);
  // Review has no countdown: the clock waits behind it and runs again, with its full time, when it is left
  await goTo(page, "Review");
  await expect(mbt).toHaveCount(0);
  await page.locator("#mback").click();
  await expect(mbt).toBeVisible();
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(mbt).toHaveCount(0);
  expect(await stageTop()).toBe(top);
});

test("on a wide screen the result stays in the middle, the key N goes on, and the focus is on the result", async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo), "the wide layout's");
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  const pair = await pairOf(page);
  await pickRight(page);
  await checkAll(page, testInfo);
  await expect(page.locator("#stage .verdict")).toBeVisible();
  await expect(page.locator("#coach")).toBeHidden(); // the tutor's panel opens only on a request
  await expect(fwd(page)).toHaveText(/Next pair/);
  await expect(fwd(page).locator(".kbd")).toHaveText("N");
  await expect(page.locator("#stage")).toBeFocused();
  await page.keyboard.press("n");
  await expect.poll(() => pairOf(page)).not.toBe(pair);
});

const tutorOn = (page) => page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, tutor: "on" }) }));

test("the tutor's chat button waits for a result: it opens nothing until the pair is checked", async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo), "the phone's chat is a drawer (tutor.spec.js)");
  await tutorOn(page);
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#mchat")).toBeVisible();
  await expect(page.locator("#mchat")).toBeDisabled();
  await expect(page.locator("#coach")).toBeHidden();
  await pickRight(page);
  await checkAll(page, testInfo);
  await expect(page.locator("#mchat")).toBeEnabled();
  await page.locator("#mchat").click();
  await expect(page.locator("#coach")).toBeVisible();
  await page.locator("#mchat").click();
  await expect(page.locator("#coach")).toBeHidden();
});

test("where the tutor cannot answer, a wide screen's button is the recent answers, not a chat, and it is always there to press", async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo), "a phone has no panel beside the exercise, and no button without a tutor");
  await page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, tutor: "off" }) }));
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  const b = page.locator("#mchat");
  await expect(b).toHaveAccessibleName("Recent answers");
  await expect(b).toBeEnabled();
  expect(await b.evaluate((n) => n.innerHTML)).not.toContain("M3 3h11v7"); // not the bubbles of the chat icon
  await b.click();
  await expect(page.locator("#coach")).toBeVisible();
  await expect(page.locator("#coach")).toContainText("next cell"); // nothing answered yet: the key hints
  // pressed, the clock is drawn heavier and stays an outline (an open arc filled is a blob)
  await expect(b).toHaveAttribute("aria-pressed", "true");
  const paint = () => b.locator("svg").evaluate((n) => [getComputedStyle(n).fill, getComputedStyle(n.querySelector("path")).fill, parseFloat(getComputedStyle(n).strokeWidth)]);
  const [fill, pathFill, weight] = await paint();
  expect([fill, pathFill]).toEqual(["none", "none"]);
  await b.click(); // closed again: the lighter line
  expect((await paint())[2]).toBeLessThan(weight);
  await b.click();
  await pickRight(page);
  await checkAll(page, testInfo);
  await page.locator("#stage .pbar .fwd").click(); // the next pair: there is no chat to close, the panel stays for as long as it is wanted
  await expect(page.locator("#coach")).toBeVisible();
  await expect(page.locator("#coach")).toContainText("Recent");
});

test("with a tutor the panel closes with its pair: the next pair never starts with a chat panel that holds only the recent answers", async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo), "the phone's chat is a drawer");
  await tutorOn(page);
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  await pickRight(page);
  await checkAll(page, testInfo);
  await page.locator("#mchat").click();
  await expect(page.locator("#coach")).toBeVisible();
  await page.locator("#stage .pbar .fwd").click(); // Next pair
  await expect(page.locator("#coach")).toBeHidden();
  await expect(page.locator("#mchat")).toBeDisabled();
});
