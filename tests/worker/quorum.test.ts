// Quorum (worker/quorum.ts): an explain question that asks for it is answered by three models and, where they give an example different cells, a judge.
// Off unless the Worker is a Preview (QUORUM=on); counted in budgets of its own; every run is kept in quorum_records.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../worker/app";
import { parseRequest } from "../../worker/tutor";
import { NOW, ask, events, fakeKit, fakeModels, json, setup, type Round } from "./support";
import type { Env } from "../../worker/env";
import { newDeviceId, makeProof } from "../../src/ai/proof";
import { HEADER } from "../../src/ai/protocol";

type Setup = Awaited<ReturnType<typeof setup>>;

const HAIKU = "claude-haiku-5-5";
const SONNET = "claude-sonnet-5-5";
const OPUS = "claude-opus-5-5";

/** One explain line in the form the tutor writes (src/domain/verdict.ts): the example, and whether it is A and whether it is B. */
const line = (cell: string, example: string, a: "yes" | "no" | "unsure", b: "yes" | "no" | "unsure") => `${cell}: "${example}" | class: Table | A ${a}: it is ${example} | B ${b}: because it is wood`;
const BOTH = line("Both", "a table", "yes", "yes");
const ANB = line("Both", "a table", "yes", "no");
const TAIL = "Common locus: yes, a table.";
const text = (...lines: string[]): Round => ({ text: [lines.join("\n")], usage: { input: 1000, output: 200 } });

/** One explain request that asks for Quorum against a fresh app. The Worker is a Preview unless `env` says otherwise. */
async function quorum(s: Setup, rounds: Record<string, Round[]>, opts: { body?: string; env?: Partial<Env> } = {}) {
  const models = fakeModels(rounds);
  const app = createApp({ kit: async () => fakeKit().kit, fetch: models.fetch, now: () => NOW, retries: 0 });
  const res = await app.request("/api/tutor", { method: "POST", headers: s.headers(), body: opts.body ?? ask({ quorum: true }) }, { QUORUM: "on", ...s.env, ...opts.env } as Env);
  return { res, models };
}
const scopes = (s: Setup) => Object.fromEntries(s.db.sql<{ scope: string; micro: number; calls: number }>("SELECT scope, micro, calls FROM budget").map((r) => [r.scope.replace(s.device, "D"), [r.micro, r.calls]]));
const log = (s: Setup) => s.db.sql<{ kind: string; model: string; outcome: string; micro: number; rounds: number }>("SELECT kind, model, outcome, micro, rounds FROM usage_log");
const stored = (s: Setup) => s.db.sql<Record<string, any>>("SELECT * FROM quorum_records");
const userText = (call: { body: any }) => call.body.messages[call.body.messages.length - 1].content as string;

beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("when Quorum is offered", () => {
  const health = async (env: Partial<Env>) => {
    const s = await setup(env);
    return (await createApp({ kit: async () => fakeKit().kit, now: () => NOW }).request("/api/health", {}, s.env)).json();
  };

  it("is off unless QUORUM is on: health leaves it out, and the question is answered by the one model as ever", async () => {
    expect(await health({})).toEqual({ ok: true, tutor: "on", accounts: "on" });
    for (const value of [undefined, "", "off", "true", "1"]) {
      const s = await setup();
      const { res, models } = await quorum(s, { [SONNET]: [{ text: ["One model."] }] }, { env: { QUORUM: value } });
      expect(res.status).toBe(200);
      const got = await events(res);
      expect(got.map((e) => e.type)).toEqual(["delta", "done"]);
      expect(models.calls.map((c) => c.body.model)).toEqual([SONNET]);
      expect(stored(s)).toEqual([]);
    }
  });

  it("is said in health when QUORUM is on and the tutor is on, and not when the tutor is not", async () => {
    expect(await health({ QUORUM: "on" })).toEqual({ ok: true, tutor: "on", accounts: "on", quorum: "on" });
    expect(await health({ QUORUM: "on", ANTHROPIC_API_KEY: undefined })).not.toHaveProperty("quorum");
    expect(await health({ QUORUM: "on", DB: undefined })).not.toHaveProperty("quorum");
    expect(await health({ QUORUM: "on", RIGLAM_DATA_KEY: undefined })).not.toHaveProperty("quorum");
  });

  it("is never on in the production settings of wrangler.jsonc, only in the previews block", async () => {
    const { readFileSync } = await import("node:fs");
    const wrangler = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
    const at = wrangler.indexOf('"previews"');
    expect(at).toBeGreaterThan(0);
    expect(wrangler.slice(0, at)).not.toMatch(/"QUORUM"/);
    expect(wrangler.slice(at)).toMatch(/"QUORUM":\s*"on"/);
  });

  it("is asked only by an explain question: a chat question that asks for it is answered by the one model", async () => {
    const s = await setup();
    const { res, models } = await quorum(s, { [SONNET]: [{ text: ["Fine."] }] }, { body: ask({ kind: "chat", quorum: true }) });
    expect((await events(res)).map((e) => e.type)).toEqual(["delta", "done"]);
    expect(models.calls.map((c) => c.body.model)).toEqual([SONNET]);
    expect(stored(s)).toEqual([]);
  });

  it("reads the flag in the request, and refuses one that is not true or false", () => {
    const turns = [{ role: "user", content: "x" }];
    expect(parseRequest({ kind: "explain", cats: [], turns, quorum: true })).toMatchObject({ ok: true, request: { quorum: true } });
    expect(parseRequest({ kind: "explain", cats: [], turns })).toMatchObject({ ok: true, request: { cats: [] } });
    expect((parseRequest({ kind: "explain", cats: [], turns }) as { request: object }).request).not.toHaveProperty("quorum");
    expect(parseRequest({ kind: "explain", cats: [], turns, quorum: "yes" })).toMatchObject({ ok: false, code: "bad_request" });
  });

  it("is asked only by a caller with the Magic Key", async () => {
    const s = await setup();
    const device = newDeviceId();
    const headers = s.headers({ [HEADER.device]: device, [HEADER.proof]: await makeProof("other-other-other-other", device) });
    const models = fakeModels({});
    const app = createApp({ kit: async () => fakeKit().kit, fetch: models.fetch, now: () => NOW, retries: 0 });
    const res = await app.request("/api/tutor", { method: "POST", headers, body: ask({ quorum: true }) }, { QUORUM: "on", ...s.env } as Env);
    expect(res.status).toBe(401);
    expect(models.calls).toHaveLength(0);
  });
});

