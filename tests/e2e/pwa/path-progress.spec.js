// The progression in the Path's top bar: a back chevron where the station diamond was, and after the exercise's name a ring with the stage in it: a
// segment for each new term of the stage, or, on a stage without (and here, where the test devices have every term settled: tests/support/test.js), the
// run of right answers towards the next stage (below stage 8, the ladder's last, which shows its terms). A tap on the ring opens the Progression sheet (a page of the practice options); the top bar names it while
// it is open (and its ring gives way to the close); Back and the close shut it (src/app/path/progress.tsx).
import { test, expect } from "../../support/test.js";

const setup = () => {
  window.__riglamTest = (t) => { window.__t = t; };
  if (localStorage.getItem("rd-design") === null) localStorage.setItem("rd-design", "path");
  if (localStorage.getItem("rd-stages") === null) localStorage.setItem("rd-stages", "1,2,3,4,5,6,7");     // below the ladder's last stage, where the ring shows its terms
};
const ring = (page) => page.locator("#path .ptb .pring");
const sheet = (page) => page.locator("#path .psheet.on");

async function start(page) {
  await page.addInitScript(setup);
  await page.goto("/");
  await expect(page.locator("#path .chs .crow")).toHaveCount(5);
}
/** The run as the progression keeps it, set directly: `up` right answers in a row (in halves) towards the stage after the highest one on. */
const run = (page, patch) => page.evaluate((p) => { const t = window.__t; Object.assign(t.stageRun, p); t.render(); }, patch);

test("the top bar has a way back to the roadmap and the progression ring after the name, and no station diamond", async ({ page }) => {
  await start(page);
  const bar = page.locator("#path .ptb");
  await expect(bar.getByRole("button", { name: "Back to the roadmap" })).toBeVisible();
  await expect(bar.locator(".tgo")).toHaveCount(0);
  const [name, rg] = await Promise.all([page.locator("#path .ptb-t").boundingBox(), ring(page).boundingBox()]);
  expect(rg.x, "the ring comes after the name").toBeGreaterThan(name.x + name.width - 1);
  await bar.getByRole("button", { name: "Back to the roadmap" }).click();
  await expect(page.locator("#path .road.on")).toHaveCount(1);
});

test("the ring fills with the run, and is full when the next stage is due", async ({ page }) => {
  await start(page);
  const arc = page.locator("#path .pring .arc");
  const offset = async () => Number(await arc.getAttribute("stroke-dashoffset"));
  const whole = Number(await arc.getAttribute("stroke-dasharray"));
  await run(page, { up: 0, need: undefined, manual: undefined });
  expect(await offset(), "an empty run: nothing filled").toBeCloseTo(whole, 3);
  await expect(ring(page)).toHaveAccessibleName(/0 percent of the way to stage \d/);
  await run(page, { up: 2.5 });
  expect(await offset(), "two and a half of five").toBeCloseTo(whole * 0.5, 3);
  await expect(ring(page)).toHaveAccessibleName(/50 percent of the way to stage \d/);
  await expect(ring(page)).not.toHaveClass(/\bfull\b/);
  await run(page, { up: 5 });
  expect(await offset(), "a full run").toBeCloseTo(0, 3);
  await run(page, { up: 4, need: 10 });
  expect(await offset(), "after staying longer the run needs ten").toBeCloseTo(whole * 0.6, 3);
});

test("the stage the ring shows is the highest one on, and it has no fill where the learner moves the stages", async ({ page }) => {
  await start(page);
  const top = await page.evaluate(() => Math.max(...window.__t.stages));
  await expect(ring(page).locator("text")).toHaveText(String(top));
  await run(page, { up: 3, manual: true });
  await expect(ring(page)).toHaveAccessibleName(new RegExp("^Progression: stage " + top + "\\. How it works"));
  expect(Number(await page.locator("#path .pring .arc").getAttribute("stroke-dashoffset"))).toBeCloseTo(Number(await page.locator("#path .pring .arc").getAttribute("stroke-dasharray")), 3);
});

