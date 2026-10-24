// Review and the tutor's conversation on the Path (src/app/path/review.tsx, tutor.tsx): today's trail and the other sections, a row that
// unfolds into the answer as it was checked, the favorites, the pairs skipped and the flags, and the conversation as a page with a flag on
// each answer. The answers, favorites, skips and flags are written to the device's database before the page starts, so the tests do not
// depend on which pair the page draws. What is counted and stored is the classic page's (review.spec.js, flags-review.spec.js).
import { test, expect } from "../../support/test.js";
import { giveKey, withCourse } from "../../support/data-key.js";
import { isPhone } from "../../support/page.js";

const onPath = () => { if (localStorage.getItem("rd-design") === null) localStorage.setItem("rd-design", "path"); };
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
  await page.addInitScript(onPath);
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
  await expect(fold).toContainText("Checked by the tutor.");
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
  await page.addInitScript(onPath);
  await page.goto("/");
  await page.locator("#path .chs .crow").first().click();
  const field = page.locator("#cin");
  await expect(field).toBeVisible();
  for (let i = 0; i < 4 && (await field.isVisible()); i++) { await field.fill("thing " + (i + 1)); if ((await field.getAttribute("enterkeyhint")) === "done") { await field.blur(); break; } await field.press("Enter"); }   // (the last one is left without Enter, which would take the Check at once)
  await page.locator("#stn").click();
  await page.locator(".wrow").filter({ hasText: "Why" }).click();
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
