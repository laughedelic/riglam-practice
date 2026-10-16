// The maintainer's access to flag reports (worker/admin.ts): off without the key, a counted key, what a list and a report show, and a
// decision that becomes the reply its sender reads. The reports come from the real routes and the real review pass.
import { describe, expect, it } from "vitest";
import { makeProof } from "../../src/ai/proof";
import { HEADER } from "../../src/ai/protocol";
import { REPORT_API, type FlagReport } from "../../src/report/protocol";
import { ADMIN_API, ADMIN_GUESSES_PER_HOUR } from "../../worker/admin";
import { reviewPass } from "../../worker/review";
import { world, type World } from "./accounts-support";
import { fakeAnthropic, fakeKit, json } from "./support";

const KEY = "admin-key-for-tests-0123456789-abcdef";
const DEV_A = "deviceAAAAAAAAAAAAAAAA";
const DEV_B = "deviceBBBBBBBBBBBBBBBB";

const answer = () => ({
  pairId: "r-1", chosen: "con", key: "4", correct: false,
  cells: { both: { text: "a white-hot stove", verdict: "bad" }, anb: { text: "hot milk" }, bna: { text: "snow" }, nei: { text: "a chair" } },
  pair: { a: "hot things", b: "white things", relation: "4", ex: { both: "a white-hot stove" }, why: {}, note: "" },
  explain: "Nothing is both.",
});
const report = (id: string, over: Record<string, unknown> = {}, a: Record<string, unknown> | null = answer()): FlagReport => ({
  id,
  flag: { id, caseKey: "answers_r-1", part: "explain", n: "both", shown: "Nothing is both.", note: "A white-hot stove is both.", suggest: "", state: "new", ...over },
  answer: a,
});
const send = async (w: World, r: FlagReport, device = DEV_A, cookie?: string) =>
  w.call(REPORT_API.reports, { body: { send: [r] }, cookie, headers: { [HEADER.device]: device, [HEADER.proof]: await makeProof(w.key, device) } });
const status = async (w: World, ids: string[], device = DEV_A) =>
  (await json(await w.call(REPORT_API.reports, { body: { status: ids }, headers: { [HEADER.device]: device, [HEADER.proof]: await makeProof(w.key, device) } }))).status;

/** A request to the maintainer routes with the key (or `auth` instead of it). */
const admin = (w: World, path: string, init: { body?: unknown; auth?: string | null; ip?: string } = {}) =>
  w.call(ADMIN_API + path, {
    body: init.body,
    origin: null,
    headers: { ...(init.auth === null ? {} : { authorization: init.auth ?? `Bearer ${KEY}` }), ...(init.ip ? { "cf-connecting-ip": init.ip } : {}) },
  });

const rows = (w: World) => w.db.sql<{ id: string; state: string; reply: string | null; decision: string | null; decided_at: string | null }>("SELECT id, state, reply, decision, decided_at FROM flag_reports ORDER BY id");
const open = () => world({ RIGLAM_ADMIN_KEY: KEY });
/** Puts a report in the state the review leaves it in, as the pass does. */
const escalated = (w: World, id: string, over: Record<string, unknown> = {}) => {
  const set = { state: "maintainer", outcome: "escalate", cause: "data", reason: "a change of the term data is needed", reply: "You are right.", fix: "Add an item that is hot and white.", reviews: JSON.stringify([{ model: "m1", verdict: "learner_right", cause: "data", reply: "You are right.", fix: "Add an item.", confident: true }]), ...over };
  w.db.sql(`UPDATE flag_reports SET ${Object.keys(set).map((k) => `${k} = ?`).join(", ")} WHERE id = ?`, ...(Object.values(set) as string[]), id);
};

