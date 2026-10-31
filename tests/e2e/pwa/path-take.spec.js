// Taking a station on the Path (src/app/path/take.ts, gesture.ts): the station is pulled over a curb (it sticks at it, goes over with a knock, and the page folds; pulled
// back it unfolds), let go over it the old page's lines squeeze up into its top bullet and leave through the top while the station rides up the thread, and the next step comes
// in; a tap or Enter plays the same ride. The rules of the practice are the other specs'.
import { test, expect } from "../../support/test.js";

test.use({ reducedMotion: "no-preference" });

const onPath = () => {
  if (localStorage.getItem("rd-start") === null) localStorage.setItem("rd-start", "exercise");
  if (localStorage.getItem("rd-look") === null) localStorage.setItem("rd-look", JSON.stringify({ ride: "fold" }));   // the squeeze ride, which this spec is about (the push is the default: path-push.spec.js)
  window.__vib = []; navigator.vibrate = (v) => { window.__vib.push(v); return true; };
  // the page tells a finger from a mouse (state.hand: its knocks are for a finger); Playwright's mouse is made to read as a finger here, `window.__pointer = "mouse"` as a mouse again
  Object.defineProperty(PointerEvent.prototype, "pointerType", { get: () => window.__pointer || "touch", configurable: true });
};
const choices = (page) => page.locator("#path .chs .crow");
const main = (page) => page.locator("#path .main");

/** To the result of a pair (taking the Check station with a tap, which is a ride too), where the station reads Next pair. */
async function toResult(page) {
  await page.addInitScript(onPath);
  await page.goto("/");
  await expect(choices(page)).toHaveCount(5);
  await choices(page).first().click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (let i = 0; i < 4 && (await field.isVisible()); i++) { await field.fill("thing " + (i + 1)); if ((await field.getAttribute("enterkeyhint")) === "done") { await field.blur(); break; } await field.press("Enter"); }   // (the last one is left without Enter, which would take the Check at once)
  await page.locator("#stn").click();
  await expect(page.locator(".pvline")).toBeVisible();
  await expect(page.locator("#stn")).toContainText("Next pair");
  await expect(main(page)).not.toHaveClass(/\b(tk-in|sc-in|sc-hand|fw-wait)\b/);      // the Next station comes in once the scan has landed
  await page.evaluate(() => { window.__vib = []; });   // (the choice taken on the way here knocked)
}
/** The station's mouse pull: down on it, then up by each of `ds` (px above where it started). */
async function pull(page, ds) {
  const b = await page.locator("#stn").boundingBox(), x = b.x + 20, y = b.y + b.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  for (const d of ds) await page.mouse.move(x, y - d, { steps: 3 });
  return { x, y };
}
const rise = (page) => page.locator("#stn").evaluate((e) => -new DOMMatrix(getComputedStyle(e).transform).m42);
const folded = (page) => page.locator("#path .tkf").count();
const noteH = (page) => page.locator("#path .pathc .xnote").first().evaluate((e) => e.offsetHeight);
/** Nothing of a take is left on the page. */
async function expectClean(page) {
  await expect(main(page)).not.toHaveClass(/\btk-(run|in)\b/);
  await expect(page.locator("#path [data-tk], #path .tkd")).toHaveCount(0);
  expect(await page.locator("#path .pathc > *").evaluateAll((l) => l.filter((e) => e.style.getPropertyValue("--sy")).length), "no squeeze left on the page").toBe(0);
  expect(await page.locator("#stn, #stnp").first().evaluate((e) => e.style.transform), "the station is where it belongs").toBe("");
  await expect(page.locator(".pa")).not.toHaveClass(/\bpulling\b/);
}

test("the station sticks at the curb, goes over it with a knock and the page folds; pulled back it unfolds, and let go under the curb nothing is taken", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await toResult(page);
  expect(await noteH(page), "the notes under the cases show").toBeGreaterThan(10);
  const { x, y } = await pull(page, [15, 30, 42, 50]);
  expect(await rise(page), "it rises with the finger at first and then sticks at the curb").toBeLessThan(46);
  expect(await rise(page)).toBeGreaterThan(30);
  expect(await folded(page)).toBe(0);
  expect(await page.evaluate(() => window.__vib), "no knock yet").toEqual([]);
  await page.mouse.move(x, y - 75, { steps: 3 });
  await page.mouse.move(x, y - 110, { steps: 3 });
  await expect.poll(() => page.evaluate(() => window.__vib)).toEqual([12]);   // over the curb: one knock
  await expect.poll(() => folded(page)).toBeGreaterThan(0);
  await expect.poll(() => noteH(page)).toBe(0);                              // the page is folded: the notes under the cases are gone, the lines stay
  await expect(page.locator("#path .pathc .exr .lab").first()).toBeVisible();
  // pulled back under the curb: a lighter tick and the page unfolds
  const r = await rise(page);
  await page.mouse.move(x, y, { steps: 12 });
  await expect.poll(() => page.evaluate(() => window.__vib)).toEqual([12, 6]);
  await expect.poll(() => folded(page)).toBe(0);
  await expect.poll(() => noteH(page)).toBeGreaterThan(10);
  expect(r, "it was riding free over the curb").toBeGreaterThan(50);
  await page.mouse.up();
  await expect(page.locator("#stn")).toBeVisible();
  await expect.poll(() => rise(page)).toBeLessThan(1);
  await expect(page.locator(".pvline"), "nothing was taken").toBeVisible();
  await expectClean(page);
  expect(errors).toEqual([]);
});

