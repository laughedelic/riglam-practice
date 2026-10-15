// The tutor in the installed app: questions go to the app's own server (/api/tutor), which these specs stand in for with
// routes. They check what the page offers (only when the server says its tutor is on), what it sends (the card without the
// instructions, a proof made with the key) and what it shows when the answer streams in or the server refuses.
import { test, expect } from "../../support/test.js";
import { ready, relOptions, isPhone, overflow } from "../../support/page.js";
import { dataKey } from "../../support/data-key.js";
import { checkProof } from "../../../src/ai/proof.ts";

// The tutor needs the study group's key to be a real one that opens the definitions (docs/DATA.md).
const withKey = dataKey ? test : test.skip;

const sse = (...events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const ANSWER = sse({ type: "delta", text: "Stand-in tutor: " }, { type: "delta", text: "this is the stand-in answer." }, { type: "done", truncated: false });

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

async function answerOnPhone(page) {
  await relOptions(page).first().click();
  for (let i = 0; i < 4 && (await page.locator("#cin").isVisible()); i++) {
    await page.fill("#cin", "thing " + (i + 1));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
  }
}
// The Why panel of the result screen shows only what the marks do not (and nothing at all after a right answer); the chat view has the whole answer.
async function openAnswer(page) {
  await page.getByRole("button", { name: /discuss with ai/i }).click();
  await expect(page.getByLabel("Discuss with AI").getByText("this is the stand-in answer.")).toBeVisible();
}
const explain = (page) => page.getByRole("button", { name: /^explain$|check and explain/i });
const open = async (page, testInfo, setup) => {
  test.skip(!isPhone(testInfo), "the answer flow is exercised in the phone layout");
  const asked = await server(page, setup);
  await page.goto("/");
  await ready(page);
  await answerOnPhone(page);
  return asked;
};

withKey("Explain asks the server, shows the answer, and sends the card without the instructions", async ({ page }, testInfo) => {
  const asked = await open(page, testInfo);
  await explain(page).click();
  await openAnswer(page);
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

// A note on a cell opens under the heading "Why?", so a Why? the tutor starts its debate line with is not said twice; the line under
// a note that underlines no term points to the definitions only when the Terms panel has some.
withKey("a note under a cell is headed Why? and points to the definitions", async ({ page }, testInfo) => {
  const line = 'Both: Why? "thing 1" is a wooden thing, so it fits. => yes\n';
  await open(page, testInfo, { tutor: [{ status: 200, body: sse({ type: "delta", text: line }, { type: "done", truncated: false }) }] });
  await explain(page).click();
  await page.locator(".grid .qm").first().click();
  const pop = page.locator(".grid .pop");
  await expect(pop.locator(".clh")).toHaveText("Why?");
  await expect(pop.locator("p").nth(1)).toHaveText('"thing 1" is a wooden thing, so it fits.');
  const hint = await pop.locator(".popnote").count();
  if (hint) await expect(pop.locator(".popnote")).toHaveText("Definitions of these terms are under Terms.");
  await page.getByRole("tab", { name: "Terms" }).click();
  expect(await page.locator(".tm-tog").count() > 0).toBe(hint > 0);
});

// The terms a note names are dot-underlined when this device has their definitions, each once; a tap opens the definition under the
// text, inside the note. Another term replaces it; a tap elsewhere or Escape closes it and leaves the note open.
withKey("a note underlines the terms it names and opens their definitions in place", async ({ page }, testInfo) => {
  const line = 'Both: "thing 1" is an external form, so it fits: every form is matter, and matter is a form. => yes\n';
  await open(page, testInfo, { tutor: [{ status: 200, body: sse({ type: "delta", text: line }, { type: "done", truncated: false }) }] });
  await explain(page).click();
  await page.locator(".grid .qm").first().click();
  const pop = page.locator(".grid .pop"), marks = pop.locator(".dterm"), def = pop.locator(".ddef");
  await expect(marks).toHaveText(["external form", "form", "matter"]);
  await expect(pop.locator(".popnote")).toHaveText("Tap an underlined term for its definition.");
  await expect(def).toHaveCount(0);

  await marks.first().click();
  await expect(marks.first()).toHaveAttribute("aria-expanded", "true");
  await expect(def.locator("dt")).toContainText("External form");
  expect((await def.locator("dd").innerText()).length).toBeGreaterThan(10);
  expect(await overflow(page)).toBeLessThanOrEqual(0);

  await marks.nth(2).click();
  await expect(def).toHaveCount(1);
  await expect(def.locator("dt")).toContainText("Matter");
  await expect(marks.first()).toHaveAttribute("aria-expanded", "false");

  await pop.locator(".clh").click();
  await expect(def).toHaveCount(0);
  await expect(pop).toBeVisible();

  await marks.nth(1).focus();
  await page.keyboard.press("Enter");
  await expect(def.locator("dt")).toContainText("Form");
  await page.keyboard.press("Escape");
  await expect(def).toHaveCount(0);
  await expect(pop).toBeVisible();
});

withKey("a follow-up question sends the whole conversation as a chat", async ({ page }, testInfo) => {
  const asked = await open(page, testInfo);
  await explain(page).click();
  await openAnswer(page);
  await page.fill("#ask-in", "Why not?");
  await page.keyboard.press("Enter");
  await expect.poll(() => asked.length).toBe(2);
  expect(asked[1].body.kind).toBe("chat");
  expect(asked[1].body.turns.map((t) => t.role)).toEqual(["user", "assistant", "user"]);
  expect(asked[1].body.turns[1].content).toContain("this is the stand-in answer.");
  expect(asked[1].body.turns[2].content).toBe("Why not?");
});

withKey("when the day's budget is used the page says so", async ({ page }, testInfo) => {
  await open(page, testInfo, { tutor: [{ status: 429, body: JSON.stringify({ error: { code: "rate_limited", message: "budget" } }) }] });
  await explain(page).click();
  await expect(page.getByText(/limit for today is used up/i)).toBeVisible();
});

withKey("a used-up budget says whose it is and when the tutor opens again", async ({ page }, testInfo) => {
  const resetsAt = new Date(Date.now() + 3 * 3600 * 1000).toISOString();
  await open(page, testInfo, { tutor: [{ status: 429, body: JSON.stringify({ error: { code: "rate_limited", message: "x", scope: "device", resetsAt } }) }] });
  await explain(page).click();
  await expect(page.getByText(/You have used your share of the tutor for today\. It is available again (tomorrow )?at /)).toBeVisible();
  await expect(page.getByText(/Everything else in the app keeps working/)).toBeVisible();
});

withKey("when everybody's budget is used the page says that instead", async ({ page }, testInfo) => {
  await open(page, testInfo, { tutor: [{ status: 429, body: JSON.stringify({ error: { code: "rate_limited", message: "x", scope: "global" } }) }] });
  await explain(page).click();
  await expect(page.getByText(/The tutor has reached its limit for today for everybody\. Try again tomorrow\./)).toBeVisible();
});

withKey("with no connection the page says so, and Explain can be tried again", async ({ page }, testInfo) => {
  await open(page, testInfo, { tutor: [{ abort: true }, { status: 200, body: ANSWER }] });
  await explain(page).click();
  await expect(page.getByText(/no connection/i)).toBeVisible();
  await explain(page).click();
  await openAnswer(page);
});

withKey("a refused key takes the tutor away", async ({ page }, testInfo) => {
  await open(page, testInfo, { tutor: [{ status: 401, body: JSON.stringify({ error: { code: "not_granted", message: "proof" } }) }] });
  await explain(page).click();
  await expect(page.getByText(/not enabled for this page/i)).toBeVisible();
  await expect(explain(page)).toHaveCount(0);
});

withKey("with the server's tutor off the page offers none", async ({ page }, testInfo) => {
  const asked = await open(page, testInfo, { health: { ok: true, tutor: "off" } });
  await expect(explain(page)).toHaveCount(0);
  await expect(page.getByRole("button", { name: /discuss with ai/i })).toHaveCount(0);
  expect(asked).toEqual([]);
});

withKey("with no server at all (the health address is the page itself) the page offers none", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the answer flow is exercised in the phone layout");
  await page.goto("/");
  await ready(page);
  await answerOnPhone(page);
  await expect(explain(page)).toHaveCount(0);
});

withKey("on a wide screen the error and a follow-up answer appear in the coach panel", async ({ page }, testInfo) => {
  test.skip(isPhone(testInfo), "the phone layout has its own spec above");
  const asked = await server(page, { tutor: [{ status: 429, body: JSON.stringify({ error: { code: "rate_limited", message: "budget" } }) }, { status: 200, body: ANSWER }] });
  await page.goto("/");
  await ready(page);
  await relOptions(page).first().click();
  await page.getByRole("button", { name: /show result/i }).click();
  await explain(page).click();
  await expect(page.getByText(/limit for today is used up/i)).toBeVisible();
  await page.fill("#ask-in", "Why not?");
  await page.keyboard.press("Enter");
  await expect(page.getByText("this is the stand-in answer.")).toBeVisible();
  expect(asked.map((a) => a.body.kind)).toEqual(["explain", "chat"]);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});
