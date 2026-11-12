// Review and the tutor's conversation on the Path (src/app/path/review.tsx, tutor.tsx): today's trail and the other sections, a row that
// unfolds into the answer as it was checked, the favorites, the pairs skipped and the flags, and the conversation as a page with a flag on
// each answer. The answers, favorites, skips and flags are written to the device's database before the page starts, so the tests do not
// depend on which pair the page draws. What is counted and stored is src/domain's and the flag specs'.
import { test, expect } from "../../support/test.js";
import { giveKey, withCourse } from "../../support/data-key.js";
import { isPhone } from "../../support/page.js";

const now = new Date().toISOString();
const answer = {
  pairId: "r-test1", a: "round things", b: "wooden things", catA: "round", catB: "wooden", chosen: "con", key: "4", correct: false, grade: "bad",
  cells: {
    both: { text: "", none: true, verdict: "bad" },
    anb: { text: "a ball", none: false, verdict: "ok" },
    bna: { text: "a wooden table", none: false, verdict: "ok", by: "claude" },
    nei: { text: "a thought", none: false, verdict: "ok" },
  },
  at: now,
  pair: { id: "r-test1", a: "round things", b: "wooden things", catA: "round", catB: "wooden", relation: "4", ex: { both: "a wooden bowl", anb: "a ball", bna: "a wooden table", nei: "a thought" }, why: {} },
  explain: "Both: nothing given, but a wooden bowl is both.\nCommon locus: yes, a wooden bowl.",
};
const fav = { key: "c_blue__hollow", a: "blue things", b: "hollow things", catA: "blue", catB: "hollow", relation: "4", at: now,
  pair: { id: "r-fav1", a: "blue things", b: "hollow things", catA: "blue", catB: "hollow", relation: "4", ex: { both: "a blue pipe", anb: "a blue ball", bna: "a clear pipe", nei: "a thought" }, why: {} } };
const skip = { key: "c_red__square", a: "red things", b: "square things", catA: "red", catB: "square", relation: "4", at: now, from: "practice", n: 1,
  pair: { id: "r-skip1", a: "red things", b: "square things", catA: "red", catB: "square", relation: "4", ex: {}, why: {} } };
const flag = {
  id: "fl_cell", caseKey: "answers_r-test1", thing: "", part: "explain", model: "", runId: null, n: "both",
  shown: "nothing given, but a wooden bowl is both.", note: "A bowl can be square.", suggest: "a round wooden bowl",
  pair: { a: "round things", b: "wooden things", relation: "4", tab: "practice" }, at: now, updatedAt: now, state: "new",
};

const stored = (page, name) => page.evaluate(async (name) => {
  const db = await window.__riglam.platform.db();
  return Object.fromEntries((await db.collection(name).get()).docs.map((d) => [d.id, d.data()]));
}, name);
async function seed(page, docs) {
  await page.goto("/");
  await expect(page.locator("#path .chs .crow")).toHaveCount(5);
  await page.evaluate(async (docs) => {
    const db = await window.__riglam.platform.db();
    for (const [name, list] of Object.entries(docs)) for (const d of list) await db.collection(name).doc(d.pairId || d.key || d.id).set(d);
  }, docs);
  await page.reload();
  await expect(page.locator("#path .chs .crow")).toHaveCount(5);
}
async function openReview(page) {
  await page.locator(".tstn").click();
  await page.getByRole("dialog", { name: "Roadmap" }).getByRole("button", { name: /^Review/ }).click();
  await expect(page.locator(".ppage .ptitle")).toHaveText("Review");
}
const section = (page, name) => page.locator("#path .prseg button").filter({ hasText: new RegExp("^" + name) }).click();
const rows = (page) => page.locator("#path .ptrail .trow");

