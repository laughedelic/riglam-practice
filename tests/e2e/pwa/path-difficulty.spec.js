// The Difficulty section of the Progression page on the Path (src/app/path/difficulty.tsx), above the stages: the pace of the new terms, the negations and the
// depth, each a line with its choice; the negations open from stage 2 and the depth from stage 9, the last of the ladder. Depth puts on the stages after it
// (src/domain/stages.ts, LADDER_TOP), which the page does not list as stages, and a result offers its first layer once each term of stage 9 is right.
import { test, expect } from "../../support/test.js";

const ORDER = ["mi", "3ab", "3ba", "4", "con"];
const road = (page) => page.getByRole("dialog", { name: "Roadmap" });
const rings = (page) => road(page).getByRole("group", { name: /^The stages/ }).getByRole("button");
const stages = (page) => page.locator("#path .pprog .prgl");
const stagesNote = (page) => page.locator("#path .pprog .prg-st .sgnote");
const diff = (page) => page.locator("#path .pprog .sgrp").first();
const line = (page, name) => diff(page).locator(".ol").filter({ has: page.locator(".oltx > b", { hasText: new RegExp("^" + name + "$") }) });
const exercise = (page) => page.locator("#path .chs .crow");
const station = (page) => page.locator("#stn");
const open = async (page, stagesOn) => {
  await page.addInitScript((s) => {localStorage.setItem("rd-stages", s); }, stagesOn);
  await page.goto("/");
  await expect(exercise(page)).toHaveCount(5);
  await page.locator(".tstn").click();
  await rings(page).first().click();
  await expect(stages(page)).toHaveCount(10);
};

test("the Difficulty section above the stages: the pace is kept, the negations wait for stage 2 and the depth for stage 9", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page, "0");
  await expect(diff(page).locator(".sgh")).toHaveText("Difficulty");
  const pace = diff(page).getByRole("group", { name: "Pace" });
  await expect(pace.getByRole("button", { name: "Steady" })).toHaveAttribute("aria-pressed", "true");
  await expect(line(page, "Pace"), "one line on what the pace means").toContainText("Up to three terms not right yet, and a new term at most every three questions.");
  await pace.getByRole("button", { name: "Careful" }).click();
  await expect(pace.getByRole("button", { name: "Careful" })).toHaveAttribute("aria-pressed", "true");
  await expect(line(page, "Pace")).toContainText("Up to two terms not right yet, and a new term at most every four questions. Guidance steps down after 30 right answers in an exercise, then 20 more.");
  expect(await page.evaluate(() => localStorage.getItem("rd-pace"))).toBe("2");
  // at stage 0 neither the negations nor the depth can be set yet
  await expect(diff(page).getByRole("group", { name: "Negations" })).toHaveCount(0);
  await expect(diff(page).getByRole("switch", { name: /^Brackets/ })).toHaveCount(0);
  await expect(diff(page).locator(".pdiff-wait")).toHaveText(["From stage 2.", "From stage 9."]);
  // the pace stays as chosen when the page is opened again
  await page.locator(".tstn").click();
  await rings(page).first().click();
  await expect(diff(page).getByRole("group", { name: "Pace" }).getByRole("button", { name: "Careful" })).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});

test("at stage 9 depth is set in the Difficulty section: one layer puts stage 10 on, the ladder stays stages 0 to 9, and Off takes it away", async ({ page }) => {
  await open(page, "0,1,2,3,4,5,6,7,8,9");
  await expect(stagesNote(page)).toContainText("stage 9 of 9");
  const depth = diff(page).getByRole("group", { name: "Depth" });
  await expect(depth.getByRole("button", { name: "Off" })).toHaveAttribute("aria-pressed", "true");
  await depth.getByRole("button", { name: "One layer" }).click();
  await expect(depth.getByRole("button", { name: "One layer" })).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => localStorage.getItem("rd-stages"))).toBe("0,1,2,3,4,5,6,7,8,9,10");
  await expect(stages(page)).toHaveCount(10);
  await expect(stagesNote(page)).toContainText("stage 9 of 9");
  await depth.getByRole("button", { name: "Off" }).click();
  expect(await page.evaluate(() => localStorage.getItem("rd-stages"))).toBe("0,1,2,3,4,5,6,7,8,9");
});

test("on the Path the first layer of depth is offered on a result, not brought by a station, and taken with a tap", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    localStorage.setItem("rd-stages", "0,1,2,3,4,5,6,7,8,9");
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
  await expect(offer).toContainText("Every term of stage 9 is right. Try chains of reasoning?");
  await expect(station(page)).not.toHaveAccessibleName(/new stage/);
  await offer.getByRole("button", { name: "Try chains" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Depth: one layer" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("rd-stages"))).toBe("0,1,2,3,4,5,6,7,8,9,10");
});
