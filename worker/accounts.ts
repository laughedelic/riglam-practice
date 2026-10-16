// Optional accounts, signed in with a passkey (docs/SERVER.md, "Accounts and sync"). An account is a random id, a name the
// person chose and one or more passkeys: a public key each, no email address and no password. The passkey belongs to the
// host name of the app (the "relying party"), which is taken from the address the request came to.
//
//   GET    /api/account                    who is signed in
//   DELETE /api/account                    delete the account and everything in it
//   POST   /api/account/register/options   start making an account
//   POST   /api/account/register/verify    finish it; signs in
//   POST   /api/account/login/options      start signing in
//   POST   /api/account/login/verify       finish it
//   POST   /api/account/passkeys/options   start adding a passkey to the signed-in account
//   POST   /api/account/passkeys/verify    finish it
//   POST   /api/account/logout
//   POST   /api/account/key                the account carries the Magic Key (needs the access proof)
//   GET    /api/account/key                the Magic Key, to a signed-in account that carries it
//
// The ceremonies are the library's (@simplewebauthn/server); what is ours is the challenge handling, the sessions and the limits.

import { generateAuthenticationOptions, generateRegistrationOptions, verifyAuthenticationResponse, verifyRegistrationResponse } from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, AuthenticatorTransport, RegistrationResponseJSON } from "@simplewebauthn/server";
import { Hono, type Context, type MiddlewareHandler } from "hono";
import { ACCOUNT_API, SYNC_LIMITS, type AccountError, type AccountErrorCode, type MeResponse } from "../src/account/protocol";
import { HEADER } from "../src/ai/protocol";
import { dayOf } from "./budget";
import { readAccountConfig } from "./config";
import { callerOf, gate, magicKeyOf, type Gate } from "./magic";
import type { Env } from "./env";
import { clearedCookie, fromB64u, newSession, randomToken, readSession, sessionCookie, toB64u, tokenFrom, type Session } from "./session";

export interface AccountDeps {
  now: () => Date;
}

type Ctx = Context<{ Bindings: Env }>;

const STATUS: Record<AccountErrorCode, 400 | 401 | 403 | 409 | 413 | 429 | 503> = {
  signed_out: 401,
  not_granted: 403,
  unknown_passkey: 401,
  bad_request: 400,
  too_large: 413,
  quota: 429,
  conflict: 409,
  unavailable: 503,
};

export function fail(code: AccountErrorCode, message: string, headers?: Record<string, string>): Response {
  const body: AccountError = { error: { code, message } };
  return new Response(JSON.stringify(body), { status: STATUS[code], headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });
}

/**
 * The answer to a proof the gate refused. Past the hourly limit on wrong keys the proof was not looked at, which is a wait and not a
 * verdict on the key, so that case is a 429 with the seconds to wait; when the guess could not be counted the proof was not looked at
 * either and the answer is 503 `unavailable`; a wrong proof is `not_granted` with the given message.
 */
export function keyRefusal(checked: Extract<Gate, { ok: false }>, now: Date, wrong: string): Response {
  if (checked.reason === "unavailable") return fail("unavailable", "the key cannot be checked just now; try again later", { "retry-after": "60" });
  if (checked.reason !== "blocked") return fail("not_granted", wrong);
  const wait = Math.max(1, Math.ceil((Date.parse(checked.resetsAt ?? "") - now.getTime()) / 1000) || 60);
  return fail("quota", "too many wrong keys were tried from this connection; try again later", { "retry-after": String(wait) });
}

const json = (body: unknown, headers?: Record<string, string>) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json", "cache-control": "no-store", ...headers } });

const RP_NAME = "riglam practice";
const CHALLENGE_MS = 5 * 60_000;
/** most unfinished ceremonies at a time; asking for options writes a row, so this keeps a flood from filling the table */
const MAX_PENDING = 500;
const MAX_PASSKEYS = 10;

