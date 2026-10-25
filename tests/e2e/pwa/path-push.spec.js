// The look's other ways of taking a station on the Path (src/app/path/push.ts, scan.tsx): `ride: push`, where the page rises with the station while it is held over its curb
// and, let go, keeps rising and leaves through the top ahead of it (a syllogism keeps its statement and the result opens under it), and `check: morph`, where the examples' page
// moves into the result's instead of being swapped for it. The squeeze and the scan, which are the default, are path-take.spec.js and path-scan.spec.js.
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
  await expect(page.locator("#path .tkd, #path .pk-f, #path .pk-gone, #path .morphed, #path .mnew, #path .pscan")).toHaveCount(0);
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

test("ride: push, a tap takes the station with the same ride", async ({ page }) => {
  await look(page, { ride: "push", check: "ride" });
  await toResult(page);
  await page.locator("#stn").click();
  await expect(main(page)).toHaveClass(/\bpk-run\b/);
  await expect(page.locator("#path .sechead")).toBeVisible({ timeout: 5000 });
  await expect(choices(page)).toHaveCount(5);
  await expectClean(page);
});

test("ride: push, a syllogism's Result leaves the statement where it is, folds what is under it, and the result opens there", async ({ page }) => {
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
  await page.locator("#stn").click();
  await expect(main(page)).toHaveClass(/\bpk-keep\b/);
  await expect.poll(() => page.locator("#path .pathc .pk-gone").count(), "the heading fades").toBeGreaterThan(0);
  await expect.poll(() => page.locator("#path .pathc .pk-f").count(), "what is under the statement folds into it").toBeGreaterThan(0);
  const mid = await stm.first().boundingBox();
  expect(Math.abs(mid.y - top.y), "the statement stays where it is").toBeLessThan(2);
  expect(await stm.first().evaluate((e) => Number(getComputedStyle(e).opacity)), "and is seen").toBeGreaterThan(0.9);
  await expect(page.locator(".pvline")).toBeVisible({ timeout: 5000 });
  await expect(page.locator("#path .pathc .stm"), "the result shows the statement once").toHaveCount(3);
  await expect(page.locator("#stn")).toContainText("Next");
  await expectClean(page);
  expect(errors).toEqual([]);
});

test("check: morph, the result's node and word are not drawn twice, and the result's page is where the examples' was; nothing is left on it", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await look(page, { check: "morph" });
  await toCheck(page);
  await page.locator("#stn").click();
  await expect(main(page)).toHaveClass(/\bsc-run\b/);
  // the page is swapped for the result's while the scanner is still the node: the page's own node and word wait for it
  await page.waitForFunction(() => document.querySelector(".pvline") && document.querySelector(".pscan"), null, { polling: "raf", timeout: 8000 });
  expect(await page.locator("#path .pvline .ptx").evaluate((e) => getComputedStyle(e).visibility), "the result's word waits for the scanner").toBe("hidden");
  await expect(page.locator(".pvline .ptx")).toBeVisible({ timeout: 4000 });
  await expect(page.locator("#stn")).toContainText("Next pair");
  await expectClean(page);
  await expect(page.locator("#path .pathc .exr")).not.toHaveCount(0);
  expect(errors).toEqual([]);
});
