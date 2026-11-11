// A question that is given, not drawn (src/app/practice/given.ts, src/domain/given.ts): it is shown in its exercise in the place of the exercise's own attempt,
// which waits untouched; Next and Skip ask the one who gave it what comes; its answer is told to the one who gave it. Nothing in the app gives a question yet,
// so the spec gives them through the test hook, as a mode that does would.
import { test, expect } from "../../support/test.js";
import { answerFirst, goTo, openMenu, relOptions, roadmap } from "../../support/page.js";

const station = (page) => page.locator("#stn");
const choices = (page) => page.locator("#path .chs .crow").filter({ visible: true });
const title = (page) => page.locator("#path .ptb-t span");
/** What the page holds: the exercise on screen, whether its question is a given one, the one set aside, and the pair or the syllogism asked. */
const now = (page) => page.evaluate(() => {
  const t = window.__t, p = t.cur && t.cur.p, c = t.cur && t.cur.c;
  return { tab: t.tab, shown: t.given.shown(), aside: t.given.aside(), pair: p ? p.a + " | " + p.b : null, subject: c ? c.subject : null, rel: t.ui.rel || null, log: window.__log };
});
/**
 * Gives the questions written down in `list` one after the other: the first is opened now, each Next (or Skip) opens the one after it, and after the last one nothing
 * is opened. What the page tells the giver is kept in `window.__log`. Resolves to whether the first one opened.
 */
const give = (page, list) => page.evaluate((qs) => {
  const t = window.__t; window.__log = [];
  let i = 0;
  const open = () => {
    const at = i, q = t.given.make(qs[at]);
    return !!q && t.given.open(q, {
      next: at < qs.length - 1 ? undefined : "Back to the task",
      line: "Question " + (at + 1) + " of " + qs.length,
      onChecked: (grade) => window.__log.push("checked " + at + " " + grade),
      onNext: ({ skipped }) => { window.__log.push((skipped ? "skipped " : "next ") + at); i++; if (i < qs.length) open(); },
    });
  };
  return open();
}, list);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { if (localStorage.getItem("rd-stages") === null) localStorage.setItem("rd-stages", "0,1,2,3"); } catch { /* no storage */ }
    window.__riglamTest = (t) => { window.__t = t; };
  });
  await page.goto("/");
  await expect(relOptions(page)).toHaveCount(5);
});

test("a given question takes the place of the exercise's own attempt, which comes back as it was left", async ({ page }) => {
  // the exercise's own pair, begun: a relation picked
  await choices(page).first().click();
  await expect(page.locator("#cin")).toBeVisible();
  const own = await now(page);
  expect(own).toMatchObject({ tab: "practice", shown: false, rel: "mi" });

  // a given pair in the same exercise, then a given syllogism
  expect(await give(page, [{ exercise: "practice", a: "col", b: "shape", labels: ["colors", "shapes"] }, { exercise: "syllogism", subject: "the roundness of a coin", reason: "vis", predicate: "col" }])).toBe(true);
  expect(await now(page)).toMatchObject({ tab: "practice", shown: true, pair: "colors | shapes", rel: null });
  expect(await page.evaluate(() => window.__t.given.line())).toBe("Question 1 of 2");      // the giver's line is at hand for the screen that draws it
  await expect(choices(page)).toHaveCount(5);
  // the roadmap goes on showing the exercise's own attempt as waiting; the given question is not kept as the exercise's when the page is put away
  expect(await page.evaluate(() => { window.dispatchEvent(new Event("pagehide")); return localStorage.getItem("rd-attempt"); })).toBeNull();

  // answered and checked: the one who gave it hears the grade, and the Next station is the given question's
  const refs = await page.evaluate(() => window.__t.cur.p.ex);       // the pair's own reference in each case: examples the page can check by itself
  await answerFirst(page, { own: true, text: (i, cell) => refs[cell] });
  await expect.poll(async () => (await now(page)).log).toEqual(["checked 0 ok"]);
  await expect(station(page)).toHaveAccessibleName(/^Next question/);

  // Next opens what the giver gives next, in its own exercise
  await station(page).click();
  await expect(title(page)).toHaveText("Syllogisms");
  expect(await now(page)).toMatchObject({ tab: "syllogism", shown: true, subject: "the roundness of a coin" });
  await page.locator("#path .chs .crow").filter({ visible: true, hasText: "I accept" }).click();      // wrong: a shape is no color
  await expect(station(page)).toHaveAccessibleName(/^Back to the task/);
  await expect.poll(async () => (await now(page)).log).toEqual(["checked 0 ok", "next 0", "checked 1 bad"]);

  // after the last one nothing is given: Syllogisms shows a syllogism of its own, and Relations has its pair as it was left
  await station(page).click();
  await expect.poll(async () => (await now(page)).shown).toBe(false);
  const after = await now(page);
  expect(after).toMatchObject({ tab: "syllogism", shown: false, aside: null });
  expect(await page.evaluate(() => window.__t.given.line())).toBeNull();
  expect(after.log).toEqual(["checked 0 ok", "next 0", "checked 1 bad", "next 1"]);
  await goTo(page, "Relations");
  expect(await now(page)).toMatchObject({ tab: "practice", shown: false, pair: own.pair, rel: "mi" });
  await expect(page.locator("#cin")).toBeVisible();
});

