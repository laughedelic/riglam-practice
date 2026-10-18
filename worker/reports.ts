// Reports of learners' flags (docs/SERVER.md, "Flag reports").
//
//   POST /api/flags   { send?: [{ id, flag, answer }], withdraw?: [id] } -> { stored, withdrawn }
//
// A flag is feedback to whoever maintains the app. Any device that has the Magic Key may send one, signed in or not (the proof
// is the tutor's, in the same headers); that the sender was signed in is kept as one more fact (`user_id`). Nothing here reads
// what is in a report beyond its size: the text comes from a device, which can send anything, and whoever reads it later (a
// person, a model) treats it as data. A device id is made up by whoever holds the key, so the daily limits also count the
// sender's address (a short hash of it, as the Magic Key's guess limit does) and all reports together.

import { Hono } from "hono";
import { validDocId } from "../src/account/protocol";
import { DEVICE_ID } from "../src/ai/proof";
import { HEADER } from "../src/ai/protocol";
import { REPORT_API, REPORT_LIMITS, autoFlagOf, type FlagReport, type ReportDoc, type ReportResponse, type ReportState, type ReportStatus } from "../src/report/protocol";
import { fail, keyRefusal, readObject, sessionOf, type AccountDeps } from "./accounts";
import { dayOf } from "./budget";
import type { Env } from "./env";
import { callerOf, gate } from "./magic";

const isPlain = (v: unknown): v is ReportDoc => !!v && typeof v === "object" && !Array.isArray(v);

/** True when the database has the reports table and the operator has not switched reports off (settings: reports = off). */
export async function reportsOn(db: D1Database | undefined): Promise<boolean> {
  if (!db) return false;
  try {
    // one query: the switch, and a look at the table and the columns the review added that fails when a migration has not been applied
    const row = await db.prepare("SELECT (SELECT value FROM settings WHERE key = 'reports') AS v, (SELECT COUNT(*) FROM flag_reports WHERE reply IS NULL AND claimed_at IS NULL AND digest IS NULL AND 0) AS probe").first<{ v: string | null }>();
    return row?.v !== "off";
  } catch {
    return false;
  }
}

/** The reports of a request, checked; or the reason it is refused. The last of several with one id counts. */
function readSends(raw: unknown): FlagReport[] | string {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return "send must be a list";
  if (raw.length > REPORT_LIMITS.send) return `at most ${REPORT_LIMITS.send} reports in one request`;
  const byId = new Map<string, FlagReport>();
  for (const r of raw) {
    if (!isPlain(r) || !validDocId(r.id)) return "a report has no valid id";
    if (!isPlain(r.flag) || r.flag.id !== r.id) return "a report must carry its flag, with the same id";
    if (JSON.stringify(r.flag).length > REPORT_LIMITS.flag) return "a flag is too large";
    if (r.answer !== null && r.answer !== undefined) {
      if (!isPlain(r.answer)) return "an answer must be an object or null";
      if (JSON.stringify(r.answer).length > REPORT_LIMITS.answer) return "an answer is too large";
    }
    byId.set(r.id, { id: r.id, flag: r.flag, answer: r.answer ?? null });
  }
  return [...byId.values()];
}

function readIds(raw: unknown, name: string, most: number): string[] | string {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return `${name} must be a list`;
  if (raw.length > most) return `at most ${most} ids in one request`;
  if (!raw.every(validDocId)) return `${name} takes flag ids`;
  return [...new Set(raw as string[])];
}

/**
 * What of a report makes it a new one for the review: the words of the flag and the answer it was made on. A flag sent again with
 * only its own state or time changed (the learner marks it resolved) keeps its review; a changed note or suggestion starts it again.
 */
