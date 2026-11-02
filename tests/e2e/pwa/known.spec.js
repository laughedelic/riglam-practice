// Examples known without the AI: after a check, an example the page could not check is looked up in the course's reference examples this device
// holds, then in what the server learned from earlier checks (POST /api/known), before the tutor is asked about it. These specs stand in for the
// server with routes: what the page sends, how a cell it learns about reads, that the explanation is then asked only about the rest, and that a
// server that does not answer leaves everything as it was.
import { test, expect } from "../../support/test.js";
import { answerFirst, explainChoice, openSettings, ready, roadmap } from "../../support/page.js";
import { dataKey, withCourse } from "../../support/data-key.js";
import { checkProof } from "../../../src/ai/proof.ts";

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

const open = async (page, setup, { autoExplain = "0", text, before } = {}) => {
  await page.addInitScript((v) => { window.__riglamTest = (t) => { window.__t = t; }; localStorage.setItem("rd-autoexplain", v); }, autoExplain);
  if (before) await before(page);
  const asked = await server(page, setup);
  await page.goto("/");
  await ready(page);
  // a pair of two names for one category (mutually inclusive) has no two categories to look an example up in: the tutor's, as before
  test.skip(await page.evaluate(() => window.__t.cur.p.catA === window.__t.cur.p.catB), "the pair drawn has one category under two names");
  // the pair's own relation, so that every example is one the page can check against a cell
  await answerFirst(page, { own: true, text });
  return asked;
};
const explain = (page) => explainChoice(page);
const cellsOf = (page) => page.evaluate(() => Object.fromEntries(Object.entries(window.__t.ui.res.cells).map(([c, r]) => [c, { v: r.v, by: r.by || null, tag: r.msg && r.msg[2] || null, half: !!r.half }])));
const thingsOf = (page) => page.evaluate(() => window.__t.quorumThings(window.__t.ui).map((t) => ({ text: t.text, cells: t.cells })));

withKey("a check asks the server what it knows of the examples it could not check, with a proof of the key, and the cells it knows settle", async ({ page }) => {
  const asked = await open(page);
  await expect.poll(() => asked.known.length).toBe(1);
  const { headers, body } = asked.known[0];
  expect(await checkProof(dataKey, headers["x-riglam-device"], headers["x-riglam-proof"])).toBe(true);
  expect(JSON.stringify([headers, body])).not.toContain(dataKey);
  expect(body.cats).toHaveLength(2);
  expect(body.examples.length).toBeGreaterThan(0);
  const things = await thingsOf(page);
  for (const e of body.examples) expect(things.find((t) => t.text === e.text)?.cells).toContain(e.cell);
  await expect.poll(async () => Object.entries(await cellsOf(page)).filter(([c]) => body.examples.some((e) => e.cell === c)).every(([, r]) => r.v === "ok" && r.by === "claude" && r.tag === "from an earlier check")).toBe(true);
  await expect(page.locator("#path .exr .xnote i", { hasText: "from an earlier check" }).first()).toBeVisible();
  // the explanation is then about what the page now knows: no example is left for it to check
  await explain(page).click();
  await expect.poll(() => asked.tutor.length).toBe(1);
  expect(asked.tutor[0].body.kind).toBe("explain");
  expect(asked.tutor[0].body).not.toHaveProperty("examples");
});

