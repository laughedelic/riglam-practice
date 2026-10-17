// POST /api/lab (worker/lab.ts): the check lab's model calls. Off unless the Worker is a Preview (LAB=on); counted in budgets of their own.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../worker/app";
import { parseLabRequest } from "../../worker/lab";
import { HEADER, LAB } from "../../src/ai/protocol";
import { makeProof, newDeviceId } from "../../src/ai/proof";
import { NOW, ask, events, fakeAnthropic, fakeKit, json, setup, type Round } from "./support";
import type { Env } from "../../worker/env";

type Setup = Awaited<ReturnType<typeof setup>>;

const body = (over: Record<string, unknown> = {}) => JSON.stringify({ model: "claude-sonnet-5-5", effort: "medium", prompt: "TASK\n\nCASE\nA = a\nB = b", ...over });
const REPLY = '{"things":[{"thing":"a table","reading":"furniture","inA":true,"inB":false,"exists":true,"unsure":false}]}';

/** One lab request against a fresh app; `rounds` are what the model does. The Worker is a Preview unless `env` says otherwise. */
async function lab(s: Setup, rounds: Round[], opts: { body?: string; headers?: Record<string, string>; env?: Partial<Env> } = {}) {
  const model = fakeAnthropic(rounds);
  const app = createApp({ kit: async () => fakeKit().kit, fetch: model.fetch, now: () => NOW, retries: 0 });
  const res = await app.request("/api/lab", { method: "POST", headers: opts.headers ?? s.headers(), body: opts.body ?? body() }, { LAB: "on", ...s.env, ...opts.env } as Env);
  return { res, model };
}
const scopes = (s: Setup) => Object.fromEntries(s.db.sql<{ scope: string; micro: number; calls: number }>("SELECT scope, micro, calls FROM budget").map((r) => [r.scope.replace(s.device, "D"), [r.micro, r.calls]]));
const log = (s: Setup) => s.db.sql<{ kind: string; model: string; outcome: string; micro: number; rounds: number }>("SELECT kind, model, outcome, micro, rounds FROM usage_log");

beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("when the lab is on", () => {
  const health = async (env: Partial<Env>) => {
    const s = await setup(env);
    return (await createApp({ kit: async () => fakeKit().kit, now: () => NOW }).request("/api/health", {}, s.env)).json();
  };

  it("is off unless LAB is on: health leaves it out and the route refuses, whatever the proof", async () => {
    expect(await health({})).toEqual({ ok: true, tutor: "on", accounts: "on" });
    for (const value of [undefined, "", "off", "true", "1"]) {
      const s = await setup();
      const { res, model } = await lab(s, [{ text: [REPLY] }], { env: { LAB: value } });
      expect(res.status).toBe(503);
      expect((await json(res)).error).toMatchObject({ code: "unavailable", message: "the lab is off" });
      expect(model.calls).toHaveLength(0);
    }
  });

  it("is said in health when LAB is on and the Worker could answer, and not when it could not", async () => {
    expect(await health({ LAB: "on" })).toEqual({ ok: true, tutor: "on", accounts: "on", lab: "on" });
    expect(await health({ LAB: "on", ANTHROPIC_API_KEY: undefined })).not.toHaveProperty("lab");
    expect(await health({ LAB: "on", DB: undefined })).not.toHaveProperty("lab");
    expect(await health({ LAB: "on", RIGLAM_DATA_KEY: undefined })).not.toHaveProperty("lab");
  });

  it("stops with the tutor's kill switch", async () => {
    const s = await setup();
    await s.env.DB!.prepare("INSERT INTO settings (key, value) VALUES ('tutor', 'off')").run();
    const { res, model } = await lab(s, [{ text: [REPLY] }]);
    expect(res.status).toBe(503);
    expect(model.calls).toHaveLength(0);
  });

  it("is never on in the production settings of wrangler.jsonc, only in the previews block", async () => {
    const { readFileSync } = await import("node:fs");
    const text = readFileSync(new URL("../../wrangler.jsonc", import.meta.url), "utf8");
    const at = text.indexOf('"previews"');
    expect(at).toBeGreaterThan(0);
    expect(text.slice(0, at)).not.toMatch(/"LAB"/);
    expect(text.slice(at)).toMatch(/"LAB":\s*"on"/);
  });
});

