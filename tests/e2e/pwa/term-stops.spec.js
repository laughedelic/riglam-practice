// The stop of a course term (practice/stops.ts, src/domain/intro.ts): on the Path a category of the course is asked about only once a stop has
// shown its term, and the stop comes before the next question; the classic page asks as before. Reset progression starts the terms again and keeps
// the answers (practice/progress.ts).
import { test, expect, SETTLED_TERMS } from "../../support/test.js";
import { isPhone, ready, relOptions } from "../../support/page.js";
import { dataKey, serveCourse, withCourse } from "../../support/data-key.js";

const hook = () => { window.__riglamTest = (t) => { window.__t = t; }; };
const onPath = () => { if (localStorage.getItem("rd-design") === null) localStorage.setItem("rd-design", "path"); };
// a device at stage 1 that has met no term yet, three questions in: the next pull brings the stop of Form (over the met terms the support test gives)
const fresh = () => { localStorage.setItem("rd-stages", "1"); localStorage.setItem("rd-terms", JSON.stringify({ n: 3, next: 3, terms: {} })); };
/** A device that has settled every course term but `left`, with `met` at box 1, at every stage, and the next new term due: the stop of the first of `left`. */
const seed = (page, left, met = []) => page.addInitScript(([settled, left, met]) => {
  const terms = JSON.parse(settled).terms;
  for (const id of left) delete terms[id];
  for (const id of met) terms[id] = { box: 1, shows: 1, at: 1e6 };
  localStorage.setItem("rd-stages", "1,2,3,4,5,6,7,8,9"); localStorage.setItem("rd-terms", JSON.stringify({ n: 3, next: 3, terms }));
}, [SETTLED_TERMS, left, met]);
/** Pulls the next screen, which is the stop that is due (`examples`: after the examples the stand-in server gives have been read). */
async function toStop(page, examples = false) {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(onPath);
  await page.addInitScript(hook);
  await page.goto("/");
  await expect(page.locator("#path .chs .crow")).toHaveCount(5);
  if (examples) await expect.poll(() => page.evaluate(() => !!window.__t.EX)).toBe(true);
  await page.evaluate(() => window.__t.next());
  const stop = page.locator("#path .tstop");
  await expect(stop).toBeVisible();
  return stop;
}
const ORDER = ["mi", "3ab", "3ba", "4", "con"];
const fwd = (page) => page.locator("#stage .pbar .fwd");
const station = (page) => page.locator("#stn");
const cats = (page) => page.evaluate(() => [window.__t.cur.p.catA, window.__t.cur.p.catB]);