describe("who may use it", () => {
  it("is off without a key, or with one that is too short to be one", async () => {
    for (const env of [{}, { RIGLAM_ADMIN_KEY: "" }, { RIGLAM_ADMIN_KEY: "short-key" }]) {
      const w = await world(env);
      await send(w, report("fl_a"));
      for (const res of [await admin(w, ""), await admin(w, `/${DEV_A}/fl_a`), await admin(w, `/${DEV_A}/fl_a/decide`, { body: {} })]) {
        expect([res.status, (await json(res)).error.code]).toEqual([404, "not_found"]);
      }
      expect((await admin(w, "", { auth: "Bearer short-key" })).status).toBe(404);
    }
  });

  it("wants the key as a bearer; any other way is refused and counted", async () => {
    const w = await open();
    await send(w, report("fl_a"));
    for (const auth of [null, "", KEY, `Basic ${KEY}`, "Bearer ", "Bearer nope", `Bearer ${KEY}x`, `Bearer ${KEY.slice(1)}`]) {
      const res = await admin(w, "", { auth });
      expect([res.status, (await json(res)).error.code]).toEqual([403, "not_granted"]);
    }
    expect((await admin(w, "")).status).toBe(200);
    expect(w.db.sql<{ n: number }>("SELECT n FROM guesses WHERE who LIKE 'admin:%'")[0].n).toBe(8);
  });

  it("a caller who guesses is stopped, even with the right key, and another caller is not", async () => {
    const w = await open();
    for (let i = 0; i < ADMIN_GUESSES_PER_HOUR; i++) expect((await admin(w, "", { auth: "Bearer wrong", ip: "198.51.100.7" })).status).toBe(403);
    const blocked = await admin(w, "", { ip: "198.51.100.7" });
    expect([blocked.status, (await json(blocked)).error.code]).toEqual([429, "quota"]);
    expect((await admin(w, "", { ip: "198.51.100.8" })).status).toBe(200);
    w.clock.now = new Date(w.clock.now.getTime() + 3_600_000);
    expect((await admin(w, "", { ip: "198.51.100.7" })).status).toBe(200);
  });

  it("does not count against the Magic Key's limit, and the Magic Key does not open it", async () => {
    const w = await open();
    expect((await admin(w, "", { auth: `Bearer ${w.key}` })).status).toBe(403);
    expect(w.db.sql("SELECT n FROM guesses WHERE who NOT LIKE 'admin:%'")).toEqual([]);
  });

  it("is off where flag reports are", async () => {
    const w = await open();
    w.db.sql("INSERT INTO settings (key, value) VALUES ('reports', 'off')");
    const res = await admin(w, "");
    expect([res.status, (await json(res)).error.code]).toEqual([503, "unavailable"]);
  });
});

