// Daily practice (src/app/practice/daily.ts, src/app/path/daily.tsx; the plan is src/domain/session.ts): the stop at the roadmap's fork starts a session of
// questions that move between the exercises; each stands in its exercise with the session's row at the top of its thread; a missed question of a round comes
// back at the end; the last station says how it went and offers one more round, and from it the roadmap is back. A session has no clock by itself: Sprint is
// the session's own there, switched by the stopwatch or taken with a Sprint round at the last station, and no exercise's switch is touched by it. What a
// session is made of is set on its page of the practice options: the exercises in the mix and what the rounds are drawn from. The row stays at the top of a
// question through its later steps, and a session hears how an answer went also on a device that stores nothing.
import { test, expect } from "../../support/test.js";
import { goTo, openMenu, relOptions, roadmap } from "../../support/page.js";

const station = (page) => page.locator("#stn");
const stop = (page) => roadmap(page).getByRole("button", { name: /^Daily practice/ });
/** The session's row at the top of the thread: its diamonds (named for a screen reader), and the line that ties the question to the one before. */
const row = (page) => page.locator("#path .st.dly .dlym");
const tie = (page) => page.locator("#path .st.dly .dlyt");
/** Where the page and the session stand. */
const now = (page) => page.evaluate(() => {
  const t = window.__t, r = t.daily.run, p = t.cur && t.cur.p;
  return { tab: t.tab, view: t.view, shown: t.daily.shown(), ended: t.daily.ended(), today: t.daily.today(), on: !!r, at: r ? r.at : -1, n: r ? r.steps.length : 0,
    marks: r ? r.marks.join(",") : "", groups: r ? r.groups.map((g) => g.n) : [], names: r ? r.groups.map((g) => g.name) : [], exercise: r && !r.end ? r.steps[r.at].given.exercise : "",
    pair: p ? p.a + " | " + p.b : null, rel: t.ui && t.ui.rel || null, checked: !!(t.ui && t.ui.checked) };
});
/** Starts a session from the roadmap's stop. */
async function start(page) {
  await openMenu(page);
  await stop(page).click();
  await expect(roadmap(page)).toBeHidden();
}
/** The question on screen is answered with `grade` and left by Next, as its exercise does when the answer is kept and Next is taken: the session hears both through its hooks. */
const answer = (page, grade) => page.evaluate((g) => { const h = window.__t.daily.run.hooks; h.onChecked(g, {}); h.onNext({ skipped: false }); }, grade);
const skip = (page) => page.evaluate(() => window.__t.skipPair());
/** The stopwatch in the top bar, and the step the running clock is on (null when none runs). */
const stopwatch = (page) => page.getByRole("switch", { name: /^Sprint/ });
const clock = (page) => page.evaluate(() => (window.__t.ui && window.__t.ui.tq ? window.__t.ui.tq.key : null));
/** What the last station offers after the tally: one more round, at the learner's pace or against the clock. */
const offer = (page) => page.locator("#path .tup-note").filter({ hasText: "round" });
/** The practice options, and a switch of the session's page in them. */
const sheet = (page) => page.getByRole("dialog", { name: "Practice options" });
const inMix = (page, name) => sheet(page).getByRole("switch", { name, exact: true });
/** The session's rounds as planned: what each is about and the exercises of its questions. */
const rounds = (page) => page.evaluate(() => window.__t.daily.run.plan.rounds.map((t) => ({ kind: t.kind, cats: [...t.cats].sort().join("|"), asks: t.steps.map((s) => s.given.exercise) })));
/** On a phone the top bar steps aside while a field has the keyboard: the focus is let go before the top bar is used. */
const calm = (page) => page.evaluate(() => { if (document.activeElement) document.activeElement.blur(); });

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try { if (localStorage.getItem("rd-stages") === null) localStorage.setItem("rd-stages", "0,1,2,3"); } catch { /* no storage */ }
    window.__riglamTest = (t) => { window.__t = t; };
  });
  await page.goto("/");
  await expect(relOptions(page)).toHaveCount(5);
});

