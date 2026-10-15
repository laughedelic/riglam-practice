// The local store when IndexedDB refuses a write: the page must not go on showing a document that a reload would lose.
import { describe, expect, it } from "vitest";
import { createLocalDb } from "../../src/pwa/local-db";

/** An IndexedDB stand-in that keeps rows in an array and can be told to abort writes. */
function stub() {
  const control = { fail: false, failNext: 0, delay: 0 }; // delay: how long a write takes to finish
  const rows: { path: string; col: string; id: string; data: unknown }[] = [];
  const store = {
    index: () => ({ getAll: (col: string) => ({ result: rows.filter((r) => r.col === col) }) }),
    get: (path: string) => ({ result: rows.find((r) => r.path === path) }),
    put: (r: (typeof rows)[number]) => { if (!control.fail && !control.failNext) rows.push(r); return {}; },
    delete: () => ({}),
  };
  const db = {
    transaction: (_store: string, mode: string) => {
      const t: { objectStore: () => typeof store; oncomplete?: () => void; onabort?: () => void; error?: unknown } = { objectStore: () => store };
      const fails = mode === "readwrite" && (control.fail || control.failNext > 0); // decided when the transaction starts
      if (mode === "readwrite" && control.failNext > 0) control.failNext -= 1;
      setTimeout(() => {
        if (mode === "readwrite" && fails) { t.error = new Error("quota"); t.onabort?.(); } else t.oncomplete?.();
      }, mode === "readwrite" ? control.delay : 0);
      return t;
    },
  };
  const factory = {
    open: () => {
      const req: { result?: unknown; onsuccess?: () => void } = {};
      setTimeout(() => { req.result = db; req.onsuccess?.(); });
      return req;
    },
  } as unknown as IDBFactory;
  return { factory, control, rows };
}

describe("a write that could not be saved", () => {
  it("is rejected and does not stay in memory", async () => {
    const { factory, control } = stub();
    const db = createLocalDb({ indexedDB: factory, channel: false });
    control.fail = true;
    const ref = db.doc("answers/a1");
    await expect(ref.set({ v: 1 })).rejects.toMatchObject({ code: "unavailable" });
    expect((await ref.get()).exists).toBe(false);
  });

  it("puts the earlier copy back, and tells the listeners", async () => {
    const { factory, control } = stub();
    const db = createLocalDb({ indexedDB: factory, channel: false });
    const ref = db.doc("answers/a1");
    await ref.set({ v: 1 });
    const seen: unknown[] = [];
    db.collection("answers").onSnapshot((s) => seen.push(s.docs.map((d) => d.data())));
    control.fail = true;
    await expect(ref.set({ v: 2 })).rejects.toBeTruthy();
    await new Promise((r) => setTimeout(r, 5));
    expect((await ref.get()).data()).toEqual({ v: 1 });
    expect(seen.at(-1)).toEqual([{ v: 1 }]);
    await expect(ref.delete()).rejects.toBeTruthy();
    expect((await ref.get()).data()).toEqual({ v: 1 });
  });

  it("leaves a newer write of the same document alone", async () => {
    const { factory, control } = stub();
    const db = createLocalDb({ indexedDB: factory, channel: false });
    const ref = db.doc("answers/a1");
    await ref.set({ v: 1 });
    control.failNext = 1; // the first of the two writes that follow is refused
    const first = ref.set({ v: 2 }).catch(() => "failed");
    await ref.set({ v: 3 });
    expect(await first).toBe("failed");
    expect((await ref.get()).data()).toEqual({ v: 3 });
  });

  it("does not bring a deleted document back when a later deletion of it succeeds", async () => {
    const { factory, control } = stub();
    const db = createLocalDb({ indexedDB: factory, channel: false });
    const ref = db.doc("answers/a1");
    await ref.set({ v: 1 });
    control.failNext = 1; // the first deletion is refused, the second goes through
    const first = ref.delete().catch(() => "failed");
    await ref.delete();
    expect(await first).toBe("failed");
    expect((await ref.get()).exists).toBe(false);
  });

  it("does not undo a deletion made by another tab while the write was in flight", async () => {
    const { factory, control, rows } = stub();
    const db = createLocalDb({ indexedDB: factory }); // with the channel the tabs use
    const ref = db.doc("answers/a1");
    await ref.set({ v: 1 });
    control.failNext = 1;
    control.delay = 40;
    const mine = ref.delete().catch(() => "failed"); // refused after 40 ms
    rows.length = 0; // meanwhile another tab has deleted the document and says so
    const other = new BroadcastChannel("riglam-db");
    other.postMessage({ col: "answers", id: "a1" });
    await new Promise((r) => setTimeout(r, 15));
    expect(await mine).toBe("failed");
    other.close();
    expect((await ref.get()).exists).toBe(false);
  });
});

describe("a storage that never answers", () => {
  const silent = { open: () => ({}) } as unknown as IDBFactory; // a request that neither succeeds nor fails

  it("is given up on after the timeout: reads come back empty, writes stay in memory, and the page is told once", async () => {
    let told = 0;
    const db = createLocalDb({ indexedDB: silent, channel: false, timeoutMs: 30, onUnavailable: () => told++ });
    const ref = db.doc("answers/a1");
    expect((await ref.get()).exists).toBe(false); // waited for the timeout, not for ever
    await ref.set({ v: 1 }); // does not wait again
    expect((await ref.get()).data()).toEqual({ v: 1 });
    expect(told).toBe(1);
  });

  it("does not report a storage that answers in time", async () => {
    const { factory } = stub();
    let told = 0;
    const db = createLocalDb({ indexedDB: factory, channel: false, timeoutMs: 500, onUnavailable: () => told++ });
    await db.doc("answers/a1").set({ v: 1 });
    expect(told).toBe(0);
  });
});
