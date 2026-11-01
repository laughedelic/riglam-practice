// The ways of taking a station on the Path that are the default (src/app/path/push.ts, scan.tsx, foot.ts): `ride: push`, where the page rises with the station while it is held over its
// curb and, let go, keeps rising and leaves through the top ahead of it (a syllogism keeps its statement and the result opens under it), `check: morph`, where the examples' page moves
// into the result's instead of being swapped for it (a syllogism's Result takes that scan too, over its reply and counter-example), and what is at the foot while the station is away (a placeholder for the next station, foot.ts).
// The squeeze and the scan are path-take.spec.js and path-scan.spec.js.
import { test, expect } from "../../support/test.js";
import { exerciseAtRest } from "../../support/page.js";

test.use({ reducedMotion: "no-preference" });

const onPath = () => {
  window.__riglamTest = (t) => { window.__t = t; };
  window.__vib = []; navigator.vibrate = (v) => { window.__vib.push(v); return true; };
  // the page tells a finger from a mouse (state.hand: its knocks are for a finger); Playwright's mouse is made to read as a finger here, `window.__pointer = "mouse"` as a mouse again
  Object.defineProperty(PointerEvent.prototype, "pointerType", { get: () => window.__pointer || "touch", configurable: true });
};
const choices = (page) => page.locator("#path .chs .crow");
const main = (page) => page.locator("#path .main");
const look = (page, l) => page.addInitScript((v) => localStorage.setItem("rd-look", JSON.stringify(v)), l);

/** The examples of a pair written, the Check not yet taken (the keyboard is let go of, so the Check stands in the foot). */
async function toCheck(page) {
  await page.addInitScript(onPath);
  await page.goto("/");
  await expect(choices(page)).toHaveCount(5);
  await choices(page).first().click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (let i = 0; i < 4 && (await field.isVisible()); i++) { await field.fill("thing " + (i + 1)); if ((await field.getAttribute("enterkeyhint")) === "done") { await field.blur(); break; } await field.press("Enter"); }
}
async function toResult(page) {
  await toCheck(page);
  await page.locator("#stn").click();
  await expect(page.locator(".pvline")).toBeVisible();
  await expect(page.locator("#stn")).toContainText("Next pair");
  await expect(main(page)).not.toHaveClass(/\b(tk-in|pk-run|sc-in)\b/);
}
async function pull(page, ds) {
  const b = await page.locator("#stn").boundingBox(), x = b.x + 20, y = b.y + b.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  for (const d of ds) await page.mouse.move(x, y - d, { steps: 3 });
  return { x, y };
}
const pushed = (page) => page.locator("#path .pathc").evaluate((e) => Number(e.dataset.push || 0));
/** Nothing of a ride is left on the page. */
async function expectClean(page) {
  await expect(main(page)).not.toHaveClass(/\b(tk-run|tk-in|pk-run|pk-swap|pk-keep|sc-run|sc-in|sc-hand|sc-morph)\b/);
  await expect(page.locator(".pa")).not.toHaveClass(/\b(pulling|pushing|pushback)\b/);
  await expect(page.locator("#path .tkd, #path .pk-f, #path .pk-gone, #path .morphed, #path .mnew, #path .pscan, #path .pk-ghost, #path .fw-sd")).toHaveCount(0);
  await expect(main(page)).not.toHaveClass(/\b(fw-wait|fw-ph)\b/);
  expect(await page.locator("#path .pathc").evaluate((e) => e.style.getPropertyValue("--push") + (e.dataset.push || "")), "the page is not pushed").toBe("");
  expect(await page.locator("#stn, #stnp").first().evaluate((e) => e.style.transform), "the station is where it belongs").toBe("");
}