test("a tap on the ring opens the Progression sheet under it, the ring stays and is pressed; the ring, the close and Back shut it, its link goes to the practice options", async ({ page }) => {
  await start(page);
  await run(page, { up: 0, need: undefined, manual: undefined });
  await ring(page).click();
  await expect(sheet(page)).toHaveCount(1);
  // the bar keeps the exercise's name and the ring, pressed: the page hangs under what opened it; the other tools give way and the options button is the close
  await expect(page.locator("#path .ptb-t")).toHaveText("Relations");
  await expect(ring(page)).toBeVisible();
  await expect(ring(page)).toHaveClass(/\bon\b/);
  await expect(ring(page)).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#path .ptb .pib")).toHaveCount(2);
  const lines = sheet(page).locator(".tup-bul li");
  await expect(lines.first()).toContainText(/^Stage \d introduces /);
  await expect(sheet(page)).toContainText("is reached after five right answers in a row on what is new.");
  await expect(sheet(page)).toContainText("Progression works across all exercises.");
  await expect(sheet(page)).toContainText("Review answers count too, but as smaller steps.");
  await expect(sheet(page)).toContainText("A wrong answer on the new terms resets the stage progress.");
  await expect(sheet(page).locator(".sback"), "no list under it to go back to").toHaveCount(0);
  // the ring shuts it again
  await ring(page).click();
  await expect(sheet(page)).toHaveCount(0);
  await expect(ring(page)).toHaveAttribute("aria-expanded", "false");
  // the close shuts it
  await ring(page).click();
  await page.getByRole("button", { name: "Close the progression" }).click();
  await expect(sheet(page)).toHaveCount(0);
  // the system Back closes it in one step (the exercise stays)
  await ring(page).click();
  await expect(sheet(page)).toHaveCount(1);
  await page.goBack();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.locator("#path .ptb-t")).toContainText("Relations");
  // its own link goes to the practice options, which name themselves in the bar
  await ring(page).click();
  await sheet(page).getByRole("button", { name: "practice options", exact: true }).click();
  await expect(page.locator("#path .ptb-t")).toHaveText("Practice options");
  await expect(ring(page)).toHaveCount(0);
});

test.describe("the number in the ring", () => {
  test.use({ deviceScaleFactor: 4 });
  test("the ink of the stage number is centered in the ring", async ({ page }) => {
    await start(page);
    for (const up of [0, 3]) {
      await run(page, { up });
      await page.evaluate(() => document.fonts.ready);
      const shot = await page.locator("#path .pring svg").screenshot({ animations: "disabled" });
      // the digits are dark on the paper; the ring is everything else that is not the paper, out beyond the digits: the ink's centre is measured
      // against the ring's own centre in the same picture (the picture's edges move with where the bar happens to put the ring)
      const box = await page.evaluate(async (b64) => {
        const bmp = await createImageBitmap(await (await fetch("data:image/png;base64," + b64)).blob());
        const cv = new OffscreenCanvas(bmp.width, bmp.height), cx = cv.getContext("2d"); cx.drawImage(bmp, 0, 0);
        const { data, width, height } = cx.getImageData(0, 0, bmp.width, bmp.height), px = width / 30 > height / 30 ? height / 30 : width / 30, mx = width / 2, my = height / 2;
        const bg = [data[0], data[1], data[2]], at = (x, y) => (y * width + x) * 4;
        const ring = { x0: Infinity, x1: -1, y0: Infinity, y1: -1 }, ink = { y0: Infinity, y1: -1, x0: Infinity, x1: -1 };
        for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
          const i = at(x, y), d = Math.hypot(x - mx, y - my);
          if (d > 8.5 * px && Math.abs(data[i] - bg[0]) + Math.abs(data[i + 1] - bg[1]) + Math.abs(data[i + 2] - bg[2]) > 40) { ring.x0 = Math.min(ring.x0, x); ring.x1 = Math.max(ring.x1, x); ring.y0 = Math.min(ring.y0, y); ring.y1 = Math.max(ring.y1, y); }
          if (d <= 8.5 * px && data[i + 3] > 200 && data[i] + data[i + 1] + data[i + 2] < 300) { ink.x0 = Math.min(ink.x0, x); ink.x1 = Math.max(ink.x1, x); ink.y0 = Math.min(ink.y0, y); ink.y1 = Math.max(ink.y1, y); }
        }
        return { px, found: ink.y1 >= 0 && ring.y1 >= 0, dy: (ink.y0 + ink.y1) / 2 - (ring.y0 + ring.y1) / 2, dx: (ink.x0 + ink.x1) / 2 - (ring.x0 + ring.x1) / 2, ring, ink };
      }, shot.toString("base64"));
      expect(box.found, "the number and the ring are drawn").toBe(true);
      expect(Math.abs(box.dy) / box.px, "vertical off-centre, in px: " + JSON.stringify(box)).toBeLessThan(0.6);
      expect(Math.abs(box.dx) / box.px, "horizontal off-centre, in px: " + JSON.stringify(box)).toBeLessThan(0.7);
    }
  });
});

