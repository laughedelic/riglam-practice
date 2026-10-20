// Syllogisms: "Take a tomato. It follows it is food because it is red." The learner accepts it, denies the reason or denies the pervasion. What is right comes from the
// rules in src/domain/syllogism.ts (tests/unit/syllogism.test.ts); these specs are about the page around them: the replies and the keys, the counter-example step, the
// result, the answer that is kept, the attempt that waits in the menu, the options and the width. The syllogism is drawn, so a spec asks the page for one of the
// kind it needs (the test hook's `next` draws until the situation fits) and reads what is right from the syllogism on screen.
import { test, expect } from "../../support/test.js";
import { goTo, isPhone, openMenu, ready, overflow } from "../../support/page.js";

const REPLY = { reason: 0, pervasion: 1, accept: 2 }; // in the order of the checks

async function open(page) {
  await page.addInitScript(() => { window.__riglamTest = (api) => { window.__t = api; }; });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Syllogisms");
  await expect(page.locator(".sylcard")).toBeVisible();
}
/**
 * Draws syllogisms until one of this situation is on screen (1 to 8, see SITUATIONS in the domain). With `need` "witness", one that has a counter-example other than
 * its subject; with "both", one for which the data has another thing that is the reason and the predicate.
 */
async function draw(page, situation, need = "") {
  const found = await page.evaluate(([s, n]) => {
    const things = () => window.__t.DATA.items.filter((i) => !i.ne && !i.comp && !i.body);
    const fits = (c) => c.situation === s && (n === "witness" ? c.witness && c.witness !== c.subject
      : n === "both" ? things().some((i) => i.n !== c.subject && i.c.includes(c.catR) && i.c.includes(c.catP)) : true);
    for (let i = 0; i < 600; i++) { if (fits(window.__t.cur.c)) return true; window.__t.next(); }
    return false;
  }, [situation, need]);
  expect(found, "situation " + situation).toBe(true);
  return page.evaluate(() => JSON.parse(JSON.stringify(window.__t.cur.c)));
}
const say = (page, reply) => page.locator(".sylask .sylsay").nth(REPLY[reply]).click();
const headline = (page) => page.locator(".sylres .vl .v");
const saved = (page) => page.evaluate(async () => (await (await window.__riglam.platform.db()).collection("answers").get()).docs.map((d) => d.data()));
const next = (page) => page.locator(".pbar .fwd");

test("the exercise is in the menu, gives a syllogism with three replies, in the order of the checks, that look different, and fits the width", async ({ page }) => {
  await open(page);
  await expect(page.locator("#mttl")).toHaveText("Syllogisms");
  await expect(page.locator(".sylt")).toContainText(/^(Take .+\. It follows it is .+ because it is .+\.|It follows that)/);
  await expect(page.locator(".sylask .sylsay")).toHaveText([/^1\s*The reason is not established/i, /^2\s*There is no pervasion/i, /^3\s*Accept/i]);
  // told apart at a glance: each reply has its own tint
  const tints = await page.locator(".sylask .sylsay").evaluateAll((bs) => bs.map((b) => getComputedStyle(b).backgroundColor));
  expect(new Set(tints).size).toBe(3);
  await expect(page.locator(".pbar .fwd")).toHaveCount(0); // nothing to go forward to before a reply
  // nothing repeats the name of the exercise above the card: no label on the card, no explaining sentence
  await expect(page.locator(".qnl, .cap")).toHaveCount(0);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  // the app opens on the exercise used last
  await page.reload();
  await expect(page.locator(".sylcard")).toBeVisible();
});

test("a right reply is Right and is kept in the answers, apart from the Relations lists", async ({ page }) => {
  await open(page);
  const c = await draw(page, 1); // the reason is established and the pervasion holds: accept
  expect(c.answer).toBe("accept");
  await say(page, "accept");
  await expect(headline(page)).toHaveText("Right.");
  await expect(page.locator(".sylres .sylconf")).toHaveCount(0);
  // one sheet, no tabs: the three checks with their lines, and nothing marked as a fault
  await expect(page.locator(".vchip, [role=tab]")).toHaveCount(0);
  await expect(page.locator(".sylchk")).toHaveCount(3);
  await expect(page.locator(".sylchk .sylch b")).toHaveText(["Reason", "Pervasion", "Thesis"]);
  await expect(page.locator(".sylchk.holds")).toHaveCount(3);
  await expect(page.locator(".sylchk .sylst")).toHaveText(["established", "holds", "true"]);
  await expect(page.locator(".sylchk.first")).toHaveCount(0);
  for (const k of ["e", "v", "t"]) await expect(page.locator(".sylchecks")).toContainText(c.checks[k].line);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  const [doc] = await expect.poll(async () => (await saved(page)).length).toBe(1).then(() => saved(page));
  expect(doc).toMatchObject({ mode: "syllogism", subject: c.subject, reason: c.reason, predicate: c.predicate, catA: c.catR, catB: c.catP, situation: 1, answer: "accept", said: "accept", correct: true, grade: "ok" });
  // today's line counts it, and Review has no Relations answers to show for it
  await openMenu(page);
  await expect(page.locator("#menu .mtoday")).toContainText(/1 pair/i);
  await goTo(page, "Review");
  await expect(page.locator("#stage.rv")).toBeVisible();
});

