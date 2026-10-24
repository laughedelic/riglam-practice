// Help that fades as the stages go up (src/domain/stages.ts): the next step of the negation track offered on a result once the pairs before it go
// well (practice/negations.ts), the offer of the next stage from an exercise other than Categories (practice/stage-offer.ts), the guided form of an
// exercise (practice/guided.ts), and the small tag of a course term the learner is still meeting, which opens its definition (practice/stops.ts,
// termTags), on the Path. Negations in Pervasions and Find a pair are checked here too.
import { test, expect } from "../../support/test.js";
import { goTo, isPhone, ready, relOptions } from "../../support/page.js";
import { KEY_STORE, dataKey, serveCourse, withCourse } from "../../support/data-key.js";

const hook = () => { window.__riglamTest = (t) => { window.__t = t; }; };
const onPath = () => { if (localStorage.getItem("rd-design") === null) localStorage.setItem("rd-design", "path"); };
const ORDER = ["mi", "3ab", "3ba", "4", "con"];
const fwd = (page) => page.locator("#stage .pbar .fwd");
const pathChoices = (page) => page.locator("#path .chs .crow");
const station = (page) => page.locator("#stn");
const withKey = (page) => page.addInitScript(([store, key]) => { try { localStorage.setItem(store, key); } catch { /* storage unavailable */ } }, [KEY_STORE, dataKey]);

/** Picks the pair's own relation and writes anything in the cells it leaves possible, then checks: a right relation (classic page). */
async function rightClassic(page, testInfo) {
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
/** The same on the Path: the relation, the examples with Enter after each, and Check. */
async function rightPath(page) {
  const rel = await page.evaluate(() => window.__t.cur.p.relation);
  await pathChoices(page).nth(ORDER.indexOf(rel)).click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (let i = 0; i < 4 && (await field.isVisible()); i++) { await field.fill("thing " + (i + 1)); if ((await field.getAttribute("enterkeyhint")) === "done") { await field.blur(); break; } await field.press("Enter"); }   // (the last one is left without Enter, which would take the Check at once)
  await expect(station(page)).toHaveAccessibleName(/^Check/);
  await station(page).click();
  await expect.poll(() => page.evaluate(() => window.__t.ui.checked)).toBe(true);
}

test("after five right plain pairs in a row, negating one side is offered on the result, and a tap turns it on", async ({ page }, testInfo) => {
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  for (let i = 0; i < 4; i++) {
    await rightClassic(page, testInfo);
    await expect(page.locator(".catoffer")).toHaveCount(0);
    await page.keyboard.press("n");
  }
  await rightClassic(page, testInfo);
  const offer = page.locator(".catoffer");
  await expect(offer).toBeVisible();
  await expect(offer).toContainText("Plain pairs are going well. Try pairs with a negated side?");
  expect(await page.evaluate(() => localStorage.getItem("rd-negation"))).toBeNull();     // nothing changes without the tap
  await offer.getByRole("button", { name: "Negate one side" }).click();
  await expect(page.locator(".catoffer")).toHaveCount(0);
  await expect(page.getByRole("status").filter({ hasText: "Negations are on" })).toBeVisible();
  expect(await page.evaluate(() => [localStorage.getItem("rd-negation"), !!localStorage.getItem("rd-neg-offer")])).toEqual(["one", true]);
});

test("on the Path the offer shows on the result too; Not now keeps negations off, and the next one needs another run", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); // six pairs in a row: the choice and the station are taken at once (the project's own option does not reach the page)
  await page.addInitScript(onPath);
  await page.addInitScript(hook);
  await page.goto("/");
  await expect(pathChoices(page)).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    if (i) { await station(page).click(); await expect(pathChoices(page)).toHaveCount(5); }
    await rightPath(page);
    if (i < 4) await expect(page.locator("#path .offer")).toHaveCount(0);
  }
  const offer = page.locator("#path .offer");
  await expect(offer).toBeVisible();
  await expect(offer).toContainText("Try pairs with a negated side?");
  await offer.getByRole("button", { name: "Not now" }).click();
  await expect(page.locator("#path [role=status]").filter({ hasText: "Plain pairs only, for now" })).toBeVisible();
  expect(await page.evaluate(() => [localStorage.getItem("rd-negation"), !!localStorage.getItem("rd-neg-offer")])).toEqual([null, true]);
  // one more right pair is not another run of five
  await station(page).click();
  await expect(pathChoices(page)).toHaveCount(5);
  await rightPath(page);
  await expect(page.locator("#path .offer")).toHaveCount(0);
});

