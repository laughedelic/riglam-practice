// The PWA's tutor client (src/pwa/tutor.ts): the request it makes, the way it reads the server-sent answer, and how every
// failure reaches the page as an error with a `code`. The server is a fake `fetch`; worker/ has its own tests.
import { afterEach, describe, expect, it, vi } from "vitest";
import { testMagicKey as generateKey } from "../support/magic-key";
import { HEADER, type QuorumRecord, type TutorEvent, type TutorRequest } from "../../src/ai/protocol";
import { DEVICE_ID, checkProof } from "../../src/ai/proof";
import { createKnown, createTutor, deviceId, quorumOffer, serverSays, tutorIsOn } from "../../src/pwa/tutor";

const request: TutorRequest = { kind: "chat", cats: ["form", "color"], turns: [{ role: "user", content: "CARD ум" }] };
const sse = (e: TutorEvent | { type: string }) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`;
const enc = new TextEncoder();

/** A response whose body arrives in the given chunks (strings or bytes), one per read, then ends, or breaks with an error. */
function streamOf(chunks: (string | Uint8Array)[], end: "close" | Error = "close", status = 200): Response {
  let i = 0;
  return new Response(
    new ReadableStream<Uint8Array>({
      pull(c) {
        if (i < chunks.length) {
          const ch = chunks[i++];
          c.enqueue(typeof ch === "string" ? enc.encode(ch) : ch);
        } else if (end === "close") c.close();
        else c.error(end);
      },
    }),
    { status, headers: { "content-type": "text/event-stream" } },
  );
}
const json = (status: number, body: unknown, headers: Record<string, string> = {}) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
const tutorWith = (key: string, respond: (init: RequestInit) => Response | Promise<Response>) => {
  const seen: { url: string; init: RequestInit }[] = [];
  const doFetch = (async (url: string, init: RequestInit) => {
    seen.push({ url, init });
    return respond(init);
  }) as unknown as typeof fetch;
  return { ask: createTutor(key, doFetch, () => "d".repeat(22)), seen };
};
const rejection = async (p: Promise<unknown>) => p.then(() => null, (e: Error & { code?: string; text?: string; budget?: boolean; scope?: string; resetsAt?: string }) => e);

afterEach(() => vi.unstubAllGlobals());

describe("the request", () => {
  it("posts the conversation with the device id and a proof the server can check, and never sends the key", async () => {
    const key = generateKey();
    const { ask, seen } = tutorWith(key, () => streamOf([sse({ type: "done", truncated: false })]));
    await ask(request);
    expect(seen).toHaveLength(1);
    const { url, init } = seen[0];
    expect(url).toBe("/api/tutor");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers[HEADER.device]).toMatch(DEVICE_ID);
    expect(await checkProof(key, headers[HEADER.device], headers[HEADER.proof])).toBe(true);
    expect(await checkProof(generateKey(), headers[HEADER.device], headers[HEADER.proof])).toBe(false);
    expect(JSON.parse(init.body as string)).toEqual(request);
    expect(JSON.stringify([init.headers, init.body])).not.toContain(key);
  });
});

describe("the answer", () => {
  it("is read as it arrives, whatever the chunks cut through, and gives the text so far each time", async () => {
    const { ask } = tutorWith(generateKey(), () => {
      const all = enc.encode(sse({ type: "delta", text: "Это ум. " }) + sse({ type: "delta", text: "Mind is clear." }) + sse({ type: "done", truncated: false }));
      // cut at every awkward place: inside a multi-byte letter, inside a line, between the blank line's two newlines
      return streamOf([all.slice(0, 33), all.slice(33, 34), all.slice(34, 90), all.slice(90, 91), all.slice(91)]);
    });
    const partial: string[] = [];
    const r = await ask(request, { onText: ({ text }) => partial.push(text) });
    expect(r).toEqual({ text: "Это ум. Mind is clear.", truncated: false });
    expect(partial).toEqual(["Это ум. ", "Это ум. Mind is clear."]);
  });

  it("says when the model ran out of room", async () => {
    const { ask } = tutorWith(generateKey(), () => streamOf([sse({ type: "delta", text: "Long" }), sse({ type: "done", truncated: true })]));
    expect(await ask(request)).toEqual({ text: "Long", truncated: true });
  });

  it("ignores comment lines, events it does not know and a carriage return before each newline", async () => {
    const { ask } = tutorWith(generateKey(), () =>
      streamOf([": keep-alive\n\n", sse({ type: "mystery" }), "event: delta\r\ndata: {\"type\":\"delta\",\"text\":\"ok\"}\r\n\r\n", "data: not json\n\n", sse({ type: "done", truncated: false })]),
    );
    expect(await ask(request)).toEqual({ text: "ok", truncated: false });
  });

  it("sends the Quorum flag with the question, reports each step as it comes, and returns the record with the text", async () => {
    const record: QuorumRecord = { id: "r1", models: [{ name: "Haiku", model: "claude-haiku-5-5", text: "x", ok: true, ms: 10 }], judge: null, shown: "Haiku", why: null };
    const { ask, seen } = tutorWith(generateKey(), () => streamOf([sse({ type: "step", name: "Haiku", ok: true }), sse({ type: "step", name: "Opus", ok: false }), sse({ type: "delta", text: "x" }), sse({ type: "quorum", record }), sse({ type: "done", truncated: false })]));
    const steps: { name: string; ok: boolean }[] = [];
    const r = await ask({ ...request, kind: "explain", quorum: true }, { onStep: (s) => steps.push(s) });
    expect(JSON.parse(seen[0].init.body as string)).toMatchObject({ kind: "explain", quorum: true });
    expect(steps).toEqual([{ name: "Haiku", ok: true }, { name: "Opus", ok: false }]);
    expect(r).toEqual({ text: "x", truncated: false, quorum: record });
  });

  it("says when Quorum was asked for but the one model answered", async () => {
    const { ask } = tutorWith(generateKey(), () => streamOf([sse({ type: "single", why: "budget" }), sse({ type: "delta", text: "x" }), sse({ type: "done", truncated: false })]));
    expect(await ask({ ...request, quorum: true })).toEqual({ text: "x", truncated: false, single: "budget" });
  });

  it("takes a last event that has no blank line after it", async () => {
    const { ask } = tutorWith(generateKey(), () => streamOf([sse({ type: "delta", text: "a" }), 'data: {"type":"done","truncated":false}']));
    expect(await ask(request)).toEqual({ text: "a", truncated: false });
  });
});

describe("failures reach the page as an error with a code", () => {
  it("keeps what arrived when the server reports an error inside the answer", async () => {
    const { ask } = tutorWith(generateKey(), () => streamOf([sse({ type: "delta", text: "Half an" }), sse({ type: "error", code: "rate_limited", message: "busy" })]));
    const e = await rejection(ask(request));
    expect(e).toMatchObject({ code: "rate_limited", text: "Half an", message: "busy" });
    expect(e?.budget).toBeUndefined(); // the model is busy; no daily budget is meant
  });

  it("reports an error before any text without a text", async () => {
    const { ask } = tutorWith(generateKey(), () => streamOf([sse({ type: "error", code: "refused", message: "no" })]));
    const e = await rejection(ask(request));
    expect(e?.code).toBe("refused");
    expect(e?.text).toBeUndefined();
  });

  it("falls back to unavailable for a code it does not know", async () => {
    const { ask } = tutorWith(generateKey(), () => streamOf([sse({ type: "error", code: "something_new", message: "x" } as never)]));
    expect((await rejection(ask(request)))?.code).toBe("unavailable");
  });

  it.each([
    [401, { error: { code: "not_granted", message: "x" } }, "not_granted", false],
    [429, { error: { code: "rate_limited", message: "x" } }, "rate_limited", true],
    [413, { error: { code: "prompt_too_large", message: "x" } }, "prompt_too_large", false],
    [400, { error: { code: "bad_request", message: "x" } }, "bad_request", false],
    [503, { error: { code: "unavailable", message: "x" } }, "unavailable", false],
    [503, { error: { code: "refused", message: "x" } }, "refused", false],
    [403, { error: { code: "not_granted", message: "wrong origin" } }, "not_granted", false],
  ])("maps the server's %s answer to %s", async (status, body, code, budget) => {
    const { ask } = tutorWith(generateKey(), () => json(status, body, status === 429 ? { "retry-after": "3600" } : {}));
    const e = await rejection(ask(request));
    expect(e?.code).toBe(code);
    expect(!!e?.budget).toBe(budget);
  });

  it("carries whose budget is used up and when it starts again", async () => {
    const body = { error: { code: "rate_limited", message: "x", scope: "device", resetsAt: "2026-10-14T00:00:00Z" } };
    const { ask } = tutorWith(generateKey(), () => json(429, body, { "retry-after": "3600" }));
    const e = await rejection(ask(request));
    expect(e).toMatchObject({ code: "rate_limited", budget: true, scope: "device", resetsAt: "2026-10-14T00:00:00.000Z" });
  });

  it("takes the time from retry-after when the body has none, and ignores a scope or time it does not know", async () => {
    const before = Date.now();
    const { ask } = tutorWith(generateKey(), () => json(429, { error: { code: "rate_limited", message: "x", scope: "everyone", resetsAt: "soon" } }, { "retry-after": "3600" }));
    const e = await rejection(ask(request));
    expect(e?.scope).toBeUndefined();
    expect(Date.parse(String(e?.resetsAt)) - before).toBeGreaterThanOrEqual(3_599_000);
    expect(Date.parse(String(e?.resetsAt)) - Date.now()).toBeLessThanOrEqual(3_600_000);
    const none = tutorWith(generateKey(), () => json(429, { error: { code: "rate_limited", message: "x" } }));
    expect((await rejection(none.ask(request)))?.resetsAt).toBeUndefined();
  });

  it.each([
    [401, "not_granted"],
    [413, "prompt_too_large"],
    [429, "rate_limited"],
    [500, "unavailable"],
    [502, "unavailable"],
  ])("maps a %s without a readable body to %s", async (status, code) => {
    const { ask } = tutorWith(generateKey(), () => new Response("<html>bad gateway</html>", { status }));
    expect((await rejection(ask(request)))?.code).toBe(code);
  });

  it("is offline when the request cannot be made", async () => {
    const { ask } = tutorWith(generateKey(), () => {
      throw new TypeError("Failed to fetch");
    });
    expect((await rejection(ask(request)))?.code).toBe("offline");
  });

  it("is offline, with the text so far, when the connection breaks inside the answer", async () => {
    const { ask } = tutorWith(generateKey(), () => streamOf([sse({ type: "delta", text: "Some" })], new TypeError("network error")));
    expect(await rejection(ask(request))).toMatchObject({ code: "offline", text: "Some" });
  });

  it("says the answer was cut off when the stream ends before the end of the answer", async () => {
    const { ask } = tutorWith(generateKey(), () => streamOf([sse({ type: "delta", text: "Some" })]));
    expect(await rejection(ask(request))).toMatchObject({ code: "unavailable", text: "Some" });
  });

  it("is cancelled when the page aborts, before or during the answer, with no text kept", async () => {
    const before = new AbortController();
    before.abort();
    const early = tutorWith(generateKey(), (init) => {
      if (init.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return streamOf([]);
    });
    expect(await rejection(early.ask(request, { signal: before.signal }))).toMatchObject({ code: "cancelled" });

    const during = new AbortController();
    const late = tutorWith(generateKey(), (init) =>
      new Response(
        new ReadableStream<Uint8Array>({
          start(c) {
            c.enqueue(enc.encode(sse({ type: "delta", text: "Some" })));
            init.signal?.addEventListener("abort", () => c.error(new DOMException("aborted", "AbortError")));
          },
        }),
        { status: 200 },
      ),
    );
    const pending = rejection(late.ask(request, { signal: during.signal, onText: () => during.abort() }));
    const e = await pending;
    expect(e?.code).toBe("cancelled");
    expect(e?.text).toBeUndefined();
  });
});

describe("tutorIsOn", () => {
  const health = (body: unknown, status = 200) => (async () => json(status, body)) as unknown as typeof fetch;

  it("is true only when the server says its tutor is on", async () => {
    expect(await tutorIsOn(health({ ok: true, tutor: "on" }))).toBe(true);
    expect(await tutorIsOn(health({ ok: true, tutor: "off" }))).toBe(false);
    expect(await tutorIsOn(health({ ok: true }))).toBe(false);
    expect(await tutorIsOn(health({ tutor: "on" }))).toBe(false);
    expect(await tutorIsOn(health({ ok: true, tutor: "on" }, 503))).toBe(false);
  });

  it("offers Quorum only when the tutor is on and the server says Quorum is", async () => {
    expect(await quorumOffer(health({ ok: true, tutor: "on", quorum: "on" }))).toBe("on");
    expect(await quorumOffer(health({ ok: true, tutor: "on", quorum: "optin" }))).toBe("optin");
    expect(await quorumOffer(health({ ok: true, tutor: "on" }))).toBe(false);
    expect(await quorumOffer(health({ ok: true, tutor: "on", quorum: "yes" }))).toBe(false);
    expect(await quorumOffer(health({ ok: true, tutor: "off", quorum: "on" }))).toBe(false);
    expect(await quorumOffer(health({ ok: true, tutor: "off", quorum: "optin" }))).toBe(false);
    expect(await quorumOffer(health({ ok: true, tutor: "on", quorum: "on" }, 503))).toBe(false);
    expect(await quorumOffer((async () => { throw new TypeError("offline"); }) as unknown as typeof fetch)).toBe(false);
  });

  it("says what the server says of the tutor, Quorum and flag reports from one request", async () => {
    let asked = 0;
    const once = (body: unknown) => (async () => (asked++, json(200, body))) as unknown as typeof fetch;
    expect(await serverSays(once({ ok: true, tutor: "on", quorum: "on" }))).toEqual({ tutor: true, quorum: "on", reports: false, known: false });
    expect(await serverSays(once({ ok: true, tutor: "on" }))).toEqual({ tutor: true, quorum: false, reports: false, known: false });
    expect(await serverSays(once({ ok: true, tutor: "off", quorum: "on" }))).toEqual({ tutor: false, quorum: false, reports: false, known: false });
    expect(await serverSays(once({ ok: false, tutor: "on", quorum: "on" }))).toEqual({ tutor: false, quorum: false, reports: false, known: false });
    // flag reports are told apart from the tutor: a server can take flags with its tutor off
    expect(await serverSays(once({ ok: true, tutor: "off", reports: "on" }))).toEqual({ tutor: false, quorum: false, reports: true, known: false });
    expect(await serverSays(once({ ok: false, reports: "on" }))).toMatchObject({ reports: false, known: false });
    // learned facts are answered only beside a tutor that is on
    expect(await serverSays(once({ ok: true, tutor: "on", known: "on" }))).toMatchObject({ tutor: true, known: true });
    expect(await serverSays(once({ ok: true, tutor: "off", known: "on" }))).toMatchObject({ known: false });
    expect(asked).toBe(8);
    expect(await serverSays((async () => { throw new TypeError("offline"); }) as unknown as typeof fetch)).toEqual({ tutor: false, quorum: false, reports: false, known: false });
  });

  it("is false for an answer that is not JSON (a static host with no server)", async () => {
    expect(await tutorIsOn((async () => new Response("<!doctype html>", { status: 200 })) as unknown as typeof fetch)).toBe(false);
  });

  it("is false when the request fails or takes too long", async () => {
    expect(await tutorIsOn((async () => { throw new TypeError("offline"); }) as unknown as typeof fetch)).toBe(false);
    const hang = ((_u: string, init: RequestInit) => new Promise((_, reject) => init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as unknown as typeof fetch;
    expect(await tutorIsOn(hang, 20)).toBe(false);
  });
});

describe("deviceId", () => {
  const store = (initial: Record<string, string> = {}) => {
    const data = { ...initial };
    vi.stubGlobal("localStorage", { getItem: (k: string) => data[k] ?? null, setItem: (k: string, v: string) => void (data[k] = v) });
    return data;
  };

  it("makes an id once and keeps it", () => {
    const data = store();
    const id = deviceId();
    expect(id).toMatch(DEVICE_ID);
    expect(data["riglam.deviceId"]).toBe(id);
    expect(deviceId()).toBe(id);
  });

  it("replaces a stored value that is not an id", () => {
    const data = store({ "riglam.deviceId": "short" });
    const id = deviceId();
    expect(id).toMatch(DEVICE_ID);
    expect(data["riglam.deviceId"]).toBe(id);
  });

  it("lasts for the visit when storage cannot be used", () => {
    vi.stubGlobal("localStorage", { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } });
    const id = deviceId();
    expect(id).toMatch(DEVICE_ID);
    expect(deviceId()).toBe(id);
  });
});

describe("the known facts", () => {
  const fact = { cell: "anb", text: "a pot", line: 'A not B: "a pot" | A yes: x | B no: y', by: "learned" };
  const knownWith = (respond: () => Response | Promise<Response>) => {
    const seen: { url: string; init: RequestInit }[] = [];
    const doFetch = (async (url: string, init: RequestInit) => (seen.push({ url, init }), respond())) as unknown as typeof fetch;
    return { ask: createKnown(generateKey(), doFetch, () => "d".repeat(22)), seen };
  };
  const req = { cats: ["form", "color"], examples: [{ cell: "anb" as const, text: "a pot" }] };

  it("asks the server with the device and its proof, and gives back the lines it knows", async () => {
    const { ask, seen } = knownWith(() => json(200, { known: [fact, { cell: "both" }, null] }));
    expect(await ask(req)).toEqual([fact]);
    expect(seen[0].url).toBe("/api/known");
    expect(seen[0].init).toMatchObject({ method: "POST", cache: "no-store", body: JSON.stringify(req) });
    expect(Object.keys(seen[0].init.headers as object)).toEqual(expect.arrayContaining([HEADER.device, HEADER.proof]));
  });

  it("knows nothing, and never throws, when the server refuses, answers something else or cannot be reached", async () => {
    for (const respond of [() => json(401, { error: { code: "not_granted" } }), () => json(503, {}), () => json(200, { known: "no" }), () => new Response("<html>"), () => { throw new TypeError("offline"); }])
      expect(await knownWith(respond).ask(req)).toEqual([]);
  });
});
