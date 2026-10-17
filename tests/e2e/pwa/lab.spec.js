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

const sse = (...events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const FACTS = { both: ["yes", "yes"], anb: ["yes", "no"], bna: ["no", "yes"], nei: ["no", "no"] };
const CELL = { both: "Both", anb: "A not B", bna: "B not A", nei: "Neither" };
const learner = (t) => t.cells[0]; // the cell the learner put the example in
const elsewhere = (t) => (learner(t) === "anb" ? "nei" : "anb"); // a cell that is not the learner's
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const thingsOf = (page) => page.evaluate(() => window.__t.labThings(window.__t.ui).map((t) => ({ text: t.text, cells: t.cells })));

/** Stands in for the server. `lab` answers each call (default: the same classification from the model asked for); the calls are kept. */
async function server(page, { health = { ok: true, tutor: "on", lab: "on" }, lab = null } = {}) {
  const calls = [];
  await page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(health) }));
  await page.route("**/api/lab", async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    calls.push({ headers: request.headers(), body });
    if (lab) return route.fulfill(await lab(body, calls.length));
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

// Where Quorum is divided about an example, the page flags it by itself (a flag with auto "quorum"): that is the copy of a disagreement that can leave the
// run it came from, and what the flag review will read.
withKey("where the models differ, the page flags each such example by itself, and a later run does not touch a flag that was reviewed", async ({ page }, testInfo) => {
  const calls = await open(page, testInfo, {
    lab: (body) => {
      // Haiku puts every example in A, Sonnet and Opus (and the judge) in neither
      const things = body.model === "claude-haiku-5-5" ? THINGS.map((t) => ({ ...t, inA: true })) : THINGS;
      return { status: 200, contentType: "application/json", body: JSON.stringify({ text: JSON.stringify({ things }), truncated: false, modelApplied: body.model }) };
    },
  });
  await expect.poll(() => calls.length).toBe(4); // three models, then the judge
  const flags = () => page.evaluate(() => Object.values(window.__t.flags));
  const things = await page.evaluate(() => window.__t.labThings(window.__t.ui).map((t) => t.text));
  expect(things.length).toBeGreaterThan(0);
  await expect.poll(async () => (await flags()).length).toBe(things.length);
  const made = await flags();
  expect(made.map((f) => f.thing).sort()).toEqual([...things].sort());
  for (const f of made) {
    expect(f).toMatchObject({ auto: "quorum", part: "quorum", state: "new", note: "" });
    expect(f.shown).toMatch(/^The models gave different cells\. Models: Haiku A not B, Sonnet Neither, Opus Neither\. Judge: Neither\./);
    expect(f.caseKey).toMatch(/^answers_/);
    expect(f.pair).toMatchObject({ tab: "practice" });
  }
  // Review lists them as automatic flags
  await page.getByRole("tab", { name: "Review" }).filter({ visible: true }).first().click();
  await expect(page.locator(".flagl li").first()).toContainText(/Quorum \(automatic\)/);
  await expect(page.locator(".flagl li")).toHaveCount(things.length);
  // one reviewed by hand stays as it was when the judge is asked again; the others are written again only if their words changed (here they did not)
  const id = made[0].id;
  await page.evaluate((i) => window.__t.setFlagState(i, "reviewed"), id);
  const before = await page.evaluate((i) => window.__t.flags[i], id);
  await page.getByRole("tab", { name: /^(Relations|Practice|Pervasions)/ }).first().click().catch(() => {});
  await page.evaluate(() => window.__t.labJudgeNow());
  await expect.poll(() => calls.length).toBe(5);
  await page.waitForTimeout(300);
  const after = await flags();
  expect(after).toHaveLength(things.length);
  expect(after.find((f) => f.id === id)).toEqual(before);
});

// The lab and the tutor's explanation work at the same time. The explanation can change the page's verdicts after the lab has finished, and the same final verdicts
// must give the same flags whichever came first.
withKey("a verdict the explanation gives after the lab has finished is compared with the lab, as it would have been the other way round", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the answer flow is exercised in the phone layout");
  await page.addInitScript(() => localStorage.setItem("rd-autoexplain", "1"));
  let labAnswered = 0;
  // every model puts every example in a cell that is not the learner's, and they agree
  const lab = async (body) => {
    const things = await thingsOf(page);
    labAnswered += 1;
    const recs = things.map((t) => { const [a, b] = FACTS[elsewhere(t)]; return { thing: t.text, reading: "a stand-in reading", inA: a === "yes", inB: b === "yes", exists: true, unsure: false }; });
    return { status: 200, contentType: "application/json", body: JSON.stringify({ text: JSON.stringify({ things: recs }), truncated: false, modelApplied: body.model }) };
  };
  // the explanation comes after the lab, and says that every example fits where the learner put it
  await page.route("**/api/tutor", async (route) => {
    while (labAnswered < 3) await sleep(50);
    await sleep(700);
    const lines = (await thingsOf(page)).map((t) => {
      const [a, b] = FACTS[learner(t)];
      return `${CELL[learner(t)]}: "${t.text}" | class: Table | A ${a}: because of its use | B ${b}: because of its make`;
    });
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: sse({ type: "delta", text: lines.join("\n") + "\nExplanation: stand-in." }, { type: "done", truncated: false }) });
  });
  const calls = await open(page, testInfo, { lab });
  await expect.poll(() => calls.length).toBe(3);
  const things = await thingsOf(page);
  expect(things.length).toBeGreaterThan(0);
  const flags = () => page.evaluate(() => Object.values(window.__t.flags));
  await sleep(250);
  expect(await flags()).toEqual([]); // the page has said nothing yet about these examples, so the lab's agreement is not in dispute
  await expect.poll(async () => (await flags()).length, { timeout: 10000 }).toBe(things.length);
  for (const f of await flags()) expect(f).toMatchObject({ auto: "quorum", part: "quorum", state: "new" });
  expect((await flags())[0].shown).toMatch(/^The models agree, but the page does not\./);
});