test("Review on the Path: today's trail, a row unfolds into the answer, and Practice this pair goes back to it", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await seed(page, { answers: [answer] });
  await openReview(page);
  await expect(page.locator("#path .psub")).toHaveText("1 answer today, the newest at the bottom");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("round things · wooden things");
  await expect(rows(page).first()).toContainText("Not quite");
  const row = rows(page).first().locator(".trb");
  await expect(row).toHaveAttribute("aria-expanded", "false");
  await row.click();
  await expect(row).toHaveAttribute("aria-expanded", "true");
  const fold = page.locator("#path .pfold");
  await expect(fold.locator(".srel")).toContainText("Four possibilities");
  await expect(fold.locator(".exr")).toHaveCount(4);
  await expect(fold).toContainText("Checked by Claude.");
  await fold.getByRole("button", { name: "Practice this pair" }).click();
  await expect(page.locator(".ptb-t")).toContainText("Relations");
  await expect(page.locator("#path")).toContainText("round things");
  expect(errors).toEqual([]);
});

const debate = { ...answer, pairId: "d-test1", mode: "debate", chosen: "4", key: "4", implied: "4", correct: true, grade: "ok", explain: undefined,
  qs: ["both", "anb", "bna", "nei"].map((c) => ({ c, say: "accept", verdict: "ok" })), pair: { ...answer.pair, id: "d-test1" } };
test("Review on the Path: Practice this pair on an answer of Pervasions starts it in Pervasions", async ({ page }) => {
  await seed(page, { debates: [debate] });
  await openReview(page);
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("Pervasions");
  await rows(page).first().locator(".trb").click();
  await page.locator("#path .pfold").getByRole("button", { name: "Practice this pair" }).click();
  await expect(page.locator(".ptb-t")).toContainText("Pervasions");
  await expect(page.locator("#path")).toContainText("round things");
});

// Pairs kept from before the reference left their relation open (docs/DATA.md): two colors, two materials. They carry the relation they were drawn with.
const gone = (id, a, b, catA, catB) => ({ id, a, b, catA, catB, relation: "con", ex: { anb: "snow", bna: "coal", nei: "a thought" }, why: { both: "Nothing in the reference is both." } });
const goneAnswer = {
  pairId: "r-gone1", a: "white things", b: "black things", catA: "white", catB: "black", chosen: "4", key: "con", correct: false, grade: "bad",
  cells: { both: { text: "a zebra", none: false, verdict: "bad" }, anb: { text: "snow", none: false, verdict: "ok" }, bna: { text: "coal", none: false, verdict: "ok" }, nei: { text: "a thought", none: false, verdict: "ok" } },
  at: now, pair: gone("r-gone1", "white things", "black things", "white", "black"),
};
const goneFav = { key: "c_black__white", a: "white things", b: "black things", catA: "white", catB: "black", relation: "con", at: now, pair: gone("r-gone2", "white things", "black things", "white", "black") };
const goneSkip = { key: "c_metal__wooden", a: "wooden things", b: "metal things", catA: "wooden", catB: "metal", relation: "con", at: now, from: "practice", n: 1,
  pair: gone("r-gone3", "wooden things", "metal things", "wooden", "metal") };

test("Review on the Path: a pair the reference has since left open is kept as it was saved and is not asked again", async ({ page }) => {
  await seed(page, { answers: [goneAnswer], favorites: [goneFav], skips: [goneSkip] });
  await openReview(page);
  await section(page, "Mistakes");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("the answer then was mutually exclusive, which the reference no longer gives");
  await expect(page.getByRole("button", { name: /^Retry \d+ mistake/ })).toHaveCount(0);
  await rows(page).first().locator(".trb").click();
  await expect(page.locator("#path .pfold")).toContainText("the reference no longer settles this pair");
  await expect(page.locator("#path .pfold").getByRole("button", { name: "Practice this pair" })).toHaveCount(0);
  await section(page, "Favorites");
  await rows(page).first().locator(".trb").click();
  await expect(page.locator("#path .pfold")).toContainText("The reference no longer settles this pair, so it is not asked again.");
  await expect(page.locator("#path .pfold").getByRole("button", { name: "Practice this pair" })).toHaveCount(0);
  await expect(page.locator("#path .pfold").getByRole("button", { name: "Remove" })).toBeVisible();
  await section(page, "Skipped");
  await expect(rows(page).first()).toContainText("no longer asked");
  await expect(rows(page).first().getByRole("button", { name: "Practice" })).toHaveCount(0);
  await rows(page).first().getByRole("button", { name: "Remove" }).click();
  await expect.poll(async () => Object.keys(await stored(page, "skips"))).toEqual([]);
});

