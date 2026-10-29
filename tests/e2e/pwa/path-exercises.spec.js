// The exercises on the Path (src/app/path) beyond Relations: Syllogisms, Pervasions, Find a pair, Categories and Find an instance, each from its first step to
// its result. The rules and what is stored are the classic flows' and have their own specs; these check that the Path draws each step, takes
// the answers through the same steps and stores the answer as the classic page does. The page's state is read through the test hook.
import { test, expect } from "../../support/test.js";
import { exerciseAtRest } from "../../support/page.js";
import { dataKey, KEY_STORE, serveCourse } from "../../support/data-key.js";
import { readOpen } from "../../../scripts/lib/course-files.mjs";

const onPath = () => {
  if (localStorage.getItem("rd-design") === null) localStorage.setItem("rd-design", "path");
  window.__riglamTest = (t) => { window.__t = t; };
};
const choices = (page) => page.locator("#path .chs .crow");
const choice = (page, text) => choices(page).filter({ hasText: text }).first();
const station = (page) => page.locator("#stn");
const verdict = (page) => page.locator("#path .pvline");
const saved = (page, mode, col = "answers") => page.evaluate(async ([m, c]) => (await (await window.__riglam.platform.db()).collection(c).get()).docs.map((d) => d.data()).filter((d) => d.mode === m), [mode, col]);

async function open(page, name) {
  await page.goto("/");
  await expect(choices(page)).toHaveCount(5);   // Relations first
  await page.locator(".tstn").click();
  await page.getByRole("dialog", { name: "Roadmap" }).getByRole("button", { name: new RegExp("^" + name) }).click();
  await expect(page.locator(".ptb-t")).toContainText(name);
  await exerciseAtRest(page);
}

test.beforeEach(async ({ page }) => { await page.addInitScript(onPath); });

test("Syllogisms: the syllogism in its three parts, the three replies, and the result with the three checks", async ({ page }) => {
  await open(page, "Syllogisms");
  await expect(page.locator("#path .stm")).toHaveCount(3);   // S, P and R, a line each
  await expect(choices(page)).toHaveCount(3);
  const c = await page.evaluate(() => ({ answer: window.__t.cur.c.answer }));
  const say = { accept: "I accept", reason: "The reason is not established", pervasion: "There is no pervasion" }[c.answer];
  await choice(page, say).click();
  if (c.answer === "pervasion") {
    await expect(page.locator("#sylex")).toBeVisible();   // a counter-example may follow; left empty, the result comes without one
    await page.locator("#sylex").blur();
    await station(page).click();
  }
  await expect(verdict(page)).toContainText("Right");
  await expect(page.locator("#path .plead")).toHaveText(say + ".");   // the reply as it was said, with no "You answered" before it
  await expect(station(page), "the next station says what comes next").toHaveAccessibleName(/^Next syllogism/);
  await expect(page.locator("#path .chk")).toHaveCount(3);
  await expect.poll(async () => (await saved(page, "syllogism")).length).toBe(1);
  expect((await saved(page, "syllogism"))[0]).toMatchObject({ said: c.answer, answer: c.answer });
});

test("Syllogisms: a wrong 'there is no pervasion' holds its verdict too, until the counter-example is given or left out, and the result then strikes the reply", async ({ page }) => {
  await open(page, "Syllogisms");
  expect(await page.evaluate(() => { for (let i = 0; i < 600; i++) { if (window.__t.cur.c.answer !== "pervasion") return true; window.__t.next(); } return false; })).toBe(true);
  await choice(page, "There is no pervasion").click();
  await expect(page.locator("#sylex")).toBeVisible();      // asked whether the reply is right or not: nothing yet says which
  await expect(verdict(page)).toHaveCount(0);
  await expect(page.locator("#path .sylsaid")).toContainText("Can you show it?");
  await expect(page.locator("#path .sylsaid .mark")).toHaveCount(0);
  await page.locator("#sylex").blur();
  await station(page).click();
  await expect(verdict(page)).toContainText("Not quite");
  await expect(page.locator("#path .plead s.no")).toHaveText("There is no pervasion");
  await expect.poll(async () => (await saved(page, "syllogism")).length).toBe(1);
  expect((await saved(page, "syllogism"))[0]).toMatchObject({ said: "pervasion", correct: false });
});

