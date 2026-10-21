// Quorum in the installed app, the tutor's mode on a Preview: with the switch on, the explanation of a checked answer is asked of the server with `quorum: true`,
// and the server's answer carries the run (the three models and the judge) for the chip under the result. These specs stand in for the server with routes. They check
// that the mode is offered only when the server says it is, what is sent, what the chip and its panel show for each kind of run, the flags (by hand and automatic),
// the switch in the practice options and that the panel fits a phone.
import { test as plain } from "@playwright/test";
import { test, expect } from "../../support/test.js";
import { goTo, ready, relOptions, isPhone, overflow } from "../../support/page.js";
import { dataKey, serveCourse, withCourse } from "../../support/data-key.js";
import { checkProof } from "../../../src/ai/proof.ts";

const withKey = withCourse ? test : test.skip;

const sse = (...events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const PLAIN = sse({ type: "delta", text: "Stand-in tutor: this is the stand-in answer." }, { type: "done", truncated: false });
const RECORD_ID = "11111111-2222-4333-8444-555555555555";

const FACTS = { both: ["yes", "yes"], anb: ["yes", "no"], bna: ["no", "yes"], nei: ["no", "no"] };
const CELL = { both: "Both", anb: "A not B", bna: "B not A", nei: "Neither" };
const learner = (t) => t.cells[0]; // the cell the learner put the example in
const elsewhere = (t) => (learner(t) === "anb" ? "nei" : "anb"); // a cell that is not the learner's
// the cell the page itself can stand beside: the learner's, unless the page already knows the example does not fit there (the pair is random, so it may)
const withPage = (t) => (t.page[learner(t)] === "bad" ? elsewhere(t) : learner(t));

/** One answer in the tutor's form: a line for each example, in the cell the learner put it in, with the facts of the cell `pick` gives it (null: unsure). */
function answerText(things, pick) {
  const lines = things.map((t) => {
    const c = pick(t);
    const [a, b] = c ? FACTS[c] : ["unsure", "unsure"];
    return `${CELL[learner(t)]}: "${t.text}" | class: Table | A ${a}: because of its use | B ${b}: because of its make`;
  });
  return lines.join("\n") + "\nExplanation: this is the stand-in answer.";
}

const MODELS = [["Haiku", "claude-haiku-5-5"], ["Sonnet", "claude-sonnet-5-5"], ["Opus", "claude-opus-5-5"]];
/** The server's events for a run. `picks` has a function for each call that answered (Haiku, Sonnet, Opus, Judge); a missing one failed, or was not asked. */
function run(things, picks) {
  const models = MODELS.map(([name, model]) => (picks[name] ? { name, model, text: answerText(things, picks[name]), ok: true, ms: 1400 } : { name, model, text: "", ok: false, ms: 300, error: "unavailable" }));
  const judge = picks.Judge ? { name: "Judge", model: "claude-opus-5-5", text: answerText(things, picks.Judge), ok: true, ms: 4200 } : null;
  const shown = judge ?? models.filter((m) => m.ok).at(-1);
  return sse(
    ...models.map((m) => ({ type: "step", name: m.name, ok: m.ok })),
    ...(judge ? [{ type: "step", name: "Judge", ok: true }] : []),
    { type: "delta", text: shown.text },
    { type: "quorum", record: { id: RECORD_ID, models, judge, shown: shown.name, why: judge ? "disagree" : null } },
    { type: "done", truncated: false },
  );
}
const AGREE = { Haiku: learner, Sonnet: learner, Opus: learner };
const CONSISTENT = { Haiku: withPage, Sonnet: withPage, Opus: withPage };
const DIFFER = { Haiku: elsewhere, Sonnet: learner, Opus: learner, Judge: learner };

/**
 * Stands in for the server. `tutor(body, n, things)` answers each explain question, as {status, body}; `things` are the examples the learner wrote, read from the page.
 * By default the three models agree with the learner. A chat question gets a plain answer. The questions are kept.
 */
async function server(page, { health = { ok: true, tutor: "on", quorum: "on" }, tutor = (_body, _n, things) => ({ status: 200, body: run(things, AGREE) }) } = {}) {
  const asked = [];
  await page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(health) }));
  await page.route("**/api/tutor", async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    asked.push({ headers: request.headers(), body });
    if (body.kind !== "explain") return route.fulfill({ status: 200, contentType: "text/event-stream", body: PLAIN });
    const things = await page.evaluate(() => window.__t.quorumThings(window.__t.ui).map((t) => ({ text: t.text, cells: t.cells, page: t.page })));
    const reply = await tutor(body, asked.length, things);
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
// every cell left empty: the page has a verdict for each (right, or "missing"), so no example is left for it to check
async function answerBlank(page) {
  await relOptions(page).first().click();
  for (let i = 0; i < 4 && (await page.locator("#cin").isVisible()); i++) {
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
  }
}
const explain = (page) => page.getByRole("button", { name: /^explain$|check and explain/i });
const quorum = (page) => page.locator(".vchip").filter({ hasText: /quorum/i });
const sw = (page) => page.getByRole("switch", { name: /several models explain/i });
const rowOf = (page, name) => page.locator(".quorum-r").filter({ has: page.locator(".mn", { hasText: name }) });
const flags = (page) => page.evaluate(() => Object.values(window.__t.flags));
const thingsOf = (page) => page.evaluate(() => window.__t.quorumThings(window.__t.ui).map((t) => t.text));

/** The page with one answer checked; Explain is not tapped yet. `setting` is the stored value of "Check every answer with AI" (null: its default, on); `answer` fills the cells. */
const open = async (page, testInfo, setup, setting = "0", answer = answerOnPhone) => {
  test.skip(!isPhone(testInfo), "the answer flow is exercised in the phone layout");
  await page.addInitScript((v) => { window.__riglamTest = (t) => { window.__t = t; }; if (v !== null) localStorage.setItem("rd-autoexplain", v); else localStorage.removeItem("rd-autoexplain"); }, setting);
  const asked = await server(page, setup);
  await page.goto("/");
  await ready(page);
  await answer(page);
  return asked;
};
/** … and Explain tapped, with the run's chip shown. */
const explained = async (page, testInfo, setup) => {
  const asked = await open(page, testInfo, setup);
  await explain(page).click();
  await expect(quorum(page)).toContainText(/[=≠]/);
  return asked;
};

withKey("on a server that offers Quorum, Explain is asked with quorum: true and a proof of the key, and the chip says the models agree", async ({ page }, testInfo) => {
  const asked = await explained(page, testInfo);
  expect(asked).toHaveLength(1);
  const { headers, body } = asked[0];
  expect(body.kind).toBe("explain");
  expect(body.quorum).toBe(true);
  expect(await checkProof(dataKey, headers["x-riglam-device"], headers["x-riglam-proof"])).toBe(true);
  expect(JSON.stringify([headers, body])).not.toContain(dataKey);
  await expect(quorum(page)).toContainText("=");
});

// the server keeps what the answer says of these (docs/SERVER.md, "Learned facts"): the examples the page could not check, with their cells, read before the verdicts arrive
withKey("an explain question names the learner's examples the page could not check, each with its cell", async ({ page }, testInfo) => {
  let open;
  const asked = await explained(page, testInfo, {
    tutor: (_body, _n, things) => {
      open = things.flatMap((t) => t.cells.filter((c) => t.page[c] === "cmp").map((c) => ({ cell: c, text: t.text })));
      return { status: 200, body: run(things, AGREE) };
    },
  });
  expect(open.length).toBeGreaterThan(0);
  expect(asked[0].body.examples).toEqual(open);
});

// one request for the tutor and Quorum together (the account row asks for itself: that is the other one)
withKey("a start asks /api/health once for the tutor and Quorum together, not once for each", async ({ page }, testInfo) => {
  let health = 0;
  page.on("request", (r) => { if (new URL(r.url()).pathname === "/api/health") health += 1; });
  await open(page, testInfo);
  expect(health).toBe(2);
});

withKey("Check every answer with AI asks Quorum too, once, without a tap", async ({ page }, testInfo) => {
  const asked = await open(page, testInfo, undefined, null);
  await expect(quorum(page)).toContainText(/[=≠]/);
  expect(asked).toHaveLength(1);
  expect(asked[0].body).toMatchObject({ kind: "explain", quorum: true });
});

withKey("a follow-up question in the chat is not a Quorum question", async ({ page }, testInfo) => {
  const asked = await explained(page, testInfo);
  await page.getByRole("button", { name: /discuss with ai/i }).click();
  await page.fill("#ask-in", "Why not?");
  await page.keyboard.press("Enter");
  await expect.poll(() => asked.length).toBe(2);
  expect(asked[1].body.kind).toBe("chat");
  expect(asked[1].body).not.toHaveProperty("quorum");
});

withKey("while the models work the chip shows it, and the answer comes with the run", async ({ page }, testInfo) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  await open(page, testInfo, { tutor: async (_body, _n, things) => { await gate; return { status: 200, body: run(things, AGREE) }; } });
  await explain(page).click();
  await expect(quorum(page)).toContainText("…");
  await quorum(page).click();
  await expect(page.locator(".quorum")).toContainText("Models answered: 0 of 3");
  release();
  await expect(quorum(page)).toContainText("=");
  await expect(page.locator(".quorum")).toContainText("Done: 3 of 3 models answered; all agree, no judge needed.");
});

