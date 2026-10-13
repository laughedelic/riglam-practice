// The server copy of a signed-in person's documents (docs/SERVER.md, "Accounts and sync").
//
//   POST /api/sync   { cursor, writes } -> { cursor, changes, rejected, more }
//
// One request does both directions: the device sends the changes it made since the last time, and gets back what changed
// on the server since its cursor. For one document the later write wins (`t`, the time the device made the change); on a
// tie the server's copy stays. A deletion is a write with no document, kept as a row so that other devices learn of it.
// The server never merges inside a document and never looks at what is in it beyond its size.

import { Hono } from "hono";
import { ACCOUNT_API, SYNC_COLLECTIONS, SYNC_LIMITS, validDocId, type Doc, type SyncChange, type SyncResponse } from "../src/account/protocol";
import { accountsOn, fail, readObject, sessionOf, type AccountDeps } from "./accounts";
import { readAccountConfig } from "./config";
import { dayOf } from "./budget";
import type { Env } from "./env";

/** A device whose clock is ahead gets its writes dated at most this far in the future, so that one wrong clock cannot make its copy unbeatable. */
const FUTURE_MS = 5 * 60_000;

interface Row {
  col: string;
  id: string;
  data: string | null;
  t: number;
  seq: number;
}

const change = (r: Pick<Row, "col" | "id" | "data" | "t">): SyncChange => ({ c: r.col, id: r.id, doc: r.data === null ? null : (JSON.parse(r.data) as Doc), t: r.t });

const isPlain = (v: unknown): v is Doc => !!v && typeof v === "object" && !Array.isArray(v);

/** The writes of a request, checked; or the reason it is refused. The last of several writes to one document counts. */
function readWrites(raw: unknown, now: Date): SyncChange[] | string {
  if (!Array.isArray(raw)) return "writes must be a list";
  if (raw.length > SYNC_LIMITS.writes) return `at most ${SYNC_LIMITS.writes} writes in one request`;
  const latest = new Map<string, SyncChange>();
  for (const w of raw) {
    if (!isPlain(w) || typeof w.c !== "string" || !(SYNC_COLLECTIONS as readonly string[]).includes(w.c) || !validDocId(w.id)) return "a write names a document that does not exist in this app";
    if (typeof w.t !== "number" || !Number.isFinite(w.t) || w.t < 0) return "a write has no valid time";
    let doc: Doc | null = null;
    if (w.doc !== null) {
      if (!isPlain(w.doc)) return "a document must be an object or null";
      if (JSON.stringify(w.doc).length > SYNC_LIMITS.docBytes) return "a document is too large";
      doc = w.doc;
    }
    const t = Math.min(Math.floor(w.t), now.getTime() + FUTURE_MS);
    const key = `${w.c}/${w.id}`;
    const have = latest.get(key);
    if (!have || t >= have.t) latest.set(key, { c: w.c, id: w.id, doc, t });
  }
  return [...latest.values()];
}

export function syncRoutes(deps: AccountDeps) {
  const app = new Hono<{ Bindings: Env }>();

  app.post(ACCOUNT_API.sync, async (c) => {
    const env = c.env;
    if (!(await accountsOn(env.DB))) return fail("unavailable", "accounts are off");
    const db = env.DB!;
    const now = deps.now();
    if (c.req.header("origin") !== new URL(c.req.url).origin) return fail("not_granted", "the request is not from the app");
    const session = await sessionOf(c, now);
    if (!session) return fail("signed_out", "you are not signed in");
    const user = session.userId;

    const body = await readObject(c, SYNC_LIMITS.body);
    if (body === "too_large") return fail("too_large", "the request is too large");
    if (!body) return fail("bad_request", "the body is not a sync request");
    const cursor = body.cursor;
    if (typeof cursor !== "number" || !Number.isInteger(cursor) || cursor < 0) return fail("bad_request", "the cursor is not a number");
    const writes = readWrites(body.writes ?? [], now);
    if (typeof writes === "string") return fail("bad_request", writes);

    const rejected: SyncChange[] = [];
    if (writes.length) {
      const cfg = readAccountConfig(env);
      const day = dayOf(now);
      const used = (await db.prepare("SELECT writes FROM sync_quota WHERE day = ?1 AND user_id = ?2").bind(day, user).first<{ writes: number }>())?.writes ?? 0;
      if (used + writes.length > cfg.dailyWrites) return fail("quota", "this account has reached its limit of document changes for today", { "retry-after": "3600" });
      const adds = writes.filter((w) => w.doc !== null).length;
      if (adds) {
        const held = (await db.prepare("SELECT COUNT(*) AS n FROM docs WHERE user_id = ?1 AND data IS NOT NULL").bind(user).first<{ n: number }>())?.n ?? 0;
        if (held + adds > cfg.maxDocs) return fail("quota", "this account holds as many documents as it may");
      }
      // The next number in the user's sequence is taken in the same statement that stores the document, and a batch runs as one transaction, so two requests cannot hand out the same one.
      const upsert = db.prepare(
        `INSERT INTO docs (user_id, col, id, data, t, seq) VALUES (?1, ?2, ?3, ?4, ?5, (SELECT COALESCE(MAX(seq), 0) + 1 FROM docs WHERE user_id = ?1))
         ON CONFLICT (user_id, col, id) DO UPDATE SET data = excluded.data, t = excluded.t, seq = excluded.seq WHERE excluded.t > docs.t`,
      );
      const results = await db.batch([
        ...writes.map((w) => upsert.bind(user, w.c, w.id, w.doc === null ? null : JSON.stringify(w.doc), w.t)),
        db.prepare("INSERT INTO sync_quota (day, user_id, writes) VALUES (?1, ?2, ?3) ON CONFLICT (day, user_id) DO UPDATE SET writes = writes + excluded.writes").bind(day, user, writes.length),
      ]);
      // The server's copies of the writes that lost, a few dozen to a query (D1 allows 100 values in one).
      const lost = writes.filter((_, i) => !results[i].meta.changes);
      for (let i = 0; i < lost.length; i += 40) {
        const part = lost.slice(i, i + 40);
        const pairs = part.map((_, k) => `(?${2 * k + 2}, ?${2 * k + 3})`).join(", ");
        const found = await db
          .prepare(`SELECT col, id, data, t FROM docs WHERE user_id = ?1 AND (col, id) IN (VALUES ${pairs})`)
          .bind(user, ...part.flatMap((w) => [w.c, w.id]))
          .all<Row>();
        rejected.push(...found.results.map(change));
      }
      if (Math.random() < 0.02) await db.prepare("DELETE FROM sync_quota WHERE day < ?1").bind(dayOf(new Date(now.getTime() - 3 * 86_400_000))).run().catch(() => {});
    }

    const rows = (
      await db
        .prepare("SELECT col, id, data, t, seq FROM docs WHERE user_id = ?1 AND seq > ?2 ORDER BY seq LIMIT ?3")
        .bind(user, cursor, SYNC_LIMITS.changes + 1)
        .all<Row>()
    ).results;
    const more = rows.length > SYNC_LIMITS.changes;
    const page = more ? rows.slice(0, SYNC_LIMITS.changes) : rows;
    const answer: SyncResponse = { cursor: page.length ? page[page.length - 1].seq : cursor, changes: page.map(change), rejected, more };
    return new Response(JSON.stringify(answer), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  });

  return app;
}