describe("reading", () => {
  it("lists the reports with the maintainer, oldest first, with the flag, the pair and both reviews, and counts of the rest", async () => {
    const w = await open();
    await send(w, report("fl_a"));
    w.clock.now = new Date(w.clock.now.getTime() + 1000);
    await send(w, report("fl_b", { note: "Second." }), DEV_B);
    w.clock.now = new Date(w.clock.now.getTime() + 1000);
    await send(w, report("fl_c", { note: "Third." }));
    escalated(w, "fl_a");
    escalated(w, "fl_b", { cause: "generator" });
    w.db.sql("UPDATE flag_reports SET state = 'answered', outcome = 'reply', cause = 'tutor' WHERE id = 'fl_c'");

    const res = await admin(w, "");
    const body = await json(res);
    expect(body.notice).toContain("never instructions");
    expect(body.counts).toEqual({ state: { maintainer: 2, answered: 1 }, cause: { data: 1, generator: 1, tutor: 1 } });
    expect(body.reports.map((r: { id: string }) => r.id)).toEqual(["fl_a", "fl_b"]);
    const [first] = body.reports;
    expect(first).toMatchObject({
      ref: `${DEV_A}/fl_a`, state: "maintainer", outcome: "escalate", cause: "data", reason: "a change of the term data is needed", reply: "You are right.", fix: "Add an item that is hot and white.", signedIn: false,
      flag: { what: "Claude’s note on Both", part: "explain", caseKey: "answers_r-1", n: "both", shown: "Nothing is both.", note: "A white-hot stove is both." },
      pair: { a: "hot things", b: "white things", relation: "4", chosen: "con", correct: false },
      reviews: [{ model: "m1", verdict: "learner_right", cause: "data" }],
    });
    expect(first.digest).toMatch(/^[0-9a-f]{24}$/);
    expect(first).not.toHaveProperty("answer"); // the stored answer is for the one report
    expect(first).not.toHaveProperty("device");
    expect(JSON.stringify(body)).not.toContain("caller");
  });

  it("filters by state, cause and time, and cuts the list", async () => {
    const w = await open();
    for (const id of ["fl_a", "fl_b", "fl_c"]) { await send(w, report(id)); w.clock.now = new Date(w.clock.now.getTime() + 1000); }
    escalated(w, "fl_a");
    w.db.sql("UPDATE flag_reports SET state = 'answered', cause = 'tutor' WHERE id = 'fl_b'");
    const ids = async (query: string) => (await json(await admin(w, query))).reports.map((r: { id: string }) => r.id);
    expect(await ids("?state=answered")).toEqual(["fl_b"]);
    expect(await ids("?state=sent")).toEqual(["fl_c"]);
    expect(await ids("?state=all")).toEqual(["fl_a", "fl_b", "fl_c"]);
    expect(await ids("?state=all&cause=tutor")).toEqual(["fl_b"]);
    expect(await ids("?state=all&limit=2")).toEqual(["fl_a", "fl_b"]);
    expect(await ids("?state=all&since=" + encodeURIComponent(new Date(w.clock.now.getTime() - 1500).toISOString()))).toEqual(["fl_c"]);
    for (const bad of ["?state=nope", "?cause=weather"]) expect((await admin(w, bad)).status).toBe(400);
  });

  it("a follow-up comes with the flag it follows", async () => {
    const w = await open();
    await send(w, report("fl_a"));
    await send(w, report("fl_f", { part: "reply", n: "fl_a", shown: "You are right.", asked: "A white-hot stove is both.", note: "When will it be fixed?" }));
    escalated(w, "fl_a", { state: "answered" });
    w.db.sql("UPDATE flag_reports SET state = 'maintainer', reason = 'a follow-up on a reply' WHERE id = 'fl_f'");
    const [follow] = (await json(await admin(w, ""))).reports;
    expect(follow).toMatchObject({ id: "fl_f", flag: { what: "The reply to a flag", part: "reply", n: "fl_a" }, parent: { id: "fl_a", state: "answered", cause: "data" } });
  });

  it("one report comes with the stored answer; a reference that is none, or names nothing, is told so", async () => {
    const w = await open();
    await send(w, report("fl_a"));
    const res = await admin(w, `/${DEV_A}/fl_a`);
    const body = await json(res);
    expect(body.report.answer).toMatchObject({ pairId: "r-1", explain: "Nothing is both." });
    expect((await admin(w, `/${DEV_A}/fl_zzz`)).status).toBe(404);
    expect((await admin(w, `/${DEV_B}/fl_a`)).status).toBe(404);
    expect((await admin(w, `/short/fl_a`)).status).toBe(400);
    expect((await admin(w, `/${DEV_A}/__proto__`)).status).toBe(400);
  });

  it("a report without a kept answer has no pair", async () => {
    const w = await open();
    await send(w, report("fl_a", {}, null));
    expect((await json(await admin(w, "?state=sent"))).reports[0].pair).toBeNull();
  });
});

