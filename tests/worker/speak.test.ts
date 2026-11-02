// Reading aloud (worker/speak.ts and POST /api/speak), end to end with stand-ins for D1 and Google's Text-to-Speech.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../../worker/app";
import { SPEAK_MICRO_PER_CHAR } from "../../worker/config";
import { parseSpeak } from "../../worker/speak";
import { HEADER, SPEAK } from "../../src/ai/protocol";
import { NOW, fakeKit, json, setup } from "./support";
import type { Env } from "../../worker/env";

type Setup = Awaited<ReturnType<typeof setup>>;
const KEY = "google-test-key";
const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 1, 2, 3, 4]);

/** A stand-in for Google: it keeps what it was asked and answers as scripted (`status` for an error, `body` for an answer in another form). */
function fakeGoogle(over: { status?: number; body?: unknown; hang?: boolean } = {}) {
  const calls: { url: string; headers: Headers; body: any }[] = [];
  const fetch = (async (input: Request | string | URL, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    calls.push({ url: req.url, headers: req.headers, body: JSON.parse(await req.clone().text()) });
    if (over.hang) throw new TypeError("terminated");
    if (over.status) return new Response(JSON.stringify({ error: { message: "scripted" } }), { status: over.status });
    return new Response(JSON.stringify(over.body ?? { audioContent: btoa(String.fromCharCode(...MP3)) }), { headers: { "content-type": "application/json" } });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

async function speak(s: Setup, over: { google?: ReturnType<typeof fakeGoogle>; body?: unknown; headers?: Record<string, string>; env?: Partial<Env> } = {}) {
  const google = over.google ?? fakeGoogle();
  const app = createApp({ kit: async () => fakeKit().kit, fetch: google.fetch, now: () => NOW });
  const body = over.body === undefined ? { text: "Is a pot a product?" } : over.body;
  const res = await app.request("/api/speak", { method: "POST", headers: over.headers ?? s.headers(), body: typeof body === "string" ? body : JSON.stringify(body) }, { ...s.env, ...over.env });
  return { res, google };
}
const counters = (s: Setup) => s.db.sql<{ scope: string; micro: number; calls: number }>("SELECT scope, micro, calls FROM budget ORDER BY scope");
const log = (s: Setup) => s.db.sql<{ kind: string; model: string; micro: number; outcome: string }>("SELECT kind, model, micro, outcome FROM usage_log");
const on = (extra: Partial<Env> = {}) => setup({ GOOGLE_TTS_API_KEY: KEY, ...extra });

beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

describe("parseSpeak", () => {
  it("takes the text with its white space collapsed, and the default voice when none is named", () => {
    expect(parseSpeak({ text: "  Is a pot\n\na   product? \u0007" })).toEqual({ ok: true, request: { text: "Is a pot a product?", voice: SPEAK.default } });
  });
  it.each(SPEAK.voices.map((v) => v.id))("takes the voice %s", (id) => {
    expect(parseSpeak({ text: "x", voice: id })).toEqual({ ok: true, request: { text: "x", voice: id } });
  });
  it.each([
    ["no object", null],
    ["a list", "text"],
    ["no text", {}],
    ["text that is not a string", { text: 4 }],
    ["only white space", { text: " \n\t " }],
    ["too long a text", { text: "a".repeat(SPEAK.chars + 1) }],
    ["a voice that is not offered", { text: "x", voice: "en-US-Chirp3-HD-Puck" }],
    ["a voice that is not a string", { text: "x", voice: 3 }],
  ])("refuses %s", (_n, body) => {
    expect(parseSpeak(body).ok).toBe(false);
  });
  it("takes the longest text that is allowed", () => {
    expect(parseSpeak({ text: "a".repeat(SPEAK.chars) }).ok).toBe(true);
  });
});

describe("GET /api/health", () => {
  const health = async (env: Partial<Env>) => {
    const s = await setup(env);
    return (await createApp({ kit: async () => fakeKit().kit, now: () => NOW }).request("/api/health", {}, s.env)).json();
  };
  it("offers reading aloud when the Google key, the database and the Magic Key are there, and says nothing of it otherwise", async () => {
    expect(await health({ GOOGLE_TTS_API_KEY: KEY })).toMatchObject({ speak: "on" });
    expect(await health({})).not.toHaveProperty("speak");
    expect(await health({ GOOGLE_TTS_API_KEY: KEY, DB: undefined })).not.toHaveProperty("speak");
    expect(await health({ GOOGLE_TTS_API_KEY: KEY, RIGLAM_DATA_KEY: undefined })).not.toHaveProperty("speak");
  });
  it("offers it with the tutor off (they are separate), and not when the switch in the database is off", async () => {
    expect(await health({ GOOGLE_TTS_API_KEY: KEY, ANTHROPIC_API_KEY: undefined })).toMatchObject({ tutor: "off", speak: "on" });
    const s = await on();
    const app = createApp({ kit: async () => fakeKit().kit, now: () => NOW });
    await s.env.DB!.prepare("INSERT INTO settings (key, value) VALUES ('speak', 'off')").run();
    expect(await (await app.request("/api/health", {}, s.env)).json()).not.toHaveProperty("speak");
    expect(await (await app.request("/api/health", {}, s.env)).json()).toMatchObject({ tutor: "on" });
  });
});

describe("POST /api/speak", () => {
  it("answers with the audio as Google made it, in the voice asked for, and asks Google as the app's own page", async () => {
    const s = await on();
    const { res, google } = await speak(s, { body: { text: "Is a pot a product?", voice: "kore" } });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(MP3);
    expect(google.calls).toHaveLength(1);
    const call = google.calls[0];
    expect(call.url).toBe("https://texttospeech.googleapis.com/v1/text:synthesize");
    expect(call.headers.get("x-goog-api-key")).toBe(KEY);
    expect(call.headers.get("referer")).toBe("http://localhost/");
    expect(call.body).toEqual({ input: { text: "Is a pot a product?" }, voice: { languageCode: "en-US", name: "en-US-Chirp3-HD-Kore" }, audioConfig: { audioEncoding: "MP3" } });
  });

  it("uses Charon when no voice is named", async () => {
    const s = await on();
    const { google } = await speak(s);
    expect(google.calls[0].body.voice.name).toBe("en-US-Chirp3-HD-Charon");
  });

  it("counts the characters against the device's and everybody's day, and writes a line of the usage log without the text", async () => {
    const s = await on();
    await speak(s, { body: { text: "Is a pot a product?" } });
    const n = "Is a pot a product?".length * SPEAK_MICRO_PER_CHAR;
    expect(counters(s)).toEqual([
      { scope: "speak", micro: n, calls: 1 },
      { scope: `speak:dev:${s.device}`, micro: n, calls: 1 },
    ]);
    expect(log(s)).toEqual([{ kind: "speak", model: "en-US-Chirp3-HD-Charon", micro: n, outcome: "answered" }]);
    expect(JSON.stringify(s.db.sql("SELECT * FROM usage_log"))).not.toContain("pot a product");
  });

  it("does not touch the tutor's counters", async () => {
    const s = await on();
    await speak(s);
    expect(counters(s).some((r) => r.scope === "global" || r.scope.startsWith("dev:"))).toBe(false);
  });

  it("gives the characters back when Google fails, and says the voice is not available", async () => {
    const s = await on();
    const { res } = await speak(s, { google: fakeGoogle({ status: 503 }) });
    expect(res.status).toBe(503);
    expect((await json(res)).error.code).toBe("unavailable");
    expect(counters(s).map((r) => r.micro)).toEqual([0, 0]);
    expect(log(s)).toEqual([{ kind: "speak", model: "en-US-Chirp3-HD-Charon", micro: 0, outcome: "failed 503" }]);
  });

  it.each([
    ["Google cannot be reached", { hang: true }],
    ["Google answers with no audio", { body: { audioContent: "" } }],
    ["Google answers with something else", { body: { error: "no" } }],
    ["Google refuses the key", { status: 403 }],
  ])("is unavailable when %s, and keeps no characters", async (_n, over) => {
    const s = await on();
    const { res } = await speak(s, { google: fakeGoogle(over) });
    expect(res.status).toBe(503);
    expect(counters(s).map((r) => r.micro)).toEqual([0, 0]);
  });

  it("never writes the key or the text into the logs", async () => {
    const s = await on();
    await speak(s, { google: fakeGoogle({ status: 403 }), body: { text: "a secret sentence" } });
    expect(JSON.stringify((console.error as unknown as { mock: { calls: unknown[] } }).mock.calls)).not.toMatch(/google-test-key|secret sentence/);
  });

  it("stops a device at its day's characters, and says whose limit it was", async () => {
    const s = await on({ SPEAK_DEVICE_DAILY_CHARS: "30", SPEAK_GLOBAL_DAILY_CHARS: "1000" });
    const text = "x".repeat(20);
    expect((await speak(s, { body: { text } })).res.status).toBe(200);
    const { res, google } = await speak(s, { body: { text } });
    expect(res.status).toBe(429);
    const body = await json(res);
    expect(body.error).toMatchObject({ code: "rate_limited", scope: "device", resetsAt: "2026-10-14T00:00:00.000Z" });
    expect(Number(res.headers.get("retry-after"))).toBe(14 * 3600);
    expect(google.calls).toHaveLength(0);
  });

  it("stops everybody at the day's characters, and gives the device's hold back", async () => {
    const s = await on({ SPEAK_DEVICE_DAILY_CHARS: "1000", SPEAK_GLOBAL_DAILY_CHARS: "30" });
    expect((await speak(s, { body: { text: "x".repeat(20) } })).res.status).toBe(200);
    const { res } = await speak(s, { body: { text: "x".repeat(20) } });
    expect(res.status).toBe(429);
    expect((await json(res)).error.scope).toBe("global");
    expect(counters(s).find((r) => r.scope === `speak:dev:${s.device}`)?.micro).toBe(20 * SPEAK_MICRO_PER_CHAR);
  });

  it("refuses a request without the proof, with a wrong one, or from another origin, before Google is asked", async () => {
    const s = await on();
    const google = fakeGoogle();
    const none = await speak(s, { google, headers: { "content-type": "application/json" } });
    expect(none.res.status).toBe(401);
    const wrong = await speak(s, { google, headers: s.headers({ [HEADER.proof]: "0".repeat(64) }) });
    expect(wrong.res.status).toBe(401);
    const origin = await speak(s, { google, headers: s.headers({ origin: "https://evil.example" }) });
    expect(origin.res.status).toBe(403);
    expect(google.calls).toHaveLength(0);
    expect(counters(s).filter((r) => r.scope.startsWith("speak"))).toEqual([]);
  });

  it("is unavailable without the Google key, and when the switch in the database is off", async () => {
    const s = await setup();
    expect((await speak(s)).res.status).toBe(503);
    const t = await on();
    await t.env.DB!.prepare("INSERT INTO settings (key, value) VALUES ('speak', 'off')").run();
    const { res, google } = await speak(t);
    expect(res.status).toBe(503);
    expect((await json(res)).error.code).toBe("unavailable");
    expect(google.calls).toHaveLength(0);
  });

  it.each([
    ["a body that is not JSON", "not json"],
    ["no text", {}],
    ["a voice that is not offered", { text: "x", voice: "puck" }],
    ["a text that is too long", { text: "x".repeat(SPEAK.chars + 1) }],
  ])("refuses %s as a bad request and holds nothing back", async (_n, body) => {
    const s = await on();
    const { res, google } = await speak(s, { body });
    expect(res.status).toBe(400);
    expect(google.calls).toHaveLength(0);
    expect(counters(s)).toEqual([]);
  });

  it("refuses a body that is too large", async () => {
    const s = await on();
    const { res } = await speak(s, { body: JSON.stringify({ text: "x".repeat(SPEAK.body + 1) }) });
    expect(res.status).toBe(413);
  });
});
