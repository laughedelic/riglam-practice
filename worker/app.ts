// The Worker's routes (docs/SERVER.md):
//   GET  /api/health   are the tutor and the accounts on? (no sign-in)
//   GET  /api/course   the definitions, for a device that has the Magic Key (src/ai/magic-key.ts)
//   POST /api/tutor    one tutor question; the answer comes back as server-sent events (src/ai/protocol.ts)
//   POST /api/lab      one model call of the check lab (Previews only, worker/lab.ts)
//   /api/account/*     optional accounts, signed in with a passkey (worker/accounts.ts)
//   POST /api/sync     the server copy of a signed-in person's documents (worker/sync.ts)
// Everything else the Worker is asked for is the static site, which the platform serves itself; only /api/* reaches this code.

import Anthropic from "@anthropic-ai/sdk";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { API, HEADER, LIMITS, type BudgetScope, type CourseResponse, type ErrorCode, type Health, type TutorEvent } from "../src/ai/protocol";
import { accountRoutes, accountsOn } from "./accounts";
import { dayOf, prune, reserve, settle, tutorSwitchedOn } from "./budget";
import { readConfig, readLabConfig } from "./config";
import { readCourseRows, usableDefinitions } from "./course";
import type { Env } from "./env";
import type { Kit } from "./kit";
import { parseLabRequest, runLab } from "./lab";
import { callerOf, gate, magicKeyOf, type Gate } from "./magic";
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

  // The lab is on when this server is set to answer it (a Preview) and could: the database, both secrets and the switch. It needs no kit.
  const labReady = async (env: Env): Promise<boolean> =>
    readLabConfig(env).on && !!(env.DB && env.ANTHROPIC_API_KEY && magicKeyOf(env) && (await tutorSwitchedOn(env.DB).catch(() => false)));

  app.get(API.health, async (c) => {
    const body: Health = { ok: true, tutor: (await ready(c.env)) ? "on" : "off", accounts: (await accountsOn(c.env.DB)) ? "on" : "off", ...((await labReady(c.env)) ? { lab: "on" as const } : {}) };
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
    const when = now();
    const day = dayOf(when);
    const held = await reserve(env.DB!, { day, device, micro: config.reserveMicro, deviceCap: config.deviceDailyMicro, globalCap: config.globalDailyMicro });
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

  // One model call of the check lab (worker/lab.ts), counted against the lab's own budgets. Off on every server but a Preview.
  app.post(API.lab, async (c) => {
    const env = c.env;
    const lab = readLabConfig(env);
    if (!lab.on) return fail("unavailable", "the lab is off");
    const length = Number(c.req.header("content-length") ?? 0);
    if (length > LIMITS.body) return fail("prompt_too_large", "the request is too large");
    const device = c.req.header(HEADER.device) ?? "";
    const checked = await gate(env, now(), await callerOf(c.req.header("cf-connecting-ip")), device, c.req.header(HEADER.proof) ?? "");
    if (!checked.ok) return refusal(checked, "the proof does not match");
    if (!(await labReady(env))) return fail("unavailable", "the lab is off");

    let body: unknown;
    try {
      const text = await c.req.text();
      if (new TextEncoder().encode(text).length > LIMITS.body) return fail("prompt_too_large", "the request is too large");
      body = JSON.parse(text);
    } catch {
      return fail("bad_request", "the body is not JSON");
    }
    const parsed = parseLabRequest(body);
    if (!parsed.ok) return fail(parsed.code, parsed.message);

    const config = readConfig(env);
    const when = now();
    const day = dayOf(when);
    const held = await reserve(env.DB!, { day, device, micro: config.reserveMicro, deviceCap: lab.deviceDailyMicro, globalCap: lab.globalDailyMicro, pool: "lab" });
    if (!held.ok) {
      const tomorrow = Date.parse(day) + 86_400_000;
      return fail(
        "rate_limited",
        held.scope === "device" ? "this device has used its budget for the lab today" : "the lab's budget for today is used",
        { "retry-after": String(Math.max(60, Math.ceil((tomorrow - when.getTime()) / 1000))) },
        { scope: held.scope, resetsAt: new Date(tomorrow).toISOString() },
      );
    }
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY!, ...(env.ANTHROPIC_BASE_URL ? { baseURL: env.ANTHROPIC_BASE_URL } : {}), maxRetries: deps.retries ?? 1, timeout: 90_000, ...(deps.fetch ? { fetch: deps.fetch } : {}) });
    // The held amount is replaced by the real cost even when the page has gone away: the runtime keeps the request alive for it.
    const work = (async () => {
      const outcome = await runLab({ client, config, request: parsed.request });
      await settle(env.DB!, { day, device, held: config.reserveMicro, actual: outcome.micro, now: when, kind: "lab", model: parsed.request.model, rounds: 1, tokens: outcome.tokens, outcome: outcome.outcome, pool: "lab" }).catch((e) =>
        console.error("settle failed", e instanceof Error ? e.name : typeof e),
      );
      return outcome;
    })();
    later(c, work.catch(() => {}));
    const outcome = await work;
    if (outcome.reply) return c.json(outcome.reply, 200, { "cache-control": "no-store" });
    const error = outcome.error ?? { code: "unavailable" as const, message: "The model could not answer." };
    // a busy model is a wait, not the used-up budget that a 429 means to the page
    return error.code === "rate_limited" ? new Response(JSON.stringify({ error }), { status: 503, headers: { "content-type": "application/json", "cache-control": "no-store" } }) : fail(error.code, error.message);
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
