// The challenge (src/app/practice/challenge.ts, src/app/path/challenge.tsx; its rules are src/domain/challenge.ts): a short task that everyone gets, served to
// a device with the Magic Key. The roadmap has its stop in the corner while there is one; the stop opens its page; each question is asked in its own
// exercise, apart from the learner's progression, with its place in the top bar; after the last one the page is back.
import { test, expect } from "../../support/test.js";
import { giveKey } from "../../support/data-key.js";
import { answerFirst, openMenu, relOptions, roadmap } from "../../support/page.js";

const DOC = {
  id: "2026-11-07-colors-and-shapes", date: "2026-11-07", title: "Colors and shapes", note: "From Friday's practice: color and shape, the two kinds of visible form.",
  items: [
    { exercise: "debate", a: "vis", b: "col", labels: ["visible forms", "colors"] },
    { exercise: "practice", a: "col", b: "shape", labels: ["colors", "shapes"] },
    { exercise: "practice", a: "vis", b: "col", labels: ["visible forms", "colors"] },
  ],
};
const NEXT = { ...DOC, id: "2026-11-14-sounds", date: "2026-11-14", title: "Sounds", note: "", items: [{ exercise: "practice", a: "col", b: "shape" }] };

const station = (page) => page.locator("#stn");
const title = (page) => page.locator("#path .ptb-t");
const mark = (page) => page.locator("#path .ptb .gmark");
const stop = (page) => roadmap(page).getByRole("button", { name: /^Challenge/ });
const rows = (page) => page.locator("#path .chi");
/** Where the page and the challenge stand. */
const now = (page) => page.evaluate(() => {
  const t = window.__t, v = t.challenge.view(), p = t.cur && t.cur.p;
  return { tab: t.tab, page: t.challenge.page(), shown: t.challenge.shown(), standing: v ? v.standing : null, marks: v ? v.rec.marks : null, done: v ? v.done : 0, at: v ? v.at : -1,
    pair: p ? p.a + " | " + p.b : null, checked: !!(t.ui && t.ui.checked) };
});
/** What the learner's progression keeps: none of it moves for a question of the challenge. */
const progression = (page) => page.evaluate(() => JSON.stringify([window.__t.stageRun, window.__t.exRuns, window.__t.intro, window.__t.stages]));
/** The pair on screen answered right, with examples the page can check by itself, as far as the result. */
async function answerRight(page) {
  const refs = await page.evaluate(() => window.__t.cur.p.ex);
  await answerFirst(page, { own: true, text: (i, cell) => refs[cell] });
}
/** A page of a device with the Magic Key, whose server has this challenge (or none). */
async function open(page, challenge = { version: "c1", doc: DOC }) {
  await page.addInitScript(() => {
    try { if (localStorage.getItem("rd-stages") === null) localStorage.setItem("rd-stages", "0,1,2,3"); } catch { /* no storage */ }
    window.__riglamTest = (t) => { window.__t = t; };
  });
  const calls = await giveKey(page, { challenge });
  await page.goto("/");
  await expect(relOptions(page)).toHaveCount(5);
  return calls;
}