/** True when the database exists, has the account tables, and the operator has not switched accounts off (settings: accounts = off). */
export async function accountsOn(db: D1Database | undefined): Promise<boolean> {
  if (!db) return false;
  try {
    // one query: the switch, and a look at the users table that fails when the migration has not been applied
    const row = await db.prepare("SELECT (SELECT value FROM settings WHERE key = 'accounts') AS v, (SELECT COUNT(*) FROM users WHERE 0) AS probe").first<{ v: string | null }>();
    return row?.v !== "off";
  } catch {
    return false;
  }
}

/** The address the request came to: the passkey's relying party is its host name, and the origin is what the browser must have signed. */
function where(c: Ctx) {
  const url = new URL(c.req.url);
  return { origin: url.origin, rpID: url.hostname };
}

/** Requests whose session was extended, with the token to put in the extended cookie. */
const renewals = new WeakMap<Request, string>();

/** The signed-in account, or null. A session that is extended by this request is noted, so that `renewCookie` can extend the browser's cookie too. */
export async function sessionOf(c: Ctx, now: Date): Promise<Session | null> {
  if (!c.env.DB) return null;
  const header = c.req.header("cookie");
  const session = await readSession(c.env.DB, header, now);
  const token = tokenFrom(header);
  if (session?.renewed && token) renewals.set(c.req.raw, token);
  return session;
}

/** Middleware: when the request extended the session on the server, the response extends the cookie, which otherwise ends 60 days after sign-in. */
export const renewCookie: MiddlewareHandler = async (c, next) => {
  await next();
  const token = renewals.get(c.req.raw);
  if (token && !c.res.headers.has("set-cookie")) c.res.headers.append("set-cookie", sessionCookie(token));
};

