// The Worker's routes (worker/app.ts), end to end with stand-ins for D1 and the Anthropic API.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Anthropic from "@anthropic-ai/sdk";
import { createApp } from "../../worker/app";
import { readConfig } from "../../worker/config";
import { runTutor } from "../../worker/tutor";
import { HEADER, LIMITS } from "../../src/ai/protocol";
import { makeProof, newDeviceId } from "../../src/ai/proof";
import { NOW, ask, events, fakeAnthropic, fakeKit, json, setup, type Round } from "./support";
import type { Kit } from "../../worker/kit";
import type { Env } from "../../worker/env";

type Setup = Awaited<ReturnType<typeof setup>>;

/** One tutor request against a fresh app; `rounds` are what the model does, call by call. */
async function tutor(s: Setup, rounds: Round[], opts: { body?: string; headers?: Record<string, string>; kit?: Kit | null; env?: Partial<Env> } = {}) {
  const model = fakeAnthropic(rounds);
  const { kit, ran } = fakeKit();
  const given = opts.kit === undefined ? kit : opts.kit;
  const app = createApp({ kit: async () => given, fetch: model.fetch, now: () => NOW, retries: 0 });
  const res = await app.request("/api/tutor", { method: "POST", headers: opts.headers ?? s.headers(), body: opts.body ?? ask() }, { ...s.env, ...opts.env });
  return { res, model, ran };
}
const text = (e: { type: string; text?: unknown }[]) => e.filter((x) => x.type === "delta").map((x) => x.text).join("");
const counters = (s: Setup) => Object.fromEntries(s.db.sql<{ scope: string; micro: number; calls: number }>("SELECT scope, micro, calls FROM budget").map((r) => [r.scope === "global" ? "global" : "device", [r.micro, r.calls]]));
const log = (s: Setup) => s.db.sql<{ outcome: string; micro: number; rounds: number; kind: string }>("SELECT outcome, micro, rounds, kind FROM usage_log");

beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("GET /api/health", () => {
  const health = async (env: Partial<Env>) => {
    const s = await setup(env);
    const res = await createApp({ kit: async () => fakeKit().kit, now: () => NOW }).request("/api/health", {}, s.env);
    return { res, body: await res.json(), s };
  };

  it("says the tutor is on when the database and both secrets are there", async () => {
    const { res, body } = await health({});
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body).toEqual({ ok: true, tutor: "on" });
  });

  it.each([
    ["no database", { DB: undefined }],
    ["no model key", { ANTHROPIC_API_KEY: undefined }],
    ["no data key", { RIGLAM_DATA_KEY: undefined }],
  ])("says it is off with %s", async (_n, env) => {
    expect((await health(env)).body).toEqual({ ok: true, tutor: "off" });
  });

  it("says it is off when the switch in the database is off, and on again when it is not", async () => {
    const s = await setup();
    const app = createApp({ kit: async () => fakeKit().kit, now: () => NOW });
    await s.env.DB!.prepare("INSERT INTO settings (key, value) VALUES ('tutor', 'off')").run();
    expect(await (await app.request("/api/health", {}, s.env)).json()).toEqual({ ok: true, tutor: "off" });
    await s.env.DB!.prepare("DELETE FROM settings").run();
    expect(await (await app.request("/api/health", {}, s.env)).json()).toEqual({ ok: true, tutor: "on" });
  });

  it("is off when there is no kit, whatever else is in place (every question would be refused)", async () => {
    const s = await setup();
    const app = createApp({ kit: async () => null, now: () => NOW });
    expect(await (await app.request("/api/health", {}, s.env)).json()).toEqual({ ok: true, tutor: "off" });
    const failing = createApp({ kit: async () => { throw new Error("bad key"); }, now: () => NOW });
    expect(await (await failing.request("/api/health", {}, s.env)).json()).toMatchObject({ tutor: "off" });
  });

  it("is off, not an error, when the database cannot be read (the migration has not been applied)", async () => {
    const s = await setup({ DB: { prepare: () => { throw new Error("no such table"); } } as unknown as D1Database });
    const res = await createApp({ kit: async () => fakeKit().kit }).request("/api/health", {}, s.env);
    expect(await res.json()).toEqual({ ok: true, tutor: "off" });
  });
});