/** The pair's own relation, anything in the cells it leaves possible, and the check (classic page). */
async function answerClassic(page, testInfo) {
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

test("the classic page has no stops: the next question follows the result, and the questions are still counted", async ({ page }, testInfo) => {
  await page.addInitScript(fresh);
  await page.addInitScript(hook);
  await page.goto("/");
  await ready(page);
  await answerClassic(page, testInfo);
  expect(await page.evaluate(() => window.__t.intro.n)).toBe(4);
  await page.keyboard.press("n");
  await ready(page);
  expect(await page.evaluate(() => window.__t.ui.stop)).toBeFalsy();
  expect(await page.evaluate(() => window.__t.intro.terms)).toEqual({});
});

test("on the Path the stop is a station of its own, with the term and where it sits, and Next leads on", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(onPath);
  await page.addInitScript(fresh);
  await page.addInitScript(hook);
  await page.goto("/");
  const choices = page.locator("#path .chs .crow");
  await expect(choices).toHaveCount(5);
  expect(await cats(page)).not.toContain("form");
  const rel = await page.evaluate(() => window.__t.cur.p.relation);
  await choices.nth(ORDER.indexOf(rel)).click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (let i = 0; i < 4 && (await field.isVisible()); i++) { await field.fill("thing " + (i + 1)); if ((await field.getAttribute("enterkeyhint")) === "done") { await field.blur(); break; } await field.press("Enter"); }
  await expect(station(page)).toHaveAccessibleName(/^Check/);
  await station(page).click();
  await expect.poll(() => page.evaluate(() => window.__t.ui.checked)).toBe(true);
  await expect(station(page), "the station says that a new definition is next").toHaveAccessibleName(/^Next: new definition/);
  await station(page).click();
  const stop = page.locator("#path .tstop");
  await expect(stop).toBeVisible();
  await expect(stop).toContainText("New term");
  await expect(stop.locator(".cs")).toHaveText("Form");
  // English only until Settings > Languages says more
  await expect(stop.locator(".tstop-names")).toHaveCount(0);
  await expect(stop.locator(".tstop-sech")).toHaveText(withCourse ? ["Definition", "Categories", "Examples"] : ["Categories", "Examples"]); // the examples are the practice list's: no course data needed
  if (withCourse) await expect(stop.locator(".pdbody").first()).toBeVisible();
  // one optional mark: the term comes again in a few questions, and a second tap takes that back
  const again = stop.getByRole("button", { name: "Show it again later" });
  const due = () => page.evaluate(() => { const t = JSON.parse(localStorage.getItem("rd-terms")).terms.form; return t.why === "again" ? t.due - window.__t.intro.n : null; });
  await expect(again).toHaveAttribute("aria-pressed", "false");
  await again.click();
  await expect(again).toHaveAttribute("aria-pressed", "true");
  // a short hint under the clock, which goes by itself after a few seconds
  await expect(stop.getByRole("status")).toHaveText("Will be shown again");
  expect(await due()).toBe(10);
  await expect(stop.getByRole("status")).toHaveCount(0, { timeout: 6000 });
  await again.click();
  await expect(again).toHaveAttribute("aria-pressed", "false");
  expect(await due()).toBeNull();
  // taken back at once: no hint
  await again.click();
  await expect(stop.getByRole("status")).toHaveText("Will be shown again");
  await again.click();
  await expect(again).toHaveAttribute("aria-pressed", "false");
  await expect(stop.getByRole("status")).toHaveCount(0);
  expect(await due()).toBeNull();
  await expect(station(page), "and the stop's goes on to the question").toHaveAccessibleName(/^Next: question/);
  await station(page).click();
  await expect(choices).toHaveCount(5);
  await expect(stop).toHaveCount(0);
});

test("Reset progression on the Stages page asks first, then starts at stage 1 with no term met, on the device and in its progress document", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(onPath);
  await page.addInitScript(() => { if (localStorage.getItem("rd-negation") === null) { localStorage.setItem("rd-stages", "1,2,3"); localStorage.setItem("rd-negation", "one");
    localStorage.setItem("rd-stage-run", JSON.stringify({ up: 3, down: 0 })); localStorage.setItem("rd-ex-runs", JSON.stringify({ practice: { run: 5, right: 9 } }));
    localStorage.setItem("rd-guided", JSON.stringify({ practice: false })); } });
  await page.addInitScript(hook);
  await page.goto("/");
  await expect(page.locator("#path .chs .crow")).toHaveCount(5);
  expect(Object.keys(await page.evaluate(() => window.__t.intro.terms)).length).toBeGreaterThan(9);
  await page.getByRole("button", { name: "Practice options" }).click();
  const sheet = page.getByRole("dialog", { name: "Practice options" });
  await sheet.getByRole("button", { name: "Stages: more" }).click();
  const row = sheet.locator(".porow", { hasText: "Reset progression" });
  await expect(row).toContainText("Your answers, their statistics and your settings stay.");
  await row.getByRole("button", { name: "Reset progression" }).click();
  await row.getByRole("button", { name: "Keep it" }).click();
  expect(await page.evaluate(() => localStorage.getItem("rd-stages"))).toBe("1,2,3");
  await row.getByRole("button", { name: "Reset progression" }).click();
  await row.getByRole("button", { name: "Reset", exact: true }).click();
  await expect(row).toContainText("Done: stage 1");
  const stage = (n) => sheet.getByRole("switch", { name: new RegExp("^Stage " + n + " ") });
  await expect(stage(1)).toHaveAttribute("aria-checked", "true");
  await expect(stage(2)).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => [localStorage.getItem("rd-stages"), localStorage.getItem("rd-negation"), JSON.parse(localStorage.getItem("rd-terms")).terms])).toEqual(["1", "off", {}]);
  // the question behind the sheet was drawn again from stage 1, without Form, whose stop has not come
  expect(await cats(page)).not.toContain("form");
  const doc = await page.evaluate(async () => { const s = await (await window.__riglam.platform.db()).collection("progress").doc("learner").get(); return s.exists ? s.data() : null; });
  expect(doc).toMatchObject({ stages: [1], negation: "off", terms: { n: 0, terms: {} }, run: { up: 0, down: 0 }, exercises: {} });
  expect(await page.evaluate(() => [localStorage.getItem("rd-stage-run"), localStorage.getItem("rd-ex-runs"), localStorage.getItem("rd-guided")]), "the runs towards the stage offers start again, and every exercise is guided").toEqual(['{"up":0,"down":0}', "{}", "{}"]);
});