describe("when the models agree", () => {
  it("asks the three models with the tutor's instructions and tools, shows the strongest one's answer, asks no judge, and keeps the run", async () => {
    const s = await setup();
    const { res, models } = await quorum(s, {
      [HAIKU]: [text(BOTH, TAIL.replace("table", "haiku"))],
      [SONNET]: [text(BOTH, TAIL.replace("table", "sonnet"))],
      [OPUS]: [text(BOTH, TAIL.replace("table", "opus"))],
    });
    expect(res.status).toBe(200);
    const got = await events(res);
    expect(got.map((e) => e.type)).toEqual(["step", "step", "step", "delta", "quorum", "done"]);
    expect(got.filter((e) => e.type === "step").map((e) => e.name).sort()).toEqual(["Haiku", "Opus", "Sonnet"]);
    expect(got[3]).toEqual({ type: "delta", text: `${BOTH}\nCommon locus: yes, a opus.` });
    expect(got[5]).toEqual({ type: "done", truncated: false });
    const record = (got[4] as any).record;
    expect(record).toMatchObject({ shown: "Opus", why: null, judge: null });
    expect(record.models.map((m: any) => [m.name, m.model, m.ok])).toEqual([["Haiku", HAIKU, true], ["Sonnet", SONNET, true], ["Opus", OPUS, true]]);
    // each model was asked as the tutor asks: the guide, the lookup tool, the fine points of the pair, its own model
    expect(models.calls.map((c) => c.body.model).sort()).toEqual([HAIKU, OPUS, SONNET]);
    for (const c of models.calls) {
      expect(c.body.system[0].text).toContain("GUIDE");
      expect(c.body.tools[0].name).toBe("lookup_term");
      expect(userText(c)).toContain("CARD: A is form, B is round.");
      expect(userText(c)).toContain("A person is not form; the body is.");
    }
    // the row that was kept: every answer, the examples with the cell each gave, and what it cost
    const [row] = stored(s);
    expect(row).toMatchObject({ id: record.id, day: "2026-10-13", device: s.device, kind: "explain", shown: "Opus", judged: 0, disputed: 0, outcome: "answered", micro: 4000 + 8000 + 200 });
    expect(JSON.parse(row.cats)).toEqual(["c_form", "c_round"]);
    expect(row.prompt).toBe("CARD: A is form, B is round.");
    expect(JSON.parse(row.things)).toEqual([{ example: "a table", lines: ["both"], cells: { Haiku: "both", Sonnet: "both", Opus: "both" } }]);
    expect(JSON.parse(row.runs).map((r: any) => [r.name, r.ok])).toEqual([["Haiku", true], ["Sonnet", true], ["Opus", true]]);
  });

  it("counts the whole run in Quorum's counters and logs it once, leaving the tutor's counters alone", async () => {
    const s = await setup();
    await events((await quorum(s, { [HAIKU]: [text(BOTH)], [SONNET]: [text(BOTH)], [OPUS]: [text(BOTH)] })).res);
    expect(scopes(s)).toEqual({ quorum: [12200, 1], "quorum:dev:D": [12200, 1] });
    expect(log(s)).toEqual([{ kind: "explain", model: "quorum", outcome: "answered", micro: 12200, rounds: 3 }]);
  });

  it("does not call the judge for an example only some of them mention, or one a model is unsure of", async () => {
    const s = await setup();
    const extra = line("Neither", "a stone", "no", "no");
    const { res, models } = await quorum(s, { [HAIKU]: [text(BOTH, line("Both", "a table", "unsure", "yes"))], [SONNET]: [text(BOTH, extra)], [OPUS]: [text(BOTH)] });
    await events(res);
    expect(models.calls).toHaveLength(3);
  });
});

