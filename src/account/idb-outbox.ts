// The outbox in IndexedDB, in its own database ("riglam-sync") apart from the documents (src/pwa/local-db.ts), so that neither can break
// the other's version. The contract and the memory version are in ./outbox.ts.

import { memoryOutbox, type Outbox, type OutboxEntry } from "./outbox";

/**
 * The outbox in IndexedDB. Where IndexedDB cannot be used (a private window, blocked storage) the memory outbox stands in:
 * sync then works while the page is open and forgets what it had not sent when the page closes.
 */
export function idbOutbox(factory: IDBFactory | undefined = globalThis.indexedDB, name = "riglam-sync"): Outbox {
  if (!factory) return memoryOutbox();
  let fallback: Outbox | null = null;
  let handle: Promise<IDBDatabase | null> | null = null;
  const open = () =>
    (handle ??= new Promise<IDBDatabase | null>((resolve) => {
      let req: IDBOpenDBRequest;
      try { req = factory.open(name, 2); } catch { return resolve(null); }
      req.onupgradeneeded = (ev) => {
        // Version 1 had the two stores; version 2 adds the index on the change time, so that a batch is read in order without loading the whole queue.
        if (ev.oldVersion < 1) {
          req.result.createObjectStore("outbox", { keyPath: "key" });
          req.result.createObjectStore("meta", { keyPath: "k" });
        }
        const outbox = req.transaction!.objectStore("outbox");
        if (!outbox.indexNames.contains("t")) outbox.createIndex("t", "t");
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    }));

  /** Runs `fn` in one transaction over both stores; the outbox's own operations are all a few requests. */
  async function run<T>(mode: IDBTransactionMode, fn: (outbox: IDBObjectStore, meta: IDBObjectStore) => Promise<T> | T): Promise<T> {
    const db = await open();
    if (!db) return (fallback ??= memoryOutbox()) as never;
    return new Promise<T>((resolve, reject) => {
      const t = db.transaction(["outbox", "meta"], mode);
      let out: T;
      t.oncomplete = () => resolve(out);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
      Promise.resolve(fn(t.objectStore("outbox"), t.objectStore("meta"))).then((v) => { out = v; }, reject);
    });
  }
  const req = <T>(r: IDBRequest<T>) => new Promise<T>((resolve, reject) => { r.onsuccess = () => resolve(r.result); r.onerror = () => reject(r.error); });

  // When the database cannot be opened every operation goes to one memory outbox.
  const viaFallback = async <T>(use: (m: Outbox) => Promise<T>, real: () => Promise<T>): Promise<T> => ((await open()) ? real() : use((fallback ??= memoryOutbox())));

  return {
    put: (e) => viaFallback((m) => m.put(e), () => run("readwrite", (o) => void o.put(e))),
    note: (e) =>
      viaFallback((m) => m.note(e), () => run("readwrite", async (o) => { const before = (await req(o.get(e.key))) as OutboxEntry | undefined; o.put({ ...e, t: before && before.t >= e.t ? before.t + 1 : e.t }); })),
    putIfAbsent: (e) =>
      viaFallback((m) => m.putIfAbsent(e), () => run("readwrite", async (o) => { if ((await req(o.get(e.key))) === undefined) o.put(e); })),
    get: (key) => viaFallback((m) => m.get(key), () => run("readonly", (o) => req(o.get(key)) as Promise<OutboxEntry | undefined>)),
    list: (limit, only) =>
      viaFallback((m) => m.list(limit, only), () =>
        run("readonly", (o) =>
          new Promise<OutboxEntry[]>((resolve, reject) => {
            // in order of change time, and only as far as needed
            const out: OutboxEntry[] = [];
            const cursor = o.index("t").openCursor();
            cursor.onerror = () => reject(cursor.error);
            cursor.onsuccess = () => {
              const at = cursor.result;
              if (!at || out.length >= limit) return resolve(out);
              const entry = at.value as OutboxEntry;
              if (only !== "deletions" || entry.doc === null) out.push(entry);
              at.continue();
            };
          }),
        ),
      ),
    remove: (key, t) =>
      viaFallback((m) => m.remove(key, t), () => run("readwrite", async (o) => { const cur = (await req(o.get(key))) as OutboxEntry | undefined; if (cur?.t === t) o.delete(key); })),
    count: () => viaFallback((m) => m.count(), () => run("readonly", (o) => req(o.count()))),
    clear: () => viaFallback((m) => m.clear(), () => run("readwrite", (o, meta) => { o.clear(); meta.clear(); })),
    getMeta: <T>(n: string) => viaFallback((m) => m.getMeta<T>(n), () => run("readonly", async (_o, meta) => ((await req(meta.get(n))) as { v: T } | undefined)?.v)),
    setMeta: (n, v) => viaFallback((m) => m.setMeta(n, v), () => run("readwrite", (_o, meta) => void meta.put({ k: n, v }))),
  };
}