test("ride: push, held over the curb the page rises with the station and is not squeezed; pulled back it goes down again and nothing is taken", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await look(page, { ride: "push", check: "ride" });
  await toResult(page);
  const { x, y } = await pull(page, [30, 45, 70, 110, 200, 300, 400, 480]);
  await expect.poll(() => pushed(page)).toBeGreaterThan(5);
  await expect(page.locator(".pa")).toHaveClass(/\bpushing\b/);
  expect(await page.locator("#path .pvline").evaluate((e) => e.getBoundingClientRect().height), "the page is whole, not squeezed").toBeGreaterThan(10);
  // the thread and its nodes are one piece: the page's nodes are not left behind below the station
  const [last, st] = await Promise.all([page.locator("#path .pathc .sb .d").last().boundingBox(), page.locator("#stn .go").boundingBox()]);
  expect(last.y + last.height, "the last node is above the station").toBeLessThan(st.y + 2);
  await page.mouse.move(x, y, { steps: 14 });
  await expect(page.locator(".pa")).not.toHaveClass(/\bpushing\b/, { timeout: 2000 });
  await page.mouse.up();
  await expect.poll(() => page.locator("#stn").evaluate((e) => Math.abs(new DOMMatrix(getComputedStyle(e).transform).m42))).toBeLessThan(1);
  await expect(page.locator(".pvline"), "nothing was taken").toBeVisible();
  await expectClean(page);
  expect(errors).toEqual([]);
});

test("ride: push, let go the page keeps rising and leaves through the top, the station lands as the next bullet, and the next step comes in", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await look(page, { ride: "push", check: "ride" });
  await toResult(page);
  await pull(page, [30, 45, 70, 110, 200, 300, 400, 480]);
  await expect.poll(() => pushed(page)).toBeGreaterThan(5);
  const was = await pushed(page);
  await page.mouse.up();
  await expect(main(page)).toHaveClass(/\bpk-run\b/);
  await expect.poll(() => pushed(page), "the page goes on rising").toBeGreaterThan(was + 20);
  expect(await page.locator("#path .pathc > [data-tk=head]").count(), "nothing is squeezed into a head").toBe(0);
  await expect(page.locator("#path .sechead")).toBeVisible({ timeout: 5000 });
  await expect(choices(page)).toHaveCount(5);
  await expectClean(page);
  expect(errors).toEqual([]);
});

/** Samples the station's copy (the diamond that comes to rest at the new question) every frame: its centre's y, until it is gone. */
const watchGhost = (page) => page.evaluate(() => {
  window.__ghost = { ys: [], bullet: null, still: null, gone: false };
  const tick = () => {
    const g = document.querySelector("#path .pk-ghost"), w = window.__ghost;
    if (g) {
      const r = g.querySelector(".go").getBoundingClientRect(), y = r.top + r.height / 2; w.ys.push(y);
      const nb = document.querySelector("#path .pathc .d, #path .pathc .rfig");
      if (nb && !w.still && g.getAnimations().length && g.getAnimations().every((a) => a.playState === "finished")) { const b = nb.getBoundingClientRect(); w.still = y; w.bullet = b.top + b.height / 2; }
    } else if (w.ys.length) { w.gone = true; return; }
    requestAnimationFrame(tick);
  };
  tick();
});

test("ride: push, the station comes to rest as the big diamond exactly where the new question's bullet is, and turns into it", async ({ page }) => {
  await look(page, { ride: "push", check: "ride" });
  await toResult(page);
  await watchGhost(page);
  await page.locator("#stn").click();
  await expect.poll(() => page.evaluate(() => window.__ghost.gone), { timeout: 8000 }).toBe(true);
  const w = await page.evaluate(() => window.__ghost);
  expect(w.ys.length, "the copy of the station was there").toBeGreaterThan(3);
  expect(Math.abs(w.still - w.bullet), "it rests at the bullet").toBeLessThan(1.5);
  expect(w.ys.every((y) => y >= w.bullet - 1.5), "and never goes past it: no recoil").toBe(true);
  await expect(page.locator("#path .sechead")).toBeVisible();
  await expectClean(page);
});

test("ride: push with land: recoil, the station goes a little past the new bullet and comes back to it", async ({ page }) => {
  await look(page, { ride: "push", land: "recoil", check: "ride" });
  await toResult(page);
  await watchGhost(page);
  await page.locator("#stn").click();
  await expect.poll(() => page.evaluate(() => window.__ghost.gone), { timeout: 8000 }).toBe(true);
  const w = await page.evaluate(() => window.__ghost);
  expect(Math.abs(w.still - w.bullet), "it ends at the bullet").toBeLessThan(1.5);
  expect(Math.min(...w.ys), "it went past it first").toBeLessThan(w.bullet - 4);
  await expectClean(page);
});

test("ride: push, a tap takes the station with the same ride", async ({ page }) => {
  await look(page, { ride: "push", check: "ride" });
  await toResult(page);
  await page.locator("#stn").click();
  await expect(main(page)).toHaveClass(/\bpk-run\b/);
  await expect(page.locator("#path .sechead")).toBeVisible({ timeout: 5000 });
  await expect(choices(page)).toHaveCount(5);
  await expectClean(page);
});