test("the roadmap's stop starts a session; a question says where it stands; the session waits while the learner is elsewhere", async ({ page }) => {
  // the exercise's own pair, begun: a relation picked
  await relOptions(page).first().click();
  await expect(page.locator("#cin")).toBeVisible();
  const own = await now(page);
  expect(own).toMatchObject({ tab: "practice", on: false, rel: "mi" });
  await page.evaluate(() => document.activeElement && document.activeElement.blur());      // (on a phone the top bar steps aside while the field has the keyboard)

  await openMenu(page);
  await expect(stop(page)).toHaveAccessibleName("Daily practice, 9 questions");
  await stop(page).click();
  await expect(roadmap(page)).toBeHidden();
  // three rounds of three questions; the first has no line, since nothing came before it
  expect(await now(page)).toMatchObject({ shown: true, ended: false, at: 0, n: 9, groups: [3, 3, 3], marks: ",,,,,,,," });
  await expect(row(page)).toHaveAccessibleName("Question 1 of 9 in this session");
  await expect(row(page).locator(".minis")).toHaveCount(3);
  await expect(row(page).locator(".minis i.at.now")).toHaveCount(1);
  await expect(tie(page)).toHaveCount(0);

  // skipped: the next one is in its own exercise, with the line that ties it to the one before; nothing is set aside for Review
  await skip(page);
  const two = await now(page);
  expect(two).toMatchObject({ shown: true, at: 1, marks: "skip,,,,,,,," });
  await expect(row(page)).toHaveAccessibleName("Question 2 of 9 in this session");
  await expect(tie(page)).not.toBeEmpty();
  expect(await page.evaluate(() => Object.keys(window.__t.skips).length)).toBe(0);

  // on the roadmap the session's stop is where the learner is, not the exercise its question is in
  await openMenu(page);
  await expect(stop(page)).toHaveAccessibleName("Daily practice, here, question 2 of 9");
  await expect(roadmap(page).locator("[aria-current=page]")).toHaveCount(1);
  // going to an exercise shows that exercise's own attempt as it was left, and the session waits
  await roadmap(page).getByRole("button", { name: /^Relations/ }).click();
  expect(await now(page)).toMatchObject({ tab: "practice", shown: false, on: true, pair: own.pair, rel: "mi" });
  await expect(row(page)).toHaveCount(0);
  await openMenu(page);
  await expect(stop(page)).toHaveAccessibleName("Daily practice, continue");
  // its stop goes on where it was left
  await stop(page).click();
  await expect(roadmap(page)).toBeHidden();
  expect(await now(page)).toMatchObject({ shown: true, at: 1, n: 9, tab: two.tab });
  await expect(row(page)).toHaveAccessibleName("Question 2 of 9 in this session");
});

