// Categories: a thing is shown; the learner ticks the categories it is in (or answers yes or no for each), then picks the most specific. The things are the practice items of
// the stages that are on and, where the device holds them, reference examples: here invented ones (a plain and a second-level one for every term of the open data, at stages
// 6 and 7) served by a stand-in for the server (tests/support/data-key.js). The specs' devices are not new (the fixture stores a setting), so they start with stages 1 to 6.
// The page's own state is read through the test hook (tests/e2e/pwa/*.spec.js), so every path can be driven with answers known to be right or wrong.
import { test, expect } from "../../support/test.js";
import { goTo, openMenu, overflow, ready } from "../../support/page.js";
import { dataKey, KEY_STORE, serveCourse } from "../../support/data-key.js";
import { readOpen } from "../../../scripts/lib/course-files.mjs";

const hook = () => { window.__riglamTest = (t) => { window.__t = t; }; };
const withKey = (page) => page.addInitScript(([store, key]) => { try { localStorage.setItem(store, key); } catch { /* storage unavailable */ } }, [KEY_STORE, dataKey]);
const part = () => ({
  version: "e1",
  part: {
    format: "riglam-examples-device", version: 2, sources: {},
    items: Object.keys(readOpen().terms).flatMap((term) => [
      { n: `a ${term.toLowerCase()} sample`, cls: [term], lv: 1, k: "thing", cf: "confirmed", s: [] },
      { n: `a ${term.toLowerCase()} second sample`, cls: [term], lv: 2, k: "thing", cf: "textbook", s: [] },
    ]),
  },
});
const open = async (page) => {
  await withKey(page);
  await serveCourse(page, dataKey, { stub: true, examples: part() });
  await page.goto("/");
  await ready(page);
  await expect.poll(() => page.evaluate(() => !!window.__t.EX)).toBe(true);
  await goTo(page, "Categories");
  await expect(page.locator(".catcard")).toBeVisible();
};
// the stages on this device, from a reload on (the page reads them at the start)
const atStages = async (page, v) => {
  await page.evaluate((x) => localStorage.setItem("rd-stages", x), v);
  await page.reload();
  await expect(page.locator(".catcard")).toBeVisible(); // the app opens on the exercise used last
};
const rows = (page) => page.evaluate(() => window.__t.cur.q.rows.map((r) => ({ cat: r.cat, phrase: r.phrase, answer: r.answer })));
const thing = (page) => page.evaluate(() => window.__t.cur.q.thing.n);
const ui = (page, k) => page.evaluate((key) => window.__t.ui[key], k);
// the text must be the whole button's ("a form" is also part of "a form source")
const tick = (page, r) => page.locator(".catick").filter({ hasText: new RegExp(`^${r.phrase}$`) }).click();
const fwd = (page) => page.locator("#stage .pbar .fwd");
const saved = (page) => page.evaluate(async () => (await (await window.__riglam.platform.db()).collection("answers").get()).docs.map((d) => d.data()).filter((d) => d.mode === "categories"));
const setAsk = async (page, label) => {
  await page.getByRole("button", { name: "Practice options" }).click();
  await page.locator(".seg").getByRole("button", { name: label }).click();
  await page.locator("#over .oc").click();
};
// ticks exactly the categories that apply (or, with `slip`, one more or one fewer), then checks
const tickAnswer = async (page, slip = false) => {
  const rs = await rows(page);
  const wanted = slip ? rs.map((r) => (r.answer ? false : true)).map((b, i) => (b ? rs[i] : null)).filter(Boolean).slice(0, 1) : rs.filter((r) => r.answer);
  for (const r of wanted) await tick(page, r);
  await fwd(page).click();
};
// from the check of step 1 on, to the end of the thing: picks the most specific category (or a wrong one) when step 2 is asked
const finish = async (page, right = true) => {
  if (await ui(page, "checked")) return;
  await fwd(page).click(); // Continue
  const n = await page.evaluate(() => ({ options: window.__t.ui.narrow.options.map((o) => o.phrase), cat: window.__t.ui.narrow.cat, all: window.__t.ui.narrow.options.map((o) => o.cat) }));
  const i = right ? n.all.indexOf(n.cat) : n.all.findIndex((c) => c !== n.cat);
  await page.locator(".catopt").nth(i).click();
};

test.beforeEach(async ({ page }) => { await page.addInitScript(hook); });

test("Categories is in the menu also on a device without the reference examples, and asks about the practice items", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await openMenu(page);
  await expect(page.locator('#menu [data-go="categories"]')).toBeVisible();
  await page.locator('#menu [data-go="categories"]').click();
  await expect(page.locator(".catcard")).toBeVisible();
  expect(await page.evaluate(() => !!window.__t.cur.q.thing.item)).toBe(true);
  await expect(page.locator(".catm")).toContainText(/^stage \d$/);
});

