// Examples known without the AI: after a check, an example the page could not check is looked up in the course's reference examples this device
// holds, then in what the server learned from earlier checks (POST /api/known), before the tutor is asked about it. These specs stand in for the
// server with routes: what the page sends, how a cell it learns about reads, that the explanation is then asked only about the rest, and that a
// server that does not answer leaves everything as it was.
import { test, expect } from "../../support/test.js";
import { ready, relOptions, isPhone } from "../../support/page.js";
import { dataKey, withCourse } from "../../support/data-key.js";
import { checkProof } from "../../../src/ai/proof.ts";
import { REL } from "../../../src/ai-shared/relations.ts";

const withKey = withCourse ? test : test.skip;

const sse = (...events) => events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join("");
const PLAIN = sse({ type: "delta", text: "Stand-in tutor: this is the stand-in answer." }, { type: "done", truncated: false });
const FACTS = { both: ["yes", "yes"], anb: ["yes", "no"], bna: ["no", "yes"], nei: ["no", "no"] };
const CELL = { both: "Both", anb: "A not B", bna: "B not A", nei: "Neither" };
/** The line the server would keep for an example: the facts of the cell the learner put it in, so it fits there. */
const fits = (e) => ({ cell: e.cell, text: e.text, line: `${CELL[e.cell]}: "${e.text}" | class: Table | A ${FACTS[e.cell][0]}: of its use | B ${FACTS[e.cell][1]}: of its make`, by: "learned" });

/** The line the server would keep for an example it knows on one side only: the side A, which fails the cell the learner put it in, and nothing of B. */
const failed = (e) => ({ cell: e.cell, text: e.text, line: `${CELL[e.cell]}: "${e.text}" | class: Table | A ${e.cell === "both" || e.cell === "anb" ? "no" : "yes"}: of its use | B unsure: `, by: "learned", half: true });

/** Stands in for the server: `known(body)` answers POST /api/known as {status, body}; the tutor gives a plain answer. The requests are kept. */
async function server(page, { health = { ok: true, tutor: "on", known: "on" }, known = (body) => ({ status: 200, body: { known: body.examples.map(fits) } }), say = () => PLAIN } = {}) {
  const asked = { known: [], tutor: [] };
  await page.route("**/api/health", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(health) }));
  await page.route("**/api/known", async (route) => {
    const request = route.request();
    const body = request.postDataJSON();
    asked.known.push({ headers: request.headers(), body });
    const reply = await known(body);
    return route.fulfill({ status: reply.status, contentType: "application/json", body: JSON.stringify(reply.body) });
  });
  await page.route("**/api/tutor", (route) => {
    asked.tutor.push({ body: route.request().postDataJSON() });
    return route.fulfill({ status: 200, contentType: "text/event-stream", body: say() });
  });
  return asked;
}

/** Picks the pair's own relation (so that every example is one the page can check against a cell) and writes `text(i)` in each cell it asks for, on a phone. */
async function answer(page, text = (i) => "thing " + (i + 1)) {
  const name = REL[await page.evaluate(() => window.__t.cur.p.relation)].name;
  await relOptions(page).filter({ has: page.locator(".name", { hasText: new RegExp("^" + name + "$") }) }).click();
  for (let i = 0; i < 4 && (await page.locator("#cin").isVisible()); i++) {
    await page.fill("#cin", text(i));
    await page.keyboard.press("Enter");
    await page.waitForTimeout(100);
  }
}
const open = async (page, testInfo, setup, { autoExplain = "0", text, before } = {}) => {
  test.skip(!isPhone(testInfo), "the answer flow is exercised in the phone layout");
  await page.addInitScript((v) => { window.__riglamTest = (t) => { window.__t = t; }; localStorage.setItem("rd-autoexplain", v); }, autoExplain);
  if (before) await before(page);
  const asked = await server(page, setup);
  await page.goto("/");
  await ready(page);
  // a pair of two names for one category (mutually inclusive) has no two categories to look an example up in: the tutor's, as before
  test.skip(await page.evaluate(() => window.__t.cur.p.catA === window.__t.cur.p.catB), "the pair drawn has one category under two names");
  await answer(page, text);
  return asked;
};
const explain = (page) => page.getByRole("button", { name: /^explain$|check and explain/i });
const cellsOf = (page) => page.evaluate(() => Object.fromEntries(Object.entries(window.__t.ui.res.cells).map(([c, r]) => [c, { v: r.v, by: r.by || null, tag: r.msg && r.msg[2] || null, half: !!r.half }])));
const thingsOf = (page) => page.evaluate(() => window.__t.quorumThings(window.__t.ui).map((t) => ({ text: t.text, cells: t.cells })));

