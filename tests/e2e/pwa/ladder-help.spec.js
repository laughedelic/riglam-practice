// Help that fades as the stages go up (src/domain/stages.ts): the next step of the negation track offered on a result once the pairs before it go
// well (practice/negations.ts), the next stage coming in by itself on the Path, with a station that says so (practice/stage-offer.ts), the guided form of an
// exercise (practice/guided.ts), and the small tag of a course term the learner is still meeting, which opens its definition (practice/stops.ts,
// termTags), on the Path. Negations in Pervasions and Find a pair are checked here too.
import { test, expect } from "../../support/test.js";
import { goTo, isPhone, ready, relOptions } from "../../support/page.js";
import { KEY_STORE, dataKey, serveCourse, withCourse } from "../../support/data-key.js";
import { readOpen } from "../../../scripts/lib/course-files.mjs";

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

/** Five right relations on the Path from a device at stage 1, or the `stages` given: the page is on the fifth result. */
async function fiveRight(page, init = () => {}, stages = "1") {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(onPath);
  await page.addInitScript((s) => { if (localStorage.getItem("rd-stages") === null) localStorage.setItem("rd-stages", s); }, stages);
  await page.addInitScript(init);
  await page.addInitScript(hook);
  await page.goto("/");
  await expect(pathChoices(page)).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    if (i) { await station(page).click(); await expect(pathChoices(page)).toHaveCount(5); }
    await rightPath(page);
    if (i < 4) await expect(page.locator("#path .tup")).toHaveCount(0);
  }
}

