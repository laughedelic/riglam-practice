// One step back on the Path (src/app/path/back.tsx, src/app/practice/trail.ts): the thread pulled down by the top node of the question brings back the result the learner has just left,
// and Next from there puts the question that was on screen back exactly as it was. The pull is the next station's, turned the other way: friction, a curb, one knock over it, no tap. In
// the examples the pair is folded into a heading above the page: a pull unfolds it, and the heading unfolded is pulled down again, coming down with the page, the station above it.
// Scrolling (a finger on the page, the wheel) does not go back: it only brings the station into view a little. A real touch drives the pull (the browser's own, through the
// DevTools protocol), as a phone's does.
import { test, expect } from "../../support/test.js";
import { answerFirst, exerciseAtRest, relOptions } from "../../support/page.js";
import { giveKey } from "../../support/data-key.js";

const onPath = () => {
  window.__riglamTest = (t) => { window.__t = t; };
  window.__vib = []; navigator.vibrate = (v) => { window.__vib.push(v); return true; };
};
const choices = (page) => page.locator("#path .chs .crow");
const station = (page) => page.locator("#stn");
const scroller = (page) => page.locator("#path .main .pscroll");
const main = (page) => page.locator("#path .main");
const strip = (page) => page.locator("#path .pstrip");
/** The top node of the question: the heading of its first step, or the pair at the head of a result. */
const topNode = (page) => page.locator("#path .pathc > .sx.first > :is(.sechead,.pn)");
const lifted = (page) => main(page).evaluate((e) => parseFloat(e.style.getPropertyValue("--bk")) || 0);
const verdict = (page) => page.locator("#path .pvline");
const pairNow = (page) => page.evaluate(() => window.__t.cur.p.a + "|" + window.__t.cur.p.b);
/** The ride of the step before has ended: a pull begun while a station is being taken is not taken. */
const settled = (page) => expect(page.locator("#path .main")).not.toHaveClass(/\b(tk-run|tk-in|pk-run|pk-swap|pk-keep|sc-run|sc-in|fw-wait|fw-ph)\b/);

/** The first pair answered to its result, Next, and the second pair half answered: the relation picked and one example written (no keyboard), its strip folded above. */
async function halfAnswered(page) {
  await page.addInitScript(onPath);
  await page.goto("/");
  await expect(relOptions(page)).toHaveCount(5);
  await answerFirst(page);
  const first = await pairNow(page);
  await station(page).click();
  await expect(choices(page)).toHaveCount(5);
  await settled(page);
  await choices(page).nth(1).click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  await field.fill("my half answer");
  await field.blur();
  await strip(page).evaluate((e) => Promise.all(e.getAnimations().map((a) => a.finished)));
  const second = await pairNow(page);
  return { first, second };
}
/** The second pair drawn, at its first step (the relation not picked yet): the top node is the heading of the step on the page. */
async function nextDrawn(page) {
  await page.addInitScript(onPath);
  await page.goto("/");
  await expect(relOptions(page)).toHaveCount(5);
  await answerFirst(page);
  const first = await pairNow(page);
  await station(page).click();
  await expect(choices(page)).toHaveCount(5);
  await settled(page);
  return { first, second: await pairNow(page) };
}
/** The strip of the examples unfolded (a tap opens it, as a pull does). */
async function unfold(page) {
  await strip(page).locator(".knob").click();
  await expect(strip(page)).toHaveClass(/\bopen\b/);
  await strip(page).evaluate((e) => new Promise((r) => setTimeout(r, 350)));
}

/** A real touch that starts on `at` (a locator; `dx` px from its left, at its middle or `dy0` px down) and moves down by each of `dys` (px from the start); `up` lets go. Returns the touch to carry on with. */
async function drag(page, at, dys, { up = true, dx = 130, dy0 = null } = {}) {
  const b = await at.first().boundingBox(), x = b.x + dx, y = b.y + (dy0 === null ? b.height / 2 : dy0);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 1 });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y, id: 1 }] });
  for (const d of dys) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y + d, id: 1 }] });
  if (up) await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  return { cdp, x, y };
}
const to = (h, d) => h.cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: h.x, y: h.y + d, id: 1 }] });
const lift = (h) => h.cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
/** The way down a page by `n` px in steps of about 10, as a finger moves it. */
const along = (n) => Array.from({ length: Math.round(n / 10) }, (_, i) => (i + 1) * 10);
/** A whole pull over the curb. */
const OVER = [4, 20, 36, 44, 52, 90, 120, 160];
/** The pull back where the question has its top: the strip unfolded in the examples, else the top node on the page. */
async function pullBack(page) {
  if (await strip(page).count()) { await unfold(page); await drag(page, strip(page), OVER, { dy0: 24 }); } else await drag(page, topNode(page), OVER);
}
/** Nothing of a pull is left on the screen. */
async function clean(page) {
  await expect(page.locator("#path .main:is(.bkpull, .bkover, .bkrest, .bkhint, .bkrun)")).toHaveCount(0);
  expect(await main(page).evaluate((e) => e.style.getPropertyValue("--bk")), "the thread is where it belongs").toBe("");
}