withKey("the panel shows what each model and the judge said of each example, and the answer you see is the judge's", async ({ page }, testInfo) => {
  await explained(page, testInfo, { tutor: (_b, _n, things) => ({ status: 200, body: run(things, DIFFER) }) });
  await expect(quorum(page)).toContainText("≠");
  await quorum(page).click();
  const panel = page.locator(".quorum");
  const n = (await thingsOf(page)).length;
  expect(n).toBeGreaterThan(0);
  await expect(panel).toContainText("Done: 3 of 3 models answered; the judge ruled (the models differed).");
  await expect(panel.locator(".quorum-nj")).toHaveText("The answer you see is the judge’s.");
  for (const name of ["Haiku", "Sonnet", "Opus", "Judge’s ruling", "Page"]) await expect(rowOf(page, name)).toHaveCount(n);
  // Haiku differs from the ruling, the others are with it
  await expect(rowOf(page, "Haiku").first()).toContainText("≠ ruling");
  await expect(rowOf(page, "Sonnet").first()).toContainText("= ruling");
  await expect(rowOf(page, "Haiku").first()).toContainText("1.4 s");
  await panel.locator("details.quorum-txt summary").click();
  await expect(panel.locator(".quorum-tn", { hasText: "Judge (shown)" })).toBeVisible();
  expect(await overflow(page)).toBeLessThanOrEqual(0);
});

