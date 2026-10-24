// Syllogisms: "Take a tomato. It follows it is food because it is red." The learner accepts it, denies the reason or denies the pervasion. What is right comes from the
// rules in src/domain/syllogism.ts (tests/unit/syllogism.test.ts); these specs are about the page around them: the replies and the keys, the counter-example step, the
// result, the answer that is kept, the attempt that waits in the menu, the options and the width. The syllogism is drawn, so a spec asks the page for one of the
// kind it needs (the test hook's `next` draws until the situation fits) and reads what is right from the syllogism on screen.
import { test, expect } from "../../support/test.js";
import { goTo, isPhone, openMenu, ready, overflow, setStoredStages } from "../../support/page.js";
import { withCourse } from "../../support/data-key.js";

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
  // the subject is set apart in the sentence: its class is the one the stylesheet names
  await expect(page.locator(".sylt b.syl-subject")).toHaveCSS("font-style", "italic");
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
  // today's line counts it, and Review lists it in its own part, not among the Relations answers
  await openMenu(page);
  await expect(page.locator("#menu .mtoday")).toContainText(/1 pair/i);
  await goTo(page, "Review");
  await expect(page.locator(".section", { has: page.locator(".label", { hasText: "Syllogisms" }) })).toBeVisible();
  await expect(page.locator(".empty-note").first()).toContainText("No practice answers yet"); // the Relations list has nothing of it
});

test("an answer that could not be saved says so on the result, without naming a list it would not be in", async ({ page }) => {
  await open(page);
  await page.evaluate(async () => { // the answers collection refuses writes
    const db = await window.__riglam.platform.db(), real = db.collection.bind(db);
    db.collection = (name) => (name === "answers" ? { doc: () => ({ set: async () => { throw Object.assign(new Error("full"), { code: "quota_exceeded" }); } }) } : real(name));
  });
  await draw(page, 1);
  await say(page, "accept");
  await expect(page.locator(".sylres + .status, .status", { hasText: "could not be saved" }).first()).toHaveText("Your answer is on screen but could not be saved (quota_exceeded), so it will not be kept.");
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
  await expect(page.locator(".sylchk", { hasText: "Pervasion" }).locator(".sylcl")).toHaveText(c.checks.v.line); // exactly that sentence: no counter-example in it
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
  await expect(page.locator(".sylchk .sylmine")).toContainText(/(it is|you are) no counter-example/);
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
  await expect(page.locator("#over")).toHaveAttribute("aria-label", "Skip this syllogism?");
  await dialog.getByRole("button", { name: "Keep going" }).click();
  await expect(page.locator("#sylex")).toBeVisible();
  await page.locator(".pbar .skipw").click();
  await dialog.getByRole("button", { name: "Skip anyway" }).click();
  await expect(page.locator(".sylask")).toBeVisible();
  expect(await saved(page)).toHaveLength(0); // a skip keeps nothing
  await goTo(page, "Relations"); // the row says "continue" only for an exercise that is not on screen
  await openMenu(page);
  await expect(page.locator('#menu .mrow[data-go="syllogism"]')).not.toContainText(/continue/i);
});

