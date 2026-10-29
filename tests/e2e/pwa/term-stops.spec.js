// The stop of a course term (practice/stops.ts, src/domain/intro.ts): on the Path a category of the course is asked about only once a stop has
// shown its term, and the stop comes before the next question; the classic page asks as before. Reset progression starts the terms again and keeps
// the answers (practice/progress.ts).
import { test, expect } from "../../support/test.js";
import { isPhone, ready, relOptions } from "../../support/page.js";
import { withCourse } from "../../support/data-key.js";

const hook = () => { window.__riglamTest = (t) => { window.__t = t; }; };
const onPath = () => { if (localStorage.getItem("rd-design") === null) localStorage.setItem("rd-design", "path"); };
// a device at stage 1 that has met no term yet, three questions in: the next pull brings the stop of Form (over the met terms the support test gives)
const fresh = () => { localStorage.setItem("rd-stages", "1"); localStorage.setItem("rd-terms", JSON.stringify({ n: 3, next: 3, terms: {} })); };
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

test("the classic page has no stops: the next question follows the result, and the questions are still counted", async ({ page }, testInfo) => {
  await page.addInitScript(fresh);
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  await answerClassic(page, testInfo);
  expect(await page.evaluate(() => window.__t.intro.n)).toBe(4);
  await page.keyboard.press("n");
  await ready(page);
  expect(await page.evaluate(() => window.__t.ui.stop)).toBeFalsy();
  expect(await page.evaluate(() => window.__t.intro.terms)).toEqual({});
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
  await expect(station(page), "the station says that a new definition is next").toHaveAccessibleName(/^Next: new definition/);
  await station(page).click();
  const stop = page.locator("#path .tstop");
  await expect(stop).toBeVisible();
  await expect(stop).toContainText("New definition");
  await expect(stop.locator(".cs")).toHaveText("Form");
  await expect(stop.locator(".pdup")).toBeVisible();
  if (withCourse) await expect(stop.locator(".pdbody")).toBeVisible();
  // one optional mark: the term comes again in a few questions, and a second tap takes that back
  const again = stop.getByRole("button", { name: "Show it again later" });
  const due = () => page.evaluate(() => { const t = JSON.parse(localStorage.getItem("rd-terms")).terms.form; return t.why === "again" ? t.due - window.__t.intro.n : null; });
  await expect(again).toHaveAttribute("aria-pressed", "false");
  await again.click();
  await expect(again).toHaveAttribute("aria-pressed", "true");
  await expect(stop.getByRole("status")).toContainText("It comes again in about 10 questions");
  expect(await due()).toBe(10);
  await again.click();
  await expect(again).toHaveAttribute("aria-pressed", "false");
  await expect(stop.getByRole("status")).toHaveCount(0);
  expect(await due()).toBeNull();
  await expect(station(page), "and the stop's goes on to the question").toHaveAccessibleName(/^Next: question/);
  await station(page).click();
  await expect(choices).toHaveCount(5);
  await expect(stop).toHaveCount(0);
});

test("Reset progression on the Stages page asks first, then starts at stage 1 with no term met, on the device and in its progress document", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(onPath);
  await page.addInitScript(() => { if (localStorage.getItem("rd-negation") === null) { localStorage.setItem("rd-stages", "1,2,3"); localStorage.setItem("rd-negation", "one");
    localStorage.setItem("rd-stage-run", JSON.stringify({ up: 3, down: 0 })); localStorage.setItem("rd-ex-runs", JSON.stringify({ practice: { run: 5, right: 9 } }));
    localStorage.setItem("rd-guided", JSON.stringify({ practice: false })); } });
  await page.addInitScript(hook);
  await page.goto("/");
  await expect(page.locator("#path .chs .crow")).toHaveCount(5);
  expect(Object.keys(await page.evaluate(() => window.__t.intro.terms)).length).toBeGreaterThan(9);
  await page.getByRole("button", { name: "Practice options" }).click();
  const sheet = page.getByRole("dialog", { name: "Practice options" });
  await sheet.getByRole("button", { name: "Stages: more" }).click();
  const row = sheet.locator(".porow", { hasText: "Reset progression" });
  await expect(row).toContainText("Your answers, their statistics and your settings stay.");
  await row.getByRole("button", { name: "Reset progression" }).click();
  await row.getByRole("button", { name: "Keep it" }).click();
  expect(await page.evaluate(() => localStorage.getItem("rd-stages"))).toBe("1,2,3");
  await row.getByRole("button", { name: "Reset progression" }).click();
  await row.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(row).toContainText("Done: stage 1");
  const stage = (n) => sheet.getByRole("switch", { name: new RegExp("^Stage " + n + " ") });
  await expect(stage(1)).toHaveAttribute("aria-checked", "true");
  await expect(stage(2)).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => [localStorage.getItem("rd-stages"), localStorage.getItem("rd-negation"), JSON.parse(localStorage.getItem("rd-terms")).terms])).toEqual(["1", "off", {}]);
  // the question behind the sheet was drawn again from stage 1, without Form, whose stop has not come
  expect(await cats(page)).not.toContain("form");
  const doc = await page.evaluate(async () => { const s = await (await window.__riglam.platform.db()).collection("progress").doc("learner").get(); return s.exists ? s.data() : null; });
  expect(doc).toMatchObject({ stages: [1], negation: "off", terms: { n: 0, terms: {} }, run: { up: 0, down: 0 }, exercises: {} });
  expect(await page.evaluate(() => [localStorage.getItem("rd-stage-run"), localStorage.getItem("rd-ex-runs"), localStorage.getItem("rd-guided")]), "the runs towards the stage offers start again, and every exercise is guided").toEqual(['{"up":0,"down":0}', "{}", "{}"]);
});