/** Reads a JSON object from the body, within `max` bytes; null when it is not one. The stream is counted as it arrives and dropped once it is over the limit, whatever the header says. */
export async function readObject(c: Ctx, max: number): Promise<Record<string, unknown> | null | "too_large"> {
  if (Number(c.req.header("content-length") ?? 0) > max) return "too_large";
  const stream = c.req.raw.body;
  if (!stream) return null;
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > max) {
        await reader.cancel().catch(() => {});
        return "too_large";
      }
      chunks.push(value);
    }
  } catch {
    return null;
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const part of chunks) { bytes.set(part, at); at += part.byteLength; }
  try {
    const v = JSON.parse(new TextDecoder().decode(bytes));
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const cleanName = (raw: unknown): string => {
  const s = typeof raw === "string" ? raw.replace(/\p{Cc}/gu, " ").replace(/\s+/g, " ").trim().slice(0, SYNC_LIMITS.name) : "";
  return s || "Practice";
};

async function count(db: D1Database, sql: string, ...values: (string | number)[]): Promise<number> {
  return (await db.prepare(sql).bind(...values).first<{ n: number }>())?.n ?? 0;
}

/**
 * Writes the challenge of a ceremony. Anyone can ask for one, and each writes to the database, so two limits apply that are decided in the
 * statements themselves (not by a count read earlier): everybody together may start `perDay` a day, and at most MAX_PENDING may be open at once.
 */
async function startChallenge(db: D1Database, now: Date, perDay: number, kind: "register" | "login" | "passkey", challenge: string, userId?: string, name?: string): Promise<string | Response> {
  await db.prepare("DELETE FROM challenges WHERE expires_at < ?1").bind(now.toISOString()).run();
  const counted = await db
    .prepare("INSERT INTO budget (day, scope, micro, calls) VALUES (?1, 'ceremonies', 1, 1) ON CONFLICT (day, scope) DO UPDATE SET micro = micro + 1, calls = calls + 1 WHERE micro < ?2")
    .bind(dayOf(now), perDay)
    .run();
  if (!counted.meta.changes) return fail("quota", "too many sign-ins were started today; try again tomorrow");
  const id = randomToken(16);
  const inserted = await db
    .prepare("INSERT INTO challenges (id, kind, challenge, user_id, name, expires_at) SELECT ?1, ?2, ?3, ?4, ?5, ?6 WHERE (SELECT COUNT(*) FROM challenges) < ?7")
    .bind(id, kind, challenge, userId ?? null, name ?? null, new Date(now.getTime() + CHALLENGE_MS).toISOString(), MAX_PENDING)
    .run();
  if (!inserted.meta.changes) return fail("quota", "too many sign-ins are under way; try again in a few minutes");
  return id;
}

/** Takes the challenge out (it can be used once), if it is of this kind and not over. */
async function takeChallenge(db: D1Database, id: unknown, kind: string, now: Date) {
  if (typeof id !== "string" || id.length > 100) return null;
  return db
    .prepare("DELETE FROM challenges WHERE id = ?1 AND kind = ?2 AND expires_at >= ?3 RETURNING challenge, user_id AS userId, name")
    .bind(id, kind, now.toISOString())
    .first<{ challenge: string; userId: string | null; name: string | null }>();
}

const isConstraint = (e: unknown) => /UNIQUE|constraint/i.test(e instanceof Error ? e.message : String(e));

export function accountRoutes(deps: AccountDeps) {
  const app = new Hono<{ Bindings: Env }>();

  // Cookies go with every request to this address, so a page of another origin could try to use them: state-changing requests must name the app's own origin.
  app.use("/api/account/*", sameOrigin);
  app.use("/api/account", sameOrigin);
  app.use("/api/account/*", renewCookie);
  app.use("/api/account", renewCookie);

  async function sameOrigin(c: Ctx, next: () => Promise<void>) {
    if (c.req.method !== "GET" && c.req.method !== "HEAD" && c.req.header("origin") !== where(c).origin) return fail("not_granted", "the request is not from the app");
    await next();
  }

  /** The account for a request that needs one, or the response to send instead. */
  async function needSession(c: Ctx): Promise<Session | Response> {
    if (!(await accountsOn(c.env.DB))) return fail("unavailable", "accounts are off");
    return (await sessionOf(c, deps.now())) ?? fail("signed_out", "you are not signed in");
  }

  const passkeys = (db: D1Database, userId: string) => count(db, "SELECT COUNT(*) AS n FROM credentials WHERE user_id = ?1", userId);

  app.get(ACCOUNT_API.me, async (c) => {
    if (!(await accountsOn(c.env.DB))) return fail("unavailable", "accounts are off");
    const session = await sessionOf(c, deps.now());
    if (!session) return json({ signedIn: false } satisfies MeResponse);
    const row = await c.env.DB!.prepare("SELECT created_at AS createdAt, has_key AS hasKey FROM users WHERE id = ?1").bind(session.userId).first<{ createdAt: string; hasKey: number }>();
    return json({ signedIn: true, user: { id: session.userId, name: session.name, passkeys: await passkeys(c.env.DB!, session.userId), createdAt: row?.createdAt ?? "", hasKey: row?.hasKey === 1 } } satisfies MeResponse);
  });

  app.delete(ACCOUNT_API.me, async (c) => {
    const session = await needSession(c);
    if (session instanceof Response) return session;
    const db = c.env.DB!;
    const u = session.userId;
    await db.batch([
      db.prepare("DELETE FROM docs WHERE user_id = ?1").bind(u),
      db.prepare("DELETE FROM sync_quota WHERE user_id = ?1").bind(u),
      db.prepare("DELETE FROM sessions WHERE user_id = ?1").bind(u),
      db.prepare("DELETE FROM credentials WHERE user_id = ?1").bind(u),
      db.prepare("DELETE FROM challenges WHERE user_id = ?1").bind(u),
      db.prepare("DELETE FROM users WHERE id = ?1").bind(u),
    ]);
    return json({ ok: true }, { "set-cookie": clearedCookie() });
  });

  // An account that shows the Magic Key carries it: its devices get the key when they sign in, and again after the key is changed.
  // Only a request with a valid proof sets the flag (wrong proofs are counted like everywhere else), and only the signed-in account's own row changes.
  app.post(ACCOUNT_API.key, async (c) => {
    const session = await needSession(c);
    if (session instanceof Response) return session;
    const checked = await gate(c.env, deps.now(), await callerOf(c.req.header("cf-connecting-ip")), c.req.header(HEADER.device) ?? "", c.req.header(HEADER.proof) ?? "");
    if (!checked.ok) return keyRefusal(checked, deps.now(), "the Magic Key does not match");
    await c.env.DB!.prepare("UPDATE users SET has_key = 1 WHERE id = ?1").bind(session.userId).run();
    return json({ hasKey: true });
  });

  app.get(ACCOUNT_API.key, async (c) => {
    const session = await needSession(c);
    if (session instanceof Response) return session;
    const row = await c.env.DB!.prepare("SELECT has_key AS hasKey FROM users WHERE id = ?1").bind(session.userId).first<{ hasKey: number }>();
    const key = magicKeyOf(c.env);
    if (row?.hasKey !== 1 || !key) return fail("not_granted", "this account does not carry the Magic Key");
    return json({ key });
  });

  app.post(ACCOUNT_API.logout, async (c) => {
    if (c.env.DB) {
      const session = await sessionOf(c, deps.now()).catch(() => null);
      if (session) await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?1").bind(session.tokenHash).run().catch(() => {});
    }
    return json({ ok: true }, { "set-cookie": clearedCookie() });
  });

  // ---- a new account ----

  app.post(ACCOUNT_API.registerOptions, async (c) => {
    const env = c.env;
    if (!(await accountsOn(env.DB))) return fail("unavailable", "accounts are off");
    const db = env.DB!;
    const cfg = readAccountConfig(env);
    if (cfg.signup === "closed") return fail("not_granted", "new accounts are closed");
    if (cfg.signup === "group") {
      const device = c.req.header(HEADER.device) ?? "";
      const proof = c.req.header(HEADER.proof) ?? "";
      const checked = await gate(env, deps.now(), await callerOf(c.req.header("cf-connecting-ip")), device, proof);
      if (!checked.ok) return keyRefusal(checked, deps.now(), "new accounts need the Magic Key");
    }
    if ((await count(db, "SELECT COUNT(*) AS n FROM users")) >= cfg.maxAccounts) return fail("quota", "this app has reached its number of accounts");
    const body = await readObject(c, 2_000);
    if (body === "too_large") return fail("too_large", "the request is too large");
    const name = cleanName(body?.name);
    const userId = randomToken(16);
    const { rpID } = where(c);
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID,
      userName: name,
      userDisplayName: name,
      userID: fromB64u(userId),
      attestationType: "none",
      // a passkey the browser can offer without being told the account (so that signing in needs no name), and no check of the device beyond the browser's own
      authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
      timeout: 120_000,
    });
    const challengeId = await startChallenge(db, deps.now(), cfg.dailyCeremonies, "register", options.challenge, userId, name);
    if (challengeId instanceof Response) return challengeId;
    return json({ challengeId, options });
  });

  app.post(ACCOUNT_API.registerVerify, async (c) => {
    const env = c.env;
    if (!(await accountsOn(env.DB))) return fail("unavailable", "accounts are off");
    const db = env.DB!;
    const now = deps.now();
    const body = await readObject(c, 100_000);
    if (body === "too_large") return fail("too_large", "the request is too large");
    if (!body || !body.response || typeof body.response !== "object") return fail("bad_request", "the body is not a sign-up");
    const challenge = await takeChallenge(db, body.challengeId, "register", now);
    if (!challenge?.userId || !challenge.name) return fail("bad_request", "this sign-up has expired; start again");
    const { origin, rpID } = where(c);
    let verified;
    try {
      verified = await verifyRegistrationResponse({ response: body.response as unknown as RegistrationResponseJSON, expectedChallenge: challenge.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false });
    } catch {
      return fail("bad_request", "the passkey could not be verified");
    }
    if (!verified.verified) return fail("bad_request", "the passkey could not be verified");
    const cfg = readAccountConfig(env);
    const { credential } = verified.registrationInfo;
    const session = await newSession(db, challenge.userId, now);
    let made;
    try {
      // The room for one more account is checked by the statement that makes it, so that requests arriving together cannot all take the last place.
      // The passkey and the session are stored only for an account that exists, so a refusal leaves nothing behind.
      made = await db.batch([
        db.prepare("INSERT INTO users (id, name, created_at) SELECT ?1, ?2, ?3 WHERE (SELECT COUNT(*) FROM users) < ?4").bind(challenge.userId, challenge.name, now.toISOString(), cfg.maxAccounts),
        credentialRow(db, challenge.userId, credential, now),
        session.insert,
      ]);
    } catch (e) {
      return isConstraint(e) ? fail("conflict", "that passkey is already registered") : fail("unavailable", "the account could not be made");
    }
    if (!made[0].meta.changes) return fail("quota", "this app has reached its number of accounts");
    return json({ signedIn: true, user: { id: challenge.userId, name: challenge.name, passkeys: 1, createdAt: now.toISOString(), hasKey: false } } satisfies MeResponse, { "set-cookie": sessionCookie(session.token) });
  });

  // ---- an existing account ----

  app.post(ACCOUNT_API.loginOptions, async (c) => {
    if (!(await accountsOn(c.env.DB))) return fail("unavailable", "accounts are off");
    const options = await generateAuthenticationOptions({ rpID: where(c).rpID, userVerification: "preferred", timeout: 120_000 });
    const challengeId = await startChallenge(c.env.DB!, deps.now(), readAccountConfig(c.env).dailyCeremonies, "login", options.challenge);
    if (challengeId instanceof Response) return challengeId;
    return json({ challengeId, options });
  });

  app.post(ACCOUNT_API.loginVerify, async (c) => {
    if (!(await accountsOn(c.env.DB))) return fail("unavailable", "accounts are off");
    const db = c.env.DB!;
    const now = deps.now();
    const body = await readObject(c, 100_000);
    if (body === "too_large") return fail("too_large", "the request is too large");
    const response = body?.response as AuthenticationResponseJSON | undefined;
    if (!body || !response || typeof response !== "object" || typeof response.id !== "string") return fail("bad_request", "the body is not a sign-in");
    const challenge = await takeChallenge(db, body.challengeId, "login", now);
    if (!challenge) return fail("bad_request", "this sign-in has expired; start again");
    const row = await db
      .prepare("SELECT c.id AS id, c.user_id AS userId, c.public_key AS publicKey, c.counter AS counter, c.transports AS transports, u.name AS name FROM credentials c JOIN users u ON u.id = c.user_id WHERE c.id = ?1")
      .bind(response.id.slice(0, 1400))
      .first<{ id: string; userId: string; publicKey: string; counter: number; transports: string | null; name: string }>();
    if (!row) return fail("unknown_passkey", "this app does not know that passkey");
    const handle = response.response?.userHandle;
    if (typeof handle === "string" && handle !== row.userId) return fail("bad_request", "the passkey belongs to another account");
    const { origin, rpID } = where(c);
    let verified;
    try {
      verified = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: { id: row.id, publicKey: fromB64u(row.publicKey), counter: row.counter, transports: transportsOf(row.transports) },
        requireUserVerification: false,
      });
    } catch {
      return fail("bad_request", "the passkey could not be verified");
    }
    if (!verified.verified) return fail("bad_request", "the passkey could not be verified");
    const session = await newSession(db, row.userId, now);
    const stored = await db.batch([db.prepare("UPDATE credentials SET counter = ?2, last_used_at = ?3 WHERE id = ?1").bind(row.id, verified.authenticationInfo.newCounter, now.toISOString()), session.insert]);
    if (!stored[1].meta.changes) return fail("unknown_passkey", "this app does not know that passkey"); // the account was deleted while this sign-in was under way
    const created = await db.prepare("SELECT created_at AS createdAt, has_key AS hasKey FROM users WHERE id = ?1").bind(row.userId).first<{ createdAt: string; hasKey: number }>();
    return json({ signedIn: true, user: { id: row.userId, name: row.name, passkeys: await passkeys(db, row.userId), createdAt: created?.createdAt ?? "", hasKey: created?.hasKey === 1 } } satisfies MeResponse, { "set-cookie": sessionCookie(session.token) });
  });

  // ---- another passkey for the signed-in account ----

  app.post(ACCOUNT_API.passkeyOptions, async (c) => {
    const session = await needSession(c);
    if (session instanceof Response) return session;
    const db = c.env.DB!;
    const existing = (await db.prepare("SELECT id, transports FROM credentials WHERE user_id = ?1").bind(session.userId).all<{ id: string; transports: string | null }>()).results;
    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: where(c).rpID,
      userName: session.name,
      userDisplayName: session.name,
      userID: fromB64u(session.userId),
      attestationType: "none",
      excludeCredentials: existing.map((e) => ({ id: e.id, transports: transportsOf(e.transports) })),
      authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
      timeout: 120_000,
    });
    const challengeId = await startChallenge(db, deps.now(), readAccountConfig(c.env).dailyCeremonies, "passkey", options.challenge, session.userId);
    if (challengeId instanceof Response) return challengeId;
    return json({ challengeId, options });
  });

  app.post(ACCOUNT_API.passkeyVerify, async (c) => {
    const session = await needSession(c);
    if (session instanceof Response) return session;
    const db = c.env.DB!;
    const now = deps.now();
    const body = await readObject(c, 100_000);
    if (body === "too_large") return fail("too_large", "the request is too large");
    if (!body || !body.response || typeof body.response !== "object") return fail("bad_request", "the body is not a passkey");
    const challenge = await takeChallenge(db, body.challengeId, "passkey", now);
    if (!challenge || challenge.userId !== session.userId) return fail("bad_request", "this request has expired; start again");
    if ((await passkeys(db, session.userId)) >= MAX_PASSKEYS) return fail("quota", "an account can hold ten passkeys");
    const { origin, rpID } = where(c);
    let verified;
    try {
      verified = await verifyRegistrationResponse({ response: body.response as unknown as RegistrationResponseJSON, expectedChallenge: challenge.challenge, expectedOrigin: origin, expectedRPID: rpID, requireUserVerification: false });
    } catch {
      return fail("bad_request", "the passkey could not be verified");
    }
    if (!verified.verified) return fail("bad_request", "the passkey could not be verified");
    let saved;
    try {
      saved = await credentialRow(db, session.userId, verified.registrationInfo.credential, now).run();
    } catch (e) {
      return isConstraint(e) ? fail("conflict", "that passkey is already registered") : fail("unavailable", "the passkey could not be saved");
    }
    if (!saved.meta.changes) {
      // nothing stored: the limit was reached by a request that arrived together with this one, or the account has just been deleted
      return (await passkeys(db, session.userId)) >= MAX_PASSKEYS ? fail("quota", "an account can hold ten passkeys") : fail("signed_out", "you are not signed in");
    }
    return json({ ok: true, passkeys: await passkeys(db, session.userId) });
  });

  return app;
}

/** Stores a passkey for an account that exists, if it has room for another; the statement itself decides both, so none is left without an owner or past the limit. */
function credentialRow(db: D1Database, userId: string, credential: { id: string; publicKey: Uint8Array; counter: number; transports?: string[] }, now: Date) {
  return db
    .prepare(
      `INSERT INTO credentials (id, user_id, public_key, counter, transports, created_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?6
       WHERE EXISTS (SELECT 1 FROM users WHERE id = ?2) AND (SELECT COUNT(*) FROM credentials WHERE user_id = ?2) < ?7`,
    )
    .bind(credential.id, userId, toB64u(credential.publicKey), credential.counter, credential.transports ? JSON.stringify(credential.transports) : null, now.toISOString(), MAX_PASSKEYS);
}

function transportsOf(text: string | null): AuthenticatorTransport[] | undefined {
  if (!text) return undefined;
  try {
    const v = JSON.parse(text);
    return Array.isArray(v) ? (v.filter((t) => typeof t === "string") as AuthenticatorTransport[]) : undefined;
  } catch {
    return undefined;
  }
}
