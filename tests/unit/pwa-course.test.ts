// The PWA's request for the definitions (src/pwa/course.ts): the proof it sends, the answers it understands, and the sentences for the prompt.
import { describe, expect, it } from "vitest";
import { HEADER } from "../../src/ai/protocol";
import { DEVICE_ID, checkProof } from "../../src/ai/proof";
import { fetchCourse, whyNot } from "../../src/pwa/course";
import { testMagicKey } from "../support/magic-key";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const ask = (respond: (url: string, init: RequestInit) => Response | Promise<Response>, have?: string) => {
  const key = testMagicKey();
  const seen: { url: string; init: RequestInit }[] = [];
  const doFetch = (async (url: string, init: RequestInit) => (seen.push({ url, init }), respond(url, init))) as unknown as typeof fetch;
  return { key, seen, got: () => fetchCourse(key, have, doFetch, () => "d".repeat(22)) };
};

describe("fetchCourse", () => {
  it("sends the device id and a proof the server can check, never the key", async () => {
    const { key, seen, got } = ask(() => json(200, { version: "v1", definitions: { Form: { d: "x" } } }));
    expect(await got()).toEqual({ ok: true, version: "v1", definitions: { Form: { d: "x" } } });
    const headers = seen[0].init.headers as Record<string, string>;
    expect(seen[0].url).toBe("/api/course");
    expect(headers[HEADER.device]).toMatch(DEVICE_ID);
    expect(await checkProof(key, headers[HEADER.device], headers[HEADER.proof])).toBe(true);
    expect(JSON.stringify(seen[0])).not.toContain(key);
  });

  it("names the kept version, and understands that it is current", async () => {
    const { seen, got } = ask(() => json(200, { version: "v1", unchanged: true }), "v1");
    expect(await got()).toEqual({ ok: true, version: "v1", unchanged: true });
    expect(seen[0].url).toBe("/api/course?have=v1");
  });

  it("tells a key that does not fit, too many tries (with the time), a server that is down, a page that is not the server, and no connection apart", async () => {
    expect(await ask(() => json(401, { error: { code: "not_granted" } })).got()).toEqual({ ok: false, reason: "not_granted" });
    expect(await ask(() => json(429, { error: { code: "rate_limited", resetsAt: "2026-10-15T13:00:00Z" } })).got()).toEqual({ ok: false, reason: "rate_limited", resetsAt: "2026-10-15T13:00:00.000Z" });
    expect(await ask(() => json(503, { error: { code: "unavailable" } })).got()).toEqual({ ok: false, reason: "unavailable" });
    expect(await ask(() => new Response("<html>", { status: 200 })).got()).toEqual({ ok: false, reason: "unavailable" });
    expect(await ask(() => { throw new TypeError("offline"); }).got()).toEqual({ ok: false, reason: "offline" });
  });
});

describe("whyNot", () => {
  it("gives a sentence for each reason, with the wait in minutes", () => {
    const now = () => new Date("2026-10-15T12:30:00Z");
    expect(whyNot({ ok: false, reason: "not_granted" })).toMatch(/not the Magic Key/);
    expect(whyNot({ ok: false, reason: "rate_limited", resetsAt: "2026-10-15T13:00:00Z" }, now)).toBe("Too many tries from this network. Try again in 30 minutes.");
    expect(whyNot({ ok: false, reason: "rate_limited", resetsAt: "2026-10-15T12:30:20Z" }, now)).toMatch(/in 1 minute\./);
    expect(whyNot({ ok: false, reason: "rate_limited" })).toMatch(/later/);
    expect(whyNot({ ok: false, reason: "offline" })).toMatch(/online/);
    expect(whyNot({ ok: false, reason: "unavailable" })).toMatch(/Try again later/);
  });
});
