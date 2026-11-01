// Voice in the four exercises beyond Relations and Pervasions: Syllogisms (the reply, then the counter-example), Categories (all at once, and one at a time), Find a pair (the two
// phenomena; its examples are asked as those of Relations are) and Find an instance (a thing, or "nothing"). The browser's speech is stood in for (tests/support/voice.js); the
// rules of reading what was said are src/domain/spoken.ts's and have their own unit tests (tests/unit/spoken.test.ts), these check that each screen asks, takes the answer through
// the steps a tap or typed words take, waits for Yes, and can take the step back.
import { test, expect } from "../../support/test.js";
import { exerciseAtRest } from "../../support/page.js";
import { dataKey, KEY_STORE, serveCourse } from "../../support/data-key.js";
import { readOpen } from "../../../scripts/lib/course-files.mjs";
import { voice, said, hearNext, mic, idle, waiting, confirm, settle, hear } from "../../support/voice.js";

const choices = (page) => page.locator("#path .chs .crow");
const verdict = (page) => page.locator("#path .pvline");
const strip = (page) => page.locator("#vhear");
const saved = (page, mode) => page.evaluate(async (m) => (await (await window.__riglam.platform.db()).collection("answers").get()).docs.map((d) => d.data()).filter((d) => d.mode === m), mode);
const label = (page) => page.locator("#vfield .vwhat b");
const chip = (page) => page.locator("#vfield .vchip");

async function open(page, name) {
  await page.goto("/");
  await expect(choices(page)).toHaveCount(5);   // Relations first
  await page.locator(".tstn").click();
  await page.getByRole("dialog", { name: "Roadmap" }).getByRole("button", { name: new RegExp("^" + name) }).click();
  await expect(page.locator(".ptb-t")).toContainText(name);
  await exerciseAtRest(page);
}
/** Draws the next syllogism (without answering) until `ok(c)` holds. */
const drawSyllogism = (page, answer) => page.evaluate((a) => { for (let i = 0; i < 600; i++) { if (window.__t.cur.c.answer === a) return true; window.__t.next(); } return false; }, answer);

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.__riglamTest = (t) => { window.__t = t; }; });
});

const SAY = { accept: "I accept", reason: "The reason is not established", pervasion: "There is no pervasion" };

test("Syllogisms: the syllogism is read with the question, the reply is said and waits for Yes, and the answer is stored", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap", confirm: "wait" } });
  await open(page, "Syllogisms");
  expect(await drawSyllogism(page, "reason")).toBe(true);
  await strip(page).click();
  await expect.poll(async () => (await said(page)).at(-1) || "").toMatch(/Do you accept it\?$/);
  const c = await page.evaluate(() => ({ subject: window.__t.cur.c.subject, reason: window.__t.cur.c.reason }));
  expect((await said(page)).at(-1)).toContain(c.subject);
  await idle(page);
  await hear(page, "the reason is not established");
  await expect(label(page)).toHaveText(SAY.reason);
  expect(await saved(page, "syllogism")).toHaveLength(0);   // nothing is kept before Yes
  await confirm(page);
  await expect(verdict(page)).toContainText("Right");
  await expect.poll(async () => (await saved(page, "syllogism")).length).toBe(1);
  expect((await saved(page, "syllogism"))[0]).toMatchObject({ said: "reason", answer: "reason" });
});

