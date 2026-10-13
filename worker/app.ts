// The Worker's routes (docs/SERVER.md):
//   GET  /api/health   is the tutor on? (no sign-in)
//   POST /api/tutor    one tutor question; the answer comes back as server-sent events (src/ai/protocol.ts)
// Everything else the Worker is asked for is the static site, which the platform serves itself; only /api/* reaches this code.

import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { API, HEADER, LIMITS, type ErrorCode, type Health, type TutorEvent } from "../src/ai/protocol";
import { checkProof } from "../src/ai/proof";
import { dayOf, prune, reserve, settle, tutorSwitchedOn } from "./budget";
import { readConfig } from "./config";
import type { Env } from "./env";
import type { Kit } from "./kit";
import { parseRequest, runTutor } from "./tutor";

export interface Deps {
  now?: () => Date;
  /** the fetch the model client uses; tests pass a fake */
  fetch?: typeof fetch;
  /** how often the model client repeats a call the API answered with a retryable error (default 1) */
  retries?: number;
  /** makes the kit for a request, or null when the tutor cannot run */
  kit: (env: Env) => Promise<Kit | null>;
}

const STATUS: Record<ErrorCode, 400 | 401 | 413 | 429 | 503> = { bad_request: 400, not_granted: 401, prompt_too_large: 413, rate_limited: 429, refused: 503, unavailable: 503 };

export function createApp(deps: Deps) {
  const now = deps.now ?? (() => new Date());
  const app = new Hono<{ Bindings: Env }>();

  const fail = (code: ErrorCode, message: string, headers?: Record<string, string>) =>
    new Response(JSON.stringify({ error: { code, message } }), { status: STATUS[code], headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

  // The app and its server share an origin, so a request that names another one is not from the app.
  app.use("/api/*", async (c, next) => {
    const origin = c.req.header("origin");
    if (origin && origin !== new URL(c.req.url).origin) return c.json({ error: { code: "not_granted", message: "wrong origin" } }, 403);
    await next();
    c.res.headers.set("x-content-type-options", "nosniff");
    c.res.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  });

  const ready = async (env: Env): Promise<boolean> => !!(env.DB && env.ANTHROPIC_API_KEY && env.RIGLAM_DATA_KEY && (await tutorSwitchedOn(env.DB).catch(() => false)));

  app.get(API.health, async (c) => {
    const body: Health = { ok: true, tutor: (await ready(c.env)) ? "on" : "off" };
    return c.json(body, 200, { "cache-control": "no-store" });
  });

  app.post(API.tutor, async (c) => {
    const env = c.env;
    const length = Number(c.req.header("content-length") ?? 0);
    if (length > LIMITS.body) return fail("prompt_too_large", "the request is too large");
    const device = c.req.header(HEADER.device) ?? "";
    const proof = c.req.header(HEADER.proof) ?? "";
    // Sign-in comes first, so that nothing below (the database, the model) is reached by a caller without the key.
    if (!env.RIGLAM_DATA_KEY || !(await checkProof(env.RIGLAM_DATA_KEY, device, proof))) return fail("not_granted", "the proof does not match");
    if (!(await ready(env))) return fail("unavailable", "the tutor is off");

    let body: unknown;
    try {
      const text = await c.req.text();
      if (text.length > LIMITS.body) return fail("prompt_too_large", "the request is too large");
      body = JSON.parse(text);
    } catch {
      return fail("bad_request", "the body is not JSON");
    }
    const parsed = parseRequest(body);
    if (!parsed.ok) return fail(parsed.code, parsed.message);

    const kit = await deps.kit(env).catch(() => null);
    if (!kit) return fail("unavailable", "the tutor has no data");

    const config = readConfig(env);
    const when = now();
    const day = dayOf(when);
    const held = await reserve(env.DB!, { day, device, micro: config.reserveMicro, deviceCap: config.deviceDailyMicro, globalCap: config.globalDailyMicro });
    if (!held.ok) {
      const tomorrow = Date.parse(day) + 86_400_000;
      return fail("rate_limited", held.scope === "device" ? "this device has used its budget for today" : "the budget for today is used", { "retry-after": String(Math.max(60, Math.ceil((tomorrow - when.getTime()) / 1000))) });
    }
    if (Math.random() < 0.02) later(c, prune(env.DB!, day).catch(() => {}));

    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY!, ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}), maxRetries: deps.retries ?? 1, timeout: 90_000, ...(deps.fetch ? { fetch: deps.fetch } : {}) });
    // Asked for now, before anything can go wrong: the runtime keeps the request alive for the settling below
    // even when the page has gone away and the response has been cancelled.
    let finished!: () => void;
    later(c, new Promise<void>((resolve) => (finished = resolve)));
    return streamSSE(c, async (stream) => {
      try {
        const abort = new AbortController();
        stream.onAbort(() => abort.abort());
        const emit = async (e: TutorEvent) => {
          await stream.writeSSE({ event: e.type, data: JSON.stringify(e) });
        };
        const outcome = await runTutor({ client, kit, config, request: parsed.request, emit, signal: abort.signal });
        // The held amount is replaced by the real cost even when the page has gone away or the call failed.
        await settle(env.DB!, { day, device, held: config.reserveMicro, actual: outcome.micro, now: when, kind: parsed.request.kind, model: config.model, rounds: outcome.rounds, tokens: outcome.tokens, outcome: outcome.outcome }).catch((e) =>
          console.error("settle failed", e instanceof Error ? e.name : typeof e),
        );
        if (outcome.error) await emit({ type: "error", code: outcome.error.code, message: outcome.error.message }).catch(() => {});
      } finally {
        finished();
      }
    });
  });

  app.all("/api/*", (c) => c.json({ error: { code: "not_found", message: "no such endpoint" } }, 404));
  // The site itself is served by the platform; this only catches a request that reached the Worker by mistake.
  app.all("*", (c) => c.env.ASSETS.fetch(c.req.raw));
  return app;
}

/** Lets work finish after the response has gone, where the runtime supports it. */
function later(c: { executionCtx: { waitUntil(work: Promise<unknown>): void } }, work: Promise<unknown>) {
  try {
    c.executionCtx.waitUntil(work);
  } catch {
    /* no execution context (a test): the work simply runs on */
  }
}
