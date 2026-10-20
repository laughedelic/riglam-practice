// How the panels move (src/app/shell/motion.js, the motion block of src/app/styles/28-menu.css): the menu, the practice options, the chat and the tutor's panel slide in
// from their own side with their shade fading on the same curve and over the same time, and go the same way back from a copy of themselves; a Back the browser animated itself (the swipe from the edge),
// reduced motion and the first screen move nothing. The other specs run with reduced motion (playwright.config.js); these ask for it.
import { test, expect } from "../../support/test.js";
import { ready, openMenu, isPhone, relOptions } from "../../support/page.js";

test.use({ reducedMotion: "no-preference" });

// every CSS animation that starts, with the time and curve it was given
const watch = () => {
  window.__anims = [];
  document.addEventListener("animationstart", (e) => {
    const t = e.target, s = getComputedStyle(t);
    window.__anims.push({ name: e.animationName, on: t.id || (typeof t.className === "string" ? t.className : ""), time: s.animationDuration, curve: s.animationTimingFunction, delay: s.animationDelay });
  }, true);
};
// (the version line's spinner, which turns for as long as it checks, is not a panel)
const started = (page) => page.evaluate(() => window.__anims.filter((a) => a.name !== "vspin"));
const find = (list, name) => list.find((a) => a.name === name);
// an animation starts on the next frame after the page is in its new state, so wait for the ones asked for (and return everything that has started)
async function seen(page, ...names) {
  await expect.poll(async () => { const list = await started(page); return names.every((n) => find(list, n)); }, { message: "the animations " + names.join(", ") }).toBe(true);
  return started(page);
}
const leaving = (page) => page.locator(".leaving");
const MS = 200;

async function tutorOn(page) {
  await page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, tutor: "on" }) }));
}
async function load(page) {
  await page.addInitScript(watch);
  await page.goto("/");
  await ready(page);
  await page.evaluate(() => { window.__anims.length = 0; });
}

test("the phone's menu and its shade come in together, on one time and one curve, and leave the same way", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the shade is the phone's");
  await load(page);
  await page.locator("#menubtn").click();
  await expect(page.locator("#menu")).toBeVisible();
  const open = await seen(page, "slide-l", "m-fade");
  const panel = find(open, "slide-l"), shade = find(open, "m-fade");
  expect(panel && shade).toBeTruthy();
  expect(panel.time).toBe(shade.time);
  expect(panel.curve).toBe(shade.curve);
  expect(panel.time).toBe(`${MS / 1000}s`);
  expect(panel.on).toBe("menu");
  expect(shade.on).toBe("menuscrim");
  await expect(page.locator("#menu.enter")).toHaveCount(0); // the class goes when the motion is over
  await page.evaluate(() => { window.__anims.length = 0; });
  await page.locator("#menuscrim").click({ position: { x: 380, y: 400 } });
  // the state is closed at once, a copy of the panel and of the shade play the way out
  await expect(page.locator("#menu")).toBeHidden();
  await expect(page.locator("#app")).toHaveAttribute("data-menu", "closed");
  const out = await seen(page, "out-l", "m-fade-out");
  expect(find(out, "out-l").time).toBe(find(out, "m-fade-out").time);
  await expect(leaving(page)).toHaveCount(0, { timeout: 2000 }); // and they are removed
});

test("the copy that plays a panel out cannot be reached, read or typed into", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the phone's drawer");
  await load(page);
  await page.locator("#menubtn").click();
  await expect(page.locator("#menu")).toBeVisible();
  // read the copy in the task that makes it: it is gone again after a fifth of a second
  const copy = await page.evaluate(() => new Promise((done) => {
    const grab = () => {
      const n = document.querySelector(".menu.leaving");
      if (n) done({ inert: n.inert, hidden: n.getAttribute("aria-hidden"), ids: n.querySelectorAll("[id]").length, id: n.id, over: getComputedStyle(n).pointerEvents });
      return !!n;
    };
    document.getElementById("menuscrim").click();
    if (!grab()) { const t = setInterval(() => { if (grab()) clearInterval(t); }, 4); }
  }));
  expect(copy).toEqual({ inert: true, hidden: "true", ids: 0, id: "", over: "none" });
});

test("the copy that plays the options out stays inert when the page is redrawn around it", async ({ page }) => {
  await load(page);
  await page.locator("#msess").click();
  await expect(page.locator("#over")).toBeVisible();
  // the page redraws in the same task that makes the copy, so it is read when that task is over
  await page.evaluate(() => {
    window.__copy = null;
    new MutationObserver(() => {
      const n = document.querySelector(".over.leaving");
      if (n && !window.__copy) window.__copy = { inert: n.inert, hidden: n.getAttribute("aria-hidden") };
    }).observe(document.getElementById("app"), { childList: true, subtree: true });
  });
  await page.keyboard.press("Escape");
  await expect.poll(() => page.evaluate(() => window.__copy)).toEqual({ inert: true, hidden: "true" });
  // a redraw while the copy is still playing (switching Blitz redraws the page) leaves it inert too
  const after = await page.evaluate(() => { document.getElementById("mbz").click(); const n = document.querySelector(".over.leaving"); return n ? { inert: n.inert, hidden: n.getAttribute("aria-hidden") } : null; });
  expect(after).toEqual({ inert: true, hidden: "true" });
});

