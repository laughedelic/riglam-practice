// The Progression page on the Path (src/app/path/progression.tsx): the roadmap's foot shows the stages as a row of rings, and a tap on one opens the page
// with that stage unfolded; the page has each stage as a stop with its ring as the node, folded, under a fold that says how the stages work; a stage unfolds
// into what it introduces and its new terms with their marks, and a term met opens its card on a page of its own. Then the negations. The sheet of the top
// bar's ring opens the page too. Back, the chevron or the system's, goes where the page was opened from: the roadmap or the exercise, and from a term's
// card to the stages as they were.
import { test, expect } from "../../support/test.js";
import { withCourse } from "../../support/data-key.js";

// stage 2 of 11: Form met and not answered yet, Color right; the other new terms of stages 1 and 2 still to come
const seed = () => {
  if (localStorage.getItem("rd-design") === null) localStorage.setItem("rd-design", "path");
  localStorage.setItem("rd-stages", "1,2");
  localStorage.setItem("rd-terms", JSON.stringify({ n: 9, next: 99, terms: { form: { box: 1, shows: 1, at: 1 }, col: { box: 3, shows: 1, at: 1, first: 2, won: 4 } } }));
};
const road = (page) => page.getByRole("dialog", { name: "Roadmap" });
const rings = (page) => road(page).getByRole("group", { name: "The stages: stage 2 of 11" }).getByRole("button");
const stages = (page) => page.locator("#path .pprog .prg");
const terms = (page) => page.locator("#path .pprog .prg-tl li");
const term = (page, name) => terms(page).filter({ has: page.locator(".ttn", { hasText: new RegExp("^" + name + "$") }) });
const exercise = (page) => page.locator("#path .chs .crow");
const open = async (page) => {
  await page.addInitScript(seed);
  await page.goto("/");
  await expect(exercise(page)).toHaveCount(5);
};