test("the stop shows the terms above the term, gray with a sign while their own stops are to come, and says that divisions come later", async ({ page }) => {
  await page.addInitScript(fresh);
  const stop = await toStop(page);
  const tree = stop.locator("ul.ttree li");
  // Existent has no stop in the course, so nothing waits for it; Functional thing does, and has not come
  await expect(tree.nth(0)).toHaveText("Existent");
  await expect(tree.nth(0)).not.toHaveClass(/gray/);
  await expect(tree.nth(1)).toHaveClass(/gray/);
  await expect(tree.nth(1)).toContainText("Functional thing");
  await expect(tree.nth(1)).toContainText("later");
  await expect(tree.nth(2)).toHaveText("Form");
  await expect(tree.nth(2)).toHaveAttribute("aria-current", "true");
  // its divisions are not named before their stops: an ellipsis says that they come
  await expect(tree.nth(3)).toHaveClass(/gray/);
  await expect(tree.nth(3)).toContainText("more divisions come later");
  await expect(tree).toHaveCount(4);
});

test("a division whose stop has come is named in the tree, and the ellipsis stays while another is to come", async ({ page }) => {
  await seed(page, ["form", "intf"], ["ft", "extf"]);
  const stop = await toStop(page);
  await expect(stop.locator(".cs")).toHaveText("Form");
  const tree = stop.locator("ul.ttree li");
  await expect(tree).toHaveText(["Existent", "Functional thing", "Form", "External form", /more divisions come later/]);
  await expect(stop.locator("ul.ttree li.gray")).toHaveCount(1);
});

