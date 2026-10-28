// The Progression page on the Path (src/app/path/progression.tsx): the roadmap's foot shows the stages as a row of rings, and a tap on one opens the page at
// that stage; the page has each stage as a stop with its ring as the node and the new terms of the stages reached under it, each with its mark, and a term met
// unfolds into what its stop showed; then the negations. The sheet of the top bar's ring opens the page too, and leaving the page leaves Review as it was.
import { test, expect } from "../../support/test.js";
import { withCourse } from "../../support/data-key.js";

// stage 2 of 11: Form met and not answered yet, Color right; the other new terms of stages 1 and 2 still to come
const seed = () => {
  if (localStorage.getItem("rd-design") === null) localStorage.setItem("rd-design", "path");
  localStorage.setItem("rd-stages", "1,2");
  localStorage.setItem("rd-terms", JSON.stringify({ n: 9, next: 99, terms: { form: { box: 1, shows: 1, at: 1 }, col: { box: 3, shows: 1, at: 1, first: 2, won: 4 } } }));
};
const rings = (page) => page.getByRole("dialog", { name: "Roadmap" }).getByRole("group", { name: "The stages: stage 2 of 11" }).getByRole("button");
const stages = (page) => page.locator("#path .pprog .prg");
const terms = (page) => page.locator("#path .pprog .prg-t");
const term = (page, name) => terms(page).filter({ has: page.locator("b", { hasText: new RegExp("^" + name + "$") }) });

test("the roadmap's rings open the Progression page at a stage, with the stages, their terms and marks, and the negations", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(seed);
  await page.goto("/");
  await expect(page.locator("#path .chs .crow")).toHaveCount(5);
  await page.locator(".tstn").click();
  await expect(rings(page)).toHaveCount(11);
  await expect(rings(page).nth(1)).toHaveAccessibleName("Stage 2, 1 of 5 new terms answered right. Progression");
  await expect(rings(page).nth(1).locator(".halo")).toHaveCount(1);
  await rings(page).nth(8).click();
  await expect(page.locator(".ppage .ptitle")).toHaveText("Progression");
  await expect(page.locator(".ppage .psub")).toHaveText(/^stage 2 of 11 · 1 of \d+ terms right$/);
  await expect(stages(page)).toHaveCount(11);
  await expect(stages(page).nth(0).locator("b")).toHaveText("Stage 1 · Things around you");
  await expect(stages(page).nth(1).locator(".prg-s")).toHaveText("now · 1 of 5 right");
  await expect(stages(page).nth(5).locator(".prg-s")).toHaveText(/^\d+ new terms?$/);
  await expect(stages(page).nth(8)).toBeInViewport();                 // opened at the stage of the ring tapped
  // the new terms of stages 1 and 2 only, each with its mark
  await expect(terms(page)).toHaveCount(7);
  await expect(term(page, "Color").locator(".prg-s")).toHaveText("last answer right");
  await expect(term(page, "Form").locator(".prg-s")).toHaveText("not asked yet");
  await expect(term(page, "Matter").locator(".prg-s")).toHaveText("its stop is still to come");
  await expect(term(page, "Matter").locator(".trb")).toHaveCount(0);   // nothing to unfold before its stop
  // a term met unfolds into what its stop showed
  await term(page, "Color").locator(".trb").click();
  const fold = page.locator("#path .pfold");
  await expect(fold.locator(".tstop-sech")).toHaveText(withCourse ? ["Definition", "Categories", "Examples"] : ["Categories", "Examples"]);
  await expect(fold.locator(".ttree li.me")).toHaveText("Color");
  await expect(page.locator("#path .pprog .pgh").filter({ hasText: "Negations" })).toHaveText(/^Negations\s*off$/);
  // Review is Review again once the page is left
  await page.getByRole("button", { name: /^Continue practice/ }).click();
  await expect(page.locator("#path .chs .crow")).toHaveCount(5);
  await page.locator(".tstn").click();
  await page.getByRole("dialog", { name: "Roadmap" }).getByRole("button", { name: /^Review/ }).click();
  await expect(page.locator(".ppage .ptitle")).toHaveText("Review");
  expect(errors).toEqual([]);
});

test("the sheet of the top bar's ring opens the Progression page at the stage the learner is on", async ({ page }) => {
  await page.addInitScript(seed);
  await page.goto("/");
  await expect(page.locator("#path .chs .crow")).toHaveCount(5);
  await page.getByRole("button", { name: /^Progression: stage 2/ }).click();
  await page.getByRole("button", { name: "All stages and their terms" }).click();
  await expect(page.locator(".ppage .ptitle")).toHaveText("Progression");
  await expect(stages(page).nth(1)).toBeInViewport();
});