withKey("a call that failed is named, and the answer is the strongest of the others", async ({ page }, testInfo) => {
  await explained(page, testInfo, { tutor: (_b, _n, things) => ({ status: 200, body: run(things, { Sonnet: learner, Opus: learner }) }) });
  await quorum(page).click();
  const panel = page.locator(".quorum");
  await expect(panel.locator(".status")).toContainText("Haiku: failed (unavailable).");
  await expect(panel).toContainText("Done: 2 of 3 models answered; all agree, no judge needed.");
  await expect(panel.locator(".quorum-nj")).toHaveText("The answer you see is Opus’s.");
  await expect(rowOf(page, "Haiku").first()).toContainText("no answer");
});

withKey("when the budget of Quorum is used the one model answers, and the chip says so", async ({ page }, testInfo) => {
  await open(page, testInfo, { tutor: () => ({ status: 200, body: sse({ type: "single", why: "budget" }, { type: "delta", text: "Stand-in tutor: one model." }, { type: "done", truncated: false }) }) });
  await explain(page).click();
  await expect(quorum(page)).toBeVisible();
  await quorum(page).click();
  await expect(page.locator(".quorum")).toContainText("Quorum’s budget for today is used, so one model answered this.");
  await expect(page.locator(".quorum .quorum-r")).toHaveCount(0);
});

withKey("an answer that came with no run says so", async ({ page }, testInfo) => {
  await open(page, testInfo, { tutor: () => ({ status: 200, body: PLAIN }) });
  await explain(page).click();
  await expect(quorum(page)).toBeVisible();
  await quorum(page).click();
  await expect(page.locator(".quorum")).toContainText("No Quorum record came with this answer.");
});

withKey("an answer the page checked in full is explained by the one model: no quorum in the question, and the chip says why", async ({ page }, testInfo) => {
  const asked = await open(page, testInfo, { tutor: () => ({ status: 200, body: PLAIN }) }, "0", answerBlank);
  expect(await page.evaluate(() => window.__t.ui.res.exOpen)).toBe(0);
  await explain(page).click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0].body.kind).toBe("explain");
  expect(asked[0].body).not.toHaveProperty("quorum");
  expect(asked[0].body).not.toHaveProperty("examples"); // nothing is left for the answer to check
  await expect(quorum(page)).toBeVisible();
  await quorum(page).click();
  await expect(page.locator(".quorum")).toContainText("Not needed here: every example has a verdict, so one model explains.");
  await expect(page.locator(".quorum .quorum-r")).toHaveCount(0);
});