describe("when the models differ", () => {
  const differing = { [HAIKU]: [text(BOTH, "First tail.")], [SONNET]: [text(ANB, "Second tail.")], [OPUS]: [text(ANB, "Third tail."), text(ANB, "Judge tail.")] };

  it("asks the judge, which answers the request itself with the drafts after it, and shows the judge's answer", async () => {
    const s = await setup();
    const { res, models } = await quorum(s, differing);
    const got = await events(res);
    expect(got.map((e) => e.type)).toEqual(["step", "step", "step", "step", "delta", "quorum", "done"]);
    expect(got[3]).toMatchObject({ type: "step", name: "Judge", ok: true });
    expect(got[4]).toEqual({ type: "delta", text: `${ANB}\nJudge tail.` });
    const record = (got[5] as any).record;
    expect(record).toMatchObject({ shown: "Judge", why: "disagree" });
    expect(record.judge).toMatchObject({ name: "Judge", model: OPUS, ok: true, text: `${ANB}\nJudge tail.` });
    const judgeCall = models.calls.filter((c) => c.body.model === OPUS)[1];
    const sent = userText(judgeCall);
    // the learner's request comes first, with the fine points once, then the note, then all three drafts without the names of the models
    expect(sent.startsWith("CARD: A is form, B is round.")).toBe(true);
    expect(sent.match(/Fine points/g)).toHaveLength(1);
    expect(sent.indexOf("Fine points")).toBeLessThan(sent.indexOf("DRAFT 1"));
    expect(sent).toContain('"a table": ');
    expect(sent).toMatch(/draft \d Both/);
    expect(sent).toMatch(/draft \d A not B/);
    for (const draft of ["First tail.", "Second tail.", "Third tail."]) expect(sent).toContain(draft);
    expect(sent).not.toMatch(/Haiku|Sonnet|Opus/); // the models are not named
    expect(judgeCall.body.output_config).toEqual({ effort: "high" });
    expect(models.calls.filter((c) => c.body.model !== OPUS).every((c) => c.body.output_config.effort === "medium")).toBe(true);
  });

  it("keeps the run with the judge's cell for the example, and counts the dispute and the judge's cost", async () => {
    const s = await setup();
    await events((await quorum(s, differing)).res);
    const [row] = stored(s);
    expect(row).toMatchObject({ shown: "Judge", judged: 1, disputed: 1, micro: 200 + 4000 + 8000 + 8000 });
    expect(JSON.parse(row.things)).toEqual([{ example: "a table", lines: ["both"], cells: { Haiku: "both", Sonnet: "anb", Opus: "anb", Judge: "anb" } }]);
    expect(JSON.parse(row.runs).map((r: any) => r.name)).toEqual(["Haiku", "Sonnet", "Opus", "Judge"]);
    expect(log(s)).toEqual([{ kind: "explain", model: "quorum", outcome: "answered", micro: 20200, rounds: 4 }]);
  });

  it("shows the strongest answer that came when the judge fails, and says so in the record", async () => {
    const s = await setup();
    const { res } = await quorum(s, { ...differing, [OPUS]: [text(ANB, "Third tail."), { error: { status: 500, type: "api_error" } }] });
    const got = await events(res);
    expect(got.map((e) => e.type)).toEqual(["step", "step", "step", "step", "delta", "quorum", "done"]);
    expect(got[3]).toMatchObject({ name: "Judge", ok: false });
    expect(got[4]).toEqual({ type: "delta", text: `${ANB}\nThird tail.` });
    expect((got[5] as any).record).toMatchObject({ shown: "Opus", why: "disagree", judge: { ok: false, text: "", error: "unavailable" } });
    expect(stored(s)[0]).toMatchObject({ shown: "Opus", judged: 1 });
  });

  it("asks for the judge when two answers differ in a debate question as well", async () => {
    const s = await setup();
    const q = (cell: string, b: "yes" | "no") => `${cell}: "a table" | class: Table | A yes: it is a table | B ${b}: because it is wood`;
    const { res, models } = await quorum(s, { [HAIKU]: [text(q("Q2", "yes"))], [SONNET]: [text(q("Q2", "no"))], [OPUS]: [text(q("Q2", "no")), text(q("Q2", "no"))] });
    await events(res);
    expect(models.calls).toHaveLength(4);
  });
});

describe("when a model fails", () => {
  it("uses the answers that came, records the failure, and asks no judge for two that agree", async () => {
    const s = await setup();
    const { res, models } = await quorum(s, { [HAIKU]: [{ error: { status: 500, type: "api_error" } }], [SONNET]: [text(BOTH, "S.")], [OPUS]: [text(BOTH, "O.")] });
    const got = await events(res);
    expect(got.map((e) => e.type)).toEqual(["step", "step", "step", "delta", "quorum", "done"]);
    expect(got.filter((e) => e.type === "step").map((e) => [e.name, e.ok]).sort()).toEqual([["Haiku", false], ["Opus", true], ["Sonnet", true]]);
    const record = (got[4] as any).record;
    expect(record.models[0]).toMatchObject({ name: "Haiku", ok: false, text: "", error: "unavailable" });
    expect(record.shown).toBe("Opus");
    expect(models.calls).toHaveLength(3);
    expect(stored(s)[0]).toMatchObject({ judged: 0, disputed: 0 });
  });

  it("shows the only answer there is, without a judge, when two models fail", async () => {
    const s = await setup();
    const { res, models } = await quorum(s, { [HAIKU]: [{ error: { status: 500, type: "api_error" } }], [SONNET]: [text(BOTH, "S.")], [OPUS]: [{ error: { status: 500, type: "api_error" } }] });
    const got = await events(res);
    expect(got.find((e) => e.type === "delta")).toEqual({ type: "delta", text: `${BOTH}\nS.` });
    expect((got.find((e) => e.type === "quorum") as any).record.shown).toBe("Sonnet");
    expect(models.calls).toHaveLength(3);
  });

  it("answers with an error and keeps no record when no model answers, and still counts what was used", async () => {
    const s = await setup();
    const fail: Round[] = [{ error: { status: 500, type: "api_error" } }];
    const { res } = await quorum(s, { [HAIKU]: fail, [SONNET]: fail, [OPUS]: fail });
    const got = await events(res);
    expect(got.map((e) => e.type)).toEqual(["step", "step", "step", "error"]);
    expect(got[3]).toMatchObject({ code: "unavailable" });
    expect(JSON.stringify(got)).not.toContain("scripted");
    expect(stored(s)).toEqual([]);
    expect(log(s)).toEqual([{ kind: "explain", model: "quorum", outcome: "error", micro: 0, rounds: 3 }]);
  });

  it("marks the answer as cut short when the shown model ran out of room", async () => {
    const s = await setup();
    const { res } = await quorum(s, { [HAIKU]: [text(BOTH)], [SONNET]: [text(BOTH)], [OPUS]: [{ ...text(BOTH), stop: "max_tokens" }] });
    const got = await events(res);
    expect(got[got.length - 1]).toEqual({ type: "done", truncated: true });
    expect(log(s)[0]).toMatchObject({ outcome: "truncated" });
  });
});