test("on the Path five right relations at the highest stage offer the next stage, before the negation offer, and a tap adds it", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(onPath);
  await page.addInitScript(() => { if (localStorage.getItem("rd-stages") === null) localStorage.setItem("rd-stages", "1"); });
  await page.addInitScript(hook);
  await page.goto("/");
  await expect(pathChoices(page)).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    if (i) { await station(page).click(); await expect(pathChoices(page)).toHaveCount(5); }
    await rightPath(page);
    if (i < 4) await expect(page.locator("#path .offer")).toHaveCount(0);
  }
  // every pair at stage 1 is new at the highest stage on: the run is five, and the stage offer goes first (one offer at a time)
  const offer = page.locator("#path .offer");
  await expect(offer).toHaveCount(1);
  await expect(offer).toContainText("Stage 1 is going well. Add stage 2 to the mix?");
  expect(await page.evaluate(() => [localStorage.getItem("rd-stages"), window.__t.ui.negOffer])).toEqual(["1", null]);     // nothing changes without the tap
  await offer.getByRole("button", { name: "Add stage 2" }).click();
  await expect(page.locator("#path [role=status]").filter({ hasText: "Stage 2, " })).toBeVisible();
  expect(await page.evaluate(() => [localStorage.getItem("rd-stages"), window.__t.stageRun])).toEqual(["1,2", { up: 0, down: 0 }]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("rd-ex-runs")).practice)).toEqual({ run: 5, right: 5 });
});

test("on the Path, Relations spells out the relations until its twentieth right answer, then Guided turns off with a line saying why, and the switch brings it back", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(onPath);
  await page.addInitScript(() => { if (localStorage.getItem("rd-ex-runs") === null) localStorage.setItem("rd-ex-runs", JSON.stringify({ practice: { run: 5, right: 19 } })); });
  await page.addInitScript(hook);
  await page.goto("/");
  await expect(pathChoices(page)).toHaveCount(5);
  await expect(pathChoices(page).first().locator(".ct small"), "the guided form: what the relation says of the pair").toHaveCount(1);
  await rightPath(page);
  await expect(page.locator("#path [role=status]").filter({ hasText: "20 right answers in Relations: Guided is off from now on" })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("rd-guided")))).toEqual({ practice: false });
  await station(page).click();
  await expect(pathChoices(page)).toHaveCount(5);
  await expect(pathChoices(page).first().locator(".ct small"), "the relations by their names alone").toHaveCount(0);
  await page.getByRole("button", { name: "Practice options" }).click();
  const sheet = page.getByRole("dialog", { name: "Practice options" });
  const sw = sheet.getByRole("switch", { name: /^Guided/ });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("rd-guided")))).toEqual({ practice: true });
  await page.keyboard.press("Escape");
  await expect(pathChoices(page).first().locator(".ct small")).toHaveCount(1);
});

test("with negations on, Pervasions draws negated pairs too, and Accept to Q4 on one with nothing neither is right", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("rd-negation", "one"); localStorage.setItem("rd-stages", "1,2,3"); });
  await page.addInitScript(hook);
  await page.goto("/");
  await expect(page.locator("#stage .head .pair")).toBeVisible();
  await goTo(page, "Pervasions");
  await expect.poll(() => page.evaluate(() => window.__t.tab)).toBe("debate");
  // about one draw in twenty is a negated pair with four possibilities and nothing neither: 300 tries all but never miss it
  const empty = () => page.evaluate(() => { const p = window.__t.cur.p; return !!p.neg && p.relation === "4" && !p.ex.nei; });
  for (let i = 0; i < 300 && !(await empty()); i++) await page.evaluate(() => window.__t.next());
  const p = await page.evaluate(() => window.__t.cur.p);
  expect(p.neg).toMatch(/^(a|b)$/);     // one side, either one
  expect(p.relation).toBe("4");
  // Why? to Q1 to Q3 with anything, Accept to Q4: nothing is neither
  for (let q = 0; q < 3; q++) {
    await page.keyboard.press("w");
    await page.fill("#dex", "thing " + (q + 1));
    await page.keyboard.press("Enter");
  }
  await page.keyboard.press("a");
  await expect.poll(() => page.evaluate(() => window.__t.ui.step)).toBe(4);
  await expect(relOptions(page)).toHaveCount(5);
  await relOptions(page).nth(ORDER.indexOf("4")).click();
  await expect.poll(() => page.evaluate(() => window.__t.ui.checked)).toBe(true);
  expect(await page.evaluate(() => [window.__t.ui.res.relOk, window.__t.ui.res.implied, window.__t.ui.res.cells.nei.v])).toEqual([true, "4", "ok"]);
});

