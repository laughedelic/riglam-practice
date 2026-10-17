// The check lab in the installed app (Quorum): on a Preview the server answers the lab's model calls (POST /api/lab), and the page runs three models
// on each checked answer. These specs stand in for the server with routes. They check that the lab appears only when the server says it answers,
// what each call sends (a proof made with the key, the model asked for) and what the page shows when the answers come back or the budget is used up.
import { test as plain } from "@playwright/test";
import { test, expect } from "../../support/test.js";
import { ready, relOptions, isPhone, overflow } from "../../support/page.js";
import { dataKey, serveCourse, withCourse } from "../../support/data-key.js";
import { checkProof } from "../../../src/ai/proof.ts";

const withKey = withCourse ? test : test.skip;

const THINGS = Array.from({ length: 6 }, (_, i) => ({ thing: "thing " + (i + 1), reading: "an ordinary " + (i + 1), inA: false, inB: false, exists: true, unsure: false }));

/** Stands in for the server. `lab` answers each call (default: the same classification from the model asked for); the calls are kept. */
async function server(page, { health = { ok: true, tutor: "on", lab: "on" }, lab = null } = {}) {
  const calls = [];
  await page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(health) }));
  await page.route("**/api/lab", (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    calls.push({ headers: request.headers(), body });
    if (lab) return route.fulfill(lab(body, calls.length));
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ text: JSON.stringify({ things: THINGS }), truncated: false, modelApplied: body.model }) });
  });
  return calls;
}

async function answerOnPhone(page) {
  await relOptions(page).first().click();
  for (let i = 0; i < 4 && (await page.locator("#cin").isVisible()); i++) {
    await page.fill("#cin", "thing " + (i + 1));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
  }
}
async function answerWithoutExamples(page) {
  await relOptions(page).first().click();
  for (let i = 0; i < 6 && (await page.locator("#cin").isVisible()); i++) {
    await page.locator("#cin").focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
  }
}
const quorum = (page) => page.locator(".vchip").filter({ hasText: /quorum/i });
const open = async (page, testInfo, setup) => {
  test.skip(!isPhone(testInfo), "the answer flow is exercised in the phone layout");
  // the judge is asked for a spot check on about one answer in ten: not in these specs
  await page.addInitScript(() => { window.__riglamTest = (t) => { window.__t = t; }; });
  const calls = await server(page, setup);
  await page.goto("/");
  await ready(page);
  await page.evaluate(() => { window.__t.labSpotN = 0; });
  await answerOnPhone(page);
  return calls;
};

withKey("on a server that answers the lab, a checked answer goes to Haiku, Sonnet and Opus, each with a proof of the key", async ({ page }, testInfo) => {
  const calls = await open(page, testInfo);
  await expect.poll(() => calls.length).toBe(3);
  expect(calls.map((c) => c.body.model).sort()).toEqual(["claude-haiku-5-5", "claude-opus-5-5", "claude-sonnet-5-5"]);
  for (const { headers, body } of calls) {
    expect(await checkProof(dataKey, headers["x-riglam-device"], headers["x-riglam-proof"])).toBe(true);
    expect(JSON.stringify([headers, body])).not.toContain(dataKey);
    expect(body.effort).toBe("medium");
    expect(body.prompt).toContain("CATEGORY REFERENCE");
    expect(body.prompt).toContain("CASE");
  }
  // all three agree with each other, so no judge is asked; the sign says whether they also agree with the learner
  await expect(quorum(page)).toContainText(/[=≠]/);
  expect(calls).toHaveLength(3);
});

withKey("the Quorum chip opens the three answers, and Options has the switch, on", async ({ page }, testInfo) => {
  await open(page, testInfo);
  await expect(quorum(page)).toContainText(/[=≠]/);
  await quorum(page).click();
  const panel = page.locator(".lab");
  await expect(panel.getByText("Quorum", { exact: false }).first()).toBeVisible();
  for (const name of ["Haiku", "Sonnet", "Opus"]) await expect(panel.locator(".lab-r .mn", { hasText: name }).first()).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
  await page.getByRole("button", { name: "Options" }).first().click();
  const sw = page.getByRole("switch", { name: /three models check every answer/i });
  await expect(sw).toHaveAttribute("aria-checked", "true");
});