withKey("Check every answer with AI asks one model, with no quorum, for an answer the page checked in full", async ({ page }, testInfo) => {
  const asked = await open(page, testInfo, { tutor: () => ({ status: 200, body: PLAIN }) }, null, answerBlank);
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0].body.kind).toBe("explain");
  expect(asked[0].body).not.toHaveProperty("quorum");
});

withKey("a server that does not offer Quorum is asked as ever: no quorum in the question, no chip, no switch", async ({ page }, testInfo) => {
  const asked = await open(page, testInfo, { health: { ok: true, tutor: "on" }, tutor: () => ({ status: 200, body: PLAIN }) });
  await explain(page).click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0].body.kind).toBe("explain");
  expect(asked[0].body).not.toHaveProperty("quorum");
  expect(asked[0].body.examples.length).toBeGreaterThan(0); // the examples are named whether or not the server has Quorum
  await expect(quorum(page)).toHaveCount(0);
  await page.getByRole("button", { name: "Practice options" }).click();
  await expect(sw(page)).toHaveCount(0);
});

withKey("the practice options have the switch, on; off, the next explanation is asked of one model and the chip is gone", async ({ page }, testInfo) => {
  const asked = await explained(page, testInfo);
  await page.getByRole("button", { name: "Practice options" }).click();
  await expect(page.getByText("The server keeps each run")).toBeVisible();
  await expect(sw(page)).toHaveAttribute("aria-checked", "true");
  await sw(page).click();
  await expect(sw(page)).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => localStorage.getItem("rd-quorum"))).toBe("0");
  await page.locator("#over .oc").click();
  await expect(quorum(page)).toHaveCount(0);
  await page.getByRole("button", { name: /next pair/i }).click();
  await ready(page);
  await answerOnPhone(page);
  await explain(page).click();
  await expect.poll(() => asked.length).toBe(2);
  expect(asked[1].body.kind).toBe("explain");
  expect(asked[1].body).not.toHaveProperty("quorum");
  await expect(quorum(page)).toHaveCount(0);
});

// a server may offer Quorum as an opt-in (QUORUM=optin, docs/SERVER.md): slower, so a device has it off until the device turns it on
withKey("on a server that offers Quorum as an opt-in it is off by default: one model answers, no chip; the switch says it is optional, and turning it on sends quorum: true", async ({ page }, testInfo) => {
  const asked = await open(page, testInfo, { health: { ok: true, tutor: "on", quorum: "optin" } });
  await explain(page).click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0].body.kind).toBe("explain");
  expect(asked[0].body).not.toHaveProperty("quorum");
  await expect(quorum(page)).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("rd-quorum"))).toBeNull();
  await page.getByRole("button", { name: "Practice options" }).click();
  await expect(page.getByText("Optional: a deeper check, but slower.")).toBeVisible();
  await expect(sw(page)).toHaveAttribute("aria-checked", "false");
  await sw(page).click();
  await expect(sw(page)).toHaveAttribute("aria-checked", "true");
  expect(await page.evaluate(() => localStorage.getItem("rd-quorum"))).toBe("1");
  await page.locator("#over .oc").click();
  await page.getByRole("button", { name: /next pair/i }).click();
  await ready(page);
  await answerOnPhone(page);
  await explain(page).click();
  await expect.poll(() => asked.length).toBe(2);
  expect(asked[1].body).toMatchObject({ kind: "explain", quorum: true });
  await expect(quorum(page)).toContainText(/[=≠]/);
});

withKey("an opt-in that this device turned on stays on at the next start, and a Preview's own default is not an opt-in", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the answer flow is exercised in the phone layout");
  await page.addInitScript(() => { if (localStorage.getItem("rd-quorum") === null) localStorage.setItem("rd-quorum", "1"); });
  const asked = await open(page, testInfo, { health: { ok: true, tutor: "on", quorum: "optin" } });
  await explain(page).click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0].body).toMatchObject({ kind: "explain", quorum: true });
  await page.getByRole("button", { name: "Practice options" }).click();
  await expect(page.getByText("For testing, on this test server only.")).toHaveCount(0);
  await expect(sw(page)).toHaveAttribute("aria-checked", "true");
});

