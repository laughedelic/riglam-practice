// Reports of learners' flags (worker/reports.ts): a device with the Magic Key may send one, signed in or not; the limits count
// the sender's device id, its address and all reports; a report can be taken back by the device that sent it or by its account.
import { describe, expect, it } from "vitest";
import { REPORT_API, REPORT_LIMITS, type FlagReport } from "../../src/report/protocol";
import { makeProof } from "../../src/ai/proof";
import { HEADER } from "../../src/ai/protocol";
import { GUESSES_PER_HOUR } from "../../worker/magic";
import { signUp, world, type World } from "./accounts-support";
import { json } from "./support";

const DEV_A = "deviceAAAAAAAAAAAAAAAA";
const DEV_B = "deviceBBBBBBBBBBBBBBBB";

const report = (id: string, over: Record<string, unknown> = {}, answer: Record<string, unknown> | null = { pairId: "r-1", chosen: "con" }): FlagReport => ({
  id,
  flag: { id, caseKey: "answers_r-1", part: "explain", shown: "Nothing is both.", note: "A white-hot stove is both.", suggest: "", state: "new", ...over },
  answer,
});

/** A request with the proof of the world's Magic Key for the device; `proof` replaces it, and a device of "" sends neither header. */
const post = async (w: World, body: unknown, who: { device?: string; cookie?: string; ip?: string; origin?: string | null; proof?: string } = {}) => {
  const device = who.device ?? DEV_A;
  return w.call(REPORT_API.reports, {
    body,
    cookie: who.cookie,
    origin: who.origin,
    headers: { ...(device === "" ? {} : { [HEADER.device]: device, [HEADER.proof]: who.proof ?? (await makeProof(w.key, device)) }), ...(who.ip ? { "cf-connecting-ip": who.ip } : {}) },
  });
};
const rows = (w: World) =>
  w.db.sql<{ device: string; id: string; user_id: string | null; caller: string; flag: string; answer: string | null; app: string | null; state: string; outcome: string | null; reason: string | null }>(
    "SELECT device, id, user_id, caller, flag, answer, app, state, outcome, reason FROM flag_reports ORDER BY device, id",
  );

