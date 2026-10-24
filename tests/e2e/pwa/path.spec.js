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
/** Picks a relation and writes an example for each case it asks for, with Enter after each but the last (Enter there takes the Check at once): the Check is ready. */
async function answer(page) {
  await choices(page).first().click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (let i = 0; i < 4 && (await field.isVisible()); i++) {
    await field.fill("thing " + (i + 1));
    if ((await field.getAttribute("enterkeyhint")) === "done") { await field.blur(); break; }
    await field.press("Enter");
  }
  await expect(page.locator("#stn")).toHaveAccessibleName(/^Check/);
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

test("only the neither case can say that nothing exists, and a written one opens again with a tap", async ({ page }) => {
  await start(page);
  await choices(page).nth(3).click();   // Four possibilities: all four cases
  const none = page.getByRole("button", { name: "nothing exists", exact: true });   // not the written row, whose name says "neither: nothing exists. Change it"
  for (const text of ["a red pot", "a red book", "a green book"]) {
    await expect(none).toHaveCount(0);   // the cases the relation asks for need an example: the relation was chosen, and they justify it
    await page.locator("#cin").press("Enter");   // empty: it does not go on
    await expect(page.locator("#cin")).toBeVisible();
    await expect(page.locator(".sb.done")).toHaveCount(text === "a red pot" ? 0 : text === "a red book" ? 1 : 2);
    await page.locator("#cin").fill(text);
    await page.locator("#cin").press("Enter");
  }
  await expect(none).toBeVisible();   // neither: it may well be empty
  await page.locator(".sbb").first().click();
  await expect(page.locator("#cin")).toHaveValue("a red pot");
  await expect(none).toHaveCount(0);
  await page.locator("#cin").press("Enter");   // on to the one still empty
  await none.click();   // the last case answered: the Check is taken at once
  await expect(page.locator(".pvline")).toBeVisible();
  await expect(page.locator(".ans2.nil")).toHaveText("nothing exists");
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

test("a touch outside the unfolded strip folds it again", async ({ page }) => {
  await start(page);
  await choices(page).nth(3).click();
  await page.locator("#cin").blur();
  const strip = page.locator("#path .pstrip");
  await strip.evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
  await strip.locator(".knob").click();
  await expect(strip).toHaveClass(/\bopen\b/);
  const sc = await page.locator("#path .pscroll").boundingBox();
  await page.mouse.click(sc.x + sc.width / 2, sc.y + sc.height - 30);   // out on the path below
  await expect(strip).not.toHaveClass(/\bopen\b/);
  await strip.locator(".knob").click();
  await expect(strip).toHaveClass(/\bopen\b/);   // and the knob still opens it
});

test("with the keyboard up there is no bar above it: Enter goes on, the Check comes up on the page once the last example has words, and Enter there takes it", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "pwa-phone", "a touch screen's keyboard");
  await start(page);
  await choices(page).nth(3).click();
  await page.locator("#cin").focus();
  await expect(page.locator(".pa")).toHaveClass(/\bkbup\b/);
  await expect(page.locator("#path .foot")).toHaveCount(0);   // no next step above the keyboard, no key to put it away
  await expect(page.locator(".khead")).toBeVisible();
  await page.locator("#cin").press("Enter");   // empty: it does not go on
  await expect(page.locator("#path .ptoast.on")).toHaveText(/Write an example first/);
  for (const t of ["a red pot", "a red book", "a green book"]) {
    await page.locator("#cin").fill(t);
    await page.locator("#cin").press("Enter");
  }
  const node = page.locator("#path .pscroll .cnode #stn");
  await expect(node).toHaveCount(0);   // the last case is still empty
  await page.locator("#cin").fill("a");
  await expect(node).toHaveAccessibleName(/^Check: your relation and 4 examples/);   // a word in the last field: the Check is the next stop, on the page
  await expect(page.locator(".pa")).toHaveClass(/\bready\b/);
  await expect(page.locator("#cin")).toBeFocused();
  await page.locator("#cin").fill("");
  await expect(node).toHaveCount(0);   // emptied again: it goes
  await page.locator("#cin").fill("a stone");
  await expect(node).toBeVisible();
  await page.locator("#cin").press("Enter");   // the last one: the keyboard goes and the Check is taken
  await expect(page.locator(".pvline")).toBeVisible();
  await expect(page.locator(".pa")).not.toHaveClass(/\bkbup\b/);
  await expect(page.locator("#path .foot #stn")).toHaveAccessibleName(/Next pair/);
});

test("with the keyboard up a tap on the Check under the last example takes it, and the field keeps the focus until then", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "pwa-phone", "a touch screen's keyboard");
  await start(page);
  await choices(page).first().click();   // Mutually inclusive: two cases
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (let i = 0; i < 4 && (await field.isVisible()); i++) { await field.fill("thing " + (i + 1)); if ((await field.getAttribute("enterkeyhint")) === "done") break; await field.press("Enter"); }
  await field.focus();
  const node = page.locator("#path .pscroll .cnode #stn");
  await expect(node).toBeVisible();
  const box = await node.boundingBox(), sc = await page.locator("#path .pscroll").boundingBox();
  expect(box.y + box.height, "the Check is in view above the keyboard").toBeLessThanOrEqual(sc.y + sc.height + 1);
  await node.tap();
  await expect(page.locator(".pvline")).toBeVisible();
  await expect(page.locator("#cin")).toHaveCount(0);
});

