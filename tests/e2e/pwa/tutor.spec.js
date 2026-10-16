// The tutor in the installed app: questions go to the app's own server (/api/tutor), which these specs stand in for with
// routes. They check what the page offers (only when the server says its tutor is on), what it sends (the card without the
// instructions, a proof made with the key) and what it shows when the answer streams in or the server refuses.
import { test as plain } from "@playwright/test";
import { test, expect } from "../../support/test.js";
import { ready, relOptions, isPhone, overflow } from "../../support/page.js";
import { dataKey, withCourse } from "../../support/data-key.js";
import { checkProof } from "../../../src/ai/proof.ts";

// The page stores the Magic Key only when the stand-in server can give the definitions that open with it (tests/support/test.js).
const withKey = withCourse ? test : test.skip;

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

// A device without the Magic Key still sees Explain when the server has a tutor: grayed, and a tap says what it needs.
plain("without the Magic Key Explain is there, grayed, and opens the Magic Key prompt; with the server's tutor off it is not there", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the answer flow is exercised in the phone layout");
  const asked = await server(page);
  await page.goto("/");
  await ready(page);
  await expect(page.locator("#unlock")).toHaveCount(0); // nothing greets the reader with a prompt
  await answerOnPhone(page);
  await expect(explain(page)).toHaveAttribute("aria-disabled", "true");
  await explain(page).click({ force: true }); // aria-disabled, but it can be tapped
  await expect(page.locator("#unlock")).toBeVisible();
  await expect(page.locator("#unlock")).toContainText("Magic Key");
  expect(asked).toEqual([]); // no question was sent

  const off = await page.context().newPage();
  await server(off, { health: { ok: true, tutor: "off" } });
  await off.goto("/");
  await ready(off);
  await answerOnPhone(off);
  await expect(explain(off)).toHaveCount(0);
});
