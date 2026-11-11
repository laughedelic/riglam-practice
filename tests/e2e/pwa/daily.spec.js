// Daily practice (src/app/practice/daily.ts, src/app/path/daily.tsx; the plan is src/domain/session.ts): the stop at the roadmap's fork starts a session of
// questions that move between the exercises; each stands in its exercise with the session's row at the top of its thread; a missed question of a thread comes
// back at the end; the last station says how it went and offers one more thread, and from it the roadmap is back.
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
  // three threads of three questions; the first has no line, since nothing came before it
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

test("answers color the row, one miss of each thread comes back, and the last station says how it went and offers one more thread", async ({ page }) => {
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

  // the rest of the plan: the first two questions of the last thread are missed (as far as they are still to come), the others are right
  for (let i = k + 1; i < 9; i++) await answer(page, i === 6 ? "bad" : i === 7 ? "part" : "ok");
  s = await now(page);
  const marks = s.marks.split(",").slice(0, 9), missed = [0, 1, 2].filter((t) => marks.slice(t * 3, t * 3 + 3).some((m) => m === "bad" || m === "part")).length;
  // one question comes back for each thread with a miss, however many it had, as a group of its own after the plan
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

  // the last station, in the place of the exercise: how many were right, each thread with its questions as they went, what the rest were
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

  // one more thread: three more questions, on with the count; the session is still one of the day's
  await page.getByRole("button", { name: "One more thread" }).click();
  s = await now(page);
  expect(s).toMatchObject({ ended: false, shown: true, view: null, at: 9 + missed, n: 12 + missed });
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