describe("who may ask", () => {
  it("refuses a proof made with another key, before the model", async () => {
    const s = await setup();
    const device = newDeviceId();
    const headers = s.headers({ [HEADER.device]: device, [HEADER.proof]: await makeProof("other-other-other-other", device) });
    const { res, model } = await lab(s, [{ text: [REPLY] }], { headers });
    expect(res.status).toBe(401);
    expect((await json(res)).error.code).toBe("not_granted");
    expect(model.calls).toHaveLength(0);
  });

  it("refuses a request that names another origin", async () => {
    const s = await setup();
    const { res } = await lab(s, [{ text: [REPLY] }], { headers: s.headers({ origin: "https://elsewhere.example" }) });
    expect(res.status).toBe(403);
  });
});

describe("what is asked", () => {
  it("reads a good request", () => {
    expect(parseLabRequest(JSON.parse(body()))).toEqual({ ok: true, request: { model: "claude-sonnet-5-5", effort: "medium", prompt: "TASK\n\nCASE\nA = a\nB = b" } });
  });

  it.each([
    ["a body that is not an object", "[1]", 400],
    ["a model the lab does not use", body({ model: "claude-sonnet-4-5" }), 400],
    ["no model", body({ model: undefined }), 400],
    ["an effort the lab does not use", body({ effort: "max" }), 400],
    ["an empty prompt", body({ prompt: "   " }), 400],
    ["a prompt that is not text", body({ prompt: ["a"] }), 400],
    ["a prompt that is too long", body({ prompt: "x".repeat(LAB.prompt + 1) }), 413],
    ["text that is not JSON", "{nope", 400],
  ])("refuses %s", async (_n, text, status) => {
    const s = await setup();
    const { res, model } = await lab(s, [{ text: [REPLY] }], { body: text });
    expect(res.status).toBe(status);
    expect(model.calls).toHaveLength(0);
    expect(scopes(s)).toEqual({});
  });

  it("accepts every model and effort the lab uses", () => {
    for (const model of LAB.models) for (const effort of LAB.efforts) expect(parseLabRequest({ model, effort, prompt: "x" }).ok).toBe(true);
  });
});

describe("an answer", () => {
  it("sends the prompt as the only message to the model asked for, with no tools, and returns the text with the model that answered", async () => {
    const s = await setup();
    const { res, model } = await lab(s, [{ text: [REPLY.slice(0, 20), REPLY.slice(20)] }]);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await json(res)).toEqual({ text: REPLY, truncated: false, modelApplied: "claude-sonnet-5-5" });
    expect(model.calls).toHaveLength(1);
    const sent = model.calls[0].body;
    expect(sent).toMatchObject({ model: "claude-sonnet-5-5", messages: [{ role: "user", content: "TASK\n\nCASE\nA = a\nB = b" }], output_config: { effort: "medium" } });
    expect(sent.tools).toBeUndefined();
    expect(sent.system).toBeUndefined();
  });

  it("says which model answered, and takes a dated name of the model asked for as that model", async () => {
    const s = await setup();
    const dated = await lab(s, [{ text: [REPLY], model: "claude-haiku-5-5-20261001" }], { body: body({ model: "claude-haiku-5-5" }) });
    expect((await json(dated.res)).modelApplied).toBe("claude-haiku-5-5");
    // another model than the one asked for is reported as it is, so that the page does not count the run
    const other = await lab(s, [{ text: [REPLY], model: "claude-sonnet-5-5" }], { body: body({ model: "claude-opus-5-5" }) });
    expect((await json(other.res)).modelApplied).toBe("claude-sonnet-5-5");
  });

  it("says when the model ran out of room", async () => {
    const s = await setup();
    const { res } = await lab(s, [{ text: ['{"things":['], stop: "max_tokens" }]);
    expect(await json(res)).toMatchObject({ truncated: true });
    expect(log(s)[0]).toMatchObject({ outcome: "truncated" });
  });
});