test("Syllogisms: S, P and R sit a line each (no room kept for a star the syllogism has none of), and the heading's stop stays yellow while the counter-example is asked", async ({ page }) => {
  await open(page, "Syllogisms");
  const rows = page.locator("#path .stm");
  await expect(rows).toHaveCount(3);
  await expect(page.locator("#path .pstar")).toHaveCount(0);
  await expect(page.locator("#path .stm.hasstar")).toHaveCount(0);
  const h = await rows.evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height));
  expect(h[0], "S is no taller than a wrapped line of text, not a row kept for a star under Skip").toBeLessThan(70);
  expect(await page.evaluate(() => window.__t.cur.c.answer === "pervasion" || (() => { for (let i = 0; i < 600; i++) { window.__t.next(); if (window.__t.cur.c.answer === "pervasion") return true; } return false; })())).toBe(true);
  await choice(page, "There is no pervasion").click();
  await expect(page.locator("#sylex")).toBeVisible();
  await expect(page.locator("#path .sx.first .d.sec")).toHaveClass(/\bnow\b/);   // the step is still open: yellow, like the headings of the other steps
});

// The line says whether the way on is open (docs/ARCHITECTURE.md, "The line"): dotted while a choice or an unanswered question blocks it, solid once it is answered.
// A piece's own line is its `::before`; the dotted ones paint a repeating gradient, the solid ones a plain one.
const dotted = (page, sel) => page.locator(sel).first().evaluate((e) => getComputedStyle(e, "::before").backgroundImage.includes("repeating-linear-gradient"));

test("the line: Find a pair's fields are dotted while a word is missing and solid once both are named, and so is the trail", async ({ page }) => {
  await open(page, "Find a pair");
  expect(await dotted(page, "#path .sx.first"), "the fields, empty").toBe(true);
  expect(await dotted(page, "#path .sx.ptail"), "the trail").toBe(true);
  await page.locator("#fw-a").fill("pot");
  expect(await dotted(page, "#path .sx.first"), "one word").toBe(true);
  await page.locator("#fw-b").fill("clay things");
  await expect(page.locator(".pa")).toHaveClass(/\bready\b/);
  expect(await dotted(page, "#path .sx.first"), "both named").toBe(false);
  expect(await dotted(page, "#path .sx.ptail"), "the trail, once the way is open").toBe(false);
});

test("the line: the questions still to come in Pervasions are dotted yellow, and the trail stays dotted until the last one", async ({ page }) => {
  await open(page, "Pervasions");
  expect(await dotted(page, "#path .sx.later"), "Q2 to Q4").toBe(true);
  expect(await dotted(page, "#path .sx.ptail")).toBe(true);
  await choice(page, "Why?").click();
  await page.locator("#dex").fill("a stone");
  await expect(page.locator(".pa")).toHaveClass(/\bready\b/);   // the station is ready, the questions after this one still are not asked
  expect(await dotted(page, "#path .sx.later")).toBe(true);
  expect(await dotted(page, "#path .sx.ptail"), "a ready station does not open the way past the questions still to come").toBe(true);
});

test("the line: Categories' options under the rule are dotted, the ones lifted over it sit on the solid line, and Check is ready from the start", async ({ page }) => {
  await open(page, "Categories");
  const below = "#path .sx:has(.chs.down)", above = "#path .sx:has(.chs.up)";
  await expect(page.locator(".pa")).toHaveClass(/\bready\b/);   // nothing lifted answers "none of these"
  expect(await dotted(page, below)).toBe(true);
  await choices(page).first().click();
  await expect(page.locator(above)).toHaveCount(1);
  expect(await dotted(page, above)).toBe(false);
  expect(await dotted(page, below)).toBe(true);
});