describe("sending", () => {
  it("refuses a report whose flag has a field that is not text where the readers of reports turn it into words", async () => {
    const w = await world();
    // a value whose conversion to text throws would stop whoever lists or reviews the reports
    for (const over of [{ caseKey: { toString: 0 } }, { n: 5 }, { part: ["explain"] }, { note: { a: 1 } }, { pair: "a pair" }, { pair: { tab: 1 } }]) {
      const res = await post(w, { send: [report("fl_a", over)] });
      expect([res.status, (await json(res)).error.code], JSON.stringify(over)).toEqual([400, "bad_request"]);
    }
    expect(rows(w)).toEqual([]);
    expect((await post(w, { send: [report("fl_a", { n: null, asked: undefined, pair: { a: "hot", b: "white", relation: "con", tab: "practice" } })] })).status).toBe(200);
  });

  it("stores a report from a device that is not signed in", async () => {
    const w = await world();
    const res = await post(w, { send: [report("fl_a")], app: "0.3.0" });
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ stored: ["fl_a"], withdrawn: [] });
    const [row] = rows(w);
    expect(row).toMatchObject({ device: DEV_A, id: "fl_a", user_id: null, app: "0.3.0", state: "sent" });
    expect(JSON.parse(row.flag).note).toBe("A white-hot stove is both.");
    expect(JSON.parse(row.answer!)).toEqual({ pairId: "r-1", chosen: "con" });
    expect(row.caller).toMatch(/^[0-9a-f]{16}$/); // a hash of the address, not the address
  });

  it("keeps who was signed in as one more fact, and nothing when the cookie is not a session", async () => {
    const w = await world();
    const me = await signUp(w, "me");
    await post(w, { send: [report("fl_a")] }, { cookie: me.cookie });
    await post(w, { send: [report("fl_b")] }, { device: DEV_B, cookie: "__Secure-riglam-session=nope" });
    expect(rows(w).map((r) => [r.id, r.user_id])).toEqual([["fl_a", me.id], ["fl_b", null]]);
  });

  it("replaces the report of the same flag, and a report without a kept answer is fine", async () => {
    const w = await world();
    await post(w, { send: [report("fl_a")] });
    await post(w, { send: [report("fl_a", { note: "Changed my mind." }, null)] });
    const stored = rows(w);
    expect(stored).toHaveLength(1);
    expect(JSON.parse(stored[0].flag).note).toBe("Changed my mind.");
    expect(stored[0].answer).toBeNull();
  });

  it("the same flag edited on another device of the account replaces the first device's report", async () => {
    const w = await world();
    const me = await signUp(w, "me");
    await post(w, { send: [report("fl_a")] }, { device: DEV_A, cookie: me.cookie });
    await post(w, { send: [report("fl_a", { note: "From the tablet." })] }, { device: DEV_B, cookie: me.cookie });
    expect(rows(w).map((r) => [r.device, JSON.parse(r.flag).note])).toEqual([[DEV_B, "From the tablet."]]);
  });

  it("refuses what is not a report, with the reason", async () => {
    const w = await world();
    const bad = async (body: unknown, who = {}) => {
      const res = await post(w, body, who);
      return [res.status, (await json(res)).error.code] as const;
    };
    expect(await bad({ send: [report("fl_a")] }, { device: "" })).toEqual([400, "bad_request"]); // no device id
    expect(await bad({ send: [report("fl_a")] }, { device: "short" })).toEqual([400, "bad_request"]);
    expect(await bad({})).toEqual([400, "bad_request"]);
    expect(await bad({ send: "x" })).toEqual([400, "bad_request"]);
    expect(await bad({ send: [{ ...report("fl_a"), id: "__proto__" }] })).toEqual([400, "bad_request"]);
    expect(await bad({ send: [{ ...report("fl_a"), id: "fl_b" }] })).toEqual([400, "bad_request"]); // the flag names another id
    expect(await bad({ send: [{ id: "fl_a", flag: [], answer: null }] })).toEqual([400, "bad_request"]);
    expect(await bad({ send: [report("fl_a", { shown: "x".repeat(REPORT_LIMITS.flag) })] })).toEqual([400, "bad_request"]);
    expect(await bad({ send: [report("fl_a", {}, { big: "x".repeat(REPORT_LIMITS.answer) })] })).toEqual([400, "bad_request"]);
    expect(await bad({ send: Array.from({ length: REPORT_LIMITS.send + 1 }, (_, i) => report("fl_" + i)) })).toEqual([400, "bad_request"]);
    expect(await bad({ withdraw: ["a/b"] })).toEqual([400, "bad_request"]);
    expect(rows(w)).toEqual([]);
    const huge = await w.call(REPORT_API.reports, { body: { send: [] }, headers: { [HEADER.device]: DEV_A, [HEADER.proof]: await makeProof(w.key, DEV_A), "content-length": String(REPORT_LIMITS.body + 1) } });
    expect(huge.status).toBe(413);
  });

  it("is refused from another site", async () => {
    const w = await world();
    expect((await post(w, { send: [report("fl_a")] }, { origin: "https://elsewhere.example" })).status).toBe(403);
    expect(rows(w)).toEqual([]);
  });

  it("is off where the migration has not been applied or the operator switched it off", async () => {
    const w = await world();
    w.db.sql("INSERT INTO settings (key, value) VALUES ('reports', 'off')");
    const res = await post(w, { send: [report("fl_a")] });
    expect([res.status, (await json(res)).error.code]).toEqual([503, "unavailable"]);
    expect((await json(await w.call("/api/health"))).reports).toBe("off");
    w.db.sql("DELETE FROM settings WHERE key = 'reports'");
    expect((await json(await w.call("/api/health"))).reports).toBe("on");
    const none = await world({ DB: undefined });
    expect((await post(none, { send: [report("fl_a")] })).status).toBe(503);
  });
});