test("answers color the row, one miss of each round comes back, and the last station says how it went and offers one more round", async ({ page }) => {
  await start(page);
  // up to the first syllogism every answer is right; the syllogism is answered on screen ("I accept" settles it at once), so its result is the exercise's own
  let s = await now(page);
  while (s.exercise !== "syllogism") { await answer(page, "ok"); s = await now(page); }
  const k = s.at;
  await page.locator("#path .chs .crow").filter({ visible: true, hasText: "I accept" }).click();
  await expect.poll(async () => (await now(page)).checked).toBe(true);
  s = await now(page);
  const mine = s.marks.split(",")[k];
  expect(["ok", "bad"]).toContain(mine);
  // the result has the row too, the question's own diamond in the color of its answer, and Next goes on within the session
  await expect(row(page)).toHaveAccessibleName("Question " + (k + 1) + " of 9 in this session: " + (mine === "ok" ? "right" : "wrong"));
  await expect(row(page).locator(".minis i.at." + mine)).toHaveCount(1);
  await expect(tie(page)).toHaveCount(0);
  await expect(station(page)).toHaveAccessibleName(/^Next question/);
  await station(page).click();
  await expect.poll(async () => (await now(page)).at).toBe(k + 1);

  // the rest of the plan: the first two questions of the last round are missed (as far as they are still to come), the others are right
  for (let i = k + 1; i < 9; i++) await answer(page, i === 6 ? "bad" : i === 7 ? "part" : "ok");
  s = await now(page);
  const marks = s.marks.split(",").slice(0, 9), missed = [0, 1, 2].filter((t) => marks.slice(t * 3, t * 3 + 3).some((m) => m === "bad" || m === "part")).length;
  // one question comes back for each round with a miss, however many it had, as a group of its own after the plan
  expect(missed).toBeGreaterThanOrEqual(k < 6 ? 1 : 0);
  expect(s).toMatchObject({ ended: missed === 0, n: 9 + missed });
  if (missed) {
    expect(s).toMatchObject({ shown: true, at: 9, groups: [3, 3, 3, missed] });
    expect(s.names[3]).toBe("Came back");
    await expect(tie(page)).not.toBeEmpty();
    // the last of all is named so on its result
    for (let i = 0; i < missed - 1; i++) await answer(page, "ok");
    expect(await page.evaluate(() => { const r = window.__t.daily.run; r.hooks.onChecked("ok", {}); return r.hooks.next; })).toBe("Finish");
    await page.evaluate(() => window.__t.daily.run.hooks.onNext({ skipped: false }));
  }

  // the last station, in the place of the exercise: how many were right, each round with its questions as they went, what the rest were
  s = await now(page);
  const all = s.marks.split(","), right = all.filter((m) => m === "ok").length;
  expect(s).toMatchObject({ ended: true, shown: false, view: "daily", today: 1, n: 9 + missed });
  await expect(page.locator("#path .ptb-t span")).toHaveText("Daily practice");
  await expect(page.locator("#path .sechead")).toContainText("Session done");
  await expect(page.locator("#path .stm.thing")).toHaveText(right + " of " + (9 + missed) + " right");
  await expect(page.locator("#path .dlyg li")).toHaveCount(3 + (missed ? 1 : 0));
  await expect(page.locator("#path .dlyg .minis i")).toHaveCount(9 + missed);
  await expect(page.locator("#path .dlyg .minis i.ok")).toHaveCount(right);
  if (right < all.length) await expect(page.locator("#path .tup-note").first()).toContainText(/wrong|partly right/);
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem("rd-daily")))).toMatchObject({ n: 1 });
  // the keys do not reach the attempt that waits under it
  const under = await now(page);
  await page.keyboard.press("1"); await page.keyboard.press("n"); await page.keyboard.press("s");
  expect(await now(page)).toMatchObject({ ended: true, rel: under.rel, checked: under.checked, pair: under.pair });

  // one more round: three more questions, on with the count, without a clock; the session is still one of the day's
  await page.getByRole("button", { name: /^one more round$/i }).click();
  s = await now(page);
  expect(s).toMatchObject({ ended: false, shown: true, view: null, at: 9 + missed, n: 12 + missed });
  expect(await clock(page)).toBeNull();
  await expect(row(page)).toHaveAccessibleName("Question " + (10 + missed) + " of " + (12 + missed) + " in this session");
  for (let i = 0; i < 3; i++) await answer(page, "ok");
  expect(await now(page)).toMatchObject({ ended: true, today: 1, n: 12 + missed });
  await expect(page.locator("#path .stm.thing")).toHaveText((right + 3) + " of " + (12 + missed) + " right");

  // its station goes back to the roadmap, where the stop says that a session was done today and starts another
  await expect(station(page)).toHaveAccessibleName("Back to the roadmap");
  await station(page).click();
  await expect(roadmap(page)).toBeVisible();
  await expect(stop(page)).toHaveAccessibleName("Daily practice, done today");
  expect(await now(page)).toMatchObject({ on: false, view: null, ended: false });
  await stop(page).click();
  await expect(roadmap(page)).toBeHidden();
  expect(await now(page)).toMatchObject({ shown: true, at: 0, n: 9 });
});

test("the last station left by the top bar ends the session, and the exercise under it is its own again", async ({ page }) => {
  await start(page);
  for (let i = 0; i < 9; i++) await skip(page);
  // nothing answered: nothing is missed, so nothing comes back
  const end = await now(page);
  expect(end).toMatchObject({ ended: true, n: 9, marks: "skip,skip,skip,skip,skip,skip,skip,skip,skip", view: "daily" });
  await expect(page.locator("#path .stm.thing")).toHaveText("0 of 9 right");
  await expect(page.locator("#path .tup-note").first()).toHaveText("9 skipped.");
  // the station at the foot has the focus, so that Enter goes on from it as from a result
  await expect(station(page)).toBeFocused();

  await page.locator(".tstn").click();
  await expect(roadmap(page)).toBeVisible();
  await expect(stop(page)).toHaveAccessibleName("Daily practice, done today");
  expect(await now(page)).toMatchObject({ on: false, view: null, today: 1 });
  // the exercise the last question was in has its own attempt, not the session's last station
  await roadmap(page).locator("[aria-current=page]").click();
  await expect(roadmap(page)).toBeHidden();
  expect(await now(page)).toMatchObject({ tab: end.tab, shown: false, ended: false, on: false });
  await expect(page.locator("#path .sechead").first()).not.toContainText("Session done");
  await goTo(page, "Relations");
  await expect(relOptions(page)).toHaveCount(5);
});

