// The exercises on the Path (src/app/path) beyond Relations: Syllogisms, Pervasions, Find a pair, Categories and Find an instance, each from its first step to
// its result. The rules and what is stored are the classic flows' and have their own specs; these check that the Path draws each step, takes
// the answers through the same steps and stores the answer as the classic page does. The page's state is read through the test hook.
import { test, expect } from "../../support/test.js";
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

test("the line: Categories' options are dotted until one is ticked, then solid", async ({ page }) => {
  await open(page, "Categories");
  const options = "#path .sx:has(.chs)";
  expect(await dotted(page, options)).toBe(true);
  expect(await dotted(page, "#path .sx.ptail")).toBe(true);
  await choices(page).first().click();
  await expect(page.locator(".pa")).toHaveClass(/\bready\b/);
  expect(await dotted(page, options)).toBe(false);
  expect(await dotted(page, "#path .sx.ptail")).toBe(false);
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
  // a question is numbered in the margin (Q1), its concise form (A → not B) opens its row, and the statement asked ends with a question mark
  const now = page.locator("#path .sb.now");
  await expect(now.locator(".qnm")).toHaveText("Q1");
  await expect(now.locator(".qsym")).toHaveText(/^A\s*not B$/);
  await expect(now.locator(".qst")).toHaveText(/\?$/);
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
  for (let i = 0; i < 4 && (await cell.isVisible()); i++) {
    await cell.fill("thing " + (i + 1));
    await cell.press("Enter");
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
  const rows = await page.evaluate(() => window.__t.cur.q.rows.map((r) => ({ phrase: r.phrase, answer: r.answer })));
  await expect(choices(page)).toHaveCount(rows.length + 1);   // and None of these
  const right = rows.filter((r) => r.answer);
  for (const r of right) await choices(page).filter({ hasText: new RegExp("^" + r.phrase + "$") }).click();
  if (!right.length) await choice(page, "None of these").click();
  await page.keyboard.press("Enter");   // the last one ticked keeps the focus, and Enter there checks (it does not untick it)
  await expect(verdict(page)).toContainText("All right");
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

test("Find an instance: Suggest things in the practice options turns the field's list off, and the device keeps it", async ({ page }) => {
  await open(page, "Find an instance");
  const field = page.locator("#iin");
  await expect(field).toHaveAttribute("list", "iin-things");
  await page.getByRole("button", { name: "Practice options" }).click();
  const sheet = page.getByRole("dialog", { name: "Practice options" }), hints = sheet.getByRole("switch", { name: /^Suggest things/ });
  await expect(sheet.getByRole("button", { name: "Stages: more" })).toBeVisible();   // the sets it asks follow the stages, as every exercise does
  await expect(hints).toHaveAttribute("aria-checked", "true");
  await hints.click();
  await expect(hints).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");
  await expect(field).not.toHaveAttribute("list", /./);
  await expect(page.locator("#iin-things")).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("rd-inst-suggest"))).toBe("0");
});