test("a thing is shown with its categories as buttons; Check waits for a tick or None of these", async ({ page }) => {
  await open(page);
  await expect(page.locator(".catn")).toHaveText(await thing(page));
  await expect(page.locator(".catm")).toContainText(/^stage \d/);
  const rs = await rows(page);
  await expect(page.locator(".catick")).toHaveCount(rs.length + 1);
  await expect(page.locator(".catask")).toHaveText("Which of these is it? Tick everything it is.");
  await expect(fwd(page)).toBeDisabled();
  await tick(page, rs[0]);
  await expect(page.locator(".catick").filter({ hasText: new RegExp(`^${rs[0].phrase}$`) })).toHaveAttribute("aria-pressed", "true");
  await expect(fwd(page)).toBeEnabled();
  await tick(page, rs[0]);
  await expect(fwd(page)).toBeDisabled();
  await page.locator(".catick.dashed").click(); // None of these and a tick exclude each other
  await expect(fwd(page)).toBeEnabled();
  await tick(page, rs[0]);
  await expect(page.locator(".catick.dashed")).toHaveAttribute("aria-pressed", "false");
});

test("ticking the right categories checks them in two groups, then Continue asks for the most specific on one tap", async ({ page }) => {
  await open(page);
  // draw until a thing with two or more categories that lie on one line (step 2 is asked)
  for (let i = 0; i < 60 && !(await page.evaluate(() => window.__t.cur.q.rows.filter((r) => r.answer).length >= 2)); i++) { await page.keyboard.press("s"); }
  const rs = await rows(page);
  for (const r of rs.filter((x) => x.answer)) await tick(page, r);
  await fwd(page).click();
  await expect(page.locator(".catgh").nth(0)).toContainText("What applies");
  await expect(page.locator(".catgh").nth(1)).toContainText("What does not apply");
  await expect(page.locator(".catsum")).toContainText("all " + rs.length + " right");
  expect(await overflow(page), "nothing runs off the side").toBeLessThanOrEqual(0);
  expect(await page.locator(".catgrp").nth(0).locator(".catr").count()).toBe(rs.filter((x) => x.answer).length);
  expect(await page.locator(".catgrp").nth(1).locator(".catr").count()).toBe(rs.filter((x) => !x.answer).length);
  if (await ui(page, "checked")) return; // the categories did not lie on one line: step 2 was skipped
  await expect(fwd(page)).toHaveText(/^Continue/);
  await fwd(page).click();
  await expect(page.locator(".catask")).toHaveText("Which category is the most specific?");
  const n = await page.evaluate(() => ({ cat: window.__t.ui.narrow.cat, all: window.__t.ui.narrow.options.map((o) => o.cat) }));
  await page.locator(".catopt").nth(n.all.indexOf(n.cat)).click(); // one tap, no Check
  await expect(page.locator(".catsum")).toContainText("Step 2 · right");
  await expect(page.locator(".catline")).toBeVisible();
  await expect(fwd(page)).toHaveText(/^Next/);
});

test("a wrong pick in step 2 is true but not the most specific, and a slip in step 1 is corrected before step 2", async ({ page }) => {
  await open(page);
  for (let i = 0; i < 60 && !(await page.evaluate(() => window.__t.cur.q.rows.filter((r) => r.answer).length >= 2 && !!window.__t.cur.q.rows.find((r) => !r.answer))); i++) await page.keyboard.press("s");
  await tickAnswer(page, true); // ticks one that does not apply, and nothing else
  await expect(page.locator(".catsum")).toContainText("of " + (await rows(page)).length + " right");
  await expect(page.locator(".catr.bad").first()).toBeVisible();
  if (await ui(page, "checked")) return;
  await expect(page.locator(".catnote").filter({ hasText: "Step 2 uses the corrected set" })).toBeVisible();
  await finish(page, false);
  await expect(page.locator(".catsum")).toContainText("true, but not the most specific");
  await expect(page.locator(".catline .lo").first()).toBeVisible();
});