test("on the Path five right relations at the highest stage bring the next stage by themselves: a station says what the stages are, and Next takes it", async ({ page }) => {
  // stage 0, everyday things alone, has no new terms: a run of five brings stage 1
  await fiveRight(page, undefined, "0");
  // no prompt on the result, and nothing changes before the station
  await expect(page.locator("#path .offer")).toHaveCount(0);
  await expect(page.locator("#path .tup")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("rd-stages"))).toBe("0");
  // the Next station says what comes: the stage, in a color of its own (green, like the full ring), not the next question's name
  await expect(station(page)).toHaveAccessibleName(/^Next: new stage/);
  await expect(station(page)).toHaveClass(/\bstk-up\b/);
  expect(await station(page).evaluate((b) => getComputedStyle(b.querySelector(".go")).backgroundColor)).not.toBe(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--blue")));
  await station(page).click();
  const up = page.locator("#path .tstage");
  await expect(up).toBeVisible();
  await expect(page.locator("#path .sechead")).toContainText("New stage");
  await expect(page.locator("#path .sechead")).toContainText("0 \u2192 1");
  await expect(up.locator(".cs"), "the stage, by its number").toHaveText("Stage 1 reached");
  const rings = up.getByRole("group", { name: "Stage 1 of 9" });
  await expect(rings.locator(".tup-rg"), "the nine stages of course terms as rings, without stage 0").toHaveCount(9);
  await expect(rings.locator(".tup-rg.now")).toHaveText("1");
  await expect(rings.locator(".tup-rg.done")).toHaveCount(0);
  // every term is settled on a test device: a green segment for each term of every stage (stage 1: form, matter, external form and external matter)
  expect(await rings.locator(".tup-rg").evaluateAll((a) => a.map((r) => [...r.querySelectorAll(".tseg")].map((x) => x.getAttribute("class")).join()))).toEqual([
    ...[4, 3, 4, 6, 5, 5, 5, 4, 4].map((n) => Array(n).fill("tseg ok").join())]);
  // the new stage has a halo of its own, and no other has
  await expect(rings.locator(".tup-rg.now .halo")).toHaveCount(1);
  await expect(rings.locator(".tup-rg:not(.now) .halo")).toHaveCount(0);
  // the stage's own terms are listed under what it introduces
  await expect(up.locator(".tstop-sec + .tup .tterms li .ttn")).toHaveText(["Form", "Matter", "External form", "External matter"]);
  await expect(up.locator(".tup-lead")).toContainText("Form and matter, two names for anything physical");
  // a tap on a ring shows its terms in a tooltip over the page, which stays where it is; a second tap on the ring, a tap elsewhere or Escape closes it
  const lead = await up.locator(".tup-lead").boundingBox();
  await rings.locator(".tup-rg").nth(6).click();
  await expect(up.locator(".tup-rgp .tterms li .ttn")).toHaveText(["Eye consciousness", "Ear consciousness", "Nose consciousness", "Tongue consciousness", "Body consciousness"]);
  expect(await up.locator(".tup-rgp").evaluate((e) => getComputedStyle(e).position), "over the page, not in it").toBe("absolute");
  expect((await up.locator(".tup-lead").boundingBox()).y, "the text under the row does not move").toBe(lead.y);
  await expect(rings.locator(".tup-rg").nth(6)).toHaveAttribute("aria-expanded", "true");
  await rings.locator(".tup-rg").nth(8).click();
  await expect(up.locator(".tup-rgp")).toContainText("Stage 9");
  await expect(up.locator(".tup-rgp .tterms li .ttn")).toHaveText(["Ultimate truth", "Specifically characterized phenomenon", "Conventional truth", "Generally characterized phenomenon"]);
  await rings.locator(".tup-rg").nth(8).click();
  await expect(up.locator(".tup-rgp")).toHaveCount(0);
  await rings.locator(".tup-rg").nth(2).click();
  await expect(up.locator(".tup-rgp")).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(up.locator(".tup-rgp")).toHaveCount(0);
  await rings.locator(".tup-rg").nth(2).click();
  await up.locator(".cs").click();
  await expect(up.locator(".tup-rgp"), "a tap elsewhere closes it").toHaveCount(0);
  await expect(up.locator(".tstop-sech"), "what it adds, and what the stages are").toHaveText(["Topics", "Progression"]);
  await expect(up, "the first one says what the stages are").toContainText("Each stage adds a new kind of thing to ask about");
  await expect(up).toContainText("The earlier stages stay in the mix.");
  await expect(up).toContainText("Each new term comes with its definition first.");
  await expect(up.getByRole("button", { name: "How the stages work" })).toHaveCount(0);
  await expect(up.getByRole("button", { name: "Stay on stage 0 a while longer" })).toBeVisible();
  await expect(up.getByRole("button", { name: "practice options" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("rd-stages")), "the stage comes in at Next").toBe("0");
  await station(page).click();
  await expect(pathChoices(page)).toHaveCount(5);
  expect(await page.evaluate(() => [localStorage.getItem("rd-stages"), JSON.parse(localStorage.getItem("rd-stage-run"))])).toEqual(["0,1", { up: 0, down: 0, told: true }]);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("rd-ex-runs")).practice)).toEqual({ run: 5, right: 5 });
});

test("on the Path the next stage comes with its first term, once the stage below has brought all of its own and fewer than three terms are not right yet, whatever their marks", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(onPath);
  await page.addInitScript(() => {
    localStorage.setItem("rd-stages", "0,1,2");
    const right = (first) => ({ box: 2, shows: 1, first, won: first }), settled = { box: 3, shows: 1 };
    // stage 1 settled; every term of stage 2 met, Shape and Form source not right yet; the next term may come after one more answer
    localStorage.setItem("rd-terms", JSON.stringify({ n: 12, next: 13, terms: { form: settled, "form:Matter": settled, extf: settled, "extf:External matter": settled, col: right(2), shape: { box: 1, shows: 2, first: 3 }, vis: { box: 1, shows: 1 } } }));
  });
  await page.addInitScript(hook);
  await page.goto("/");
  await expect(pathChoices(page)).toHaveCount(5);
  const ring = page.locator("#path .ptb .pring");
  await expect(ring).toHaveAccessibleName(/^Progression: stage 2, 1 of 3 new terms answered right/);
  await expect(ring).not.toHaveClass(/\bfull\b/);
  await rightPath(page);
  await expect(ring).toHaveClass(/\bfull\b/);
  expect(await page.evaluate(() => window.__t.stageRun.up), "one answer, not a run of five").toBeLessThanOrEqual(1);
  await station(page).click();
  await expect(page.locator("#path .tstage .cs")).toHaveText("Stage 3 reached");
  await expect(station(page), "the first term of the stage comes at once: the station says so").toHaveAccessibleName(/^Next: new definition/);
  await station(page).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("rd-stages"))).toBe("0,1,2,3");
  await expect(page.locator("#path .tstop .cs"), "the first term of stage 3 comes at once").toHaveText("Sound source");
  await station(page).click();
  await expect(pathChoices(page)).toHaveCount(5);
  expect(await ring.locator(".tseg").evaluateAll((a) => a.map((x) => x.getAttribute("class"))), "its ring: that term met, the others to come").toEqual(["tseg met", "tseg wait", "tseg wait", "tseg wait"]);
});