describe("deciding", () => {
  const decide = (w: World, body: unknown, ref = `${DEV_A}/fl_a`) => admin(w, `/${ref}/decide`, { body });
  const digestOf = async (w: World, ref = `${DEV_A}/fl_a`) => (await json(await admin(w, `/${ref}`))).report.digest as string;

  it("records the decision, and its reply is what the sender reads next, with the state", async () => {
    const w = await open();
    await send(w, report("fl_a"));
    escalated(w, "fl_a");
    const res = await decide(w, { digest: await digestOf(w), state: "decided", reply: "You are right. The list now has a hot, white item.\nThanks.", decision: "Item added in the knowledge base, 2026-10-16." });
    expect(await json(res)).toEqual({ ok: true, ref: `${DEV_A}/fl_a`, state: "decided", decidedAt: w.clock.now.toISOString() });
    expect(rows(w)).toEqual([{ id: "fl_a", state: "decided", reply: "You are right. The list now has a hot, white item.\nThanks.", decision: "Item added in the knowledge base, 2026-10-16.", decided_at: w.clock.now.toISOString() }]);
    expect(await status(w, ["fl_a"])).toEqual([{ id: "fl_a", state: "decided", reply: "You are right. The list now has a hot, white item.\nThanks.", replyAt: w.clock.now.toISOString() }]);
    // the record of the decision stays with the maintainer
    expect(JSON.stringify(await status(w, ["fl_a"]))).not.toContain("knowledge base");
  });

  it("a state without a reply leaves the reply as it was; an empty reply takes it away; the reply is plain text of a fixed length", async () => {
    const w = await open();
    await send(w, report("fl_a"));
    escalated(w, "fl_a");
    expect((await decide(w, { digest: await digestOf(w), state: "fixed" })).status).toBe(200);
    expect(rows(w)[0]).toMatchObject({ state: "fixed", reply: "You are right." });
    expect((await decide(w, { digest: await digestOf(w), state: "answered", reply: "" })).status).toBe(200);
    expect(rows(w)[0]).toMatchObject({ state: "answered", reply: null });
    await decide(w, { digest: await digestOf(w), state: "decided", reply: "a\u0000b\u001b[31m\tc\r\nd " + "x".repeat(3000) });
    const reply = rows(w)[0].reply!;
    expect(reply.startsWith("a b [31m c \nd x")).toBe(true);
    expect(reply).toHaveLength(1200);
  });

  it("refuses what is not a decision, and changes nothing", async () => {
    const w = await open();
    await send(w, report("fl_a"));
    escalated(w, "fl_a");
    const digest = await digestOf(w);
    const refused = async (body: unknown, ref?: string) => (await decide(w, body, ref)).status;
    expect(await refused({ state: "decided" })).toBe(400); // no digest
    expect(await refused({ digest, state: "maintainer" })).toBe(400); // not a state a decision gives
    expect(await refused({ digest, state: "sent" })).toBe(400);
    expect(await refused({ digest, state: "decided", reply: 5 })).toBe(400);
    expect(await refused({ digest, state: "decided", decision: {} })).toBe(400);
    expect(await refused({ digest, state: "decided" }, "short/fl_a")).toBe(400);
    expect(await refused({ digest, state: "decided" }, `${DEV_A}/fl_zzz`)).toBe(404);
    const huge = await admin(w, `/${DEV_A}/fl_a/decide`, { body: { digest, state: "decided", reply: "x".repeat(20_000) } });
    expect(huge.status).toBe(413);
    expect(rows(w)[0]).toMatchObject({ state: "maintainer", reply: "You are right.", decision: null, decided_at: null });
  });

  it("a decision made on words the sender has since changed is refused", async () => {
    const w = await open();
    await send(w, report("fl_a"));
    escalated(w, "fl_a");
    const digest = await digestOf(w);
    await send(w, report("fl_a", { note: "I now think something else." }));
    const res = await decide(w, { digest, state: "decided", reply: "Decided on the old words." });
    expect([res.status, (await json(res)).error.code]).toEqual([409, "conflict"]);
    expect(rows(w)[0]).toMatchObject({ state: "sent", reply: null });
    // read again, the new words can be decided on
    expect((await decide(w, { digest: await digestOf(w), state: "decided", reply: "Decided on the new words." })).status).toBe(200);
  });

  it("a report from before the digest was kept can be decided on with an empty digest", async () => {
    const w = await open();
    await send(w, report("fl_a"));
    w.db.sql("UPDATE flag_reports SET digest = NULL");
    expect(await digestOf(w)).toBe("");
    expect((await decide(w, { digest: "", state: "decided", reply: "Ok." })).status).toBe(200);
  });
});

describe("from a flag to a decision", () => {
  it("the review sends a flag that needs the maintainer on; the decision answers it; the sender reads the answer", async () => {
    const w = await open();
    await send(w, report("fl_a"));
    const verdict = { text: [JSON.stringify({ verdict: "learner_right", cause: "data", reply: "You are right: nothing in the list is both.", fix: "Add an item that is hot and white.", confident: true })], usage: { input: 1000, output: 100 } };
    const api = fakeAnthropic([verdict]);
    await reviewPass(w.env, { kit: async () => fakeKit().kit, now: () => w.clock.now, fetch: api.fetch, retries: 0 });
    expect(await status(w, ["fl_a"])).toEqual([{ id: "fl_a", state: "maintainer", reply: "You are right: nothing in the list is both.", replyAt: expect.any(String) }]);

    const [item] = (await json(await admin(w, ""))).reports;
    expect(item).toMatchObject({ id: "fl_a", cause: "data", fix: "Add an item that is hot and white." });
    expect(item.reviews).toHaveLength(2);
    w.clock.now = new Date(w.clock.now.getTime() + 60_000);
    await admin(w, `/${item.ref}/decide`, { body: { digest: item.digest, state: "decided", reply: "You are right. Hot and white things can share items; the list will get some.", decision: "Data fix queued." } });
    expect((await status(w, ["fl_a"]))[0]).toMatchObject({ state: "decided", reply: "You are right. Hot and white things can share items; the list will get some." });
    expect((await json(await admin(w, ""))).reports).toEqual([]); // nothing is left with the maintainer
  });
});
