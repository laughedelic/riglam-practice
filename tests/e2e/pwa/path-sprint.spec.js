// Sprint, the clock of a step, in all six exercises (src/app/shell/timers.js; the numbers are src/domain/sprint.ts, and the bar that runs is path/clock.tsx, which
// path-clock.spec.js covers). A step has its own clock; time up answers that step as it stands; a clock that something covers goes on from where it stood.
import { test, expect } from "../../support/test.js";
import { goTo, ready, relOptions } from "../../support/page.js";

const EXERCISES = ["Relations", "Pervasions", "Syllogisms", "Find a pair", "Categories", "Find an instance"];
/** Sprint on from the start, with `times` stored on the device (key: ms). */
const sprint = (page, times = {}) => page.addInitScript((t) => { localStorage.setItem("rd-blitz", "1"); for (const [k, v] of Object.entries(t)) localStorage.setItem(k, String(v)); window.__riglamTest = (x) => { window.__t = x; }; }, times);
const switchOf = (page) => page.getByRole("switch", { name: /^Sprint/ });
/** The step the running clock is on (its key), or null when none runs. */
const step = (page) => page.evaluate(() => (window.__t.ui.tq ? window.__t.ui.tq.key : null));
const clock = (page) => page.evaluate(() => (window.__t.ui.tq ? { key: window.__t.ui.tq.key, limit: window.__t.ui.tq.limit, left: window.__t.ui.tq.limit - (performance.now() - window.__t.ui.tq.t0) } : null));
/** To another exercise from the roadmap; on a phone a field that has the focus has the top bar out of sight, so the focus is let go first. */
const away = async (page, name) => { await page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); }); await goTo(page, name); };
const checked = (page) => page.evaluate(() => !!window.__t.ui.checked);

test("the stopwatch is in the top bar of all six exercises, and each exercise keeps its own switch", async ({ page }) => {
  await sprint(page);
  await page.goto("/");
  await ready(page);
  for (const name of EXERCISES) {
    await goTo(page, name);
    await expect(page.locator(".ptb-t")).toContainText(name);
    await expect(switchOf(page), name).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => step(page), { message: name + " has a clock running on its first step" }).not.toBeNull();
  }
  // off in one exercise leaves the others as they were, and the stopwatch stays where it is, crossed out
  await switchOf(page).click();
  await expect(switchOf(page)).toHaveAttribute("aria-checked", "false");
  await expect(switchOf(page)).toHaveAccessibleName("Sprint off (hold for the Sprint options)");
  expect(await step(page)).toBeNull();
  await goTo(page, "Relations");
  await expect(switchOf(page)).toHaveAttribute("aria-checked", "true");
  await goTo(page, "Find an instance");
  await expect(switchOf(page)).toHaveAttribute("aria-checked", "false");
});

test("each step has its own time: the relation, choosing, writing, the reply, the pair, the categories", async ({ page }) => {
  await sprint(page);
  await page.goto("/");
  await ready(page);
  expect(await clock(page), "Relations: the relation").toMatchObject({ key: "pick", limit: 15000 });
  await relOptions(page).nth(3).click();
  await expect.poll(() => step(page)).toBe("c-both");
  expect(await clock(page), "Relations: the first case").toMatchObject({ limit: 20000 });
  await away(page, "Pervasions");
  expect(await clock(page), "Pervasions: Accept or Why?").toMatchObject({ key: "q0", limit: 10000 });
  await page.locator("#path").getByRole("button", { name: /^Why/ }).first().click();
  await expect.poll(() => step(page), { message: "the example after Why? has a clock of its own" }).toBe("w0");
  expect(await clock(page)).toMatchObject({ limit: 20000 });
  await away(page, "Syllogisms");
  expect(await clock(page), "Syllogisms: the reply").toMatchObject({ key: "reply", limit: 15000 });
  await away(page, "Find a pair");
  expect(await clock(page), "Find a pair: naming the pair takes twice the writing").toMatchObject({ key: "name", limit: 40000 });
  await away(page, "Categories");
  expect(await clock(page), "Categories: the whole screen").toMatchObject({ key: "cats", limit: 20000 });
  await away(page, "Find an instance");
  expect(await clock(page), "Find an instance: naming a thing").toMatchObject({ key: "inst", limit: 20000 });
});

test("a clock that something covers goes on from where it stood: the options, the roadmap, another exercise", async ({ page }) => {
  await sprint(page);
  await page.goto("/");
  await ready(page);
  await page.waitForTimeout(1500);
  await page.getByRole("button", { name: "Practice options" }).click();
  await expect.poll(() => step(page), { message: "no clock runs behind the options" }).toBeNull();
  const kept = await page.evaluate(() => window.__t.ui.rest);
  expect(kept.key).toBe("pick");
  expect(kept.spent).toBeGreaterThan(1300);
  await page.waitForTimeout(1500);
  expect((await page.evaluate(() => window.__t.ui.rest)).spent, "it does not run while covered").toBe(kept.spent);
  await page.getByRole("dialog", { name: "Practice options" }).getByRole("button", { name: "Fold the practice options away" }).click();
  await expect.poll(() => step(page)).toBe("pick");
  const left = (await clock(page)).left;
  expect(left, "the time it had left, not the full time").toBeLessThan(15000 - kept.spent + 100);
  expect(left).toBeGreaterThan(15000 - kept.spent - 1500);
  // another exercise and back: the same
  await goTo(page, "Syllogisms");
  await page.waitForTimeout(1200);
  await goTo(page, "Relations");
  await expect.poll(() => step(page)).toBe("pick");
  expect((await clock(page)).left, "Relations went on from where it stood").toBeGreaterThan(15000 - kept.spent - 2500);
  expect((await clock(page)).left).toBeLessThan(15000 - kept.spent + 100);
});

