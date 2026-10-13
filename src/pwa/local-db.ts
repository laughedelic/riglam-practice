// The artifact `db` capability, backed by IndexedDB on this device.
//
// The page was written against the Claude artifact runtime's document store (a Firestore-style API:
// collection / doc / where / orderBy / limit / onSnapshot, see the runtime's db.d.ts). The installed app
// has no such store yet, so this module implements the same surface locally. When a server exists,
// replace this file by an adapter with the same shape; the page does not change.
//
// Documents are plain JSON objects at "collection/id" paths. All reads are served from memory;
// writes update memory first (listeners see them at once) and are then persisted. Other tabs of the
// same app are told through a BroadcastChannel and reload the changed document.

import type { CollectionRef, Db, DocChange, Doc, DocRef, DocSnapshot, Query, QuerySnapshot, Unsubscribe } from "../platform/types";

const DB_NAME = "riglam";
const STORE = "docs";
const SEGMENT = /^[A-Za-z0-9_\-.~:@+]+$/;

const err = (code: string, message: string) => Object.assign(new Error(message), { code });

function checkPath(path: unknown, kind: "doc" | "collection"): string[] {
  if (typeof path !== "string" || !path) throw new TypeError("path must be a non-empty string");
  const segs = path.split("/");
  if (segs.some((s) => !SEGMENT.test(s) || s === "." || s === "..")) throw new TypeError(`bad path segment in "${path}"`);
  if (segs.length > 16 || path.length > 1000) throw new TypeError(`path too long: "${path}"`);
  const even = segs.length % 2 === 0;
  if (kind === "doc" && !even) throw new TypeError(`"${path}" is a collection path (odd number of segments); a document needs an even number`);
  if (kind === "collection" && even) throw new TypeError(`"${path}" is a document path (even number of segments); a collection needs an odd number`);
  return segs;
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === "object" && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

const isPlain = (v: unknown): v is Doc => !!v && typeof v === "object" && !Array.isArray(v);
function merge(base: Doc, patch: Doc): Doc {
  const out: Doc = { ...base };
  for (const [k, v] of Object.entries(patch)) out[k] = isPlain(v) && isPlain(out[k]) ? merge(out[k], v) : v;
  return out;
}

const newId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}${Math.random().toString(36).slice(2)}`).replace(/-/g, "").slice(0, 20);

const missing = (v: unknown) => v === undefined || v === null;
function cmp(a: any, b: any): number {
  if (a === b) return 0;
  if (typeof a === "number" && typeof b === "number") return a < b ? -1 : 1;
  return String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
}
// ascending or descending, documents missing the field come last either way
type Row = { id: string; data: Doc };
function byField(field: string, dir: string) {
  const sign = dir === "desc" ? -1 : 1;
  return (a: Row, b: Row) => {
    const x = a.data[field];
    const y = b.data[field];
    if (missing(x) || missing(y)) return missing(x) === missing(y) ? cmp(a.id, b.id) : missing(x) ? 1 : -1;
    return cmp(x, y) * sign || cmp(a.id, b.id);
  };
}

const OPS: Record<string, (a: any, b: any) => boolean> = {
  "==": (a, b) => JSON.stringify(a) === JSON.stringify(b),
  "!=": (a, b) => JSON.stringify(a) !== JSON.stringify(b),
  "<": (a, b) => a !== undefined && a < b,
  "<=": (a, b) => a !== undefined && a <= b,
  ">": (a, b) => a !== undefined && a > b,
  ">=": (a, b) => a !== undefined && a >= b,
  in: (a, b) => Array.isArray(b) && b.some((x) => JSON.stringify(x) === JSON.stringify(a)),
  "not-in": (a, b) => Array.isArray(b) && !b.some((x) => JSON.stringify(x) === JSON.stringify(a)),
  "array-contains": (a, b) => Array.isArray(a) && a.some((x) => JSON.stringify(x) === JSON.stringify(b)),
};

type QuerySpec = { where: [string, string, unknown][]; order: [string, string] | null; limit: number | null };
type Lease = { holder: string; expires: number };
type Stored = { path: string; col: string; id: string; data: Doc };

export interface LocalDbOptions {
  indexedDB?: IDBFactory;
  name?: string;
  channel?: boolean;
}

/** The `db` capability plus two members for tests. */
export interface LocalDb extends Db {
  /** Resolves once the IndexedDB connection is open (or known to be unavailable). For tests. */
  ready(): Promise<IDBDatabase | null>;
  close(): Promise<void>;
}

export function createLocalDb(opts: LocalDbOptions = {}): LocalDb {
  const idb = opts.indexedDB ?? globalThis.indexedDB;
  const dbName = opts.name ?? DB_NAME;
  const cols = new Map<string, Map<string, Doc>>(); // collection path -> Map(id -> frozen data)
  const loaded = new Map<string, Promise<void>>(); // collection path -> Promise (initial load from IndexedDB)
  const listeners = new Map<string, Set<() => void>>(); // collection path -> Set(fn)
  const versions = new Map<string, number>(); // doc path -> write counter, for the lease result
  const leases = new Map<string, Lease>(); // doc path -> { holder, expires }
  let handle: Promise<IDBDatabase | null> | null = null;

  const open = (): Promise<IDBDatabase | null> =>
    (handle ??= new Promise<IDBDatabase | null>((resolve) => {
      if (!idb) return resolve(null);
      let req: IDBOpenDBRequest;
      try { req = idb.open(dbName, 1); } catch { return resolve(null); }
      req.onupgradeneeded = () => {
        const s = req.result.createObjectStore(STORE, { keyPath: "path" });
        s.createIndex("col", "col");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null); // private mode or blocked storage: keep working in memory
      req.onblocked = () => resolve(null);
    }));

  const tx = async <T = unknown>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T> | undefined): Promise<T | undefined> => {
    const d = await open();
    if (!d) return undefined;
    return new Promise<T | undefined>((resolve, reject) => {
      const t = d.transaction(STORE, mode);
      const out = fn(t.objectStore(STORE));
      t.oncomplete = () => resolve(out?.result);
      t.onerror = () => reject(err("unavailable", String(t.error ?? "IndexedDB write failed")));
      t.onabort = () => reject(err("unavailable", String(t.error ?? "IndexedDB transaction aborted")));
    });
  };

  const colMap = (col: string): Map<string, Doc> => {
    let m = cols.get(col);
    if (!m) cols.set(col, (m = new Map()));
    return m;
  };

  function load(col: string): Promise<void> {
    if (!loaded.has(col)) {
      loaded.set(
        col,
        tx<Stored[]>("readonly", (s) => s.index("col").getAll(col))
          .then((rows) => {
            const m = colMap(col);
            for (const r of rows ?? []) if (!m.has(r.id)) m.set(r.id, deepFreeze(r.data)); // memory wins: it is newer
          })
          .catch(() => {}),
      );
    }
    return loaded.get(col)!;
  }

  const notify = (col: string) => {
    for (const fn of [...(listeners.get(col) ?? [])]) queueMicrotask(fn);
  };

  const channel = opts.channel !== false && globalThis.BroadcastChannel ? new BroadcastChannel("riglam-db") : null;
  if (channel) {
    channel.onmessage = async ({ data: { col, id } }: MessageEvent<{ col: string; id: string }>) => {
      const row = await tx<Stored | undefined>("readonly", (s) => s.get(`${col}/${id}`)).catch(() => null);
      const m = colMap(col);
      if (row) m.set(id, deepFreeze(row.data));
      else m.delete(id);
      versions.set(`${col}/${id}`, (versions.get(`${col}/${id}`) ?? 0) + 1); // a change from another tab is a later write too: a refused write here must not undo it
      notify(col);
    };
  }

  async function write(col: string, id: string, data: Doc | null) {
    const path = `${col}/${id}`;
    const m = colMap(col);
    const had = m.has(id);
    const before = m.get(id);
    if (data === null) m.delete(id);
    else m.set(id, deepFreeze(JSON.parse(JSON.stringify(data))));
    const mine = m.get(id);
    const stamp = (versions.get(path) ?? 0) + 1; // this write's place in the order of writes of the document; a deletion has no value to compare
    versions.set(path, stamp);
    notify(col);
    try {
      await tx("readwrite", (s) => (data === null ? s.delete(path) : s.put({ path, col, id, data: mine })) as IDBRequest);
    } catch (e) {
      // Not saved: the page must not go on showing a document that a reload would lose. Put back what was there, unless another write has replaced it since.
      if (versions.get(path) === stamp && m.get(id) === mine) {
        if (had) m.set(id, before as Doc);
        else m.delete(id);
        notify(col);
      }
      throw e;
    }
    channel?.postMessage({ col, id });
  }

  const meta = { fromCache: false, hasPendingWrites: false };
  const docSnap = (id: string, data: Doc | undefined) => ({ id, exists: data !== undefined, data: () => data, metadata: meta });

  function docRef(path: string): DocRef {
    const segs = checkPath(path, "doc");
    const id = segs.at(-1)!;
    const col = segs.slice(0, -1).join("/");
    const assertObject = (data: unknown) => {
      if (!isPlain(data)) throw err("invalid_argument", "a document body must be a plain object");
      if (JSON.stringify(data).length > 256 * 1024) throw err("invalid_argument", "a document may hold at most 256 KiB");
    };
    return {
      id,
      path,
      async get(): Promise<DocSnapshot> {
        await load(col);
        return docSnap(id, colMap(col).get(id));
      },
      async set(data) { assertObject(data); await write(col, id, data); },
      async update(data) {
        assertObject(data);
        await load(col);
        const cur = colMap(col).get(id);
        if (!cur) throw err("invalid_argument", `update needs an existing document: ${path}`);
        await write(col, id, merge(cur, data));
      },
      async delete() { await load(col); await write(col, id, null); },
      async acquire({ holder, ttlMs }: { holder?: string; ttlMs?: number } = {}) {
        if (!holder) throw err("invalid_argument", "acquire needs a holder");
        const ttl = Math.min(600000, Math.max(1000, ttlMs || 30000));
        const now = Date.now();
        const cur = leases.get(path);
        if (cur && cur.expires > now && cur.holder !== holder) return { acquired: false, expiresAt: new Date(cur.expires).toISOString() };
        leases.set(path, { holder, expires: now + ttl });
        return { acquired: true, version: versions.get(path) ?? 0, expiresAt: new Date(now + ttl).toISOString(), holder };
      },
      onSnapshot(next: (snap: DocSnapshot) => void, error?: (e: unknown) => void): Unsubscribe {
        let last: { cur: Doc | undefined } | undefined;
        let dead = false;
        const emit = () => {
          if (dead) return;
          const cur = colMap(col).get(id);
          if (last !== undefined && last.cur === cur) return;
          last = { cur };
          next(docSnap(id, cur));
        };
        load(col).then(() => {
          if (dead) return;
          listen(col, emit);
          emit();
        }, (e) => error?.(e));
        return () => { dead = true; unlisten(col, emit); };
      },
      collection: (sub: string) => collectionRef(`${path}/${sub}`),
    };
  }

  function listen(col: string, fn: () => void) {
    let set = listeners.get(col);
    if (!set) listeners.set(col, (set = new Set()));
    set.add(fn);
  }
  function unlisten(col: string, fn: () => void) { listeners.get(col)?.delete(fn); }

  function query(col: string, spec: QuerySpec): Query {
    const run = (): Row[] => {
      let rows: Row[] = [...colMap(col)].map(([id, data]) => ({ id, data }));
      for (const [field, op, value] of spec.where) rows = rows.filter((r) => OPS[op](r.data[field], value));
      if (spec.order) {
        rows.sort(byField(spec.order[0], spec.order[1]));
      } else rows.sort((a, b) => cmp(a.id, b.id));
      if (spec.limit != null) rows = rows.slice(0, spec.limit);
      return rows;
    };
    const snapshot = (rows: Row[], prev: Row[] | null): QuerySnapshot => {
      const docs = rows.map((r) => docSnap(r.id, r.data));
      return {
        docs,
        size: docs.length,
        empty: docs.length === 0,
        metadata: meta,
        docChanges() {
          const before = new Map((prev ?? []).map((r, i) => [r.id, { r, i }]));
          const after = new Map(rows.map((r, i) => [r.id, { r, i }]));
          const out: DocChange[] = [];
          rows.forEach((r, i) => {
            const b = before.get(r.id);
            if (!b) out.push({ type: "added", doc: docs[i], oldIndex: -1, newIndex: i });
            else if (b.r.data !== r.data) out.push({ type: "modified", doc: docs[i], oldIndex: b.i, newIndex: i });
          });
          (prev ?? []).forEach((r, i) => {
            if (!after.has(r.id)) out.push({ type: "removed", doc: docSnap(r.id, r.data), oldIndex: i, newIndex: -1 });
          });
          return out;
        },
      };
    };
    const self: Query = {
      where(field: string, op: string, value: unknown) {
        if (!OPS[op]) throw new TypeError(`unknown operator ${op}`);
        return query(col, { ...spec, where: [...spec.where, [field, op, value]] });
      },
      orderBy: (field: string, dir: "asc" | "desc" = "asc") => query(col, { ...spec, order: [field, dir] }),
      limit(n: number) {
        if (!(n >= 1 && n <= 1000)) throw new TypeError("limit must be 1 to 1000");
        return query(col, { ...spec, limit: n });
      },
      async get() { await load(col); return snapshot(run(), null); },
      onSnapshot(next: (snap: QuerySnapshot) => void, error?: (e: unknown) => void): Unsubscribe {
        let prev: Row[] | null = null;
        let dead = false;
        const emit = () => {
          if (dead) return;
          const rows = run();
          const same = prev && prev.length === rows.length && prev.every((r, i) => r.id === rows[i].id && r.data === rows[i].data);
          if (same) return;
          const snap = snapshot(rows, prev);
          prev = rows;
          next(snap);
        };
        load(col).then(() => {
          if (dead) return;
          listen(col, emit);
          emit();
        }, (e) => error?.(e));
        return () => { dead = true; unlisten(col, emit); };
      },
    };
    return self;
  }

  function collectionRef(path: string): CollectionRef {
    checkPath(path, "collection");
    return Object.assign(query(path, { where: [], order: null, limit: null }), {
      path,
      doc: (id?: string) => docRef(`${path}/${id ?? newId()}`),
      async add(data: Doc) { const ref = docRef(`${path}/${newId()}`); await ref.set(data); return ref; },
    });
  }

  return {
    doc: docRef,
    collection: collectionRef,
    /** Resolves once the IndexedDB connection is open (or known to be unavailable). For tests. */
    ready: open,
    close() { channel?.close(); return open().then((d) => d?.close()); },
  };
}