test("the line: Syllogisms' counter-example may stay empty, and its piece of line is dotted until something is written", async ({ page }) => {
  await open(page, "Syllogisms");
  expect(await page.evaluate(() => { for (let i = 0; i < 600; i++) { if (window.__t.cur.c.answer === "pervasion") return true; window.__t.next(); } return false; })).toBe(true);
  await choice(page, "There is no pervasion").click();
  await expect(page.locator("#sylex")).toBeVisible();
  expect(await dotted(page, "#path .sx.er"), "the field, empty").toBe(true);
  expect(await dotted(page, "#path .sx.ptail"), "the trail, although the Result station is ready").toBe(true);
  expect(await dotted(page, "#path .sx.first"), "what was answered stays solid").toBe(false);
  await page.locator("#sylex").fill("a stone");
  await expect.poll(() => dotted(page, "#path .sx.er"), { message: "written" }).toBe(false);      // the path redraws on the next frame
  await expect.poll(() => dotted(page, "#path .sx.ptail")).toBe(false);
});

test("Pervasions: four questions answered on the path, a counter-example for Why, then the relation, and the result", async ({ page }) => {
  await open(page, "Pervasions");
  await expect(choices(page)).toHaveCount(2);   // Accept and Why?
  // a question is numbered in the margin (Q1), its concise form (A → not B) opens its row, and the statement asked ends with no punctuation: the lead above the stop asks
  const now = page.locator("#path .sb.now");
  await expect(now.locator(".qnm")).toHaveText("Q1");
  await expect(now.locator(".qsym")).toHaveText(/^A\s*not B$/);
  await expect(now.locator(".qst")).not.toHaveText(/[.?!]$/);
  const lead = await page.locator("#path .qlead.above").boundingBox(), sym0 = await now.locator(".qsym").boundingBox(), dia0 = await now.locator(".d").boundingBox();
  expect(lead.y + lead.height, "the lead stands above the question's row").toBeLessThanOrEqual(sym0.y + 2);
  expect(Math.abs(dia0.y + dia0.height / 2 - (sym0.y + sym0.height / 2)), "the diamond stays level with the question's short form").toBeLessThan(10);
  await expect(page.locator("#path .sb.later .qnm")).toHaveText(["Q2", "Q3", "Q4"]);
  const [num, dia, form] = await Promise.all([now.locator(".qnm").boundingBox(), now.locator(".d").boundingBox(), now.locator(".qsym").boundingBox()]);
  expect(num.x + num.width).toBeLessThan(dia.x);   // left of the stop, in the margin
  expect(num.x).toBeGreaterThan(0);
  expect(Math.abs(num.y + num.height / 2 - (form.y + form.height / 2))).toBeLessThan(6);   // level with the notation
  await choice(page, "Accept").click();
  await expect(page.locator("#path .sb.done")).toHaveCount(1);
  await expect(page.locator("#path .sb.done .qnm")).toHaveText("Q1");
  await expect(now.locator(".qsym")).toHaveText(/^A\s*B$/);
  await choice(page, "Why?").click();
  const field = page.locator("#dex");
  await expect(field).toBeVisible();
  await field.fill("a stone");
  await field.press("Enter");
  await expect(page.locator("#path .sb.done")).toHaveCount(2);
  await choice(page, "Accept").click();
  await expect(page.locator("#path .sb.done")).toHaveCount(3);
  await choice(page, "Accept").click();
  await expect(choices(page)).toHaveCount(5);   // the relation the answers give
  await choices(page).first().click();
  await expect(verdict(page)).toBeVisible();
  await expect(page.locator("#path .qres")).toHaveCount(4);
  await expect(page.locator("#path .qres .qnm")).toHaveText(["Q1", "Q2", "Q3", "Q4"]);
  await expect(page.locator("#path .qres").nth(1)).toContainText("a stone");
  await expect.poll(async () => (await saved(page, "debate", "debates")).length).toBe(1);
});

test("Find a pair: the relation asked, two words, an example for each case, and the result with the pair", async ({ page }) => {
  await open(page, "Find a pair");
  await page.locator("#fw-a").fill("pot");
  await page.locator("#fw-b").fill("clay things");
  await page.locator("#fw-b").blur();
  await station(page).click();
  const cell = page.locator("#cin");
  await expect(cell).toBeVisible();
  for (let i = 0; i < 8 && (await cell.isVisible()); i++) {   // a case for each the relation has; an Enter that lands as the next case comes in takes another round
    await cell.fill("thing " + (i + 1));
    await cell.press("Enter");
    // the next cell's empty field, or none after the last cell (a relation may have two or three): not a field on its way out
    await expect.poll(() => page.evaluate(() => { const c = document.getElementById("cin"); return !c || c.value === ""; })).toBe(true);
  }
  await expect(cell).toHaveCount(0);
  await station(page).click();
  await expect(verdict(page)).toBeVisible();
  await expect(page.locator("#path .pairv")).toContainText("does not cover this pair");   // a pair of its own words: the tutor would judge it
  await expect.poll(async () => (await saved(page, "find")).length).toBe(1);
  expect((await saved(page, "find"))[0]).toMatchObject({ a: "pot", b: "clay things" });
});