test("one by one: a question for each category, the buttons stay put and the answers collect under them, newest first", async ({ page }) => {
  await open(page);
  await setAsk(page, "One by one");
  const rs = await rows(page);
  expect(await ui(page, "ask")).toBe("one");
  const yes = page.locator(".catyes"), no = page.locator(".catno");
  const asked = page.locator(".catask:not(.ghost)");
  await expect(asked).toHaveText(`Is ${await thing(page)} ${rs[0].phrase}?`);
  const box = await yes.boundingBox();
  await (rs[0].answer ? yes : no).click();
  await expect(asked).toHaveText(`Is ${await thing(page)} ${rs[1].phrase}?`);
  expect((await yes.boundingBox()).y, "the buttons stay where they are").toBe(box.y);
  await expect(page.locator(".catlog .catr")).toHaveCount(1);
  await (rs[1].answer ? yes : no).click();
  if (rs.length > 2) {
    await expect(page.locator(".catlog .catr").first().locator(".catph b")).toHaveText(rs[1].phrase); // newest first
    for (let i = 2; i < rs.length; i++) await (rs[i].answer ? yes : no).click();
  }
  await expect(page.locator(".catgh").first()).toContainText("What applies");
  await expect(page.locator(".catsum")).toContainText("Step 1 · all " + rs.length + " right");
  expect(await overflow(page), "nothing runs off the side").toBeLessThanOrEqual(0);
});

test("the keyboard keeps its place: a tick or an answer leaves the focus on its button, Enter checks from a tick, and Enter on a folded row opens its reason", async ({ page }) => {
  await open(page);
  for (let i = 0; i < 60 && !(await page.evaluate(() => window.__t.cur.q.rows.filter((r) => r.answer).length >= 2)); i++) await page.keyboard.press("s");
  const rs = await rows(page);
  const first = page.locator(".catick").filter({ hasText: new RegExp(`^${rs.find((r) => r.answer).phrase}$`) });
  await first.focus();
  await page.keyboard.press("Enter");
  await expect(first, "Enter ticks a button that is not ticked yet, as on any button").toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Space");
  await expect(first).toHaveAttribute("aria-pressed", "false");
  await page.keyboard.press("Space");
  await expect(first).toHaveAttribute("aria-pressed", "true");
  await expect(first, "the focus stays on the button that was ticked").toBeFocused();
  for (const r of rs.filter((x) => x.answer).slice(1)) await tick(page, r);
  await first.focus();
  await page.keyboard.press("Enter"); // checks, instead of unticking
  await expect(page.locator(".catgh").first()).toContainText("What applies");
  if (await ui(page, "checked")) return;
  const folded = page.locator('.catr[role="button"]').first();
  await folded.focus();
  await page.keyboard.press("Enter");
  await expect(folded).toHaveAttribute("aria-expanded", "true");
  expect(await ui(page, "step"), "Enter on a row does not go on to step 2").toBe(1);
});

test("the keys: numbers tick, Enter checks, a number picks the most specific, N goes on", async ({ page }) => {
  await open(page);
  for (let i = 0; i < 60 && !(await page.evaluate(() => window.__t.cur.q.rows.filter((r) => r.answer).length >= 2)); i++) await page.keyboard.press("s");
  const rs = await rows(page);
  await page.evaluate(() => document.activeElement.blur()); // a button with the focus takes Enter for itself
  for (const [i, r] of rs.entries()) if (r.answer) await page.keyboard.press(String(i + 1));
  await page.keyboard.press("Enter");
  await expect(page.locator(".catgh").first()).toContainText("What applies");
  if (!(await ui(page, "checked"))) {
    await page.keyboard.press("Enter");
    await expect(page.locator(".catask")).toHaveText("Which category is the most specific?");
    if (await page.evaluate(() => matchMedia("(min-width:1100px)").matches)) {
      await page.keyboard.press("Enter");
      expect(await ui(page, "checked"), "on a wide screen a second Enter does not pick the first choice").toBe(false);
    }
    const n = await page.evaluate(() => ({ cat: window.__t.ui.narrow.cat, all: window.__t.ui.narrow.options.map((o) => o.cat) }));
    await page.keyboard.press(String(n.all.indexOf(n.cat) + 1));
  }
  await expect(fwd(page)).toHaveText(/^Next/);
  const was = await thing(page);
  await page.keyboard.press("n");
  await expect.poll(() => ui(page, "checked")).toBe(false);
  expect(await ui(page, "step")).toBe(0);
  expect(await thing(page)).not.toBe(was);
});

test("a finished thing is kept as an answer of its own kind, and Skip keeps nothing", async ({ page }) => {
  await open(page);
  await page.getByRole("button", { name: "Skip" }).click();
  expect(await saved(page)).toEqual([]);
  await tickAnswer(page);
  await finish(page);
  await expect(fwd(page)).toHaveText(/^Next/);
  await expect.poll(async () => (await saved(page)).length).toBe(1);
  const [doc] = await saved(page);
  expect(doc.mode).toBe("categories");
  expect(doc.thing).toBe(await thing(page));
  expect(doc.level).toBe(1);
  expect(doc.stage).toBe(await page.evaluate(() => window.__t.cur.q.thing.st));
  expect(doc.grade).toBe("ok");
  expect(doc.rows.length).toBeGreaterThan(2);
});