withKey("a check asks the server what it knows of the examples it could not check, with a proof of the key, and the cells it knows settle", async ({ page }, testInfo) => {
  const asked = await open(page, testInfo);
  await expect.poll(() => asked.known.length).toBe(1);
  const { headers, body } = asked.known[0];
  expect(await checkProof(dataKey, headers["x-riglam-device"], headers["x-riglam-proof"])).toBe(true);
  expect(JSON.stringify([headers, body])).not.toContain(dataKey);
  expect(body.cats).toHaveLength(2);
  expect(body.examples.length).toBeGreaterThan(0);
  const things = await thingsOf(page);
  for (const e of body.examples) expect(things.find((t) => t.text === e.text)?.cells).toContain(e.cell);
  await expect.poll(async () => Object.entries(await cellsOf(page)).filter(([c]) => body.examples.some((e) => e.cell === c)).every(([, r]) => r.v === "ok" && r.by === "claude" && r.tag === "from an earlier check")).toBe(true);
  await expect(page.locator(".fb i", { hasText: "from an earlier check" }).first()).toBeVisible();
  // the explanation is then about what the page now knows: no example is left for it to check
  await explain(page).click();
  await expect.poll(() => asked.tutor.length).toBe(1);
  expect(asked.tutor[0].body.kind).toBe("explain");
  expect(asked.tutor[0].body).not.toHaveProperty("examples");
});

withKey("with Check every answer with AI on, the explanation is asked after the server's answer, about the examples it did not know", async ({ page }, testInfo) => {
  let first;
  const asked = await open(page, testInfo, {
    // the server knows the first example only
    known: (body) => { first = body.examples[0]; return { status: 200, body: { known: [fits(first)] } }; },
  }, { autoExplain: "1" });
  await expect.poll(() => asked.tutor.length).toBe(1);
  expect(asked.known).toHaveLength(1);
  const rest = asked.known[0].body.examples.filter((e) => e.text !== first.text || e.cell !== first.cell);
  if (rest.length) expect(asked.tutor[0].body.examples).toEqual(rest);
  else expect(asked.tutor[0].body).not.toHaveProperty("examples");
});

// half knowledge: one failed side is enough to say an example does not fit, whatever the other side is; fitting needs both
withKey("an example the server knows on one side only, and that side fails its cell, fails at once; the explanation still names it for the other side", async ({ page }, testInfo) => {
  let first;
  const asked = await open(page, testInfo, {
    known: (body) => { first = body.examples[0]; return { status: 200, body: { known: [failed(first)] } }; },
  });
  await expect.poll(() => asked.known.length).toBe(1);
  await expect.poll(async () => (await cellsOf(page))[first.cell]?.v).toBe("bad");
  const cells = await cellsOf(page);
  expect(cells[first.cell]).toMatchObject({ v: "bad", by: "claude", tag: "from an earlier check", half: true });
  // nothing was said of the other examples, and nothing of this one is "verified": the page only knows it does not fit
  for (const [c, r] of Object.entries(cells)) if (c !== first.cell && asked.known[0].body.examples.some((e) => e.cell === c)) expect(r).toMatchObject({ v: "cmp", half: false });
  // it stays offline until the learner asks: then the explanation is asked about the half-known example along with the rest, so the tutor says its other side
  expect(asked.tutor).toHaveLength(0);
  await explain(page).click();
  await expect.poll(() => asked.tutor.length).toBe(1);
  expect(asked.tutor[0].body.examples).toEqual(asked.known[0].body.examples);
  expect((await cellsOf(page))[first.cell]).toMatchObject({ v: "bad", half: true });
});