test("in the examples the folded heading opens on a pull; pulled down again it comes down with the page, the station above it, sticks at the curb and goes over it with one knock; let go there the result before is back, and Next brings the question back as it was", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const { first, second } = await halfAnswered(page);
  expect(await page.locator("#path .bkhead").count(), "the station of the step back is there to be pulled into view").toBe(1);
  await page.evaluate(() => { window.__vib = []; });
  await drag(page, strip(page), along(120), { dy0: 20 });
  await expect(strip(page), "the folded heading pulled opens").toHaveClass(/\bopen\b/);
  await clean(page);
  await strip(page).evaluate(() => new Promise((r) => setTimeout(r, 350)));
  const s0 = await strip(page).boundingBox();
  const h = await drag(page, strip(page), [4, 20, 36, 44, 52], { up: false, dy0: 24 });
  await expect.poll(() => lifted(page)).toBeGreaterThan(20);
  expect(await lifted(page), "the thread follows less and less, and stays under the curb").toBeLessThan(43);
  expect(await page.evaluate(() => window.__vib), "no knock before the curb").toEqual([]);
  for (const d of [80, 110, 140]) await to(h, d);
  await expect(main(page)).toHaveClass(/\bbkover\b/);
  expect(await page.evaluate(() => window.__vib), "one knock over the curb").toEqual([12]);
  const dy = await lifted(page);
  expect(dy, "over the curb the thread follows the finger").toBeGreaterThan(60);
  const s1 = await strip(page).boundingBox(), st = await page.locator("#path .bkhead .bkst").boundingBox();
  expect(Math.abs(s1.y - s0.y - dy), "the heading comes down with the thread").toBeLessThan(1.5);
  expect(st.y + st.height, "the station stands above the heading, not under it").toBeLessThanOrEqual(s1.y + 1);
  expect(st.y, "and under the top bar").toBeGreaterThanOrEqual(s0.y - 1);
  await lift(h);
  await expect(verdict(page), "the result before is back").toBeVisible();
  await expect(station(page)).toHaveAccessibleName(/^Back to your pair/);
  expect(await pairNow(page)).toBe(first);
  await clean(page);
  expect(await page.locator("#path .bkhead").count(), "from there nothing is further back").toBe(0);
  await station(page).click();
  await expect(page.locator("#stnp"), "the examples of the pair, its Result not ready yet").toHaveAccessibleName(/^Result/);
  expect(await pairNow(page), "the same pair").toBe(second);
  await expect(page.locator("#cin")).toHaveValue("my half answer");
  await expect(page.locator("#path .chs")).toHaveCount(0);      // the relation is still picked: the page is at its examples
  await expect(strip(page), "its heading folded again").not.toHaveClass(/\bopen\b/);
  await expect(page.locator("#path .bkhead"), "and the way back is there again").toHaveCount(1);
  await clean(page);
  expect(errors).toEqual([]);
});

test("let go short of the curb the thread goes back to its place, and nothing is taken", async ({ page }) => {
  await halfAnswered(page);
  await unfold(page);
  await page.evaluate(() => { window.__vib = []; });
  const h = await drag(page, strip(page), [4, 20, 36, 44, 52], { up: false, dy0: 24 });
  await expect.poll(() => lifted(page)).toBeGreaterThan(20);
  await lift(h);
  await expect(page.locator("#cin")).toHaveValue("my half answer");
  await clean(page);
  expect(await page.evaluate(() => window.__vib)).toEqual([]);
  await expect(verdict(page)).toHaveCount(0);
});

test("on the page itself the top node is pulled; the rest of the page dragged down at its top only shows the station a little, and never goes back", async ({ page }) => {
  const { first, second } = await nextDrawn(page);
  await page.evaluate(() => { window.__vib = []; });
  const h = await drag(page, choices(page).nth(2), along(300), { up: false });
  await expect.poll(() => lifted(page), "the station peeks").toBeGreaterThan(5);
  await expect(main(page)).toHaveClass(/\bbkhint\b/);
  expect(await lifted(page), "however far the page is dragged, it resists, short of the curb").toBeLessThanOrEqual(26);
  await expect(main(page)).not.toHaveClass(/\bbkover\b/);
  await lift(h);
  await clean(page);
  expect(await page.evaluate(() => window.__vib), "no knock").toEqual([]);
  await expect(verdict(page)).toHaveCount(0);
  expect(await pairNow(page)).toBe(second);
  await drag(page, topNode(page), OVER);
  await expect(verdict(page), "the top node pulled over the curb goes back").toBeVisible();
  expect(await pairNow(page)).toBe(first);
  await station(page).click();
  await expect(choices(page), "the pair after it, not picked yet").toHaveCount(5);
  expect(await pairNow(page)).toBe(second);
});