test("Syllogisms: 'there is no pervasion' goes on to the counter-example, which Change takes back without reading the replies again; the counter-example is then asked, and 'skip' leaves it out", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap", confirm: "wait" } });
  await open(page, "Syllogisms");
  expect(await drawSyllogism(page, "pervasion")).toBe(true);
  await strip(page).click();
  await expect.poll(async () => (await said(page)).at(-1) || "").toMatch(/Do you accept it\?$/);
  await idle(page);
  await hear(page, "there is no persuasion");   // a recognizer's slip
  await expect(label(page)).toHaveText(SAY.pervasion);
  await confirm(page);
  await expect(page.locator("#sylex")).toBeVisible();   // the counter-example is asked
  await expect.poll(async () => (await said(page)).at(-1) || "").toMatch(/^Name something that is/);
  await idle(page);
  const n = (await said(page)).length;
  await expect(chip(page)).toContainText(SAY.pervasion);
  await chip(page).getByRole("button", { name: "Change" }).click();
  await expect(choices(page)).toHaveCount(3);   // back at the replies, none picked
  expect(await page.evaluate(() => window.__t.ui.step)).toBe(0);
  await expect(mic(page)).toHaveAttribute("aria-pressed", "true");   // the microphone is open again
  expect((await said(page)).length).toBe(n);   // and the question is not read again
  await hearNext(page, "no pervasion");
  await settle(page);
  await expect(waiting(page)).toBeVisible();
  await confirm(page);
  await expect(page.locator("#sylex")).toBeVisible();
  await expect.poll(async () => (await said(page)).length).toBeGreaterThan(n);   // the counter-example is asked afresh
  await idle(page);
  await hear(page, "skip");
  await expect(label(page)).toHaveText("no counter-example");
  await confirm(page);
  await expect(verdict(page)).toContainText("Right");
  await expect.poll(async () => (await saved(page, "syllogism")).length).toBe(1);
  const doc = (await saved(page, "syllogism"))[0];
  expect(doc).toMatchObject({ said: "pervasion", correct: true });
  expect(doc.example).toBeUndefined();
});

test("Syllogisms: Escape takes back an answer that waits even with the counter-example field focused", async ({ page }, info) => {
  test.skip(info.project.name === "pwa-phone", "on a phone the keyboard takes the place of the field, and there is no Escape key");
  await voice(page, { settings: { read: "0", answer: "tap", confirm: "wait" } });
  await open(page, "Syllogisms");
  expect(await drawSyllogism(page, "pervasion")).toBe(true);
  await hear(page, "no pervasion");
  await confirm(page);
  await expect(page.locator("#sylex")).toBeVisible();
  await page.locator("#sylex").focus();
  await hear(page, "a gold ring");
  await expect(waiting(page)).toBeVisible();
  await page.locator("#sylex").focus();
  await page.keyboard.press("Escape");   // the field has the focus, and the answer that waits is still taken back
  await expect(waiting(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.__t.ui.step)).toBe(1);   // and the page stays at the counter-example
});

test("Syllogisms: 'no' said within a few seconds of a step that went on takes that step back", async ({ page }) => {
  await voice(page, { settings: { read: "0", answer: "tap", confirm: "wait" } });
  await open(page, "Syllogisms");
  expect(await drawSyllogism(page, "pervasion")).toBe(true);
  await hear(page, "no pervasion");
  await confirm(page);
  await expect(chip(page)).toContainText(SAY.pervasion);
  await hearNext(page, "no");
  await mic(page).click();
  await expect(choices(page)).toHaveCount(3);   // the replies again
  expect(await page.evaluate(() => window.__t.ui.step)).toBe(0);
});

test("Syllogisms: the subject itself is no counter-example: the page says so, the field is emptied and nothing is graded", async ({ page }) => {
  await voice(page, { settings: { read: "0", answer: "tap", confirm: "wait" } });
  await open(page, "Syllogisms");
  expect(await drawSyllogism(page, "pervasion")).toBe(true);
  await hear(page, "no pervasion");
  await confirm(page);
  const subject = await page.evaluate(() => window.__t.cur.c.subject);
  await hear(page, subject);
  await confirm(page);
  await expect(page.locator("#path .pnoteline")).toBeVisible();
  await expect(page.locator("#sylex")).toHaveValue("");
  expect(await page.evaluate(() => window.__t.ui.step)).toBe(1);
  expect(await saved(page, "syllogism")).toHaveLength(0);
});

