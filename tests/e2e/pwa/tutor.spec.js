// The tutor in the installed app: questions go to the app's own server (/api/tutor), which these specs stand in for with
// routes. They check what the page offers (only when the server says its tutor is on), what it sends (the card without the
// instructions, a proof made with the key) and what it shows when the answer streams in or the server refuses. How the Path draws the
// tutor's words (the note under an example, the wait, the conversation) is also looked at in path.spec.js.
import { test as plain } from "@playwright/test";
import { test, expect } from "../../support/test.js";
import { answerFirst, explainChoice, ready, overflow, keyField, enterKey } from "../../support/page.js";
import { dataKey, serveCourse, withCourse } from "../../support/data-key.js";
import { checkProof } from "../../../src/ai/proof.ts";

// The page stores the Magic Key only when the stand-in server can give the definitions that open with it (tests/support/test.js).
const withKey = withCourse ? test : test.skip;

const sse = (...events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const ANSWER = sse({ type: "delta", text: "Stand-in tutor: " }, { type: "delta", text: "this is the stand-in answer." }, { type: "done", truncated: false });
const saying = (line) => [{ status: 200, body: sse({ type: "delta", text: line }, { type: "done", truncated: false }) }];

/** Stands in for the server. `tutor` answers each question in turn (the last one repeats); the requests are kept. */
async function server(page, { health = { ok: true, tutor: "on" }, tutor = [{ status: 200, body: ANSWER }] } = {}) {
  const asked = [];
  await page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(health) }));
  await page.route("**/api/tutor", (route) => {
    const request = route.request();
    asked.push({ headers: request.headers(), body: request.postDataJSON() });
    const reply = tutor[Math.min(asked.length - 1, tutor.length - 1)];
    if (reply.abort) return route.abort("connectionfailed");
    return route.fulfill({ status: reply.status, contentType: reply.status === 200 ? "text/event-stream" : "application/json", body: reply.body });
  });
  return asked;
}

const explain = (page) => explainChoice(page);
/** The explanation, under the result, once Claude has answered. */
const answerText = (page) => page.locator(".wtext");
/** The page with the server and one answer checked (the first relation, the examples left to Claude); Explain is not taken yet. */
const open = async (page, setup) => {
  const asked = await server(page, setup);
  await page.goto("/");
  await ready(page);
  await answerFirst(page);
  return asked;
};

withKey("Explain asks the server, shows the answer, and sends the card without the instructions", async ({ page }) => {
  const asked = await open(page);
  await explain(page).click();
  await expect(answerText(page)).toContainText("this is the stand-in answer.");
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  expect(asked).toHaveLength(1);
  const { headers, body } = asked[0];
  expect(await checkProof(dataKey, headers["x-riglam-device"], headers["x-riglam-proof"])).toBe(true);
  expect(JSON.stringify([headers, body])).not.toContain(dataKey);
  expect(body.kind).toBe("explain");
  expect(body.cats.length).toBeLessThanOrEqual(2);
  expect(body.turns).toHaveLength(1);
  expect(body.turns[0].role).toBe("user");
  expect(body.turns[0].content.startsWith("CARD (from the course booklet's term data")).toBe(true);
  expect(body.turns[0].content).not.toContain("terse debate tutor"); // the server holds the standing instructions
  expect(body.turns[0].content).not.toContain("Fine points"); // and the notes
});

// The terms a note names are dot-underlined when this device has their definitions; a tap opens the definition under the note, inside
// the tutor's block. Another term replaces it; Escape closes it and leaves the note where it is, and the focus stays on the term.
withKey("a note underlines the terms it names and opens their definitions in place", async ({ page }) => {
  await open(page, { tutor: saying('Both: "thing 1" is an external form, so it fits: every form is matter, and matter is a form. => yes\n') });
  await explain(page).click();
  const note = page.locator("#path .exr .tnote").first();
  await expect(note).toBeVisible();
  const marks = note.locator(".dterm[data-dt]"), def = note.locator(".pdef");
  const names = await marks.allInnerTexts();
  expect(names).toContain("external form");
  expect(names).toContain("matter");
  await expect(def).toHaveCount(0);

  const first = marks.filter({ hasText: /^external form$/ }).first();
  await first.click();
  await expect(first).toHaveAttribute("aria-expanded", "true");
  await expect(def.locator(".pdh")).toContainText("External form");
  expect((await def.locator(".pdbody").first().innerText()).length).toBeGreaterThan(10);
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  const matter = marks.filter({ hasText: /^matter$/ }).first();
  await matter.click();
  await expect(def).toHaveCount(1);
  await expect(def.locator(".pdh")).toContainText("Matter");
  await expect(first).toHaveAttribute("aria-expanded", "false");

  await matter.focus();
  await page.keyboard.press("Escape");
  await expect(def).toHaveCount(0);
  await expect(note).toBeVisible();
  // the focus stays on the term, so Enter opens its definition again
  await expect(matter).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(def.locator(".pdh")).toContainText("Matter");
});

