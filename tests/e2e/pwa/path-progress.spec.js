// The progression in the Path's top bar: a back chevron where the station diamond was, and after the exercise's name a ring that fills with the run
// of right answers towards the next stage, with the stage in it. A tap on the ring opens the Progression sheet (a page of the practice options);
// Back, the cross and the options button close it or swap it for the options (src/app/path/progress.tsx).
import { test, expect } from "../../support/test.js";

const setup = () => {
  window.__riglamTest = (t) => { window.__t = t; };
  if (localStorage.getItem("rd-design") === null) localStorage.setItem("rd-design", "path");
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

test("a tap on the ring opens the Progression sheet with its short lines; the cross and Back close it, its link goes to the practice options", async ({ page }) => {
  await start(page);
  await run(page, { up: 0, need: undefined, manual: undefined });
  await ring(page).click();
  await expect(sheet(page)).toHaveCount(1);
  await expect(sheet(page).getByRole("heading", { name: "Progression" })).toBeVisible();
  await expect(ring(page)).toHaveAttribute("aria-expanded", "true");
  const lines = sheet(page).locator(".tup-bul li");
  await expect(lines.first()).toContainText(/^Stage \d adds /);
  await expect(sheet(page)).toContainText("is reached after five right answers in a row on what is new.");
  await expect(sheet(page)).toContainText("Progression works across all exercises.");
  await expect(sheet(page)).toContainText("Review answers count too, but as smaller steps.");
  await expect(sheet(page)).toContainText("A wrong answer on the new terms resets the stage progress.");
  await expect(sheet(page).locator(".sback"), "no list under it to go back to").toHaveCount(0);
  // the cross closes it
  await sheet(page).getByRole("button", { name: /^Close/ }).click();
  await expect(sheet(page)).toHaveCount(0);
  // the system Back closes it in one step (the exercise stays)
  await ring(page).click();
  await expect(sheet(page)).toHaveCount(1);
  await page.goBack();
  await expect(sheet(page)).toHaveCount(0);
  await expect(page.locator("#path .ptb-t")).toContainText("Relations");
  // its own link goes to the practice options
  await ring(page).click();
  await sheet(page).locator(".plnk").click();
  await expect(sheet(page).getByRole("heading", { name: "Practice options" })).toBeVisible();
});

test("the sheet says so where no stage comes by itself", async ({ page }) => {
  await start(page);
  await run(page, { manual: true });
  await ring(page).click();
  await expect(sheet(page)).toContainText("The stages move when you move them.");
  await expect(sheet(page)).not.toContainText("is reached after");
});