withKey("with Every answer set, the explanation is asked after the server's answer, about the examples it did not know", async ({ page }) => {
  let first;
  const asked = await open(page, {
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
withKey("an example the server knows on one side only, and that side fails its cell, fails at once; the explanation still names it for the other side", async ({ page }) => {
  let first;
  const asked = await open(page, {
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
withKey("a flag on the note of a cell that a learned fact settled names the example", async ({ page }) => {
  const sent = [];
  let first;
  const asked = await open(page, {
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
  await page.locator("#path .exr .tnote .pflg").click();
  await page.fill("#flag-note", "A table is not round.");
  await page.locator("#flag-note").blur();   // on a phone the layout of the keyboard changes when the field lets go: a tap on Submit would land on what moved
  await page.locator("#path .pflag").getByRole("button", { name: "Submit" }).click();
  await expect.poll(() => sent.flatMap((b) => b.send || []).length).toBe(1);
  const report = sent.flatMap((b) => b.send || [])[0];
  expect(report.flag).toMatchObject({ part: "explain", n: first.cell, thing: first.text });
});

// the server refuses a whole question for one example over 200 characters, so a long one never goes with the others
withKey("an example too long for the server is left out of the question, and the others are still asked", async ({ page }) => {
  const long = "a very long description of a thing, " + "x".repeat(220);
  const asked = await open(page, undefined, { text: (i) => (i === 0 ? long : "thing " + (i + 1)) });
  await expect.poll(() => asked.known.length).toBe(1);
  const { examples } = asked.known[0].body;
  expect(examples.length).toBeGreaterThan(0);
  expect(examples.every((e) => e.text.length <= 200 && e.text !== long)).toBe(true);
});

withKey("Explain tapped while the lookup is pending asks nothing once the learner has gone on to the next pair", async ({ page }) => {
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const asked = await open(page, { known: async () => { await gate; return { status: 200, body: { known: [] } }; } });
  await expect.poll(() => asked.known.length).toBe(1);
  await explain(page).click();
  await page.waitForTimeout(600);   // the choice takes its place on the line first (wait.tsx): then the question waits for the lookup
  await page.locator("#stn").click();
  await page.waitForTimeout(4500); // past the lookup's own wait (4 s), after which the question would have gone out
  release();
  expect(asked.tutor).toHaveLength(0);
});

withKey("a server that knows nothing, refuses or does not say it answers leaves the examples to the tutor, as before", async ({ page }) => {
  const asked = await open(page, { known: () => ({ status: 503, body: { error: { code: "unavailable" } } }) });
  await expect.poll(() => asked.known.length).toBe(1);
  await explain(page).click();
  await expect.poll(() => asked.tutor.length).toBe(1);
  expect(asked.tutor[0].body.examples).toEqual(asked.known[0].body.examples);
  expect(Object.values(await cellsOf(page)).some((r) => r.tag === "from an earlier check")).toBe(false);
});

withKey("the page asks nothing of a server whose health does not offer it", async ({ page }) => {
  const asked = await open(page, { health: { ok: true, tutor: "on" } });
  await explain(page).click();
  await expect.poll(() => asked.tutor.length).toBe(1);
  expect(asked.known).toHaveLength(0);
  expect(asked.tutor[0].body.examples.length).toBeGreaterThan(0);
  expect(asked.tutor[0].body).not.toHaveProperty("share"); // a server that said nothing of keeping examples is not told the learner shares them
});

// the reference examples a device holds (GET /api/course/examples, kept in riglam.examples): a thing that does not exist is in neither category, whatever the pair
withKey("the course's reference examples on the device settle an example they name, before the server is asked", async ({ page }) => {
  const NAME = "a glass flower of the sky";
  const asked = await open(page, undefined, {
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

// the server keeps the examples the tutor checked (health says `learns`): the first explain question that names a learner's examples waits for a dialog that has to be
// answered, Ok or Don't share, and then goes out with the answer (so that first check is kept too, where the answer is yes). Settings keeps the switch: it is set once and
// forgotten, so it is not among the practice options of an exercise.
const share = (page) => page.getByRole("switch", { name: "Sharing examples" });
const sharePage = (page) => page.getByRole("button", { name: /^Sharing examples: (on|off): more$/ });
const claudePage = (page) => page.getByRole("button", { name: "Explanations by Claude: more" }).click({ position: { x: 12, y: 12 } });   // the line, beside its choice
const openPractice = (page) => page.getByRole("button", { name: "Practice options" }).click();
const closeOptions = async (page) => { await page.getByRole("button", { name: "Close the practice options" }).click(); await expect(page.getByRole("dialog", { name: "Practice options" })).toBeHidden(); };
/** The Settings page of the sharing switch. */
const openShare = async (page) => { await openSettings(page); await sharePage(page).click(); };
/** From a page of Settings back to the exercise it was opened over (Settings was opened from the roadmap). */
const backToExercise = async (page) => {
  await page.getByRole("button", { name: "Back to Settings", exact: true }).click();
  await page.getByRole("button", { name: "Back to the roadmap", exact: true }).click();
  await page.keyboard.press("Escape");
  await expect(roadmap(page)).toBeHidden();
};
const dialog = (page) => page.getByRole("dialog", { name: "Share your examples?" });
const saved = (page) => page.evaluate(() => [localStorage.getItem("rd-share"), localStorage.getItem("rd-share-told")]);
const LEARNS = { health: { ok: true, tutor: "on", learns: "on" }, known: () => ({ status: 200, body: { known: [] } }) };
/** A device that was told before: no dialog, and the marker is sent. */
const told = { before: (page) => page.addInitScript(() => { if (!localStorage.getItem("rd-share-told")) localStorage.setItem("rd-share-told", "1"); }) };

withKey("Settings offer the switch only where the server says it keeps examples", async ({ page }) => {
  await open(page, { health: { ok: true, tutor: "on" } });
  await openSettings(page);
  await expect(page.getByRole("button", { name: "Your data: more" })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Sharing examples/ })).toHaveCount(0);
});

withKey("the switch is in Settings, not among the practice options of an exercise", async ({ page }) => {
  await open(page, LEARNS);
  await openPractice(page);
  await expect(page.getByRole("group", { name: "Explanations by Claude" })).toBeVisible();
  await expect(share(page)).toHaveCount(0);
  await claudePage(page);
  await expect(page.getByRole("dialog", { name: "Practice options" }).getByText("Claude is an AI assistant")).toBeVisible();
  await expect(share(page)).toHaveCount(0);
  await closeOptions(page);
  await openShare(page);
  await expect(share(page)).toBeVisible();
});

withKey("the first explain question that names examples waits for a dialog with no way out but its two answers; Ok sends the question with the marker, once", async ({ page }) => {
  const asked = await open(page, LEARNS);
  await expect(dialog(page)).toHaveCount(0);
  const pair = () => page.evaluate(() => window.__t.cur.p.a + "|" + window.__t.cur.p.b);
  const was = await pair();
  await explain(page).click();
  await expect(dialog(page)).toBeVisible();
  await expect(dialog(page)).toContainText("we all build knowledge together");
  await expect(dialog(page)).toContainText("nothing about who you are is kept");
  await expect(dialog(page)).toContainText("leave names out");
  await expect(dialog(page)).toContainText("in Settings");
  await expect(dialog(page)).not.toContainText("answers sooner"); // this server does not answer from what it keeps
  const box = await dialog(page).boundingBox();
  const { width, height } = page.viewportSize();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width);
  expect(box.y + box.height).toBeLessThanOrEqual(height);
  // nothing is asked, and nothing behind it answers a key, until the learner has answered
  for (const key of ["Escape", "Escape", "n", "Enter"]) await page.keyboard.press(key);
  await page.waitForTimeout(300);
  await expect(dialog(page)).toBeVisible();
  expect(asked.tutor).toHaveLength(0);
  expect(await pair()).toBe(was);
  // a browser that closes it anyway (a second Escape in some) gets it opened again, with the focus on the dialog and not on the button an Enter would press
  await page.evaluate(() => document.querySelector(".sharedlg").close());
  await expect(dialog(page)).toBeVisible();
  expect(await page.evaluate(() => document.activeElement.className)).toBe("sharedlg");
  await dialog(page).getByRole("button", { name: "Ok", exact: true }).click();
  await expect(dialog(page)).toHaveCount(0);
  await expect.poll(() => asked.tutor.length).toBe(1);
  expect(asked.tutor[0].body.share).toBe(true); // the first check is kept too
  expect(asked.tutor[0].body.examples.length).toBeGreaterThan(0);
  expect(await saved(page)).toEqual(["1", "1"]);
  await page.reload();
  await ready(page);
  await answerFirst(page, { own: true });
  await explain(page).click();
  await expect.poll(() => asked.tutor.length).toBe(2);
  expect(asked.tutor[1].body.share).toBe(true);
  await expect(dialog(page)).toHaveCount(0); // once only
});

withKey("Don't share in the dialog sends the question without the examples, and the answer stays after a reload", async ({ page }) => {
  const asked = await open(page, LEARNS);
  await explain(page).click();
  await expect(dialog(page)).toBeVisible();
  await dialog(page).getByRole("button", { name: /don.t share/i }).click();
  await expect.poll(() => asked.tutor.length).toBe(1);
  expect(asked.tutor[0].body.kind).toBe("explain");
  expect(asked.tutor[0].body).not.toHaveProperty("examples");
  expect(asked.tutor[0].body).not.toHaveProperty("share");
  expect(await saved(page)).toEqual(["0", "1"]);
  await page.reload();
  await ready(page);
  await openShare(page);
  await expect(share(page)).toHaveAttribute("aria-checked", "false");
  await backToExercise(page);
  await answerFirst(page, { own: true });
  await explain(page).click();
  await expect.poll(() => asked.tutor.length).toBe(2);
  expect(asked.tutor[1].body).not.toHaveProperty("examples");
  await expect(dialog(page)).toHaveCount(0);
});

withKey("the switch in Settings tells the device's answer too, so no dialog follows", async ({ page }) => {
  const asked = await open(page, LEARNS);
  await openShare(page);
  await expect(page.getByText("keeps the words of the example")).toBeVisible();
  await expect(page.getByText("not who wrote it, which pair it was for, or where you put it")).toBeVisible();
  // the server does not answer from what it learned here (no `known`), so the note does not promise it
  await expect(page.getByText("you still get answers learned from other people")).toHaveCount(0);
  await expect(page.getByText("checked later without Claude")).toHaveCount(0); // nor that the same example is answered without the AI
  await expect(share(page)).toHaveAttribute("aria-checked", "true");
  await share(page).click();
  await expect(share(page)).toHaveAttribute("aria-checked", "false");
  await share(page).click();
  await expect(share(page)).toHaveAttribute("aria-checked", "true");
  expect(await saved(page)).toEqual(["1", "1"]);
  await backToExercise(page);
  await expect(page.locator(".pvline")).toBeVisible();
  await explain(page).click();
  await expect.poll(() => asked.tutor.length).toBe(1);
  expect(asked.tutor[0].body.share).toBe(true);
  await expect(dialog(page)).toHaveCount(0);
});

withKey("where the server also answers from what it keeps, the dialog says other learners get answers sooner", async ({ page }) => {
  await open(page, { ...LEARNS, health: { ok: true, tutor: "on", known: "on", learns: "on" } });
  await explain(page).click();
  await expect(dialog(page)).toContainText("other learners get answers sooner");
});

withKey("with Every answer set, the dialog comes by itself after the check, and the explanation waits for it", async ({ page }) => {
  const asked = await open(page, LEARNS, { autoExplain: "1" });
  await expect(dialog(page)).toBeVisible();
  expect(asked.tutor).toHaveLength(0);
  await dialog(page).getByRole("button", { name: /don.t share/i }).click();
  await expect.poll(() => asked.tutor.length).toBe(1);
  expect(asked.tutor[0].body).not.toHaveProperty("examples");
});

withKey("a device that was told sends the marker with its first question", async ({ page }) => {
  const asked = await open(page, LEARNS, told);
  await explain(page).click();
  await expect.poll(() => asked.tutor.length).toBe(1);
  expect(asked.tutor[0].body.share).toBe(true);
  expect(asked.tutor[0].body.examples.length).toBeGreaterThan(0);
  await expect(dialog(page)).toHaveCount(0);
});

withKey("a switch turned off in another tab is honored by this one before it names examples", async ({ page }) => {
  const asked = await open(page, LEARNS, told);
  // the other tab's write
  await page.evaluate(() => localStorage.setItem("rd-share", "0"));
  await explain(page).click();
  await expect.poll(() => asked.tutor.length).toBe(1);
  expect(asked.tutor[0].body.kind).toBe("explain");
  expect(asked.tutor[0].body).not.toHaveProperty("examples");
  expect(asked.tutor[0].body).not.toHaveProperty("share");
  await expect(dialog(page)).toHaveCount(0);
  await openShare(page);
  await expect(share(page)).toHaveAttribute("aria-checked", "false");
});

withKey("a server that keeps no examples asks nothing", async ({ page }) => {
  const asked = await open(page, { health: { ok: true, tutor: "on" } });
  await explain(page).click();
  await expect.poll(() => asked.tutor.length).toBe(1);
  await expect(dialog(page)).toHaveCount(0);
  expect(asked.tutor[0].body).not.toHaveProperty("share"); // a server that said nothing of keeping examples is not told the learner shares them
});

withKey("Settings and the practice options say that the sharing switch and Quorum are separate, each for what it keeps", async ({ page }) => {
  await open(page, { health: { ok: true, tutor: "on", learns: "on", quorum: "optin" } });
  await openShare(page);
  await expect(page.getByText("Quorum, in the practice options, is separate")).toBeVisible();
  await backToExercise(page);
  await openPractice(page);
  await claudePage(page);
  await expect(page.getByText("in Settings says, with or without Quorum")).toBeVisible();
  await expect(page.getByText("nothing is kept")).toHaveCount(0);
});

withKey("where the server also answers from what it learned, the switch's note says so", async ({ page }) => {
  await open(page, { health: { ok: true, tutor: "on", known: "on", learns: "on" } });
  await openShare(page);
  await expect(page.getByText("you still get answers learned from other people")).toBeVisible();
  await expect(page.getByText("checked later without Claude")).toBeVisible();
});

withKey("on a wide window the dialog is in the middle of it and answers the same", async ({ page }) => {
  const asked = await open(page, LEARNS);
  await page.setViewportSize({ width: 1280, height: 800 });
  await explain(page).click();
  await expect(dialog(page)).toBeVisible();
  const box = await dialog(page).boundingBox();
  expect(Math.abs(box.x + box.width / 2 - 640)).toBeLessThan(2);
  expect(Math.abs(box.y + box.height / 2 - 400)).toBeLessThan(2);
  await dialog(page).getByRole("button", { name: "Ok", exact: true }).click();
  await expect.poll(() => asked.tutor.length).toBe(1);
  expect(asked.tutor[0].body.share).toBe(true);
});