// the setting was called "rd-lab" while Quorum was a lab of the page: a device that turned it off keeps it off, under the new name
withKey("a Quorum setting stored under its earlier name is kept, and moved to the new one", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the answer flow is exercised in the phone layout");
  await page.addInitScript(() => { if (localStorage.getItem("rd-quorum") === null && localStorage.getItem("rd-lab") === null) localStorage.setItem("rd-lab", "0"); });
  const asked = await open(page, testInfo);
  await explain(page).click();
  await expect.poll(() => asked.length).toBe(1);
  expect(asked[0].body).not.toHaveProperty("quorum");
  await expect(quorum(page)).toHaveCount(0);
  expect(await page.evaluate(() => [localStorage.getItem("rd-quorum"), localStorage.getItem("rd-lab")])).toEqual(["0", null]);
});

withKey("any value in the panel can be flagged, with a note, and the flag names the run", async ({ page }, testInfo) => {
  await explained(page, testInfo, { tutor: (_b, _n, things) => ({ status: 200, body: run(things, DIFFER) }) });
  await quorum(page).click();
  const haiku = rowOf(page, "Haiku").first();
  await haiku.locator(".lcell button").click();
  await expect(page.locator(".flagedit")).toContainText("Flag: Haiku: cell");
  await page.fill("#flag-note", "Haiku is wrong here");
  await page.getByRole("button", { name: "Submit" }).click();
  const byHand = async () => (await flags(page)).filter((f) => !f.auto);
  await expect.poll(async () => (await byHand()).length).toBe(1);
  const [flag] = await byHand();
  expect(flag).toMatchObject({ part: "cell", model: "haiku", runId: RECORD_ID, note: "Haiku is wrong here", state: "new" });
  const first = await page.evaluate(() => window.__t.quorumThings(window.__t.ui).map((t) => ({ text: t.text, cells: t.cells }))[0]);
  expect(flag.thing).toBe(first.text);
  expect(flag.shown).toBe(CELL[elsewhere(first)]); // the cell Haiku gave the first example
  await expect(haiku.locator(".lcell button")).toHaveAttribute("aria-pressed", "true");
});

// Where Quorum is divided about an example, the page flags it by itself (a flag with auto "quorum"): that is the copy of a disagreement that can leave the
// run it came from, and what the flag review reads.
withKey("where the models differ, the page flags each such example by itself and names the run; a flag that was reviewed is not touched by a later run", async ({ page }, testInfo) => {
  await explained(page, testInfo, { tutor: (_b, _n, things) => ({ status: 200, body: run(things, DIFFER) }) });
  const things = await thingsOf(page);
  expect(things.length).toBeGreaterThan(0);
  await expect.poll(async () => (await flags(page)).length).toBe(things.length);
  const made = await flags(page);
  expect(made.map((f) => f.thing).sort()).toEqual([...things].sort());
  for (const f of made) {
    expect(f).toMatchObject({ auto: "quorum", part: "quorum", state: "new", note: "", runId: RECORD_ID });
    expect(f.shown).toMatch(/^The models gave different cells\. Models: Haiku [^,]+, Sonnet [^,]+, Opus [^.]+\. Judge: [^.]+\./);
    expect(f.caseKey).toMatch(/^answers_/);
    expect(f.pair).toMatchObject({ tab: "practice" });
  }
  // Review lists them as automatic flags
  await goTo(page, "Review");
  const seg = page.locator(".rseg button", { hasText: /^Flags/ });
  if (await seg.count()) await seg.click(); // a phone shows one part of Review at a time
  // an entry opens to show the flag, the exercise and its buttons
  const entry = (thing) => page.locator(".flags > li").filter({ has: page.locator("summary", { hasText: "“" + thing + "”" }) });
  const press = async (thing, name) => {
    const open = await entry(thing).locator(":scope > details").evaluate((d) => d.open);
    if (!open) await entry(thing).locator(":scope > details > summary").click();
    await entry(thing).getByRole("button", { name, exact: true }).click();
  };
  await expect(page.locator(".flags > li")).toHaveCount(things.length);
  await expect(page.locator(".flags > li").first()).toContainText(/Quorum \(automatic\)/);
  // one reviewed by hand stays as it was when the same answer is flagged again; the others are written again only if their words changed
  const id = made[0].id;
  await press(made[0].thing, "Reviewed");
  await expect.poll(async () => (await flags(page)).find((f) => f.id === id)?.state).toBe("reviewed");
  const before = (await flags(page)).find((f) => f.id === id);
  const again = await page.evaluate(
    ([kase, found]) => { window.__t.autoFlags(kase, found); return Object.values(window.__t.flags).length; },
    [{ key: made[0].caseKey, a: made[0].pair.a, b: made[0].pair.b, relation: made[0].pair.relation, tab: "practice" }, made.map((f) => ({ thing: f.thing, shown: f.shown + " (again)", runId: "another" }))],
  );
  expect(again).toBe(things.length);
  const after = await flags(page);
  expect(after.find((f) => f.id === id)).toEqual(before);
  // the ones still new are rewritten with the new words and the new run
  for (const f of after.filter((f) => f.id !== id)) expect(f).toMatchObject({ runId: "another", state: "new" });
  // a later run that says the same words still becomes the run the flag names; the reviewed one is left alone
  const kase = { key: made[0].caseKey, a: made[0].pair.a, b: made[0].pair.b, relation: made[0].pair.relation, tab: "practice" };
  await page.evaluate(([k, found]) => { window.__t.autoFlags(k, found); }, [kase, made.map((f) => ({ thing: f.thing, shown: f.shown + " (again)", runId: "third" }))]);
  const third = await flags(page);
  expect(third.find((f) => f.id === id)).toEqual(before);
  for (const f of third.filter((f) => f.id !== id)) expect(f).toMatchObject({ runId: "third", shown: expect.stringContaining("(again)"), state: "new" });
  // Resolved and Delete work on the list
  await press(made[0].thing, "Resolved");
  await expect.poll(async () => (await flags(page)).find((f) => f.id === id)?.state).toBe("resolved");
  await press(made[0].thing, "Delete");
  await expect.poll(async () => (await flags(page)).length).toBe(things.length - 1);
});