// The same in a note the page writes from the two facts: the terms of a reason are underlined, and the definition opens under its consequence, inside the list.
withKey("the terms in the reasons of a fact note are underlined and open their definitions under the consequence", async ({ page }) => {
  await open(page, { tutor: saying('Both: "thing 1" | A yes: it is an external form | B yes: it is matter\n') });
  await explain(page).click();
  const note = page.locator("#path .exr .tnote").first(), steps = note.locator(".tsteps li");
  const marks = steps.locator(".dterm[data-dt]");
  await expect(marks).toHaveText(["external form", "matter"]);
  await expect(note.locator(".pdef")).toHaveCount(0);
  await marks.first().click();
  await expect(steps.first().locator(".pdef .pdh")).toContainText("External form");
  await marks.nth(1).click();
  await expect(note.locator(".pdef")).toHaveCount(1);
  await expect(steps.nth(1).locator(".pdef .pdh")).toContainText("Matter");
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

// A term is underlined where a fact note first names it, not again in its next line: both lines name the color, and the first shows it.
withKey("a term is underlined once in a fact note, where it is first named", async ({ page }) => {
  await open(page, { tutor: saying('Both: "thing 1" | A yes: it is a color | B yes: it is a color\n') });
  await explain(page).click();
  const steps = page.locator("#path .exr .tnote .tsteps li");
  await expect(steps).toHaveCount(2);
  await expect(steps.nth(0).locator(".dterm")).toHaveText(["color"]);
  await expect(steps.nth(1).locator(".dterm")).toHaveCount(0);
  await expect(steps.nth(1)).toContainText("color");
});

// The tutor states two facts about an example and a reason for each; the page writes them as consequences ("It follows it is P, because R") with the pair's own terms.
withKey("a line with the two facts is shown as a list of consequences, and a pervasion stands under its consequence", async ({ page }) => {
  await open(page, { tutor: saying('Both: "thing 1" | A yes: it is a form. | B yes: it is a thing\n') });
  await explain(page).click();
  const note = page.locator("#path .exr .tnote").first();
  await expect(note.locator(".tsteps li")).toHaveText([/^It follows it is .+, because it is a form\.$/, /^It follows it is .+, because it is a thing\.$/]);
  await expect(note.locator(".tsteps li .sub, .tsteps li [data-k]").first()).toBeVisible();   // the pair's terms, marked as the questions mark them
  await expect(note).not.toContainText("|");
});

withKey("a fact whose reason names a pervasion shows it under its consequence", async ({ page }) => {
  // an example that is not in the practice list, so the random pair cannot settle either side from the data
  await open(page, { tutor: saying('Both: "a ripe mango" | A yes: it is a fruit | B no: it is a plant; pervasion: a plant is not a person\n') });
  await explain(page).click();
  const note = page.locator("#path .exr .tnote").first(), steps = note.locator(".tsteps li");
  await expect(steps).toHaveCount(2);
  await expect(steps.nth(1)).toContainText(/It follows it is not .+, because it is a plant/);
  await expect(steps.nth(1).locator(".pnot")).toHaveText("not");   // the denied term's "not" is marked as in the questions
  await expect(steps.nth(1).locator(".twhy")).toContainText("A plant is not a person.");
});

withKey("a follow-up question sends the whole conversation as a chat", async ({ page }) => {
  const asked = await open(page);
  await explain(page).click();
  await expect(answerText(page)).toContainText("this is the stand-in answer.");
  await page.getByRole("button", { name: "Ask a follow-up" }).click();
  await page.fill("#ask-in", "Why not?");
  await page.keyboard.press("Enter");
  await expect.poll(() => asked.length).toBe(2);
  expect(asked[1].body.kind).toBe("chat");
  expect(asked[1].body.turns.map((t) => t.role)).toEqual(["user", "assistant", "user"]);
  expect(asked[1].body.turns[1].content).toContain("this is the stand-in answer.");
  expect(asked[1].body.turns[2].content).toBe("Why not?");
  await expect(page.locator("#path .ptalk")).toContainText("this is the stand-in answer.");
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

withKey("when the day's budget is used the page says so", async ({ page }) => {
  await open(page, { tutor: [{ status: 429, body: JSON.stringify({ error: { code: "rate_limited", message: "budget" } }) }] });
  await explain(page).click();
  await expect(page.getByText(/limit for today is used up/i)).toBeVisible();
});

withKey("a used-up budget says whose it is and when the tutor opens again", async ({ page }) => {
  const resetsAt = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
  await open(page, { tutor: [{ status: 429, body: JSON.stringify({ error: { code: "rate_limited", message: "x", scope: "device", resetsAt } }) }] });
  await explain(page).click();
  await expect(page.getByText(/You have used your share of Claude for today\. It is available again (tomorrow )?at /)).toBeVisible();
  await expect(page.getByText(/Everything else in the app keeps working/)).toBeVisible();
});

withKey("when everybody's budget is used the page says that instead", async ({ page }) => {
  await open(page, { tutor: [{ status: 429, body: JSON.stringify({ error: { code: "rate_limited", message: "x", scope: "global" } }) }] });
  await explain(page).click();
  await expect(page.getByText(/Claude has reached its limit for today for everybody\. Try again tomorrow\./)).toBeVisible();
});

withKey("with no connection the page says so, and the Explanation row asks again", async ({ page }) => {
  const asked = await open(page, { tutor: [{ abort: true }, { status: 200, body: ANSWER }] });
  await explain(page).click();
  await expect(page.getByText(/no connection/i)).toBeVisible();
  await page.getByRole("button", { name: /^Explanation/ }).click();
  await expect.poll(() => asked.length).toBe(2);
  await expect(answerText(page)).toContainText("this is the stand-in answer.");
});

withKey("a refused key takes the tutor away", async ({ page }) => {
  await open(page, { tutor: [{ status: 401, body: JSON.stringify({ error: { code: "not_granted", message: "proof" } }) }] });
  await explain(page).click();
  await expect(page.getByText(/not enabled for this page/i)).toBeVisible();
  await expect(explain(page)).toHaveCount(0);
});

withKey("with the server's tutor off the page offers none", async ({ page }) => {
  const asked = await open(page, { health: { ok: true, tutor: "off" } });
  await expect(explain(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Ask a follow-up" })).toHaveCount(0);
  await expect(page.locator(".wrow")).toHaveCount(0);
  expect(asked).toEqual([]);
});

withKey("with no server at all (the health address is the page itself) the page offers none", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await answerFirst(page);
  await expect(explain(page)).toHaveCount(0);
  await expect(page.locator(".wrow")).toHaveCount(0);
});

// A device without the Magic Key still sees Explain when the server has a tutor: it says what it needs, and a tap opens the Magic Key page; its way back goes to the exercise.
plain("without the Magic Key Explain is there, says it needs the key, and opens the Magic Key page; with the server's tutor off it is not there", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("rd-start", "exercise"));
  const asked = await server(page);
  await page.goto("/");
  await ready(page);
  await expect(keyField(page)).toHaveCount(0); // nothing greets the reader with the Magic Key
  await answerFirst(page);
  await expect(explain(page)).toContainText("needs the Magic Key");
  await explain(page).click();
  await expect(keyField(page)).toBeFocused();
  expect(asked).toEqual([]); // no question was sent
  await keyField(page).blur(); // (on a phone the top bar steps aside while the field has the keyboard)
  await page.getByRole("button", { name: "Back to the exercise", exact: true }).click();
  await expect(page.locator(".pvline")).toBeVisible(); // the result, as it was

  const off = await page.context().newPage();
  await off.addInitScript(() => localStorage.setItem("rd-start", "exercise"));
  await server(off, { health: { ok: true, tutor: "off" } });
  await off.goto("/");
  await ready(off);
  await answerFirst(off);
  await expect(explain(off)).toHaveCount(0);
});

// The Explain that was tapped without the key was tapped for a reason: once the key is entered, the page stays as it was and the question goes out.
plain("Explain without the Magic Key: entering the key on its page goes back to the result as it was and asks the question", async ({ page }) => {
  test.skip(!withCourse, "needs the course data to unlock the definitions");
  await serveCourse(page);
  await page.addInitScript(() => localStorage.setItem("rd-start", "exercise"));
  const asked = await server(page);
  await page.goto("/");
  await ready(page);
  await answerFirst(page);
  const pair = () => page.locator("#path .pn.res .pnl b").allInnerTexts();
  const before = await pair();
  await page.evaluate(() => { window.__sameDocument = true; });
  await explain(page).click();
  await enterKey(page, dataKey);
  await expect(keyField(page)).toHaveCount(0);
  await expect(answerText(page)).toContainText("this is the stand-in answer.");
  expect(asked).toHaveLength(1);
  expect(asked[0].body.kind).toBe("explain");
  expect(await pair()).toEqual(before);
  expect(await page.evaluate(() => window.__sameDocument), "the page was not reloaded").toBe(true);
});
