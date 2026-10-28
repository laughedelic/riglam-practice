// The roadmap and the way between it and the exercises on the Path: the roadmap lies under the exercise, which slides away to the right on the back chevron and
// comes back in from the right on Continue, with one motion for both (the system Back, which the browser animates itself, only changes the screen); the system
// Back from an exercise always has the roadmap behind it; the graph of the stops.
import { test, expect } from "../../support/test.js";

const setup = () => {
  window.__riglamTest = (t) => { window.__t = t; };
  if (localStorage.getItem("rd-design") === null) localStorage.setItem("rd-design", "path");
};
const choices = (page) => page.locator("#path .chs .crow");
const road = (page) => page.getByRole("dialog", { name: "Roadmap" });
const lay = (page) => page.locator("#path .lay");
/** The exercise layer's left edge, from the column's (the column is 600 px at most and centered on a wide screen), and the column's width. */
const layX = (page) => lay(page).evaluate((n) => n.getBoundingClientRect().x - n.parentElement.getBoundingClientRect().x - n.parentElement.clientLeft);
const colW = (page) => page.locator("#path .pcol").evaluate((n) => n.clientWidth);
const level = (page) => page.evaluate(() => (history.state && history.state.riglamNav) || 0);

async function start(page) {
  await page.addInitScript(setup);
  await page.goto("/");
  await expect(choices(page)).toHaveCount(5);
}

test("the system Back from an exercise opens the roadmap, and Back from the roadmap leaves the app", async ({ page }) => {
  await start(page);
  await expect.poll(() => level(page)).toBe(1);
  await page.goBack();
  await expect(road(page)).toBeVisible();
  await expect.poll(() => level(page)).toBe(0);
  await page.goBack();
  await expect.poll(() => page.url()).toBe("about:blank");
});

test("after a reload on an exercise the system Back still opens the roadmap", async ({ page }) => {
  await start(page);
  await page.reload();
  await expect(choices(page)).toHaveCount(5);
  await page.goBack();
  await expect(road(page)).toBeVisible();
});

test("the back chevron slides the exercise away to the right over the roadmap, and Continue slides it back in from the right", async ({ page }) => {
  await start(page);
  const x = () => layX(page);
  const roadX = () => page.locator("#path .road").evaluate((n) => n.getBoundingClientRect().x - n.parentElement.getBoundingClientRect().x - n.parentElement.clientLeft);
  expect(await x()).toBe(0);
  await page.locator(".tstn").click();
  const seen = [];
  for (let i = 0; i < 8; i++) { seen.push(await x()); await page.waitForTimeout(40); }
  expect(Math.max(...seen), "the exercise moves right, it is not cut away").toBeGreaterThan(0);
  await expect(road(page)).toBeVisible();
  await expect.poll(async () => (await x()) >= (await colW(page)) - 1, "it goes out of the screen").toBe(true);
  await expect.poll(roadX, "the roadmap comes to its place under it").toBe(0);
  await expect(lay(page)).toBeHidden();
  const before = await page.locator("#path .qst, #path .chs").first().textContent();
  await road(page).getByRole("button", { name: "Continue" }).click();
  const back = [];
  for (let i = 0; i < 8; i++) { back.push(await x()); await page.waitForTimeout(40); }
  expect(Math.min(...back.filter((v) => v > 0)), "it comes back in over the roadmap from the right").toBeLessThan(await colW(page));
  await expect.poll(x).toBe(0);
  await expect(road(page)).toBeHidden();
  await expect(choices(page)).toHaveCount(5);
  expect(await page.locator("#path .qst, #path .chs").first().textContent(), "the same screen").toBe(before);
});

test("the system Back plays the same slide when the browser has not animated it, and only changes the screen when it has", async ({ page }) => {
  await start(page);
  const x = () => layX(page);
  const wide = await colW(page);
  // the Back key or button: the browser shows nothing, the page slides the exercise away as it does for the chevron
  await page.goBack();
  const seen = [];
  for (let i = 0; i < 8; i++) { seen.push(await x()); await page.waitForTimeout(40); }
  expect(seen.some((v) => v > 0 && v < wide - 1), "it moved in steps, not at once").toBe(true);
  await expect(road(page)).toBeVisible();
  await expect.poll(x).toBeGreaterThanOrEqual(wide - 1);
  await road(page).getByRole("button", { name: "Continue" }).click();
  await expect(road(page)).toBeHidden();
  // the swipe from the edge: the browser has animated the screen away itself, so the page does not slide it again
  await page.evaluate(() => Object.defineProperty(PopStateEvent.prototype, "hasUAVisualTransition", { get: () => true }));
  await page.locator(".tstn").click();
  await expect(road(page)).toBeVisible();
  await road(page).getByRole("button", { name: "Continue" }).click();
  await expect(road(page)).toBeHidden();
  await page.goBack();
  await expect(road(page)).toBeVisible();
  expect(await x(), "already out of the way, no motion of its own").toBeGreaterThanOrEqual(wide - 1);
  await page.goForward().catch(() => {});
});