test("where there is no keyboard to put away, Enter on the last example takes the Check from the foot", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "pwa-phone", "a keyboard of keys");
  await start(page);
  await choices(page).first().click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (let i = 0; i < 4 && (await field.isVisible()); i++) { await field.fill("thing " + (i + 1)); if ((await field.getAttribute("enterkeyhint")) === "done") break; await field.press("Enter"); }
  await expect(page.locator("#path .cnode")).toHaveCount(0);
  await expect(page.locator("#path .foot #stn")).toHaveAccessibleName(/^Check/);
  await field.press("Enter");
  await expect(page.locator(".pvline")).toBeVisible();
  await expect(page.locator("#path .foot #stn")).toHaveAccessibleName(/Next pair/);
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
  const [hb, fb] = await page.evaluate(() => [getComputedStyle(document.querySelector("#stnp .phint")).backgroundColor, getComputedStyle(document.querySelector("#path .foot")).backgroundColor]);
  expect(hb, "the note is on the page's own ground, not a block of its own").toBe(fb);
  await page.mouse.up();
});

/** The thread is attached to the station when it is up: nothing of it below the diamond (the foot's stub is gone, or ends inside it), and what hides it above the foot ends inside the diamond's top. */
async function expectThreadAttached(page) {
  const g = await page.evaluate(() => {
    const go = document.querySelector("#stn .go, #stnp .go").getBoundingClientRect(), foot = document.querySelector("#path .foot").getBoundingClientRect();
    const rs = document.querySelector("#path .riser").getBoundingClientRect(), stub = parseFloat(getComputedStyle(document.querySelector("#path .foot"), "::before").height);
    return { goTop: go.top, goBottom: go.bottom, footTop: foot.top, stubEnd: foot.top + (stub || 0), hideTop: rs.height > 0 ? rs.top : foot.top };
  });
  const threadEnd = g.hideTop < g.footTop ? g.hideTop : g.stubEnd;
  expect(threadEnd, "the thread ends inside the diamond").toBeGreaterThan(g.goTop);
  expect(threadEnd, "and nothing of it runs on below").toBeLessThan(g.goBottom - 10);
}

test("the station pulled up keeps the thread: it shortens and ends at the diamond, never running under or below the station", async ({ page }) => {
  await start(page);
  await answer(page);
  const stn = page.locator("#stn");
  await expect(stn).toBeVisible();
  const b = await stn.boundingBox();
  await page.mouse.move(b.x + 20, b.y + b.height / 2); await page.mouse.down();
  for (const d of [12, 30, 50, 70, 100]) {
    await page.mouse.move(b.x + 20, b.y + b.height / 2 - d, { steps: 3 });
    await expectThreadAttached(page);
  }
  await page.mouse.up();
});