describe("POST /api/tutor: who may ask", () => {
  it.each([
    ["no headers", {}],
    ["a proof for another device", { [HEADER.device]: newDeviceId() }],
    ["a malformed proof", { [HEADER.proof]: "nope" }],
  ])("refuses %s with not_granted, before the database or the model is touched", async (_n, h) => {
    const s = await setup();
    const { res, model } = await tutor(s, [{ text: ["x"] }], { headers: { "content-type": "application/json", ...(h as Record<string, string>) } });
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: { code: "not_granted", message: "the proof does not match" } });
    expect(model.calls).toHaveLength(0);
    expect(counters(s)).toEqual({});
  });

  it("refuses a proof made with another key", async () => {
    const s = await setup();
    const proof = await makeProof((await setup()).key, s.device);
    const { res } = await tutor(s, [{ text: ["x"] }], { headers: s.headers({ [HEADER.proof]: proof }) });
    expect(res.status).toBe(401);
  });

  it("refuses a request that names another origin", async () => {
    const s = await setup();
    const { res, model } = await tutor(s, [{ text: ["x"] }], { headers: s.headers({ origin: "https://evil.example" }) });
    expect(res.status).toBe(403);
    expect(model.calls).toHaveLength(0);
  });

  it("accepts the app's own origin", async () => {
    const s = await setup();
    const { res } = await tutor(s, [{ text: ["x"] }], { headers: s.headers({ origin: "http://localhost" }) });
    expect(res.status).toBe(200);
  });

  it("answers 'unavailable' when the tutor is not set up, once the sender has proved the key", async () => {
    for (const env of [{ DB: undefined }, { ANTHROPIC_API_KEY: undefined }]) {
      const s = await setup();
      const { res, model } = await tutor(s, [{ text: ["x"] }], { env });
      expect(res.status).toBe(503);
      expect((await json(res)).error.code).toBe("unavailable");
      expect(model.calls).toHaveLength(0);
    }
  });

  it("stops at once when the switch is off", async () => {
    const s = await setup();
    await s.env.DB!.prepare("INSERT INTO settings (key, value) VALUES ('tutor', 'off')").run();
    const { res, model } = await tutor(s, [{ text: ["x"] }]);
    expect(res.status).toBe(503);
    expect(model.calls).toHaveLength(0);
    expect(counters(s)).toEqual({});
  });

  it("answers 'unavailable' when the Worker has no kit", async () => {
    const s = await setup();
    const { res, model } = await tutor(s, [{ text: ["x"] }], { kit: null });
    expect(res.status).toBe(503);
    expect(model.calls).toHaveLength(0);
    expect(counters(s)).toEqual({});
  });
});