withKey("a model that is not the one asked for is not counted", async ({ page }, testInfo) => {
  await open(page, testInfo, {
    lab: (body) => ({ status: 200, contentType: "application/json", body: JSON.stringify({ text: JSON.stringify({ things: THINGS }), truncated: false, modelApplied: body.model === "claude-opus-5-5" ? "claude-sonnet-5-5" : body.model }) }),
  });
  await quorum(page).click();
  await expect(page.locator(".lab .status")).toContainText(/another model answered/i);
});

withKey("a server that does not say it answers the lab gets no calls, no chip and no switch", async ({ page }, testInfo) => {
  const calls = await open(page, testInfo, { health: { ok: true, tutor: "on" } });
  await page.waitForTimeout(500);
  expect(calls).toHaveLength(0);
  await expect(quorum(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Options" }).first().click();
  await expect(page.getByRole("switch", { name: /three models check every answer/i })).toHaveCount(0);
});

withKey("a used-up budget stops the lab for the rest of the visit", async ({ page }, testInfo) => {
  const budget = { status: 429, contentType: "application/json", body: JSON.stringify({ error: { code: "rate_limited", message: "x", scope: "device", resetsAt: "2099-01-01T00:00:00Z" } }) };
  const calls = await open(page, testInfo, { lab: () => budget });
  await expect.poll(() => calls.length).toBe(3);
  await expect(quorum(page)).toBeVisible();
  await page.getByRole("button", { name: /next pair/i }).click();
  await ready(page);
  await answerOnPhone(page);
  await page.waitForTimeout(500);
  expect(calls).toHaveLength(3);
  // the chip is there for the next answer too, and says why nothing ran
  await quorum(page).click();
  await expect(page.locator(".lab")).toContainText(/paused: the budget for Quorum is used up/i);
  await expect(page.locator(".lab .lab-r")).toHaveCount(0);
});

withKey("an answer with no example written still has the Quorum chip, which says there was nothing to check", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the answer flow is exercised in the phone layout");
  await page.addInitScript(() => { window.__riglamTest = (t) => { window.__t = t; }; });
  const calls = await server(page);
  await page.goto("/");
  await ready(page);
  await answerWithoutExamples(page);
  await expect(quorum(page)).toBeVisible();
  await quorum(page).click();
  await expect(page.locator(".lab")).toContainText(/nothing to check: no example was written/i);
  await page.waitForTimeout(300);
  expect(calls).toHaveLength(0);
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

// A device that has no Magic Key yet can check an answer (there is no lab then); the key entered afterwards gives that answer its run too.
plain("an answer checked before the Magic Key was entered gets its Quorum run once the key is taken", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the answer flow is exercised in the phone layout");
  test.skip(!withCourse, "needs the course data to unlock the definitions");
  await page.addInitScript(() => { window.__riglamTest = (t) => { window.__t = t; }; });
  await serveCourse(page);
  const calls = await server(page);
  await page.route("**/api/tutor", (route) =>
    route.fulfill({ status: 200, contentType: "text/event-stream", body: `event: delta\ndata: ${JSON.stringify({ type: "delta", text: "Stand-in." })}\n\nevent: done\ndata: ${JSON.stringify({ type: "done", truncated: false })}\n\n` }),
  );
  await page.goto("/");
  await ready(page);
  await page.evaluate(() => { window.__t.labSpotN = 0; });
  await answerOnPhone(page);
  await page.waitForTimeout(300);
  await expect(quorum(page)).toHaveCount(0);
  expect(calls).toHaveLength(0);
  await page.getByRole("button", { name: /^explain$/i }).click({ force: true });
  await page.fill("#unlock-key", dataKey);
  await page.locator("#unlock").getByRole("button", { name: "Unlock", exact: true }).click();
  await expect.poll(() => calls.length).toBe(3);
  await expect(quorum(page)).toContainText(/[=≠]/);
});