test("Pervasions: Escape in the counter-example goes back to the two answers, and with words in it the station goes on", async ({ page }) => {
  await open(page, "Pervasions");
  await choice(page, "Why?").click();
  const field = page.locator("#dex");
  await expect(field).toBeFocused();
  await field.press("Escape");
  await expect(field).toHaveCount(0);
  await expect(choices(page)).toHaveCount(2);
  await choice(page, "Why?").click();
  await field.fill("a stone");
  await field.blur();
  await station(page).click();   // the station takes the counter-example, as Enter does
  await expect(page.locator("#path .sb.done")).toHaveCount(1);
});

test("Find a pair: where there is a keyboard of keys, the first word takes the cursor", async ({ page, isMobile }) => {
  test.skip(!!isMobile, "a touch screen keeps its keyboard down");
  await open(page, "Find a pair");
  await expect(page.locator("#fw-a")).toBeFocused();
});

// the examples are invented (a plain one for every term of the open data) and served by a stand-in for the server, as in categories.spec.js
const examples = () => ({
  version: "e1",
  part: {
    format: "riglam-examples-device", version: 2, sources: {},
    items: Object.keys(readOpen().terms).map((term) => ({ n: `a ${term.toLowerCase()} sample`, cls: [term], lv: 1, k: "thing", cf: "confirmed", s: [] })),
  },
});

test("Categories: the categories ticked on the path, the check, the most specific, and the line", async ({ page }) => {
  await page.addInitScript(([store, key]) => { try { localStorage.setItem(store, key); } catch { /* storage unavailable */ } }, [KEY_STORE, dataKey]);
  await serveCourse(page, dataKey, { stub: true, examples: examples() });
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => !!window.__t.EX)).toBe(true);
  await page.locator(".tstn").click();
  await page.getByRole("dialog", { name: "Roadmap" }).getByRole("button", { name: /^Categories/ }).click();
  await expect(page.locator(".ptb-t")).toContainText("Categories");
  await exerciseAtRest(page);
  const rows = await page.evaluate(() => window.__t.cur.q.rows.map((r) => ({ phrase: r.phrase, answer: r.answer })));
  await expect(choices(page)).toHaveCount(rows.length);   // no "None of these": nothing over the rule is that answer
  await expect(page.locator("#path .stm.thing small")).toHaveCount(0);   // the thing alone, without its stage
  const right = rows.filter((r) => r.answer);
  for (const r of right) await choices(page).filter({ hasText: new RegExp("^" + r.phrase + "$") }).click();
  await expect(page.locator("#path .thold .chs.up .crow")).toHaveText(right.map((r) => r.phrase));   // lifted over the rule, in the list's order
  if (right.length) await page.keyboard.press("Enter");   // the last one lifted keeps the focus where it lands, and Enter there checks (it does not drop it)
  else await station(page).click();   // Check is ready with nothing lifted
  await expect(verdict(page)).toContainText("Right");
  await expect(page.locator("#path .thold.tres .chs.up .crow")).toHaveText(right.map((r) => new RegExp("^" + r.phrase)));   // the check keeps them where they were left, each marked
  await expect(page.locator("#path .thold.tres .crow .mark")).toHaveCount(rows.length);
  if (await page.evaluate(() => !!window.__t.ui.narrow)) {
    await station(page).click();   // Continue
    const best = await page.evaluate(() => window.__t.ui.narrow.options.find((o) => o.cat === window.__t.ui.narrow.cat).phrase);
    await choices(page).filter({ hasText: new RegExp("^" + best + "$") }).click();
    await expect(verdict(page)).toContainText("Right");
    await expect(page.locator("#path .pline")).not.toHaveCount(0);   // the line from the most specific up
  }
  await expect(station(page)).toHaveAccessibleName(/^Next thing/);
  await expect.poll(async () => (await saved(page, "categories")).length).toBe(1);
});

