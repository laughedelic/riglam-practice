// The stop of a course term (practice/stops.ts, src/domain/intro.ts): a category of the course is asked about only once a stop has shown its term,
// and the stop comes before the next question, on the classic page and on the Path. A device used before the stops has met the terms of its stages.
import { test, expect } from "../../support/test.js";
import { isPhone, ready, relOptions } from "../../support/page.js";
import { withCourse } from "../../support/data-key.js";

const hook = () => { window.__riglamTest = (t) => { window.__t = t; }; };
const onPath = () => { if (localStorage.getItem("rd-design") === null) localStorage.setItem("rd-design", "path"); };
// a device at stage 1 that has met no term yet, three questions in: the next pull brings the stop of Form
const fresh = () => { if (localStorage.getItem("rd-terms") === null) { localStorage.setItem("rd-stages", "1"); localStorage.setItem("rd-terms", JSON.stringify({ n: 3, next: 3, terms: {} })); } };
const ORDER = ["mi", "3ab", "3ba", "4", "con"];
const fwd = (page) => page.locator("#stage .pbar .fwd");
const station = (page) => page.locator("#stn");
const cats = (page) => page.evaluate(() => [window.__t.cur.p.catA, window.__t.cur.p.catB]);

/** The pair's own relation, anything in the cells it leaves possible, and the check (classic page). */
async function answerClassic(page, testInfo) {
  const rel = await page.evaluate(() => window.__t.cur.p.relation);
  await relOptions(page).nth(ORDER.indexOf(rel)).click();
  if (isPhone(testInfo)) {
    for (let i = 0; i < 4 && (await page.locator("#cin").isVisible()); i++) { await page.fill("#cin", "thing " + (i + 1)); await fwd(page).click(); }
  } else {
    const ids = await page.locator(".cell input:not([disabled])").evaluateAll((a) => a.map((x) => x.id));
    for (const id of ids) await page.fill("#" + id, "thing");
    await fwd(page).click();
  }
  await expect.poll(() => page.evaluate(() => window.__t.ui.checked)).toBe(true);
}

test("a new device meets Form at a stop before any pair asks about it, and Next goes on to the question", async ({ page }, testInfo) => {
  await page.addInitScript(fresh);
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  expect(await cats(page), "Form waits out of the pairs until its stop").not.toContain("form");
  await answerClassic(page, testInfo);
  expect(await page.evaluate(() => window.__t.intro.n)).toBe(4);
  await page.keyboard.press("n");
  const stop = page.locator("#stage .termstop");
  await expect(stop).toBeVisible();
  await expect(stop).toContainText("New term");
  await expect(stop).toContainText("stage 1");
  await expect(stop).toContainText("Form");
  if (withCourse) await expect(stop.locator(".ddef")).toBeVisible();
  await expect(page.locator("#stage .head .pair")).toHaveCount(0);
  expect(await page.evaluate(() => window.__t.intro.terms.form)).toMatchObject({ box: 1, shows: 1, at: 4 });
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("rd-terms")).terms.form.box)).toBe(1);
  await expect(fwd(page)).toBeFocused();
  await page.keyboard.press("n");
  await ready(page);
  await expect(stop).toHaveCount(0);
});

test("on the Path the stop is a station of its own, with the term and where it sits, and Next leads on", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(onPath);
  await page.addInitScript(fresh);
  await page.addInitScript(hook);
  await page.goto("/");
  const choices = page.locator("#path .chs .crow");
  await expect(choices).toHaveCount(5);
  expect(await cats(page)).not.toContain("form");
  const rel = await page.evaluate(() => window.__t.cur.p.relation);
  await choices.nth(ORDER.indexOf(rel)).click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (let i = 0; i < 4 && (await field.isVisible()); i++) { await field.fill("thing " + (i + 1)); if ((await field.getAttribute("enterkeyhint")) === "done") { await field.blur(); break; } await field.press("Enter"); }
  await expect(station(page)).toHaveAccessibleName(/^Check/);
  await station(page).click();
  await expect.poll(() => page.evaluate(() => window.__t.ui.checked)).toBe(true);
  await station(page).click();
  const stop = page.locator("#path .tstop");
  await expect(stop).toBeVisible();
  await expect(stop).toContainText("New term");
  await expect(stop.locator(".cs")).toHaveText("Form");
  await expect(stop.locator(".pdup")).toBeVisible();
  if (withCourse) await expect(stop.locator(".pdbody")).toBeVisible();
  await expect(station(page)).toHaveAccessibleName(/^Next/);
  await station(page).click();
  await expect(choices).toHaveCount(5);
  await expect(stop).toHaveCount(0);
});

test("a device used before the stops has met the terms of its stages: no stop comes", async ({ page }, testInfo) => {
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  const intro = await page.evaluate(() => window.__t.intro);
  expect(intro.terms.form).toMatchObject({ box: 3 });
  await answerClassic(page, testInfo);
  await page.keyboard.press("n");
  await ready(page);
  await expect(page.locator("#stage .termstop")).toHaveCount(0);
});
