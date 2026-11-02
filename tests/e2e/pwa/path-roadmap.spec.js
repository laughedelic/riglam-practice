// The roadmap and the way between it and the exercises on the Path: the roadmap lies under the exercise, which slides away to the right on the back chevron and
// comes back in from the right on Continue, with one motion for both (the system Back, which the browser animates itself, only changes the screen); the system
// Back from an exercise always has the roadmap behind it; the graph of the stops.
import { test, expect } from "../../support/test.js";

const setup = () => {
  window.__riglamTest = (t) => { window.__t = t; };

};
const choices = (page) => page.locator("#path .chs .crow");
const road = (page) => page.getByRole("dialog", { name: "Roadmap" });
const lay = (page) => page.locator("#path .lay");
/** The exercise layer's left edge, from the column's (the column is 600 px at most and centered on a wide screen), and the column's width. */
const layX = (page) => lay(page).evaluate((n) => n.getBoundingClientRect().x - n.parentElement.getBoundingClientRect().x - n.parentElement.clientLeft);
const colW = (page) => page.locator("#path .pcol").evaluate((n) => n.clientWidth);
const level = (page) => page.evaluate(() => (history.state && history.state.riglamNav) || 0);
/** Back to the exercise under the roadmap by its stop (the one marked "here"): "Continue" is there only when that exercise has an attempt under way. */
const resume = (page) => road(page).locator("[aria-current=page]").click();

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
  await resume(page);
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
  await resume(page);
  await expect(road(page)).toBeHidden();
  // the swipe from the edge: the browser has animated the screen away itself, so the page does not slide it again
  await page.evaluate(() => Object.defineProperty(PopStateEvent.prototype, "hasUAVisualTransition", { get: () => true }));
  await page.locator(".tstn").click();
  await expect(road(page)).toBeVisible();
  await resume(page);
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
  await choices(page).first().click();   // a relation picked: the attempt has begun, so there is something to continue
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

