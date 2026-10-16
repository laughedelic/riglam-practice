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
import { accountsOn, fail, readObject, renewCookie, sessionOf, type AccountDeps } from "./accounts";
import { readAccountConfig } from "./config";
import { dayOf } from "./budget";
import type { Env } from "./env";

/** A device whose clock is ahead gets its writes dated at most this far in the future, so that one wrong clock cannot make its copy unbeatable. */
const FUTURE_MS = 5 * 60_000;

/** The most text of documents one answer carries (its documents are at most 256 KiB each; the first one is always sent). Counted in characters. */
const ANSWER_CHARS = 4 * 1024 * 1024;

/** A deletion mark is kept this long (by the time of the change); a device that was away for longer may not learn of the deletion. */
const MARK_MS = 90 * 86_400_000;

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

/** What these writes would add, counting only those that would win against the stored copy: live documents (below zero when they remove more than they add) and rows (documents and deletion marks). */
async function effectOf(db: D1Database, user: string, writes: SyncChange[]): Promise<{ live: number; rows: number }> {
  const stored = new Map<string, { t: number; live: number }>();
  for (let i = 0; i < writes.length; i += 40) {
    const part = writes.slice(i, i + 40);
    const pairs = part.map((_, k) => `(?${2 * k + 2}, ?${2 * k + 3})`).join(", ");
    const found = await db
      .prepare(`SELECT col, id, t, data IS NOT NULL AS live FROM docs WHERE user_id = ?1 AND (col, id) IN (VALUES ${pairs})`)
      .bind(user, ...part.flatMap((w) => [w.c, w.id]))
      .all<{ col: string; id: string; t: number; live: number }>();
    for (const r of found.results) stored.set(`${r.col}/${r.id}`, { t: r.t, live: r.live });
  }
  let live = 0;
  let rows = 0;
  for (const w of writes) {
    const have = stored.get(`${w.c}/${w.id}`);
    if (!have) rows += 1;
    if (have && !(w.t > have.t)) continue; // loses: the stored copy stays
    live += (w.doc !== null ? 1 : 0) - (have?.live ? 1 : 0);
  }
  return { live, rows };
}

