// The Difficulty page on the Path (src/app/path/difficulty.tsx), over the Progression page: the pace of the new terms, the negations and the depth, each with
// its choice; the negations open from stage 2 and the depth from stage 8, the last of the ladder. Depth puts on the stages after it (src/domain/stages.ts,
// LADDER_TOP), which the Progression page does not list as stages, and a result offers its first layer once each term of stage 8 is right.
import { test, expect } from "../../support/test.js";

const ORDER = ["mi", "3ab", "3ba", "4", "con"];
const road = (page) => page.getByRole("dialog", { name: "Roadmap" });
const rings = (page) => road(page).getByRole("group", { name: /^The stages/ }).getByRole("button");
const stages = (page) => page.locator("#path .pprog .prg");
const row = (page) => page.getByRole("button", { name: /^Difficulty/ });
const stagesHead = (page) => page.locator("#path .pprog .sechead").filter({ hasText: /^Stages/ });
const diff = (page) => page.locator("#path .pdiff");
const exercise = (page) => page.locator("#path .chs .crow");
const station = (page) => page.locator("#stn");
const open = async (page, stagesOn) => {
  await page.addInitScript((s) => { if (localStorage.getItem("rd-design") === null) localStorage.setItem("rd-design", "path"); localStorage.setItem("rd-stages", s); }, stagesOn);
  await page.goto("/");
  await expect(exercise(page)).toHaveCount(5);
  await page.locator(".tstn").click();
  await rings(page).first().click();
  await expect(stages(page)).toHaveCount(8);
};

test("the Difficulty heading above the stages opens its page: the pace is kept, the negations wait for stage 2 and the depth for stage 8, and Back comes to the stages", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, "1");
  await expect(row(page)).toContainText("steady pace · negations off · depth off");
  await row(page).click();
  await expect(page.locator("#path .ptb-t")).toHaveText("Difficulty");
  await expect(page.locator(".tstn")).toHaveAccessibleName("Back to Progression");
  const pace = diff(page).getByRole("group", { name: "Pace" });
  await expect(pace.getByRole("button", { name: "Steady · 3" })).toHaveAttribute("aria-pressed", "true");
  await pace.getByRole("button", { name: "Careful · 2" }).click();
  await expect(pace.getByRole("button", { name: "Careful · 2" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("rd-pace"))).toBe("2");
  // at stage 1 neither the negations nor the depth can be set yet
  await expect(diff(page).getByRole("group", { name: "Negations" })).toHaveCount(0);
  await expect(diff(page).getByRole("switch", { name: /^Brackets/ })).toHaveCount(0);
  await expect(diff(page).locator(".pdiff-wait")).toHaveText(["From stage 2.", "From stage 8."]);
  await page.locator(".tstn").click();
  await expect(stages(page)).toHaveCount(8);
  await expect(row(page)).toContainText("careful pace · negations off · depth off");
  expect(errors).toEqual([]);
});

test("at stage 8 depth is set on the Difficulty page: one layer puts stage 9 on, the ladder stays eight stages, and Off takes it away", async ({ page }) => {
  await open(page, "1,2,3,4,5,6,7,8");
  await expect(stagesHead(page)).toContainText("stage 8 of 8");
  await row(page).click();
  const depth = diff(page).getByRole("group", { name: "Depth" });
  await expect(depth.getByRole("button", { name: "Off" })).toHaveAttribute("aria-pressed", "true");
  await depth.getByRole("button", { name: "One layer" }).click();
  await expect(depth.getByRole("button", { name: "One layer" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("rd-stages"))).toBe("1,2,3,4,5,6,7,8,9");
  await page.locator(".tstn").click();
  await expect(row(page)).toContainText("depth one layer");
  await expect(stages(page)).toHaveCount(8);
  await expect(stagesHead(page)).toContainText("stage 8 of 8");
  await row(page).click();
  await depth.getByRole("button", { name: "Off" }).click();
  expect(await page.evaluate(() => localStorage.getItem("rd-stages"))).toBe("1,2,3,4,5,6,7,8");
});

test("on the Path the first layer of depth is offered on a result, not brought by a station, and taken with a tap", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("rd-design", "path"); localStorage.setItem("rd-stages", "1,2,3,4,5,6,7,8");
    localStorage.setItem("rd-stage-run", JSON.stringify({ up: 4.5, down: 0, told: true }));     // one more right answer, at any stage, completes the run
    window.__riglamTest = (t) => { window.__t = t; };
  });
  await page.goto("/");
  await expect(exercise(page)).toHaveCount(5);
  const rel = await page.evaluate(() => window.__t.cur.p.relation);
  await exercise(page).nth(ORDER.indexOf(rel)).click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (let i = 0; i < 4 && (await field.isVisible()); i++) { await field.fill("thing " + (i + 1)); if ((await field.getAttribute("enterkeyhint")) === "done") { await field.blur(); break; } await field.press("Enter"); }
  await expect(station(page)).toHaveAccessibleName(/^Check/);
  await station(page).click();
  await expect.poll(() => page.evaluate(() => window.__t.ui.checked)).toBe(true);
  const offer = page.getByRole("group", { name: "Depth" });
  await expect(offer).toContainText("Every term of stage 8 is right. Try chains of reasoning?");
  await expect(station(page)).not.toHaveAccessibleName(/new stage/);
  await offer.getByRole("button", { name: "Try chains" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Depth: one layer" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("rd-stages"))).toBe("1,2,3,4,5,6,7,8,9");
});