test("a wrong reply says what was mixed up; the sheet shows all three checks, the first that fails is marked, and a failed check is not marked as a wrong answer", async ({ page }) => {
  await open(page);
  const c = await draw(page, 3); // the reason is established, the conclusion is false, the pervasion fails: no pervasion
  expect(c.answer).toBe("pervasion");
  await say(page, "accept");
  await expect(headline(page)).toHaveText("Not quite.");
  await expect(page.locator(".sylres .sylwhat")).toContainText("You said “accept it”");
  await expect(page.locator(".sylres .sylwhat")).toContainText("The right reply is “there is no pervasion”");
  await expect(page.locator(".sylres .sylconf")).not.toBeEmpty();
  await expect(page.locator(".sylchk.first")).toContainText("Pervasion"); // the reason holds, so the pervasion is the first fault
  for (const k of ["e", "v", "t"]) await expect(page.locator(".sylchecks")).toContainText(c.checks[k].line); // all three at once
  // the pervasion fails with the class's phrase, not with a counter-example
  expect(c.checks.v.line).toBe(`Just because it is ${c.reason}, doesn't necessarily mean that it is ${c.predicate}.`);
  await expect(page.locator(".sylchecks")).not.toContainText(c.witness);
  await expect(page.locator(".sylchk.fails .sylst")).toHaveText(["no pervasion", "false"]);
  await expect(page.locator(".sylchk.holds .sylst")).toHaveText(["established"]);
  // a check that fails is not marked like the wrong answer: no cross, and not in the colour of the wrong answer
  await expect(page.locator(".sylchecks")).not.toContainText("✗");
  const [mark, fault] = await page.evaluate(() => [getComputedStyle(document.querySelector(".sylres .vl .v")).color, getComputedStyle(document.querySelector(".sylchk.fails .sylst")).color]);
  expect(fault).not.toBe(mark);
  const [doc] = await expect.poll(async () => (await saved(page)).length).toBe(1).then(() => saved(page));
  expect(doc).toMatchObject({ mode: "syllogism", situation: 3, answer: "pervasion", said: "accept", correct: false, grade: "bad" });
});

test("when both the reason and the pervasion fail, the reason comes first: denying the pervasion is wrong, and the result says it is not all wrong", async ({ page }) => {
  await open(page);
  const c = await draw(page, 8);
  expect(c.answer).toBe("reason");
  await say(page, "pervasion");
  await expect(headline(page)).toHaveText("Not quite.");
  await expect(page.locator(".sylres")).toHaveClass(/bad/);
  await expect(page.locator(".sylres .sylconf")).toContainText("You are not wrong that the pervasion fails, but you missed the point");
  await expect(page.locator(".sylchk.first")).toContainText("Reason");
  const [doc] = await expect.poll(async () => (await saved(page)).length).toBe(1).then(() => saved(page));
  expect(doc).toMatchObject({ situation: 8, said: "pervasion", correct: false, grade: "bad", missedPoint: true });
});