export function syncRoutes(deps: AccountDeps) {
  const app = new Hono<{ Bindings: Env }>();
  app.use(ACCOUNT_API.sync, renewCookie);

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
    let rejectedChars = 0;
    if (writes.length) {
      const cfg = readAccountConfig(env);
      const day = dayOf(now);
      if (writes.length > cfg.dailyWrites) return fail("too_large", `at most ${cfg.dailyWrites} document changes in one request for this account; send fewer at a time`);

      // The room for documents, and for rows (documents and deletion marks, which an account could otherwise add without end). The counts plus the writes that could add
      // a document or a row are the upper bound; only when that is over is the exact change worked out (an update of a document that is held, or a deletion beside a new
      // document, adds no document; a write to a row that is there adds no row). The check is made before the writes, so requests arriving together can pass it together:
      // the limits may be passed by about one request's worth per request in flight, which the daily limit below bounds.
      const counts = () => db.prepare("SELECT COUNT(*) AS total, COUNT(data) AS live FROM docs WHERE user_id = ?1").bind(user).first<{ total: number; live: number }>();
      const held = (await counts()) ?? { total: 0, live: 0 };
      const live = held.live;
      let total = held.total;
      let effect: { live: number; rows: number } | undefined;
      const exact = async () => (effect ??= await effectOf(db, user, writes));
      const adds = writes.filter((w) => w.doc !== null).length;
      if (adds && live + adds > cfg.maxDocs && live + (await exact()).live > cfg.maxDocs) return fail("quota", "this account holds as many documents as it may");
      if (total + writes.length > cfg.maxDocs * 2) {
        // Old deletion marks go first, a thousand at a time.
        await db
          .prepare("DELETE FROM docs WHERE user_id = ?1 AND (col, id) IN (SELECT col, id FROM docs WHERE user_id = ?1 AND data IS NULL AND t < ?2 LIMIT 1000)")
          .bind(user, now.getTime() - MARK_MS)
          .run();
        total = (await counts())?.total ?? 0;
        if (total + writes.length > cfg.maxDocs * 2 && total + (await exact()).rows > cfg.maxDocs * 2) return fail("quota", "this account holds as many documents and deletion marks as it may");
      }

      // The day's allowance is taken first, in one statement that refuses when it would be passed, so that requests arriving together cannot all use the last of it.
      // It is for an account that exists, so the counter of a deleted account is not made again.
      const taken = await db
        .prepare(
          `INSERT INTO sync_quota (day, user_id, writes) SELECT ?1, ?2, ?3 WHERE EXISTS (SELECT 1 FROM users WHERE id = ?2)
           ON CONFLICT (day, user_id) DO UPDATE SET writes = writes + excluded.writes WHERE writes + excluded.writes <= ?4`,
        )
        .bind(day, user, writes.length, cfg.dailyWrites)
        .run();
      if (!taken.meta.changes) {
        const alive = await db.prepare("SELECT 1 AS ok FROM users WHERE id = ?1").bind(user).first();
        return alive ? fail("quota", "this account has reached its limit of document changes for today", { "retry-after": "3600" }) : fail("signed_out", "you are not signed in");
      }

      // The next number in the user's sequence is taken in the same statement that stores the document, and a batch runs as one transaction, so two requests cannot hand out the same one.
      // A document is stored only for an account that exists when the statement runs: one deleted since the session was read gets nothing.
      const upsert = db.prepare(
        `INSERT INTO docs (user_id, col, id, data, t, seq)
         SELECT ?1, ?2, ?3, ?4, ?5, (SELECT COALESCE(MAX(seq), 0) + 1 FROM docs WHERE user_id = ?1) WHERE EXISTS (SELECT 1 FROM users WHERE id = ?1)
         ON CONFLICT (user_id, col, id) DO UPDATE SET data = excluded.data, t = excluded.t, seq = excluded.seq WHERE excluded.t > docs.t`,
      );
      const results = await db.batch(writes.map((w) => upsert.bind(user, w.c, w.id, w.doc === null ? null : JSON.stringify(w.doc), w.t)));
      // The server's copies of the writes that lost, as much of them as one answer may carry. Their sizes are asked first (no text comes with them), so that
      // small writes against large stored copies cannot make the Worker load more than that. A copy that does not fit and that the device has not been given
      // yet (it is after the cursor) comes with the changes anyway; one the device has is given a new place in the sequence, so that it comes with them too.
      const lost = writes.filter((_, i) => !results[i].meta.changes);
      const sizes: { col: string; id: string; seq: number; n: number }[] = [];
      for (let i = 0; i < lost.length; i += 40) {
        const part = lost.slice(i, i + 40);
        const pairs = part.map((_, k) => `(?${2 * k + 2}, ?${2 * k + 3})`).join(", ");
        const found = await db
          .prepare(`SELECT col, id, seq, COALESCE(LENGTH(data), 0) AS n FROM docs WHERE user_id = ?1 AND (col, id) IN (VALUES ${pairs})`)
          .bind(user, ...part.flatMap((w) => [w.c, w.id]))
          .all<{ col: string; id: string; seq: number; n: number }>();
        sizes.push(...found.results);
      }
      const fits: typeof sizes = [];
      const late: typeof sizes = [];
      for (const r of sizes) {
        if (rejectedChars + r.n <= ANSWER_CHARS) {
          rejectedChars += r.n;
          fits.push(r);
        } else if (r.seq <= cursor) late.push(r);
      }
      for (let i = 0; i < fits.length; i += 40) {
        const part = fits.slice(i, i + 40);
        const pairs = part.map((_, k) => `(?${2 * k + 2}, ?${2 * k + 3})`).join(", ");
        const found = await db
          .prepare(`SELECT col, id, data, t FROM docs WHERE user_id = ?1 AND (col, id) IN (VALUES ${pairs})`)
          .bind(user, ...part.flatMap((w) => [w.col, w.id]))
          .all<Row>();
        rejected.push(...found.results.map(change));
      }
      if (late.length) {
        const next = db.prepare("UPDATE docs SET seq = (SELECT MAX(seq) + 1 FROM docs WHERE user_id = ?1) WHERE user_id = ?1 AND col = ?2 AND id = ?3");
        await db.batch(late.map((r) => next.bind(user, r.col, r.id)));
      }
      if (Math.random() < 0.02) await db.prepare("DELETE FROM sync_quota WHERE day < ?1").bind(dayOf(new Date(now.getTime() - 3 * 86_400_000))).run().catch(() => {});
    }

    // One answer is bounded in documents and in text: the rejected copies come first, the changes take what is left of the text (at least the first one, whatever its size).
    // `total` is how many the page had before the text limit cut it, so that `more` is true when the cut left some behind.
    const rows = (
      await db
        .prepare(
          `WITH page AS (SELECT col, id, data, t, seq FROM docs WHERE user_id = ?1 AND seq > ?2 ORDER BY seq LIMIT ?3),
                sized AS (SELECT col, id, data, t, seq, SUM(COALESCE(LENGTH(data), 0)) OVER (ORDER BY seq) AS cum, ROW_NUMBER() OVER (ORDER BY seq) AS n, (SELECT COUNT(*) FROM page) AS total FROM page)
           SELECT col, id, data, t, seq, total FROM sized WHERE n <= ?4 AND (n = 1 OR cum <= ?5) ORDER BY seq`,
        )
        .bind(user, cursor, SYNC_LIMITS.changes + 1, SYNC_LIMITS.changes, Math.max(0, ANSWER_CHARS - rejectedChars))
        .all<Row & { total: number }>()
    ).results;
    const page = rows;
    const more = (page[0]?.total ?? 0) > page.length;
    const answer: SyncResponse = { cursor: page.length ? page[page.length - 1].seq : cursor, changes: page.map(change), rejected, more };
    return new Response(JSON.stringify(answer), { headers: { "content-type": "application/json", "cache-control": "no-store" } });
  });

  return app;
}