test("a clock of Sprint stands still while a spoken answer waits and runs again after Yes", async ({ page }) => {
  await voice(page, { settings: { read: "0", answer: "tap", confirm: "wait" } });
  await page.addInitScript(() => { try { localStorage.setItem("rd-blitz", "1"); localStorage.setItem("rd-timer", "20000"); localStorage.setItem("rd-timer-rel", "20000"); } catch { /* storage unavailable */ } });
  await open(page, "Syllogisms");
  expect(await drawSyllogism(page, "reason")).toBe(true);
  await hear(page, "the reason is not established");
  await expect.poll(() => page.evaluate(() => !!window.__t.ui.hold)).toBe(true);
  await confirm(page);
  await expect(verdict(page)).toContainText("Right");
  expect(await page.evaluate(() => !!window.__t.ui.hold)).toBe(false);
});

test("Syllogisms: a counter-example said is written in the field and graded with the reply", async ({ page }) => {
  await voice(page, { settings: { read: "0", answer: "tap", confirm: "wait" } });
  await open(page, "Syllogisms");
  expect(await drawSyllogism(page, "pervasion")).toBe(true);
  const witness = await page.evaluate(() => window.__t.cur.c.witness);
  await hear(page, "pervasion");
  await confirm(page);
  await hear(page, witness || "a wooden table");
  await expect(label(page)).toHaveText(witness || "a wooden table");
  await confirm(page);
  await expect(verdict(page)).toBeVisible();
  await expect.poll(async () => (await saved(page, "syllogism")).length).toBe(1);
  expect((await saved(page, "syllogism"))[0].example).toBeTruthy();
});

// Find an instance draws its categories at random: another set until one of the kind the test needs is on screen
async function drawInstance(page, possible) {
  for (let i = 0; i < 60; i++) {
    const q = await page.evaluate(() => window.__t.cur.iq);
    if (q.possible === possible) return q;
    await page.evaluate(() => window.__t.skipPair());
  }
  throw new Error("no set with possible " + possible);
}

test("Find an instance: the categories are read, a thing said waits for Yes and is checked like a typed one", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap", confirm: "wait" } });
  await open(page, "Find an instance");
  const q = await drawInstance(page, true);
  await strip(page).click();
  await expect.poll(async () => (await said(page)).at(-1) || "").toContain(q.labels[0]);
  await idle(page);
  await hear(page, q.known[0]);
  await expect(label(page)).toHaveText(q.known[0]);
  await confirm(page);
  await expect(verdict(page)).toContainText("Right");
  await expect.poll(async () => (await saved(page, "instance")).length).toBe(1);
  expect((await saved(page, "instance"))[0]).toMatchObject({ cats: q.cats, said: q.known[0], grade: "ok" });
});

test("Find an instance: 'nothing' is the answer that nothing is all of the categories", async ({ page }) => {
  await voice(page, { settings: { read: "0", answer: "tap", confirm: "wait" } });
  await open(page, "Find an instance");
  const q = await drawInstance(page, false);
  await hear(page, "there is none");
  await expect(label(page)).toHaveText(/^nothing is|^nothing can be/);
  await confirm(page);
  await expect(verdict(page)).toContainText("Right");
  await expect.poll(async () => (await saved(page, "instance")).length).toBe(1);
  expect((await saved(page, "instance"))[0]).toMatchObject({ cats: q.cats, possible: false, said: null, grade: "ok" });
});

test("Find a pair: two phenomena said in one breath go on to the examples, which are asked one case at a time; Change goes back to the pair with the words kept", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap", confirm: "wait" } });
  await open(page, "Find a pair");
  await strip(page).click();
  await expect.poll(async () => (await said(page)).at(-1) || "").toMatch(/^Name two phenomena that are /);
  await idle(page);
  await hear(page, "a wooden table and a metal table");
  await expect(label(page)).toHaveText("a wooden table and a metal table");
  await confirm(page);
  await expect(page.locator("#cin")).toBeVisible();   // the examples
  await expect(chip(page)).toContainText("a wooden table and a metal table");
  await expect.poll(async () => (await said(page)).at(-1) || "").toMatch(/^Name something that is /);   // the first case is read, as in Relations
  await chip(page).getByRole("button", { name: "Change" }).click();
  await expect(page.locator("#fw-a")).toHaveValue("a wooden table");   // the words stay
  await expect(page.locator("#fw-b")).toHaveValue("a metal table");
  await expect(page.locator("#cin")).toHaveCount(0);
});

