// Find a pair, the Relations exercise the other way round: the page gives a relation, the learner names the two phenomena and writes an example for
// each cell the relation leaves possible. A pair of the course data is graded on the spot; a pair of the learner's own words waits for the tutor,
// which the specs stand in for with routes (tutor.spec.js). The relation asked for is drawn, so a spec picks the one it needs in the relation picker (which also keeps it).
import { test, expect } from "../../support/test.js";
import { goTo, openMenu, ready, isPhone, overflow, relOptions } from "../../support/page.js";
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
const goFind = async (page) => {
  await goTo(page, "Find a pair");
  await expect(page.locator("#fw-a")).toBeVisible();
};
const relation = async (page) => (await page.locator("#stage .head .subt").innerText()).replace(/ · your choice$/, "");
/** Skip: the button at the left of the pair bar. */
const skip = (page) => page.locator(".pbar .skipw");
/** Skip once the pair is named: the question before a skip is answered with "Skip anyway". */
async function skipOut(page) {
  await skip(page).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Skip anyway" }).click();
}
const skipDocs = (page) => page.evaluate(async () => (await (await window.__riglam.platform.db()).collection("skips").get()).docs.map((d) => d.data()));
/** Picks the relation in the picker, which the diamond opens; it stays the relation asked for until Random is picked. */
async function askFor(page, name) {
  if (!(await page.locator(".rels").count())) await page.locator("#stage .head .mid").click();
  await page.locator(".rels .rel").filter({ has: page.getByText(name, { exact: true }) }).click();
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
  await page.locator(".pbar .fwd").click(); // Check
}
const saved = (page) => page.evaluate(async () => (await (await window.__riglam.platform.db()).collection("answers").get()).docs.map((d) => d.data()));
const headline = (page) => page.locator(".verdict .vl .v").first();
const withKey = withCourse ? test : test.skip;

test("the tab gives a relation, wants two different phenomena, and fits the width", async ({ page }, testInfo) => {
  await open(page);
  await goFind(page);
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
  await skip(page).click(); // before a pair is named Skip only asks for another relation, and never the same one
  expect(await relation(page)).not.toBe(before);
  await expect(page.locator("#fw-a")).toHaveValue("forms"); // the words stay
  expect(await skipDocs(page)).toHaveLength(0); // nothing was set aside
});

test("a pair of the learner's own with every cell filled keeps the Cells chip open until Claude has judged the relation", async ({ page }, testInfo) => {
  await open(page);
  await goFind(page, testInfo);
  await askFor(page, "Four possibilities");
  await usePair(page, "red apples", "pears");
  await examples(page, testInfo, { both: "a red pear", anb: "a red apple", bna: "a green pear", nei: "a stone" });
  await expect(headline(page)).toHaveText("Your pair is waiting for Claude.");
  const cells = page.locator(".vchip", { hasText: "Cells" });
  await expect(cells).toHaveClass(/open/); // not the green check: which cells stay empty is for the relation Claude finds
  await cells.click();
  await expect(page.locator(".vpanel")).toContainText("depends on the relation Claude finds");
});

test("the grid of the pair rows does not reach the Flag label of the other exercises", async ({ page }) => {
  await open(page);
  await page.evaluate(() => { const s = document.createElement("span"); s.className = "fw"; s.id = "other-fw"; s.textContent = "Flag"; document.body.append(s); });
  expect(await page.locator("#other-fw").evaluate((n) => getComputedStyle(n).display)).not.toBe("grid");
});

test("Enter in the first field always moves to the second, and only Enter in the second uses the pair", async ({ page }, testInfo) => {
  await open(page);
  await goFind(page, testInfo);
  await page.fill("#fw-a", "red apples");
  await page.fill("#fw-b", "pears");
  await page.locator("#fw-a").press("Enter"); // both are filled, and the first is where the cursor is: it still goes to the second
  await expect(page.locator("#fw-b")).toBeFocused();
  await expect(page.locator("#fw-a")).toBeVisible(); // the pair step is still open
  await page.locator("#fw-b").press("Enter");
  await expect(page.locator("#fw-a")).toBeHidden();
});

