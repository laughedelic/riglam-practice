// Syllogisms: "Take a tomato. It follows it is food because it is red." The learner accepts it, denies the reason or denies the pervasion. What is right comes from the
// rules in src/domain/consequence.ts (tests/unit/consequence.test.ts); these specs are about the page around them: the replies and the keys, the counter-example step, the
// result, the answer that is kept, the attempt that waits in the menu, the options and the width. The consequence is drawn, so a spec asks the page for one of the
// kind it needs (the test hook's `next` draws until the situation fits) and reads what is right from the consequence on screen.
import { test, expect } from "../../support/test.js";
import { goTo, openMenu, ready, overflow } from "../../support/page.js";

const REPLY = { reason: 0, pervasion: 1, accept: 2 }; // in the order of the checks

async function open(page) {
  await page.addInitScript(() => { window.__riglamTest = (api) => { window.__t = api; }; });
  await page.goto("/");
  await ready(page);
  await goTo(page, "Syllogisms");
  await expect(page.locator(".cqcard")).toBeVisible();
}
/** Draws consequences until one of this situation is on screen (1 to 8, see SITUATIONS in the domain). */
async function draw(page, situation) {
  const found = await page.evaluate((s) => {
    for (let i = 0; i < 600; i++) { if (window.__t.cur.c.situation === s) return true; window.__t.next(); }
    return false;
  }, situation);
  expect(found, "situation " + situation).toBe(true);
  return page.evaluate(() => JSON.parse(JSON.stringify(window.__t.cur.c)));
}
const say = (page, reply) => page.locator(".cqask .cqsay").nth(REPLY[reply]).click();
const headline = (page) => page.locator(".cqres .vl .v");
const saved = (page) => page.evaluate(async () => (await (await window.__riglam.platform.db()).collection("answers").get()).docs.map((d) => d.data()));
const next = (page) => page.locator(".pbar .fwd");

test("the exercise is in the menu, gives a syllogism with three replies, in the order of the checks, that look different, and fits the width", async ({ page }) => {
  await open(page);
  await expect(page.locator("#mttl")).toHaveText("Syllogisms");
  await expect(page.locator(".cqt")).toContainText(/^(Take .+\. It follows it is .+ because it is .+\.|It follows that)/);
  await expect(page.locator(".cqask .cqsay")).toHaveText([/^1\s*The reason is not established/i, /^2\s*There is no pervasion/i, /^3\s*Accept/i]);
  // told apart at a glance: each reply has its own tint
  const tints = await page.locator(".cqask .cqsay").evaluateAll((bs) => bs.map((b) => getComputedStyle(b).backgroundColor));
  expect(new Set(tints).size).toBe(3);
  await expect(page.locator(".pbar .fwd")).toHaveCount(0); // nothing to go forward to before a reply
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  // the app opens on the exercise used last
  await page.reload();
  await expect(page.locator(".cqcard")).toBeVisible();
});