async function digestOf(r: FlagReport): Promise<string> {
  const f = r.flag;
  const part = (k: string) => (typeof f[k] === "string" ? f[k] : "");
  const bytes = new TextEncoder().encode(JSON.stringify([part("caseKey"), part("thing"), part("part"), part("model"), part("n"), part("shown"), part("asked"), part("note"), part("suggest"), autoFlagOf(f) ?? "", r.answer]));
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const STATES: readonly ReportState[] = ["sent", "answered", "maintainer", "fixed", "decided"];

/** The state and reply the sender may read, for the flags it asks about that it or its account sent. */
async function statusOf(db: D1Database, ids: string[], device: string, user: string | null): Promise<ReportStatus[]> {
  if (!ids.length) return [];
  const marks = ids.map((_, i) => `?${i + 3}`).join(", ");
  const found = await db
    .prepare(`SELECT id, state, reply, reply_at FROM flag_reports WHERE id IN (${marks}) AND (device = ?1 OR (user_id IS NOT NULL AND user_id = ?2)) ORDER BY updated_at`)
    .bind(device, user, ...ids)
    .all<{ id: string; state: string; reply: string | null; reply_at: string | null }>();
  const byId = new Map<string, ReportStatus>();
  for (const r of found.results) {
    byId.set(r.id, { id: r.id, state: STATES.find((s) => s === r.state) ?? "sent", ...(r.reply ? { reply: r.reply, replyAt: r.reply_at ?? undefined } : {}) });
  }
  return [...byId.values()];
}

export function reportRoutes(deps: AccountDeps) {
  const app = new Hono<{ Bindings: Env }>();

  app.post(REPORT_API.reports, async (c) => {
    const env = c.env;
    if (!(await reportsOn(env.DB))) return fail("unavailable", "flag reports are off");
    const db = env.DB!;
    const now = deps.now();

    const device = c.req.header(HEADER.device) ?? "";
    if (!DEVICE_ID.test(device)) return fail("bad_request", "the device id is missing");
    // Only a device that has the Magic Key may send: the same proof as the tutor and the definitions, and wrong proofs are counted per caller.
    // A caller past its wrong guesses for the hour is told to wait (429), not that its key is wrong.
    const caller = await callerOf(c.req.header("cf-connecting-ip"));
    const checked = await gate(env, now, caller, device, c.req.header(HEADER.proof) ?? "");
    if (!checked.ok) return keyRefusal(checked, now, "the Magic Key does not match");
    const body = await readObject(c, REPORT_LIMITS.body);
    if (body === "too_large") return fail("too_large", "the request is too large");
    if (!body) return fail("bad_request", "the body is not a report request");
    const sends = readSends(body.send);
    if (typeof sends === "string") return fail("bad_request", sends);
    const asked = readIds(body.withdraw, "withdraw", REPORT_LIMITS.withdraw);
    if (typeof asked === "string") return fail("bad_request", asked);
    const heard = readIds(body.status, "status", REPORT_LIMITS.status);
    if (typeof heard === "string") return fail("bad_request", heard);
    if (!sends.length && !asked.length && !heard.length) return fail("bad_request", "nothing to send, take back or ask about");
    // a report sent in the same request is sent again, not taken back
    const withdrawn = asked.filter((id) => !sends.some((r) => r.id === id));

    const user = (await sessionOf(c, now).catch(() => null))?.userId ?? null;
    const statements: D1PreparedStatement[] = [];

    if (sends.length) {
      const day = dayOf(now);
      // Hand-made flags and automatic ones (AUTO_FLAGS, src/domain/flags.ts) are counted apart, so that neither can use up the other's day.
      const kinds = [
        { n: sends.filter((r) => !autoFlagOf(r.flag)).length, prefix: "", cap: REPORT_LIMITS },
        { n: sends.filter((r) => autoFlagOf(r.flag)).length, prefix: "auto:", cap: REPORT_LIMITS.auto },
      ];
      const scopes = kinds
        .filter((k) => k.n > 0)
        .flatMap((k) => [
          { who: `${k.prefix}dev:${device}`, cap: k.cap.perDevice, n: k.n },
          { who: `${k.prefix}ip:${caller}`, cap: k.cap.perCaller, n: k.n },
          { who: `${k.prefix}all`, cap: k.cap.perDay, n: k.n },
        ]);
      const used = await db
        .prepare(`SELECT who, n FROM flag_quota WHERE day = ?1 AND who IN (${scopes.map((_, i) => `?${i + 2}`).join(", ")})`)
        .bind(day, ...scopes.map((s) => s.who))
        .all<{ who: string; n: number }>();
      const full = scopes.some((s) => (used.results.find((r) => r.who === s.who)?.n ?? 0) + s.n > s.cap);
      const held = (await db.prepare("SELECT COUNT(*) AS n FROM flag_reports").first<{ n: number }>())?.n ?? 0;
      if (full || held + sends.length > REPORT_LIMITS.held) {
        const tomorrow = Date.parse(day) + 86_400_000;
        return fail("quota", "too many flags were sent today; try again tomorrow", { "retry-after": String(Math.max(60, Math.ceil((tomorrow - now.getTime()) / 1000))) });
      }
      const stamp = now.toISOString();
      // The same words sent again keep their review; changed words (or a changed answer) start it again, and a review that is running is dropped (claimed_at is the guard, worker/review.ts).
      // An automatic flag is not reviewed by the models: it is stored as with the maintainer, who decides (docs/SERVER.md, "Reviewing flags").
      const same = "flag_reports.digest = excluded.digest";
      const keep = (column: string) => `${column} = CASE WHEN ${same} THEN flag_reports.${column} ELSE NULL END`;
      const first = (column: string) => `${column} = CASE WHEN ${same} THEN flag_reports.${column} ELSE excluded.${column} END`;
      const upsert = db.prepare(
        `INSERT INTO flag_reports (device, id, user_id, caller, flag, answer, app, digest, state, outcome, reason, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?10, ?11, ?12, ?9, ?9)
         ON CONFLICT (device, id) DO UPDATE SET user_id = excluded.user_id, caller = excluded.caller, flag = excluded.flag, answer = excluded.answer, app = excluded.app, digest = excluded.digest,
           ${first("state")},
           updated_at = CASE WHEN ${same} THEN flag_reports.updated_at ELSE excluded.updated_at END,
           attempts = CASE WHEN ${same} THEN flag_reports.attempts ELSE 0 END,
           ${first("outcome")}, ${first("reason")},
           ${["reply", "reply_at", "cause", "fix", "reviews", "reviewed_at", "claimed_at"].map(keep).join(", ")}`,
      );
      const version = typeof body.app === "string" ? body.app.slice(0, 40) : null;
      for (const r of sends) {
        const auto = autoFlagOf(r.flag);
        const start = auto ? { state: "maintainer", outcome: "escalate", reason: `automatic flag (${auto}): not reviewed by the models; the maintainer decides` } : { state: "sent", outcome: null, reason: null };
        statements.push(upsert.bind(device, r.id, user, caller, JSON.stringify(r.flag), r.answer === null ? null : JSON.stringify(r.answer), version, await digestOf(r), stamp, start.state, start.outcome, start.reason));
        // the same flag edited on another device of the account replaces the report that device sent
        if (user) statements.push(db.prepare("DELETE FROM flag_reports WHERE user_id = ?1 AND id = ?2 AND device <> ?3").bind(user, r.id, device));
      }
      for (const s of scopes) {
        statements.push(db.prepare("INSERT INTO flag_quota (day, who, n) VALUES (?1, ?2, ?3) ON CONFLICT (day, who) DO UPDATE SET n = n + excluded.n").bind(day, s.who, s.n));
      }
    }

    // a report can be taken back by the device that sent it, and by any device signed in to the account that did
    for (const id of withdrawn) {
      statements.push(db.prepare("DELETE FROM flag_reports WHERE id = ?1 AND (device = ?2 OR (user_id IS NOT NULL AND user_id = ?3))").bind(id, device, user));
    }
    await db.batch(statements);
    if (sends.length && Math.random() < 0.02) await db.prepare("DELETE FROM flag_quota WHERE day < ?1").bind(dayOf(new Date(now.getTime() - 3 * 86_400_000))).run().catch(() => {});

    const answer: ReportResponse = { stored: sends.map((r) => r.id), withdrawn };
    // asked after the changes above, so that a report sent in the same request is found; one taken back is not
    if (heard.length) answer.status = await statusOf(db, heard, device, user);
    return new Response(JSON.stringify(answer), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  });

  return app;
}