describe("the budgets", () => {
  it("counts a call against the lab's counters and logs it as a lab call, and leaves the tutor's counters alone", async () => {
    const s = await setup();
    const { res } = await lab(s, [{ text: [REPLY], model: "claude-haiku-5-5", usage: { input: 1000, output: 200 } }], { body: body({ model: "claude-haiku-5-5" }) });
    expect(res.status).toBe(200);
    // haiku: 0.1 USD per million input tokens, 0.5 per million output tokens
    expect(scopes(s)).toEqual({ lab: [200, 1], "lab:dev:D": [200, 1] });
    expect(log(s)).toEqual([{ kind: "lab", model: "claude-haiku-5-5", outcome: "answered", micro: 200, rounds: 1 }]);
  });

  it("refuses a device that has used its lab budget, with 429 and the time until tomorrow, before the model, while the tutor still answers", async () => {
    const s = await setup();
    const env = { LAB_DEVICE_DAILY_BUDGET_USD: "0.05", RESERVE_USD: "0.05" };
    await lab(s, [{ text: [REPLY] }], { env });
    const { res, model } = await lab(s, [{ text: [REPLY] }], { env });
    expect(res.status).toBe(429);
    const error = (await json(res)).error;
    expect(error).toMatchObject({ code: "rate_limited", scope: "device" });
    expect(error.resetsAt).toBe(new Date(NOW.getTime() + 14 * 3600 * 1000).toISOString());
    expect(model.calls).toHaveLength(0);
    // the tutor's budget is another counter
    const tutor = fakeAnthropic([{ text: ["ok"] }]);
    const app = createApp({ kit: async () => fakeKit().kit, fetch: tutor.fetch, now: () => NOW, retries: 0 });
    const asked = await app.request("/api/tutor", { method: "POST", headers: s.headers(), body: ask() }, { ...s.env, ...env } as Env);
    expect(asked.status).toBe(200);
    await events(asked);
  });

  it("refuses everybody when the lab's global budget is used", async () => {
    const s = await setup();
    const env = { LAB_GLOBAL_DAILY_BUDGET_USD: "0.05", RESERVE_USD: "0.05" };
    await lab(s, [{ text: [REPLY] }], { env });
    const device = newDeviceId();
    const headers = s.headers({ [HEADER.device]: device, [HEADER.proof]: await makeProof(s.key, device) });
    const { res } = await lab(s, [{ text: [REPLY] }], { env, headers });
    expect(res.status).toBe(429);
    expect((await json(res)).error).toMatchObject({ code: "rate_limited", scope: "global" });
  });
});

describe("when the model call fails", () => {
  it("answers 'unavailable' without repeating what the API said, and charges nothing", async () => {
    const s = await setup();
    const { res } = await lab(s, [{ error: { status: 500, type: "api_error" } }]);
    expect(res.status).toBe(503);
    const text = JSON.stringify(await json(res));
    expect(text).toContain("unavailable");
    expect(text).not.toContain("scripted");
    expect(scopes(s).lab).toEqual([0, 1]);
    expect(log(s)[0]).toMatchObject({ kind: "lab", outcome: "error", micro: 0 });
  });

  it("tells a busy model from a used-up budget: rate_limited, but with 503, not 429", async () => {
    const s = await setup();
    const { res } = await lab(s, [{ error: { status: 529, type: "overloaded_error" } }]);
    expect(res.status).toBe(503);
    expect((await json(res)).error.code).toBe("rate_limited");
  });

  it("passes on a refusal", async () => {
    const s = await setup();
    const { res } = await lab(s, [{ text: [], stop: "refusal" }]);
    expect(res.status).toBe(503);
    expect((await json(res)).error.code).toBe("refused");
  });
});