test("a session has no clock where the exercises have Sprint on; the stopwatch and a Sprint round are the session's own", async ({ page }) => {
  // Sprint on in every exercise, with times long enough that none runs out here; Relations then has its own switch, off
  await page.addInitScript(() => { localStorage.setItem("rd-blitz", "1"); for (const k of ["rd-timer", "rd-timer-rel", "rd-timer-q", "rd-timer-syl", "rd-timer-cats", "rd-timer-cat"]) localStorage.setItem(k, "60000"); });
  await page.reload();
  await expect(relOptions(page)).toHaveCount(5);
  await expect(stopwatch(page)).toHaveAttribute("aria-checked", "true");
  await expect.poll(() => clock(page)).not.toBeNull();
  await stopwatch(page).click();
  await expect(stopwatch(page)).toHaveAttribute("aria-checked", "false");

  // no question of the session is asked against the clock, whatever its exercise
  await start(page);
  const seen = new Set();
  for (let i = 0; i < 9; i++) {
    const s = await now(page);
    expect(s).toMatchObject({ shown: true, at: i });
    seen.add(s.exercise);
    await expect(stopwatch(page), "question " + (i + 1) + ", " + s.exercise).toHaveAttribute("aria-checked", "false");
    expect(await clock(page), "question " + (i + 1) + ", " + s.exercise).toBeNull();
    if (i === 2) {
      // the stopwatch in a session is the session's: on, the question has its clock, and so has the one after it; off again, none has
      await calm(page);
      await stopwatch(page).click();
      await expect(stopwatch(page)).toHaveAttribute("aria-checked", "true");
      await expect.poll(() => clock(page)).not.toBeNull();
      await answer(page, "ok");
      expect(await now(page)).toMatchObject({ shown: true, at: 3 });
      await expect(stopwatch(page)).toHaveAttribute("aria-checked", "true");
      await expect.poll(() => clock(page)).not.toBeNull();
      await calm(page);
      await stopwatch(page).click();
      await expect(stopwatch(page)).toHaveAttribute("aria-checked", "false");
      expect(await clock(page)).toBeNull();
      // meanwhile the exercises have their own switches as they were: Relations off, Pervasions on, and the session goes on without a clock
      await goTo(page, "Relations");
      expect(await now(page)).toMatchObject({ tab: "practice", shown: false, on: true });
      await expect(stopwatch(page)).toHaveAttribute("aria-checked", "false");
      await goTo(page, "Pervasions");
      await expect(stopwatch(page)).toHaveAttribute("aria-checked", "true");
      await calm(page);
      await start(page);
      expect(await now(page)).toMatchObject({ shown: true, at: 3 });
      await expect(stopwatch(page)).toHaveAttribute("aria-checked", "false");
      expect(await clock(page)).toBeNull();
      i = 3;
    }
    await answer(page, "ok");
  }
  expect(seen.size).toBeGreaterThan(2);

  // everything right: the last station suggests the next round as a Sprint round, and offers one without the clock beside it
  expect(await now(page)).toMatchObject({ ended: true, n: 9 });
  await expect(offer(page)).toHaveText("Everything right. Up for a challenge? Sprint round, or one more round without the clock.");
  await page.getByRole("button", { name: "Sprint round" }).click();
  expect(await now(page)).toMatchObject({ ended: false, shown: true, at: 9, n: 12 });
  for (let i = 9; i < 12; i++) {
    await expect(stopwatch(page), "question " + (i + 1)).toHaveAttribute("aria-checked", "true");
    await expect.poll(() => clock(page), { message: "question " + (i + 1) }).not.toBeNull();
    if (i === 10) await skip(page); else await answer(page, "ok");
  }
  // not everything was right this time (one was skipped): the last station offers the round without the clock first
  expect(await now(page)).toMatchObject({ ended: true, n: 12 });
  await expect(offer(page)).toHaveText("Want more today? One more round, or a Sprint round against the clock.");
  await page.getByRole("button", { name: "One more round" }).click();
  expect(await now(page)).toMatchObject({ ended: false, shown: true, at: 12, n: 15 });
  await expect(stopwatch(page)).toHaveAttribute("aria-checked", "false");
  expect(await clock(page)).toBeNull();

  // the exercises still have their own switches
  await calm(page);
  await goTo(page, "Relations");
  await expect(stopwatch(page)).toHaveAttribute("aria-checked", "false");
  await goTo(page, "Syllogisms");
  await expect(stopwatch(page)).toHaveAttribute("aria-checked", "true");
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem("rd-per-ex")))).toEqual({ practice: { blitz: false } });
});