test("Review counts the answers: by the reply each syllogism called for, the mix-ups, and the last ones", async ({ page }) => {
  await open(page);
  await draw(page, 1); // accept
  await say(page, "accept");
  await expect(headline(page)).toHaveText("Right.");
  await next(page).click();
  await draw(page, 1); // the same again, answered wrongly: it was to be accepted
  await say(page, "reason");
  await expect(headline(page)).toHaveText("Not quite.");
  await goTo(page, "Review");
  const sec = page.locator(".section", { has: page.locator(".label", { hasText: "Syllogisms" }) });
  await expect(sec.locator(".label .hint")).toHaveText("2 syllogisms, reply right 50%");
  await expect(sec.locator("table").first().locator("tr", { hasText: "Accept" }).locator(".num")).toContainText("1 / 2");
  await expect(sec.locator("table").first().locator("tr", { hasText: "The reason is not established" }).locator(".num")).toContainText("–");
  await expect(sec.locator("table").nth(1)).toContainText("Said “the reason is not established” when it was “accept”");
  await expect(sec.locator(".sylrow")).toHaveCount(2);
  await expect(sec.locator(".sylrow").first()).toContainText("You said “the reason is not established”; right: accept");
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

test("Review leaves a counter-example the page could not place out of the row of counter-examples that were one", async ({ page }) => {
  await open(page);
  await draw(page, 2);
  await say(page, "pervasion");
  await page.fill("#sylex", "a thing the course knows nothing of");
  await page.locator("#sylex").press("Enter");
  await expect(page.locator(".sylchk .sylmine")).toContainText("Not checked");
  await goTo(page, "Review");
  const sec = page.locator(".section", { has: page.locator(".label", { hasText: "Syllogisms" }) });
  await expect(sec.locator("table").first().locator("tr", { hasText: "Counter-examples that were one" })).toHaveCount(0);
  await expect(sec.locator(".sylrow")).toContainText("(not checked)");
});

test("the practice options hold only what Syllogisms uses: the wording, which is kept, and the stages", async ({ page }) => {
  await open(page);
  await page.locator("#msess").click();
  const sheet = page.locator("#opts");
  await expect(sheet).toContainText("Wording");
  await expect(sheet.locator(".ocard").filter({ hasText: "Stages" })).toContainText("Stages 1–6");
  await expect(sheet).not.toContainText(/course|textbook/i); // the page does not say "the course" or "textbook"
  await expect(sheet).not.toContainText("Notation");
  await expect(sheet).toContainText("Blitz");
  await sheet.getByRole("button", { name: "Formal" }).click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".sylt")).toContainText(/^It follows that the subject, .+, is .+ because of being .+\.$/);
  await expect(page.locator(".sylt b")).toHaveCount(3); // the subject, the predicate and the reason, apart from the words
  await page.reload();
  await expect(page.locator(".sylt")).toContainText(/^It follows that the subject,/);
  // up to stage 3, everyday things only: the syllogisms drawn have no course term in them, and the structure is shown until it is switched off
  await setStoredStages(page, "1,2,3");
  await page.reload();
  await expect(page.locator(".sylt")).toBeVisible();
  const levels = await page.evaluate(() => { const out = []; for (let i = 0; i < 60; i++) { window.__t.next(); out.push(window.__t.cur.c.level); } return out; });
  expect(new Set(levels)).toEqual(new Set([1]));
  await expect(page.locator(".sylkey")).toBeVisible();
});

test("the structure is shown only on request: S, P and R under the sentence, and what each reply says in them; the choice is kept", async ({ page }) => {
  await open(page);
  await expect(page.locator(".sylkey")).toHaveCount(0); // off at first: the card is the sentence and the replies
  await expect(page.locator(".sylmeans")).toHaveCount(0);
  await page.locator("#msess").click();
  const row = page.locator("#opts .orow", { hasText: "Show the structure" });
  await expect(row).toContainText("S is the subject, P the predicate and R the reason");
  await row.getByRole("switch").click();
  expect(await page.evaluate(() => localStorage.getItem("rd-syllogism-guide"))).toBe("1");
  await page.keyboard.press("Escape");
  const key = page.locator(".sylkey li");
  await expect(key).toHaveCount(3);
  await expect(key.nth(0)).toContainText(/^S\s*the subject:/);
  await expect(key.nth(1)).toContainText(/^P\s*the predicate:/);
  await expect(key.nth(2)).toContainText(/^R\s*the reason:/);
  // the words of the syllogism on the card stand in the key, in the order S, P, R
  const [subject, predicate, reason] = await page.locator(".sylt b").allTextContents();
  await expect(key.nth(0).locator("b").nth(1)).toHaveText(subject);
  await expect(key.nth(1).locator("b").nth(1)).toHaveText(predicate);
  await expect(key.nth(2).locator("b").nth(1)).toHaveText(reason);
  await expect(page.locator(".sylsay .sylmeans")).toHaveText(["S is not R.", "S is R, but not everything that is R is P.", "S is R, and everything that is R is P."]);
  // the replies still read and work as before: the name, then what it says
  await expect(page.locator(".sylask .sylsay")).toHaveText([/^1\s*The reason is not established/i, /^2\s*There is no pervasion/i, /^3\s*Accept/i]);
  // the name of a reply stays the reply, what it means is its description, and the letters are read because the meanings speak of S, P and R
  await expect(page.getByRole("button", { name: "Accept", exact: true })).toHaveAccessibleDescription("S is R, and everything that is R is P.");
  await expect(key.nth(0).locator(".sylkl")).not.toHaveAttribute("aria-hidden", "true");
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  // kept, and gone with the reply: the result has the sheet of the checks only
  await page.reload();
  await expect(page.locator(".sylkey li")).toHaveCount(3);
  await draw(page, 1);
  await say(page, "accept");
  await expect(headline(page)).toHaveText("Right.");
  await expect(page.locator(".sylkey")).toHaveCount(0);
  // off again: the key and the meanings go, the replies are as they were, and the choice is kept
  await page.locator(".pbar .fwd").click();
  await page.locator("#msess").click();
  await page.locator("#opts .orow", { hasText: "Show the structure" }).getByRole("switch").click();
  await page.keyboard.press("Escape");
  await expect(page.locator(".sylkey")).toHaveCount(0);
  await expect(page.locator(".sylmeans")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Accept", exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("rd-syllogism-guide"))).toBe("0");
});

test("without a tutor server there is no Explain, and the chat button only opens the recent answers", async ({ page }) => {
  await open(page);
  if (await page.locator("#mchat").isVisible()) await expect(page.locator("#mchat")).toHaveAttribute("aria-label", "Recent answers"); // a wide screen: only the panel of recent answers and keys
  await draw(page, 1);
  await say(page, "accept");
  await expect(page.locator(".xpl")).toHaveCount(0);
});

// The tutor: questions go to the app's own server (/api/tutor), which these specs stand in for with routes, as tutor.spec.js does.
const withKey = withCourse ? test : test.skip;
const sse = (...events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const ANSWER = sse({ type: "delta", text: "Reason: " }, { type: "delta", text: "this is the stand-in answer." }, { type: "done", truncated: false });
async function tutor(page, answers = [{ status: 200, body: ANSWER }]) {
  const asked = [];
  await page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, tutor: "on" }) }));
  await page.route("**/api/tutor", (route) => {
    asked.push(route.request().postDataJSON());
    const reply = answers[Math.min(asked.length - 1, answers.length - 1)];
    return route.fulfill({ status: reply.status, contentType: reply.status === 200 ? "text/event-stream" : "application/json", body: reply.body });
  });
  return asked;
}
const explain = (page) => page.getByRole("button", { name: /^explain$/i });
// the explanation: under the checks on a phone, in the panel at the right on a wide screen
const explained = (page) => page.locator(".tutor .ans").getByText("this is the stand-in answer.");