test("on the Path the stage station shows a ring for each stage with a segment for each of its new terms, in the order they were first answered, colored by the last answer", async ({ page }) => {
  // stage 1 settled; at stage 3, still ahead: Odor source answered right first, then Sound source missed, the other two to come; stage 2's first term may come with the fifth answer
  await fiveRight(page, () => localStorage.setItem("rd-terms", JSON.stringify({ n: 12, next: 17, terms: {
    form: { box: 3, shows: 1 }, "form:Matter": { box: 3, shows: 1 }, extf: { box: 3, shows: 1 }, "extf:External matter": { box: 3, shows: 1 }, odr: { box: 2, shows: 1, first: 1, won: 1 }, snd: { box: 1, shows: 2, first: 2 } } })));
  await station(page).click();
  const rings = page.locator("#path .tstage").getByRole("group", { name: "Stage 2 of 9" }).locator(".tup-rg");
  const cls = (i) => rings.nth(i).locator(".tseg").evaluateAll((a) => a.map((x) => x.getAttribute("class").replace("tseg ", "")));
  expect(await cls(0), "stage 1: right").toEqual(["ok", "ok", "ok", "ok"]);
  expect(await cls(1), "stage 2, the one coming in: its three terms still to come").toEqual(["wait", "wait", "wait"]);
  expect(await cls(2), "stage 3").toEqual(["ok", "miss", "wait", "wait"]);
  expect(await cls(5), "stage 6: five terms").toEqual(["wait", "wait", "wait", "wait", "wait"]);
  await expect(rings, "the ladder: its layers of depth are not stages here").toHaveCount(9);
  await expect(rings.nth(2)).toHaveAccessibleName("Stage 3, 1 of 4 new terms answered right");
  await rings.nth(2).click();
  await expect(page.locator("#path .tup-rgp .tterms li .ttn")).toHaveText(["Odor source", "Sound source", "Taste source", "Tangible object source"]);
  expect(await page.locator("#path .tup-rgp .tmk").evaluateAll((a) => a.map((x) => x.getAttribute("class")))).toEqual(["tmk ok", "tmk miss", "tmk wait", "tmk wait"]);
});

test("on the Path, Stay on stage 1 a while longer keeps the next stage out and asks for ten right answers in a row; the practice options link opens the Stages page", async ({ page }) => {
  await fiveRight(page);
  await station(page).click();
  const up = page.locator("#path .tstage");
  await up.getByRole("button", { name: "Stay on stage 1 a while longer" }).click();
  await expect(up).toContainText("Stage 2 stays out for now. It comes in after 10 right answers in a row on stage 1.");
  await expect(up.getByRole("button", { name: /^Stay on stage/ })).toHaveCount(0);
  await up.getByRole("button", { name: "practice options" }).click();
  const sheet = page.getByRole("dialog", { name: "Practice options" });
  await expect(sheet.getByRole("switch", { name: /^Move up by itself/ })).toHaveAttribute("aria-checked", "true");
  await page.keyboard.press("Escape");     // from the page back to the options, and out of them
  await page.keyboard.press("Escape");
  await expect(sheet).toHaveCount(0);
  await station(page).click();
  await expect(pathChoices(page)).toHaveCount(5);
  expect(await page.evaluate(() => [localStorage.getItem("rd-stages"), JSON.parse(localStorage.getItem("rd-stage-run"))])).toEqual(["1", { up: 0, down: 0, told: true, need: 10 }]);
});