test("Categories: a tap lifts a category over the rule and back, reset drops them all, and Check with none lifted answers none of these", async ({ page }) => {
  await page.addInitScript(([store, key]) => { try { localStorage.setItem(store, key); } catch { /* storage unavailable */ } }, [KEY_STORE, dataKey]);
  await serveCourse(page, dataKey, { stub: true, examples: examples() });
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => !!window.__t.EX)).toBe(true);
  await page.locator(".tstn").click();
  await page.getByRole("dialog", { name: "Roadmap" }).getByRole("button", { name: /^Categories/ }).click();
  await exerciseAtRest(page);
  const phrases = await page.evaluate(() => window.__t.cur.q.rows.map((r) => r.phrase));
  const up = page.locator("#path .thold .chs.up .crow"), down = page.locator("#path .thold .chs.down .crow"), reset = page.locator("#path .threset");
  await expect(reset).toHaveCount(0);   // nothing to reset yet
  await expect(page.locator("#path .thold .thh")).toHaveText(["is", "not"]);
  await expect(station(page)).toHaveAccessibleName(/^Check.*none of these/);
  await down.filter({ hasText: new RegExp("^" + phrases[1] + "$") }).click();
  await down.filter({ hasText: new RegExp("^" + phrases[0] + "$") }).click();
  await expect(up).toHaveText([phrases[0], phrases[1]]);   // in the list's order, not the order of the taps
  await expect(up.first()).toHaveAttribute("aria-pressed", "true");
  await expect(down).toHaveCount(phrases.length - 2);
  await expect(station(page)).toHaveAccessibleName(/^Check.*2 categories/);
  await up.filter({ hasText: new RegExp("^" + phrases[1] + "$") }).click();   // dropped back
  await expect(up).toHaveText([phrases[0]]);
  await reset.click();
  await expect(up).toHaveCount(0);
  await expect(down).toHaveCount(phrases.length);
  await station(page).click();
  await expect(page.locator("#path .pscan")).toHaveCount(1);   // the Check slides up through the categories as every check does
  await expect(page.locator("#path .thold .crow.scn")).not.toHaveCount(0);
  await expect(verdict(page)).toBeVisible();
  await expect(page.locator("#path .pathc > .sx.first .sechead")).toContainText("1 Categories");   // the heading stays through the check, its diamond in ink
  await expect(page.locator("#path .pathc > .sx.first .sechead .d.sec.done")).toHaveCount(1);
  const applies = await page.evaluate(() => window.__t.cur.q.rows.filter((r) => r.answer).length);
  if (applies) await expect(verdict(page)).toContainText(new RegExp("Not quite.*" + applies + " missed"));   // not a score: what went wrong, each way
  await expect(page.locator("#path .thold.tres .chs.up .crow")).toHaveCount(0);   // nothing over the rule: the answer was "none of these"
  await expect(page.locator("#path .thold.tres .chs.down .crow")).toHaveCount(phrases.length);
  expect(await page.evaluate(() => window.__t.ui.g1.rows.filter((r) => r.picked).length)).toBe(0);
});

// Find an instance draws its categories at random: another set (a skip, nothing entered yet) until one of the kind the test needs is on screen
async function drawInstance(page, possible) {
  for (let i = 0; i < 60; i++) {
    const q = await page.evaluate(() => window.__t.cur.iq);
    if (q.possible === possible) return q;
    await page.evaluate(() => window.__t.skipPair());
  }
  throw new Error("no set with possible " + possible);
}

