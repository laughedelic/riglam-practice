// Find a pair, the Relations exercise the other way round: the page gives a relation, the learner names the two phenomena and writes an example for
// each cell the relation leaves possible. A pair of the course data is graded on the spot; a pair of the learner's own words waits for the tutor,
// which the specs stand in for with routes (tutor.spec.js). The relation asked for is drawn, so a spec asks for another until it has the one it needs.
import { test, expect } from "../../support/test.js";
import { ready, isPhone, overflow } from "../../support/page.js";
import { withCourse } from "../../support/data-key.js";

const sse = (...events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const say = (text) => sse({ type: "delta", text }, { type: "done", truncated: false });

/** The page with a hook on its internals, and a stand-in server whose tutor answers `text` to every question (a list: to the first question the first, and so on, the last one again after that). */
async function open(page, text = "Stand-in tutor: no verdict.") {
  await page.addInitScript(() => { window.__riglamTest = (api) => { window.__t = api; }; });
  const asked = [], replies = [].concat(text);
  await page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, tutor: "on" }) }));
  await page.route("**/api/tutor", (route) => {
    asked.push(route.request().postDataJSON());
    return route.fulfill({ status: 200, contentType: "text/event-stream", body: say(replies[Math.min(asked.length, replies.length) - 1]) });
  });
  await page.goto("/");
  await ready(page);
  return asked;
}
const goFind = async (page, testInfo) => {
  await (isPhone(testInfo) ? page.locator(".tabbar button", { hasText: "Find a pair" }) : page.locator(".rail .nv", { hasText: "Find a pair" })).click();
  await expect(page.locator("#fw-a")).toBeVisible();
};
const relation = (page) => page.locator("#stage .head .subt").innerText();
/** Asks for another relation until the page gives this one. */
async function askFor(page, name) {
  for (let i = 0; i < 80 && (await relation(page)) !== name; i++) await page.getByRole("button", { name: "Another relation" }).click();
  expect(await relation(page)).toBe(name);
}
async function usePair(page, a, b) {
  await page.fill("#fw-a", a);
  await page.fill("#fw-b", b);
  await page.getByRole("button", { name: "Use this pair" }).click();
}
const CELL = { "Both A and B": "both", "A, not B": "anb", "B, not A": "bna", "Neither A nor B": "nei" };
/** Writes the example of each cell the relation leaves possible (`ex` by cell), then asks for the result. */
async function examples(page, testInfo, ex) {
  if (isPhone(testInfo)) {
    for (let i = 0; i < 4 && (await page.locator("#cin").isVisible()); i++) {
      const cell = CELL[await page.locator(".cwho small").innerText()];
      await page.fill("#cin", ex[cell] || "");
      await page.keyboard.press("Enter");
      await page.waitForTimeout(60);
    }
    return;
  }
  for (const cell of ["both", "anb", "bna", "nei"]) if (await page.locator("#in-" + cell).count()) await page.fill("#in-" + cell, ex[cell] || "");
  await page.getByRole("button", { name: "Show result" }).click();
}
const saved = (page) => page.evaluate(async () => (await (await window.__riglam.platform.db()).collection("answers").get()).docs.map((d) => d.data()));
const headline = (page) => page.locator(".verdict .vl .v").first();
const withKey = withCourse ? test : test.skip;

test("the tab gives a relation, wants two different phenomena, and fits the width", async ({ page }, testInfo) => {
  await open(page);
  await goFind(page, testInfo);
  await expect(page.locator(".tabbar button, .rail .nv").filter({ visible: true })).toHaveCount(isPhone(testInfo) ? 4 : 5); // the three exercises and Review (and Options in the rail)
  expect(["Mutually inclusive", "Mutually exclusive", "Three possibilities, A in B", "Three possibilities, B in A", "Four possibilities"]).toContain(await relation(page));
  const go = page.getByRole("button", { name: "Use this pair" });
  await expect(go).toBeDisabled();
  await page.fill("#fw-a", "forms");
  await expect(go).toBeDisabled();
  await page.fill("#fw-b", "a form");
  await go.click();
  await expect(page.locator(".ferr")).toHaveText("Name two different phenomena.");
  await expect(page.locator("#fw-a")).toBeVisible(); // still naming the pair
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  const before = await relation(page);
  let other = before;
  for (let i = 0; i < 30 && other === before; i++) {
    await page.getByRole("button", { name: "Another relation" }).click();
    other = await relation(page);
  }
  expect(other).not.toBe(before);
  await expect(page.locator("#fw-a")).toHaveValue("forms"); // the words stay
});