test("ride: push, a syllogism's Result folds the heading above the statement and what is under it, and the statement does not move when the result opens", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await look(page, { ride: "push", check: "ride" });
  await page.addInitScript(onPath);
  await page.goto("/");
  await expect(choices(page)).toHaveCount(5);
  await page.locator(".tstn").click();
  await page.getByRole("dialog", { name: "Roadmap" }).getByRole("button", { name: /^Syllogisms/ }).click();
  await expect(page.locator(".ptb-t")).toContainText("Syllogisms");
  await exerciseAtRest(page);
  expect(await page.evaluate(() => { for (let i = 0; i < 600; i++) { if (window.__t.cur.c.answer === "pervasion") return true; window.__t.next(); } return false; })).toBe(true);
  await choices(page).filter({ hasText: "There is no pervasion" }).first().click();
  await expect(page.locator("#sylex")).toBeVisible();
  await page.locator("#sylex").blur();
  const stm = page.locator("#path .pathc .stm");
  await expect(stm).toHaveCount(3);
  const top = await stm.first().boundingBox();
  // the statement's place every frame, and whether the step had gone on (the old page is hidden but the statement)
  await page.evaluate(() => {
    const w = (window.__stm = { ys: [], swapped: [], gold: [] });
    const tick = () => {
      const e = document.querySelector("#path .pathc .stm"), m = document.querySelector("#path .main");
      if (e) { w.ys.push(e.getBoundingClientRect().top); w.swapped.push(m.classList.contains("pk-swap") || m.classList.contains("tk-in")); }
      requestAnimationFrame(tick);
    };
    tick();
  });
  await page.locator("#stn").click();
  await expect(main(page)).toHaveClass(/\bpk-keep\b/);
  await expect.poll(() => page.locator("#path .pathc .pk-gone").count(), "the heading fades").toBeGreaterThan(0);
  await expect.poll(() => page.locator("#path .pathc .pk-f").count(), "what is under the statement folds into it").toBeGreaterThan(0);
  await expect(page.locator(".pvline")).toBeVisible({ timeout: 5000 });
  await expect(main(page)).not.toHaveClass(/\b(tk-in|pk-run)\b/);
  expect(await stm.first().evaluate((e) => Number(getComputedStyle(e).opacity)), "the statement is seen").toBeGreaterThan(0.9);
  await expect(page.locator("#path .pathc .stm"), "the result shows the statement once").toHaveCount(3);
  const w = await page.evaluate(() => window.__stm), end = w.ys[w.ys.length - 1], first = w.swapped.indexOf(true);
  expect(first, "the step went on").toBeGreaterThan(0);
  expect(top.y - end, "the statement came up as the heading folded").toBeGreaterThan(30);
  expect(Math.max(...w.ys.slice(first).map((y) => Math.abs(y - end))), "and does not move once the step goes on").toBeLessThan(1.5);
  await expect(page.locator("#stn")).toContainText("Next");
  await expectClean(page);
  expect(errors).toEqual([]);
});

test("check: morph, the result's node and word are not drawn twice, the pair moves from the strip into the result's, and the page is never seen whole before it comes in; nothing is left on it", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await look(page, { check: "morph" });
  await toCheck(page);
  // the first frame the result's pair is there: has the page started to come in, and where are the pair's names
  await page.evaluate(() => {
    const w = (window.__sw = { first: null });
    const tick = () => {
      const m = document.querySelector("#path .main"), b = document.querySelector("#path .pn.res .pnl.a .tw > b");
      if (b && !w.first) w.first = { scin: m.classList.contains("sc-in"), from: b.getAnimations().map((a) => String(a.effect.getKeyframes()[0].translate)), scale: b.getAnimations().map((a) => String(a.effect.getKeyframes()[0].scale)) };
      requestAnimationFrame(tick);
    };
    tick();
  });
  await page.locator("#stn").click();
  await expect(main(page)).toHaveClass(/\bsc-run\b/);
  // the page is swapped for the result's while the scanner is still the node: the page's own node and word wait for it
  await page.waitForFunction(() => document.querySelector(".pvline") && document.querySelector(".pscan"), null, { polling: "raf", timeout: 8000 });
  expect(await page.locator("#path .pvline .ptx").evaluate((e) => getComputedStyle(e).visibility), "the result's word waits for the scanner").toBe("hidden");
  await expect(page.locator(".pvline .ptx")).toBeVisible({ timeout: 4000 });
  await expect(page.locator("#stn")).toContainText("Next pair");
  const w = await page.evaluate(() => window.__sw.first);
  expect(w.scin, "the result's page starts to come in in the frame it is drawn").toBe(true);
  expect(w.from.length, "its first term moves in from where the strip's was").toBeGreaterThan(0);
  expect(Number(w.scale[0]), "and smaller, as it was there").toBeLessThan(1);
  await expectClean(page);
  await expect(page.locator("#path .pathc .exr")).not.toHaveCount(0);
  expect(errors).toEqual([]);
});