test("scrolling past the end only tightens the thread; the station is taken by its own pull or a tap, and no line marks the reach", async ({ page }) => {
  await start(page);
  await answer(page);
  const stn = page.locator("#stn");
  await expect(stn).toBeVisible();
  await expect(page.locator(".bumpl")).toHaveCount(0);
  const sc = await page.locator("#path .pscroll").boundingBox();
  await page.mouse.move(sc.x + sc.width / 2, sc.y + sc.height / 2);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 300);   // far more than the reach
  await expect(page.locator(".pa")).toHaveClass(/\bpulling\b/);
  const rise = await stn.evaluate((e) => -new DOMMatrix(getComputedStyle(e).transform).m42);
  expect(rise, "the station comes up a little").toBeGreaterThan(10);
  expect(rise, "resisting, and not as far as its reach").toBeLessThan(40);
  expect(await page.locator("#path .pscroll").evaluate((e) => getComputedStyle(e).transform), "the path itself stays").toBe("none");
  await expectThreadAttached(page);
  await expect(page.locator(".pa")).not.toHaveClass(/\bpulling\b/);   // let go: it goes back
  await expect(stn).toBeVisible();
  await expect(page.locator(".pvline")).toHaveCount(0);   // nothing was checked
  // the station itself, pulled past its reach, is taken
  const b = await stn.boundingBox();
  await page.mouse.move(b.x + 20, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + 20, b.y + b.height / 2 - 40, { steps: 4 });
  await page.mouse.move(b.x + 20, b.y + b.height / 2 - 110, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator(".pvline")).toBeVisible();
});

test("before a relation is chosen, pulling the path on fills the dotted thread in down to the gray station, which stops below the foot's edge", async ({ page }) => {
  await start(page);
  const sc = await page.locator("#path .pscroll").boundingBox();
  await page.mouse.move(sc.x + sc.width / 2, sc.y + sc.height / 2);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 300);
  await expect(page.locator(".pa")).toHaveClass(/\bpullpre\b/);
  const tail = await page.locator("#path .sx.ptail").evaluate((e) => { const c = getComputedStyle(e, "::after"); return { bg: c.backgroundImage, op: +c.opacity }; });
  expect(tail.bg, "dotted, not firmed").toContain("repeating-linear-gradient");
  expect(tail.op).toBeGreaterThan(0.5);
  expect(await page.locator("#path .foot").evaluate((e) => getComputedStyle(e, "::after").content), "no solid stub in the foot").toBe("none");
  const [go, foot] = [await page.locator("#stnp .go").boundingBox(), await page.locator("#path .foot").boundingBox()];
  expect(go.y, "the diamond stays under the foot's top edge").toBeGreaterThan(foot.y + 1);
  await expect(page.locator(".pa")).not.toHaveClass(/\bpull/);   // let go: it goes back
});

test("the thread runs on through what voice shows above the foot (Hear the question), at rest and pulled", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("rd-voice", "1"); localStorage.setItem("rd-voice-read", "1"); });
  await start(page);
  const bar = page.locator("#path .pvoice");
  test.skip(!(await bar.locator("#vbar").count()) || (await bar.boundingBox()).height < 10, "no voice bar in this browser");
  const line = (pseudo) => bar.evaluate((e, p) => { const c = getComputedStyle(e, p); return { content: c.content, bg: c.backgroundImage + c.backgroundColor, w: c.width }; }, pseudo);
  // pulled: the thread (dotted, as nothing is chosen) goes through the bar down to the station
  const sc = await page.locator("#path .pscroll").boundingBox();
  await page.mouse.move(sc.x + sc.width / 2, sc.y + sc.height / 2);
  for (let i = 0; i < 6; i++) await page.mouse.wheel(0, 300);
  await expect(page.locator(".pa")).toHaveClass(/\bpullpre\b/);
  const pulled = await line("::after");
  expect(pulled.content, "the pull's thread crosses the bar").not.toBe("none");
  expect(pulled.bg).toContain("repeating-linear-gradient");
  await expect(page.locator(".pa")).not.toHaveClass(/\bpull/);
  // ready to check: the gold thread runs through it, as it runs into the foot
  await answer(page);
  const ready = await line("::before");
  expect(ready.content).not.toBe("none");
  expect(ready.bg, "gold, as the foot's stub").toContain(await page.locator("#path .foot").evaluate((e) => getComputedStyle(e, "::before").backgroundColor));
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