test("a pair of the course data is graded on the spot, and the answer is kept apart from the Relations answers", async ({ page }, testInfo) => {
  await open(page);
  await goFind(page, testInfo);
  await askFor(page, "Mutually exclusive");
  await usePair(page, "forms", "minds");
  const ex = await page.evaluate(() => window.__t.cur.p.ex);
  expect(ex.anb && ex.bna && ex.nei).toBeTruthy();
  expect(await page.evaluate(() => window.__t.cur.p.own)).toBeUndefined();
  await examples(page, testInfo, ex);
  await expect(headline(page)).toHaveText("Right.");
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  const [doc] = await expect.poll(async () => (await saved(page)).length).toBe(1).then(() => saved(page));
  expect(doc).toMatchObject({ mode: "find", a: "forms", b: "minds", chosen: "con", key: "con", correct: true, grade: "ok" });
  expect(doc.relOpen).toBeUndefined();
  // not a Relations answer: the Today count of Relations stays at nothing
  await (isPhone(testInfo) ? page.locator(".tabbar button", { hasText: "Relations" }) : page.locator(".rail .nv", { hasText: "Relations" })).click();
  await expect(page.locator("#today")).toContainText("nothing answered yet");
});

test("a pair that does not have the relation asked for is wrong, and says which relation it has", async ({ page }, testInfo) => {
  await open(page);
  await goFind(page, testInfo);
  await askFor(page, "Mutually inclusive");
  await usePair(page, "forms", "minds");
  await examples(page, testInfo, { both: "a stone", anb: "a cup of hot tea", bna: "tasting sugar", nei: "a dog" });
  await expect(headline(page)).toHaveText("That pair is not mutually inclusive.");
  await expect(page.locator(".vpanel")).toContainText("mutually exclusive"); // the first chip that is not fine opens by itself
  const [doc] = await expect.poll(async () => (await saved(page)).length).toBe(1).then(() => saved(page));
  expect(doc).toMatchObject({ mode: "find", chosen: "mi", key: "con", correct: false });
});

withKey("a pair of the learner's own words waits for the tutor, which judges the relation and the examples", async ({ page }, testInfo) => {
  const reply = [
    "Relation: Mutually exclusive => yes",
    'A not B: "a red apple" | class: Apple | A yes: it is a red apple | B no: it is an apple',
    'B not A: "a green pear" | class: Pear | A no: it is a pear | B yes: it is a green pear',
    'Neither: "a stone" | class: External form | A no: it is a stone | B no: it is a stone',
    "Common locus: none.",
  ].join("\n");
  const asked = await open(page, reply);
  await goFind(page, testInfo);
  await askFor(page, "Mutually exclusive");
  await usePair(page, "red apples", "pears");
  expect(await page.evaluate(() => window.__t.cur.p.own)).toBe(true);
  await examples(page, testInfo, { anb: "a red apple", bna: "a green pear", nei: "a stone" });
  await expect(headline(page)).toHaveText("Your pair is waiting for Claude.");
  let [doc] = await expect.poll(async () => (await saved(page)).length).toBe(1).then(() => saved(page));
  expect(doc).toMatchObject({ mode: "find", chosen: "con", correct: false, relOpen: true, grade: "pend" });

  await page.getByRole("button", { name: /^explain$|check and explain/i }).click();
  await expect(headline(page)).toHaveText("Right.");
  expect(asked).toHaveLength(1);
  const sent = asked[0];
  expect(sent.kind).toBe("explain");
  expect(sent.cats).toEqual([]); // nothing of the course data is known about this pair, so no fine points are asked for
  expect(sent.turns[0].content).toContain("pair-finding mode");
  expect(sent.turns[0].content).toContain('A = "red apples", B = "pears".');
  expect(sent.turns[0].content).toContain("Relation: ");
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await expect.poll(async () => (await saved(page))[0].relOpen).toBeUndefined();
  [doc] = await saved(page);
  expect(doc).toMatchObject({ mode: "find", chosen: "con", key: "con", correct: true, grade: "ok" });
});