/** What is at the foot, every frame of a ride: the placeholder of the next station, the foot's real station (hidden while the foot waits), whether the scanner or the ghost is on the page, the foot's stub, and how far the thread the scanner has passed reaches below the last case's diamond. */
const watchFoot = (page) => page.evaluate(() => {
  const w = (window.__fw = { sd: 0, pre: false, words: "", wait: 0, hidden: 0, real: 0, scan: 0, scanReal: 0, ghost: 0, pastBelow: -999, pastLen: 0, stub: 0, act: 0 });
  const tick = () => {
    const sd = document.querySelector("#path .fw-sd"), m = document.querySelector("#path .main"), real = document.querySelector("#path .foot .stn");
    if (sd) { w.sd++; w.pre = !!sd.querySelector(".go.pre"); w.words = w.words || (sd.querySelector(".gol b") || {}).textContent || ""; }
    if (m.classList.contains("fw-wait")) { w.wait++; if (real && getComputedStyle(real).opacity === "0") w.hidden++; }
    const shown = real && getComputedStyle(real).visibility !== "hidden" && getComputedStyle(real).opacity !== "0" && !real.classList.contains("scanning");
    if (shown && /Next/.test(real.textContent)) { w.real++; if (document.querySelector("#path .pscan")) w.scanReal++; }
    if (real && real.classList.contains("fw-act")) w.act++;
    if (document.querySelector("#path .pscan")) w.scan++;
    if (document.querySelector("#path .pk-ghost")) w.ghost++;
    const scn = document.querySelector("#path .pscan"), foot = document.querySelector("#path .foot");
    if (scn && foot && scn.getBoundingClientRect().bottom < foot.getBoundingClientRect().top - 40 && getComputedStyle(foot, "::before").visibility !== "hidden") w.stub++;
    const past = document.querySelector("#path .pscpast"), rows = document.querySelectorAll("#path .pathc .sx.cur .sb");
    if (past && rows.length && past.getBoundingClientRect().height > 0.5) {
      const pr = past.getBoundingClientRect(), d = rows[rows.length - 1].querySelector(".d") || rows[rows.length - 1], dr = d.getBoundingClientRect();
      w.pastLen = Math.max(w.pastLen, pr.height); w.pastBelow = Math.max(w.pastBelow, pr.bottom - (dr.top + dr.height / 2));
    }
    requestAnimationFrame(tick);
  };
  tick();
});

test("foot: a placeholder for the next station, gray and empty, is born at the foot as the station rises; the real one comes in only once the step has landed", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await look(page, { check: "ride" });
  await toResult(page);
  await watchFoot(page);
  await page.locator("#stn").click();
  await expect(main(page)).toHaveClass(/\bpk-run\b/);
  await expect(page.locator("#path .fw-sd"), "the placeholder is at the foot").toHaveCount(1, { timeout: 3000 });
  await expect(page.locator("#path .sechead")).toBeVisible({ timeout: 5000 });
  await expect(page.locator("#path .foot .stn")).toBeVisible();
  await expect(main(page)).not.toHaveClass(/\bpk-run\b/);
  await expectClean(page);
  const w = await page.evaluate(() => window.__fw);
  expect(w.sd, "the placeholder was there for frames").toBeGreaterThan(5);
  expect(w.pre, "it is the gray station of a question that is not ready").toBe(true);
  expect(w.words, "and has no words").toBe("");
  expect(w.wait, "the foot's real station waited for the step").toBeGreaterThan(5);
  expect(w.hidden, "and was not shown while it did").toBe(w.wait);
  expect(w.act, "it came in as itself").toBeGreaterThan(3);
  expect(errors).toEqual([]);
});