test("a right 'there is no pervasion' asks for a counter-example: a real one keeps the result Right", async ({ page }) => {
  await open(page);
  const c = await draw(page, 3, "witness");
  await say(page, "pervasion");
  await expect(page.locator("#sylex")).toBeVisible();
  await expect(page.locator(".sylex")).toContainText("Right: there is no pervasion.");
  await expect(page.locator(".sylres")).toHaveCount(0); // the result waits for the example
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  // the data has another thing that is the reason and is not the predicate
  await page.fill("#sylex", c.witness + "."); // a full stop at the end of what was typed is not kept
  await page.locator("#sylex").press("Enter");
  await expect(headline(page)).toHaveText("Right.");
  // the counter-example is judged in the pervasion's row, under the line that says the pervasion fails (not in the box that says right or wrong)
  const mine = page.locator(".sylchk", { hasText: "Pervasion" }).locator(".sylmine");
  await expect(mine).toContainText(`Your counter-example: ${c.witness}.`);
  await expect(mine).toContainText("so there is no pervasion.");
  await expect(mine).not.toContainText("..");
  await expect(page.locator(".sylchk", { hasText: "Pervasion" }).locator(".sylcl + .sylmine")).toHaveCount(1);
  await expect(page.locator(".sylres .sylmine")).toHaveCount(0);
  const [doc] = await expect.poll(async () => (await saved(page)).length).toBe(1).then(() => saved(page));
  expect(doc).toMatchObject({ situation: 3, correct: true, grade: "ok", example: { text: c.witness, verdict: "ok" } });
});

test("the subject itself is not taken as a counter-example: the page asks for another thing, and grades nothing", async ({ page }) => {
  await open(page);
  const c = await draw(page, 3); // the subject is the reason and is not the predicate: it would be a counter-example, but it is on the card already
  await say(page, "pervasion");
  await page.fill("#sylex", c.subject);
  await page.locator("#sylex").press("Enter");
  await expect(page.locator(".sylnote")).toBeVisible();
  await expect(page.locator(".sylnote")).toContainText("That is the subject itself. Name another thing");
  await expect(page.locator("#sylex")).toBeFocused();
  await expect(page.locator(".sylres")).toHaveCount(0); // still at the step, nothing is graded and nothing is saved
  expect(await saved(page)).toHaveLength(0);
  await page.locator(".pbar .fwd").click(); // Check does the same
  await expect(page.locator(".sylnote")).toBeVisible();
  await page.locator("#sylex").press("a"); // typing something else takes the note away
  await expect(page.locator(".sylnote")).toBeHidden();
  await page.fill("#sylex", "");
  await page.locator("#sylex").press("Enter"); // and leaving it empty goes on
  await expect(headline(page)).toHaveText("Right.");
});

test("a counter-example that is not one makes the result partly right; one left out, or one the page cannot place, does not", async ({ page }) => {
  await open(page);
  const c = await draw(page, 2, "both"); // the subject is the reason and the predicate, and the pervasion fails
  expect(c.answer).toBe("pervasion");
  await say(page, "pervasion");
  // another thing that is the reason and the predicate too is no counter-example
  const both = await page.evaluate((x) => window.__t.DATA.items.find((i) => !i.ne && !i.comp && !i.body && i.n !== x.subject && i.c.includes(x.catR) && i.c.includes(x.catP)).n, c);
  await page.fill("#sylex", both);
  await page.locator(".pbar .fwd").click(); // Check
  await expect(headline(page)).toHaveText("Right, but the counter-example is not one.");
  await expect(page.locator(".sylres")).toHaveClass(/part/);
  await expect(page.locator(".sylchk .sylmine")).toContainText("it is no counter-example");
  const [doc] = await expect.poll(async () => (await saved(page)).length).toBe(1).then(() => saved(page));
  expect(doc).toMatchObject({ situation: 2, said: "pervasion", correct: true, grade: "part", example: { verdict: "bad" } });
  await next(page).click();
  await draw(page, 2);
  await say(page, "pervasion");
  await page.locator(".pbar .fwd").click(); // nothing typed: on without a counter-example
  await expect(headline(page)).toHaveText("Right.");
  await expect(page.locator(".sylchk .sylmine")).toHaveCount(0);
  await next(page).click();
  await draw(page, 2);
  await say(page, "pervasion");
  await page.fill("#sylex", "a thing the course knows nothing of");
  await page.locator("#sylex").press("Enter");
  await expect(headline(page)).toHaveText("Right.");
  await expect(page.locator(".sylchk .sylmine")).toContainText("Not checked");
});

