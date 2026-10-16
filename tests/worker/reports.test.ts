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
  w.db.sql<{ device: string; id: string; user_id: string | null; caller: string; flag: string; answer: string | null; app: string | null; state: string }>(
    "SELECT device, id, user_id, caller, flag, answer, app, state FROM flag_reports ORDER BY device, id",
  );

describe("sending", () => {
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