test("a page that is not at its top is scrolled, not pulled", async ({ page }) => {
  await nextDrawn(page);
  await page.addStyleTag({ content: "#path .pathc{min-height:2600px}" });
  await scroller(page).evaluate((e) => { e.scrollTop = 400; });
  const h = await drag(page, scroller(page), along(120), { up: false, dx: 80, dy0: 150 });
  await expect.poll(() => scroller(page).evaluate((e) => e.scrollTop)).toBeLessThan(400);
  expect(await scroller(page).evaluate((e) => e.scrollTop), "it is still scrolled").toBeGreaterThan(0);
  expect(await lifted(page), "scrolling up the page is scrolling").toBe(0);
  await lift(h);
  await clean(page);
  await expect(choices(page)).toHaveCount(5);
});

test("on a computer the wheel or the trackpad scrolling up past the top only shows the station a little; the mouse drags the top node back", async ({ page }) => {
  const { first } = await nextDrawn(page);
  const b = await scroller(page).boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + 200);
  await page.waitForTimeout(250);
  let most = 0;
  for (let i = 0; i < 12; i++) { await page.mouse.wheel(0, -90); await page.waitForTimeout(40); most = Math.max(most, await lifted(page)); }
  expect(most, "the station peeks").toBeGreaterThan(5);
  expect(most, "and the page resists, short of the curb").toBeLessThanOrEqual(26);
  await expect(main(page)).not.toHaveClass(/\bbkover\b/);
  await page.waitForTimeout(700);
  await clean(page);
  await expect(verdict(page), "scrolling never goes back").toHaveCount(0);
  const n = await topNode(page).boundingBox(), x = n.x + 130, y = n.y + n.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (const d of along(160)) await page.mouse.move(x, y + d);
  await expect(main(page)).toHaveClass(/\bbkover\b/);
  await page.mouse.up();
  await expect(verdict(page), "the result before is back").toBeVisible();
  expect(await pairNow(page)).toBe(first);
  await station(page).press("Enter");
  await expect(choices(page)).toHaveCount(5);
});

test("with the first pair there is nothing before it, and Sprint has no way back", async ({ page }) => {
  await page.addInitScript(onPath);
  await page.goto("/");
  await expect(relOptions(page)).toHaveCount(5);
  expect(await page.locator("#path .bkhead").count(), "nothing is before the first pair").toBe(0);
  await answerFirst(page);
  await station(page).click();
  await expect(choices(page)).toHaveCount(5);
  await settled(page);
  expect(await page.locator("#path .bkhead").count(), "the first result is before this pair").toBe(1);
  await page.getByRole("switch", { name: /Sprint off/ }).click();
  await expect(page.locator("#path .bkhead"), "Sprint has no way back").toHaveCount(0);
  await page.getByRole("switch", { name: /Sprint on/ }).click();
  await expect(page.locator("#path .bkhead")).toHaveCount(1);
});

test.describe("Claude on the result pulled back to", () => {
  const sse = (...events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
  const ANSWER = sse({ type: "delta", text: "this is the stand-in answer." }, { type: "done", truncated: false });
  test("the check and the explanation are still asked there, and Next goes on to the question", async ({ page }) => {
    await giveKey(page);
    const asked = [];
    await page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, tutor: "on" }) }));
    await page.route("**/api/tutor", (route) => { asked.push(route.request().postDataJSON()); return route.fulfill({ status: 200, contentType: "text/event-stream", body: ANSWER }); });
    await halfAnswered(page);
    await pullBack(page);
    await expect(verdict(page)).toBeVisible();
    await expect(page.locator(".cwex .crow")).toContainText(/explain/i);
    await page.locator(".cwex .crow").click();
    await expect(page.locator(".wtext")).toContainText("this is the stand-in answer.");
    expect(asked).toHaveLength(1);
    await station(page).click();
    await expect(page.locator("#cin")).toHaveValue("my half answer");
  });
});

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });
  test("the page leaves down and the result comes in; nothing of the ride is left, and the question is as it was", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await halfAnswered(page);
    await pullBack(page);
    await expect(page.locator("#path .main.bkrun"), "the page is leaving").toHaveCount(1);
    await expect(verdict(page)).toBeVisible({ timeout: 3000 });
    await expect(station(page)).toHaveAccessibleName(/^Back to your pair/);
    await page.waitForTimeout(600);
    await clean(page);
    await station(page).click();
    await expect(page.locator("#cin"), "forward is the push of the next station, and the question is as it was").toHaveValue("my half answer", { timeout: 4000 });
    expect(errors).toEqual([]);
  });
});