test("a right reply is Right and is kept in the answers, apart from the Relations lists", async ({ page }) => {
  await open(page);
  const c = await draw(page, 1); // the reason is established and the pervasion holds: accept
  expect(c.answer).toBe("accept");
  await say(page, "accept");
  await expect(headline(page)).toHaveText("Right.");
  await expect(page.locator(".cqres .cqconf")).toHaveCount(0);
  // one sheet, no tabs: the three checks with their lines, and nothing marked as a fault
  await expect(page.locator(".vchip, [role=tab]")).toHaveCount(0);
  await expect(page.locator(".cqchk")).toHaveCount(3);
  await expect(page.locator(".cqchk .cqch b")).toHaveText(["Reason", "Pervasion", "Thesis"]);
  await expect(page.locator(".cqchk.holds")).toHaveCount(3);
  await expect(page.locator(".cqchk.first")).toHaveCount(0);
  for (const k of ["e", "v", "t"]) await expect(page.locator(".cqchecks")).toContainText(c.checks[k].line);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  const [doc] = await expect.poll(async () => (await saved(page)).length).toBe(1).then(() => saved(page));
  expect(doc).toMatchObject({ mode: "cq", subject: c.subject, reason: c.reason, predicate: c.predicate, catA: c.catR, catB: c.catP, situation: 1, answer: "accept", said: "accept", correct: true, grade: "ok" });
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
  await expect(page.locator(".cqres .cqwhat")).toContainText("You said “accept it”");
  await expect(page.locator(".cqres .cqwhat")).toContainText("The right reply is “there is no pervasion”");
  await expect(page.locator(".cqres .cqconf")).not.toBeEmpty();
  await expect(page.locator(".cqchk.first")).toContainText("Pervasion"); // the reason holds, so the pervasion is the first fault
  for (const k of ["e", "v", "t"]) await expect(page.locator(".cqchecks")).toContainText(c.checks[k].line); // all three at once
  // the pervasion fails with the class's phrase, not with a counter-example
  expect(c.checks.v.line).toBe(`Just because it is ${c.reason}, doesn't necessarily mean that it is ${c.predicate}.`);
  await expect(page.locator(".cqchecks")).not.toContainText(c.witness);
  await expect(page.locator(".cqchk.fails .cqst")).toHaveText(["no pervasion", "false"]);
  await expect(page.locator(".cqchk.holds .cqst")).toHaveText(["established"]);
  // a check that fails is not marked like the wrong answer: no cross, and not in the colour of the wrong answer
  await expect(page.locator(".cqchecks")).not.toContainText("✗");
  const [mark, fault] = await page.evaluate(() => [getComputedStyle(document.querySelector(".cqres .vl .v")).color, getComputedStyle(document.querySelector(".cqchk.fails .cqst")).color]);
  expect(fault).not.toBe(mark);
  const [doc] = await expect.poll(async () => (await saved(page)).length).toBe(1).then(() => saved(page));
  expect(doc).toMatchObject({ mode: "cq", situation: 3, answer: "pervasion", said: "accept", correct: false, grade: "bad" });
});

test("when both the reason and the pervasion fail, the reason comes first: denying the pervasion is wrong, and the result says it is not all wrong", async ({ page }) => {
  await open(page);
  const c = await draw(page, 8);
  expect(c.answer).toBe("reason");
  await say(page, "pervasion");
  await expect(headline(page)).toHaveText("Not quite.");
  await expect(page.locator(".cqres")).toHaveClass(/bad/);
  await expect(page.locator(".cqres .cqconf")).toContainText("You are not wrong that the pervasion fails, but you missed the point");
  await expect(page.locator(".cqchk.first")).toContainText("Reason");
  const [doc] = await expect.poll(async () => (await saved(page)).length).toBe(1).then(() => saved(page));
  expect(doc).toMatchObject({ situation: 8, said: "pervasion", correct: false, grade: "bad", missedPoint: true });
});

test("a right 'there is no pervasion' asks for a counter-example: a real one keeps the result Right", async ({ page }) => {
  await open(page);
  const c = await draw(page, 3);
  await say(page, "pervasion");
  await expect(page.locator("#cqex")).toBeVisible();
  await expect(page.locator(".cqex")).toContainText("Right: there is no pervasion.");
  await expect(page.locator(".cqres")).toHaveCount(0); // the result waits for the example
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  // in this situation the subject is the reason and is not the conclusion: it is a counter-example itself
  await page.fill("#cqex", c.subject);
  await page.locator("#cqex").press("Enter");
  await expect(headline(page)).toHaveText("Right.");
  await expect(page.locator(".cqres .cqmine")).toContainText("a counter-example");
  const [doc] = await expect.poll(async () => (await saved(page)).length).toBe(1).then(() => saved(page));
  expect(doc).toMatchObject({ situation: 3, correct: true, grade: "ok", example: { text: c.subject, verdict: "ok" } });
});

test("a counter-example that is not one makes the result partly right; one left out, or one the page cannot place, does not", async ({ page }) => {
  await open(page);
  const c = await draw(page, 2); // the subject is the reason and the conclusion, and the pervasion fails: the subject is no counter-example
  expect(c.answer).toBe("pervasion");
  await say(page, "pervasion");
  await page.fill("#cqex", c.subject);
  await page.locator(".pbar .fwd").click(); // Check
  await expect(headline(page)).toHaveText("Right, but the counter-example is not one.");
  await expect(page.locator(".cqres")).toHaveClass(/part/);
  await expect(page.locator(".cqres .cqmine")).toContainText("it is no counter-example");
  const [doc] = await expect.poll(async () => (await saved(page)).length).toBe(1).then(() => saved(page));
  expect(doc).toMatchObject({ situation: 2, said: "pervasion", correct: true, grade: "part", example: { verdict: "bad" } });
  await next(page).click();
  await draw(page, 2);
  await say(page, "pervasion");
  await page.locator(".pbar .fwd").click(); // nothing typed: on without a counter-example
  await expect(headline(page)).toHaveText("Right.");
  await expect(page.locator(".cqres .cqmine")).toHaveCount(0);
  await next(page).click();
  await draw(page, 2);
  await say(page, "pervasion");
  await page.fill("#cqex", "a thing the course knows nothing of");
  await page.locator("#cqex").press("Enter");
  await expect(headline(page)).toHaveText("Right.");
  await expect(page.locator(".cqres .cqmine")).toContainText("Not checked");
});