test("a pair of the course data is graded on the spot, and the answer is kept apart from the Relations answers", async ({ page }, testInfo) => {
  await open(page);
  await goFind(page);
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
  // the answer is counted in today's line of the menu, but it is not a Relations answer: the Relations row has nothing to continue
  await openMenu(page);
  await expect(page.locator("#menu .mtoday")).toContainText(/1 pair/i);
  await expect(page.locator("#menu .mrow", { hasText: "Relations" })).not.toContainText(/continue/i);
});

test("a pair that does not have the relation asked for is wrong, and says which relation it has", async ({ page }, testInfo) => {
  await open(page);
  await goFind(page);
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
  await goFind(page);
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
  await goFind(page);
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
    'Relation: Mutually exclusive => unsure\nA not B: "a red apple" | class: Apple | A yes: it is a red apple | B yes: it is a pear\nExplanation: FIRST-ANSWER',
    'Relation: Four possibilities => no\nA not B: "a red apple" | class: Apple | A yes: it is a red apple | B no: it is an apple\nExplanation: SECOND-ANSWER',
  ]);
  await goFind(page);
  await askFor(page, "Mutually exclusive");
  await usePair(page, "red apples", "pears");
  await examples(page, testInfo, { anb: "a red apple", bna: "a green pear", nei: "a stone" });
  await page.getByRole("button", { name: /^explain$|check and explain/i }).click();
  await expect(headline(page)).toHaveText("Claude could not settle your pair.");
  await expect.poll(async () => (await saved(page))[0].cells.anb.verdict).toBe("bad"); // the first answer turned the example down
  await expect(page.locator(".vpanel")).toContainText("FIRST-ANSWER"); // and what Claude said about it is shown, though the pair is not judged yet
  await expect(page.getByRole("button", { name: /^Discuss with AI/ })).toBeVisible(); // the follow-up chat stays next to Ask again
  await page.getByRole("button", { name: /^Discuss with AI/ }).click();
  await expect(page.locator("#over .ctx")).toContainText("pair not settled"); // not "relation and cells right": the pair is not judged
  await expect(page.locator("#over .ctx")).not.toContainText("cells right");
  await page.locator("#over .oc").click(); // the chat's close button
  await page.getByRole("button", { name: "Ask again" }).click();
  await expect(headline(page)).toHaveText("That pair is not mutually exclusive.");
  expect(asked).toHaveLength(2);
  await expect(page.locator(".vpanel")).toContainText("SECOND-ANSWER"); // the Why panel opens on its own when Claude answers
  await expect(page.locator(".vpanel")).not.toContainText("FIRST-ANSWER");
  await expect.poll(async () => (await saved(page))[0].cells.anb.verdict).toBe("ok"); // and the second answer took the example back
});

test("the singular form of a compound label names the category, so the pair is graded on the spot", async ({ page }, testInfo) => {
  await open(page);
  await goFind(page);
  await usePair(page, "a thing that changes", "a thing you can eat");
  expect(await page.evaluate(() => [window.__t.cur.p.own, window.__t.cur.p.a, window.__t.cur.p.b])).toEqual([undefined, "things that change", "things you can eat"]);
});

test("Review does not say a cell is empty, or give a reference, when Claude has not judged the pair", async ({ page }, testInfo) => {
  await open(page);
  await goFind(page);
  await askFor(page, "Mutually exclusive");
  await usePair(page, "red apples", "pears");
  await examples(page, testInfo, { anb: "a red apple", bna: "a green pear" }); // Neither is left blank
  await expect(headline(page)).toHaveText("Your pair is waiting for Claude.");
  await goTo(page, "Review");
  await page.locator("#stage .favs.mist summary").first().click();
  const body = page.locator("#stage .xbody");
  await expect(body).toContainText("Claude had not judged the pair.");
  await expect(body).toContainText("Empty by the relation asked for.");
  await expect(body).not.toContainText("Nothing goes here.");
  await expect(body).toContainText("No answer");
  await expect(body).not.toContainText("horn of a rabbit"); // the page has no reference for a pair it does not know
});