test("the roadmap's rings open the Progression page with that stage unfolded; a term met opens its card, and Back goes to the stages, then to the roadmap", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await open(page);
  await page.locator(".tstn").click();
  await expect(rings(page)).toHaveCount(11);
  await expect(rings(page).nth(1)).toHaveAccessibleName("Stage 2, 1 of 5 new terms answered right. Progression");
  await expect(rings(page).nth(1).locator(".halo")).toHaveCount(1);
  await rings(page).nth(1).click();
  await expect(page.locator(".ppage .ptitle")).toHaveText("Progression");
  await expect(page.locator(".ppage .psub")).toHaveText(/^stage 2 of 11 · 1 of \d+ terms right$/);
  await expect(page.locator(".tstn")).toHaveAccessibleName("Back to the roadmap");
  await expect(page.getByRole("button", { name: /^Continue practice/ })).toHaveCount(0);
  // the stages, folded but the one tapped; how they work folded above them
  await expect(stages(page)).toHaveCount(11);
  await expect(stages(page).nth(0).locator("b")).toHaveText("Stage 1 · Things around you");
  await expect(stages(page).nth(1).locator(".prg-s")).toHaveText("now · 1 of 5 right");
  await expect(stages(page).nth(5).locator(".prg-s")).toHaveText(/^\d+ new terms?$/);
  await expect(page.locator("#path .pprog .prg .trb[aria-expanded=true]")).toHaveCount(1);
  await expect(stages(page).nth(1).locator(".trb")).toHaveAttribute("aria-expanded", "true");
  const how = page.getByRole("button", { name: "How the stages work" });
  await expect(how).toHaveAttribute("aria-expanded", "false");
  await how.click();
  await expect(page.locator("#path .pprog .tup-bul li").first()).toHaveText(/^Each stage adds a new kind of thing/);
  await how.click();
  // the new terms of stage 2 with their marks: a term met is a button, one whose stop is still to come is not
  await expect(terms(page)).toHaveCount(5);
  await expect(term(page, "Color")).toHaveClass(/\bok\b/);
  await expect(term(page, "Color").getByRole("button")).toHaveAccessibleName("Color, last answer right. Its card");
  await expect(term(page, "Shape")).toHaveClass(/\bwait\b/);
  await expect(term(page, "Shape").getByRole("button")).toHaveCount(0);
  await expect(page.locator("#path .pprog .pgh").filter({ hasText: "Negations" })).toHaveText(/^Negations\s*off$/);
  // stage 1 unfolds with Form, met and not asked yet, and Matter, still to come
  await stages(page).nth(0).locator(".trb").click();
  await expect(term(page, "Form").getByRole("button")).toHaveAccessibleName("Form, not asked yet. Its card");
  await expect(term(page, "Matter")).toHaveClass(/\bwait\b/);
  await expect(term(page, "Matter").getByRole("button")).toHaveCount(0);
  // Color's card on a page of its own, as its stop showed it
  await term(page, "Color").getByRole("button").click();
  await expect(page.locator("#path .sechead .ph")).toHaveText(/^Stage 2\s*Colors and shapes · last answer right$/);
  await expect(page.locator("#path .tstop .stm.thing .cs").first()).toHaveText("Color");
  await expect(page.locator("#path .tstop-sech")).toHaveText(withCourse ? ["Definition", "Categories", "Examples"] : ["Categories", "Examples"]);
  await expect(page.locator("#path .ttree li.me")).toHaveText("Color");
  await expect(page.locator(".tstn")).toHaveAccessibleName("Back to Progression");
  // Back: the stages as they were, then the roadmap, with the exercise under it
  await page.locator(".tstn").click();
  await expect(stages(page)).toHaveCount(11);
  await expect(stages(page).nth(0).locator(".trb")).toHaveAttribute("aria-expanded", "true");
  await expect(stages(page).nth(1).locator(".trb")).toHaveAttribute("aria-expanded", "true");
  await page.locator(".tstn").click();
  await expect(road(page)).toBeVisible();
  await expect(road(page).getByRole("button", { name: /^Continue/ })).toBeVisible();
  // Review is Review again
  await road(page).getByRole("button", { name: /^Review/ }).click();
  await expect(page.locator(".ppage .ptitle")).toHaveText("Review");
  expect(errors).toEqual([]);
});

test("the system Back from a term's card goes to the stages, and from the stages to the roadmap the page was opened from", async ({ page }) => {
  await open(page);
  await page.locator(".tstn").click();
  await rings(page).nth(1).click();
  await term(page, "Color").getByRole("button").click();
  await expect(page.locator("#path .ttree li.me")).toHaveText("Color");
  await page.goBack();
  await expect(stages(page)).toHaveCount(11);
  await expect(page.locator(".ppage .ptitle")).toHaveText("Progression");
  await page.goBack();
  await expect(road(page)).toBeVisible();
  await expect(road(page).getByRole("button", { name: /^Continue/ })).toBeVisible();
  await road(page).getByRole("button", { name: /^Continue/ }).click();
  await expect(exercise(page)).toHaveCount(5);
});

test("the sheet of the top bar's ring opens the page at the stage the learner is on, and Back goes to the exercise", async ({ page }) => {
  await open(page);
  const fromSheet = async () => {
    await page.getByRole("button", { name: /^Progression: stage 2/ }).click();
    await page.getByRole("button", { name: "All stages and their terms" }).click();
    await expect(page.locator(".ppage .ptitle")).toHaveText("Progression");
    await expect(stages(page).nth(1).locator(".trb")).toHaveAttribute("aria-expanded", "true");
    await expect(stages(page).nth(1)).toBeInViewport();
  };
  await fromSheet();
  await expect(page.locator(".tstn")).toHaveAccessibleName("Back to Relations");
  await page.locator(".tstn").click();
  await expect(exercise(page)).toHaveCount(5);
  await expect(road(page)).toBeHidden();
  await fromSheet();
  await page.goBack();
  await expect(exercise(page)).toHaveCount(5);
  await expect(road(page)).toBeHidden();
});