test("the result left is pulled back to again after the question after it is answered, one step at a time", async ({ page }) => {
  await halfAnswered(page);
  // the second pair is carried to its result; the way back from it is to the second pair's result, and Next from there draws a third pair
  const field = page.locator("#cin");
  await field.fill("second example");
  await field.press("Enter");
  for (let i = 0; i < 4 && (await field.isVisible()); i++) { await field.fill("thing " + (i + 2)); if ((await field.getAttribute("enterkeyhint")) === "done") { await field.blur(); break; } await field.press("Enter"); }
  await station(page).click();
  await expect(verdict(page)).toBeVisible();
  const second = await page.evaluate(() => window.__t.cur.p.a + "|" + window.__t.cur.p.b);
  await station(page).click();
  await expect(choices(page)).toHaveCount(5);
  await settled(page);
  const third = await pairNow(page);
  await pullBack(page);
  await expect(verdict(page)).toBeVisible();
  expect(await page.evaluate(() => window.__t.cur.p.a + "|" + window.__t.cur.p.b), "the result of the second pair").toBe(second);
  await station(page).click();
  await expect(choices(page), "the third pair, not picked yet").toHaveCount(5);
  expect(await page.evaluate(() => window.__t.cur.p.a + "|" + window.__t.cur.p.b)).toBe(third);
});

/** The exercise named, from the roadmap, as a learner goes to it. */
async function open(page, name) {
  await page.locator(".tstn").click();
  await page.getByRole("dialog", { name: "Roadmap" }).getByRole("button", { name: new RegExp("^" + name) }).click();
  await expect(page.locator(".ptb-t")).toContainText(name);
  await exerciseAtRest(page);
}

test("Pervasions: a pair finished, the next one half answered; the way back shows the result and Next brings the answers and the counter-example back", async ({ page }) => {
  await page.addInitScript(onPath);
  await page.goto("/");
  await expect(relOptions(page)).toHaveCount(5);
  await open(page, "Pervasions");
  const accept = () => choices(page).filter({ hasText: "Accept" }).first(), done = (n) => expect(page.locator("#path .sb.done")).toHaveCount(n);
  await accept().click();
  await done(1);
  await choices(page).filter({ hasText: "Why?" }).first().click();
  await page.locator("#dex").fill("a stone");
  await page.locator("#dex").press("Enter");
  await done(2);
  await accept().click();
  await done(3);
  await accept().click();
  await expect(choices(page)).toHaveCount(5);
  await choices(page).first().click();
  await expect(verdict(page)).toBeVisible();
  await expect(station(page)).toHaveAccessibleName(/^Next pair/);
  await station(page).click();
  await expect(choices(page)).toHaveCount(2);
  await settled(page);
  await accept().click();
  await done(1);
  await choices(page).filter({ hasText: "Why?" }).first().click();
  await page.locator("#dex").fill("half a counter-example");
  await page.locator("#dex").blur();
  await pullBack(page);
  await expect(verdict(page), "the result of the pair before").toBeVisible();
  await expect(page.locator("#path .qres")).toHaveCount(4);
  await expect(page.locator("#path .qres").nth(1)).toContainText("a stone");
  await expect(station(page)).toHaveAccessibleName(/^Back to your pair/);
  await station(page).click();
  await expect(page.locator("#path .sb.done"), "the first question is still answered").toHaveCount(1);
  await expect(page.locator("#dex"), "and the counter-example is still written").toHaveValue("half a counter-example");
});

test("the way back stays with its exercise: another exercise and back again, and the result is still pulled back to", async ({ page }) => {
  await halfAnswered(page);
  await pullBack(page);
  await expect(verdict(page)).toBeVisible();
  await settled(page);
  await open(page, "Pervasions");
  expect(await page.locator("#path .bkhead").count(), "Pervasions has no step back of its own").toBe(0);
  await open(page, "Relations");
  await expect(verdict(page), "the result is where it was left").toBeVisible();
  await expect(station(page)).toHaveAccessibleName(/^Back to your pair/);
  await station(page).click();
  await expect(page.locator("#cin")).toHaveValue("my half answer");
});
