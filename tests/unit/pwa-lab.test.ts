// The PWA's check-lab client (src/pwa/lab.ts): whether the server answers the lab, the request it makes, and how every failure reaches the page
// as an error with a `code`. The server is a fake `fetch`; worker/lab.ts has its own tests.
import { describe, expect, it } from "vitest";
import { testMagicKey as generateKey } from "../support/magic-key";
import { HEADER } from "../../src/ai/protocol";
import { DEVICE_ID, checkProof } from "../../src/ai/proof";
import { createLab, labIsOn } from "../../src/pwa/lab";

const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const labWith = (key: string, respond: (init: RequestInit) => Response | Promise<Response>) => {
  const seen: { url: string; init: RequestInit }[] = [];
  const doFetch = (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return respond(init);
  }) as unknown as typeof fetch;
  return { call: createLab(key, doFetch, () => "d".repeat(22)), seen };
};
const rejection = async (p: Promise<unknown>) => p.then(() => null, (e: Error & { code?: string; budget?: boolean; scope?: string }) => e);
const healthOf = (body: unknown, status = 200) => (async () => json(status, body)) as unknown as typeof fetch;

describe("whether the server answers the lab", () => {
  it("is yes only when the health answer says lab is on", async () => {
    expect(await labIsOn(healthOf({ ok: true, tutor: "on", lab: "on" }))).toBe(true);
    expect(await labIsOn(healthOf({ ok: true, tutor: "on" }))).toBe(false);
    expect(await labIsOn(healthOf({ ok: true, tutor: "on", lab: "off" }))).toBe(false);
    expect(await labIsOn(healthOf({ ok: false, lab: "on" }))).toBe(false);
    expect(await labIsOn(healthOf({ ok: true, lab: "on" }, 503))).toBe(false);
  });

  it("is no when the server cannot be reached, answers with something else, or is too slow", async () => {
    expect(await labIsOn((async () => { throw new TypeError("offline"); }) as unknown as typeof fetch)).toBe(false);
    expect(await labIsOn((async () => new Response("<html>", { status: 200 })) as unknown as typeof fetch)).toBe(false);
    const hang = ((_u: string, init: RequestInit) => new Promise((_r, reject) => init.signal!.addEventListener("abort", () => reject(new DOMException("x", "AbortError"))))) as unknown as typeof fetch;
    expect(await labIsOn(hang, 20)).toBe(false);
  });
});

describe("the request", () => {
  it("posts the model, the effort and the prompt with the device id and a proof the server can check, and never sends the key", async () => {
    const key = generateKey();
    const { call, seen } = labWith(key, () => json(200, { text: "{}", truncated: false, modelApplied: "claude-haiku-5-5" }));
    await call("TASK CASE", { model: "claude-haiku-5-5", effort: "high", modelTier: "quick", cache: false });
    expect(seen).toHaveLength(1);
    const { url, init } = seen[0];
    expect(url).toBe("/api/lab");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers[HEADER.device]).toMatch(DEVICE_ID);
    expect(await checkProof(key, headers[HEADER.device], headers[HEADER.proof])).toBe(true);
    expect(JSON.parse(init.body as string)).toEqual({ model: "claude-haiku-5-5", effort: "high", prompt: "TASK CASE" });
    expect(JSON.stringify([init.headers, init.body])).not.toContain(key);
  });

  it("asks for medium effort when none is named", async () => {
    const { call, seen } = labWith(generateKey(), () => json(200, { text: "{}", truncated: false, modelApplied: "claude-sonnet-5-5" }));
    await call("x", { model: "claude-sonnet-5-5" });
    expect(JSON.parse(seen[0].init.body as string).effort).toBe("medium");
  });
});

describe("the answer", () => {
  it("gives the text, whether it was cut short, and the model that answered", async () => {
    const { call } = labWith(generateKey(), () => json(200, { text: '{"things":[]}', truncated: true, modelApplied: "claude-opus-5-5" }));
    expect(await call("x", { model: "claude-opus-5-5" })).toEqual({ text: '{"things":[]}', truncated: true, modelApplied: "claude-opus-5-5" });
  });

  it("is an error when the answer is not what the lab expects", async () => {
    for (const reply of [() => new Response("nope", { status: 200 }), () => json(200, { nothing: 1 }), () => json(200, null)]) {
      const e = await rejection(labWith(generateKey(), reply).call("x", { model: "claude-opus-5-5" }));
      expect(e?.code).toBe("unavailable");
    }
  });
});

describe("failures reach the page as an error with a code", () => {
  it.each([
    [401, { error: { code: "not_granted", message: "x" } }, "not_granted", false],
    [429, { error: { code: "rate_limited", message: "x", scope: "device" } }, "rate_limited", true],
    [413, { error: { code: "prompt_too_large", message: "x" } }, "prompt_too_large", false],
    [400, { error: { code: "bad_request", message: "x" } }, "bad_request", false],
    [503, { error: { code: "unavailable", message: "the lab is off" } }, "unavailable", false],
    [503, { error: { code: "rate_limited", message: "busy" } }, "rate_limited", false], // a busy model is a wait, not a used-up budget
    [503, { error: { code: "refused", message: "x" } }, "refused", false],
  ])("maps the server's %s answer to %s", async (status, body, code, budget) => {
    const e = await rejection(labWith(generateKey(), () => json(status, body, status === 429 ? { "retry-after": "3600" } : {})).call("x", { model: "claude-opus-5-5" }));
    expect(e?.code).toBe(code);
    expect(!!e?.budget).toBe(budget);
  });

  it("is 'offline' when the server cannot be reached and 'cancelled' when the page gave up", async () => {
    const gone = createLab(generateKey(), (async () => { throw new TypeError("Failed to fetch"); }) as unknown as typeof fetch, () => "d".repeat(22));
    expect((await rejection(gone("x", { model: "claude-opus-5-5" })))?.code).toBe("offline");
    const stop = createLab(generateKey(), (async () => { throw new DOMException("aborted", "AbortError"); }) as unknown as typeof fetch, () => "d".repeat(22));
    expect((await rejection(stop("x", { model: "claude-opus-5-5" })))?.code).toBe("cancelled");
  });
});