describe("POST /api/tutor: what is asked", () => {
  const refused = async (body: string, status: number, code: string) => {
    const s = await setup();
    const { res, model } = await tutor(s, [{ text: ["x"] }], { body });
    expect(res.status).toBe(status);
    expect((await json(res)).error.code).toBe(code);
    expect(model.calls).toHaveLength(0);
    expect(counters(s)).toEqual({});
  };

  it("refuses a body that is not JSON", () => refused("{nope", 400, "bad_request"));
  it("refuses an unknown kind", () => refused(ask({ kind: "grade" }), 400, "bad_request"));
  it("refuses more than two categories", () => refused(ask({ cats: ["a", "b", "c"] }), 400, "bad_request"));
  it("refuses a conversation that does not end with the learner", () => refused(ask({ turns: [{ role: "user", content: "a" }, { role: "assistant", content: "b" }] }), 400, "bad_request"));
  it("refuses an empty turn", () => refused(ask({ turns: [{ role: "user", content: "  " }] }), 400, "bad_request"));
  it("refuses too many turns", () => refused(ask({ turns: Array.from({ length: LIMITS.turns + 1 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "x" })) }), 413, "prompt_too_large"));
  it("refuses one turn that is too long", () => refused(ask({ turns: [{ role: "user", content: "x".repeat(20_001) }] }), 413, "prompt_too_large"));
  it("refuses a conversation that is too long in all", () =>
    refused(ask({ turns: Array.from({ length: 5 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "x".repeat(15_000) })) }), 413, "prompt_too_large"));

  it("counts the bytes of a body sent without a length, not its characters", async () => {
    const s = await setup();
    // 150,000 two-byte letters are 300,000 bytes in a field the request does not use
    const big = JSON.stringify({ kind: "explain", cats: [], turns: [{ role: "user", content: "x" }], pad: "é".repeat(150_000) });
    const { res, model } = await tutor(s, [{ text: ["x"] }], { body: big });
    expect(res.status).toBe(413);
    expect(model.calls).toHaveLength(0);
    expect(counters(s)).toEqual({});
  });

  it("refuses a body over the limit by its declared length, without reading it", async () => {
    const s = await setup();
    const { res } = await tutor(s, [{ text: ["x"] }], { headers: s.headers({ "content-length": String(LIMITS.body + 1) }) });
    expect(res.status).toBe(413);
  });
});

describe("POST /api/tutor: an answer", () => {
  it("streams the text and ends with done, and charges what the model used", async () => {
    const s = await setup();
    const { res, model } = await tutor(s, [{ text: ["A is ", "form."], usage: { input: 100, output: 20 } }]);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    const e = await events(res);
    expect(e.map((x) => x.type)).toEqual(["delta", "delta", "done"]);
    expect(text(e)).toBe("A is form.");
    expect(e.at(-1)).toEqual({ type: "done", truncated: false });
    expect(model.calls).toHaveLength(1);
    // 100 input at 2 + 20 output at 10 micro-dollars; the 50,000 held back is replaced by it
    expect(counters(s)).toEqual({ global: [400, 1], device: [400, 1] });
    expect(log(s)).toEqual([{ outcome: "answered", micro: 400, rounds: 1, kind: "explain" }]);
  });

  it("asks the model for what the design says", async () => {
    const s = await setup();
    const { res, model } = await tutor(s, [{ text: ["ok"] }]);
    await events(res);
    const [call] = model.calls;
    expect(call.url).toBe("https://api.anthropic.com/v1/messages");
    expect(call.body).toMatchObject({
      model: "claude-sonnet-5-5",
      max_tokens: 6000,
      stream: true,
      system: [{ type: "text", text: "GUIDE: you are a terse tutor." }],
      output_config: { effort: "medium" },
      cache_control: { type: "ephemeral" },
    });
    expect(call.body.tools.map((t: { name: string }) => t.name)).toEqual(["lookup_term"]);
    // adaptive thinking is the default when the parameter is left out; no tool is forced
    expect(call.body).not.toHaveProperty("thinking");
    expect(call.body).not.toHaveProperty("tool_choice");
  });

  it("adds the fine points of the categories to the first turn only", async () => {
    const s = await setup();
    const turns = [
      { role: "user", content: "CARD: A is form, B is round." },
      { role: "assistant", content: "Because..." },
      { role: "user", content: "Why?" },
    ];
    const { res, model } = await tutor(s, [{ text: ["ok"] }], { body: ask({ kind: "chat", turns }) });
    await events(res);
    const sent = model.calls[0].body.messages;
    expect(sent[0].content).toBe("CARD: A is form, B is round.\nFine points (from the sources; apply them):\n- A person is not form; the body is.");
    expect(sent[1].content).toBe("Because...");
    expect(sent[2].content).toBe("Why?");
    expect(log(s)[0].kind).toBe("chat");
  });

  it("sends the first turn as it is when there are no fine points", async () => {
    const s = await setup();
    const { res, model } = await tutor(s, [{ text: ["ok"] }], { body: ask({ cats: ["c_round"] }) });
    await events(res);
    expect(model.calls[0].body.messages[0].content).toBe("CARD: A is form, B is round.");
  });

  it("uses the model, effort and limits the variables name", async () => {
    const s = await setup();
    const { res, model } = await tutor(s, [{ text: ["ok"], usage: { input: 1000, output: 0 } }], { env: { TUTOR_MODEL: "claude-haiku-5-5", TUTOR_EFFORT: "low", TUTOR_MAX_TOKENS: "1234" } });
    await events(res);
    expect(model.calls[0].body).toMatchObject({ model: "claude-haiku-5-5", max_tokens: 1234, output_config: { effort: "low" } });
    expect(counters(s).global).toEqual([100, 1]);
  });

  it("is told it ended in the middle when the model ran out of room", async () => {
    const s = await setup();
    const { res } = await tutor(s, [{ text: ["A is"], stop: "max_tokens" }]);
    const e = await events(res);
    expect(e.at(-1)).toEqual({ type: "done", truncated: true });
    expect(log(s)[0].outcome).toBe("truncated");
  });
});