test("Settings > Languages decides which names the stop shows: Tibetan with its Wylie, Sanskrit in Devanagari with its transliteration, Chinese in both writings with pinyin", async ({ page }) => {
  await seed(page, ["form"]);
  await page.addInitScript(onPath);
  await page.addInitScript(hook);
  await page.goto("/");
  await expect(page.locator("#path .chs .crow")).toHaveCount(5);
  await page.locator(".tstn").click();
  await page.locator(".road .rfoot").getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".ppage .ptitle")).toHaveText("Settings");
  const lang = (name) => page.getByRole("switch", { name });
  await expect(page.locator(".ppage .srow", { hasText: "English" }).first()).toContainText("Always shown");
  for (const name of ["Russian", "Tibetan", "Sanskrit", "Chinese"]) await expect(lang(name)).toHaveAttribute("aria-checked", "false");
  await lang("Tibetan").click();
  await lang("Sanskrit").click();
  await lang("Chinese").click();
  await expect(lang("Tibetan")).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => localStorage.getItem("rd-langs"))).toBe('["bo","skt","zh"]');
  expect(await page.evaluate(() => localStorage.getItem("rd-deflang"))).toBeNull();
  await page.getByRole("button", { name: /Back to the exercise/ }).click();
  await expect(page.locator("#path .chs .crow")).toHaveCount(5);
  await page.evaluate(() => window.__t.next());
  const names = page.locator("#path .tstop .tstop-names .nm");
  await expect(names).toHaveText(["གཟུགས (gzugs)", "रूप (rūpa)", "色（sè）"]);
  await expect(names.nth(0).locator("[lang=bo]")).toHaveText("གཟུགས");
  await expect(names.nth(1).locator("[lang=sa-Deva]")).toHaveText("रूप");
  await expect(names.nth(2).locator("[lang=zh-Hant]")).toHaveText("色");
  // two columns: the second name sits beside the first, the third under the first
  const boxes = await names.evaluateAll((els) => els.map((el) => { const b = el.getBoundingClientRect(); return { left: Math.round(b.left), top: Math.round(b.top) }; }));
  expect(Math.abs(boxes[1].top - boxes[0].top)).toBeLessThanOrEqual(1);
  expect(boxes[1].left).toBeGreaterThan(boxes[0].left + 40);
  expect(boxes[2].top).toBeGreaterThan(boxes[0].top);
  expect(boxes[2].left).toBe(boxes[0].left);
});

test("a term whose longest word does not fit its line shrinks as a whole, and no word of it breaks", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await seed(page, ["nonas"]);
  const stop = await toStop(page);
  const term = stop.locator(".cs");
  await expect(term).toHaveText("Non-associated compositional factor");
  const fit = () => term.evaluate((el) => {
    const text = el.firstChild, box = el.getBoundingClientRect(), r = document.createRange(), words = [];
    for (const m of el.textContent.matchAll(/\S+/g)) { r.setStart(text, m.index); r.setEnd(text, m.index + m[0].length); words.push({ w: m[0], lines: new Set([...r.getClientRects()].map((x) => Math.round(x.top))).size, over: r.getBoundingClientRect().right - box.right }); }
    return { words, tight: el.classList.contains("tight") };
  });
  await expect.poll(async () => (await fit()).words.every((x) => x.lines === 1 && x.over <= 1)).toBe(true);
  expect((await fit()).tight).toBe(false);
  await expect(term).toHaveAttribute("style", /font-size/);
});

test("the examples on a stop are everyday things of the practice list, with their stage and without the status of an example", async ({ page }) => {
  await page.addInitScript(fresh);
  const items = [{ n: "a vemo mountain", cls: ["Form"], lv: 1, st: 1, cf: "confirmed", s: [] }, { n: "a kipa lake", cls: ["Form"], lv: 1, st: 2, cf: "textbook", s: [] }];
  await serveCourse(page, dataKey, { stub: true, examples: { version: "e1", part: { format: "riglam-examples-device", version: 2, sources: {}, items } } });
  const stop = await toStop(page, true);
  await expect(stop.locator(".tstop-sech")).toHaveText(withCourse ? ["Definition", "Categories", "Examples"] : ["Categories", "Examples"]);
  const rows = stop.locator(".pdex.bare .pdexr");
  // the list has three plain things of Form, so the reference examples (which only fill what the list lacks) are not shown
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText("blood");
  await expect(rows.nth(1)).toContainText("a wooden chair");
  await expect(rows.nth(2)).toContainText("your hand");
  for (let i = 0; i < 3; i++) await expect(rows.nth(i)).toContainText("stage 1");
  await expect(stop).not.toContainText(/vemo|kipa|confirmed|textbook/i);
});

test("a stop shows examples from the practice list on a device that has none of the course's examples", async ({ page }) => {
  await page.addInitScript(fresh);
  const stop = await toStop(page);
  const rows = stop.locator(".pdex.bare .pdexr");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("blood");
  await expect(rows.locator("button")).toHaveCount(0); // a list example has no reason to tap
});
