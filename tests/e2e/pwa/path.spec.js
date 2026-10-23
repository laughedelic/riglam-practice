// The Path (src/app/path), the redesign behind Settings > Design: Relations drawn on the path from the relation to the result, the roadmap
// from the top bar, the practice options as a sheet, Settings with the switch back to the classic page, and the question before a skip.
// The other exercises on the Path are in path-exercises.spec.js; what they do is their own specs'.
import { test, expect } from "../../support/test.js";
import { isPhone, openSettings, overflow } from "../../support/page.js";
import { withCourse } from "../../support/data-key.js";

const onPath = () => { if (localStorage.getItem("rd-design") === null) localStorage.setItem("rd-design", "path"); };
const savedAnswers = (page) => page.evaluate(async () => (await (await window.__riglam.platform.db()).collection("answers").get()).size);
const choices = (page) => page.locator("#path .chs .crow");

async function start(page) {
  await page.addInitScript(onPath);
  await page.goto("/");
  await expect(choices(page)).toHaveCount(5);
}
/** Picks a relation and writes an example for each case it asks for, with Enter after each. */
async function answer(page) {
  await choices(page).first().click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (let i = 0; i < 4 && (await field.isVisible()); i++) {
    await field.fill("thing " + (i + 1));
    await field.press("Enter");
  }
  await expect(field).toHaveCount(0);
}

test("Relations on the Path: a relation, the examples, the check, the result, and the next pair", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  await expect(page.locator("#app")).toBeHidden();
  await expect(page.locator(".ptb-t")).toContainText("Relations");
  await expect(page.locator("#stnp")).toHaveAccessibleName(/Examples: pick a relation first/);
  await answer(page);
  const station = page.locator("#stn");
  await expect(station).toHaveAccessibleName(/^Check/);
  await station.click();
  await expect(page.locator(".pvline")).toBeVisible();
  await expect(page.locator(".pvline")).toContainText(/Right|Right so far|Partly right|Not quite/);
  await expect.poll(() => savedAnswers(page)).toBe(1);
  await expect(station).toHaveAccessibleName(/Next pair/);
  await expect(station).toBeFocused();   // Enter goes on, as the forward button has it on the classic page
  await station.click();
  await expect(choices(page)).toHaveCount(5);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});

test("a case can say that nothing exists, and a written one opens again with a tap", async ({ page }) => {
  await start(page);
  await choices(page).nth(3).click();   // Four possibilities: all four cases
  await page.locator("#cin").fill("a red pot");
  await page.locator("#cin").press("Enter");
  await page.getByRole("button", { name: "nothing exists" }).click();
  await expect(page.locator(".sb.done .pans.nil")).toHaveText("nothing exists");
  await page.locator(".sbb").first().click();
  await expect(page.locator("#cin")).toHaveValue("a red pot");
});

test("the knob of the strip opens the earlier steps with one tap, and folds them with the next", async ({ page }) => {
  await start(page);
  await choices(page).nth(3).click();
  await page.locator("#cin").blur();   // on a phone the field's keyboard puts the heading in place of the strip
  const strip = page.locator("#path .pstrip"), knob = strip.locator(".knob");
  await expect(knob).toBeVisible();
  await knob.click();
  await expect(strip).toHaveClass(/\bopen\b/);
  await knob.click();
  await expect(strip).not.toHaveClass(/\bopen\b/);
});

test("under Blitz each countdown has a bar of its own on the top bar, so that it starts full", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("rd-blitz", "1"); });
  await start(page);
  const bar = page.locator("#path .ptb .pclock");
  await expect(bar).toHaveCount(1);   // the relation's countdown
  await bar.evaluate((b) => { b.dataset.old = "1"; });
  await choices(page).nth(3).click();
  await expect(page.locator("#cin")).toBeVisible();
  await expect(bar).toHaveCount(1);   // the countdown of the examples
  await expect(page.locator("#path .pclock[data-old]")).toHaveCount(0);
});

test("the roadmap comes down from the top bar and goes to another exercise", async ({ page }) => {
  await start(page);
  await page.locator(".tstn").click();
  const road = page.getByRole("dialog", { name: "Roadmap" });
  await expect(road).toBeVisible();
  await expect(road.locator("[aria-current=page]")).toHaveAccessibleName(/Relations, here/);
  await road.getByRole("button", { name: /^Pervasions/ }).click();
  await expect(road).toBeHidden();
  await expect(page.locator(".ptb-t")).toContainText("Pervasions");
  await expect(page.locator("#path .qst")).toBeVisible();   // its first question, drawn on the path
  await page.locator(".tstn").click();
  await road.getByRole("button", { name: /^Relations/ }).click();
  await expect(choices(page)).toHaveCount(5);
});