describe("POST /api/tutor: lookups", () => {
  it("runs the tool the model asks for, gives the result back, and sums the cost of both calls", async () => {
    const s = await setup();
    const { res, model, ran } = await tutor(s, [
      { text: ["Let me look. "], tool: { id: "tu_1", name: "lookup_term", input: { name: "form" } }, usage: { input: 100, output: 10 } },
      { text: ["Form is visible."], usage: { input: 150, output: 20 } },
    ]);
    const e = await events(res);
    expect(text(e)).toBe("Let me look. Form is visible.");
    expect(e.at(-1)).toEqual({ type: "done", truncated: false });
    expect(ran).toEqual([{ name: "lookup_term", input: { name: "form" } }]);
    const second = model.calls[1].body.messages;
    expect(second.map((m: { role: string }) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(second[1].content.at(-1)).toMatchObject({ type: "tool_use", id: "tu_1", name: "lookup_term" });
    expect(second[2].content).toEqual([{ type: "tool_result", tool_use_id: "tu_1", content: '{"found":true,"name":"form"}' }]);
    expect(model.calls[1].body).not.toHaveProperty("tool_choice");
    expect(counters(s).global).toEqual([100 * 2 + 10 * 10 + 150 * 2 + 20 * 10, 1]);
    expect(log(s)).toEqual([{ outcome: "answered", micro: 100 * 2 + 10 * 10 + 150 * 2 + 20 * 10, rounds: 2, kind: "explain" }]);
  });

  it("tells the model when a tool failed, and carries on", async () => {
    const s = await setup();
    const { res, model } = await tutor(s, [{ tool: { id: "tu_1", name: "boom", input: {} } }, { text: ["Sorry, no."] }]);
    const e = await events(res);
    expect(e.at(-1)).toEqual({ type: "done", truncated: false });
    expect(model.calls[1].body.messages[2].content).toEqual([{ type: "tool_result", tool_use_id: "tu_1", is_error: true, content: "no such term" }]);
  });

  it("shortens a very long tool result", async () => {
    const s = await setup();
    const big = fakeKit({ run: () => ({ text: "x".repeat(20_000) }) }).kit;
    const { res, model } = await tutor(s, [{ tool: { id: "tu_1", name: "lookup_term", input: {} } }, { text: ["ok"] }], { kit: big });
    await events(res);
    const content = model.calls[1].body.messages[2].content[0].content as string;
    expect(content.length).toBeLessThan(8_100);
    expect(content.endsWith("...(cut)")).toBe(true);
  });

  it("makes the last round an answer, and ends with an error if the model still asks for a tool", async () => {
    const s = await setup();
    const tool = { tool: { id: "tu_1", name: "lookup_term", input: { name: "a" } } };
    const { res, model } = await tutor(s, [tool, tool, tool], { env: { TUTOR_MAX_ROUNDS: "2" } });
    const e = await events(res);
    expect(model.calls).toHaveLength(2);
    expect(model.calls[0].body).not.toHaveProperty("tool_choice");
    expect(model.calls[1].body.tool_choice).toEqual({ type: "none" });
    expect(e.at(-1)).toMatchObject({ type: "error", code: "unavailable" });
    expect(log(s)[0]).toMatchObject({ outcome: "error", rounds: 2 });
  });
});

describe("POST /api/tutor: budgets", () => {
  it("refuses a device that has used its budget, with 429 and the time until tomorrow, before calling the model", async () => {
    const s = await setup();
    const env = { DEVICE_DAILY_BUDGET_USD: "0.05", RESERVE_USD: "0.05" };
    const first = await tutor(s, [{ text: ["ok"] }], { env });
    await events(first.res);
    const { res, model } = await tutor(s, [{ text: ["ok"] }], { env });
    expect(res.status).toBe(429);
    const error = (await json(res)).error;
    expect(error).toMatchObject({ code: "rate_limited", message: "this device has used its budget for today", scope: "device" });
    expect(error.resetsAt).toBe(new Date(NOW.getTime() + 14 * 3600 * 1000).toISOString()); // the next UTC midnight
    expect(res.headers.get("retry-after")).toBe(String(14 * 3600));
    expect(model.calls).toHaveLength(0);
    // the refused question left nothing held
    expect(counters(s)).toEqual({ global: [400, 1], device: [400, 1] });
  });

  it("refuses everybody when the day's global budget is used, and says so", async () => {
    const s = await setup();
    const env = { GLOBAL_DAILY_BUDGET_USD: "0.05", RESERVE_USD: "0.05" };
    await events((await tutor(s, [{ text: ["ok"] }], { env })).res);
    // another device of the same study group
    const device = newDeviceId();
    const headers = s.headers({ [HEADER.device]: device, [HEADER.proof]: await makeProof(s.key, device) });
    const { res, model } = await tutor(s, [{ text: ["ok"] }], { env, headers });
    expect(res.status).toBe(429);
    expect((await json(res)).error).toMatchObject({ message: "the budget for today is used", scope: "global" });
    expect(model.calls).toHaveLength(0);
  });

  it("lets a device ask again after a cheap answer freed what was held", async () => {
    const s = await setup();
    const env = { DEVICE_DAILY_BUDGET_USD: "0.06", RESERVE_USD: "0.05" };
    for (let i = 0; i < 3; i++) {
      const { res } = await tutor(s, [{ text: ["ok"] }], { env });
      expect(res.status).toBe(200);
      await events(res);
    }
    expect(counters(s).device).toEqual([1200, 3]);
  });

  it("charges the cost of a long answer even when it is more than was held", async () => {
    const s = await setup();
    const { res } = await tutor(s, [{ text: ["ok"], usage: { input: 20_000, output: 6000 } }]);
    await events(res);
    expect(counters(s).device).toEqual([20_000 * 2 + 6000 * 10, 1]);
  });
});

describe("POST /api/tutor: when the model call fails", () => {
  const failing = async (round: Round) => {
    const s = await setup();
    const { res } = await tutor(s, [round]);
    // the answer has started by the time the failure is known, so the status is 200 and the last event is the error
    expect(res.status).toBe(200);
    return { s, last: (await events(res)).at(-1) };
  };

  it("passes on that the model is busy (429)", async () => {
    const { last, s } = await failing({ error: { status: 429, type: "rate_limit_error" } });
    expect(last).toEqual({ type: "error", code: "rate_limited", message: "The model is busy." });
    expect(counters(s)).toEqual({ global: [0, 1], device: [0, 1] });
    expect(log(s)[0]).toMatchObject({ outcome: "error", micro: 0 });
  });

  it("passes on that the model is overloaded (529) as the same", async () => {
    expect((await failing({ error: { status: 529, type: "overloaded_error" } })).last).toMatchObject({ code: "rate_limited" });
  });

  it("passes on that the conversation is too long (413)", async () => {
    expect((await failing({ error: { status: 413, type: "request_too_large" } })).last).toMatchObject({ code: "prompt_too_large" });
  });

  it("does not repeat what the API said (an invalid key, a server error) to the page", async () => {
    for (const status of [401, 500]) {
      const { last } = await failing({ error: { status, type: "api_error" } });
      expect(last).toEqual({ type: "error", code: "unavailable", message: "The tutor could not answer." });
      expect(JSON.stringify(last)).not.toContain("scripted");
    }
  });

  it("passes on a refusal after the text it had given, and charges the tokens", async () => {
    const s = await setup();
    const { res } = await tutor(s, [{ text: ["I"], stop: "refusal", usage: { input: 100, output: 5 } }]);
    const e = await events(res);
    expect(e.map((x) => x.type)).toEqual(["delta", "error"]);
    expect(e.at(-1)).toMatchObject({ code: "refused" });
    expect(log(s)[0]).toMatchObject({ outcome: "refused", micro: 250 });
  });
});

describe("POST /api/tutor: when the page goes away", () => {
  it("stops the model call and charges for what had been used", async () => {
    const s = await setup();
    const { res, model } = await tutor(s, [{ text: ["partial answer"], hang: true, usage: { input: 100 } }]);
    const reader = res.body!.getReader();
    expect((await reader.read()).done).toBe(false);
    await reader.cancel();
    await vi.waitFor(() => expect(log(s)).toHaveLength(1));
    expect(model.calls).toHaveLength(1);
    // 100 input tokens, and the output estimated from the 14 characters that were sent: at least 5 tokens
    expect(log(s)[0].outcome).toBe("aborted");
    expect(log(s)[0].micro).toBeGreaterThanOrEqual(100 * 2 + 5 * 10);
    expect(counters(s).device![0]).toBe(log(s)[0].micro);
  });
});

describe("the closing event", () => {
  it("still ends with an outcome (and the cost of the answer) when the page leaves before it can be written", async () => {
    const model = fakeAnthropic([{ text: ["a full answer"], usage: { input: 100, output: 20 } }]);
    const client = new Anthropic({ apiKey: "test", fetch: model.fetch, maxRetries: 0 });
    const emit = async (e: { type: string }) => {
      if (e.type === "done") throw new Error("the stream is closed");
    };
    const out = await runTutor({ client, kit: fakeKit().kit, config: readConfig({} as Env), request: { kind: "explain", cats: [], turns: [{ role: "user", content: "x" }] }, emit, signal: new AbortController().signal });
    expect(out.outcome).toBe("aborted");
    expect(out.micro).toBeGreaterThanOrEqual(100 * 2 + 20 * 10);
  });
});

describe("POST /api/tutor: a failure after a tool round", () => {
  it("adds this round's partial output to the earlier rounds' instead of replacing them", async () => {
    const s = await setup();
    const { res, model } = await tutor(s, [
      { text: ["Let me look. "], tool: { id: "tu_1", name: "lookup_term", input: { name: "form" } }, usage: { input: 100, output: 500 } },
      { text: ["partial answer"], hang: true, usage: { input: 100 } },
    ]);
    const reader = res.body!.getReader();
    for (let i = 0; i < 2; i++) await reader.read();
    await reader.cancel();
    await vi.waitFor(() => expect(log(s)).toHaveLength(1));
    expect(model.calls).toHaveLength(2);
    expect(log(s)[0].outcome).toBe("aborted");
    // 200 input tokens, the first round's 500 output tokens, and this round's 14 characters (5 tokens) at least
    expect(log(s)[0].micro).toBeGreaterThanOrEqual(200 * 2 + 505 * 10);
  });
});

describe("other paths", () => {
  it("answers 404 for an unknown path under /api", async () => {
    const s = await setup();
    const res = await createApp({ kit: async () => null }).request("/api/nothing", {}, s.env);
    expect(res.status).toBe(404);
  });

  it("hands anything else to the static site", async () => {
    const s = await setup();
    const res = await createApp({ kit: async () => null }).request("/index.html", {}, s.env);
    expect(await res.text()).toBe("asset");
  });
});