test("the roadmap has the challenge's stop while there is one: new until its page was opened; the page has its words and its questions", async ({ page }) => {
  await open(page);
  await openMenu(page);
  await expect(stop(page)).toHaveAccessibleName("Challenge, new: Colors and shapes");
  await expect(roadmap(page).locator(".chring")).toHaveCount(1);
  expect(await now(page)).toMatchObject({ standing: "new", page: false, shown: false });

  // the stop opens the page first: the day and the count, the title, the note, and each question under the name of its exercise
  await stop(page).click();
  await expect(roadmap(page)).toBeHidden();
  await expect(title(page)).toHaveText("Challenge");
  await expect(page.locator("#path .sechead .ph")).toHaveText("7 Nov3 questions");
  await expect(page.locator("#path h2.tn")).toHaveText("Colors and shapes");
  await expect(page.locator("#path .chnote")).toHaveText(DOC.note);
  await expect(rows(page).locator(".chl")).toHaveText(["Pervasions", "Relations", "Relations"]);
  await expect(rows(page).locator(".cht")).toHaveText(["visible forms and colors", "colors and shapes", "visible forms and colors"]);
  await expect(rows(page).locator(".chv")).toHaveCount(0);
  await expect(station(page)).toHaveAccessibleName("Start");
  expect(await now(page)).toMatchObject({ standing: "open", page: true, tab: "review" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

  // the top bar goes back to the roadmap, where the stop is a plain one now, and stays so after a reload
  await page.locator(".tstn").click();
  await expect(roadmap(page)).toBeVisible();
  await expect(stop(page)).toHaveAccessibleName("Challenge, 3 questions: Colors and shapes");
  await expect(roadmap(page).locator(".chring")).toHaveCount(0);
  await page.reload();
  await expect(relOptions(page)).toHaveCount(5);
  await openMenu(page);
  await expect(stop(page)).toHaveAccessibleName("Challenge, 3 questions: Colors and shapes");
});

test("a device whose server has no challenge has no stop, and the tree is as it always is", async ({ page }) => {
  const calls = await open(page, null);
  await openMenu(page);
  await expect.poll(() => calls.challenge.length).toBeGreaterThan(0);
  await expect(stop(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__t.challenge.now)).toBeNull();
});

test("its questions are asked in their exercises, apart from the progression; Next goes on, and after the last one the page is back", async ({ page }) => {
  await open(page);
  const before = await progression(page);
  await openMenu(page);
  await stop(page).click();
  await station(page).click();

  // the first question, in Pervasions: the top bar has its place in the challenge where the progression ring stands
  await expect(title(page)).toHaveText("Pervasions");
  await expect(mark(page)).toHaveText("1 of 3");
  await expect(page.locator("#path .ptb .pring")).toHaveCount(0);
  expect(await now(page)).toMatchObject({ tab: "debate", shown: true, at: 0, pair: "visible forms | colors", standing: "open" });
  // skipped: it stays without an answer, and the next one comes
  await page.evaluate(() => window.__t.skipPair());
  await expect(title(page)).toHaveText("Relations");
  await expect(mark(page)).toHaveText("2 of 3");
  expect(await now(page)).toMatchObject({ tab: "practice", shown: true, at: 1, pair: "colors | shapes", marks: {} });

  // answered right: Next is the next question, with no stage or term before it, and nothing of the progression has moved
  await answerRight(page);
  await expect.poll(async () => (await now(page)).marks).toEqual({ 1: "ok" });
  await expect(station(page)).toHaveAccessibleName(/^Next question/);
  expect(await progression(page)).toBe(before);
  await station(page).click();
  await expect(mark(page)).toHaveText("3 of 3");
  expect(await now(page)).toMatchObject({ tab: "practice", shown: true, at: 2, pair: "visible forms | colors" });

  // the last one answered wrong (the first relation is not this pair's): Next goes back to the challenge
  await answerFirst(page);
  await expect.poll(async () => (await now(page)).marks).toEqual({ 1: "ok", 2: "bad" });
  await expect(station(page)).toHaveAccessibleName(/^Back to the challenge/);
  expect(await progression(page)).toBe(before);
  await station(page).click();
  await expect(title(page)).toHaveText("Challenge");
  expect(await now(page)).toMatchObject({ page: true, shown: false, at: -1, standing: "under", done: 2 });
  await expect(page.locator("#path .sechead .ph")).toHaveText("7 Nov3 questions · 2 done");
  await expect(rows(page).locator(".chv")).toHaveText(["right", "not right"]);
  // the skipped one is what Continue goes on with
  await expect(station(page)).toHaveAccessibleName("Continue");

  // Back from the page goes to the roadmap: the stop says how far it is, with the answers beside it; the answers are in Review like any other
  await page.goBack();
  await expect(roadmap(page)).toBeVisible();
  await expect(stop(page)).toHaveAccessibleName("Challenge, 2 of 3 done: Colors and shapes");
  await expect(stop(page).locator(".rm")).toHaveCount(2);
  await expect(roadmap(page).getByRole("button", { name: /^Review/ })).toHaveText("Review · 2 today");
  // the exercise under the roadmap has its own pair again
  expect(await now(page)).toMatchObject({ shown: false });
});

test("the mark in the top bar leads to the page and Back to the question as it was left; a question set aside waits, and the stop says so", async ({ page }) => {
  await open(page);
  await openMenu(page);
  await stop(page).click();
  await station(page).click();
  await expect(title(page)).toHaveText("Pervasions");
  await relOptions(page).first().click();       // the first of the four questions answered
  await expect.poll(() => page.evaluate(() => window.__t.ui.step)).toBe(1);

  // the mark: the page, where the question says that it waits; Back: the question, at its second step
  await mark(page).click();
  await expect(title(page)).toHaveText("Challenge");
  await expect(rows(page).nth(0).locator(".chl")).toHaveText("Pervasionscontinue");
  await expect(station(page)).toHaveAccessibleName("Continue");
  await page.goBack();
  await expect(title(page)).toHaveText("Pervasions");
  expect(await now(page)).toMatchObject({ tab: "debate", shown: true, at: 0 });
  expect(await page.evaluate(() => window.__t.ui.step)).toBe(1);

  // under the roadmap the stop is where the learner is; gone to an exercise, the question is set aside and the stop says "continue"
  await openMenu(page);
  await expect(stop(page)).toHaveAccessibleName("Challenge, here, question 1 of 3: Colors and shapes");
  await expect(roadmap(page).getByRole("button", { name: /^Pervasions/ })).not.toHaveAttribute("aria-current", "page");
  await roadmap(page).getByRole("button", { name: /^Relations/ }).click();
  expect(await now(page)).toMatchObject({ tab: "practice", shown: false, at: 0 });
  await expect(mark(page)).toHaveCount(0);
  await expect(page.locator("#path .ptb .pring")).toHaveCount(1);
  await openMenu(page);
  await expect(stop(page)).toHaveAccessibleName("Challenge, continue: Colors and shapes");

  // the page's station, and the question's own stop, put it back as it was left
  await stop(page).click();
  await station(page).click();
  await expect(title(page)).toHaveText("Pervasions");
  expect(await now(page)).toMatchObject({ tab: "debate", shown: true, at: 0, pair: "visible forms | colors" });
  expect(await page.evaluate(() => window.__t.ui.step)).toBe(1);
  await mark(page).click();
  await rows(page).nth(0).getByRole("button").click();
  await expect(title(page)).toHaveText("Pervasions");
  expect(await page.evaluate(() => window.__t.ui.step)).toBe(1);
  // another question opened by its stop is asked anew, in its exercise
  await mark(page).click();
  await rows(page).nth(1).getByRole("button").click();
  await expect(title(page)).toHaveText("Relations");
  await expect(mark(page)).toHaveText("2 of 3");
  expect(await now(page)).toMatchObject({ tab: "practice", shown: true, at: 1, pair: "colors | shapes" });
});

test("all answered, the stop says done and the station asks it again; the next challenge takes its place and starts as new; with none the stop goes", async ({ page }) => {
  const calls = await open(page, { version: "c2", doc: NEXT });
  await openMenu(page);
  await expect(stop(page)).toHaveAccessibleName("Challenge, new: Sounds");
  await stop(page).click();
  await expect(page.locator("#path .sechead .ph")).toHaveText("14 Nov1 question");
  await expect(page.locator("#path .chnote")).toHaveCount(0);
  await station(page).click();
  await expect(mark(page)).toHaveText("1 of 1");
  await answerRight(page);
  await expect(station(page)).toHaveAccessibleName(/^Back to the challenge/);
  await station(page).click();
  await expect(title(page)).toHaveText("Challenge");
  expect(await now(page)).toMatchObject({ page: true, standing: "done", marks: { 0: "ok" } });
  await expect(station(page)).toHaveAccessibleName("Again");
  await page.locator(".tstn").click();
  await expect(stop(page)).toHaveAccessibleName("Challenge, done: Sounds");

  // asked again, its answer is the last one given
  await stop(page).click();
  await station(page).click();
  await expect(mark(page)).toHaveText("1 of 1");
  await page.evaluate(() => window.__t.skipPair());
  await expect(title(page)).toHaveText("Challenge");
  expect(await now(page)).toMatchObject({ page: true, standing: "done", marks: { 0: "ok" } });

  // the server has another one: the device asks with the version it kept, and the new one starts as new, with nothing answered
  calls.setChallenge({ version: "c3", doc: DOC });
  await page.reload();
  await expect(relOptions(page)).toHaveCount(5);
  await openMenu(page);
  await expect(stop(page)).toHaveAccessibleName("Challenge, new: Colors and shapes");
  expect(calls.challenge.at(-1)).toEqual({ have: "c2", fits: true });
  expect(await now(page)).toMatchObject({ standing: "new", marks: {} });

  // a server that cannot say leaves the kept one in place: the challenge is there offline
  const route = (url) => url.pathname === "/api/course/challenge", down = (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "unavailable" } }) });
  await page.route(route, down);
  await page.reload();
  await expect(relOptions(page)).toHaveCount(5);
  await openMenu(page);
  await expect(stop(page)).toHaveAccessibleName("Challenge, new: Colors and shapes");
  await page.unroute(route, down);

  // the server has none any more: the stop goes
  calls.setChallenge(null);
  await page.reload();
  await expect(relOptions(page)).toHaveCount(5);
  await openMenu(page);
  await expect.poll(() => calls.challenge.at(-1)).toEqual({ have: "c3", fits: true });
  await expect(stop(page)).toHaveCount(0);
});