// The same for what the first test leaves out: a pair skipped in Find a pair, which comes back as the learner's own pair (find/flow.js,
// resumeFind); an answer of Find a pair given when the reference still judged its pair; and a mistake under a label its category no
// longer has ("sentient beings" for persons), which is not asked again under that name.
const goneFindSkip = { key: "f_con_test_white_black", a: "white things", b: "black things", catA: "white", catB: "black", relation: "con", asked: "con", at: now, from: "find", n: 1,
  pair: gone("f-gone4", "white things", "black things", "white", "black") };
const goneFindAnswer = {
  pairId: "f-gone5", mode: "find", a: "wooden things", b: "metal things", catA: "wooden", catB: "metal", chosen: "con", key: "con", correct: true, grade: "ok",
  cells: { both: { text: "", none: true, verdict: "ok" }, anb: { text: "a wooden chair", none: false, verdict: "ok" }, bna: { text: "a metal key", none: false, verdict: "ok" }, nei: { text: "a thought", none: false, verdict: "ok" } },
  at: now, pair: gone("f-gone5", "wooden things", "metal things", "wooden", "metal"),
};
const oldLabelAnswer = {
  pairId: "r-gone6", a: "sentient beings", b: "teachers", catA: "pers", catB: "teacher", chosen: "4", key: "3ba", correct: false, grade: "bad",
  cells: { both: { text: "your teacher", none: false, verdict: "ok" }, anb: { text: "a dog", none: false, verdict: "ok" }, bna: { text: "a book", none: false, verdict: "bad" }, nei: { text: "a stone", none: false, verdict: "ok" } },
  at: now, pair: { id: "r-gone6", a: "sentient beings", b: "teachers", catA: "pers", catB: "teacher", relation: "3ba", ex: { both: "a teacher", anb: "a dog", nei: "a stone" }, why: { bna: "Whatever falls under “teachers” also falls under “sentient beings”." } },
};
// A pair of one category's two labels, one of them since dropped: the answer has no categories of its own (practice/grading.js stores none for
// such a pair), so what Review says of it is read off the pair it keeps.
const ownLabelsAnswer = {
  pairId: "r-gone7", a: "persons", b: "sentient beings", catA: null, catB: null, chosen: "3ab", key: "mi", correct: false, grade: "bad",
  cells: { both: { text: "a dog", none: false, verdict: "ok" }, anb: { text: "", none: true, verdict: "ok" }, bna: { text: "", none: true, verdict: "ok" }, nei: { text: "a stone", none: false, verdict: "ok" } },
  at: now, pair: { id: "r-gone7", a: "persons", b: "sentient beings", catA: "pers", catB: "pers", relation: "mi", ex: { both: "a dog", nei: "a stone" }, why: {} },
};
test("Review on the Path: a pair skipped in Find a pair that the reference has since left open comes back as the learner's own, and an old label is not asked again", async ({ page }) => {
  await page.addInitScript(() => { window.__riglamTest = (t) => { window.__t = t; }; });
  await seed(page, { answers: [goneFindAnswer, oldLabelAnswer, ownLabelsAnswer], skips: [goneFindSkip] });
  await openReview(page);
  // the answer of Find a pair: what it says of the relation was the answer then, and the pair is not offered again
  const found = rows(page).filter({ hasText: "wooden things · metal things" });
  await found.locator(".trb").click();
  await expect(page.locator("#path .pfold")).toContainText("The pair has it. That was the answer then: the reference no longer settles this pair.");
  await expect(page.locator("#path .pfold").getByRole("button", { name: "Practice this pair" })).toHaveCount(0);
  // the mistakes under the old label: listed as they were, with what is the matter (the name, not the relation), and not in Retry
  await section(page, "Mistakes");
  await expect(rows(page)).toHaveCount(2);
  const renamed = rows(page).filter({ hasText: "sentient beings · teachers" });
  await expect(renamed).toContainText("the answer then was three possibilities");
  await expect(renamed).toContainText("under a name the app no longer uses");
  // also in a pair of the category's own two labels, whose answer keeps no categories
  const twoLabels = rows(page).filter({ hasText: "persons · sentient beings" });
  await expect(twoLabels).toContainText("the answer then was mutually inclusive, under a name the app no longer uses");
  await expect(page.getByRole("button", { name: /^Retry \d+ mistake/ })).toHaveCount(0);
  await twoLabels.locator(".trb").click();
  await expect(page.locator("#path .pfold")).toContainText("That was the answer then: the app no longer uses one of these names.");
  await expect(page.locator("#path .pfold").getByRole("button", { name: "Practice this pair" })).toHaveCount(0);
  // the pair skipped in Find a pair: Practice opens it at its examples, as a pair of the learner's own, with nothing of the old reference
  await section(page, "Skipped");
  await expect(rows(page).first()).toContainText("Find a pair, Mutually exclusive");
  await rows(page).first().getByRole("button", { name: "Practice" }).click();
  await expect(page.locator(".ptb-t")).toContainText("Find a pair");
  await expect(page.locator("#path")).toContainText("white things");
  const cur = await page.evaluate(() => { const p = window.__t.cur.p; return { find: !!window.__t.cur.find, own: p.own, a: p.a, b: p.b, relation: p.relation, ex: p.ex, why: p.why, note: p.note, uiOwn: window.__t.ui.own, step: window.__t.ui.step }; });
  expect(cur).toEqual({ find: true, own: true, a: "white things", b: "black things", relation: "con", ex: {}, why: {}, uiOwn: true, step: 1 });
  expect(Object.keys(await stored(page, "skips")), "the skipped pair stays as it was kept").toEqual(["f_con_test_white_black"]);
});