test("Practice this pair in Review starts that pair after an answer in Relations and a visit to Find a pair", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the answer flow is exercised in the phone layout");
  await open(page);
  const mine = await page.evaluate(() => `${window.__t.cur.p.a} / ${window.__t.cur.p.b}`);
  await relOptions(page).first().click();
  for (let i = 0; i < 4 && (await page.locator("#cin").isVisible()); i++) {
    await page.fill("#cin", "thing " + (i + 1));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
  }
  await page.getByRole("button", { name: "Add to favorites" }).click();
  await goTo(page, "Find a pair");
  await goTo(page, "Review");
  const seg = page.locator(".rseg button", { hasText: /^Favorites/ });
  if (await seg.count()) await seg.click();
  await page.locator(".favs > li summary").first().click();
  await page.getByRole("button", { name: "Practice this pair" }).first().click();
  await expect(page.locator(".retry-tag")).toContainText("Favorite"); // the favorite itself, not the pair the tab switch drew
  expect(await page.evaluate(() => `${window.__t.cur.p.a} / ${window.__t.cur.p.b}`)).toBe(mine);
});

test("Review counts the Find a pair answers on their own", async ({ page }, testInfo) => {
  await open(page);
  await goFind(page);
  await askFor(page, "Mutually exclusive");
  await usePair(page, "forms", "minds");
  await examples(page, testInfo, await page.evaluate(() => window.__t.cur.p.ex));
  await expect(headline(page)).toHaveText("Right.");
  await goTo(page, "Review");
  const review = page.locator("#stage");
  await expect(review).toContainText("No practice answers yet"); // none of Relations
  await expect(review.locator(".label", { hasText: "Find a pair" })).toContainText("1 pairs, pair right 100%");
  await review.locator(".favs.mist summary").first().click();
  await expect(review.locator(".xbody")).toContainText("Asked for: mutually exclusive. The pair has it.");
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("the learner picks the relation, it stays for the next pairs and after a reload until Random is picked", async ({ page }, testInfo) => {
  await open(page);
  await goFind(page, testInfo);
  await page.getByRole("button", { name: "Choose relation" }).click();
  const items = page.locator(".rels .rel");
  await expect(items).toHaveCount(6); // Random and the five relations
  await expect(items.first()).toHaveAttribute("aria-pressed", "true");
  await expect(items.first()).toContainText("A different relation each time");
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.keyboard.press("Escape");
  await expect(page.locator(".rels")).toHaveCount(0);
  await askFor(page, "Four possibilities");
  await expect(page.locator("#stage .head .subt")).toHaveText("Four possibilities · your choice");
  expect(await page.evaluate(() => localStorage.getItem("rd-findrel"))).toBe("4");
  await expect(skip(page)).toBeDisabled(); // no pair to set aside, and this is the relation they want
  await expect(page.getByRole("button", { name: "Change relation" })).toBeVisible();
  await usePair(page, "my cat", "my dog");
  await examples(page, testInfo, { both: "a pet", anb: "a cat", bna: "a dog", nei: "a stone" });
  await page.getByRole("button", { name: "Next relation" }).click();
  expect(await relation(page)).toBe("Four possibilities");
  await page.reload();
  await expect(page.locator("#fw-a")).toBeVisible(); // the app opens on the exercise used last
  expect(await relation(page)).toBe("Four possibilities");
  await page.locator("#stage .head .mid").click(); // back to Random: another relation at once, and no more choice
  await page.locator(".rels .rel").first().click();
  expect(await page.evaluate(() => localStorage.getItem("rd-findrel"))).toBeNull();
  expect(await relation(page)).not.toBe("Four possibilities");
  await expect(page.locator("#stage .head .subt")).not.toContainText("your choice");
  await expect(skip(page)).toBeEnabled();
});

test("picking another relation after the pair is named keeps the pair and the examples that still fit", async ({ page }, testInfo) => {
  await open(page);
  await goFind(page, testInfo);
  await askFor(page, "Four possibilities");
  await usePair(page, "my cat", "my dog");
  await page.evaluate(() => { const u = window.__t.ui; u.cells.both.t = "a pet"; u.cells.anb.t = "a cat"; });
  await askFor(page, "Mutually inclusive"); // leaves the A, not B and B, not A cells empty
  expect(await page.evaluate(() => { const u = window.__t.ui; return [u.rel, u.step, u.cells.both.t, u.cells.anb.t, window.__t.cur.p.relation]; })).toEqual(["mi", 1, "a pet", "", "mi"]);
  await expect(page.locator("#stage .head .tx.ta")).toHaveText("my cat");
  await expect(page.locator("#stage .head .tx.tb")).toContainText("my dog");
  await examples(page, testInfo, { both: "a pet", nei: "a stone" });
  await expect(headline(page)).toHaveText("Your pair is waiting for Claude.");
});

test("Skip once the pair is named sets it aside without examples, Undo gives it back, and Review opens it again", async ({ page }, testInfo) => {
  await open(page);
  await goFind(page, testInfo);
  await askFor(page, "Mutually inclusive");
  await page.locator("#stage .head .mid").click(); // back to Random: Skip asks for another relation before a pair is named
  await page.locator(".rels .rel").first().click();
  await usePair(page, "my cat", "my dog");
  await page.evaluate(() => { const u = window.__t.ui; u.cells.both.t = "a pet"; }); // a start that is not finished
  const rel = await page.evaluate(() => window.__t.ui.rel);
  await skipOut(page);
  await expect(page.locator("#fw-a")).toHaveValue(""); // the next relation, no pair named yet
  await expect.poll(async () => (await skipDocs(page)).length).toBe(1);
  const [doc] = await skipDocs(page);
  expect(doc).toMatchObject({ from: "find", asked: rel, a: "my cat", b: "my dog", n: 1 });
  expect(doc.key).toMatch(new RegExp("^f_" + rel + "_"));
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await skipDocs(page)).length).toBe(0);
  await expect(page.locator("#stage .head .tx.ta")).toHaveText("my cat"); // the same screen, with what was written
  expect(await page.evaluate(() => window.__t.ui.cells.both.t)).toBe("a pet");
  await page.evaluate(() => (document.activeElement instanceof HTMLElement) && document.activeElement.blur());
  await page.keyboard.press("s"); // the key does the same, and asks the same question
  await page.getByRole("alertdialog").getByRole("button", { name: "Skip anyway" }).click();
  await expect.poll(async () => (await skipDocs(page)).length).toBe(1);
  await goTo(page, "Review");
  const li = page.locator(".skips li");
  await expect(li).toContainText("my cat / my dog");
  await expect(li).toContainText("Find a pair, ");
  await li.getByRole("button", { name: "Practice" }).click();
  await expect(page.locator("#stage .head .tx.ta")).toHaveText("my cat");
  expect(await page.evaluate(() => [window.__t.ui.rel, window.__t.ui.step, window.__t.tab])).toEqual([rel, 1, "find"]);
  await examples(page, testInfo, { both: "a pet", anb: "a cat", bna: "a dog", nei: "a stone" });
  await expect(headline(page)).toHaveText("Your pair is waiting for Claude.");
  await expect.poll(async () => (await skipDocs(page)).length).toBe(0); // answering the pair takes it off the list
});