test("Continue is offered only when the exercise under the roadmap has an attempt to continue", async ({ page }) => {
  await start(page);
  const go = road(page).getByRole("button", { name: "Continue", exact: true });   // exact: a stop with an attempt waiting is named "..., continue"
  await page.locator(".tstn").click();
  await expect(road(page)).toBeVisible();
  await expect(go, "a pair only drawn, as when the app is opened the first time: nothing to continue").toHaveCount(0);
  await resume(page);   // its stop goes in
  await expect(road(page)).toBeHidden();
  await choices(page).first().click();   // a relation picked: the attempt has begun
  await page.locator(".tstn").click();
  await expect(go, "an attempt under way").toBeVisible();
  await go.click();
  await expect(road(page)).toBeHidden();
  // another exercise opened from the roadmap has only a pair drawn: its own roadmap has no Continue, and the exercise left in the middle says "continue" on its stop
  await page.locator(".tstn").click();
  await road(page).getByRole("button", { name: /^Find a pair/ }).click();
  await expect(road(page)).toBeHidden();
  await expect(page.locator(".ptb-t")).toContainText("Find a pair");
  await page.locator(".tstn").click();
  await expect(road(page)).toBeVisible();
  await expect(go, "the exercise under the roadmap has nothing begun").toHaveCount(0);
  await expect(road(page).getByRole("button", { name: /^Relations, continue/ }), "the one left in the middle is marked").toBeVisible();
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

const heading = (page) => page.locator("#path .lay .ptb-t");
test("Settings and Review opened from the roadmap go back to it, by the system Back and by their own way back; Settings from the exercise's options goes back to the exercise", async ({ page }) => {
  await start(page);
  await page.locator(".tstn").click();
  await expect(road(page)).toBeVisible();
  await expect.poll(() => level(page)).toBe(0);
  await road(page).getByRole("button", { name: "Settings" }).click();
  await expect(heading(page)).toHaveText("Settings");
  await expect.poll(() => level(page), "Settings stands right over the roadmap").toBe(1);
  await page.goBack();
  await expect(road(page)).toBeVisible();
  await expect.poll(() => level(page)).toBe(0);
  await road(page).getByRole("button", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Back to the roadmap", exact: true }).click();   // the top bar's chevron
  await expect(road(page)).toBeVisible();
  await expect.poll(() => level(page)).toBe(0);
  await road(page).getByRole("button", { name: /^Review/ }).click();
  await expect(heading(page)).toHaveText("Review");
  await expect.poll(() => level(page)).toBe(1);
  await page.goBack();
  await expect(road(page)).toBeVisible();
  await expect.poll(() => level(page)).toBe(0);
  await resume(page);
  await expect(choices(page)).toHaveCount(5);
  await page.getByRole("button", { name: "Practice options" }).click();
  await page.getByRole("button", { name: "Other app settings: more" }).click();
  await expect(heading(page)).toHaveText("Settings");
  await page.goBack();
  await expect(choices(page), "back to the exercise it was opened from").toHaveCount(5);
  await expect(road(page)).toBeHidden();
  await page.goBack();
  await expect(road(page)).toBeVisible();
});

test("a start on an exercise before anything has touched the page keeps a close watcher for the system Back, which goes to the roadmap", async ({ page }) => {
  await start(page);
  await expect.poll(() => page.evaluate(() => !!window.__t.navGuard), "Chrome would skip the roadmap's entry: the watcher takes the Back").toBe(true);
  // Escape is heard by the watcher too, and by the keys, which have nothing to close on an exercise: the exercise stays, and the watcher with it
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  await expect(road(page)).toBeHidden();
  await expect.poll(() => page.evaluate(() => !!window.__t.navGuard)).toBe(true);
  await page.evaluate(() => window.__t.navGuard.requestClose());
  await expect(road(page)).toBeVisible();
  await expect.poll(() => level(page)).toBe(0);
  await expect.poll(() => page.evaluate(() => !!window.__t.navGuard), "nothing left to close: the next Back leaves the app").toBe(false);
});

test("in the installed app Back on the roadmap first says \"Back again to close\", and only a second Back while it says so leaves; in a browser tab it leaves at once", async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(navigator, "standalone", { get: () => true }));
  await start(page);
  await page.locator(".tstn").click();
  await expect(road(page)).toBeVisible();
  const armed = () => page.evaluate(() => !!window.__t.navGuard);
  await expect.poll(armed, "a close watcher waits on the roadmap").toBe(true);
  await page.evaluate(() => window.__t.navGuard.requestClose());
  await expect(road(page).getByRole("status").filter({ hasText: "Back again to close" })).toBeVisible();
  expect(await armed(), "while it says so, nothing holds the next Back").toBe(false);
  expect(await level(page)).toBe(0);
  await expect(road(page).getByText("Back again to close")).toBeHidden({ timeout: 5000 });
  await expect.poll(armed, "then the watcher waits again").toBe(true);
  // an exercise opened from the roadmap has the roadmap's entry under it, so the watcher gives way to the history
  await resume(page);
  await expect.poll(armed).toBe(false);
});

test("in a browser tab Back on the roadmap leaves with no question", async ({ page }) => {
  await start(page);
  await page.locator(".tstn").click();
  await expect(road(page)).toBeVisible();
  await expect.poll(() => level(page)).toBe(0);
  expect(await page.evaluate(() => !!window.__t.navGuard)).toBe(false);
});

test("the app keeps to the part of the screen that can be seen, also when the browser says it is shorter only after the page has loaded (as after an update's reload)", async ({ page }) => {
  // the visible area turns 64 px shorter than the window a moment after the start, with no event (less than a keyboard: the app used to follow only that)
  await page.addInitScript(() => {
    const t0 = Date.now(), d = Object.getOwnPropertyDescriptor(VisualViewport.prototype, "height");
    Object.defineProperty(VisualViewport.prototype, "height", { configurable: true, get() { const h = d.get.call(this); return Date.now() - t0 > 600 ? h - 64 : h; } });
  });
  await start(page);
  const shown = await page.evaluate(() => innerHeight - 64);
  const bottom = (sel) => page.locator(sel).first().evaluate((n) => n.getBoundingClientRect().bottom);
  await expect.poll(() => bottom("#path .pa"), "the app's root ends where the visible area does").toBe(shown);
  expect(await bottom("#path .main .foot"), "the next stop is on the screen").toBeLessThanOrEqual(shown);
  await page.locator(".tstn").click();
  await expect(road(page)).toBeVisible();
  expect(await bottom("#path .rfoot"), "the roadmap's foot, with the version, is on the screen").toBeLessThanOrEqual(shown);
});