test("let go over the curb the lines squeeze up and leave, the station rides up, and the next step comes in", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await toResult(page);
  await pull(page, [30, 45, 70, 110]);
  await expect.poll(() => folded(page)).toBeGreaterThan(0);
  await page.mouse.up();
  await expect(main(page)).toHaveClass(/\btk-run\b/);
  // the lines squeeze (the verdict thins out while it rises to the top bullet), and the station rides up behind them
  await expect.poll(() => page.locator("#path .pvline").evaluate((e) => e.getBoundingClientRect().height)).toBeLessThan(10);
  await expect.poll(() => rise(page)).toBeGreaterThan(200);
  expect(await page.locator("#path .pathc > [data-tk=head]").count(), "the first part is the bullet that leaves").toBe(1);
  // then the step goes on: the next pair is asked
  await expect(page.locator("#path .sechead")).toBeVisible({ timeout: 4000 });
  await expect(choices(page)).toHaveCount(5);
  await expect.poll(() => page.locator(".pa").evaluate((e) => e.classList.contains("pulling") || !!document.querySelector("#path .tk-run"))).toBe(false);
  await expectClean(page);
  expect(errors).toEqual([]);
});

test("a tap and Enter take the station with the same ride", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rd-look", JSON.stringify({ ride: "fold", check: "ride" })));   // the Check moves in by default (path-push.spec.js)
  await toResult(page);
  await page.locator("#stn").click();
  await expect(main(page)).toHaveClass(/\btk-run\b/);
  await expect(page.locator("#path .sechead")).toBeVisible({ timeout: 4000 });
  await expectClean(page);
  // the next pair, answered to the Check station, taken with Enter
  await choices(page).first().click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (let i = 0; i < 4 && (await field.isVisible()); i++) { await field.fill("thing " + (i + 1)); if ((await field.getAttribute("enterkeyhint")) === "done") { await field.blur(); break; } await field.press("Enter"); }
  await page.locator("#stn").focus();
  await page.keyboard.press("Enter");
  await expect(main(page)).toHaveClass(/\btk-run\b/);
  await expect(page.locator(".pvline")).toBeVisible({ timeout: 4000 });
  await expectClean(page);
});

test("nothing else is taken while the ride plays, and a second tap does not play it again", async ({ page }) => {
  await toResult(page);
  await page.locator("#stn").click();
  await expect(main(page)).toHaveClass(/\btk-run\b/);
  await page.locator("#stn").click({ force: true, noWaitAfter: true }).catch(() => {});
  await expect(page.locator("#path .sechead")).toBeVisible({ timeout: 4000 });
  await expect(choices(page)).toHaveCount(5);   // one step on, not two (a second take would have gone on to the examples)
  await expectClean(page);
});

test("a tap on the station knocks once as it is taken, the commitment a pull feels at the curb; a click of a mouse knocks not at all", async ({ page }) => {
  await toResult(page);
  await page.locator("#stn").click();   // Next pair, tapped (a finger: toResult's init script)
  await expect(choices(page)).toHaveCount(5);
  expect(await page.evaluate(() => window.__vib), "one knock for the tap").toEqual([12]);
  await page.evaluate(() => { window.__pointer = "mouse"; window.__vib = []; });
  await choices(page).first().click();   // a mouse takes a choice (no knock) ...
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (let i = 0; i < 4 && (await field.isVisible()); i++) { await field.fill("thing " + (i + 1)); if ((await field.getAttribute("enterkeyhint")) === "done") { await field.blur(); break; } await field.press("Enter"); }
  await page.locator("#stn").click();   // ... and the Check
  await expect(page.locator(".pvline")).toBeVisible();
  await expect(page.locator("#stn")).toContainText("Next pair");
  await expect(main(page)).not.toHaveClass(/\b(tk-in|sc-in|sc-hand|fw-wait)\b/);
  await page.locator("#stn").click();   // ... and Next pair
  await expect(choices(page)).toHaveCount(5);
  expect(await page.evaluate(() => window.__vib), "a mouse has its own click: no knock").toEqual([]);
});

test("with the look's ride: plain the step is there at once, and the pull is the old one", async ({ browser }, info) => {
  const ctx = await browser.newContext({ ...info.project.use, reducedMotion: "no-preference" });
  const page = await ctx.newPage();
  await page.addInitScript(() => { localStorage.setItem("rd-look", JSON.stringify({ ride: "plain" })); });
  await page.addInitScript(onPath);
  await page.goto("/");
  await expect(choices(page)).toHaveCount(5);
  await choices(page).first().click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (let i = 0; i < 4 && (await field.isVisible()); i++) { await field.fill("thing " + (i + 1)); if ((await field.getAttribute("enterkeyhint")) === "done") { await field.blur(); break; } await field.press("Enter"); }
  await page.locator("#stn").click();
  await expect(page.locator(".pvline")).toBeVisible();
  expect(await page.locator("#path .main.tk-run").count(), "no ride").toBe(0);
  const b = await page.locator("#stn").boundingBox();
  await page.mouse.move(b.x + 20, b.y + b.height / 2); await page.mouse.down();
  await page.mouse.move(b.x + 20, b.y + b.height / 2 - 40, { steps: 4 });
  await page.mouse.move(b.x + 20, b.y + b.height / 2 - 110, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator("#path .sechead")).toBeVisible();
  expect(await page.locator("#path .main.tk-run").count(), "no ride").toBe(0);
  await ctx.close();
});

test("under reduced motion the step is there at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await toResult(page);
  await page.locator("#stn").click();
  await expect(page.locator("#path .sechead")).toBeVisible();
  expect(await page.locator("#path .main.tk-run").count()).toBe(0);
});