test("the practice options slide up from the bottom of a phone with their shade, and a popover unrolls under the top bar of a wide screen", async ({ page }, testInfo) => {
  await load(page);
  await page.locator("#msess").click();
  await expect(page.locator("#over")).toBeVisible();
  const open = await seen(page, isPhone(testInfo) ? "slide-u" : "curtain", "m-fade");
  const sheet = find(open, isPhone(testInfo) ? "slide-u" : "curtain"), shade = find(open, "m-fade");
  expect(sheet && shade).toBeTruthy();
  expect(sheet.time).toBe(shade.time);
  expect(sheet.curve).toBe(shade.curve);
  await page.evaluate(() => { window.__anims.length = 0; });
  await page.keyboard.press("Escape");
  await expect(page.locator("#over")).toBeHidden();
  await seen(page, isPhone(testInfo) ? "out-d" : "curtain-out", "m-fade-out");
  await expect(leaving(page)).toHaveCount(0, { timeout: 2000 });
});

test("a wide screen's menu slides in and out when it is pinned and unpinned; it starts pinned and remembers the choice", async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo), "a wide screen's menu");
  await load(page);
  await expect(page.locator("#app")).toHaveAttribute("data-menu", "pinned"); // nothing stored yet: pinned
  await page.locator("#menubtn").click(); // unpin
  await expect(page.locator("#app")).toHaveAttribute("data-menu", "closed");
  await seen(page, "out-l");
  await page.evaluate(() => { window.__anims.length = 0; });
  await page.locator("#menubtn").click(); // pin
  await expect(page.locator("#app")).toHaveAttribute("data-menu", "pinned");
  const panel = find(await seen(page, "slide-l"), "slide-l");
  expect(panel && panel.time).toBe(`${MS / 1000}s`);
  await page.locator("#menubtn").click();
  await page.reload();
  await ready(page);
  await expect(page.locator("#app")).toHaveAttribute("data-menu", "closed");
});

test("the tutor's panel slides in from the right when the chat button opens it, and out when it closes", async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo), "the phone's chat is a drawer (tutor.spec.js)");
  await tutorOn(page);
  await load(page);
  await relOptions(page).first().click();
  await page.locator("#stage .pbar .fwd").click(); // Check, with the cells left empty
  await page.evaluate(() => { window.__anims.length = 0; });
  await page.locator("#mchat").click();
  await expect(page.locator("#coach")).toBeVisible();
  await seen(page, "slide-r");
  await page.evaluate(() => { window.__anims.length = 0; });
  await page.locator("#mchat").click();
  await expect(page.locator("#coach")).toBeHidden();
  await seen(page, "out-r");
  await expect(leaving(page)).toHaveCount(0, { timeout: 2000 });
});

test("nothing moves under reduced motion, and no copy is left behind", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await load(page);
  if (isPhone(testInfo)) { await page.locator("#menubtn").click(); await expect(page.locator("#menu")).toBeVisible(); await page.locator("#menuscrim").click({ position: { x: 380, y: 400 } }); }
  await page.locator("#msess").click();
  await expect(page.locator("#over")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("#over")).toBeHidden();
  await expect(leaving(page)).toHaveCount(0);
  expect(await started(page)).toEqual([]);
});

test("a Back the browser does not animate (the key, the button) opens the menu by sliding it over the exercise", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "Back from the exercise opens the menu on a phone");
  await load(page);
  await page.goBack();
  await expect(page.locator("#menu")).toBeVisible();
  const open = await seen(page, "slide-l", "m-fade");
  expect(find(open, "slide-l").on).toBe("menu");
  expect(await page.evaluate(() => getComputedStyle(document.getElementById("menu")).position)).toBe("absolute"); // over the exercise, not beside it
});

test("a Back the browser animates itself (the swipe from the edge) moves nothing more", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "Back from the exercise opens the menu on a phone");
  // what the popstate event says of such a swipe: the browser has performed a visual transition
  await page.addInitScript(() => { Object.defineProperty(PopStateEvent.prototype, "hasUAVisualTransition", { get: () => true, configurable: true }); });
  await load(page);
  await page.goBack();
  await expect(page.locator("#menu")).toBeVisible();
  await page.waitForTimeout(100);
  expect(await started(page)).toEqual([]);
  await expect(page.locator("#menu.enter")).toHaveCount(0);
});