withKey("Explain sends the card of the syllogism and the page's three checks, shows the answer with the checks, and keeps it with the answer", async ({ page }) => {
  const asked = await tutor(page);
  await open(page);
  const c = await draw(page, 2, "both"); // the subject is the reason and the predicate, and the pervasion fails
  await expect(explain(page)).toHaveCount(0); // nothing to explain before a reply
  await say(page, "accept");
  await expect(headline(page)).toHaveText("Not quite.");
  await explain(page).click();
  await expect(explained(page)).toBeVisible();
  await expect(explain(page)).toHaveCount(0); // once for an answer
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  expect(asked).toHaveLength(1);
  const { kind, cats, turns } = asked[0];
  expect(kind).toBe("explain");
  expect(cats).toEqual(c.catR === c.catP ? [c.catR] : [c.catR, c.catP]);
  expect(turns).toHaveLength(1);
  expect(turns[0].role).toBe("user");
  const card = turns[0].content;
  expect(card.startsWith("This is the Syllogisms mode.")).toBe(true);
  expect(card).not.toContain("terse debate tutor"); // the server holds the standing instructions
  expect(card).not.toContain("Fine points"); // and the notes
  for (const k of ["e", "v", "t"]) expect(card).toContain(JSON.stringify(c.checks[k].line));
  expect(card).toContain(`the counter-example kept for you: ${JSON.stringify(c.witness)}`);
  expect(card).toContain('Right reply: "There is no pervasion". Learner replied: "Accept", which is wrong.');
  expect(card).toContain('Explain this answer.');
  const [doc] = await expect.poll(async () => (await saved(page)).filter((d) => d.explain).length).toBe(1).then(() => saved(page));
  expect(doc.explain).toBe("Reason: this is the stand-in answer.");
});

withKey("a follow-up question goes on in the same conversation, from the panel or the chat view", async ({ page }, testInfo) => {
  const asked = await tutor(page);
  await open(page);
  await draw(page, 1);
  await say(page, "accept");
  await expect(headline(page)).toHaveText("Right.");
  await explain(page).click();
  await expect(explained(page)).toBeVisible();
  if (isPhone(testInfo)) {
    const sentence = (await page.locator(".sylt").innerText()).replace(/\s+/g, " ").trim();
    await page.getByRole("button", { name: /discuss with ai/i }).click();
    await expect(page.locator("#over .ctx")).toContainText(sentence); // the chat view says which syllogism it is about
  }
  await page.fill("#ask-in", "Why is that?");
  await page.keyboard.press("Enter");
  await expect.poll(() => asked.length).toBe(2);
  expect(asked[1].kind).toBe("chat");
  expect(asked[1].turns.map((t) => t.role)).toEqual(["user", "assistant", "user"]); // the card with the first request, the answer, the question
  expect(asked[1].turns[2].content).toBe("Why is that?");
  await expect(page.locator(".tutor .q", { hasText: "Why is that?" })).toBeVisible();
});