test("the keys 1, 2 and 3 reply (the reason, the pervasion, accept), S skips, N goes on, and Escape leaves the counter-example", async ({ page }) => {
  await open(page);
  await draw(page, 5); // the reason is not established
  await page.keyboard.press("1");
  await expect(headline(page)).toHaveText("Right.");
  await page.keyboard.press("n");
  await draw(page, 1);
  await page.keyboard.press("3");
  await expect(headline(page)).toHaveText("Right.");
  await page.keyboard.press("n");
  await expect(page.locator(".cqask")).toBeVisible();
  const before = await page.locator(".cqt").innerText();
  await page.keyboard.press("s"); // nothing entered: another consequence at once
  await expect(page.locator(".cqask")).toBeVisible();
  await expect(page.locator(".cqt")).not.toHaveText(before);
  await draw(page, 3);
  await page.keyboard.press("2");
  await expect(page.locator("#cqex")).toBeVisible();
  await page.locator("#cqex").press("Escape"); // back to the replies, nothing is answered
  await expect(page.locator(".cqask")).toBeVisible();
  await expect(page.locator("#cqex")).toHaveCount(0);
  expect(await saved(page)).toHaveLength(2);
});

test("an attempt at its counter-example waits in the menu and comes back; skipping it asks first", async ({ page }) => {
  await open(page);
  const c = await draw(page, 3);
  await say(page, "pervasion");
  await expect(page.locator("#cqex")).toBeVisible();
  await goTo(page, "Relations");
  await openMenu(page);
  await expect(page.locator('#menu .mrow[data-go="cq"]')).toContainText(/continue/i);
  await goTo(page, "Syllogisms");
  await expect(page.locator("#cqex")).toBeVisible();
  expect(await page.evaluate(() => window.__t.cur.c.id)).toBe(c.id);
  await page.locator(".pbar .skipw").click();
  const dialog = page.getByRole("alertdialog");
  await expect(dialog).toContainText("Skip this syllogism?");
  await dialog.getByRole("button", { name: "Keep going" }).click();
  await expect(page.locator("#cqex")).toBeVisible();
  await page.locator(".pbar .skipw").click();
  await dialog.getByRole("button", { name: "Skip anyway" }).click();
  await expect(page.locator(".cqask")).toBeVisible();
  expect(await saved(page)).toHaveLength(0); // a skip keeps nothing
  await openMenu(page);
  await expect(page.locator('#menu .mrow[data-go="cq"]')).not.toContainText(/continue/i);
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
  await expect(page.locator(".cqt")).toContainText(/^It follows that the subject, .+, is .+ because of being .+\.$/);
  await expect(page.locator(".cqt b")).toHaveCount(3); // the subject, the predicate and the reason, apart from the words
  await page.reload();
  await expect(page.locator(".cqt")).toContainText(/^It follows that the subject,/);
  // everyday things only: the consequences drawn from then on have no course term in them
  await page.locator("#msess").click();
  await page.locator("#opts").getByRole("button", { name: "Everyday", exact: true }).click();
  await page.keyboard.press("Escape");
  const levels = await page.evaluate(() => { const out = []; for (let i = 0; i < 60; i++) { window.__t.next(); out.push(window.__t.cur.c.level); } return out; });
  expect(new Set(levels)).toEqual(new Set([1]));
  expect(await page.evaluate(() => localStorage.getItem("rd-cqlevel"))).toBe("1");
});

test("the Blitz and the tutor's chat are not part of Syllogisms", async ({ page }) => {
  await open(page);
  await expect(page.locator("#mbz")).toBeHidden();
  if (await page.locator("#mchat").isVisible()) await expect(page.locator("#mchat")).toHaveAttribute("aria-label", "Recent answers"); // a wide screen: only the panel of recent answers and keys
  await draw(page, 1);
  await say(page, "accept");
  await expect(page.locator(".xpl")).toHaveCount(0); // no Explain: the tutor does not know this exercise yet
});