test("Relations: time up on an example leaves the case as it stands and opens the next; after the last the pair is checked", async ({ page }) => {
  await sprint(page, { "rd-timer": 2000, "rd-timer-rel": 60000 });
  await page.goto("/");
  await ready(page);
  await relOptions(page).nth(3).click();     // four possibilities: four cases
  await page.locator("#cin").fill("a sound");
  await expect.poll(() => page.evaluate(() => window.__t.ui.ci), { timeout: 6000, message: "the next case has opened" }).toBe(1);
  expect(await page.evaluate(() => window.__t.ui.cells.both.t), "what was typed stands").toBe("a sound");
  expect(await step(page), "and it has a clock of its own").toBe("c-anb");
  await expect.poll(() => checked(page), { timeout: 12000, message: "the last case ran out and the pair was checked" }).toBe(true);
  expect(await page.evaluate(() => window.__t.ui.exLate)).toBe(true);
  await expect(page.locator("#path .pvline")).toContainText("time ran out on the examples");
});

test("Pervasions: a question that runs out counts as accepted, and the example after Why? has its own time", async ({ page }) => {
  await sprint(page, { "rd-timer-q": 2000, "rd-timer": 2000 });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Pervasions");
  await expect.poll(() => step(page)).toBe("q0");
  await expect.poll(() => step(page), { timeout: 5000, message: "the first question ran out, the second is asked" }).toBe("q1");
  expect(await page.evaluate(() => ({ say: window.__t.ui.ans[0].say, timeout: window.__t.ui.ans[0].timeout }))).toEqual({ say: "accept", timeout: true });
  await page.locator("#path").getByRole("button", { name: /^Why/ }).first().click();
  await expect.poll(() => step(page)).toBe("w1");
  await page.locator("#dex").fill("a pot");
  await expect.poll(() => step(page), { timeout: 5000, message: "the example ran out, and what was typed stands" }).toBe("q2");
  expect(await page.evaluate(() => ({ say: window.__t.ui.ans[1].say, text: window.__t.ui.ans[1].text, timeout: window.__t.ui.ans[1].timeout }))).toEqual({ say: "why", text: "a pot", timeout: true });
});

// the attempt on screen is marked, so that a new one (a miss draws the next) is told from the same one
const mark = (page) => page.evaluate(() => { window.__t.ui.marked = true; });
const fresh = (page) => page.evaluate(() => !window.__t.ui.marked);

test("Find an instance: with nothing written time up is a miss, with no result and the next set; with something written it is checked as it stands", async ({ page }) => {
  await sprint(page, { "rd-timer": 2000 });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Find an instance");
  await mark(page);
  await expect.poll(() => fresh(page), { timeout: 6000, message: "the next set has come" }).toBe(true);
  expect(await checked(page), "no result was shown").toBe(false);
  expect(await page.evaluate(async () => (await (await window.__riglam.platform.db()).collection("answers").get()).docs.length), "and nothing was kept").toBe(0);
  await expect.poll(() => step(page), { message: "the new set has its clock" }).toBe("inst");
  await page.locator("#iin").fill("a sound");
  await expect.poll(() => checked(page), { timeout: 6000, message: "what was written was checked" }).toBe(true);
  await expect.poll(async () => page.evaluate(async () => (await (await window.__riglam.platform.db()).collection("answers").get()).docs.map((d) => d.data()).filter((d) => d.mode === "instance").map((d) => d.timeout))).toEqual([true]);
});

test("Find a pair: nothing named in time is a miss, with no result and another relation", async ({ page }) => {
  await sprint(page, { "rd-timer": 2000 });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Find a pair");
  expect((await clock(page)).limit, "twice the writing time for the pair").toBe(4000);
  await mark(page);
  await expect.poll(() => fresh(page), { timeout: 8000, message: "the next relation has come" }).toBe(true);
  expect(await checked(page), "no result was shown").toBe(false);
  expect(await page.evaluate(() => window.__t.ui.step), "and the pair is to be named again").toBe(0);
  await expect.poll(() => step(page)).toBe("name");
});

test("Categories: time up on the screen checks what is ticked as it stands", async ({ page }) => {
  await sprint(page, { "rd-timer-cats": 2000 });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Categories");
  await expect.poll(() => step(page)).toBe("cats");
  await expect.poll(() => checked(page), { timeout: 6000, message: "the screen was checked when the time ran out" }).toBe(true);
  expect(await page.evaluate(() => window.__t.ui.ranOut)).toBe(true);
});

test("Syllogisms: no reply in time counts as wrong and the result shows", async ({ page }) => {
  await sprint(page, { "rd-timer-syl": 2000 });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Syllogisms");
  await expect.poll(() => checked(page), { timeout: 6000 }).toBe(true);
  expect(await page.evaluate(() => window.__t.ui.timeout)).toBe(true);
});