withKey("when the tutor says the pair has another relation, the answer is wrong and shows which one", async ({ page }, testInfo) => {
  const reply = ["Relation: Four possibilities => no", 'A not B: "a red apple" | class: Apple | A yes: it is a red apple | B no: it is an apple'].join("\n");
  await open(page, reply);
  await goFind(page, testInfo);
  await askFor(page, "Mutually exclusive");
  await usePair(page, "red apples", "red things");
  await examples(page, testInfo, { anb: "a red apple", bna: "a red rose", nei: "a stone" });
  await page.getByRole("button", { name: /^explain$|check and explain/i }).click();
  await expect(headline(page)).toHaveText("That pair is not mutually exclusive.");
  await page.locator(".vchip", { hasText: "Pair" }).click();
  await expect(page.locator(".vpanel")).toContainText("four possibilities");
  const [doc] = await saved(page);
  expect(doc).toMatchObject({ chosen: "con", key: "4", correct: false });
});

withKey("asking again after an answer that settled nothing shows the new explanation, not the first", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the explanation inside the result is the phone layout's; the wide one lists every turn");
  const asked = await open(page, [
    "Relation: Mutually exclusive => unsure\nExplanation: FIRST-ANSWER",
    "Relation: Four possibilities => no\nExplanation: SECOND-ANSWER",
  ]);
  await goFind(page, testInfo);
  await askFor(page, "Mutually exclusive");
  await usePair(page, "red apples", "pears");
  await examples(page, testInfo, { anb: "a red apple", bna: "a green pear", nei: "a stone" });
  await page.getByRole("button", { name: /^explain$|check and explain/i }).click();
  await expect(headline(page)).toHaveText("Claude could not settle your pair.");
  await page.getByRole("button", { name: "Ask again" }).click();
  await expect(headline(page)).toHaveText("That pair is not mutually exclusive.");
  expect(asked).toHaveLength(2);
  await expect(page.locator(".vpanel")).toContainText("SECOND-ANSWER"); // the Why panel opens on its own when Claude answers
  await expect(page.locator(".vpanel")).not.toContainText("FIRST-ANSWER");
});

test("Review does not say a cell is empty when Claude has not judged the pair", async ({ page }, testInfo) => {
  await open(page);
  await goFind(page, testInfo);
  await askFor(page, "Mutually exclusive");
  await usePair(page, "red apples", "pears");
  await examples(page, testInfo, { anb: "a red apple", bna: "a green pear", nei: "a stone" });
  await expect(headline(page)).toHaveText("Your pair is waiting for Claude.");
  await (isPhone(testInfo) ? page.locator(".tabbar button", { hasText: "Review" }) : page.locator(".rail .nv", { hasText: "Review" })).click();
  await page.locator("#stage .favs.mist summary").first().click();
  const body = page.locator("#stage .xbody");
  await expect(body).toContainText("Claude had not judged the pair.");
  await expect(body).toContainText("Empty by the relation asked for.");
  await expect(body).not.toContainText("Nothing goes here.");
});

test("Review counts the Find a pair answers on their own", async ({ page }, testInfo) => {
  await open(page);
  await goFind(page, testInfo);
  await askFor(page, "Mutually exclusive");
  await usePair(page, "forms", "minds");
  await examples(page, testInfo, await page.evaluate(() => window.__t.cur.p.ex));
  await expect(headline(page)).toHaveText("Right.");
  await (isPhone(testInfo) ? page.locator(".tabbar button", { hasText: "Review" }) : page.locator(".rail .nv", { hasText: "Review" })).click();
  const review = page.locator("#stage");
  await expect(review).toContainText("No practice answers yet"); // none of Relations
  await expect(review.locator(".label", { hasText: "Find a pair" })).toContainText("1 pairs, pair right 100%");
  await review.locator(".favs.mist summary").first().click();
  await expect(review.locator(".xbody")).toContainText("Asked for: mutually exclusive. The pair has it.");
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});