// the examples are invented (a plain one for every term of the open data) and served by a stand-in for the server, as in categories.spec.js
const examples = () => ({
  version: "e1",
  part: {
    format: "riglam-examples-device", version: 2, sources: {},
    items: Object.keys(readOpen().terms).map((term) => ({ n: `a ${term.toLowerCase()} sample`, cls: [term], lv: 1, k: "thing", cf: "confirmed", s: [] })),
  },
});
async function openCategories(page, ask) {
  await page.addInitScript(([store, key, a]) => { try { localStorage.setItem(store, key); if (a) localStorage.setItem("rd-cats-ask", a); } catch { /* storage unavailable */ } }, [KEY_STORE, dataKey, ask]);
  await serveCourse(page, dataKey, { stub: true, examples: examples() });
  await page.goto("/");
  await expect.poll(() => page.evaluate(() => !!window.__t.EX)).toBe(true);
  await page.locator(".tstn").click();
  await page.getByRole("dialog", { name: "Roadmap" }).getByRole("button", { name: /^Categories/ }).click();
  await expect(page.locator(".ptb-t")).toContainText("Categories");
  await exerciseAtRest(page);
}

test("Categories, all at once: the categories said are the ticked ones, and Yes checks them", async ({ page }) => {
  await voice(page, { settings: { read: "1", answer: "tap", confirm: "wait" } });
  await openCategories(page, "");
  const rows = await page.evaluate(() => window.__t.cur.q.rows.map((r) => ({ phrase: r.phrase, answer: r.answer })));
  const right = rows.filter((r) => r.answer).map((r) => r.phrase);
  await strip(page).click();
  await expect.poll(async () => (await said(page)).at(-1) || "").toMatch(/^Which categories is .* in\?$/);
  await idle(page);
  await hear(page, right.length ? right.join(" and ") : "none of these");
  await expect(label(page)).toHaveText(right.length ? right.join(", ").replace(/, ([^,]*)$/, right.length > 1 ? " and $1" : ", $1") : "none of these");
  expect(await saved(page, "categories")).toHaveLength(0);
  await confirm(page);
  await expect(verdict(page)).toContainText("Right");
  await expect.poll(async () => (await saved(page, "categories")).length).toBe(1);
});

test("Categories, one at a time: a yes or a no goes on at once, Change takes the last one back, and the last answer checks", async ({ page }) => {
  await voice(page, { settings: { read: "0", answer: "tap", confirm: "split" } });
  await openCategories(page, "one");
  const rows = await page.evaluate(() => window.__t.cur.q.rows.map((r) => r.answer));
  await hear2(page, rows[0] ? "yes" : "no");
  await expect(chip(page)).toContainText(rows[0] ? "Yes" : "No");   // gone on, with a way back
  expect(await page.evaluate(() => window.__t.ui.i)).toBe(1);
  await chip(page).getByRole("button", { name: "Change" }).click();
  expect(await page.evaluate(() => window.__t.ui.i)).toBe(0);   // asked again
  for (let i = 0; i < rows.length - 1; i++) await hear2(page, rows[i] ? "yes" : "no");
  await hearNext(page, rows[rows.length - 1] ? "yes" : "no");
  await mic(page).click();   // the last answer checks the thing
  await expect(verdict(page)).toContainText("Right");
  await expect.poll(async () => (await saved(page, "categories")).length).toBe(1);
});
/** Says one phrase with the mic, without waiting for an answer that waits (a yes or a no goes on by itself). */
async function hear2(page, phrase) {
  await hearNext(page, phrase);
  await mic(page).click();
  await settle(page);
}