withKey("where the models agree, and the page can stand beside them, there are no automatic flags", async ({ page }, testInfo) => {
  await explained(page, testInfo, { tutor: (_b, _n, things) => ({ status: 200, body: run(things, CONSISTENT) }) });
  await page.waitForTimeout(300);
  expect((await flags(page)).filter((f) => f.auto)).toEqual([]);
});

withKey("the panel fits a phone of any width, and its flags are big enough to touch", async ({ page }, testInfo) => {
  await explained(page, testInfo, { tutor: (_b, _n, things) => ({ status: 200, body: run(things, DIFFER) }) });
  await quorum(page).click();
  await page.locator("details.quorum-txt summary").click();
  for (const width of [320, 360, 390]) {
    await page.setViewportSize({ width, height: 800 });
    expect(await overflow(page), `${width} px`).toBeLessThanOrEqual(0);
    const small = await page.locator(".quorum .lp").evaluateAll((bs) => bs.filter((b) => b.getBoundingClientRect().height < 26).length);
    expect(small, `${width} px`).toBe(0);
    const out = await page.locator(".quorum").evaluate((p) => [...p.querySelectorAll("*")].filter((n) => n.getBoundingClientRect().right > innerWidth + 1).length);
    expect(out, `${width} px`).toBe(0);
  }
});

withKey("the panel is readable in the dark theme", async ({ page }, testInfo) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await explained(page, testInfo, { tutor: (_b, _n, things) => ({ status: 200, body: run(things, DIFFER) }) });
  await quorum(page).click();
  const colors = await page.locator(".quorum-r").first().evaluate((r) => {
    const rgb = (c) => c.match(/[\d.]+/g).slice(0, 3).map(Number);
    const lum = ([r, g, b]) => [r, g, b].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }).reduce((s, v, i) => s + v * [0.2126, 0.7152, 0.0722][i], 0);
    let bg = r; let back = "rgba(0, 0, 0, 0)";
    while (bg && /rgba\(.*, 0\)|transparent/.test(back)) { back = getComputedStyle(bg).backgroundColor; bg = bg.parentElement; }
    const fg = getComputedStyle(r.querySelector(".mn")).color;
    const [l1, l2] = [lum(rgb(fg)), lum(rgb(back))].sort((x, y) => y - x);
    return { fg, back, ratio: (l1 + 0.05) / (l2 + 0.05) };
  });
  expect(colors.ratio, JSON.stringify(colors)).toBeGreaterThan(4.5);
});