// the flag on a cell's note names the example when a learned fact settled the cell, so that the server disputes the fact (worker/learned.ts, flagFacts)
withKey("a flag on the note of a cell that a learned fact settled names the example", async ({ page }, testInfo) => {
  const sent = [];
  let first;
  const asked = await open(page, testInfo, {
    health: { ok: true, tutor: "on", known: "on", reports: "on" },
    known: (body) => { first = body.examples[0]; return { status: 200, body: { known: [fits(first)] } }; },
    // the explanation has a line for the learned cell, so that the cell has a note ("?")
    say: () => sse({ type: "delta", text: fits(first).line }, { type: "done", truncated: false }),
  }, {
    before: (p) => p.route("**/api/flags", (route) => {
      const body = route.request().postDataJSON();
      sent.push(body);
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ stored: (body.send || []).map((r) => r.id), withdrawn: [] }) });
    }),
  });
  await expect.poll(async () => (await cellsOf(page))[first?.cell]?.v).toBe("ok");
  await explain(page).click();
  await expect.poll(() => asked.tutor.length).toBe(1);
  await page.locator(".qm").first().click();
  await page.locator(".pop .aiflag").click();
  await page.fill("#flag-note", "A table is not round.");
  await page.getByRole("button", { name: "Submit" }).click();
  await expect.poll(() => sent.flatMap((b) => b.send || []).length).toBe(1);
  const report = sent.flatMap((b) => b.send || [])[0];
  expect(report.flag).toMatchObject({ part: "explain", n: first.cell, thing: first.text });
});

// the server refuses a whole question for one example over 200 characters, so a long one never goes with the others
withKey("an example too long for the server is left out of the question, and the others are still asked", async ({ page }, testInfo) => {
  const long = "a very long description of a thing, " + "x".repeat(220);
  const asked = await open(page, testInfo, undefined, { text: (i) => (i === 0 ? long : "thing " + (i + 1)) });
  await expect.poll(() => asked.known.length).toBe(1);
  const { examples } = asked.known[0].body;
  expect(examples.length).toBeGreaterThan(0);
  expect(examples.every((e) => e.text.length <= 200 && e.text !== long)).toBe(true);
});

withKey("a server that knows nothing, refuses or does not say it answers leaves the examples to the tutor, as before", async ({ page }, testInfo) => {
  const asked = await open(page, testInfo, { known: () => ({ status: 503, body: { error: { code: "unavailable" } } }) });
  await expect.poll(() => asked.known.length).toBe(1);
  await explain(page).click();
  await expect.poll(() => asked.tutor.length).toBe(1);
  expect(asked.tutor[0].body.examples).toEqual(asked.known[0].body.examples);
  expect(Object.values(await cellsOf(page)).some((r) => r.tag === "from an earlier check")).toBe(false);
});

withKey("the page asks nothing of a server whose health does not offer it", async ({ page }, testInfo) => {
  const asked = await open(page, testInfo, { health: { ok: true, tutor: "on" } });
  await explain(page).click();
  await expect.poll(() => asked.tutor.length).toBe(1);
  expect(asked.known).toHaveLength(0);
  expect(asked.tutor[0].body.examples.length).toBeGreaterThan(0);
});

// the reference examples a device holds (GET /api/course/examples, kept in riglam.examples): a thing that does not exist is in neither category, whatever the pair
withKey("the course's reference examples on the device settle an example they name, before the server is asked", async ({ page }, testInfo) => {
  const NAME = "a glass flower of the sky";
  const asked = await open(page, testInfo, undefined, {
    text: () => NAME,
    before: (p) => p.addInitScript((name) => localStorage.setItem("riglam.examples", JSON.stringify({ version: "t1", examples: { format: "test", version: 1, sources: {}, items: [{ n: name, ne: true, lv: 1 }] } })), NAME),
  });
  const things = await thingsOf(page);
  expect(things.map((t) => t.text)).toEqual([NAME]);
  await expect.poll(async () => Object.values(await cellsOf(page)).filter((r) => r.by === "course").length).toBe(things[0].cells.length);
  const cells = await cellsOf(page);
  for (const c of things[0].cells) expect(cells[c]).toMatchObject({ v: c === "nei" ? "ok" : "bad", tag: "by the course examples" });
  // nothing was left to ask the server
  await page.waitForTimeout(300);
  expect(asked.known).toHaveLength(0);
});
