// The PWA's `speak` capability (src/pwa/speak.ts): the request it makes to the server and the way every failure reaches the page as an error with a `code`.
// The server is a fake `fetch`; worker/ has its own tests.
import { describe, expect, it } from "vitest";
import { testMagicKey as generateKey } from "../support/magic-key";
import { HEADER, SPEAK } from "../../src/ai/protocol";
import { checkProof } from "../../src/ai/proof";
import { createSpeaker } from "../../src/pwa/speak";

const MP3 = new Uint8Array([0xff, 0xfb, 0x90, 0x00, 1, 2, 3]);
const audio = () => new Response(MP3, { status: 200, headers: { "content-type": "audio/mpeg" } });
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const speakerWith = (key: string, respond: (init: RequestInit) => Response | Promise<Response>) => {
  const seen: { url: string; init: RequestInit }[] = [];
  const doFetch = (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return respond(init);
  }) as unknown as typeof fetch;
  return { speaker: createSpeaker(key, doFetch, () => "d".repeat(22)), seen };
};
const rejection = async (p: Promise<unknown>) => p.then(() => null, (e: Error & { code?: string; budget?: boolean; scope?: string; resetsAt?: string }) => e);

describe("createSpeaker", () => {
  it("lists the server's voices, Charon first", () => {
    const { speaker } = speakerWith(generateKey(), audio);
    expect(speaker.voices.map((v) => v.id)).toEqual(["charon", "kore", "achird", "sulafat"]);
    expect(speaker.voices.map((v) => v.name)).toEqual(["Charon", "Kore", "Achird", "Sulafat"]);
    expect(speaker.voices[0].id).toBe(SPEAK.default);
  });

  it("asks /api/speak with the device and a proof of the key, and gives the audio back", async () => {
    const key = generateKey();
    const { speaker, seen } = speakerWith(key, audio);
    const blob = await speaker.clip("Is a pot a product?", "kore");
    expect(blob.type).toBe("audio/mpeg");
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(MP3);
    expect(seen).toHaveLength(1);
    expect(seen[0].url).toBe("/api/speak");
    const headers = seen[0].init.headers as Record<string, string>;
    expect(headers[HEADER.device]).toBe("d".repeat(22));
    expect(await checkProof(key, headers[HEADER.device], headers[HEADER.proof])).toBe(true);
    expect(JSON.parse(String(seen[0].init.body))).toEqual({ text: "Is a pot a product?", voice: "kore" });
    expect(JSON.stringify(seen[0].init)).not.toContain(key);
  });

  it("asks for the default voice when it is given one the server does not have", async () => {
    const { speaker, seen } = speakerWith(generateKey(), audio);
    await speaker.clip("x", "puck");
    expect(JSON.parse(String(seen[0].init.body)).voice).toBe(SPEAK.default);
  });

  it("gives the clip a type when the server's answer has none", async () => {
    const { speaker } = speakerWith(generateKey(), () => new Response(MP3));
    expect((await speaker.clip("x", "charon")).type).toBe("audio/mpeg");
  });

  it("says a used-up day as rate_limited, whose it was and when it starts again", async () => {
    const { speaker } = speakerWith(generateKey(), () => json(429, { error: { code: "rate_limited", message: "m", scope: "device", resetsAt: "2026-11-03T00:00:00.000Z" } }));
    const e = await rejection(speaker.clip("x", "charon"));
    expect(e).toMatchObject({ code: "rate_limited", budget: true, scope: "device", resetsAt: "2026-11-03T00:00:00.000Z" });
  });

  it.each([
    [401, { error: { code: "not_granted", message: "m" } }, "not_granted"],
    [503, { error: { code: "unavailable", message: "m" } }, "unavailable"],
    [400, { error: { code: "bad_request", message: "m" } }, "bad_request"],
    [502, "<html>", "unavailable"],
  ])("says a %s answer as %s", async (status, body, code) => {
    const { speaker } = speakerWith(generateKey(), () => (typeof body === "string" ? new Response(body, { status }) : json(status, body)));
    expect(await rejection(speaker.clip("x", "charon"))).toMatchObject({ code });
  });

  it("says an empty answer as unavailable", async () => {
    const { speaker } = speakerWith(generateKey(), () => new Response(new Uint8Array(), { status: 200 }));
    expect(await rejection(speaker.clip("x", "charon"))).toMatchObject({ code: "unavailable" });
  });

  it("says no connection as offline, and a cancelled request as cancelled", async () => {
    const off = speakerWith(generateKey(), () => {
      throw new TypeError("Failed to fetch");
    });
    expect(await rejection(off.speaker.clip("x", "charon"))).toMatchObject({ code: "offline" });
    const gone = speakerWith(generateKey(), () => {
      throw new DOMException("aborted", "AbortError");
    });
    expect(await rejection(gone.speaker.clip("x", "charon"))).toMatchObject({ code: "cancelled" });
  });
});