test("the keys 1, 2 and 3 reply (the reason, the pervasion, accept), S skips, N goes on, and Escape leaves the counter-example", async ({ page }, testInfo) => {
  await open(page);
  await draw(page, 5); // the reason is not established
  await page.keyboard.press("1");
  await expect(headline(page)).toHaveText("Right.");
  await page.keyboard.press("n");
  await draw(page, 1);
  await page.keyboard.press("3");
  await expect(headline(page)).toHaveText("Right.");
  await page.keyboard.press("n");
  await expect(page.locator(".sylask")).toBeVisible();
  const before = await page.locator(".sylt").innerText();
  await page.keyboard.press("s"); // nothing entered: another syllogism at once
  await expect(page.locator(".sylask")).toBeVisible();
  await expect(page.locator(".sylt")).not.toHaveText(before);
  await draw(page, 3);
  await page.keyboard.press("2");
  await expect(page.locator("#sylex")).toBeVisible();
  await page.locator("#sylex").press("Escape"); // back to the replies, nothing is answered
  await expect(page.locator(".sylask")).toBeVisible();
  await expect(page.locator("#sylex")).toHaveCount(0);
  if (!isPhone(testInfo)) await expect(page.locator(".sylask .sylsay").first()).toBeFocused(); // the keys 1 to 3 work again (a touch screen has no focus to move)
  expect(await saved(page)).toHaveLength(2);
});

test("Escape on another screen leaves a waiting counter-example as it is", async ({ page }) => {
  await open(page);
  await draw(page, 3);
  await say(page, "pervasion");
  await expect(page.locator("#sylex")).toBeVisible();
  await goTo(page, "Review");
  await page.keyboard.press("Escape");
  await goTo(page, "Syllogisms");
  await expect(page.locator("#sylex")).toBeVisible();
});

test("an attempt at its counter-example waits in the menu and comes back; skipping it asks first", async ({ page }) => {
  await open(page);
  const c = await draw(page, 3);
  await say(page, "pervasion");
  await expect(page.locator("#sylex")).toBeVisible();
  await goTo(page, "Relations");
  await openMenu(page);
  await expect(page.locator('#menu .mrow[data-go="syllogism"]')).toContainText(/continue/i);
  await goTo(page, "Syllogisms");
  await expect(page.locator("#sylex")).toBeVisible();
  expect(await page.evaluate(() => window.__t.cur.c.id)).toBe(c.id);
  await page.locator(".pbar .skipw").click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Skip this syllogism?");
  await dialog.getByRole("button", { name: "Keep going" }).click();
  await expect(page.locator("#sylex")).toBeVisible();
  await page.locator(".pbar .skipw").click();
  await dialog.getByRole("button", { name: "Skip anyway" }).click();
  await expect(page.locator(".sylask")).toBeVisible();
  expect(await saved(page)).toHaveLength(0); // a skip keeps nothing
  await openMenu(page);
  await expect(page.locator('#menu .mrow[data-go="syllogism"]')).not.toContainText(/continue/i);
});

test("the practice options hold only what Syllogisms uses: the wording, which is kept, and the things drawn from", async ({ page }) => {
  await open(page);
  await page.locator("#msess").click();
  const sheet = page.locator("#opts");
  await expect(sheet).toContainText("Wording");
  await expect(sheet).toContainText("Things");
  await expect(sheet).toContainText("With Dudra terms");
  await expect(sheet).not.toContainText(/course|textbook/i); // the page does not say "the course" or "textbook"
  await expect(sheet).not.toContainText("Notation");
  await expect(sheet).not.toContainText("Blitz");
  await sheet.getByRole("button", { name: "Formal" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".sylt")).toContainText(/^It follows that the subject, .+, is .+ because of being .+\.$/);
  await expect(page.locator(".sylt b")).toHaveCount(3); // the subject, the predicate and the reason, apart from the words
  await page.reload();
  await expect(page.locator(".sylt")).toContainText(/^It follows that the subject,/);
  // everyday things only: the syllogisms drawn from then on have no course term in them
  await page.locator("#msess").click();
  await page.locator("#opts").getByRole("button", { name: "Everyday", exact: true }).click();
  await page.keyboard.press("Escape");
  const levels = await page.evaluate(() => { const out = []; for (let i = 0; i < 60; i++) { window.__t.next(); out.push(window.__t.cur.c.level); } return out; });
  expect(new Set(levels)).toEqual(new Set([1]));
  expect(await page.evaluate(() => localStorage.getItem("rd-syllogism-level"))).toBe("1");
});

test("the Blitz and the tutor's chat are not part of Syllogisms", async ({ page }) => {
  await open(page);
  await expect(page.locator("#mbz")).toBeHidden();
  if (await page.locator("#mchat").isVisible()) await expect(page.locator("#mchat")).toHaveAttribute("aria-label", "Recent answers"); // a wide screen: only the panel of recent answers and keys
  await draw(page, 1);
  await say(page, "accept");
  await expect(page.locator(".xpl")).toHaveCount(0); // no Explain: the tutor does not know this exercise yet
});