/** A device on stages 1 and 2 whose record has the new terms of stage 2 as given (src/domain/intro.ts, IntroTerm), Form settled, and no stop due. */
const stage2 = (page, terms) => page.addInitScript((t) => {
  localStorage.setItem("rd-stages", "1,2");
  localStorage.setItem("rd-terms", JSON.stringify({ n: 12, next: 99, terms: { form: { box: 3, shows: 1 }, ...t } }));
}, terms);

test("on a stage with new terms the ring has a segment for each, in the order they were first answered, colored by the last answer on each; the sheet lists them", async ({ page }) => {
  // External form right; Shape right, then missed; Color missed, never right yet; External matter and Form source still to come
  await stage2(page, { extf: { box: 2, shows: 1, first: 1, won: 1 }, shape: { box: 1, shows: 2, first: 2, won: 2 }, col: { box: 1, shows: 2, first: 3 } });
  await start(page);
  const segs = ring(page).locator(".tseg");
  await expect(segs).toHaveCount(5);
  expect(await segs.evaluateAll((a) => a.map((x) => x.getAttribute("class")))).toEqual(["tseg ok", "tseg slip", "tseg miss", "tseg wait", "tseg wait"]);
  const strokes = await segs.evaluateAll((a) => a.map((x) => getComputedStyle(x).stroke));
  expect(strokes[1], "a miss is a miss, whether the term was right before or not").toBe(strokes[2]);
  expect(new Set(strokes).size, "right, missed, and to come look different").toBe(3);
  await expect(ring(page)).toHaveAccessibleName("Progression: stage 2, 1 of 5 new terms answered right. How it works");
  await expect(ring(page)).not.toHaveClass(/\bfull\b/);
  await expect(ring(page).locator("text")).toHaveText("2");
  await ring(page).click();
  // the terms follow what the stage introduces, each with its mark and nothing else
  const lines = sheet(page).locator(".tup-bul > li");
  await expect(lines.nth(0)).toHaveText("Stage 2 introduces colors and shapes as qualities of things: the red of an apple, not the apple.");
  await expect(lines.nth(1)).toHaveClass("tlist");
  const terms = lines.nth(1).locator(".tterms li");
  await expect(terms).toHaveText(["External form", "Shape", "Color", "External matter", "Form source"]);
  expect(await terms.locator(".tmk").evaluateAll((a) => a.map((x) => x.getAttribute("class")))).toEqual(["tmk ok", "tmk slip", "tmk miss", "tmk wait", "tmk wait"]);
  expect(await lines.nth(1).evaluate((li) => getComputedStyle(li).listStyleType), "the list of terms has no bullet of its own").toBe("none");
  await expect(lines.nth(2)).toHaveText("New terms come one at a time, a few questions apart, while fewer than three of your terms are not right yet. With three, the questions stay on those until one of them is.");
  await expect(lines.nth(3)).toHaveText("Stage 3 begins with its first new term, after the last of these.");
  await expect(sheet(page)).toContainText("A wrong answer takes back only that term’s mark.");
  await expect(sheet(page)).not.toContainText("in a row");
});

test("stage 1 has two new terms, form and matter, the same things under two definitions: a segment for each", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("rd-stages", "1");
    localStorage.setItem("rd-terms", JSON.stringify({ n: 6, next: 99, terms: { form: { box: 1, shows: 1, first: 5 }, "form:Matter": { box: 1, shows: 1 } } }));
  });
  await start(page);
  expect(await ring(page).locator("path.tseg").evaluateAll((a) => a.map((x) => x.getAttribute("class")))).toEqual(["tseg miss", "tseg met"]);
  await expect(ring(page)).toHaveAccessibleName("Progression: stage 1, 0 of 2 new terms answered right. How it works");
  await ring(page).click();
  await expect(sheet(page).locator(".tterms li")).toHaveText(["Form", "Matter"]);
  await expect(sheet(page)).toContainText("Stage 2 begins with its first new term, after the last of these.");
});

test("the sheet says so where no stage comes by itself", async ({ page }) => {
  await start(page);
  await run(page, { manual: true });
  await ring(page).click();
  await expect(sheet(page)).toContainText("The stages move when you move them.");
  await expect(sheet(page)).not.toContainText("is reached after");
});