test("Skip asks first once something is ticked, and an example set aside is not kept", async ({ page }) => {
  await open(page);
  await tick(page, (await rows(page))[0]);
  await page.getByRole("button", { name: "Skip this example" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Skip this example?");
  await page.locator(".dlg").getByRole("button", { name: "Keep going" }).click();
  expect(await ui(page, "ticked")).toHaveLength(1);
  await page.getByRole("button", { name: "Skip this example" }).click();
  await page.locator(".dlg").getByRole("button", { name: "Skip anyway" }).click();
  await expect.poll(() => ui(page, "ticked")).toEqual([]);
  expect(await saved(page)).toEqual([]);
});

test("after five right in a row the next stage is offered with a tap, and Not now leaves things as they are", async ({ page }) => {
  await open(page);
  await atStages(page, "1");
  const finishThing = async () => { await tickAnswer(page); await finish(page); };
  for (let i = 0; i < 4; i++) { await finishThing(); await expect(page.locator(".catoffer")).toHaveCount(0); await page.keyboard.press("n"); }
  await finishThing();
  await expect(page.locator(".catoffer")).toBeVisible();
  await expect(page.locator(".catoq")).toContainText("Stage 1 is going well. Add stage 2");
  await page.getByRole("button", { name: "Not now" }).click();
  await expect(page.locator(".catoffer")).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement === document.body), "the focus does not fall to the page").toBe(false);
  await expect(page.locator('[role="status"].catnote')).toContainText("Stage 1 stays the highest");
  expect(await page.evaluate(() => localStorage.getItem("rd-stages"))).toBe("1");
  // another five, and this time a tap adds the stage, for every exercise
  await page.keyboard.press("n");
  for (let i = 0; i < 4; i++) { await finishThing(); await page.keyboard.press("n"); }
  await finishThing();
  await page.getByRole("button", { name: "Add stage 2" }).click();
  await expect(page.locator('[role="status"].catnote')).toContainText("Stage 2, what you see, is on now in every exercise");
  expect(await page.evaluate(() => localStorage.getItem("rd-stages"))).toBe("1,2");
  expect(await page.evaluate(() => document.activeElement === document.body), "the focus does not fall to the page").toBe(false);
});

test("an offer passed over with Next counts as Not now: it asks again after another five", async ({ page }) => {
  await open(page);
  await atStages(page, "1");
  const finishThing = async () => { await tickAnswer(page); await finish(page); };
  for (let i = 0; i < 4; i++) { await finishThing(); await page.keyboard.press("n"); }
  await finishThing();
  await expect(page.locator(".catoffer")).toBeVisible();
  await page.keyboard.press("n");
  for (let i = 0; i < 4; i++) { await finishThing(); await expect(page.locator(".catoffer")).toHaveCount(0); await page.keyboard.press("n"); }
  await finishThing();
  await expect(page.locator(".catoffer")).toBeVisible();
});

// The tutor does not know Categories (its chat button only opens the recent answers there), so the panel is not the tutor's: it stays open from one thing to the next.
test("where the tutor is on, the panel of recent answers opened in Categories stays open from one thing to the next", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "pwa-desktop", "the panel is on wide screens only");
  await page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, tutor: "on" }) }));
  await open(page);
  await page.getByRole("button", { name: /recent answers|tutor.s chat/i }).click();
  await expect(page.locator("#coach")).toBeVisible();
  await tickAnswer(page);
  await finish(page);
  await page.keyboard.press("n");
  await expect(page.locator("#coach")).toBeVisible();
});

test("four wrong in a row at the top stage suggest switching it off; the practice options show the stages and the way to ask", async ({ page }) => {
  await open(page);
  await atStages(page, "1,2");
  await page.getByRole("button", { name: "Practice options" }).click();
  await expect(page.locator(".ocard").filter({ hasText: "Stages" })).toContainText("Stages 1–2");
  await expect(page.locator(".seg").getByRole("button", { name: "All at once" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".ocard").filter({ hasText: "Notation" })).toHaveCount(0); // nothing about pairs
  await page.locator("#over .oc").click();
  let wrong = 0;
  for (let i = 0; i < 80 && !(await page.locator(".catoffer").count()); i++) {
    const stage = await page.evaluate(() => window.__t.cur.q.thing.st);
    await page.locator(".catick.dashed").click(); // "None of these" is wrong for every thing that is in a category
    await fwd(page).click();
    await finish(page, false);
    if (stage === 2) wrong++;
    if (!(await page.locator(".catoffer").count())) await page.keyboard.press("n");
  }
  expect(wrong).toBeLessThanOrEqual(8);
  await expect(page.locator(".catoq")).toContainText("Stage 2 is hard going right now");
  await page.getByRole("button", { name: "Switch off stage 2" }).click();
  expect(await page.evaluate(() => localStorage.getItem("rd-stages"))).toBe("1");
});