test("the practice options are a sheet from the top bar, and a choice there is kept", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "Practice options" }).click();
  const sheet = page.getByRole("dialog", { name: "Practice options" });
  await expect(sheet).toBeVisible();
  await sheet.getByRole("group", { name: "Notation" }).getByRole("button", { name: "Sets" }).click();
  expect(await page.evaluate(() => localStorage.getItem("rd-notation"))).toBe("sets");
  await expect(choices(page).first().locator(".rsym")).not.toBeEmpty();   // the relation's sign in the notation picked
  await sheet.getByRole("button", { name: "Close the practice options" }).click();
  await expect(sheet).toBeHidden();
});

test("Settings switches to the classic page and back, and the device keeps the choice", async ({ page }) => {
  await start(page);
  await page.locator(".tstn").click();
  await page.locator(".road .rfoot").getByRole("button", { name: "Settings" }).click();
  await expect(page.locator(".ppage .ptitle")).toHaveText("Settings");
  await page.getByRole("group", { name: "Design" }).getByRole("button", { name: "Classic" }).click();
  await expect(page.locator("#path")).toBeHidden();
  await expect(page.locator("#app")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("rd-design"))).toBe("classic");
  await page.reload();
  await expect(page.locator("#stage .head .pair")).toBeVisible();
  // the classic Settings has the same switch
  await openSettings(page);
  await page.locator("#over .orow.design").getByRole("button", { name: "Path" }).click();
  await expect(page.locator("#app")).toBeHidden();
  await expect(page.locator(".ppage .ptitle")).toHaveText("Settings");
  expect(await page.evaluate(() => localStorage.getItem("rd-design"))).toBe("path");
});

test("a skip asks first once something is written, and Keep going returns to it", async ({ page }, testInfo) => {
  await start(page);
  await choices(page).first().click();
  await page.locator("#cin").fill("a thing");
  if (isPhone(testInfo)) await page.locator("#cin").blur();
  await page.locator(".foot .sides .skd").focus();
  await page.keyboard.press("Enter");
  const ask = page.getByRole("alertdialog");
  await expect(ask).toBeVisible();
  await expect(ask.getByRole("button", { name: "Keep going" })).toBeFocused();
  await ask.getByRole("button", { name: "Keep going" }).click();
  await expect(ask).toHaveCount(0);
  await expect(page.locator("#cin")).toHaveValue("a thing");
});

// the tutor, as in tutor.spec.js: the app's server stands in with routes, and needs the Magic Key (tests/support/test.js)
const withKey = withCourse ? test : test.skip;
const sse = (...events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const ANSWER = sse({ type: "delta", text: "Stand-in tutor: " }, { type: "delta", text: "this is the stand-in answer." }, { type: "done", truncated: false });
async function tutorServer(page) {
  const asked = [];
  await page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, tutor: "on" }) }));
  await page.route("**/api/tutor", (route) => { asked.push(route.request().postDataJSON()); return route.fulfill({ status: 200, contentType: "text/event-stream", body: ANSWER }); });
  return asked;
}

withKey("Why asks the tutor on the result, and its button in the top bar opens the conversation", async ({ page }) => {
  const asked = await tutorServer(page);
  await start(page);
  await answer(page);
  await page.locator("#stn").click();
  const why = page.locator(".wrow").filter({ hasText: "Why" });
  await expect(why).toContainText(/check the open example|ask the tutor/);
  await why.click();
  await expect(page.locator(".wtext")).toContainText("this is the stand-in answer.");
  expect(asked).toHaveLength(1);
  await page.getByRole("button", { name: /^The tutor/ }).click();
  await expect(page.locator(".ptb-t")).toContainText("The tutor");
  await expect(page.locator("#path .ptalk")).toContainText("this is the stand-in answer.");
  await expect(page.locator("#ask-in")).toBeVisible();
  await page.getByRole("button", { name: /^Back to the result/ }).click();
  await expect(page.locator(".pvline")).toBeVisible();
});

