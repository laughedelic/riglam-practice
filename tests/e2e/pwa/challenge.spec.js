// The challenges (src/app/practice/challenge.ts, src/app/path/challenge.tsx; their rules are src/domain/challenge.ts): short tasks that everyone gets, served
// to a device with the Magic Key. They accumulate. The roadmap has their stop in the corner while there are any; the stop opens their page, a timeline where
// the ones that wait are folded but for the open one; each question is asked in its own exercise, apart from the learner's progression, with its place in the
// top bar; after the last one the page is back, and a challenge whose questions all have an answer falls behind the top, where a pull brings the done ones
// back. A challenge has no clock by itself: Sprint is its own there, switched by the stopwatch, and no exercise's switch is touched by it.
import { test, expect } from "../../support/test.js";
import { giveKey } from "../../support/data-key.js";
import { answerFirst, explainChoice, openMenu, overflow, relOptions, roadmap } from "../../support/page.js";

const DOC = {
  id: "2026-11-07-colors-and-shapes", date: "2026-11-07", title: "Colors and shapes", note: "From Friday's practice: color and shape, the two kinds of visible form.",
  items: [
    { exercise: "debate", a: "vis", b: "col", labels: ["visible forms", "colors"] },
    { exercise: "practice", a: "col", b: "shape", labels: ["colors", "shapes"] },
    { exercise: "practice", a: "vis", b: "col", labels: ["visible forms", "colors"] },
  ],
};
// questions about what the app's data does not have: each brings its answer
const OUTSIDE = {
  id: "2026-11-11-outside-the-data", date: "2026-11-11", title: "Birds and things that fly", note: "",
  items: [
    { exercise: "practice", terms: [{ many: "penguins", one: "a penguin" }, { many: "things that fly", one: "something that flies" }],
      answer: { relation: "con", ex: { anb: "an emperor penguin", bna: "a bat", nei: "a stone" }, why: { both: "No penguin flies." }, note: "Penguins are birds that swim." } },
    { exercise: "debate", terms: [{ many: "birds", one: "a bird" }, { many: "things that fly", one: "something that flies" }],
      answer: { relation: "4", ex: { both: "a sparrow", anb: "a penguin", bna: "a bat", nei: "a stone" } } },
    { exercise: "syllogism", says: { subject: "a bat", predicate: "a bird", reason: "something that flies" }, answer: { reason: true, pervasion: false, thesis: false, witness: "a dragonfly" } },
  ],
};
const NEXT = { ...DOC, id: "2026-11-14-sounds", date: "2026-11-14", title: "Sounds", note: "", items: [{ exercise: "practice", a: "col", b: "shape" }] };
const EARLY = { id: "2026-11-12-shapes", date: "2026-11-12", title: "Shapes", note: "", items: [{ exercise: "practice", a: "vis", b: "col" }] };
/** The server's challenges as the server keeps them: one row that holds them all. */
const set = (...challenges) => ({ challenges });

const station = (page) => page.locator("#stn");
const title = (page) => page.locator("#path .ptb-t");
const mark = (page) => page.locator("#path .ptb .gmark");
const stop = (page) => roadmap(page).getByRole("button", { name: /^Challenge/ });
const rows = (page) => page.locator("#path .chx[data-open] .chi");
/** The challenges on the page, by their titles, and the one open. */
const titles = (page) => page.locator("#path .chx .chtt");
const opened = (page) => page.locator("#path .chx[data-open]");
/** The small stop at the top of the page that counts the done challenges behind it, and pulls them back. */
const past = (page) => page.locator("#path .chpast");
const stopwatch = (page) => page.getByRole("switch", { name: /^Sprint/ });
const clock = (page) => page.evaluate(() => (window.__t.ui && window.__t.ui.tq ? window.__t.ui.tq.key : null));
/** Where the element is once the page has stopped moving (the roadmap slides away). */
async function settledBox(at) {
  let was = null;
  await expect.poll(async () => { const b = await at.boundingBox(), same = !!b && !!was && b.x === was.x && b.y === was.y; was = b; return same; }).toBe(true);
  return was;
}
/** On a phone the top bar steps aside while a field has the keyboard: the focus is let go before the top bar is used. */
const calm = (page) => page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });
/** Where the page and a challenge stand (`id`; the latest when none is named), and the page's timeline: the ids on it, the one open, how many are behind the top. */
const now = (page, id = null) => page.evaluate((id) => {
  const t = window.__t, all = t.challenge.all, c = id ? all.find((x) => x.doc.id === id) : all[all.length - 1], v = c ? t.challenge.view(c.doc.id) : null, p = t.cur && t.cur.p, tl = t.challenge.timeline();
  return { tab: t.tab, page: t.challenge.page(), shown: t.challenge.shown(), standing: v ? v.standing : null, waits: v ? v.waits : null, marks: v ? v.rec.marks : null, done: v ? v.done : 0,
    at: v ? v.at : -1, pair: p ? p.a + " | " + p.b : null, checked: !!(t.ui && t.ui.checked), on: tl.shown.map((s) => s.doc.id), open: tl.open, hidden: tl.hidden };
}, id);
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