test("foot: pulled back under the curb, the placeholder goes with the station and nothing of it is left", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await look(page, { check: "ride" });
  await toResult(page);
  const { x, y } = await pull(page, [30, 45, 70, 110, 200, 300, 400, 480]);
  await expect(page.locator("#path .fw-sd"), "the placeholder is born while the station is held over the curb").toHaveCount(1);
  await page.mouse.move(x, y, { steps: 14 });
  await page.mouse.up();
  await expect(page.locator("#path .fw-sd")).toHaveCount(0, { timeout: 2000 });
  await expectClean(page);
  expect(errors).toEqual([]);
});

test("foot: the Check's scanner leaves a placeholder at the foot, with the foot's stub above it, and Next pair comes in once the scanner is the result's node", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await toCheck(page);
  await watchFoot(page);
  await page.locator("#stn").click();
  await expect(main(page)).toHaveClass(/\bsc-run\b/);
  await expect(page.locator(".pvline .ptx")).toBeVisible({ timeout: 8000 });
  await expect(page.locator("#stn")).toContainText("Next pair");
  await expect(main(page)).not.toHaveClass(/\b(sc-in|sc-hand|sc-morph)\b/);
  await expectClean(page);
  const w = await page.evaluate(() => window.__fw);
  expect(w.scan, "the scanner was on the page").toBeGreaterThan(10);
  expect(w.sd, "the placeholder stood at the foot").toBeGreaterThan(10);
  expect(w.pre, "gray and empty").toBe(true);
  expect(w.scanReal, "Next pair was not at the foot while the scanner was").toBe(0);
  expect(w.real, "it came in after").toBeGreaterThan(3);
  expect(w.pastLen, "the scanner left a thread behind it through the cases").toBeGreaterThan(20);
  expect(w.pastBelow, "but none below the last case, over the empty ground to the foot").toBeLessThanOrEqual(1);
  expect(w.stub, "and the foot's own stub of thread stays above the placeholder").toBeGreaterThan(10);
  expect(errors).toEqual([]);
});

/** A syllogism whose reply was "there is no pervasion" (the reply that holds its verdict), at the counter-example (with `text` written in it), the Result not yet taken. */
async function toCounter(page, text = "") {
  await page.addInitScript(onPath);
  await page.goto("/");
  await expect(choices(page)).toHaveCount(5);
  await page.locator(".tstn").click();
  await page.getByRole("dialog", { name: "Roadmap" }).getByRole("button", { name: /^Syllogisms/ }).click();
  await expect(page.locator(".ptb-t")).toContainText("Syllogisms");
  await exerciseAtRest(page);
  expect(await page.evaluate(() => { for (let i = 0; i < 600; i++) { if (window.__t.cur.c.answer === "pervasion") return true; window.__t.next(); } return false; })).toBe(true);
  await choices(page).filter({ hasText: "There is no pervasion" }).first().click();
  await expect(page.locator("#sylex")).toBeVisible();
  if (text) await page.locator("#sylex").fill(text);
  await page.locator("#sylex").blur();
}

/** What a syllogism's scan does, every frame: where the statement is, whether the reply and the counter-example are still on the page, what is marked, and when the page was swapped. */
const watchScan = (page) => page.evaluate(() => {
  const w = (window.__sc = { ys: [], swapAt: -1, rowsSeen: 0, marked: "", scan: 0, scanned: 0, gone: false, replyMarked: 0 });
  const tick = () => {
    const m = document.querySelector("#path .main"), stm = document.querySelector("#path .pathc .stm"), said = document.querySelector("#path .pathc .sylsaid"), row = document.querySelector("#path .pathc .sb.now");
    if (stm) w.ys.push(Math.round(stm.getBoundingClientRect().top * 10) / 10);
    if (w.swapAt < 0 && m.classList.contains("sc-morph")) w.swapAt = w.ys.length - 1;
    if (document.querySelector("#path .pscan")) { w.scan++; if (w.swapAt < 0 && said && getComputedStyle(said).opacity > 0.5) w.rowsSeen++; }
    if (row && /\bscn-(ok|no|pt)\b/.test(row.className)) w.marked = row.className.match(/scn-(ok|no|pt)/)[0];
    if (said && said.classList.contains("scn-gone")) w.gone = true;
    else if (said && said.classList.contains("scn-rel") && said.querySelector(".pscm")) w.replyMarked++;
    requestAnimationFrame(tick);
  };
  tick();
});