test("Review on the Path: the totals, the mistakes with Retry, a favorite and a pair skipped", async ({ page }) => {
  await seed(page, { answers: [answer], favorites: [fav], skips: [skip] });
  await openReview(page);
  await section(page, "Totals");
  await expect(page.locator("#path .pgh").first()).toContainText("1 pair answered, the relation right 0%");
  await expect(page.locator("#path .pstat")).toHaveCount(4);   // one line for each relation
  await section(page, "Mistakes");
  await expect(rows(page)).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Retry 1 mistake" })).toBeVisible();
  await section(page, "Favorites");
  await expect(rows(page)).toHaveCount(1);
  await rows(page).first().locator(".trb").click();
  await expect(page.locator("#path .pfold")).toContainText("a clear pipe");
  await page.locator("#path .pfold").getByRole("button", { name: "Remove" }).click();
  await expect(rows(page)).toHaveCount(0);
  await expect.poll(async () => Object.keys(await stored(page, "favorites"))).toEqual([]);
  await section(page, "Skipped");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("red things · square things");
  await rows(page).first().getByRole("button", { name: "Remove" }).click();
  await expect.poll(async () => Object.keys(await stored(page, "skips"))).toEqual([]);
  await expect(page.locator("#path .prseg button").filter({ hasText: /^Skipped/ })).toHaveCount(0);   // a section with nothing left goes
  await expect(page.locator(".ppage .ptitle")).toHaveText("Review");
});

test("Review on the Path has no Terms section: the terms met are on the Progression page", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#path .chs .crow")).toHaveCount(5);
  await openReview(page);
  await expect(page.locator("#path .prseg button")).not.toHaveCount(0);
  await expect(page.locator("#path .prseg button").filter({ hasText: /^Terms/ })).toHaveCount(0);
});

