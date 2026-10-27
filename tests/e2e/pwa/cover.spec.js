// The cover of the installed app (src/pwa/cover.html, cover.ts): drawn from the first paint with the figure, the name and the path through the screen, in the ground of the device's
// theme (or of the look the device saved), and gone once the app has drawn its first screen: when that is the roadmap, the figure and the name fly into their places at its head. A
// browser driven by a test has no one to welcome (navigator.webdriver): the cover goes at once there, so these tests say it is not.
import { test, expect } from "../../support/test.js";
import { ready } from "../../support/page.js";

const welcomed = () => Object.defineProperty(navigator, "webdriver", { get: () => false });
/** Holds the page's data back, so that the app stays on its "Loading." screen (and the cover on it) for as long as the test looks; returns what lets the data go. */
async function hold(page) {
  let release;
  const held = new Promise((done) => { release = done; });
  await page.route("**/drill-data*.json", async (route) => { await held; await route.continue().catch(() => {}); });
  return release;
}

test("the cover shows the figure and the name from the first paint, and leaves when the app is ready", async ({ page }) => {
  await page.addInitScript(welcomed);
  const release = await hold(page);
  await page.goto("/", { waitUntil: "commit" });
  const cover = page.locator("#cover");
  await expect(cover).toBeVisible();
  await expect(cover.getByRole("img", { name: "Riglam practice" })).toBeVisible();
  expect(await cover.locator("svg.cv-name text").allTextContents()).toEqual(["RIGLAM", "practice"]);
  expect(await cover.locator("svg.cv-fig g.d1, svg.cv-fig g.d2, svg.cv-fig g.d3").count(), "the three diamonds").toBe(3);
  const box = await cover.boundingBox(), vp = page.viewportSize();
  expect([box.x, box.y, box.width, box.height], "it covers the whole screen").toEqual([0, 0, vp.width, vp.height]);
  release();
  await ready(page);
  await expect(cover, "it goes once the first screen is there").toHaveCount(0, { timeout: 8000 });
});

test("the cover takes the ground of the theme, light or dark, and of the look the device saved", async ({ page }) => {
  await page.addInitScript(welcomed);
  await hold(page);
  const ground = async () => {
    await page.goto("/", { waitUntil: "commit" });
    await expect(page.locator("#cover")).toBeVisible();
    return page.locator("#cover").evaluate((n) => getComputedStyle(n).backgroundColor);
  };
  await page.emulateMedia({ colorScheme: "light" });
  expect(await ground()).toBe("rgb(251, 249, 242)");
  await page.emulateMedia({ colorScheme: "dark" });
  expect(await ground()).toBe("rgb(22, 26, 32)");
  await page.addInitScript(() => localStorage.setItem("rd-look", JSON.stringify({ mode: "light" })));
  await ground();
  // the page's own small script reads the look a moment after the cover is drawn
  await expect.poll(() => page.locator("#cover").evaluate((n) => getComputedStyle(n).backgroundColor), "the look says light whatever the device does").toBe("rgb(251, 249, 242)");
});

test("without anyone to welcome (a driven browser) the cover is gone as soon as the app is ready", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#cover")).toHaveCount(0);
});

test("the path runs through the screen: solid above the figure, dotted under it, with a gap where the name stands", async ({ page }) => {
  await page.addInitScript(welcomed);
  await hold(page);
  await page.goto("/", { waitUntil: "commit" });
  const cover = page.locator("#cover");
  await expect(cover.locator("svg.cv-name")).toBeVisible();
  const m = await cover.evaluate((c) => {
    const rect = (sel) => c.querySelector(sel).getBoundingClientRect();
    const fig = rect(".cv-fig"), name = rect(".cv-name"), gap = c.querySelector(".cv-gap");
    const solid = c.querySelector(".cv-ln line:not(.dots)"), dots = c.querySelector(".cv-ln .dots");
    return {
      figBottom: fig.bottom, nameTop: name.top, nameBottom: name.bottom, figCenter: fig.x + fig.width / 2,
      gapTop: +gap.getAttribute("y"), gapBottom: +gap.getAttribute("y") + +gap.getAttribute("height"),
      solid: { y2: +solid.getAttribute("y2"), x: +solid.getAttribute("x1"), dash: getComputedStyle(solid).strokeDasharray },
      dots: { y1: +dots.getAttribute("y1"), x: +dots.getAttribute("x1"), dash: getComputedStyle(dots).strokeDasharray, cap: getComputedStyle(dots).strokeLinecap },
      lines: c.querySelectorAll(".cv-ln line").length,
    };
  });
  expect(m.lines).toBe(2);
  expect(m.solid.dash, "solid above the figure").toBe("none");
  expect(m.dots.dash, "dotted under it").not.toBe("none");
  expect(m.dots.cap).toBe("round");
  expect(Math.abs(m.solid.y2 - m.figBottom), "the solid part ends where the figure does").toBeLessThan(1);
  expect(m.dots.y1).toBe(m.solid.y2);
  expect(Math.abs(m.solid.x - m.figCenter), "through the middle of the figure").toBeLessThan(1);
  expect(m.gapTop, "the gap starts above the name").toBeLessThan(m.nameTop);
  expect(m.gapBottom, "and ends under it").toBeGreaterThan(m.nameBottom);
});