test("the shade is the whole screen under a drawer or a sheet, so it never stays behind as a rectangle when the panel slides away", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the shades are the phone's");
  await load(page);
  const area = () => page.evaluate(() => {
    const o = document.querySelector(".over:not(.leaving)").getBoundingClientRect(), shades = [...document.querySelectorAll(".over .scrim")].map((n) => n.getBoundingClientRect());
    return { over: [o.x, o.y, o.width, o.height], shades: shades.map((r) => [r.x, r.y, r.width, r.height]) };
  });
  await page.locator("#msess").click(); // the options: a sheet from the bottom
  await expect(page.locator("#over")).toBeVisible();
  let { over, shades } = await area();
  expect(shades).toEqual([over]);
  await page.keyboard.press("Escape");
  await expect(page.locator("#over")).toBeHidden();
  await expect(leaving(page)).toHaveCount(0, { timeout: 2000 });
  await tutorOn(page);
  await page.reload();
  await ready(page);
  await relOptions(page).first().click();
  for (let i = 0; i < 4 && (await page.locator("#cin").isVisible()); i++) { await page.fill("#cin", "thing " + (i + 1)); await page.keyboard.press("Enter"); await page.waitForTimeout(100); }
  await expect(page.locator("#mchat")).toBeEnabled();
  await page.locator("#mchat").click(); // the chat: a drawer from the right
  await expect(page.locator("#over")).toBeVisible();
  ({ over, shades } = await area());
  expect(shades).toEqual([over]);
});

test("the crimson bands at the edges of the screen stay as they are: a panel on its way in or out goes under them, never over them", async ({ page }, testInfo) => {
  // the copy that plays a panel out is kept, so the frame can be cut at the middle of the slide
  await page.addInitScript((ms) => { const st = window.setTimeout; window.setTimeout = (f, d, ...a) => st(f, d === ms ? 1e9 : d, ...a); }, MS + 200);
  await tutorOn(page);
  await load(page);
  const { width, height } = page.viewportSize();
  const band = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector(".band")).width));
  // (the pixel along the inner edge of a band is left out: the shade ends there, on a fraction of a pixel)
  const edges = async () => [await page.screenshot({ clip: { x: 0, y: 0, width: band - 1, height } }), await page.screenshot({ clip: { x: width - band + 1, y: 0, width: band - 1, height } })];
  const slideOutKeepsBands = async (what, close) => {
    await expect(page.locator(".enter")).toHaveCount(0); // at rest
    const rest = await edges();
    await close();
    await expect(leaving(page).first()).toBeAttached(); // the panel, and its shade where it has one
    await page.evaluate(() => document.getAnimations().forEach((a) => { a.pause(); a.currentTime = 100; }));
    const mid = await edges();
    expect(mid[0].equals(rest[0]), what + ": the left band is as it was").toBe(true);
    expect(mid[1].equals(rest[1]), what + ": the right band is as it was").toBe(true);
    // (cancelled, not finished: the version line's spinner never ends)
    await page.evaluate(() => { document.getAnimations().forEach((a) => a.cancel()); document.querySelectorAll(".leaving").forEach((n) => n.remove()); });
  };
  if (isPhone(testInfo)) {
    await page.locator("#menubtn").click();
    await expect(page.locator("#menu")).toBeVisible();
    await slideOutKeepsBands("the menu drawer", () => page.keyboard.press("Escape"));
    await relOptions(page).first().click();
    for (let i = 0; i < 4 && (await page.locator("#cin").isVisible()); i++) { await page.fill("#cin", "thing " + (i + 1)); await page.keyboard.press("Enter"); await page.waitForTimeout(100); }
    await page.locator("#mchat").click();
    await expect(page.locator("#over")).toBeVisible();
    await slideOutKeepsBands("the chat drawer", () => page.keyboard.press("Escape"));
  } else {
    await relOptions(page).first().click();
    await page.locator("#stage .pbar .fwd").click(); // Check, with the cells left empty
    await page.locator("#mchat").click();
    await expect(page.locator("#coach")).toBeVisible();
    await slideOutKeepsBands("the tutor's panel", () => page.locator("#mchat").click());
    await slideOutKeepsBands("the pinned menu", () => page.locator("#menubtn").click());
  }
});

test("a tap shows no highlight box, and the drawer's close button is where the menu button was", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the phone's drawer");
  await load(page);
  expect(await page.locator("#menubtn").evaluate((n) => getComputedStyle(n).webkitTapHighlightColor)).toBe("rgba(0, 0, 0, 0)");
  expect(await page.locator("#menubtn").evaluate((n) => getComputedStyle(n).userSelect)).toBe("none");
  const was = await page.locator("#menubtn").boundingBox();
  await openMenu(page);
  await expect(page.locator("#menu.enter")).toHaveCount(0); // not while it is sliding
  const now = await page.locator("#menu .mclose").boundingBox();
  for (const k of ["x", "y", "width", "height"]) expect(Math.abs(now[k] - was[k])).toBeLessThanOrEqual(1);
});