withKey("the practice options have the switch for the tutor, on; off, the next answer waits for a tap on Explain", async ({ page }, testInfo) => {
  await page.addInitScript(() => localStorage.setItem("rd-autoexplain", "1"));
  const asked = await tutor(page);
  await open(page);
  await page.locator("#msess").click();
  const sw = page.getByRole("switch", { name: /check every answer with ai/i });
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");
  await draw(page, 1);
  await say(page, "accept");
  await expect(headline(page)).toHaveText("Right.");
  await expect(explain(page)).toBeVisible();
  if (!isPhone(testInfo)) await expect(explain(page)).toBeFocused(); // as after the other exercises, a keyboard user is on Explain
  await page.waitForTimeout(400);
  expect(asked).toHaveLength(0); // nothing went out by itself
  await explain(page).click();
  await expect.poll(() => asked.length).toBe(1);
});

withKey("with 'Check every answer with AI' on the explanation comes by itself, once, and a refusal leaves Explain to try again", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rd-autoexplain", "1")); // after the support script, which starts every page with it off
  const asked = await tutor(page, [
    { status: 503, body: JSON.stringify({ error: { code: "unavailable", message: "off" } }) },
    { status: 200, body: ANSWER },
  ]);
  await open(page);
  await draw(page, 1);
  await say(page, "accept");
  await expect.poll(() => asked.length).toBe(1);
  await expect(page.locator(".status", { hasText: "Claude could not answer just now" }).first()).toBeVisible();
  await explain(page).click(); // the refused one did not count as asked
  await expect(explained(page)).toBeVisible();
  expect(asked.map((a) => a.kind)).toEqual(["explain", "explain"]);
});

withKey("a conversation the server refuses as too long tells the learner to move to the next syllogism", async ({ page }) => {
  await tutor(page, [{ status: 413, body: JSON.stringify({ error: { code: "prompt_too_large", message: "too long" } }) }]);
  await open(page);
  await draw(page, 1);
  await say(page, "accept");
  await explain(page).click();
  await expect(page.locator(".status", { hasText: "This conversation is too long. Move to the next syllogism." }).first()).toBeVisible();
});

// Blitz: the stopwatch of the other exercises, with a time of its own for the reply to a syllogism
const blitzOn = (page, ms) => page.addInitScript((t) => { localStorage.setItem("rd-blitz", "1"); localStorage.setItem("rd-timer-syl", String(t)); }, ms);

test("Blitz: the stopwatch is in the top bar, the reply has a countdown, and a right 'there is no pervasion' goes straight to the result", async ({ page }) => {
  await blitzOn(page, 60000);
  await open(page);
  const sw = page.locator("#mbz");
  await expect(sw).toBeVisible();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(sw).toHaveAttribute("aria-label", "Blitz on: 60 s a syllogism");
  await expect(page.locator("#mbar .mbt")).toBeVisible();
  const c = await draw(page, 3, "witness");
  await say(page, "pervasion");
  await expect(page.locator("#sylex")).toHaveCount(0); // no counter-example against the clock
  await expect(headline(page)).toHaveText("Right.");
  await expect(page.locator(".sylmine")).toHaveCount(0);
  await expect(page.locator("#mbar .mbt")).toHaveCount(0); // the clock stopped with the reply
  const [doc] = await expect.poll(async () => (await saved(page)).length).toBe(1).then(() => saved(page));
  expect(doc).toMatchObject({ situation: c.situation, said: "pervasion", correct: true, grade: "ok" });
  expect(doc.ms).toBeGreaterThanOrEqual(0);
  expect(doc.timeout).toBeUndefined();
  expect(doc.example).toBeUndefined();
  // the stopwatch switches it off: the countdown goes, and a right "no pervasion" asks for a counter-example again
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await page.locator(".pbar .fwd").click();
  await expect(page.locator("#mbar .mbt")).toHaveCount(0);
  await draw(page, 3, "witness");
  await say(page, "pervasion");
  await expect(page.locator("#sylex")).toBeVisible();
});