test("the session's options: the exercises in the mix; a change holds from the next round, and is kept", async ({ page }) => {
  await start(page);
  expect(await now(page)).toMatchObject({ shown: true, at: 0, n: 9, groups: [3, 3, 3] });
  const first = (await rounds(page))[0];

  // the session's line heads the practice options of its question, and opens its page
  await calm(page);
  await page.getByRole("button", { name: "Practice options", exact: true }).click();
  await expect(sheet(page).getByText("5 exercises · from everything")).toBeVisible();
  await sheet(page).getByRole("button", { name: "Exercises and questions: more" }).click();
  await expect(page.locator("#path .ptb-t")).toHaveText("Daily practice");
  for (const [name, on] of [["Relations", "true"], ["Pervasions", "true"], ["Syllogisms", "true"], ["Categories", "true"], ["Find an instance", "true"], ["Find a pair", "false"]]) await expect(inMix(page, name), name).toHaveAttribute("aria-checked", on);
  await expect(sheet(page).getByRole("button", { name: "Everything" })).toHaveAttribute("aria-pressed", "true");

  // Syllogisms and Categories out: the round being asked stays as it is; the two after it are planned anew, three questions each from what is left
  await inMix(page, "Syllogisms").click();
  await inMix(page, "Categories").click();
  await expect(inMix(page, "Categories")).toHaveAttribute("aria-checked", "false");
  let plan = await rounds(page);
  expect(plan[0]).toEqual(first);
  expect(plan.slice(1).map((t) => t.asks)).toEqual([["instance", "practice", "debate"], ["instance", "practice", "debate"]]);
  expect(await now(page)).toMatchObject({ shown: true, at: 0, n: 9, groups: [3, 3, 3] });

  // one more out: a mix of two is rounds of two; the last two stay in, and the app says why
  await inMix(page, "Find an instance").click();
  plan = await rounds(page);
  expect(plan[0]).toEqual(first);
  expect(plan.slice(1).map((t) => t.asks)).toEqual([["practice", "debate"], ["practice", "debate"]]);
  expect(await now(page)).toMatchObject({ at: 0, n: 7, groups: [3, 2, 2] });
  await inMix(page, "Relations").click();
  await expect(page.locator("#path .ptoast")).toHaveText("A session mixes at least two exercises");
  await expect(inMix(page, "Relations")).toHaveAttribute("aria-checked", "true");
  expect((await rounds(page)).slice(1).map((t) => t.asks)).toEqual([["practice", "debate"], ["practice", "debate"]]);

  // Find a pair in: every other round on a pair closes with it. Both choices are kept with the settings
  await inMix(page, "Find a pair").click();
  await sheet(page).getByRole("button", { name: "Newest stage" }).click();
  await expect(sheet(page).getByRole("button", { name: "Newest stage" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => [localStorage.getItem("rd-daily-mix"), localStorage.getItem("rd-daily-from")])).toEqual(["practice,debate,find", "new"]);
  expect([...new Set((await rounds(page)).slice(1).flatMap((t) => t.asks))].sort()).toEqual(["debate", "find", "practice"]);

  // back to the options, which say what the session is set to, and out: the question is as it was
  await page.getByRole("button", { name: "Back to the options" }).click();
  await expect(sheet(page).getByText("3 exercises · from the newest stage")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(sheet(page)).toBeHidden();
  expect(await now(page)).toMatchObject({ shown: true, at: 0, n: 9 });
  await expect(row(page)).toHaveAccessibleName("Question 1 of 9 in this session");

  // the session runs to its end in the new mix
  for (let i = 0; i < 9; i++) {
    const s = await now(page);
    expect(s).toMatchObject({ shown: true, at: i });
    if (i > 2) expect(["practice", "debate", "find"], "question " + (i + 1)).toContain(s.exercise);
    await answer(page, "ok");
  }
  expect(await now(page)).toMatchObject({ ended: true, n: 9 });

  // the last station opens the page by itself: closing it leaves the station, and the round added there is of the mix as it is then
  await page.getByRole("button", { name: "Change what a session mixes" }).click();
  await expect(page.locator("#path .ptb-t")).toHaveText("Daily practice");
  await expect(inMix(page, "Find a pair")).toHaveAttribute("aria-checked", "true");
  await inMix(page, "Find a pair").click();
  await page.getByRole("button", { name: "Close the options" }).click();
  await expect(sheet(page)).toBeHidden();
  expect(await now(page)).toMatchObject({ ended: true, n: 9 });
  await expect(page.locator("#path .sechead").first()).toContainText("Session done");
  await page.getByRole("button", { name: /^one more round$/i }).click();
  expect(await now(page)).toMatchObject({ ended: false, shown: true, at: 9, n: 11 });
  expect((await rounds(page))[3].asks).toEqual(["practice", "debate"]);

  // after a reload the options are as they were set
  await page.reload();
  await expect(relOptions(page)).toHaveCount(5);
  expect(await page.evaluate(() => { const o = window.__t.daily.options; return [o.mix.join(","), o.from]; })).toEqual(["practice,debate", "new"]);
});

test("the stop says how long a session of the mix is; drawn from mistakes, the next round is on the pair that was missed", async ({ page }) => {
  // before the first stage there is no course term: three rounds on pairs. A mix of two, and a name that is no exercise passed over
  await page.evaluate(() => { localStorage.setItem("rd-stages", "0"); localStorage.setItem("rd-daily-mix", "nowhere,debate,practice"); });
  await page.reload();
  await expect(relOptions(page)).toHaveCount(5);
  await openMenu(page);
  await expect(stop(page)).toHaveAccessibleName("Daily practice, 6 questions");
  await stop(page).click();
  await expect(roadmap(page)).toBeHidden();
  const plan = await rounds(page);
  expect(plan.map((t) => t.kind)).toEqual(["pair", "pair", "pair"]);
  for (const t of plan) expect(t.asks).toEqual(["practice", "debate"]);

  // the pair of the last round was missed a moment ago, as Relations keeps a wrong answer; another pair was missed and put right since
  const [a, b] = plan[2].cats.split("|"), [c, d] = plan[1].cats.split("|");
  await page.evaluate(([a, b, c, d]) => {
    const doc = (id, x, y, grade, ms) => ({ pairId: id, a: x, b: y, catA: x, catB: y, chosen: null, key: "4", grade, correct: grade === "ok", at: new Date(Date.now() - ms).toISOString() });
    Object.assign(window.__t.answers, { "t-miss": doc("t-miss", a, b, "bad", 3000), "t-miss-2": doc("t-miss-2", c, d, "bad", 2000), "t-right": doc("t-right", d, c, "ok", 1000) });
  }, [a, b, c, d]);
  await calm(page);
  await page.getByRole("button", { name: "Practice options", exact: true }).click();
  await sheet(page).getByRole("button", { name: "Exercises and questions: more" }).click();
  await sheet(page).getByRole("button", { name: "Mistakes" }).click();
  await expect(sheet(page).getByRole("button", { name: "Mistakes" })).toHaveAttribute("aria-pressed", "true");
  const after = await rounds(page);
  expect(after[0]).toEqual(plan[0]);
  expect(after[1].cats).toBe(plan[2].cats);
  expect(after.length).toBe(3);
  expect(after[2].cats).not.toBe(plan[2].cats);
});

/** Starts the app again with what a session mixes as the device would keep it (and more of what it keeps). */
async function withMix(page, mix, more = {}) {
  await page.evaluate(([m, x]) => { localStorage.setItem("rd-daily-mix", m); for (const [k, v] of Object.entries(x)) localStorage.setItem(k, v); }, [mix, more]);
  await page.reload();
  await expect(relOptions(page)).toHaveCount(5);
}

test("the session's row stays at the top of a question through its later steps", async ({ page }) => {
  await withMix(page, "practice,debate,syllogism", { "rd-syllogism-thesis": "1" });
  await start(page);
  // Relations: with the relation picked, the first step folds into the strip over the examples, and its row with it: there when the strip is opened
  let s = await now(page);
  expect(s).toMatchObject({ exercise: "practice", at: 0 });
  await expect(row(page)).toHaveAccessibleName("Question 1 of " + s.n + " in this session");
  await relOptions(page).first().click();
  await expect(page.locator("#cin")).toBeVisible();
  await calm(page);
  await page.getByRole("button", { name: "Open the earlier steps" }).click();
  await expect(page.locator("#path .pstrip.open .st.dly .dlym")).toHaveAccessibleName("Question 1 of " + s.n + " in this session");
  await page.getByRole("button", { name: "Fold the earlier steps" }).click();
  // Pervasions: the row and the line that ties the question to the one before are there on the four statements, and stay while the relation is picked
  while (s.exercise !== "debate") { await answer(page, "ok"); s = await now(page); }
  await expect(row(page)).toHaveAccessibleName("Question " + (s.at + 1) + " of " + s.n + " in this session");
  const carried = await tie(page).innerText();
  expect(carried).not.toBe("");
  for (let i = 0; i < 4; i++) {
    await expect(page.locator("#path .sechead").first()).toContainText((i + 1) + " of 4");
    await page.locator("#path .chs .crow").filter({ visible: true }).first().click();
  }
  await expect(page.locator("#path .sechead").nth(1)).toContainText("Relation");
  await expect(row(page)).toHaveAccessibleName("Question " + (s.at + 1) + " of " + s.n + " in this session");
  await expect(tie(page)).toHaveText(carried);
  // Syllogisms with Thesis first: after Why? to a thesis that does not hold, the reason is asked under the thesis, and the row is still above it
  const falseThesis = () => page.evaluate(() => { const t = window.__t, c = t.cur && t.cur.c; return t.daily.shown() && !!c && !c.checks.t.ok; });
  let found = false;
  for (let i = 0; i < 80 && !found; i++) {
    s = await now(page);
    if (s.ended) { await page.evaluate(() => window.__t.daily.more(false)); continue; }
    if (s.exercise === "syllogism" && await falseThesis()) found = true; else await answer(page, "ok");
  }
  expect(found, "a syllogism whose thesis does not hold").toBe(true);
  const asked = (await tie(page).count()) ? await tie(page).innerText() : "";
  await page.locator("#path .chs .crow").filter({ visible: true, hasText: "Why?" }).click();
  await expect(page.locator("#path .sylwhy")).toHaveText("Why?");
  await expect(row(page)).toHaveAccessibleName("Question " + (s.at + 1) + " of " + s.n + " in this session");
  if (asked) await expect(tie(page)).toHaveText(asked); else await expect(tie(page)).toHaveCount(0);
});

test("on a device that stores nothing, a session still hears how an answer went", async ({ page }) => {
  await page.evaluate(() => { window.__t.db = null; });
  await start(page);
  // a syllogism answered on screen ("I accept" settles it at once): its mark is the answer's, though nothing was kept
  let s = await now(page);
  while (s.exercise !== "syllogism") { await answer(page, "ok"); s = await now(page); }
  const k = s.at;
  await page.locator("#path .chs .crow").filter({ visible: true, hasText: "I accept" }).click();
  await expect.poll(async () => (await now(page)).checked).toBe(true);
  expect(await page.evaluate(() => window.__t.db)).toBe(null);
  const mine = (await now(page)).marks.split(",")[k];
  expect(["ok", "bad"]).toContain(mine);
  await expect(row(page)).toHaveAccessibleName("Question " + (k + 1) + " of 9 in this session: " + (mine === "ok" ? "right" : "wrong"));
});