withKey("calls that fail together differently leave the longer pause: a busy model does not shorten a used-up budget", async ({ page }, testInfo) => {
  const budget = { status: 429, contentType: "application/json", body: JSON.stringify({ error: { code: "rate_limited", message: "x", scope: "device", resetsAt: "2099-01-01T00:00:00Z" } }) };
  const busy = { status: 503, contentType: "application/json", body: JSON.stringify({ error: { code: "rate_limited", message: "busy" } }) };
  // Haiku hits the budget at once; the others find the models busy a moment later
  const calls = await open(page, testInfo, { lab: async (body) => { if (body.model === "claude-haiku-5-5") return budget; await sleep(500); return busy; } });
  await expect.poll(() => calls.length).toBe(3);
  await sleep(900);
  expect(await page.evaluate(() => window.__t.labPause - Date.now())).toBeGreaterThan(3600 * 1000);
  await page.getByRole("button", { name: /next pair/i }).click();
  await ready(page);
  await answerOnPhone(page);
  await page.waitForTimeout(500);
  expect(calls).toHaveLength(3);
  await quorum(page).click();
  await expect(page.locator(".lab")).toContainText(/paused: the budget for Quorum is used up/i);
});

// one request for the tutor and the lab together (the account row asks for itself: that is the other one)
withKey("a start asks /api/health once for the tutor and the lab together, not once for each", async ({ page }, testInfo) => {
  let health = 0;
  page.on("request", (r) => { if (new URL(r.url()).pathname === "/api/health") health += 1; });
  const calls = await open(page, testInfo);
  await expect.poll(() => calls.length).toBe(3);
  expect(health).toBe(2);
});

// A flag the learner deletes is not written again by the page unless the models are run again: the explanation that arrives later reads the disputes again,
// but only to flag what this round of the models had not flagged.
withKey("a flag the learner deleted while the explanation was still on its way does not come back when it arrives", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the answer flow is exercised in the phone layout");
  await page.addInitScript(() => localStorage.setItem("rd-autoexplain", "1"));
  let release;
  const released = new Promise((resolve) => { release = resolve; });
  await page.route("**/api/tutor", async (route) => {
    await released;
    const lines = (await thingsOf(page)).map((t) => {
      const [a, b] = FACTS[learner(t)];
      return `${CELL[learner(t)]}: "${t.text}" | class: Table | A ${a}: because of its use | B ${b}: because of its make`;
    });
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: sse({ type: "delta", text: lines.join("\n") + "\nExplanation: stand-in." }, { type: "done", truncated: false }) });
  });
  // Haiku puts every example in A, the others (and the judge) in neither: the models are divided
  const calls = await open(page, testInfo, {
    lab: (body) => {
      const things = body.model === "claude-haiku-5-5" ? THINGS.map((t) => ({ ...t, inA: true })) : THINGS;
      return { status: 200, contentType: "application/json", body: JSON.stringify({ text: JSON.stringify({ things }), truncated: false, modelApplied: body.model }) };
    },
  });
  await expect.poll(() => calls.length).toBe(4); // three models, then the judge
  const flags = () => page.evaluate(() => Object.values(window.__t.flags));
  const things = await thingsOf(page);
  expect(things.length).toBeGreaterThan(1);
  await expect.poll(async () => (await flags()).length).toBe(things.length);
  const gone = (await flags())[0];
  await page.evaluate((id) => window.__t.removeFlag(id), gone.id);
  await expect.poll(async () => (await flags()).length).toBe(things.length - 1);
  release();
  // the explanation is in: the chat is no longer waiting
  await expect.poll(() => page.evaluate(() => !window.__t.ui.ctl && window.__t.ui.explained)).toBe(true);
  await sleep(400);
  const left = await flags();
  expect(left).toHaveLength(things.length - 1);
  expect(left.map((f) => f.id)).not.toContain(gone.id);
});