test("the pair has its relation under it: the name beside the terms, the course's notation in the margin under A and B, set as they are", async ({ page }) => {
  await start(page);
  await choices(page).nth(3).click();
  await page.locator("#cin").blur();
  await page.locator("#path .pstrip").evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
  const rel = page.locator("#path .pstrip .compact .pnn"), code = page.locator("#path .pstrip .compact .pnc"), mark = page.locator("#path .pstrip .compact .pnm.b");
  await expect(code).toHaveText("4P");
  await expect(rel.locator(".rn")).toHaveText("Four possibilities");
  await expect(rel.locator(".rc")).toHaveCount(0);
  const t = await page.locator("#path .pstrip .compact .pnl.b").boundingBox(), r = await rel.boundingBox(), c = await code.boundingBox(), m = await mark.boundingBox();
  expect(r.y, "the name is under the second term").toBeGreaterThanOrEqual(t.y + t.height - 2);
  expect(r.x, "in the column of the terms").toBeLessThanOrEqual(t.x + 2);
  expect(c.x + c.width, "the code is in the margin, left of the text").toBeLessThanOrEqual(t.x);
  expect(c.y, "under the B mark").toBeGreaterThanOrEqual(m.y + m.height - 2);
  expect(Math.abs(c.x + c.width - (m.x + m.width)), "its right edge is the marks'").toBeLessThan(2);
  expect(Math.abs((c.y + c.height / 2) - (r.y + r.height / 2)), "on the line of the name").toBeLessThan(8);
  const font = (l) => l.evaluate((e) => { const s = getComputedStyle(e); return [s.fontFamily, s.fontSize, s.fontWeight, s.fontStyle, s.color].join("|"); });
  expect(await font(code), "in the margin's font").toBe(await font(mark));
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
  await page.locator("#path .pstrip .pskip").focus();
  await page.keyboard.press("Enter");
  const ask = page.getByRole("alertdialog");
  await expect(ask).toBeVisible();
  await expect(ask.getByRole("button", { name: "Keep going" })).toBeFocused();
  await expect(ask).toContainText("Your inputs will be lost.");
  await ask.getByRole("button", { name: "Keep going" }).click();
  await expect(ask).toHaveCount(0);
  await expect(page.locator("#cin")).toHaveValue("a thing");
});

test("Skip is an icon under the favorites mark: with nothing written the page turns at once; with something written it asks, and only Skip anyway turns it, with no note to undo", async ({ page }, testInfo) => {
  await start(page);
  await expect(page.locator("#path .foot .sides"), "no Skip station at the foot").toHaveCount(0);
  const skip = page.locator("#path .pairst .pskip");
  await expect(skip).toHaveAccessibleName("Skip this pair");
  // under the favorites mark, at the edge
  const [sb, fb] = [await skip.boundingBox(), await page.locator("#path .pairst .pstar").boundingBox()];
  expect(sb.y, "below the mark").toBeGreaterThan(fb.y + fb.height - 4);
  expect(Math.abs(sb.x + sb.width - (fb.x + fb.width)), "along the same edge").toBeLessThanOrEqual(2);
  const before = await page.locator("#path .sx.first").first().innerText();
  await skip.click();
  await expect(page.getByRole("alertdialog"), "nothing written: no question").toHaveCount(0);
  await expect.poll(() => page.locator("#path .sx.first").first().innerText(), "a new pair").not.toBe(before);
  await expect(choices(page)).toHaveCount(5);
  await page.waitForTimeout(500);
  // something written: it asks first, and the page stays under the question
  await choices(page).first().click();
  await page.locator("#cin").fill("a thing");
  if (isPhone(testInfo)) await page.locator("#cin").blur();
  const main = page.locator("#path .main");
  await page.evaluate(() => { window.__turned = []; new MutationObserver(() => { window.__turned.push(document.querySelector("#path .main").className); }).observe(document.querySelector("#path .main"), { attributes: true, attributeFilter: ["class"] }); });
  await page.locator("#path .pstrip .pskip").click();
  const ask = page.getByRole("alertdialog");
  await expect(ask).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => window.__turned.filter((c) => /turning|arriving/.test(c)).length), "the page did not turn aside under the question").toBe(0);
  await expect(page.locator("#cin")).toHaveValue("a thing");
  await ask.getByRole("button", { name: "Skip anyway" }).click();
  await expect(choices(page)).toHaveCount(5);   // the next pair, from its relation
  await expect(page.locator("#cin")).toHaveCount(0);
  expect(await page.evaluate(() => window.__turned.some((c) => /turning/.test(c))), "it turned aside after the answer").toBe(true);
  await expect(page.locator("#path .ptoast.on")).toHaveCount(0);
  await expect(main).not.toHaveClass(/turning/);
});