test("the roadmap has the challenges' stop while there are any: new until their page was opened, then how many wait; the page is a timeline, the latest open", async ({ page }) => {
  await open(page, { version: "c1", doc: set(NEXT, DOC) });
  await openMenu(page);
  await expect(stop(page)).toHaveAccessibleName("Challenge, new: Sounds");
  await expect(roadmap(page).locator(".chring")).toHaveCount(1);
  expect(await now(page)).toMatchObject({ standing: "new", page: false, shown: false });

  // the stop opens the page first: the challenges by their day, the earliest above; the latest is open, with its day, count, title and questions, and the one before is folded
  await stop(page).click();
  await expect(roadmap(page)).toBeHidden();
  await expect(title(page)).toHaveText("Challenge");
  await expect(titles(page)).toHaveText(["Colors and shapes", "Sounds"]);
  await expect(opened(page)).toHaveAttribute("data-id", NEXT.id);
  await expect(opened(page).locator(".sechead .ph")).toHaveText("14 Nov1 question");
  await expect(opened(page).locator(".chnote")).toHaveCount(0);
  await expect(rows(page).locator(".cht")).toHaveText(["colors and shapes"]);
  await expect(titles(page).first()).toHaveAttribute("aria-expanded", "false");
  // folded: its day, a hollow diamond for each of its questions and its title; what folds is out of reach
  const first = page.locator("#path .chx").first();
  await expect(first.locator(".chm i")).toHaveCount(3);
  await expect(first.locator(".chm i.ok")).toHaveCount(0);
  await expect(first.locator(".chi .chb").first()).not.toBeInViewport();
  await expect(station(page)).toHaveAccessibleName("Start");
  expect(await now(page)).toMatchObject({ standing: "open", page: true, tab: "review", on: [DOC.id, NEXT.id], open: NEXT.id, hidden: 0 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);

  // its title unfolds the one before, with its note and its questions, and folds the latest; the station is the open one's
  await titles(page).first().click();
  await expect(opened(page)).toHaveAttribute("data-id", DOC.id);
  await expect(opened(page).locator(".chnote")).toHaveText(DOC.note);
  await expect(rows(page).locator(".chl")).toHaveText(["Pervasions", "Relations", "Relations"]);
  await expect(rows(page).locator(".cht")).toHaveText(["visible forms and colors", "colors and shapes", "visible forms and colors"]);
  await expect(rows(page).locator(".chv")).toHaveCount(0);
  await expect(titles(page).last()).toHaveAttribute("aria-expanded", "false");
  await expect(station(page)).toHaveAccessibleName("Start");
  expect(await now(page)).toMatchObject({ open: DOC.id });

  // the top bar goes back to the roadmap, where the stop says how many wait now, and so after a reload
  await page.locator(".tstn").click();
  await expect(roadmap(page)).toBeVisible();
  await expect(stop(page)).toHaveAccessibleName("Challenge, 2 open");
  await expect(roadmap(page).locator(".chring")).toHaveCount(0);
  await page.reload();
  await expect(relOptions(page)).toHaveCount(5);
  await openMenu(page);
  await expect(stop(page)).toHaveAccessibleName("Challenge, 2 open");
});

test("a device whose server has no challenges has no stop, and the tree is as it always is", async ({ page }) => {
  const calls = await open(page, null);
  await openMenu(page);
  await expect.poll(() => calls.challenge.length).toBeGreaterThan(0);
  await expect(stop(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__t.challenge.all)).toEqual([]);
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
  await expect(opened(page).locator(".sechead .ph")).toHaveText("7 Nov3 questions · 2 done");
  await expect(rows(page).locator(".chv")).toHaveText(["right", "not right"]);
  // the skipped one is what Continue goes on with
  await expect(station(page)).toHaveAccessibleName("Continue");

  // a question is still without an answer: the challenge waits, on the page, and its diamonds say how each went once it is folded
  expect(await now(page)).toMatchObject({ waits: true, on: [DOC.id], hidden: 0 });
  await expect(past(page)).toHaveCount(0);
  await expect(page.locator("#path .chx .chm i.ok")).toHaveCount(1);
  await expect(page.locator("#path .chx .chm i.no")).toHaveCount(1);

  // Back from the page goes to the roadmap: the stop says that it waits; the answers are in Review like any other
  await page.goBack();
  await expect(roadmap(page)).toBeVisible();
  await expect(stop(page)).toHaveAccessibleName("Challenge, 1 open");
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

test("a challenge whose questions all have an answer falls behind the top of the page; a pull or a press brings the done ones back, and the next one opens", async ({ page }) => {
  const calls = await open(page, { version: "c2", doc: set(EARLY, NEXT) });
  await openMenu(page);
  await expect(stop(page)).toHaveAccessibleName("Challenge, new: Sounds");
  await stop(page).click();
  await expect(opened(page)).toHaveAttribute("data-id", NEXT.id);
  await station(page).click();
  await expect(mark(page)).toHaveText("1 of 1");
  await answerRight(page);
  await expect(station(page)).toHaveAccessibleName(/^Back to the challenge/);
  await station(page).click();

  // back on the page it shows how it went, then folds and goes up the thread, behind the top: the small stop there counts it, and the one before opens
  await expect(title(page)).toHaveText("Challenge");
  expect(await now(page, NEXT.id)).toMatchObject({ page: true, standing: "done", waits: false, marks: { 0: "ok" } });
  await expect(past(page)).toHaveAccessibleName("1 done. Pull down or press to bring it back");
  await expect(titles(page)).toHaveText(["Shapes"]);
  await expect(opened(page)).toHaveAttribute("data-id", EARLY.id);
  await expect(station(page)).toHaveAccessibleName("Start");
  expect(await now(page)).toMatchObject({ on: [EARLY.id], open: EARLY.id, hidden: 1 });
  await page.locator(".tstn").click();
  await expect(stop(page)).toHaveAccessibleName("Challenge, 1 open");

  // the last one that waits done too: nothing waits, the page says so, and the stop says nothing more
  await stop(page).click();
  await station(page).click();
  await answerRight(page);
  await station(page).click();
  await expect(past(page)).toHaveAccessibleName("2 done. Pull down or press to bring them back");
  await expect(titles(page)).toHaveCount(0);
  await expect(page.locator("#path .chnone")).toHaveText("Nothing is waiting. The next challenge shows up here.");
  await expect(station(page)).toHaveCount(0);
  await page.locator(".tstn").click();
  await expect(stop(page)).toHaveAccessibleName("Challenge, all done");
  await expect(stop(page).locator(".ed")).toHaveCount(0);

  // pressed, the small stop brings them all back, folded, in their order; one unfolded asks its questions again, and stays out after its last one
  await stop(page).click();
  await past(page).click();
  await expect(past(page)).toHaveCount(0);
  await expect(titles(page)).toHaveText(["Shapes", "Sounds"]);
  await expect(opened(page)).toHaveCount(0);
  await titles(page).last().click();
  await expect(opened(page)).toHaveAttribute("data-id", NEXT.id);
  await expect(rows(page).locator(".chv")).toHaveText(["right"]);
  await expect(station(page)).toHaveAccessibleName("Again");
  await station(page).click();
  await expect(mark(page)).toHaveText("1 of 1");
  await page.evaluate(() => window.__t.skipPair());
  await expect(title(page)).toHaveText("Challenge");
  expect(await now(page, NEXT.id)).toMatchObject({ page: true, standing: "done", marks: { 0: "ok" }, on: [EARLY.id, NEXT.id], open: NEXT.id, hidden: 0 });

  // opened anew from the roadmap, the done ones are behind the top again; the mouse pulls them down over the curb, and the station above the thread says how many
  await page.locator(".tstn").click();
  await stop(page).click();
  await expect(past(page)).toHaveText("2 donepull down");
  await expect(roadmap(page)).toBeHidden();
  const box = await settledBox(past(page));
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  for (let y = 10; y <= 150; y += 10) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2 + y);
  await expect(page.locator("#path .bkhead .gol b")).toHaveText("2 done");
  await expect(page.locator("#path .main")).toHaveClass(/bkover/);
  await page.mouse.up();
  await expect(past(page)).toHaveCount(0);
  await expect(titles(page)).toHaveText(["Shapes", "Sounds"]);
  await expect(page.locator("#path .main")).not.toHaveClass(/bkpull/);

  // the server has one more: the device asks with the version it kept; it comes before the others by its day, new, and the done ones keep their answers
  calls.setChallenge({ version: "c3", doc: set(EARLY, NEXT, DOC) });
  await page.reload();
  await expect(relOptions(page)).toHaveCount(5);
  await openMenu(page);
  await expect(stop(page)).toHaveAccessibleName("Challenge, new: Colors and shapes");
  expect(calls.challenge.at(-1)).toEqual({ have: "c2", fits: true });
  expect(await now(page, DOC.id)).toMatchObject({ standing: "new", marks: {} });
  expect(await now(page, NEXT.id)).toMatchObject({ standing: "done", marks: { 0: "ok" } });
  await stop(page).click();
  await expect(past(page)).toHaveAccessibleName("2 done. Pull down or press to bring them back");
  await expect(opened(page)).toHaveAttribute("data-id", DOC.id);
  await page.locator(".tstn").click();
  await expect(stop(page)).toHaveAccessibleName("Challenge, 1 open");

  // a server that cannot say leaves the kept ones in place: the challenges are there offline
  const route = (url) => url.pathname === "/api/course/challenge", down = (r) => r.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "unavailable" } }) });
  await page.route(route, down);
  await page.reload();
  await expect(relOptions(page)).toHaveCount(5);
  await openMenu(page);
  await expect(stop(page)).toHaveAccessibleName("Challenge, 1 open");
  await page.unroute(route, down);

  // the server has none any more: the stop goes
  calls.setChallenge(null);
  await page.reload();
  await expect(relOptions(page)).toHaveCount(5);
  await openMenu(page);
  await expect.poll(() => calls.challenge.at(-1)).toEqual({ have: "c3", fits: true });
  await expect(stop(page)).toHaveCount(0);
});