test("Review on the Path: a flag unfolds into what the tutor said and the note, and is edited and deleted there", async ({ page }) => {
  await giveKey(page); // flagging needs the Magic Key, also in a run without the course data
  await seed(page, { answers: [answer], flags: [flag] });
  await openReview(page);
  await section(page, "Flags");
  await expect(rows(page)).toHaveCount(1);
  await expect(rows(page).first()).toContainText("round things · wooden things");
  await rows(page).first().locator(".trb").click();
  const said = page.locator("#path .psaid");
  await expect(said).toContainText("a wooden bowl is both");
  await expect(said).toContainText("Your note: A bowl can be square.");
  await expect(said).toContainText("It should be: a round wooden bowl");
  await expect(page.locator("#path .pfold .exr")).toHaveCount(4);   // the answer it was made on
  await page.locator("#path .pfold").getByRole("button", { name: "Edit" }).click();
  await expect(page.locator("#flag-note")).toHaveValue("A bowl can be square.");
  await page.locator("#flag-note").fill("A bowl need not be round.");
  await page.locator("#path .pflag").getByRole("button", { name: "Submit" }).click();
  await expect(said).toContainText("Your note: A bowl need not be round.");
  await expect.poll(async () => (await stored(page, "flags")).fl_cell?.note).toBe("A bowl need not be round.");
  await page.locator("#path .pfold").getByRole("button", { name: "Delete" }).click();
  await expect.poll(async () => Object.keys(await stored(page, "flags"))).toEqual([]);
});

// the tutor, as in path.spec.js: the app's server stands in with routes, and needs the Magic Key (tests/support/test.js)
const withKey = withCourse ? test : test.skip;
const sse = (...events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const say = (text) => sse({ type: "delta", text }, { type: "done", truncated: false });

withKey("the tutor's page: a follow-up question, the answer above it, and a flag on the answer", async ({ page }, testInfo) => {
  const said = ["The first stand-in answer.", "The second stand-in answer."];
  let n = 0;
  await page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, tutor: "on" }) }));
  await page.route("**/api/tutor", (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body: say(said[Math.min(n++, 1)]) }));
  await page.goto("/");
  await page.locator("#path .chs .crow").first().click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (let i = 0; i < 4 && (await field.isVisible()); i++) { await field.fill("thing " + (i + 1)); if ((await field.getAttribute("enterkeyhint")) === "done") { await field.blur(); break; } await field.press("Enter"); }   // (the last one is left without Enter, which would take the Check at once)
  await page.locator("#stn").click();
  await page.locator(".cwex .crow").click();   // Explain, a choice beside the line (path/wait.tsx)
  await expect(page.locator(".wtext")).toContainText("The first stand-in answer.");
  await page.getByRole("button", { name: "Ask a follow-up" }).click();
  const talk = page.locator("#path .ptalk");
  if (!isPhone(testInfo)) await expect(page.locator("#ask-in")).toBeFocused();   // a touch screen keeps the keyboard down
  await page.locator("#ask-in").fill("Is a thought round?");
  await page.locator("#ask-in").press("Enter");
  await expect(talk.locator(".pans2")).toHaveCount(2);
  await expect(talk.locator(".pans2").first()).toContainText("The second stand-in answer.");   // the newest first, above its question
  await expect(talk.locator(".pq2").first()).toContainText("Is a thought round?");
  await talk.locator(".pans2").first().locator(".pflg").click();
  await page.locator("#flag-note").fill("A thought has no shape.");
  await page.locator("#path .pflag").getByRole("button", { name: "Submit" }).click();
  await expect(talk.locator(".pans2").first().locator(".pflg")).toHaveClass(/\bon\b/);
  await expect.poll(async () => Object.values(await stored(page, "flags")).map((f) => [f.part, f.asked, f.note])).toEqual([["chat", "Is a thought round?", "A thought has no shape."]]);
  if (isPhone(testInfo)) await page.evaluate(() => /** @type {HTMLElement} */ (document.activeElement)?.blur());   // the keyboard down: the foot is back
  await page.getByRole("button", { name: /^Back to the result/ }).click();
  await expect(page.locator(".pvline")).toBeVisible();
});