test("the pair's two terms stand out in the text as the look says, and the A/B markers option turns them off", async ({ page }) => {
  await start(page);
  await choices(page).nth(3).click();
  await expect(page.locator("#cin")).toBeVisible();
  const root = page.locator("#path .pa"), a = page.locator("#path .sj.a").first(), b = page.locator("#path .sj.b").first();
  await expect(root).toHaveClass(/\bsj-letters\b/);   // the default: italic, with a small A raised before the first term and a small B lowered before the second
  await expect(a).toBeVisible();
  await expect(b).toBeVisible();
  const mark = (n) => n.evaluate((e) => { const s = getComputedStyle(e), c = getComputedStyle(e, "::before"); return { italic: s.fontStyle, label: c.content, up: c.verticalAlign }; });
  expect(await mark(a)).toMatchObject({ italic: "italic", label: '"A"' });
  expect(await mark(b)).toMatchObject({ italic: "italic", label: '"B"' });
  expect((await mark(a)).up).not.toBe((await mark(b)).up);
  // Settings has a row to try the other ways on a sample
  await page.locator("#cin").blur();   // on a phone the field's keyboard hides the top bar
  await page.locator(".tstn").click();
  await page.locator(".road .rfoot").getByRole("button", { name: "Settings" }).click();
  const row = page.locator(".srow", { hasText: "A and B in the text" });
  await expect(row.locator(".sj")).toHaveCount(2);
  await row.getByRole("button", { name: "Inks" }).click();
  await expect(root).toHaveClass(/\bsj-inks\b/);
  const ink = (n) => n.evaluate((e) => getComputedStyle(e).color);
  expect(await ink(row.locator(".sj.a"))).not.toBe(await ink(row.locator(".sj.b")));
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("rd-look")).subj)).toBe("inks");
  await row.getByRole("button", { name: "Letters" }).click();
  await expect(root).toHaveClass(/\bsj-letters\b/);
  expect(await page.evaluate(() => (JSON.parse(localStorage.getItem("rd-look") || "{}")).subj)).toBeUndefined();   // the default is not stored
});

test("the practice options' A/B markers switch turns the marks of the terms off", async ({ page }) => {
  await start(page);
  await choices(page).nth(3).click();
  await expect(page.locator("#cin")).toBeVisible();
  const root = page.locator("#path .pa"), a = page.locator("#path .sj.a").first();
  await expect(root).not.toHaveClass(/\bsj-off\b/);
  await page.locator("#cin").blur();
  await page.getByRole("button", { name: "Practice options" }).click();
  await page.getByRole("dialog", { name: "Practice options" }).getByRole("switch", { name: /A\/B markers/ }).click();
  await expect(root).toHaveClass(/\bsj-off\b/);
  expect(await a.evaluate((e) => getComputedStyle(e).fontStyle)).toBe("normal");   // plain, as the words around it
  expect(await a.evaluate((e) => getComputedStyle(e, "::before").content)).not.toBe('"A"');
});

test("the result's Terms section is drawn on the path: A and B in the margin, no squares, and a term opens its definition under it", async ({ page }) => {
  await start(page);
  await answer(page);
  await page.locator("#stn").click();
  await page.locator(".wterms").click();
  const rows = page.locator("#path .tmrow");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0).locator(".ab")).toHaveText("A");
  await expect(rows.nth(1).locator(".ab")).toHaveText("B");
  await expect(page.locator("#path .pbr")).toHaveCount(0);   // nothing of it is hosted from the classic page
  await expect(page.locator("#path .L")).toHaveCount(0);   // the classic page's red and blue squares
  const term = page.locator("#path .tmrow .dterm").first();
  if (await term.count()) {
    await term.click();
    const card = page.locator("#path .pdef");
    await expect(card).toHaveCount(1);
    await expect(card.locator(".pdh")).not.toBeEmpty();
    await term.click();
    await expect(card).toHaveCount(0);
  }
});

test("the text fields of the practice ask the browser for no autofill", async ({ page }) => {
  await start(page);
  await choices(page).first().click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  const hints = (loc) => loc.evaluate((e) => ({ ac: e.getAttribute("autocomplete"), cap: e.getAttribute("autocapitalize"), fix: e.getAttribute("autocorrect"), pw: e.dataset.lpignore, one: e.dataset["1pIgnore"] }));
  expect(await hints(field)).toEqual({ ac: "off", cap: "off", fix: "off", pw: "true", one: "true" });
  await field.blur();
  await page.locator(".tstn").click();
  await page.locator(".road .rfoot").getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Paste from the lab" }).click();
  expect(await hints(page.locator("textarea.ptext"))).toEqual({ ac: "off", cap: "off", fix: "off", pw: "true", one: "true" });
});