test("check: morph, a syllogism's Result keeps the reply and the counter-example on the page while the scanner marks them, then the result opens under the statement, which does not move", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await toCounter(page, "salmon");
  await expect(page.locator("#path .pathc .stm")).toHaveCount(3);
  const room = () => page.locator("#path .pathc .stm").first().locator(".ptx").evaluate((e) => getComputedStyle(e).paddingRight);
  const roomBefore = await room();
  await expect(page.locator("#path .pathc .sylsaid .mark"), "the reply is not marked before the Result: the verdict is held").toHaveCount(0);
  await watchScan(page);
  await page.locator("#stn").click();
  await expect(main(page)).toHaveClass(/\bsc-run\b/);
  await expect(page.locator(".pvline .ptx")).toBeVisible({ timeout: 8000 });
  await expect(page.locator("#stn")).toContainText("Next");
  await expectClean(page);
  const w = await page.evaluate(() => window.__sc);
  expect(w.scan, "the scanner was on the page").toBeGreaterThan(10);
  expect(w.rowsSeen, "the reply stayed on the page while the scanner rose").toBeGreaterThan(10);
  expect(w.marked, "the counter-example was marked on the way").toMatch(/^scn-(ok|no|pt)$/);
  expect(w.replyMarked, "the reply was marked, with its words still on the page, once the example was").toBeGreaterThan(5);
  expect(w.gone, "the reply's words went as the scanner became the result's node").toBe(true);
  expect(w.swapAt, "the step went on").toBeGreaterThan(0);
  const at = w.ys[w.swapAt], after = w.ys.slice(w.swapAt);
  expect(Math.max(...after.map((y) => Math.abs(y - at))), "the statement does not move when the result opens").toBeLessThan(1.5);
  expect(w.ys[0] - at, "it came up as the heading above it folded").toBeGreaterThan(10);
  await expect(page.locator("#path .pathc .stm")).toHaveCount(3);
  expect(await room(), "the statement keeps the room of the Skip mark once it is gone, so its lines break as they did").toBe(roomBefore);
  await expect(page.locator(".pwhat")).toBeVisible();
  expect(errors).toEqual([]);
});

test("check: morph, a syllogism's Result with no counter-example marks nothing on the way: the scanner goes to the reply and becomes the result's node there", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await toCounter(page);
  await watchScan(page);
  await page.locator("#stn").click();
  await expect(main(page)).toHaveClass(/\bsc-run\b/);
  await expect(page.locator(".pvline .ptx")).toBeVisible({ timeout: 8000 });
  await expectClean(page);
  const w = await page.evaluate(() => window.__sc);
  expect(w.scan).toBeGreaterThan(10);
  expect(w.marked, "no case to mark").toBe("");
  expect(w.rowsSeen).toBeGreaterThan(10);
  expect(w.replyMarked, "the reply is marked all the same").toBeGreaterThan(5);
  await expect(page.locator(".pwhat")).toBeVisible();
  expect(errors).toEqual([]);
});

/** What a station looks like: the diamond's size and color, the label's size and color. */
const facts = (page, sel) => page.locator(sel).evaluate((e) => { const go = e.querySelector(".go"), b = e.querySelector(".gol b"); return { cls: e.className, size: go.offsetWidth, bg: getComputedStyle(go).backgroundColor, label: getComputedStyle(b).color, font: getComputedStyle(b).fontSize }; });
const tokenColor = (page, name) => page.locator(".pa").evaluate((e, n) => { const i = document.createElement("i"); i.style.color = "var(" + n + ")"; e.append(i); const c = getComputedStyle(i).color; i.remove(); return c; }, name);