test("Find an instance: the categories as stops, a thing written, the check, and a row for each category", async ({ page }) => {
  await open(page, "Find an instance");
  const q = await drawInstance(page, true);
  await expect(page.locator("#path .pskip")).toHaveAccessibleName("Skip these categories");   // Skip, under the first stop's mark
  await expect(page.locator("#path .icat")).toHaveCount(q.cats.length);
  await expect(page.locator("#path .icat").first()).toHaveText(q.labels[0]);
  const field = page.locator("#iin");
  await field.fill(q.known[0].slice(0, 4));
  await expect(page.locator("#iin-things option")).not.toHaveCount(0);   // the things the data knows, as the words are typed
  await field.fill(q.known[0]);
  await field.press("Enter");
  await expect(verdict(page)).toContainText("Right");
  await expect(page.locator("#path .catrow")).toHaveCount(q.cats.length);
  await expect(station(page)).toHaveAccessibleName(/^Next set/);
  await expect.poll(async () => (await saved(page, "instance")).length).toBe(1);
  expect((await saved(page, "instance"))[0]).toMatchObject({ cats: q.cats, possible: true, said: q.known[0], thing: q.known[0], grade: "ok" });
});

// A device that has met the terms of stage 2 at their stops and is still meeting them (box 1): the terms are open, and the exercises that cannot grade them
// by their own question still ask them (src/domain/syllogism.ts, instance.ts) and count a right answer for each
const OPEN2 = ["extf", "col", "shape", "vis"];
const meeting = () => {
  const terms = { form: { box: 3, shows: 1 } };
  for (const id of ["extf", "col", "shape", "vis"]) terms[id] = { box: 1, shows: 1, at: 0 };
  localStorage.setItem("rd-stages", "1,2"); localStorage.setItem("rd-terms", JSON.stringify({ n: 10, next: 1000, terms }));
};

test("Syllogisms at stage 2 ask the terms of the stage that are not right yet, with the course's words", async ({ page }) => {
  await page.addInitScript(meeting);
  await open(page, "Syllogisms");
  expect(await page.evaluate((ids) => { for (let i = 0; i < 80; i++) { const c = window.__t.cur.c; if (ids.includes(c.catR) || ids.includes(c.catP)) return true; window.__t.next(); } return false; }, OPEN2)).toBe(true);
});

test("Find an instance at stage 2 asks the open terms, and a right thing counts for each category of its set", async ({ page }) => {
  await page.addInitScript(meeting);
  await open(page, "Find an instance");
  const q = await page.evaluate((ids) => { for (let i = 0; i < 80; i++) { const q = window.__t.cur.iq; if (q.possible && q.cats.some((c) => ids.includes(c))) return q; window.__t.skipPair(); } return null; }, OPEN2);
  expect(q, "a set with an open term").not.toBeNull();
  await page.locator("#iin").fill(q.known[0]);
  await page.locator("#iin").press("Enter");
  await expect(verdict(page)).toContainText("Right");
  const boxes = await page.evaluate(([cats]) => cats.map((c) => [c, window.__t.intro.terms[c]?.box]), [q.cats]);
  for (const [c, box] of boxes) if (OPEN2.includes(c)) expect(box, c).toBe(2);
});

test("Find an instance: \"nothing is\" where the categories exclude each other, and why", async ({ page }) => {
  await open(page, "Find an instance");
  const q = await drawInstance(page, false);
  await page.locator("#path .help button").click();
  await expect(page.locator("#iin")).toHaveCount(0);
  await station(page).click();
  await expect(verdict(page)).toContainText("Right");
  await expect(page.locator("#path")).toContainText(q.apart.why);
  await expect.poll(async () => (await saved(page, "instance")).length).toBe(1);
  expect((await saved(page, "instance"))[0]).toMatchObject({ cats: q.cats, possible: false, said: null, grade: "ok" });
});

test("Find an instance: Guided in the practice options (things suggested as you write) turns the field's list off, and the device keeps it", async ({ page }) => {
  await open(page, "Find an instance");
  const field = page.locator("#iin");
  await expect(field).toHaveAttribute("list", "iin-things");
  await page.getByRole("button", { name: "Practice options" }).click();
  const sheet = page.getByRole("dialog", { name: "Practice options" }), hints = sheet.getByRole("switch", { name: "Guided" });
  await expect(sheet.getByRole("button", { name: "Difficulty: more" }), "the stages and the difficulty are on the Progression page").toHaveCount(0);
  await expect(hints).toHaveAttribute("aria-checked", "true");
  await hints.click();
  await expect(hints).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");
  await expect(field).not.toHaveAttribute("list", /./);
  await expect(page.locator("#iin-things")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("rd-inst-suggest"))).toBe("0");
});