test("The settings of Find a pair can turn the suggestions of the pair fields off, and a course term is still recognized", async ({ page }, testInfo) => {
  await open(page);
  await goFind(page, testInfo);
  await expect(page.locator("#fw-a")).toHaveAttribute("list", "fw-terms");
  expect(await page.locator("#fw-terms option").count()).toBeGreaterThan(5);
  await page.locator("#msess").click();
  const row = page.locator("#over .orow", { hasText: "Suggest terms" });
  await expect(row).toContainText("without the list steering you");
  await row.getByRole("switch").click();
  expect(await page.evaluate(() => localStorage.getItem("rd-findsuggest"))).toBe("0");
  await page.keyboard.press("Escape");
  expect(await page.locator("#fw-a").getAttribute("list")).toBeNull();
  await expect(page.locator("#fw-terms")).toHaveCount(0);
  await usePair(page, "forms", "minds");
  expect(await page.evaluate(() => window.__t.cur.p.own)).toBeUndefined(); // typed by hand, still the categories of the course
});

test("a different relation after Change pair keeps the examples the new relation leaves possible", async ({ page }, testInfo) => {
  await open(page);
  await goFind(page, testInfo);
  await askFor(page, "Four possibilities");
  await usePair(page, "my cat", "my dog");
  await page.evaluate(() => { const u = window.__t.ui; u.cells.nei.t = "a stone"; }); // Neither is possible in every relation
  await (isPhone(testInfo) ? page.locator("#steps button").first() : page.getByRole("button", { name: "Change pair" })).click();
  await expect(page.locator("#fw-a")).toBeVisible();
  await page.locator("#stage .head .mid").click();
  await page.locator(".rels .rel").first().click(); // Random: another relation at once
  expect(await relation(page)).not.toBe("Four possibilities");
  expect(await page.evaluate(() => window.__t.ui.cells.nei.t)).toBe("a stone");
  await page.getByRole("button", { name: "Use this pair" }).click(); // the same words: the examples are still there
  expect(await page.evaluate(() => window.__t.ui.cells.nei.t)).toBe("a stone");
});