/** Looks at every frame of the cover's flight into the roadmap (from when it starts to when the cover is gone): where the cover's figure and name are, where the roadmap's own are, and how visible each is. */
function watchFlight(page) {
  return page.evaluate(() => new Promise((done) => {
    const frames = [];
    const seen = (el) => { let o = 1; for (let n = el; n && n !== document.documentElement; n = n.parentElement) o *= +getComputedStyle(n).opacity; return o; };
    const rect = (el) => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height }; };
    const tick = () => {
      const cover = document.getElementById("cover");
      if (!cover) return done(frames);
      if (cover.classList.contains("zm")) {
        const fig = cover.querySelector(".cv-fig"), name = cover.querySelector(".cv-name");
        const head = document.querySelector(".pa .road .rfig"), lock = document.querySelector(".pa .road .rname"), box = document.querySelector(".pa .road .rbox");
        frames.push({
          zoom: document.documentElement.classList.contains("cv-zoom"),
          cover: { fig: seen(fig), name: seen(name) }, road: { fig: seen(head), name: seen(lock) },
          figRect: rect(fig), nameRect: rect(name), headRect: rect(head), boxRect: rect(box),
        });
      }
      requestAnimationFrame(tick);
    };
    tick();
  }));
}

test("the cover flies its figure and name into their places at the head of the roadmap, and the logo is on screen in every frame", async ({ page }) => {
  await page.addInitScript(welcomed);
  await page.addInitScript(() => { localStorage.setItem("rd-start", "road"); localStorage.setItem("rd-design", "path"); });
  await page.goto("/");
  const frames = await watchFlight(page);
  expect(frames.length, "the flight is seen").toBeGreaterThan(20);
  const flying = frames.filter((f) => f.zoom);
  expect(flying.length).toBeGreaterThan(10);
  for (const [i, f] of frames.entries()) {
    expect(Math.max(f.cover.fig, f.road.fig), `the figure is there in frame ${i}`).toBeGreaterThan(0.99);
    expect(Math.max(f.cover.name, f.road.name), `the name is there in frame ${i}`).toBeGreaterThan(0.99);
  }
  expect(flying[0].road.fig, "the roadmap's own figure waits while the cover's flies").toBe(0);
  const last = flying[flying.length - 1];
  const target = { x: last.headRect.x, width: last.headRect.width };
  expect(Math.abs(last.figRect.x - target.x), "the figure lands on the roadmap's").toBeLessThan(1);
  expect(Math.abs(last.figRect.width - target.width), "at its size").toBeLessThan(1);
  expect(Math.abs(last.figRect.y + last.figRect.height / 2 - (last.headRect.y + last.headRect.height / 2)), "centered in its box").toBeLessThan(1);
  for (const k of ["x", "y", "width", "height"]) expect(Math.abs(last.nameRect[k] - last.boxRect[k]), `the name lands on the roadmap's (${k})`).toBeLessThan(1);
  await expect(page.locator("#cover")).toHaveCount(0);
  await expect(page.getByRole("dialog", { name: "Roadmap" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.classList.contains("cv-zoom")), "the roadmap's head is back").toBe(false);
});

test("a cold start opens on the roadmap, and Continue goes to the exercise", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("rd-start", "road"); localStorage.setItem("rd-design", "path"); });
  await page.goto("/");
  const road = page.getByRole("dialog", { name: "Roadmap" });
  await expect(road).toBeVisible();
  await expect(page.locator("#path .lay")).toBeHidden();
  await expect(page.locator("#cover")).toHaveCount(0);
  await road.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator("#path .chs .crow")).toHaveCount(5);
});

test("an app that was set to start on the exercise opens on it, and the cover only fades", async ({ page }) => {
  await page.addInitScript(welcomed);
  await page.addInitScript(() => { localStorage.setItem("rd-start", "exercise"); localStorage.setItem("rd-design", "path"); });
  await page.goto("/");
  await expect(page.locator("#path .chs .crow")).toHaveCount(5);
  await expect(page.locator("#cover")).toHaveCount(0, { timeout: 8000 });
  expect(await page.evaluate(() => document.documentElement.classList.contains("cv-zoom"))).toBe(false);
});