test("a challenge has no clock where the exercises have Sprint on; the stopwatch on one of its questions is the challenge's own", async ({ page }) => {
  // Sprint on in every exercise, with times long enough that none runs out here
  await page.addInitScript(() => { localStorage.setItem("rd-blitz", "1"); for (const k of ["rd-timer", "rd-timer-rel", "rd-timer-q", "rd-timer-syl", "rd-timer-cats", "rd-timer-cat"]) localStorage.setItem(k, "60000"); });
  await open(page);
  await expect(stopwatch(page)).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => clock(page)).not.toBeNull();
  await openMenu(page);
  await stop(page).click();
  await station(page).click();

  // its first question, in Pervasions, is asked without the clock
  await expect(title(page)).toHaveText("Pervasions");
  expect(await now(page)).toMatchObject({ shown: true, at: 0 });
  await expect(stopwatch(page)).toHaveAttribute("aria-checked", "false");
  expect(await clock(page)).toBeNull();
  // the stopwatch there is the challenge's: on, the question has its clock, and so has the one after it
  await stopwatch(page).click();
  await expect(stopwatch(page)).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => clock(page)).not.toBeNull();
  await page.evaluate(() => window.__t.skipPair());
  await expect(title(page)).toHaveText("Relations");
  expect(await now(page)).toMatchObject({ shown: true, at: 1 });
  await expect(stopwatch(page)).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => clock(page)).not.toBeNull();
  // off again, none has
  await calm(page);
  await stopwatch(page).click();
  await expect(stopwatch(page)).toHaveAttribute("aria-checked", "false");
  expect(await clock(page)).toBeNull();
  await page.evaluate(() => window.__t.skipPair());
  expect(await now(page)).toMatchObject({ shown: true, at: 2 });
  await expect(stopwatch(page)).toHaveAttribute("aria-checked", "false");
  expect(await clock(page)).toBeNull();

  // switched on at the last question and left: the next run of the challenge starts without the clock again
  await calm(page);
  await stopwatch(page).click();
  await expect(stopwatch(page)).toHaveAttribute("aria-checked", "true");
  await page.evaluate(() => window.__t.skipPair());
  await expect(title(page)).toHaveText("Challenge");
  await expect(station(page)).toHaveAccessibleName("Start");
  await station(page).click();
  await expect(title(page)).toHaveText("Pervasions");
  expect(await now(page)).toMatchObject({ shown: true, at: 0 });
  await expect(stopwatch(page)).toHaveAttribute("aria-checked", "false");
  expect(await clock(page)).toBeNull();

  // the exercises have their own switches as they were: gone to Relations, its own attempt is asked against the clock, and nothing was kept for an exercise alone
  await openMenu(page);
  await roadmap(page).getByRole("button", { name: /^Relations/ }).click();
  expect(await now(page)).toMatchObject({ tab: "practice", shown: false });
  await expect(stopwatch(page)).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => clock(page)).not.toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("rd-per-ex"))).toBeNull();
});