describe("the budgets", () => {
  it("answers with the one model, and says so, when Quorum's budget has no room", async () => {
    const s = await setup();
    const { res, models } = await quorum(s, { [SONNET]: [{ text: ["One model."], usage: { input: 1000, output: 200 } }] }, { env: { QUORUM_DEVICE_DAILY_BUDGET_USD: "0.3" } });
    expect(res.status).toBe(200);
    expect(await events(res)).toEqual([{ type: "single", why: "budget" }, { type: "delta", text: "One model." }, { type: "done", truncated: false }]);
    expect(models.calls.map((c) => c.body.model)).toEqual([SONNET]);
    // the tutor's counters moved, Quorum's did not
    expect(scopes(s)).toEqual({ global: [4000, 1], "dev:D": [4000, 1], quorum: [0, 0], "quorum:dev:D": [0, 0] });
    expect(log(s)).toEqual([{ kind: "explain", model: SONNET, outcome: "answered", micro: 4000, rounds: 1 }]);
    expect(stored(s)).toEqual([]);
  });

  it("holds Quorum's reserve while it runs and replaces it by the real cost, also for a device that has little left", async () => {
    const s = await setup();
    const env = { QUORUM_DEVICE_DAILY_BUDGET_USD: "0.5", QUORUM_RESERVE_USD: "0.4" };
    const rounds = { [HAIKU]: [text(BOTH)], [SONNET]: [text(BOTH)], [OPUS]: [text(BOTH)] };
    const first = await quorum(s, rounds, { env });
    await events(first.res);
    expect(scopes(s)["quorum:dev:D"]).toEqual([12200, 1]);
    // 12200 used, 400000 more held: 412200 fits in 500000, so a second run is Quorum's too
    const second = await quorum(s, rounds, { env });
    expect((await events(second.res)).some((e) => e.type === "quorum")).toBe(true);
    expect(scopes(s)["quorum:dev:D"]).toEqual([24400, 2]);
  });

  it("falls to the tutor's budget when Quorum's has no room, and refuses a device that has used that too", async () => {
    const s = await setup();
    const env = { DEVICE_DAILY_BUDGET_USD: "0.05", RESERVE_USD: "0.05" };
    const rounds = { [SONNET]: [text(BOTH)] };
    await events((await quorum(s, rounds, { body: ask({ kind: "chat", quorum: true }), env: { ...env, QUORUM_DEVICE_DAILY_BUDGET_USD: "0.1" } })).res);
    const { res } = await quorum(s, rounds, { env: { ...env, QUORUM_DEVICE_DAILY_BUDGET_USD: "0.1" } });
    // Quorum's reserve (0.40 by default) does not fit in 0.1, so the question falls to the tutor, which has no room either
    expect(res.status).toBe(429);
    expect((await json(res)).error).toMatchObject({ code: "rate_limited", scope: "device" });
  });
});