test("stations say what they are by their look: Examples is gold and medium, Check and Result are ink and medium, the Next stations are the big blue ones", async ({ page }) => {
  await toCheck(page);
  const [ink, gold, goldT, blue] = await Promise.all(["--ink", "--gold", "--gold-t", "--station"].map((n) => tokenColor(page, n)));
  const check = await facts(page, "#stn");
  expect(check.cls).toContain("stk-chk");
  expect(check, "the Check: medium and ink").toMatchObject({ size: 22, bg: ink, label: ink, font: "19px" });
  // Examples: the step back from the examples' page to the relation, whose foot leads on to them again
  await page.evaluate(() => { window.__t.ui.open = true; window.__t.render(); });
  await expect(page.locator("#stn")).toHaveAccessibleName(/^Examples/);
  const ex = await facts(page, "#stn");
  expect(ex.cls).toContain("stk-ex");
  expect(ex, "Examples: medium and gold").toMatchObject({ size: 22, bg: gold, label: goldT, font: "19px" });
  await page.evaluate(() => { window.__t.ui.open = false; window.__t.render(); });
  await expect(page.locator("#stn")).toHaveAccessibleName(/^Check/);
  // the scanner opens as the Check is: its size and color
  await page.locator("#stn").click();
  const scan = page.locator("#path .pscan");
  await expect(scan).toHaveCount(1);
  const inkRaw = await page.locator(".pa").evaluate((e) => getComputedStyle(e).getPropertyValue("--ink").trim());
  expect(await scan.evaluate((e) => e.style.getPropertyValue("--station")), "the scanner is ink as it opens").toBe(inkRaw);
  expect(await scan.evaluate((e) => e.style.getPropertyValue("--s0")), "and the Check's size").not.toBe("");
  await expect(page.locator(".pvline")).toBeVisible();
  await expect(page.locator("#stn")).toContainText("Next pair");
  await expect(main(page)).not.toHaveClass(/\b(tk-in|pk-run|sc-in|sc-run|fw-wait)\b/);
  const next = await facts(page, "#stn");
  expect(next.cls, "the next exercise's station has no kind").not.toContain("stk");
  await expect.poll(() => facts(page, "#stn"), { message: "Next pair: big and blue (its colors are a transition that may still be running)" }).toMatchObject({ size: 28, bg: blue, label: blue, font: "21px" });
});

test("a station that lands as a ring (the stop of a new term) turns into the ring: it keeps its body while it turns and does not go blank first", async ({ page }) => {
  // a device that has just come to stage 1 and met no term: the Next after the pair's Check is "Next: new definition", and the stop's first bullet is a ring
  await page.addInitScript(() => { localStorage.setItem("rd-stages", "0,1"); localStorage.setItem("rd-terms", JSON.stringify({ n: 3, next: 3, terms: {} })); });
  await page.addInitScript(onPath);
  await page.goto("/");
  await expect(choices(page)).toHaveCount(5);
  const rel = await page.evaluate(() => window.__t.cur.p.relation);
  await choices(page).nth(["mi", "3ab", "3ba", "4", "con"].indexOf(rel)).click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (let i = 0; i < 4 && (await field.isVisible()); i++) { await field.fill("thing " + (i + 1)); if ((await field.getAttribute("enterkeyhint")) === "done") { await field.blur(); break; } await field.press("Enter"); }
  await page.locator("#stn").click();
  await expect(page.locator("#stn")).toHaveAccessibleName(/^Next: new definition/);
  await expect(main(page)).not.toHaveClass(/\b(tk-in|pk-run|sc-in|sc-run|fw-wait)\b/);
  // every frame of the copy of the station: how much of its diamond is body (a fill or the ring's inset line) while it turns
  await page.evaluate(() => {
    const w = window.__turn = { s: [], gone: false };
    const tick = () => {
      const g = document.querySelector("#path .pk-ghost .go");
      if (g) { const c = getComputedStyle(g); w.s.push({ bg: c.backgroundColor, sh: c.boxShadow, tr: g.getAnimations().length }); } else if (w.s.length) { w.gone = true; return; }
      requestAnimationFrame(tick);
    };
    tick();
  });
  await page.locator("#stn").click();
  await expect.poll(() => page.evaluate(() => window.__turn.gone), { timeout: 8000 }).toBe(true);
  await expect(page.locator("#path .tstop")).toBeVisible();
  const s = await page.evaluate(() => window.__turn.s);
  // the stop's bullet is a paper-colored ring: as the ghost turns into it, its line grows from nothing, so the diamond is never an empty paper-colored shape
  const ring = (x) => { const m = /\s(\d+(?:\.\d+)?)px inset$/.exec(x.sh); return m ? parseFloat(m[1]) : 0; };      // computed: "rgb(...) 0px 0px 0px 1.8px inset"
  const turning = s.filter((x) => x.tr > 0);
  expect(turning.length, "the turn was seen").toBeGreaterThan(3);
  const lines = turning.map(ring);
  expect(lines[lines.length - 1], "at the end of the turn the copy has the ring's line, so the real ring replaces it unseen").toBeGreaterThan(1);
  expect(lines, "the line grows as the diamond fills with paper").toEqual([...lines].sort((a, b) => a - b));
});