test("Claude's check of a question's examples that comes after Next still marks it, and its answer is kept apart from the runs", async ({ page }) => {
  // a server that knows every example, but answers only when told to
  let release;
  const held = new Promise((r) => { release = r; });
  const asked = [];
  // (the server's learned facts come with its tutor; the explanation is not asked by itself)
  await page.addInitScript(() => localStorage.setItem("rd-autoexplain", "0"));
  await page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, tutor: "on", known: "on" }) }));
  await page.route("**/api/known", async (route) => {
    const body = route.request().postDataJSON();
    asked.push(body);
    await held;
    const facts = { both: ["yes", "yes"], anb: ["yes", "no"], bna: ["no", "yes"], nei: ["no", "no"] }, name = { both: "Both", anb: "A not B", bna: "B not A", nei: "Neither" };
    const known = body.examples.map((e) => ({ cell: e.cell, text: e.text, line: `${name[e.cell]}: "${e.text}" | class: Thing | A ${facts[e.cell][0]}: so | B ${facts[e.cell][1]}: so`, by: "learned" }));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ known }) });
  });
  await open(page);
  await openMenu(page);
  await stop(page).click();
  await station(page).click();
  await expect(mark(page)).toHaveText("1 of 3");
  await page.evaluate(() => window.__t.skipPair());
  await expect(mark(page)).toHaveText("2 of 3");
  // examples the page cannot check by itself: the answer waits for Claude's check
  await answerFirst(page, { own: true, text: (i) => "a made-up thing " + (i + 1) });
  await expect.poll(async () => (await now(page)).marks).toEqual({ 1: "pend" });
  await expect.poll(() => asked.length).toBe(1);
  // Next before the check comes back: the next question is on screen when it does
  await station(page).click();
  await expect(mark(page)).toHaveText("3 of 3");
  release();
  await expect.poll(async () => (await now(page)).marks).toEqual({ 1: "ok" });
  expect(await now(page)).toMatchObject({ at: 2, shown: true });
  const kept = await page.evaluate(async () => {
    const db = await window.__riglam.platform.db();
    return (await db.collection("answers").get()).docs.map((d) => d.data()).filter((d) => d.a === "colors").map((d) => ({ grade: d.grade, apart: d.apart }));
  });
  expect(kept).toEqual([{ grade: "ok", apart: true }]);
});