test("going to an exercise from the roadmap sets a given question aside as it is, and it is resumed as it was left", async ({ page }) => {
  const own = await now(page);
  expect(await give(page, [{ exercise: "debate", a: "vis", b: "col", labels: ["visible forms", "colors"] }])).toBe(true);
  await expect(title(page)).toHaveText("Pervasions");
  await choices(page).first().click();       // the first of the four questions answered
  await expect.poll(() => page.evaluate(() => window.__t.ui.step)).toBe(1);

  // the roadmap: Relations is as it was (nothing begun), and Continue goes back to the given pair, which is what is under the roadmap
  await openMenu(page);
  await expect(roadmap(page).getByRole("button", { name: /^Relations/ })).not.toContainText("continue");
  await roadmap(page).getByRole("button", { name: "Continue" }).click();
  await expect(roadmap(page)).toBeHidden();
  expect(await now(page)).toMatchObject({ tab: "debate", shown: true, pair: "visible forms | colors" });
  // going to an exercise from the roadmap shows that exercise's own pair
  await openMenu(page);
  await roadmap(page).getByRole("button", { name: /^Relations/ }).click();
  expect(await now(page)).toMatchObject({ tab: "practice", shown: false, pair: own.pair, aside: { ex: "debate", begun: true, checked: false } });
  // Pervasions has a pair of its own again, not the given one
  await goTo(page, "Pervasions");
  expect(await now(page)).toMatchObject({ tab: "debate", shown: false, aside: { ex: "debate" } });
  expect((await now(page)).pair).not.toBe("visible forms | colors");

  // resumed: the given pair, at its second question
  expect(await page.evaluate(() => window.__t.given.resume())).toBe(true);
  expect(await now(page)).toMatchObject({ tab: "debate", shown: true, pair: "visible forms | colors", aside: null });
  expect(await page.evaluate(() => window.__t.ui.step)).toBe(1);
  // going to the exercise it is in sets it aside too: the roadmap's Pervasions is the exercise's own
  await goTo(page, "Pervasions");
  expect(await now(page)).toMatchObject({ tab: "debate", shown: false, aside: { ex: "debate", begun: true } });
  // closed for good: nothing is left to resume
  await page.evaluate(() => window.__t.given.close());
  expect(await page.evaluate(() => window.__t.given.resume())).toBe(false);
});

test("Skip on a given question asks the giver for the next one, and sets nothing aside for Review", async ({ page }) => {
  expect(await give(page, [{ exercise: "practice", a: "col", b: "shape" }, { exercise: "instance", cats: ["col", "shape"] }])).toBe(true);
  await page.evaluate(() => window.__t.skipPair());
  await expect(title(page)).toHaveText("Find an instance");
  const at = await now(page);
  expect(at).toMatchObject({ tab: "instance", shown: true, log: ["skipped 0"] });
  expect(await page.evaluate(() => Object.keys(window.__t.skips).length)).toBe(0);
  // a question with something entered asks first, in words that fit a question nobody keeps
  await page.getByRole("button", { name: /nothing is/i }).first().click();
  await page.evaluate(() => window.__t.skipPair());
  const ask = page.getByRole("alertdialog");
  await expect(ask).toContainText("Skip this question?");
  await expect(ask).toContainText("Your inputs will be lost.");
  await expect(ask).not.toContainText("Review");
});

test("a given relation in Find a pair is the one asked: it cannot be changed or drawn again", async ({ page }) => {
  expect(await give(page, [{ exercise: "find", relation: "3ab" }])).toBe(true);
  await expect(title(page)).toHaveText("Find a pair");
  expect(await now(page)).toMatchObject({ tab: "find", shown: true, rel: "3ab" });
  await expect(page.getByRole("button", { name: /(Choose|Change) relation/ })).toHaveCount(0);
  // Skip with no pair named would draw another relation in the exercise: here it goes on to what the giver gives, which is nothing
  await page.evaluate(() => window.__t.skipPair());
  expect(await now(page)).toMatchObject({ tab: "find", shown: false, log: ["skipped 0"] });
  await expect(page.getByRole("button", { name: /(Choose|Change) relation/ })).toHaveCount(1);
});

test("what the data cannot make is not opened", async ({ page }) => {
  const before = await now(page);
  expect(await give(page, [{ exercise: "practice", a: "col", b: "nowhere" }])).toBe(false);
  expect(await give(page, [{ exercise: "syllogism", subject: "a thing the data does not have", reason: "vis", predicate: "col" }])).toBe(false);
  expect(await now(page)).toMatchObject({ tab: before.tab, shown: false, pair: before.pair });
});