describe("the Magic Key", () => {
  it("only a device that proves it has the key may send or take back a report", async () => {
    const w = await world();
    await post(w, { send: [report("fl_a")] });
    const other = await makeProof("some-other-key-words", DEV_A);
    for (const who of [{ proof: "" }, { proof: other }, { proof: "x".repeat(43) }, { proof: await makeProof(w.key, DEV_B) }]) {
      for (const body of [{ send: [report("fl_b")] }, { withdraw: ["fl_a"] }]) {
        const res = await post(w, body, who);
        expect([res.status, (await json(res)).error.code]).toEqual([403, "not_granted"]);
      }
    }
    expect(rows(w).map((r) => r.id)).toEqual(["fl_a"]);
  });

  it("a proof for the Worker with no key set is refused too", async () => {
    const w = await world({ RIGLAM_DATA_KEY: undefined });
    expect((await post(w, { send: [report("fl_a")] }, { proof: await makeProof("some-other-key-words", DEV_A) })).status).toBe(403);
    expect(rows(w)).toEqual([]);
  });

  it("a caller who sends wrong proofs is counted, as for the tutor, and then told to wait even with a right one", async () => {
    const w = await world();
    for (let i = 0; i < GUESSES_PER_HOUR; i++) expect((await post(w, { send: [report("fl_a")] }, { proof: "x".repeat(43), ip: "198.51.100.9" })).status).toBe(403);
    // past the hour's wrong guesses the proof is not looked at: that is a wait (429 with the seconds), not a verdict on the key
    const blocked = await post(w, { send: [report("fl_a")] }, { ip: "198.51.100.9" });
    expect([blocked.status, (await json(blocked)).error.code]).toEqual([429, "quota"]);
    expect(Number(blocked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(rows(w)).toEqual([]);
    expect((await post(w, { send: [report("fl_a")] }, { ip: "198.51.100.10" })).status).toBe(200);
  });

  it("a guess that cannot be counted gets no verdict on the key: the same 503 for a proof that fits and one that does not", async () => {
    const w = await world();
    const db = w.env.DB as unknown as { prepare: (sql: string) => unknown };
    const real = db.prepare.bind(db);
    db.prepare = (sql: string) => (/INSERT INTO guesses/.test(sql) ? { bind: () => ({ run: () => Promise.reject(new Error("d1 is down")) }) } : real(sql));
    for (const who of [{}, { proof: "x".repeat(43) }]) {
      const res = await post(w, { send: [report("fl_a")] }, who);
      expect([res.status, (await json(res)).error.code]).toEqual([503, "unavailable"]);
      expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    }
    expect(rows(w)).toEqual([]);
  });
});

describe("taking a report back", () => {
  it("the sending device can; another device cannot", async () => {
    const w = await world();
    await post(w, { send: [report("fl_a")] });
    await post(w, { withdraw: ["fl_a"] }, { device: DEV_B });
    expect(rows(w)).toHaveLength(1);
    const res = await post(w, { withdraw: ["fl_a", "fl_none"] });
    expect(await json(res)).toEqual({ stored: [], withdrawn: ["fl_a", "fl_none"] });
    expect(rows(w)).toEqual([]);
  });

  it("a device signed in to the account that sent it can", async () => {
    const w = await world();
    const me = await signUp(w, "me");
    const other = await signUp(w, "other");
    await post(w, { send: [report("fl_a")] }, { device: DEV_A, cookie: me.cookie });
    await post(w, { withdraw: ["fl_a"] }, { device: DEV_B, cookie: other.cookie });
    expect(rows(w)).toHaveLength(1);
    await post(w, { withdraw: ["fl_a"] }, { device: DEV_B, cookie: me.cookie });
    expect(rows(w)).toEqual([]);
  });

  it("a report sent in the same request is sent again, not taken back", async () => {
    const w = await world();
    await post(w, { send: [report("fl_a")], withdraw: ["fl_a"] });
    expect(rows(w).map((r) => r.id)).toEqual(["fl_a"]);
  });
});

describe("limits", () => {
  const send = (w: World, n: number, who: { device?: string; ip?: string } = {}, from = 0) => post(w, { send: Array.from({ length: n }, (_, i) => report("fl_" + (from + i))) }, who);

  it("a device may send so many a day, and not more; the next day starts again", async () => {
    const w = await world();
    for (let i = 0; i < REPORT_LIMITS.perDevice / 5; i++) expect((await send(w, 5, {}, i * 5)).status).toBe(200);
    const res = await send(w, 1, {}, 100);
    expect([res.status, (await json(res)).error.code]).toEqual([429, "quota"]);
    expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(rows(w)).toHaveLength(REPORT_LIMITS.perDevice);
    w.clock.now = new Date(w.clock.now.getTime() + 86_400_000);
    expect((await send(w, 1, {}, 100)).status).toBe(200);
  });

  it("requests that arrive together cannot all pass a limit: the share of the day is taken before the reports are stored", async () => {
    const w = await world();
    for (let i = 0; i < 3; i++) expect((await send(w, 5, {}, i * 5)).status).toBe(200);
    // 15 of the 20 are used: each of these two would fit alone, both together would not. Each request is held where it counts the reports
    // held until the other is there too (or a moment has passed), so that they overlap as two requests in flight can.
    const db = w.env.DB as unknown as { prepare: (sql: string) => unknown };
    const real = db.prepare.bind(db);
    let first: (() => void) | null = null;
    db.prepare = (sql: string) =>
      /SELECT COUNT\(\*\) AS n FROM flag_reports/.test(sql)
        ? { first: async () => { await new Promise<void>((go) => { if (first) { first(); go(); } else { first = go; setTimeout(go, 100); } }); return (real(sql) as { first: () => Promise<unknown> }).first(); } }
        : real(sql);
    const both = await Promise.all([send(w, 5, {}, 100), send(w, 5, {}, 200)]);
    expect(both.map((r) => r.status).sort()).toEqual([200, 429]);
    expect(rows(w)).toHaveLength(REPORT_LIMITS.perDevice);
    // the refused request gave back what it had taken
    expect(w.db.sql<{ who: string; n: number }>("SELECT who, n FROM flag_quota").map((r) => r.n)).toEqual([20, 20, 20]);
  });

  it("a sender who makes up device ids is held by the limit on its address", async () => {
    const w = await world();
    let stored = 0;
    for (let d = 0; d < 40; d++) {
      const res = await send(w, 5, { device: "dev" + String(d).padStart(16, "0"), ip: "203.0.113.7" }, d * 5);
      if (res.status === 200) stored += 5;
    }
    expect(stored).toBe(REPORT_LIMITS.perCaller);
    // another address is not held by it
    expect((await send(w, 1, { device: "devOther0000000000000", ip: "203.0.113.8" }, 900)).status).toBe(200);
  });

  it("withdrawing is not counted", async () => {
    const w = await world();
    for (let i = 0; i < 30; i++) expect((await post(w, { withdraw: ["fl_" + i] })).status).toBe(200);
    expect((await send(w, 5)).status).toBe(200);
  });
});

describe("automatic flags", () => {
  // what a program writes, not a learner (AUTO_FLAGS in src/report/protocol.ts): Quorum's disagreement between models
  const auto = (id: string, over: Record<string, unknown> = {}) => report(id, { auto: "quorum", part: "quorum", shown: "The models gave different cells.", note: "", ...over });
  const sendAuto = (w: World, n: number, who: { device?: string; ip?: string } = {}, from = 0) => post(w, { send: Array.from({ length: n }, (_, i) => auto("fa_" + (from + i))) }, who);
  const sendOwn = (w: World, n: number, who: { device?: string; ip?: string } = {}, from = 0) => post(w, { send: Array.from({ length: n }, (_, i) => report("fl_" + (from + i))) }, who);

  it("are stored like any report, but as with the maintainer: the reviewing models are not asked about them", async () => {
    const w = await world();
    expect((await sendAuto(w, 1)).status).toBe(200);
    expect((await sendOwn(w, 1)).status).toBe(200);
    const [mine, theirs] = [rows(w).find((r) => r.id === "fl_0")!, rows(w).find((r) => r.id === "fa_0")!];
    expect(JSON.parse(theirs.flag)).toMatchObject({ auto: "quorum", part: "quorum" });
    expect([theirs.state, theirs.outcome, theirs.reason]).toEqual(["maintainer", "escalate", "automatic flag (quorum): not reviewed by the models; the maintainer decides"]);
    expect([mine.state, mine.outcome, mine.reason]).toEqual(["sent", null, null]);
  });

  it("keep the maintainer's decision when the same words are sent again, and go back to the maintainer when the words change", async () => {
    const w = await world();
    await post(w, { send: [auto("fa_1")] });
    w.db.sql("UPDATE flag_reports SET state = 'decided', reply = 'Quorum was right.' WHERE id = 'fa_1'");
    await post(w, { send: [auto("fa_1", { updatedAt: "later" })] });
    expect(rows(w)[0].state).toBe("decided"); // only a time changed
    await post(w, { send: [auto("fa_1", { shown: "The models gave other cells." })] });
    expect(rows(w)[0]).toMatchObject({ state: "maintainer", outcome: "escalate" });
    expect(w.db.sql<{ reply: string | null }>("SELECT reply FROM flag_reports")[0].reply).toBeNull();
  });

  it("change how they are handled when a flag changes from one kind to the other", async () => {
    const w = await world();
    await post(w, { send: [report("fl_a")] });
    expect(rows(w)[0].state).toBe("sent");
    await post(w, { send: [report("fl_a", { auto: "quorum" })] }); // the same words, now a program's
    expect(rows(w)[0]).toMatchObject({ state: "maintainer", outcome: "escalate" });
    await post(w, { send: [report("fl_a")] }); // and a learner's again
    expect(rows(w)[0]).toMatchObject({ state: "sent", outcome: null, reason: null });
  });

  it("do not use up the hand-made flags of the day, and hand-made ones do not use up theirs", async () => {
    const w = await world();
    for (let i = 0; i < REPORT_LIMITS.perDevice / 5; i++) expect((await sendOwn(w, 5, {}, i * 5)).status).toBe(200);
    expect((await sendOwn(w, 1, {}, 100)).status).toBe(429);
    for (let i = 0; i < 4; i++) expect((await sendAuto(w, 5, {}, i * 5)).status, "20 hand-made flags sent, automatic ones still go").toBe(200);
    const w2 = await world();
    for (let i = 0; i < REPORT_LIMITS.auto.perDevice / 5; i++) expect((await sendAuto(w2, 5, {}, i * 5)).status).toBe(200);
    expect((await sendOwn(w2, 5)).status, "a day of automatic flags leaves the hand-made allowance whole").toBe(200);
  });

  it("have limits of their own: per device, per address and in all, and the next day starts again", async () => {
    const w = await world();
    for (let i = 0; i < REPORT_LIMITS.auto.perDevice / 5; i++) expect((await sendAuto(w, 5, {}, i * 5)).status).toBe(200);
    const res = await sendAuto(w, 1, {}, 500);
    expect([res.status, (await json(res)).error.code]).toEqual([429, "quota"]);
    expect(rows(w)).toHaveLength(REPORT_LIMITS.auto.perDevice);
    w.clock.now = new Date(w.clock.now.getTime() + 86_400_000);
    expect((await sendAuto(w, 1, {}, 500)).status).toBe(200);

    // a sender that makes up device ids is held by the limit on its address
    const v = await world();
    let stored = 0;
    for (let d = 0; d < 60; d++) {
      const res = await sendAuto(v, 5, { device: "dev" + String(d).padStart(16, "0"), ip: "203.0.113.7" }, d * 5);
      if (res.status === 200) stored += 5;
    }
    expect(stored).toBe(REPORT_LIMITS.auto.perCaller);
  });

  it("a name that is not an automatic kind is an ordinary flag: it counts against the 20 a day", async () => {
    const w = await world();
    for (let i = 0; i < REPORT_LIMITS.perDevice / 5; i++) {
      expect((await post(w, { send: Array.from({ length: 5 }, (_, j) => auto("fl_" + (i * 5 + j), { auto: "other" })) })).status).toBe(200);
    }
    expect((await post(w, { send: [auto("fl_x", { auto: "other" })] })).status).toBe(429);
    expect((await post(w, { send: [auto("fl_y", { auto: true })] })).status).toBe(429);
  });

  it("a request with both kinds counts each kind, and is refused when either is full", async () => {
    const w = await world();
    for (let i = 0; i < REPORT_LIMITS.auto.perDevice / 5; i++) expect((await sendAuto(w, 5, {}, i * 5)).status).toBe(200);
    const mixed = [report("fl_a"), auto("fa_999")];
    const res = await post(w, { send: mixed });
    expect(res.status).toBe(429);
    expect(rows(w).map((r) => r.id)).not.toContain("fl_a");
    expect((await post(w, { send: [report("fl_a")] })).status).toBe(200);
  });
});
