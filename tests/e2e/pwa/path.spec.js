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

test("the top bar's title has no chevron beside it", async ({ page }) => {
  await start(page);
  await expect(page.locator("#path .ptb-t")).toContainText("Relations");
  await expect(page.locator("#path .ptb-t svg")).toHaveCount(0);
});

test("why the next station is not ready shows in a note above the foot, not under the finger that is on it", async ({ page }) => {
  await start(page);
  const stn = page.locator("#stnp"), hint = page.locator("#stnp .phint");
  await expect(stn.locator("small")).toHaveCount(0);   // no hint in the station's own label
  await expect(hint).toHaveCSS("opacity", "0");
  const b = await stn.boundingBox();
  await page.mouse.move(b.x + 40, b.y + b.height / 2); await page.mouse.down();
  await expect(hint).toHaveCSS("opacity", "1");
  await expect(hint).toHaveText("pick a relation first");
  const h = await hint.boundingBox(), foot = await page.locator("#path .foot").boundingBox();
  expect(h.y + h.height, "the note ends above the foot's top edge").toBeLessThanOrEqual(foot.y);
  expect(h.y + h.height, "and above the station under the finger").toBeLessThanOrEqual(b.y);
  await page.mouse.up();
});

test("the strip pulls from its heading with a short pull, and its hint is gray", async ({ page }) => {
  await start(page);
  await choices(page).nth(3).click();
  await page.locator("#cin").blur();
  const strip = page.locator("#path .pstrip"), name = strip.locator(".pnl.a b");
  await strip.evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));   // the strip slides in; the pull is aimed at it once it rests
  const color = (sel) => page.locator(sel).first().evaluate((e) => getComputedStyle(e).color);
  expect(await color("#path .pstrip .gtip"), "the hint is not the blue of what can be tapped").not.toBe(await color("#path .pstrip .knob .mk"));
  const b = await name.boundingBox();
  await page.mouse.move(b.x + 10, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + 10, b.y + b.height / 2 + 12, { steps: 3 });
  await page.mouse.move(b.x + 10, b.y + b.height / 2 + 22, { steps: 3 });
  await page.mouse.up();
  await expect(strip).toHaveClass(/\bopen\b/);   // pulled by the pair, not by the knob
});

test("the pair has its relation under it, in the course's notation with its name spelled out", async ({ page }) => {
  await start(page);
  await choices(page).nth(3).click();
  await page.locator("#cin").blur();
  await page.locator("#path .pstrip").evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
  const rel = page.locator("#path .pstrip .compact .pnn");
  await expect(rel.locator(".rc")).toHaveText("4P");
  await expect(rel.locator(".rn")).toHaveText("Four possibilities");
  const t = await page.locator("#path .pstrip .compact .pnl.b").boundingBox(), r = await rel.boundingBox();
  expect(r.y, "under the second term").toBeGreaterThanOrEqual(t.y + t.height - 2);
  expect(r.x, "in the column of the terms").toBeLessThanOrEqual(t.x + 2);
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

const FACTS = [
  "Both: a scent of parfume | class: smell | A yes: it is perceived by the nose | B yes: it is a form | => yes",
  "Neither: a rabbit horn | A no: it does not exist | B no: it is not a sound, because it makes none",
  "Relation: they overlap."
].join("\n");
async function factsServer(page) {
  await page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, tutor: "on" }) }));
  await page.route("**/api/tutor", (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body: sse({ type: "delta", text: FACTS }, { type: "done", truncated: false }) }));
}

withKey("the tutor's note under an example is a list of steps in the tutor's block, with no button of its own beside the examples", async ({ page }) => {
  await factsServer(page);
  await start(page);
  await answer(page);
  await page.locator("#stn").click();
  await expect(page.locator(".pvline")).toBeVisible();
  await expect(page.locator(".exr .tside")).toHaveCount(0);   // the examples have no "Check and explain" thread: Why is the one tutor row
  await page.locator(".wrow").filter({ hasText: "Why" }).click();
  const note = page.locator(".exr .tnote").first();
  await expect(note).toBeVisible();
  await expect(note.locator(".tutn")).toHaveText("the tutor");
  const [label, flag] = await Promise.all([note.locator(".tutn").boundingBox(), note.locator(".pflg").boundingBox()]);
  expect(Math.abs((flag.y + flag.height / 2) - (label.y + label.height / 2)), "the flag is on the label's line").toBeLessThan(8);
  expect(flag.x, "at the right of the block").toBeGreaterThan(label.x + 100);
  await expect(note.locator(".tsteps li").first()).toContainText("It follows it is");
  await expect(note).not.toContainText("Take ");   // the "take" line repeated the answer above it
});

