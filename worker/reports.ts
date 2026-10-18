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
import { REPORT_API, REPORT_LIMITS, autoFlagOf, type FlagReport, type ReportDoc, type ReportResponse } from "../src/report/protocol";
import { fail, keyRefusal, readObject, sessionOf, type AccountDeps } from "./accounts";
import { dayOf } from "./budget";
import type { Env } from "./env";
import { callerOf, gate } from "./magic";

const isPlain = (v: unknown): v is ReportDoc => !!v && typeof v === "object" && !Array.isArray(v);

/** True when the database has the reports table and the operator has not switched reports off (settings: reports = off). */
export async function reportsOn(db: D1Database | undefined): Promise<boolean> {
  if (!db) return false;
  try {
    // one query: the switch, and a look at the table that fails when the migration has not been applied
    const row = await db.prepare("SELECT (SELECT value FROM settings WHERE key = 'reports') AS v, (SELECT COUNT(*) FROM flag_reports WHERE 0) AS probe").first<{ v: string | null }>();
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

function readWithdrawn(raw: unknown): string[] | string {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) return "withdraw must be a list";
  if (raw.length > REPORT_LIMITS.withdraw) return `at most ${REPORT_LIMITS.withdraw} ids in one request`;
  if (!raw.every(validDocId)) return "withdraw takes flag ids";
  return [...new Set(raw as string[])];
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
    const asked = readWithdrawn(body.withdraw);
    if (typeof asked === "string") return fail("bad_request", asked);
    if (!sends.length && !asked.length) return fail("bad_request", "nothing to send or take back");
    // a report sent in the same request is sent again, not taken back
    const withdrawn = asked.filter((id) => !sends.some((r) => r.id === id));

    const user = (await sessionOf(c, now).catch(() => null))?.userId ?? null;
    const statements: D1PreparedStatement[] = [];
    let giveBack = async () => {};

    if (sends.length) {
      const day = dayOf(now);
      // Hand-made flags and automatic ones (src/report/protocol.ts, AUTO_FLAGS) are counted apart, so that neither can use up the other's day.
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
      // Each scope's share of the day is taken in one statement that fails when it would pass the limit (as the Magic Key's guess limit does),
      // so requests that arrive together cannot all pass; when one scope has no room the shares already taken are given back. The count of
      // reports held is a look, not a reservation: it is a limit on storage, and a few reports over it do no harm.
      let took: D1Result[];
      try {
        took = await db.batch(
          scopes.map((s) =>
            db.prepare("INSERT INTO flag_quota (day, who, n) VALUES (?1, ?2, ?3) ON CONFLICT (day, who) DO UPDATE SET n = n + excluded.n WHERE n + excluded.n <= ?4").bind(day, s.who, s.n, s.cap),
          ),
        );
      } catch {
        return fail("unavailable", "flag reports cannot count what they take");
      }
      const taken = scopes.filter((_, i) => took[i].meta.changes > 0);
      giveBack = async () => {
        await db.batch(taken.map((s) => db.prepare("UPDATE flag_quota SET n = n - ?3 WHERE day = ?1 AND who = ?2").bind(day, s.who, s.n))).catch(() => {});
      };
      const held = (await db.prepare("SELECT COUNT(*) AS n FROM flag_reports").first<{ n: number }>())?.n ?? 0;
      if (taken.length < scopes.length || held + sends.length > REPORT_LIMITS.held) {
        await giveBack();
        const tomorrow = Date.parse(day) + 86_400_000;
        return fail("quota", "too many flags were sent today; try again tomorrow", { "retry-after": String(Math.max(60, Math.ceil((tomorrow - now.getTime()) / 1000))) });
      }
      const stamp = now.toISOString();
      const upsert = db.prepare(
        `INSERT INTO flag_reports (device, id, user_id, caller, flag, answer, app, state, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'sent', ?8, ?8)
         ON CONFLICT (device, id) DO UPDATE SET user_id = excluded.user_id, caller = excluded.caller, flag = excluded.flag, answer = excluded.answer, app = excluded.app, state = 'sent', updated_at = excluded.updated_at`,
      );
      const version = typeof body.app === "string" ? body.app.slice(0, 40) : null;
      for (const r of sends) {
        statements.push(upsert.bind(device, r.id, user, caller, JSON.stringify(r.flag), r.answer === null ? null : JSON.stringify(r.answer), version, stamp));
        // the same flag edited on another device of the account replaces the report that device sent
        if (user) statements.push(db.prepare("DELETE FROM flag_reports WHERE user_id = ?1 AND id = ?2 AND device <> ?3").bind(user, r.id, device));
      }
    }

    // a report can be taken back by the device that sent it, and by any device signed in to the account that did
    for (const id of withdrawn) {
      statements.push(db.prepare("DELETE FROM flag_reports WHERE id = ?1 AND (device = ?2 OR (user_id IS NOT NULL AND user_id = ?3))").bind(id, device, user));
    }
    try {
      await db.batch(statements);
    } catch (e) {
      await giveBack();
      throw e;
    }
    if (sends.length && Math.random() < 0.02) await db.prepare("DELETE FROM flag_quota WHERE day < ?1").bind(dayOf(new Date(now.getTime() - 3 * 86_400_000))).run().catch(() => {});

    const answer: ReportResponse = { stored: sends.map((r) => r.id), withdrawn };
    return new Response(JSON.stringify(answer), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  });

  return app;
}