test("Blitz: when the time is up the reply counts as wrong, the result names the right one, and the answer is kept as a time-out", async ({ page }) => {
  await blitzOn(page, 3000);
  await open(page);
  await draw(page, 5);
  const c = await page.evaluate(() => JSON.parse(JSON.stringify(window.__t.cur.c))); // the clock began with this syllogism
  await expect(headline(page)).toHaveText("Time is up.", { timeout: 6000 });
  await expect(page.locator(".sylres")).toHaveClass(/bad/);
  await expect(page.locator(".sylres .sylwhat")).toHaveText("The right reply is “the reason is not established”.");
  await expect(page.locator(".sylres .sylconf")).toHaveCount(0);
  await expect(page.locator(".sylchecks")).toContainText(c.checks.e.line); // the three checks are shown as for any result
  const [doc] = await expect.poll(async () => (await saved(page)).length).toBe(1).then(() => saved(page));
  expect(doc).toMatchObject({ mode: "syllogism", answer: "reason", said: null, correct: false, grade: "bad", timeout: true, ms: 3000 });
  // the Review counts it on its own row and not as a mix-up
  await goTo(page, "Review");
  const sec = page.locator(".section", { has: page.locator(".label", { hasText: "Syllogisms" }) });
  await expect(sec).toContainText("Time ran out (Blitz)");
  await expect(sec).toContainText("Time ran out; right: the reason is not established");
  await expect(sec).not.toContainText("Said “");
});

test("Blitz: the countdown stands still behind the practice options and starts again, with its full time, when they close", async ({ page }) => {
  await blitzOn(page, 3000);
  await open(page);
  await draw(page, 1);
  await page.waitForTimeout(2000); // a third of the time is left
  await page.locator("#msess").click();
  await page.waitForTimeout(3600); // longer than the time: nothing is graded behind the sheet
  await expect(page.locator(".sylres")).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(page.locator("#mbar .mbt")).toBeVisible();
  await page.waitForTimeout(1600); // more than what was left: the full time has started again
  await expect(page.locator(".sylres")).toHaveCount(0);
  await expect(headline(page)).toHaveText("Time is up.", { timeout: 4000 });
});

test("Blitz: each new syllogism has its own clock, after Next and after a skip", async ({ page }) => {
  await blitzOn(page, 60000);
  await open(page);
  await draw(page, 1);
  await say(page, "accept");
  await expect(page.locator("#mbar .mbt")).toHaveCount(0); // stopped with the reply
  await next(page).click();
  await expect(page.locator("#mbar .mbt")).toBeVisible();
  await page.locator(".pbar .skipw").click();
  await expect(page.locator("#mbar .mbt")).toBeVisible();
  await expect(page.locator(".sylask")).toBeVisible();
  expect(await saved(page)).toHaveLength(1); // the skip kept nothing
});

test("Blitz: switched on while a counter-example is asked for, the clock starts when the learner goes back to the reply", async ({ page }) => {
  await open(page);
  const sw = page.locator("#mbz");
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await draw(page, 3, "witness");
  await say(page, "pervasion");
  await expect(page.locator("#sylex")).toBeVisible();
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await expect(page.locator("#mbar .mbt")).toHaveCount(0); // no clock against the counter-example
  await page.locator(".sylex .back").click();
  await expect(page.locator(".sylask")).toBeVisible();
  await expect(page.locator("#mbar .mbt")).toBeVisible();
});

test("Blitz: the time of a syllogism is its own, set in the practice options, and kept", async ({ page }) => {
  await open(page);
  await page.locator("#msess").click();
  const sheet = page.locator("#opts");
  await expect(sheet.locator(".ocard", { hasText: "Blitz" })).toContainText("Syllogism 15 s");
  await sheet.getByRole("button", { name: "Blitz: details" }).click();
  await expect(page.locator("#over .shh h2")).toHaveText("Blitz");
  await expect(page.locator("#opts")).toContainText("Syllogism time");
  await expect(page.locator("#opts")).not.toContainText("Relation time");
  await page.locator("#opts").getByRole("button", { name: "30 s" }).click();
  expect(await page.evaluate(() => [localStorage.getItem("rd-timer-syl"), localStorage.getItem("rd-timer"), localStorage.getItem("rd-timer-rel")])).toEqual(["30000", null, null]);
  await page.reload(); // the app opens on the exercise used last
  await expect(page.locator(".sylcard")).toBeVisible();
  await page.locator("#msess").click();
  await expect(page.locator("#opts .ocard", { hasText: "Blitz" })).toContainText("Syllogism 30 s");
});