test("Find a pair takes a negation as named, with or without the brackets, and has no sixth relation to ask for", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("rd-negation", "one"); localStorage.setItem("rd-findrel", "4"); });
  await page.addInitScript(hook);
  await page.goto("/");
  await expect(page.locator("#stage .head .pair")).toBeVisible();
  await goTo(page, "Find a pair");
  await expect(page.locator("#fw-a")).toBeVisible();
  await expect(page.locator(".cap")).toContainText("Four possibilities.");
  await expect(page.locator(".cap")).not.toContainText("without neither");
  await page.fill("#fw-a", "forms");
  await page.fill("#fw-b", "non-wooden things");
  await page.locator("#fw-b").press("Enter");
  await expect.poll(() => page.evaluate(() => window.__t.ui.step)).toBe(1);
  expect(await page.evaluate(() => { const p = window.__t.cur.p; return [p.a, p.b, p.neg, p.relation, !!p.own]; })).toEqual(["forms", "non-(wooden things)", "b", "4", false]);
  // with the brackets off the same words are kept as typed
  await page.evaluate(() => { localStorage.setItem("rd-neg-brackets", "0"); });
  await page.reload();
  await goTo(page, "Find a pair");
  await page.fill("#fw-a", "forms");
  await page.fill("#fw-b", "non-wooden things");
  await page.locator("#fw-b").press("Enter");
  await expect.poll(() => page.evaluate(() => window.__t.ui.step)).toBe(1);
  expect(await page.evaluate(() => { const p = window.__t.cur.p; return [p.a, p.b, p.neg, p.relation]; })).toEqual(["forms", "non-wooden things", "b", "4"]);
});

const course = withCourse ? test : test.skip;
const NEW2 = ["extf", "col", "shape", "vis"];   // the categories with a Dudra term that open at stage 2
// a device that has met the terms of stage 2 at their stops and is still meeting them (box 1), with Form settled and no stop due (src/domain/intro.ts)
const meeting = (box) => {
  const terms = { form: { box: 3, shows: 1 } };
  for (const id of ["extf", "col", "shape", "vis"]) terms[id] = { box, shows: 1, at: 0 };
  localStorage.setItem("rd-stages", "1,2"); localStorage.setItem("rd-terms", JSON.stringify({ n: 10, next: 1000, terms }));
};

course("a course term the learner is still meeting has a small tag in the question on the Path, which opens its definition, in Relations and Categories", async ({ page }) => {
  await withKey(page);
  await serveCourse(page, dataKey);
  await page.addInitScript(onPath);
  await page.addInitScript(meeting, 1);
  await page.addInitScript(hook);
  await page.goto("/");
  await expect(pathChoices(page).first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!window.__t.DATA && Object.values(window.__t.DATA.terms).some((t) => t.d))).toBe(true);
  const drawNew = () => page.evaluate((ids) => { for (let i = 0; i < 200; i++) { const p = window.__t.cur.p; if (ids.includes(p.catA) || ids.includes(p.catB)) return p; window.__t.next(); } return null; }, NEW2);
  const termOf = (x) => page.evaluate(([ids, x]) => window.__t.DATA.cats.find((c) => c.id === ([x.catA, x.catB].find((id) => ids.includes(id)))).term, [NEW2, x]);
  // the tag under the term of the pair
  const q = await drawNew();
  expect(q).not.toBeNull();
  await page.evaluate(() => window.__t.render());
  const side = NEW2.includes(q.catA) ? 0 : 1;
  const tag = page.locator("#path .pairst").nth(side).locator(".ntag");
  await expect(tag).toContainText((await termOf(q)).toLowerCase());
  await tag.locator(".dterm").click();
  await expect(page.locator("#path .ntdef .pdef .pdh")).toContainText(await termOf(q));
  // Categories asks about the categories that are open: those of stage 2 have their tags while step 1 is asked
  await page.evaluate(() => { localStorage.setItem("rd-ex", "categories"); });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!(window.__t.cur && window.__t.cur.q))).toBe(true);
  for (let i = 0; i < 40 && !(await page.evaluate((ids) => window.__t.cur.q.rows.some((r) => ids.includes(r.cat)), NEW2)); i++) await page.evaluate(() => { window.__t.next(); });
  await page.evaluate(() => window.__t.render());
  await expect(page.locator("#path .ntag").first()).toBeVisible();
});

course("a settled term has no tag: the definitions are a tap away in the terms of the pair", async ({ page }) => {
  await withKey(page);
  await serveCourse(page, dataKey);
  await page.addInitScript(onPath);
  await page.addInitScript(meeting, 3);
  await page.addInitScript(hook);
  await page.goto("/");
  await expect(pathChoices(page).first()).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!window.__t.DATA && Object.values(window.__t.DATA.terms).some((t) => t.d))).toBe(true);
  for (let i = 0; i < 8; i++) {
    await expect(page.locator("#path .ntag")).toHaveCount(0);
    await page.evaluate(() => { window.__t.next(); });
  }
});