test("on the Path, Undo takes the stay back, and a later upgrade says one line with the rest folded under \"How the stages work\"", async ({ page }) => {
  await fiveRight(page);
  await station(page).click();
  const up = page.locator("#path .tstage");
  await up.getByRole("button", { name: "Stay on stage 1 a while longer" }).click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("rd-stage-run")).need)).toBe(10);
  await up.getByRole("button", { name: "Undo" }).click();
  await expect(up.getByRole("button", { name: "Stay on stage 1 a while longer" })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("rd-stage-run")))).toEqual({ up: 5, down: 0, told: true });
  await station(page).click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("rd-stages"))).toBe("1,2");
});

test("on the Path, a later upgrade says one line and folds what the stages are", async ({ page }) => {
  await fiveRight(page, () => { if (localStorage.getItem("rd-stage-run") === null) localStorage.setItem("rd-stage-run", JSON.stringify({ up: 0, down: 0, told: true })); });
  await station(page).click();
  const up = page.locator("#path .tstage");
  await expect(up.locator(".cs")).toHaveText("Stage 2 reached");
  await expect(up).toContainText("The earlier stages stay in the mix.");
  await expect(up, "folded").not.toContainText("Each new term comes with its definition first.");
  const how = up.getByRole("button", { name: "How the stages work" });
  await expect(how).toHaveAttribute("aria-expanded", "false");
  await how.click();
  await expect(how).toHaveAttribute("aria-expanded", "true");
  await expect(up).toContainText("Each new term comes with its definition first.");
  await expect(up.getByRole("button", { name: "practice options" }), "the way to the options is in the explanation").toBeVisible();
  await how.click();
  await expect(up).not.toContainText("Each new term comes with its definition first.");
});

test("on the Path, with Move up by itself off, five right relations bring no stage; the switch is on the Stages page and is kept", async ({ page }) => {
  // at stage 3, from which a result may suggest negations
  await fiveRight(page, () => { if (localStorage.getItem("rd-stage-run") === null) { localStorage.setItem("rd-stage-run", JSON.stringify({ up: 0, down: 0, manual: true })); localStorage.setItem("rd-stages", "1,2,3"); } });
  await expect(page.locator("#path .offer"), "the negation offer, which the stage no longer goes before").toContainText("Try pairs with a negated side?");
  await station(page).click();
  await expect(pathChoices(page), "straight on to the next question").toHaveCount(5);
  await expect(page.locator("#path .tup")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("rd-stages"))).toBe("1,2,3");
  await page.getByRole("button", { name: "Practice options" }).click();
  const sheet = page.getByRole("dialog", { name: "Practice options" });
  await sheet.getByRole("button", { name: "Stages: more" }).click();
  const sw = sheet.getByRole("switch", { name: /^Move up by itself/ });
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("rd-stage-run")).manual)).toBeUndefined();
  await sw.click();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("rd-stage-run")).manual)).toBe(true);
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
// an example for every term of the open data: the stop of a term lists them, the definition under a question does not
const examples = () => ({
  version: "e1",
  part: { format: "riglam-examples-device", version: 2, sources: {}, items: Object.keys(readOpen().terms).map((term) => ({ n: `a ${term.toLowerCase()} sample`, cls: [term], lv: 1, k: "thing", cf: "confirmed", s: [] })) },
});
const meeting = (box) => {
  const terms = { form: { box: 3, shows: 1 } };
  for (const id of ["extf", "col", "shape", "vis"]) terms[id] = { box, shows: 1, at: 0 };
  localStorage.setItem("rd-stages", "1,2"); localStorage.setItem("rd-terms", JSON.stringify({ n: 10, next: 1000, terms }));
};

course("a course term the learner is still meeting has a small tag in the question on the Path, which opens its definition, in Relations and Categories", async ({ page }) => {
  await withKey(page);
  await serveCourse(page, dataKey, { examples: examples() });
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
  await expect.poll(() => page.evaluate(() => !!window.__t.EX)).toBe(true);
  await expect(page.locator("#path .ntdef .pdef .pdex"), "the examples are left to the term's stop").toHaveCount(0);
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