test("a result has no Skip: there is nothing left to skip", async ({ page }) => {
  await start(page);
  await answer(page);
  await page.locator("#stn").click();
  await expect(page.locator(".pvline")).toBeVisible();
  await expect(page.locator("#path .pskip")).toHaveCount(0);
});

test("a case ahead is taken up with a tap, in any order: the field keeps the focus, and Next goes to the next case still empty", async ({ page }) => {
  await start(page);
  await choices(page).nth(3).click();   // Four possibilities: four cases
  const field = page.locator("#cin"), label = () => field.getAttribute("aria-label");
  await expect(field).toBeVisible();
  const first = await label();
  await field.fill("one");
  await field.press("Enter");
  const second = await label();
  expect(second).not.toBe(first);
  const ahead = page.locator("#path .sbb.later");
  await expect(ahead).toHaveCount(2);
  await ahead.nth(1).click();   // the last case, written first
  await expect(field).toBeFocused();
  const fourth = await label();
  expect(fourth).not.toBe(second);
  await field.fill("four");
  await field.press("Enter");
  expect(await label(), "the one skipped, not on to Check").toBe(second);
  await field.fill("two");
  await field.press("Enter");
  const third = await label();
  expect([first, second, fourth]).not.toContain(third);
  await field.press("Enter");   // empty: stays
  expect(await label()).toBe(third);
  await field.fill("three");
  await expect(page.locator("#stn")).toHaveAccessibleName(/^Check/);   // the last one has words: Check is next (Enter would take it)
});

test("the fields ask for no autofill bar: a search field on a touch screen (Chrome keeps its bar off those), a text field elsewhere", async ({ page }, testInfo) => {
  await start(page);
  await choices(page).first().click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  await expect(field).toHaveAttribute("type", isPhone(testInfo) ? "search" : "text");
  await expect(field).toHaveAttribute("role", "textbox");
  await expect(field).toHaveAttribute("autocomplete", "off");
  await field.fill("a thing");
  await expect(field).toHaveValue("a thing");
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
  await expect(note).not.toContainText("the tutor");   // no label: the rule says whose note it is, and a label on every case read as if the steps were about the tutor
  await expect(note).toHaveAccessibleName("The tutor’s note");
  const [box, flag, step] = await Promise.all([note.boundingBox(), note.locator(".pflg").boundingBox(), note.locator(".tsteps li").first().boundingBox()]);
  expect(flag.y - box.y, "the flag is at the top of the block").toBeLessThan(14);
  expect(box.x + box.width - (flag.x + flag.width), "and at its right").toBeLessThan(12);
  expect(Math.abs(step.y - box.y), "with no row of its own above the first step").toBeLessThan(6);
  await expect(note.locator(".tsteps li").first()).toContainText("It follows it is");
  await expect(note).not.toContainText("Take ");   // the "take" line repeated the answer above it
});

withKey("with the tutor on its own, Why is open on the result; the station's arrow hops once the examples are in", async ({ page }) => {
  await factsServer(page);
  await page.addInitScript(() => localStorage.setItem("rd-autoexplain", "1"));
  await start(page);
  await choices(page).first().click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (let i = 0; i < 4 && (await field.isVisible()); i++) {
    await field.fill("thing " + (i + 1));
    if ((await field.getAttribute("enterkeyhint")) === "done") { await field.blur(); break; }
    await field.press("Enter");
  }
  await expect(page.locator(".pa.ready #stn")).toBeVisible();
  await expect(page.locator(".pup")).toHaveCount(0);   // no arrow and words on the thread: the station's own arrow hops
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector("#stn .go .mk .i")).animationName)).toBe("p-hop");
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
  const rows = choices(page);
  await rows.nth(0).focus();   // what the focus is on when a script hands it over
  const ring = () => page.evaluate(() => { const e = document.activeElement; return e ? getComputedStyle(e).outlineStyle : "none"; });
  expect(await ring()).toBe("none");
  await page.keyboard.press("Tab");
  await expect(page.locator("html")).toHaveClass(/\bpa-tab\b/);
  await rows.nth(1).focus();
  expect(await ring()).toBe("solid");
  await page.mouse.click(300, 600);
  await expect(page.locator("html")).not.toHaveClass(/\bpa-tab\b/);
});