test("the same challenge said anew while one of its questions is on screen goes on as it stands", async ({ page }) => {
  await open(page);
  await openMenu(page);
  await stop(page).click();
  await station(page).click();
  await expect(mark(page)).toHaveText("1 of 3");
  await page.evaluate(() => window.__t.skipPair());
  await expect(mark(page)).toHaveText("2 of 3");
  // its title set right on the server, as the platform would hand it over
  await page.evaluate((doc) => window.__t.challenge.set(doc), { ...DOC, title: "Colors and shapes, set right" });
  expect(await page.evaluate((id) => window.__t.challenge.view(id).doc.title, DOC.id)).toBe("Colors and shapes, set right");
  await answerRight(page);
  await expect.poll(async () => (await now(page)).marks).toEqual({ 1: "ok" });
  await expect(station(page)).toHaveAccessibleName(/^Next question/);
  await station(page).click();
  await expect(mark(page)).toHaveText("3 of 3");
});

test("questions about what the data does not have bring their answers: the app checks the relation and the reply against them, and Claude checks the examples with the answer in hand", async ({ page }) => {
  // the app's server stands in for Claude: it answers the pair's examples, each with what it is of the two sides
  const sse = (...events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  const lines = ['A not B: "a king penguin" | class: none | A yes: it is a penguin | B no: it swims and does not fly', 'B not A: "a kite" | class: none | A no: it is a toy | B yes: it flies on the wind', 'Neither: "a red apple" | class: none | A no: it is a fruit | B no: it does not fly', "Common locus: no.", "Pervasion: neither way."].join("\n");
  const asked = [];
  await page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, tutor: "on" }) }));
  await page.route("**/api/tutor", (route) => { asked.push(route.request().postDataJSON()); return route.fulfill({ status: 200, contentType: "text/event-stream", body: sse({ type: "delta", text: lines }, { type: "done", truncated: false }) }); });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, { version: "c1", doc: OUTSIDE });
  const before = await progression(page);
  await openMenu(page);
  await stop(page).click();
  // the page names them like the others: a pair by its two sides, a syllogism by its sentence
  await expect(rows(page).locator(".chl")).toHaveText(["Relations", "Pervasions", "Syllogisms"]);
  await expect(rows(page).locator(".cht")).toHaveText(["penguins and things that fly", "birds and things that fly", "Take a bat. It follows it is a bird because it is something that flies."]);
  await station(page).click();

  // Relations: the relation it brought is the right one, with its examples as the reference, and an example of the learner's waits for Claude
  await expect(title(page)).toHaveText("Relations");
  await expect(mark(page)).toHaveText("1 of 3");
  expect(await now(page)).toMatchObject({ tab: "practice", shown: true, at: 0, pair: "penguins | things that fly" });
  await answerFirst(page, { own: true, text: (i, cell) => ({ anb: "a king penguin", bna: "a kite", nei: "a red apple" })[cell] });
  const cells = () => page.evaluate(() => { const r = window.__t.ui.res; return { relOk: r.relOk, ...Object.fromEntries(Object.entries(r.cells).map(([c, x]) => [c, x.v])) }; });
  expect(await cells()).toEqual({ relOk: true, both: "ok", anb: "cmp", bna: "cmp", nei: "cmp" });
  await expect(page.locator("#path")).toContainText("Unchecked. Reference example: an emperor penguin");
  await expect.poll(async () => (await now(page)).marks).toEqual({ 0: "pend" });
  await expect(explainChoice(page)).toBeVisible();
  await explainChoice(page).click();
  await expect.poll(cells).toEqual({ relOk: true, both: "ok", anb: "ok", bna: "ok", nei: "ok" });
  await expect.poll(async () => (await now(page)).marks).toEqual({ 0: "ok" });
  // what Claude was sent: the card that says the answer came with the task, with it as the reference; no categories, and no examples for the server to keep
  expect(asked).toHaveLength(1);
  expect(asked[0].cats).toEqual([]);
  expect(asked[0].examples).toBeUndefined();
  const card = asked[0].turns[0].content;
  expect(card.startsWith("CARD (this pair is not in the reference's term data: it was set as a task")).toBe(true);
  expect(card).toContain("Correct relation: Mutually exclusive.");
  expect(card).toContain('- penguins, not things that fly: learner wrote "a king penguin"; reference "an emperor penguin"; app verdict cmp');
  expect(card).toContain("reference EMPTY (No penguin flies.)");
  expect(card).toContain("use the correct relation above: it came with the task and is right");
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  // Pervasions: the four statements say one of each side in the task's words ("a bird", not "birds")
  await station(page).click();
  await expect(title(page)).toHaveText("Pervasions");
  await expect(mark(page)).toHaveText("2 of 3");
  expect(await now(page)).toMatchObject({ tab: "debate", shown: true, at: 1, pair: "birds | things that fly" });
  const said = page.locator("#path .sb.now");
  await expect(said).toContainText("a bird");
  await expect(said).toContainText("something that flies");
  await expect(said).not.toContainText(/is (not )?(birds|things that fly)/);
  // Why? to each of the four, with an example: the answers give four possibilities, which is the relation it brought
  for (const thing of ["a sparrow", "a penguin", "a bat", "a stone"]) {
    await page.locator("#path .chs .crow").filter({ hasText: "Why?" }).first().click();
    await expect(page.locator("#dex")).toBeVisible();
    await page.locator("#dex").fill(thing);
    await page.locator("#dex").press("Enter");
    await expect(page.locator("#dex")).toHaveCount(0);
  }
  await expect(relOptions(page)).toHaveCount(5);
  await page.locator('#path .chs [data-k="4"]').click();
  await expect(page.locator("#path .pvline")).toBeVisible();
  expect(await page.evaluate(() => window.__t.ui.res.relOk)).toBe(true);
  await expect.poll(async () => (await now(page)).marks).toMatchObject({ 1: "pend" });

  // Syllogisms: the reply is checked against the three checks it brought, each with its line; the counter-example is left unchecked
  await station(page).click();
  await expect(title(page)).toHaveText("Syllogisms");
  await expect(mark(page)).toHaveText("3 of 3");
  await expect(page.locator("#path .stm")).toHaveCount(3);
  await page.locator("#path .chs .crow").filter({ has: page.getByText("There is no pervasion", { exact: true }) }).click();
  await expect(page.locator("#sylex")).toBeVisible();
  await page.locator("#sylex").fill("an airplane");
  await page.locator("#sylex").blur();
  await station(page).click();
  await expect(page.locator("#path .pvline")).toContainText("Right");
  await expect(page.locator("#path .chk")).toHaveCount(3);
  await expect(page.locator("#path")).toContainText("A bat is something that flies.");
  await expect(page.locator("#path")).toContainText("Just because it is something that flies, doesn't necessarily mean that it is a bird.");
  await expect(page.locator("#path")).toContainText("A bat is not a bird.");
  await expect(page.locator("#path")).toContainText("Not checked: the app does not know an airplane well enough to say.");
  await expect.poll(async () => (await now(page)).marks).toMatchObject({ 0: "ok", 2: "ok" });
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  // nothing of the progression moved, the page is back after the last one, and the answers are in Review like any other
  expect(await progression(page)).toBe(before);
  await expect(station(page)).toHaveAccessibleName(/^Back to the challenge/);
  await station(page).click();
  await expect(title(page)).toHaveText("Challenge");
  // all three have an answer: it is behind the top, and the small stop there brings it back
  await past(page).click();
  await titles(page).first().click();
  await expect(rows(page).locator(".chv")).toHaveCount(3);
  await page.goBack();
  await expect(roadmap(page).getByRole("button", { name: /^Review/ })).toHaveText("Review · 3 today");
  expect(errors).toEqual([]);
});
