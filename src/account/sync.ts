// Keeps this device's documents and the server copy of a signed-in account the same (docs/SERVER.md, "Accounts and sync").
//
// The page writes to the local store as always. Every write is also noted in the outbox, one entry per document. A round
// sends the outbox and receives what changed on the server since the last cursor. For one document the later change wins
// (`t`, when it was made on the device); a tie keeps the server's copy. Nothing here knows about the page, the DOM or
// the network: the store, the outbox, the request and the clock are given, which is what the tests use.

import { SYNC_COLLECTIONS, SYNC_LIMITS, validDocId, type Doc, type SyncChange, type SyncRequest, type SyncResponse } from "./protocol";
import type { Outbox, OutboxEntry } from "./outbox";

/** Why a round did not complete. */
export type SyncCode = "offline" | "signed_out" | "quota" | "full" | "too_large" | "unavailable";

export class SyncError extends Error {
  constructor(public code: SyncCode, message: string = code) {
    super(message);
  }
}

/** The part of the local store (src/pwa/local-db.ts) that sync uses. */
export interface SyncStore {
  onWrite(fn: (w: { col: string; id: string; data: Doc | null }) => void): () => void;
  /** Stores the server's copy. When `revision` is given and the document has been written since `revision(col, id)` returned it, nothing is stored: the newer local write wins and is noted for the next round. */
  applyRemote(col: string, id: string, data: Doc | null, revision?: number): Promise<void>;
  /** a number that changes whenever the document is written here (by the page, another tab or `applyRemote`), including a write that is still being saved */
  revision(col: string, id: string): number;
  /** every document of a collection as it is now */
  documents(col: string): Promise<{ id: string; data: Doc }[]>;
  /** one document as it is now, or null */
  read(col: string, id: string): Promise<Doc | null>;
}

export interface SyncStatus {
  /** sending is allowed (signed in); otherwise changes are only noted */
  active: boolean;
  /** a round is running */
  busy: boolean;
  /** changes noted and not yet sent */
  pending: number;
  /** when the last round completed, ms since the epoch */
  last: number | null;
  /** why the last round failed; null after one that completed */
  error: SyncCode | null;
}

export interface SyncDeps {
  store: SyncStore;
  outbox: Outbox;
  /** one request to the server; rejects with a SyncError */
  post(request: SyncRequest): Promise<SyncResponse>;
  now?: () => number;
  /** runs `fn` unless another tab of the app is already in a round (Web Locks); the default runs it */
  exclusive?: <T>(fn: () => Promise<T>) => Promise<T | undefined>;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (id: unknown) => void;
  /** wait after a change before sending, so that a burst of answers is one request */
  debounceMs?: number;
  /** the first wait after a failure; it doubles up to `maxBackoffMs` */
  backoffMs?: number;
  maxBackoffMs?: number;
  /** the wait after the server says the account's limit for the day is used */
  quotaWaitMs?: number;
  /** the server answered that the person is not signed in (any more) */
  onSignedOut?: () => void;
}

export interface Sync {
  /** Begins noting this device's writes without sending them. Call it at start when an account was used before. Resolves to that account's id, or null. */
  resume(): Promise<string | null>;
  /** The person signed in as `userId`: send what is noted, receive the rest. */
  activate(userId: string): Promise<void>;
  /** Stop sending (signed out); changes are still noted for the next sign-in. */
  deactivate(): void;
  /** The account is gone (deleted): drop everything noted and stop noting. */
  forget(): Promise<void>;
  /** Run a round soon (after the debounce), unless the last one failed and its wait has not passed. */
  kick(): void;
  /** Run rounds now until nothing is left to send or receive; resolves once they are done. Ignores a failure's wait. */
  syncNow(): Promise<SyncStatus>;
  status(): SyncStatus;
  subscribe(fn: (s: SyncStatus) => void): () => void;
  close(): void;
}

const keyOf = (c: string, id: string) => `${c}/${id}`;
const isPlain = (v: unknown): v is Doc => !!v && typeof v === "object" && !Array.isArray(v);

/** The text of `value` with object keys in order, so that two copies of a document compare equal whatever store they came from. */
export function canon(value: unknown): string {
  if (Array.isArray(value)) return "[" + value.map(canon).join(",") + "]";
  if (isPlain(value)) return "{" + Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => JSON.stringify(k) + ":" + canon(value[k])).join(",") + "}";
  return JSON.stringify(value) ?? "null";
}