test("on a touch screen the soft keyboard's Next key (a Tab in the field) leaves no ring on the station that comes next", async ({ page }, testInfo) => {
  await start(page);
  await choices(page).first().click();
  await expect(page.locator("#cin")).toBeVisible();
  await page.locator("#cin").focus();
  await page.keyboard.press("Tab");
  // a keyboard on a desktop is walking the page; a touch screen's Tab in a field is the Next key
  if (isPhone(testInfo)) await expect(page.locator("html")).not.toHaveClass(/\bpa-tab\b/);
  else await expect(page.locator("html")).toHaveClass(/\bpa-tab\b/);
});

test("the station the app focuses after a check has no ring, whatever key was pressed before; the Tab key brings the ring to what it comes to", async ({ page }) => {
  await start(page);
  await answer(page);
  await page.locator("#stn").click();
  await expect(page.locator(".pvline")).toBeVisible();
  const stn = page.locator("#stn");
  await expect(stn).toBeFocused();
  // the ring is an outline on the Path, and a box-shadow from the classic page's rule for every button (styles/10-shell.css): neither is drawn
  const ring = () => stn.evaluate((e) => { const c = getComputedStyle(e); return c.outlineStyle + " / " + (c.boxShadow === "none" || /^rgba\(0, 0, 0, 0\) 0px 0px 0px 0px$/.test(c.boxShadow) ? "none" : c.boxShadow); });
  expect(await ring(), "no ring on the station the page handed the focus to").toBe("none / none");
  await page.evaluate(() => document.documentElement.classList.add("pa-tab"));   // a Tab was pressed some time before (or a late one from the keyboard)
  expect(await ring(), "nor once a Tab was pressed before").toBe("none / none");
  await expect(stn).toHaveAttribute("data-quiet", "1");
  await stn.evaluate((e) => e.blur());
  await expect(stn).not.toHaveAttribute("data-quiet", "1");
  await page.keyboard.press("Tab");
  await expect(page.locator("html")).toHaveClass(/\bpa-tab\b/);
  await page.locator(".tstn").focus();
  expect(await page.locator(".tstn").evaluate((e) => getComputedStyle(e).outlineStyle), "where the keyboard comes, the ring is there").toBe("solid");
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
  // no box of paper under the edge: beside the chevron, just below the line, the page shows as it does elsewhere under the sheet
  const px = (x, y) => page.screenshot({ clip: { x, y, width: 6, height: 2 } });
  expect((await px(k.x + 2, edge + 3)).equals(await px(k.x - 80, edge + 3)), "the knob has no box below the sheet's edge").toBe(true);
});

test("the practice options leave part of the screen to tap out on, and scroll inside; the Tutor has a page of its own", async ({ page }) => {
  test.skip(!withCourse, "the tutor needs the Magic Key");
  await factsServer(page);
  await start(page);
  await page.getByRole("button", { name: "Practice options" }).click();
  const sheet = page.getByRole("dialog", { name: "Practice options" });
  await page.waitForTimeout(500);
  const [sb, vp] = [await page.locator("#path .psheet.on").boundingBox(), page.viewportSize()];
  expect(sb.y + sb.height, "the sheet stops short of the bottom of the screen").toBeLessThanOrEqual(vp.height * 0.8);
  await expect(sheet.getByRole("button", { name: "Tutor: more" })).toBeVisible();
  await expect(sheet).not.toContainText("Right after you check an answer");   // what needs more words is on the page
  await sheet.getByRole("button", { name: "Tutor: more" }).click();
  await expect(sheet.getByRole("switch", { name: /Check every answer with AI/ })).toBeVisible();
  await expect(sheet).toContainText("Right after you check an answer");
  await sheet.getByRole("button", { name: "back to the options" }).click();
  await page.mouse.click(vp.width / 2, vp.height - 20);   // out on what is under the sheet
  await expect(page.locator("#path .psheet.on")).toHaveCount(0);
});

test("the whole Skip station takes the slide, not the diamond alone: from its word, from beside the diamond, and with the mouse", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rd-look", JSON.stringify({ skipAt: "foot" })));   // the side station, on hold behind the look
  await start(page);
  await expect(page.locator("#path .pskip"), "no icon with the station").toHaveCount(0);
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
    await expect.poll(() => page.locator("#path .sx.first").first().innerText(), "a new pair").not.toBe(before);
    await expect(choices(page)).toHaveCount(5);
    await expect(page.locator("#path .ptoast.on"), "no note with an Undo: the pair waits in Review").toHaveCount(0);
    await page.waitForTimeout(500);   // the next page has arrived, so that the next slide is seen on its own
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