test("there is no slide from the top: the roadmap has no pull-down and the practice options keep their own", async ({ page }) => {
  await start(page);
  const kinds = await page.evaluate(() => [...document.styleSheets].flatMap((s) => [...s.cssRules]).filter((r) => r.selectorText && /(^|[ ,])\.pa \.road(\.on)?$/.test(r.selectorText)).map((r) => r.style.transform));
  expect(kinds.join(" "), "the roadmap waits at the left, never above").not.toMatch(/translateY/);
});

test("Continue is a full-size link above the foot, on the right, and is not on a screen without an exercise to go back to", async ({ page }) => {
  await start(page);
  await page.locator(".tstn").click();
  await expect.poll(() => page.locator("#path .road").evaluate((n) => Math.round(n.getBoundingClientRect().x - n.parentElement.getBoundingClientRect().x - n.parentElement.clientLeft)), "the roadmap has come to its place").toBe(0);
  const go = road(page).getByRole("button", { name: "Continue" });
  const [b, foot, col] = await Promise.all([go.boundingBox(), page.locator("#path .rfoot").boundingBox(), page.locator("#path .pcol").boundingBox()]);
  expect(b.height).toBeGreaterThanOrEqual(44);
  expect(b.y + b.height, "above the bottom panel").toBeLessThanOrEqual(foot.y + 1);
  expect(b.x + b.width, "on the right").toBeGreaterThan(col.x + col.width - 40);
  await expect(go).toHaveText("Continue");
  await road(page).getByRole("button", { name: /^Pervasions/ }).click();
  await expect(road(page)).toBeHidden();
  await expect(page.locator(".ptb-t")).toContainText("Pervasions");
});

test("the roadmap graph: Syllogisms between the two rows, Debate tied to all three branches, and the path goes on from it, fading", async ({ page }) => {
  await start(page);
  await page.locator(".tstn").click();
  const tree = road(page).locator("svg.tree");
  await expect(tree).toBeVisible();
  const geo = await tree.evaluate((svg) => {
    const at = (name) => { const t = [...svg.querySelectorAll("text.en")].find((n) => n.textContent === name); return t.getBBox(); };
    const ends = (p) => { const a = p.getPointAtLength(0), z = p.getPointAtLength(p.getTotalLength()); return { a: [Math.round(a.x), Math.round(a.y)], z: [Math.round(z.x), Math.round(z.y)] }; };
    const dashed = [...svg.querySelectorAll("path.lnp:not(.fade)")].map(ends);
    const fade = svg.querySelector("path.lnp.fade");
    const debate = svg.querySelector("polygon.nd.plan").getBBox();
    const cont = svg.querySelector("text.cont") ? svg.querySelector("text.cont").getBBox() : null;
    let onText = 0;
    for (const t of svg.querySelectorAll("text")) { const r = t.getBBox(); for (const p of svg.querySelectorAll("path.ln,path.lnp")) for (let d = 0; d < p.getTotalLength(); d += 1) { const q = p.getPointAtLength(d); if (q.x > r.x - 2 && q.x < r.x + r.width + 2 && q.y > r.y && q.y < r.y + r.height) onText++; } }
    return { rows: { relations: at("Relations").y, instance: at("Find an instance").y, syllogisms: at("Syllogisms").y, find: at("Find a pair").y, categories: at("Categories").y }, dashed, top: [Math.round(debate.x + debate.width / 2), Math.round(debate.y)], fade: { ...ends(fade), stroke: getComputedStyle(fade).stroke }, onText, cont };
  });
  expect(geo.rows.syllogisms, "below the first row").toBeGreaterThan(geo.rows.relations + 20);
  expect(geo.rows.syllogisms, "above the second row").toBeLessThan(geo.rows.find - 20);
  expect(geo.dashed, "Pervasions, Syllogisms and Find an instance lead to Debate").toHaveLength(3);
  expect(geo.dashed.map((d) => d.a[0]).sort((p, q) => p - q), "from the three branches, left to right").toEqual([74, 195, 316]);
  for (const d of geo.dashed) expect(d.z, "all end at the top of Debate").toEqual(geo.top);
  expect(geo.fade.a[1], "a dotted path goes down from below Debate").toBeGreaterThan(geo.top[1] + 40);
  expect(geo.fade.z[1]).toBeGreaterThan(geo.fade.a[1] + 40);
  expect(geo.fade.stroke, "it fades out").toMatch(/url\(/);
  expect(geo.onText, "no line runs through a name").toBe(0);
});