/** When a document was last changed, from the timestamps the page puts in it (src/store/transfer.ts has the same rule for imports). */
export function stampOf(doc: Doc): number | undefined {
  let best: number | undefined;
  for (const k of ["at", "verifiedAt", "updatedAt"]) {
    const t = typeof doc[k] === "string" ? Date.parse(doc[k] as string) : NaN;
    if (!Number.isNaN(t) && (best === undefined || t > best)) best = t;
  }
  return best;
}

const size = (doc: Doc | null) => (doc === null ? 0 : JSON.stringify(doc).length);
const encoder = new TextEncoder();
/** What a document adds to a request body: bytes in UTF-8, which is what the server's limit on the body counts. */
const bodyBytes = (doc: Doc | null) => (doc === null ? 0 : encoder.encode(JSON.stringify(doc)).length);
const known = (c: string, id: string) => (SYNC_COLLECTIONS as readonly string[]).includes(c) && validDocId(id);

export function createSync(deps: SyncDeps): Sync {
  const { store, outbox } = deps;
  const now = deps.now ?? Date.now;
  const exclusive = deps.exclusive ?? (async (fn) => fn());
  const setTimer = deps.setTimer ?? ((fn, ms) => setTimeout(fn, ms));
  const clearTimer = deps.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>));
  const debounceMs = deps.debounceMs ?? 1500;
  const backoffMs = deps.backoffMs ?? 15_000;
  const maxBackoffMs = deps.maxBackoffMs ?? 15 * 60_000;
  const quotaWaitMs = deps.quotaWaitMs ?? 60 * 60_000;

  let active = false;
  let busy = false;
  let pending = 0;
  let last: number | null = null;
  let error: SyncCode | null = null;
  let failures = 0;
  let blockedUntil = 0;
  let timer: unknown = null;
  let unhook: (() => void) | null = null;
  let closed = false;
  let again = false; // a round was asked for while one was running
  let running: Promise<void> | null = null; // the round in progress
  let counted = 0;
  let generation = 0; // changes whenever the account this device syncs for changes or ends, so that an answer that was awaited across such a change is not applied
  let batchMax: number = SYNC_LIMITS.writes; // the most writes sent in one request; the server's answer that a request is too large for the account lowers it
  // Writes whose note could not be stored (the outbox failed). They are kept here and noted again at the start of the next round.
  const unnoted = new Map<string, { col: string; id: string; data: Doc | null; t: number }>();
  const listeners = new Set<(s: SyncStatus) => void>();

  const status = (): SyncStatus => ({ active, busy, pending, last, error });
  const publish = () => { const s = status(); for (const fn of [...listeners]) { try { fn(s); } catch { /* a listener's failure is its own */ } } };
  const recount = async () => { counted = await outbox.count().catch(() => counted); pending = counted + unnoted.size; };

  /** Notes a change. The time is kept above that of the earlier entry for the document (the outbox does it in one step), so that "sent, then changed again" is told apart from "sent". */
  async function note(c: string, id: string, doc: Doc | null, t: number) {
    if (!known(c, id) || size(doc) > SYNC_LIMITS.docBytes) return;
    await outbox.note({ key: keyOf(c, id), c, id, doc, t });
  }

  function hook() {
    if (unhook) return;
    unhook = store.onWrite((w) => {
      const t = now();
      const key = keyOf(w.col, w.id);
      void note(w.col, w.id, w.data, t)
        .then(() => void unnoted.delete(key))
        .catch(() => {
          // The document is saved here but its note is not: keep it for the next round, and make sure that round happens.
          unnoted.set(key, { col: w.col, id: w.id, data: w.data, t });
          void outbox.setMeta("seeded", null).catch(() => {}); // if the page is closed before then, the next sign-in offers every document again
          error = "unavailable";
        })
        .then(recount)
        .then(() => { publish(); if (active) kick(); })
        .catch(() => {});
    });
  }

  /** Notes again what could not be noted. Throws when the outbox still fails, which makes the round fail and wait. */
  async function renote() {
    for (const [key, w] of [...unnoted]) {
      if (unnoted.get(key) !== w) continue; // noted, or written again, while an earlier one was being stored: this copy is out of date
      try {
        await note(w.col, w.id, w.data, w.t);
      } catch {
        throw new SyncError("unavailable");
      }
      if (unnoted.get(key) === w) unnoted.delete(key);
    }
  }

  /** Notes every document on this device as a change at its own timestamp, unless the document already has an entry. */
  async function noteAll() {
    for (const c of SYNC_COLLECTIONS) {
      for (const d of await store.documents(c)) {
        if (!known(c, d.id) || size(d.data) > SYNC_LIMITS.docBytes || unnoted.has(keyOf(c, d.id))) continue; // one whose note failed is noted again by the round
        await outbox.putIfAbsent({ key: keyOf(c, d.id), c, id: d.id, doc: d.data, t: stampOf(d.data) ?? 0 });
      }
    }
  }

  function kick() {
    if (closed || !active || timer !== null) return;
    const wait = Math.max(debounceMs, blockedUntil - now());
    timer = setTimer(() => { timer = null; void round().catch(() => {}); }, wait);
  }

  /** What to do with the server's copy of a document. */
  async function take(ch: SyncChange) {
    const key = keyOf(ch.c, ch.id);
    if (!known(ch.c, ch.id)) return;
    const revision = store.revision(ch.c, ch.id); // taken before anything is awaited: a write after this point is newer than what is judged below
    const mine = await outbox.get(key);
    if (mine && mine.t > ch.t) return; // changed here after that: this copy goes to the server next
    const have = await store.read(ch.c, ch.id);
    // The entry goes only once the copy is stored (or was already): if storing fails, the round fails and the entry is sent again, which brings this copy back.
    if (!(ch.doc === null ? have === null : have !== null && canon(have) === canon(ch.doc))) await store.applyRemote(ch.c, ch.id, ch.doc, revision);
    if (mine) await outbox.remove(key, mine.t);
  }

  /** The entries for one request: oldest first, within the limits of the server. */
  async function batch(deletionsOnly = false): Promise<OutboxEntry[]> {
    const out: OutboxEntry[] = [];
    let bytes = 0;
    for (const e of await outbox.list(batchMax, deletionsOnly ? "deletions" : undefined)) {
      bytes += bodyBytes(e.doc) + 200;
      if (out.length && bytes > SYNC_LIMITS.body - 64 * 1024) break;
      out.push(e);
    }
    return out;
  }

  /** Makes sure the documents this device had before the account are noted (a scan that failed or was cut short starts again). Throws a SyncError when the outbox fails. */
  async function ensureSeeded() {
    try {
      const user = (await outbox.getMeta<string>("user")) ?? null;
      if (user && (await outbox.getMeta<string>("seeded")) !== user) {
        await noteAll();
        await outbox.setMeta("seeded", user); // only now: a page closed during the scan starts it again
      }
    } catch {
      throw new SyncError("unavailable");
    }
  }

  /** One request with `sent` as its writes, and what to do with the answer. Returns whether there may be more to do. */
  async function exchange(sent: OutboxEntry[]): Promise<boolean> {
    const mine = generation;
    const user = (await outbox.getMeta<string>("user")) ?? null;
    const cursor = (await outbox.getMeta<number>("cursor")) ?? 0;
    const res = await deps.post({ cursor, writes: sent.map((e) => ({ c: e.c, id: e.id, doc: e.doc, t: e.t })) });
    // The account may have changed while the request was out (here, or in another tab, which changes the outbox's user): this answer is for the earlier one.
    if (mine !== generation || (await outbox.getMeta<string>("user")) !== user) return false;
    // What was sent is delivered: gone from the outbox unless the document was changed again meanwhile. The writes that lost stay until the server's copy is stored.
    const lost = new Set(res.rejected.map((ch) => keyOf(ch.c, ch.id)));
    for (const e of sent) if (!lost.has(e.key)) await outbox.remove(e.key, e.t);
    // The server's copies of writes that lost come first, then everything that changed; the later one of the same document is the newer.
    for (const ch of res.rejected) await take(ch);
    for (const ch of res.changes) await take(ch);
    await outbox.setMeta("cursor", res.cursor);
    await recount();
    return res.more || pending > 0;
  }

  async function oneRequest(): Promise<boolean> {
    await ensureSeeded();
    await renote();
    const sent = await batch();
    try {
      return await exchange(sent);
    } catch (e) {
      if (!(e instanceof SyncError)) throw e;
      // The request is larger than the account's allowance for a day allows: ask again with half as many writes.
      if (e.code === "too_large" && sent.length > 1) {
        batchMax = Math.max(1, Math.floor(sent.length / 2));
        return true;
      }
      // The account holds as many documents as it may. Deletions make room, so they go first; what other devices changed is received in any case (a request without writes is never refused for this).
      if (e.code === "full") {
        const deletions = await batch(true);
        let freed = false;
        if (deletions.length && deletions.length < sent.length) {
          try {
            freed = await exchange(deletions).then(() => true);
          } catch (e2) {
            if (!(e2 instanceof SyncError) || e2.code !== "full") throw e2;
          }
        }
        await exchange([]);
        if (freed) return true;
      }
      throw e;
    }
  }

  /** Starts a round, or joins the one in progress (and asks for another after it, for what changed meanwhile). */
  function round(): Promise<void> {
    if (closed || !active) return Promise.resolve();
    if (running) { again = true; return running; }
    return (running = run());
  }

  async function run() {
    busy = true;
    publish();
    try {
      const ran = await exclusive(async () => {
        for (let guard = 0; guard < 1000 && active && (await oneRequest()); guard++);
        return true;
      });
      error = null;
      failures = 0;
      blockedUntil = 0;
      if (ran) last = now();
    } catch (e) {
      const code = e instanceof SyncError ? e.code : "unavailable";
      error = code;
      if (code === "signed_out") {
        active = false;
        deps.onSignedOut?.();
      } else {
        failures += 1;
        blockedUntil = now() + (code === "quota" ? quotaWaitMs : Math.min(maxBackoffMs, backoffMs * 2 ** (failures - 1)));
      }
    } finally {
      busy = false;
      await recount();
      publish();
      const rerun = again;
      again = false;
      running = null; // read and cleared together with `again`, so that a request for a round is never lost between the two
      if (error === null && (rerun || pending > 0)) kick();
      else if (error !== null && error !== "signed_out" && active) kick();
    }
  }

  return {
    async resume() {
      const user = (await outbox.getMeta<string>("user")) ?? null;
      if (user) { hook(); await recount(); publish(); }
      return user;
    },
    async activate(userId) {
      generation += 1;
      const before = (await outbox.getMeta<string>("user")) ?? null;
      if (before !== userId) {
        // A first sign-in, or another person's: the cursor and the old noted changes belong to the earlier account.
        await outbox.clear();
        unnoted.clear(); // notes that failed belong to the earlier account too
        await outbox.setMeta("user", userId);
      }
      // Writes made while the documents are being noted are noted by the hook, so it goes first; the scan only adds what has no entry.
      hook();
      active = true;
      error = null;
      failures = 0;
      blockedUntil = 0;
      // A scan that fails (the outbox is not writable just now) does not leave the account unsynced: every round starts it again, after the usual wait.
      try {
        await ensureSeeded();
      } catch {
        error = "unavailable";
        failures = 1;
        blockedUntil = now() + backoffMs;
      }
      await recount();
      publish();
      kick();
    },
    deactivate() {
      generation += 1;
      active = false;
      if (timer !== null) { clearTimer(timer); timer = null; }
      publish();
    },
    async forget() {
      generation += 1;
      active = false;
      unhook?.();
      unhook = null;
      if (timer !== null) { clearTimer(timer); timer = null; }
      await outbox.clear();
      unnoted.clear();
      counted = 0;
      pending = 0;
      last = null;
      error = null;
      publish();
    },
    kick,
    async syncNow() {
      if (!active) return status();
      if (timer !== null) { clearTimer(timer); timer = null; }
      blockedUntil = 0;
      if (running) await running.catch(() => {}); // a round that began before this call may not have seen the latest changes
      await round();
      return status();
    },
    status,
    subscribe(fn) {
      listeners.add(fn);
      return () => void listeners.delete(fn);
    },
    close() {
      closed = true;
      unhook?.();
      unhook = null;
      if (timer !== null) { clearTimer(timer); timer = null; }
    },
  };
}
