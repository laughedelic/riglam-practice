// The Worker's routes (docs/SERVER.md):
//   GET  /api/health   are the tutor and the accounts on? (no sign-in)
//   GET  /api/course   the definitions, for a device that has the Magic Key (src/ai/magic-key.ts)
//   POST /api/tutor    one tutor question; the answer comes back as server-sent events (src/ai/protocol.ts). On a Preview an explain question may ask
//                      for Quorum, several models and a judge (worker/quorum.ts)
//   /api/account/*     optional accounts, signed in with a passkey (worker/accounts.ts)
//   POST /api/sync     the server copy of a signed-in person's documents (worker/sync.ts)
// Everything else the Worker is asked for is the static site, which the platform serves itself; only /api/* reaches this code.

import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { API, HEADER, LIMITS, type BudgetScope, type CourseResponse, type ErrorCode, type Health, type TutorEvent } from "../src/ai/protocol";
import { accountRoutes, accountsOn } from "./accounts";
import { dayOf, prune, reserve, settle, tutorSwitchedOn, type Pool } from "./budget";
import { readConfig, readQuorumConfig } from "./config";
import { readCourseRows, usableDefinitions } from "./course";
import type { Env } from "./env";
import type { Kit } from "./kit";
import { callerOf, gate, magicKeyOf, type Gate } from "./magic";
import { runQuorum, saveRecord } from "./quorum";
import { syncRoutes } from "./sync";
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

  const fail = (code: ErrorCode, message: string, headers?: Record<string, string>, extra: { scope?: BudgetScope; resetsAt?: string } = {}) =>
    new Response(JSON.stringify({ error: { code, message, ...extra } }), { status: STATUS[code], headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

  // A proof that was refused: wrong, or not even looked at because this connection used up its wrong guesses for the hour (that is
  // a wait, not a verdict on the key, so the page keeps the tutor and says when to try again).
  const refusal = (checked: Extract<Gate, { ok: false }>, wrong: string) => {
    // the guess could not be counted, so the proof was not looked at: neither a verdict on the key nor a wait for the caller
    if (checked.reason === "unavailable") return fail("unavailable", "the key cannot be checked just now; try again later", { "retry-after": "60" });
    if (checked.reason !== "blocked") return fail("not_granted", wrong);
    const wait = Math.max(1, Math.ceil((Date.parse(checked.resetsAt ?? "") - now().getTime()) / 1000) || 60);
    return fail("rate_limited", "too many wrong keys from this connection; try again later", { "retry-after": String(wait) }, { scope: "caller", resetsAt: checked.resetsAt });
  };

  // The app and its server share an origin, so a request that names another one is not from the app.
  app.use("/api/*", async (c, next) => {
    const origin = c.req.header("origin");
    if (origin && origin !== new URL(c.req.url).origin) return c.json({ error: { code: "not_granted", message: "wrong origin" } }, 403);
    await next();
    c.res.headers.set("x-content-type-options", "nosniff");
    c.res.headers.set("x-robots-tag", "noindex, nofollow, noarchive");
  });

  // The tutor is on when it could answer: the database, both secrets, the switch, and a kit (the open data with the course rows of the database).
  const ready = async (env: Env): Promise<boolean> =>
    !!(env.DB && env.ANTHROPIC_API_KEY && magicKeyOf(env) && (await tutorSwitchedOn(env.DB).catch(() => false)) && (await deps.kit(env).catch(() => null)));

  app.get(API.health, async (c) => {
    const tutor = await ready(c.env);
    // Quorum is a mode of the tutor, so it is offered where the tutor is on and this server is set to (a Preview)
    const offered = readQuorumConfig(c.env);
    const body: Health = { ok: true, tutor: tutor ? "on" : "off", accounts: (await accountsOn(c.env.DB)) ? "on" : "off", ...(tutor && offered.on ? { quorum: offered.optIn ? ("optin" as const) : ("on" as const) } : {}) };
    return c.json(body, 200, { "cache-control": "no-store" });
  });

  // The definitions, to a device that has the Magic Key. A device passes the version it kept (`have`) and is told when that is still current.
  app.get(API.course, async (c) => {
    const env = c.env;
    const checked = await gate(env, now(), await callerOf(c.req.header("cf-connecting-ip")), c.req.header(HEADER.device) ?? "", c.req.header(HEADER.proof) ?? "");
    if (!checked.ok) return refusal(checked, "the Magic Key does not match");
    const rows = await readCourseRows(env.DB);
    if (!rows || !usableDefinitions(rows)) return fail("unavailable", "the course data is not on the server");
    const headers = { "content-type": "application/json", "cache-control": "no-store" };
    if (c.req.query("have") === rows.version) return new Response(JSON.stringify({ version: rows.version, unchanged: true } satisfies CourseResponse), { headers });
    // the stored text goes out as it is: it was checked to be JSON when it was loaded
    return new Response(`{"version":${JSON.stringify(rows.version)},"definitions":${rows.definitions}}`, { headers });
  });

  app.post(API.tutor, async (c) => {
    const env = c.env;
    const length = Number(c.req.header("content-length") ?? 0);
    if (length > LIMITS.body) return fail("prompt_too_large", "the request is too large");
    const device = c.req.header(HEADER.device) ?? "";
    const proof = c.req.header(HEADER.proof) ?? "";
    // Sign-in comes first, so that nothing below (the model) is reached by a caller without the key. Wrong keys are counted per caller.
    const checked = await gate(env, now(), await callerOf(c.req.header("cf-connecting-ip")), device, proof);
    if (!checked.ok) return refusal(checked, "the proof does not match");
    if (!(await ready(env))) return fail("unavailable", "the tutor is off");

    let body: unknown;
    try {
      const text = await c.req.text();
      if (new TextEncoder().encode(text).length > LIMITS.body) return fail("prompt_too_large", "the request is too large");
      body = JSON.parse(text);
    } catch {
      return fail("bad_request", "the body is not JSON");
    }
    const parsed = parseRequest(body);
    if (!parsed.ok) return fail(parsed.code, parsed.message);

    const kit = await deps.kit(env).catch(() => null);
    if (!kit) return fail("unavailable", "the tutor has no data");

    const config = readConfig(env);
    const quorum = readQuorumConfig(env);
    const when = now();
    const day = dayOf(when);
    // An explain question that asks for Quorum gets it where the server offers it and Quorum's budget has room; otherwise it is the one model's, as ever.
    let pool: Pool = "tutor";
    let cost = { reserveMicro: config.reserveMicro, deviceCap: config.deviceDailyMicro, globalCap: config.globalDailyMicro };
    let single = false;
    if (parsed.request.quorum && parsed.request.kind === "explain" && quorum.on) {
      const quorumCost = { reserveMicro: quorum.reserveMicro, deviceCap: quorum.deviceDailyMicro, globalCap: quorum.globalDailyMicro };
      if ((await reserve(env.DB!, { day, device, micro: quorumCost.reserveMicro, deviceCap: quorumCost.deviceCap, globalCap: quorumCost.globalCap, pool: "quorum" })).ok) {
        pool = "quorum";
        cost = quorumCost;
      } else single = true;
    }
    const held = pool === "quorum" ? ({ ok: true } as const) : await reserve(env.DB!, { day, device, micro: cost.reserveMicro, deviceCap: cost.deviceCap, globalCap: cost.globalCap });
    if (!held.ok) {
      const tomorrow = Date.parse(day) + 86_400_000;
      return fail(
        "rate_limited",
        held.scope === "device" ? "this device has used its budget for today" : "the budget for today is used",
        { "retry-after": String(Math.max(60, Math.ceil((tomorrow - when.getTime()) / 1000))) },
        { scope: held.scope, resetsAt: new Date(tomorrow).toISOString() },
      );
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
        if (single) await emit({ type: "single", why: "budget" }).catch(() => {});
        const outcome =
          pool === "quorum"
            ? await runQuorum({ client, kit, config, request: parsed.request, emit, signal: abort.signal, device, day, now: when, save: (r) => saveRecord(env.DB!, r) })
            : await runTutor({ client, kit, config, request: parsed.request, emit, signal: abort.signal });
        // The held amount is replaced by the real cost even when the page has gone away or the call failed.
        await settle(env.DB!, { day, device, held: cost.reserveMicro, actual: outcome.micro, now: when, kind: parsed.request.kind, model: pool === "quorum" ? "quorum" : config.model, rounds: outcome.rounds, tokens: outcome.tokens, outcome: outcome.outcome, pool }).catch((e) =>
          console.error("settle failed", e instanceof Error ? e.name : typeof e),
        );
        if (outcome.error) await emit({ type: "error", code: outcome.error.code, message: outcome.error.message }).catch(() => {});
      } finally {
        finished();
      }
    });
  });

  app.route("/", accountRoutes({ now }));
  app.route("/", syncRoutes({ now }));

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