withKey("with the tutor on its own, Why is open on the result; the pull-up hint is at the foot once the examples are in", async ({ page }) => {
  await factsServer(page);
  await page.addInitScript(() => localStorage.setItem("rd-autoexplain", "1"));
  await start(page);
  await choices(page).first().click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (let i = 0; i < 4 && (await field.isVisible()); i++) {
    await field.fill("thing " + (i + 1));
    await field.press("Enter");
  }
  await expect(field).toHaveCount(0);
  await expect(page.locator(".pa.ready .sx.ptail .pup")).toBeVisible();
  const [hint, foot] = await page.evaluate(() => [document.querySelector(".pup").getBoundingClientRect().bottom, document.querySelector(".pa .foot").getBoundingClientRect().top]);
  expect(hint).toBeLessThanOrEqual(foot + 1);
  await page.locator("#stn").click();
  await expect(page.locator(".wrow.open")).toBeVisible();
  await expect(page.locator(".exr .tnote").first()).toBeVisible();
});

withKey("Why asks the tutor on the result, and Ask a follow-up opens the conversation; the top bar has no tutor button", async ({ page }) => {
  const asked = await tutorServer(page);
  await start(page);
  await answer(page);
  await page.locator("#stn").click();
  const why = page.locator(".wrow").filter({ hasText: "Why" });
  await expect(why).toContainText(/check the open example|ask the tutor/);
  await why.click();
  await expect(page.locator(".wtext")).toContainText("this is the stand-in answer.");
  expect(asked).toHaveLength(1);
  await expect(page.locator("#path .ptb").getByRole("button", { name: /^The tutor/ })).toHaveCount(0);
  await page.getByRole("button", { name: "Ask a follow-up" }).click();
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
  await expect(root).toHaveClass(/\bsj-letters\b/);   // the default: italic, with a small A before the first term and a small B before the second, both on the line of the text
  await expect(a).toBeVisible();
  await expect(b).toBeVisible();
  const mark = (n) => n.evaluate((e) => { const s = getComputedStyle(e), c = getComputedStyle(e, "::before"); return { italic: s.fontStyle, label: c.content, up: c.verticalAlign, size: parseFloat(c.fontSize) / parseFloat(s.fontSize) }; });
  expect(await mark(a)).toMatchObject({ italic: "italic", label: '"A"', up: "baseline" });
  expect(await mark(b)).toMatchObject({ italic: "italic", label: '"B"', up: "baseline" });   // on the line: raised and lowered marks read as a misalignment in running text
  expect((await mark(a)).size).toBeGreaterThanOrEqual(0.7);
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
  await row.getByRole("button", { name: "Lettered diamonds" }).click();
  await expect(root).toHaveClass(/\bsj-lettered\b/);   // each term has its letter in a small diamond
  expect(await row.locator(".sj.a").evaluate((e) => { const c = getComputedStyle(e, "::before"); return [c.content, c.display, c.backgroundImage.includes("linear-gradient")]; })).toEqual(['"A"', "inline-flex", true]);
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

test("the result has no Terms section: the classes under the two terms are what it shows", async ({ page }) => {
  await start(page);
  await answer(page);
  await page.locator("#stn").click();
  await expect(page.locator(".pvline")).toBeVisible();
  await expect(page.locator(".wterms")).toHaveCount(0);
  await expect(page.locator("#path .tmrow")).toHaveCount(0);
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

test("the top bar's diamond has no line of its own, and the first section's line comes up out of nothing from its top", async ({ page }) => {
  await start(page);
  const r = await page.evaluate(() => {
    const sx = document.querySelector("#path .sx.first"), st = getComputedStyle(sx, "::before");
    return { stub: getComputedStyle(document.querySelector("#path .tstn"), "::after").content, top: st.top, mask: st.maskImage || st.webkitMaskImage };
  });
  expect(r.stub, "no stub going down from the top bar's diamond").toBe("none");
  expect(r.top, "it starts where the section does, with no gap above it").toBe("0px");
  expect(r.mask, "and fades in from there").toContain("linear-gradient");
});

test("a tap or an Enter in a field leaves no focus ring on what takes the focus; the Tab key brings the ring", async ({ page }) => {
  await start(page);
  await choices(page).first().click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  await page.locator("#path .pstrip .knob").focus();   // what the focus is on after a field hands it over
  const ring = () => page.evaluate(() => { const e = document.activeElement; return e ? getComputedStyle(e).outlineStyle : "none"; });
  expect(await ring()).toBe("none");
  await page.keyboard.press("Tab");
  await expect(page.locator("html")).toHaveClass(/\bpa-tab\b/);
  await page.locator("#path .pstrip .knob").focus();
  expect(await ring()).toBe("solid");
  await page.mouse.click(300, 400);
  await expect(page.locator("html")).not.toHaveClass(/\bpa-tab\b/);
});

const withDefs = withCourse ? test : test.skip;
withDefs("a definition opened from a class under a term comes under the whole pair and leaves the relation's figure where it was", async ({ page }) => {
  await start(page);
  await answer(page);
  await page.locator("#stn").click();
  await expect(page.locator(".pvline")).toBeVisible();
  const mark = page.locator("#path .pn.res .cls .dterm").first();
  await expect(mark).toBeVisible();
  const fig = page.locator("#path .pn.res svg.rfig.pnode"), termA = page.locator("#path .pn.res .pnl.a");
  const off = async () => (await fig.boundingBox()).y - (await termA.boundingBox()).y;   // against the first term: the page may scroll to the card
  await page.waitForTimeout(600);   // the result settles first
  const at = await off();
  await mark.click();
  const card = page.locator("#path .pn.res .pndef .pdef");
  await expect(card).toBeVisible();
  const [b, c] = await Promise.all([page.locator("#path .pn.res .pnl.b").boundingBox(), card.boundingBox()]);
  expect(Math.abs((await off()) - at), "the figure has not moved against the terms").toBeLessThan(1.5);
  expect(c.y, "the card is under the second term").toBeGreaterThan(b.y + b.height - 2);
});

test("the practice options' knob sits on the sheet's edge, splitting its line", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "Practice options" }).click();
  const knob = page.getByRole("button", { name: "Fold the practice options away" });
  await expect(knob).toBeVisible();
  await page.waitForTimeout(500);
  const [k, sheet] = await Promise.all([knob.boundingBox(), page.locator("#path .psheet.on").boundingBox()]);
  const edge = sheet.y + sheet.height;
  expect(k.y, "the knob starts above the edge").toBeLessThan(edge);
  expect(k.y + k.height, "and ends below it").toBeGreaterThan(edge);
});

test("the whole Skip station takes the slide, not the diamond alone: from its word, from beside the diamond, and with the mouse", async ({ page }) => {
  await start(page);
  const sides = page.locator(".foot .sides");
  await expect(sides).toBeVisible();
  const slide = async (at, d = 140) => {
    const b = await sides.boundingBox(), x = b.x + at.x, y = b.y + at.y;
    await page.mouse.move(x, y); await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(x - (d * i) / 8, y);
    await page.mouse.up();
  };
  // from the word (right of the diamond), then from just left of the diamond, then from the line's end
  for (const at of [{ x: 62, y: 14 }, { x: 4, y: 24 }, { x: 90, y: 24 }]) {
    const before = await page.locator(".pair .pa-a, #path .pairl, #path .sx.first").first().innerText();
    await slide(at);
    await expect(page.locator("#path .ptoast.on")).toContainText("Skipped");
    await expect(choices(page)).toHaveCount(5);
    await page.waitForTimeout(2200);   // the note leaves, so that the next slide is seen on its own
    expect(await page.locator("#path .sx.first").first().innerText(), "a new pair").not.toBe(before);
  }
});

test("the line's steps are smooth: a segment after a thicker one narrows into its own width, and the fade after the dotted choices is dotted", async ({ page }) => {
  await start(page);
  const line = (sel) => page.locator(sel).first().evaluate((e) => { const c = getComputedStyle(e, "::before"); return { w: c.width, clip: c.clipPath, bg: c.backgroundImage, mask: c.maskImage || c.webkitMaskImage }; });
  const tail = await line("#path .sx.gap + .sx.ptail");
  expect(tail.w, "the box is as wide as the thicker of the two segments").toBe("3px");
  expect(tail.clip, "it narrows to its own width").toContain("polygon");
  expect(tail.bg, "the fade goes on dotted").toContain("repeating-linear-gradient");
  expect(tail.mask, "and fades out").toContain("linear-gradient");
  const first = await line("#path .sx.first");
  expect(first.clip, "the first segment widens from the top bar's stub").toContain("polygon");
});

test("a picked relation's figure sits on the row's tint, with no box around it", async ({ page }) => {
  await start(page);
  const row = choices(page).nth(1);
  const fig = row.locator("svg.rfig");
  await row.evaluate((e) => e.classList.add("picked"));
  await page.waitForTimeout(300);   // the row's tint and the figure's backing both ease in
  const [backing, tint] = await Promise.all([
    fig.evaluate((e) => getComputedStyle(e).backgroundColor),
    page.evaluate(() => { const p = document.createElement("i"); p.style.backgroundColor = "var(--blue-tp)"; document.querySelector("#path .pa").appendChild(p); const c = getComputedStyle(p).backgroundColor; p.remove(); return c; }),
  ]);
  expect(backing).toBe(tint);
  expect(backing).not.toBe(await page.evaluate(() => { const p = document.createElement("i"); p.style.backgroundColor = "var(--paper)"; document.querySelector("#path .pa").appendChild(p); const c = getComputedStyle(p).backgroundColor; p.remove(); return c; }));
});
