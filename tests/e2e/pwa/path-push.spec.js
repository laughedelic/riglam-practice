// The ways of taking a station on the Path that are the default (src/app/path/push.ts, scan.tsx, foot.ts): `ride: push`, where the page rises with the station while it is held over its
// curb and, let go, keeps rising and leaves through the top ahead of it (a syllogism keeps its statement and the result opens under it), `check: morph`, where the examples' page moves
// into the result's instead of being swapped for it, and the look's `foot`: what is at the foot while the station is away. The squeeze and the scan are path-take.spec.js and path-scan.spec.js.
import { test, expect } from "../../support/test.js";

test.use({ reducedMotion: "no-preference" });

const onPath = () => {
  if (localStorage.getItem("rd-design") === null) localStorage.setItem("rd-design", "path");
  window.__riglamTest = (t) => { window.__t = t; };
  window.__vib = []; navigator.vibrate = (v) => { window.__vib.push(v); return true; };
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
  await expect(page.locator("#path .tkd, #path .pk-f, #path .pk-gone, #path .morphed, #path .mnew, #path .pscan, #path .pk-ghost, #path .fw-sd, #path .fw-th")).toHaveCount(0);
  await expect(main(page)).not.toHaveClass(/\bfw-wait\b/);
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
  await look(page, { ride: "push" });
  await page.addInitScript(onPath);
  await page.goto("/");
  await expect(choices(page)).toHaveCount(5);
  await page.locator(".tstn").click();
  await page.getByRole("dialog", { name: "Roadmap" }).getByRole("button", { name: /^Syllogisms/ }).click();
  await expect(page.locator(".ptb-t")).toContainText("Syllogisms");
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

/** What is at the foot, every frame of a ride: the copy of the next station and the thread to it, the foot's real station, and whether the scanner or the ghost is on the page. */
const watchFoot = (page) => page.evaluate(() => {
  const w = (window.__fw = { sd: 0, th: 0, thH: 0, pre: false, words: "", wait: 0, hidden: 0, real: 0, scan: 0, scanReal: 0, ghost: 0 });
  const tick = () => {
    const sd = document.querySelector("#path .fw-sd"), th = document.querySelector("#path .fw-th"), m = document.querySelector("#path .main"), real = document.querySelector("#path .foot .stn");
    if (sd) { w.sd++; w.pre = !!sd.querySelector(".go.pre"); w.words = w.words || (sd.querySelector(".gol b") || {}).textContent || ""; }
    if (th) { w.th++; w.thH = Math.max(w.thH, th.getBoundingClientRect().height); }
    if (m.classList.contains("fw-wait")) { w.wait++; if (real && getComputedStyle(real).visibility === "hidden") w.hidden++; }
    if (real && getComputedStyle(real).visibility !== "hidden" && !real.classList.contains("scanning") && /Next/.test(real.textContent)) { w.real++; if (document.querySelector("#path .pscan")) w.scanReal++; }
    if (document.querySelector("#path .pscan")) w.scan++;
    if (document.querySelector("#path .pk-ghost")) w.ghost++;
    requestAnimationFrame(tick);
  };
  tick();
});

test("foot: thread, the next station is born at the foot as the station rises, the thread is whole between them, and the next page's own takes the copy's place", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await look(page, { foot: "thread", check: "ride" });
  await toResult(page);
  await watchFoot(page);
  await page.locator("#stn").click();
  await expect(main(page)).toHaveClass(/\bpk-run\b/);
  await expect(page.locator("#path .fw-sd"), "the next station is at the foot").toHaveCount(1, { timeout: 3000 });
  await expect(page.locator("#path .sechead")).toBeVisible({ timeout: 5000 });
  await expect(main(page)).not.toHaveClass(/\bpk-run\b/);
  await expectClean(page);
  const w = await page.evaluate(() => window.__fw);
  expect(w.sd, "the copy was there for frames").toBeGreaterThan(5);
  expect(w.pre, "a question's station is the gray one").toBe(true);
  expect(w.words, "and has no words yet").toBe("");
  expect(w.thH, "the thread reached up from it to the station").toBeGreaterThan(150);
  expect(w.wait, "the foot was never left empty").toBe(0);
  await expect(page.locator("#path .foot .stn")).toBeVisible();
  expect(errors).toEqual([]);
});

test("foot: thread, a syllogism's Result has the next station, by name, at the foot while the result's node comes out of it", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await look(page, { foot: "thread" });
  await page.addInitScript(onPath);
  await page.goto("/");
  await expect(choices(page)).toHaveCount(5);
  await page.locator(".tstn").click();
  await page.getByRole("dialog", { name: "Roadmap" }).getByRole("button", { name: /^Syllogisms/ }).click();
  await expect(page.locator(".ptb-t")).toContainText("Syllogisms");
  expect(await page.evaluate(() => { for (let i = 0; i < 600; i++) { if (window.__t.cur.c.answer === "pervasion") return true; window.__t.next(); } return false; })).toBe(true);
  await choices(page).filter({ hasText: "There is no pervasion" }).first().click();
  await expect(page.locator("#sylex")).toBeVisible();
  await page.locator("#sylex").blur();
  await watchFoot(page);
  await page.locator("#stn").click();
  await expect(page.locator(".pvline")).toBeVisible({ timeout: 5000 });
  await expect(main(page)).not.toHaveClass(/\b(tk-in|pk-run)\b/);
  await expectClean(page);
  const w = await page.evaluate(() => window.__fw);
  expect(w.sd).toBeGreaterThan(5);
  expect(w.pre, "the next station is a station, not the gray one").toBe(false);
  expect(w.words, "its name is known").toBe("Next");
  expect(w.thH).toBeGreaterThan(100);
  await expect(page.locator("#stn")).toContainText("Next");
  expect(errors).toEqual([]);
});

test("foot: after, the foot shows nothing while the station is away, and the next station comes in once the step has landed", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await look(page, { foot: "after", check: "ride" });
  await toResult(page);
  await watchFoot(page);
  await page.locator("#stn").click();
  await expect(main(page)).toHaveClass(/\bpk-run\b/);
  await expect(page.locator("#path .sechead")).toBeVisible({ timeout: 5000 });
  await expect(main(page)).not.toHaveClass(/\bpk-run\b/);
  await expectClean(page);
  const w = await page.evaluate(() => window.__fw);
  expect(w.sd + w.th, "no copy of the next station and no thread to it").toBe(0);
  expect(w.wait, "the foot waited for the step").toBeGreaterThan(5);
  expect(w.hidden, "and showed no station while it did").toBe(w.wait);
  await expect(page.locator("#path .foot .stn")).toBeVisible();
  expect(errors).toEqual([]);
});

test("foot: after, the Check's scanner leaves an empty foot, and Next pair comes in once it is the result's node", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await look(page, { foot: "after" });
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
  expect(w.scanReal, "and Next pair was not at the foot while it was").toBe(0);
  expect(w.real, "it came in after").toBeGreaterThan(3);
  expect(errors).toEqual([]);
});