test("Next relation in Random mode never asks for the relation just given", async ({ page }, testInfo) => {
  await open(page);
  await goFind(page, testInfo);
  await askFor(page, "Mutually inclusive");
  await usePair(page, "my cat", "my dog");
  await page.locator("#stage .head .mid").click(); // back to Random for the next pairs; this pair keeps its relation
  await page.locator(".rels .rel").first().click();
  await page.evaluate(() => { Math.random = () => 0; }); // the draw would take the first relation of the list, the one just given, if it were allowed
  await examples(page, testInfo, { both: "a pet", nei: "a stone" });
  await page.getByRole("button", { name: "Next relation" }).click();
  expect(await relation(page)).not.toBe("Mutually inclusive");
});

test("a skip that could not be saved is undone and said on the screen", async ({ page }, testInfo) => {
  await open(page);
  await goFind(page, testInfo);
  await askFor(page, "Mutually inclusive");
  await usePair(page, "my cat", "my dog");
  await page.evaluate(async () => { // the skips collection refuses writes
    const db = await window.__riglam.platform.db(), real = db.collection.bind(db);
    db.collection = (name) => (name === "skips" ? { doc: () => ({ set: async () => { throw Object.assign(new Error("full"), { code: "quota_exceeded" }); }, delete: async () => {} }) } : real(name));
  });
  await skipOut(page);
  await expect(page.locator("#stage .status")).toContainText("The skip could not be saved (quota_exceeded), so it was undone.");
  expect(await page.evaluate(() => Object.keys(window.__t.skips).length)).toBe(0);
});

test("a pair opened again from Review counts as asked, so the next relation is a different one", async ({ page }, testInfo) => {
  await open(page);
  await goFind(page, testInfo);
  await askFor(page, "Mutually inclusive");
  await usePair(page, "my cat", "my dog");
  await skipOut(page);
  await askFor(page, "Four possibilities"); // the history of asked relations now ends here
  await usePair(page, "red apples", "pears");
  await page.locator("#stage .head .mid").click();
  await page.locator(".rels .rel").first().click(); // Random for the next pairs; this pair keeps four possibilities
  await goTo(page, "Review");
  await page.locator(".skips li").getByRole("button", { name: "Practice" }).click();
  expect(await relation(page)).toBe("Mutually inclusive");
  await page.evaluate(() => { Math.random = () => 0; }); // the draw would take the first relation of the list, which is this one, if only the other were left out
  await examples(page, testInfo, { both: "a pet", nei: "a stone" });
  await page.getByRole("button", { name: "Next relation" }).click();
  expect(await relation(page)).not.toBe("Mutually inclusive");
});

test("a skipped pair answered for another relation and then again for its own keeps both answers", async ({ page }, testInfo) => {
  await open(page);
  await goFind(page, testInfo);
  await askFor(page, "Mutually inclusive");
  await usePair(page, "my cat", "my dog");
  await skipOut(page);
  await expect.poll(async () => (await skipDocs(page)).length).toBe(1);
  await goTo(page, "Review");
  await page.locator(".skips li").getByRole("button", { name: "Practice" }).click();
  await askFor(page, "Four possibilities"); // another relation: the skip, kept under the first one, stays on the list
  await examples(page, testInfo, { both: "a pet", anb: "a cat", bna: "a dog", nei: "a stone" });
  await expect(headline(page)).toHaveText("Your pair is waiting for Claude.");
  await expect.poll(async () => (await saved(page)).length).toBe(1);
  await expect.poll(async () => (await skipDocs(page)).length).toBe(1);
  await goTo(page, "Review");
  await page.locator(".skips li").getByRole("button", { name: "Practice" }).click();
  expect(await relation(page)).toBe("Mutually inclusive");
  await examples(page, testInfo, { both: "a pet", nei: "a stone" });
  await expect(headline(page)).toHaveText("Your pair is waiting for Claude.");
  await expect.poll(async () => (await saved(page)).length).toBe(2);
  const ids = (await saved(page)).map((d) => d.pairId);
  expect(new Set(ids).size).toBe(2);
});