// A device that has no Magic Key can check an answer, but cannot ask the tutor, so it has no Quorum; the tap on Explain that opens the prompt goes on with a run once the key is taken.
plain("a device with no Magic Key has no Quorum until the key is entered", async ({ page }, testInfo) => {
  plain.skip(!isPhone(testInfo), "the answer flow is exercised in the phone layout");
  plain.skip(!withCourse, "needs the course data to unlock the definitions");
  await page.addInitScript(() => { window.__riglamTest = (t) => { window.__t = t; }; localStorage.setItem("rd-autoexplain", "0"); });
  await serveCourse(page);
  const asked = await server(page);
  await page.goto("/");
  await ready(page);
  await answerOnPhone(page);
  await page.waitForTimeout(300);
  await expect(quorum(page)).toHaveCount(0);
  expect(asked).toHaveLength(0);
  await page.getByRole("button", { name: /^explain$/i }).click({ force: true });
  await page.fill("#unlock-key", dataKey);
  await page.locator("#unlock").getByRole("button", { name: "Unlock", exact: true }).click();
  await expect(page.locator("#unlock")).toHaveCount(0);
  await expect.poll(() => asked.length).toBe(1); // the tap on Explain goes on once the key is taken
  expect(asked[0].body.quorum).toBe(true);
  await expect(quorum(page)).toContainText(/[=≠]/);
});

// The learner can go to another pair (here, another tab) while the models work. The answer being waited for is the old pair's: its flags are written for it.
withKey("flags raised after the learner went to another pair belong to the pair that was answered", async ({ page }, testInfo) => {
  let release, reach;
  const released = new Promise((resolve) => { release = resolve; });
  const reached = new Promise((resolve) => { reach = resolve; }); // the stand-in has the question (it read the page for the examples before it was called)
  let answered; // the examples of the answer being asked about, read before the learner leaves it
  const asked = await open(page, testInfo, { tutor: async () => { reach(); await released; return { status: 200, body: run(answered, DIFFER) }; } });
  const before = await page.evaluate(() => ({ a: window.__t.cur.p.a, b: window.__t.cur.p.b, relation: window.__t.cur.p.relation }));
  answered = await page.evaluate(() => window.__t.quorumThings(window.__t.ui).map((t) => ({ text: t.text, cells: t.cells, page: t.page })));
  const things = answered.map((t) => t.text);
  await explain(page).click();
  await reached;
  expect(asked).toHaveLength(1);
  await goTo(page, "Pervasions");
  await expect.poll(() => page.evaluate(() => window.__t.tab)).not.toBe("practice");
  await expect.poll(() => page.evaluate(([a, b]) => window.__t.cur.p.a !== a || window.__t.cur.p.b !== b, [before.a, before.b])).toBe(true); // the page now has another pair
  release();
  await expect.poll(async () => (await flags(page)).length).toBe(things.length);
  for (const f of await flags(page)) expect(f.pair).toMatchObject(before);
});

// An example longer than the page's usual excerpt is sent whole to the models, so the page finds it in their answers by its whole text.
withKey("an example of more than 120 characters is found in the models' answers, and its disagreement is flagged", async ({ page }, testInfo) => {
  test.skip(!isPhone(testInfo), "the answer flow is exercised in the phone layout");
  await page.addInitScript(() => { window.__riglamTest = (t) => { window.__t = t; }; localStorage.setItem("rd-autoexplain", "0"); });
  const LONG = "a very long example that goes on and on about nothing in particular, only to be longer than a hundred and twenty characters in all, and then some more";
  expect(LONG.length).toBeGreaterThan(120);
  await server(page, { tutor: (_body, _n, things) => ({ status: 200, body: run(things, DIFFER) }) });
  await page.goto("/");
  await ready(page);
  await relOptions(page).first().click();
  for (let i = 0; i < 4 && (await page.locator("#cin").isVisible()); i++) {
    await page.fill("#cin", i === 0 ? LONG : "thing " + (i + 1));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
  }
  expect((await thingsOf(page))[0]).toBe(LONG);
  await explain(page).click();
  await expect(quorum(page)).toContainText(/[=≠]/);
  await expect.poll(async () => (await flags(page)).some((f) => f.thing === LONG)).toBe(true);
});
