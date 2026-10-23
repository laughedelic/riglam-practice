// Help that fades as the stages go up (src/domain/stages.ts): the next step of the negation track offered on a result once the pairs before it go
// well (practice/negations.ts), and a newly opened category's definition shown with the question up to stage 3 (practice/terms.js, newTerms),
// in the classic design and on the Path. Negations in Pervasions and Find a pair are checked here too.
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
  for (let i = 0; i < 4 && (await field.isVisible()); i++) { await field.fill("thing " + (i + 1)); await field.press("Enter"); }
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
  await rightPath(page);
  await expect(page.locator("#path .offer")).toHaveCount(0);
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

course("up to stage 3, a newly opened category's definition shows with the question, in Relations and Categories, classic and on the Path", async ({ page }) => {
  await withKey(page);
  await serveCourse(page, dataKey);
  await page.addInitScript(() => localStorage.setItem("rd-stages", "1,2"));
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  await expect.poll(() => page.evaluate(() => !!window.__t.DATA && Object.values(window.__t.DATA.terms).some((t) => t.d))).toBe(true);
  const drawNew = () => page.evaluate((ids) => { for (let i = 0; i < 200; i++) { const p = window.__t.cur.p; if (ids.includes(p.catA) || ids.includes(p.catB)) return p; window.__t.next(); } return null; }, NEW2);
  const p = await drawNew();
  expect(p).not.toBeNull();
  const term = await page.evaluate((x) => window.__t.DATA.cats.find((c) => c.id === ([x.catA, x.catB].find((id) => ["extf", "col", "shape", "vis"].includes(id)))).term, p);
  const box = page.locator("#stage .newdefs");
  await expect(box).toBeVisible();
  await expect(box).toContainText("New at stage 2");
  await expect(box.locator(".ddef dt").first()).toContainText(term);
  // the Path draws the same, with the question
  await page.evaluate(() => { localStorage.setItem("rd-design", "path"); });
  await page.reload();
  await expect(pathChoices(page).first()).toBeVisible();
  const q = await drawNew();
  expect(q).not.toBeNull();
  await page.evaluate(() => window.__t.render());
  await expect(page.locator("#path .newdefs")).toContainText("New at stage 2");
  // Categories asks about the categories that are open: those of stage 2 show their definitions while step 1 is asked
  await page.evaluate(() => { localStorage.setItem("rd-design", "classic"); });
  await page.reload();
  await ready(page);
  await goTo(page, "Categories");
  await expect(page.locator(".catcard")).toBeVisible();
  for (let i = 0; i < 40 && !(await page.evaluate((ids) => window.__t.cur.q.rows.some((r) => ids.includes(r.cat)), NEW2)); i++) await page.evaluate(() => { window.__t.next(); });
  await expect(page.locator(".catcard .newdefs")).toContainText("New at stage 2");
});

course("from stage 4 on, the definitions are a tap away, not shown with the question", async ({ page }) => {
  await withKey(page);
  await serveCourse(page, dataKey);
  await page.addInitScript(() => localStorage.setItem("rd-stages", "1,2,3,4"));
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  await expect.poll(() => page.evaluate(() => !!window.__t.DATA && Object.values(window.__t.DATA.terms).some((t) => t.d))).toBe(true);
  for (let i = 0; i < 8; i++) {
    await expect(page.locator(".newdefs")).toHaveCount(0);
    await page.evaluate(() => { window.__t.next(); });
  }
});
