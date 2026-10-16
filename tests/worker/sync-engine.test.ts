// The device side of sync (src/account/sync.ts) against the real Worker: what is sent, what is taken, and how two devices that
// changed the same document settle. Each device has its own store and outbox; the Worker and its SQL are the ones that ship.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SYNC_COLLECTIONS, SYNC_LIMITS } from "../../src/account/protocol";
import { world } from "./accounts-support";
import { device, settle, T0, type Device } from "./device";

beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

/** Two devices of one person: the first makes the account, the second signs in with the same passkey. */
async function pair() {
  const w = await world();
  const a = await device(w);
  const b = await device(w, { key: a.key });
  return { w, a, b };
}

describe("a first sign-in", () => {
  it("sends the documents the device already has, at their own timestamps", async () => {
    const { w, a, b } = await pair();
    a.seed("answers", "a1", { at: "2026-10-12T08:00:00Z", right: true });
    a.seed("favorites", "f1", { key: "k" });
    await a.account.signUp("Alexey");
    await a.sync.syncNow();
    expect(a.sync.status()).toMatchObject({ pending: 0, error: null });
    const rows = w.db.sql<{ col: string; id: string; t: number }>("SELECT col, id, t FROM docs ORDER BY col, id");
    expect(rows).toEqual([
      { col: "answers", id: "a1", t: Date.parse("2026-10-12T08:00:00Z") },
      { col: "favorites", id: "f1", t: 0 },
    ]);
    await b.account.signIn();
    await b.sync.syncNow();
    expect(b.get("answers", "a1")).toEqual({ at: "2026-10-12T08:00:00Z", right: true });
    expect(b.get("favorites", "f1")).toEqual({ key: "k" });
  });

  it("brings two devices with different documents to the union", async () => {
    const { a, b } = await pair();
    a.seed("answers", "x", { at: "2026-10-01T00:00:00Z", v: "a" });
    b.seed("answers", "y", { at: "2026-10-02T00:00:00Z", v: "b" });
    await a.account.signUp("p");
    await a.sync.syncNow();
    await b.account.signIn();
    await b.sync.syncNow();
    await a.sync.syncNow();
    for (const d of [a, b]) {
      expect(d.get("answers", "x")).toMatchObject({ v: "a" });
      expect(d.get("answers", "y")).toMatchObject({ v: "b" });
    }
  });

  it("takes the newer copy of a document both devices had", async () => {
    const { a, b } = await pair();
    a.seed("answers", "x", { at: "2026-10-01T00:00:00Z", v: "older" });
    b.seed("answers", "x", { at: "2026-10-05T00:00:00Z", v: "newer" });
    await a.account.signUp("p");
    await a.sync.syncNow();
    await b.account.signIn();
    await b.sync.syncNow();
    await a.sync.syncNow();
    expect(a.get("answers", "x")).toMatchObject({ v: "newer" });
    expect(b.get("answers", "x")).toMatchObject({ v: "newer" });
  });
});

describe("changes after that", () => {
  let a: Device, b: Device;
  beforeEach(async () => {
    ({ a, b } = await pair());
    await a.account.signUp("p");
    await b.account.signIn();
  });

  it("travel to the other device", async () => {
    await a.put("answers", "a1", { v: 1 }, T0);
    await a.sync.syncNow();
    expect(a.sync.status().pending).toBe(0);
    await b.sync.syncNow();
    expect(b.get("answers", "a1")).toEqual({ v: 1 });
    expect(b.sync.status().pending).toBe(0); // taking a document is not a change to send back
  });

  it("send a burst of changes to one document as its last state only", async () => {
    for (let i = 1; i <= 5; i++) await a.put("answers", "a1", { v: i }, T0 + i);
    expect(await a.outbox.count()).toBe(1);
    await a.sync.syncNow();
    await b.sync.syncNow();
    expect(b.get("answers", "a1")).toEqual({ v: 5 });
  });

  it("carry a deletion", async () => {
    await a.put("favorites", "f1", { key: "k" }, T0);
    await a.sync.syncNow();
    await b.sync.syncNow();
    expect(b.get("favorites", "f1")).toEqual({ key: "k" });
    await a.remove("favorites", "f1", T0 + 1000);
    await a.sync.syncNow();
    await b.sync.syncNow();
    expect(b.get("favorites", "f1")).toBeNull();
  });

  it("settle by the time of the change, not by who sent first", async () => {
    await a.put("flags", "g", { v: "base" }, T0);
    await a.sync.syncNow();
    await b.sync.syncNow();
    await a.put("flags", "g", { v: "from a" }, T0 + 1000); // earlier
    await b.put("flags", "g", { v: "from b" }, T0 + 2000); // later
    await b.sync.syncNow(); // b reaches the server first
    await a.sync.syncNow(); // a's older change loses and a is given b's
    expect(a.get("flags", "g")).toEqual({ v: "from b" });
    await b.sync.syncNow();
    expect(b.get("flags", "g")).toEqual({ v: "from b" });
    expect(await a.outbox.count()).toBe(0);
  });

  it("let the later change win even when it arrives later", async () => {
    await a.put("flags", "g", { v: "base" }, T0);
    await a.sync.syncNow();
    await b.sync.syncNow();
    await b.put("flags", "g", { v: "from b" }, T0 + 1000);
    await a.put("flags", "g", { v: "from a" }, T0 + 2000);
    await b.sync.syncNow();
    await a.sync.syncNow();
    await b.sync.syncNow();
    expect(a.get("flags", "g")).toEqual({ v: "from a" });
    expect(b.get("flags", "g")).toEqual({ v: "from a" });
  });

  it("keep a change made here after the server's copy was made", async () => {
    await a.put("flags", "g", { v: "from a" }, T0);
    await a.sync.syncNow();
    await b.put("flags", "g", { v: "b is later" }, T0 + 5000); // noted, not sent
    await b.sync.syncNow(); // the round sends it, so it wins; and a still gets it
    await a.sync.syncNow();
    expect(a.get("flags", "g")).toEqual({ v: "b is later" });
    // while b is offline a newer change on the server does not overwrite a still newer one made here
    b.offline = true;
    await b.put("flags", "g", { v: "b again" }, T0 + 9000);
    b.offline = false;
    await a.put("flags", "g", { v: "a later" }, T0 + 7000);
    await a.sync.syncNow();
    await b.sync.syncNow();
    await a.sync.syncNow();
    expect(a.get("flags", "g")).toEqual({ v: "b again" });
    expect(b.get("flags", "g")).toEqual({ v: "b again" });
  });

  it("do not rewrite a document that is already the same", async () => {
    await a.put("answers", "a1", { v: 1, nested: { x: [1, 2], y: "z" } }, T0);
    await a.sync.syncNow();
    expect(a.applied).toEqual([]); // the echo of its own change
    await b.sync.syncNow();
    await b.sync.syncNow();
    expect(b.applied).toEqual(["answers/a1"]);
  });

  it("send more than one request's worth", async () => {
    for (let i = 0; i < SYNC_LIMITS.writes + 30; i++) await a.put("answers", "a" + i, { i }, T0 + i);
    expect(await a.outbox.count()).toBe(SYNC_LIMITS.writes + 30);
    await a.sync.syncNow();
    expect(a.sync.status().pending).toBe(0);
    await b.sync.syncNow();
    expect(b.docs.size).toBe(SYNC_LIMITS.writes + 30);
  });

  it("receive more than one page of changes", async () => {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 200; j++) await a.put("answers", `a${i}-${j}`, { i, j }, T0 + i * 1000 + j);
      await a.sync.syncNow();
    }
    await b.sync.syncNow();
    expect(b.docs.size).toBe(600);
    expect(b.calls.filter((c) => c === "POST /api/sync").length).toBeGreaterThanOrEqual(2);
  });

  it("leave out documents that are too large or not the app's", async () => {
    await a.put("answers", "big", { text: "x".repeat(SYNC_LIMITS.docBytes + 1) }, T0);
    await a.put("elsewhere", "a", { v: 1 }, T0);
    await a.put("answers", "__proto__", { v: 1 }, T0);
    await a.put("answers", "ok", { v: 1 }, T0);
    expect(await a.outbox.count()).toBe(1);
    await a.sync.syncNow();
    expect(a.sync.status().error).toBeNull();
  });
});

describe("when the server cannot be reached", () => {
  it("keeps the changes and sends them later", async () => {
    const { a, b } = await pair();
    await a.account.signUp("p");
    await b.account.signIn();
    a.offline = true;
    await a.put("answers", "a1", { v: 1 }, T0);
    const s = await a.sync.syncNow();
    expect(s).toMatchObject({ pending: 1, error: "offline" });
    a.offline = false;
    expect(await a.sync.syncNow()).toMatchObject({ pending: 0, error: null });
    await b.sync.syncNow();
    expect(b.get("answers", "a1")).toEqual({ v: 1 });
  });

  it("waits longer after each failure, and a person's own request does not wait", async () => {
    const { a } = await pair();
    await a.account.signUp("p");
    a.offline = true;
    await a.put("answers", "a1", { v: 1 }, T0);
    const timers: number[] = [];
    // the engine of the device in this test uses a timer that does nothing; read the waits from a second engine with a recording one
    const { createSync } = await import("../../src/account/sync");
    const s = createSync({
      store: a.store,
      outbox: a.outbox,
      post: (r) => a.client.sync(r),
      now: () => T0,
      setTimer: (_f, ms) => (timers.push(ms), 1),
      clearTimer: () => {},
      debounceMs: 1500,
      backoffMs: 15_000,
    });
    await s.activate((await a.outbox.getMeta<string>("user"))!);
    timers.length = 0;
    for (let i = 0; i < 3; i++) await s.syncNow();
    expect(timers).toEqual([15_000, 30_000, 60_000]);
    a.offline = false;
    expect(await s.syncNow()).toMatchObject({ pending: 0, error: null });
    s.close();
  });
});

describe("signing out and in", () => {
  it("keeps noting changes while signed out and sends them on the next sign-in", async () => {
    const { a, b } = await pair();
    await a.account.signUp("p");
    await b.account.signIn();
    await a.put("answers", "before", { v: 1 }, T0);
    await a.account.signOut();
    expect(a.account.view().person).toBeNull();
    await a.put("answers", "while-out", { v: 2 }, T0 + 10);
    expect(await a.outbox.count()).toBe(1);
    expect(await a.sync.syncNow()).toMatchObject({ active: false });
    await b.sync.syncNow();
    expect(b.get("answers", "before")).toEqual({ v: 1 }); // sign-out sent what was waiting
    expect(b.get("answers", "while-out")).toBeNull();
    await a.account.signIn();
    await a.sync.syncNow();
    await b.sync.syncNow();
    expect(b.get("answers", "while-out")).toEqual({ v: 2 });
  });

  it("starts over for another person: the old account's cursor and queue are dropped and the documents are offered to the new one", async () => {
    const w = await world();
    const a = await device(w);
    const other = await device(w);
    await a.account.signUp("first");
    await a.put("answers", "mine", { at: "2026-10-12T08:00:00Z", v: 1 }, T0);
    await a.sync.syncNow();
    await a.account.signOut();
    await other.account.signUp("second");
    await other.put("answers", "theirs", { v: 2 }, T0);
    await other.sync.syncNow();
    a.key = other.key; // signs in as the second person
    await a.account.signIn();
    await a.sync.syncNow();
    expect(a.get("answers", "theirs")).toEqual({ v: 2 });
    const rows = w.db.sql<{ user_id: string; id: string }>("SELECT user_id, id FROM docs ORDER BY id");
    expect(rows.map((r) => r.id)).toEqual(["mine", "mine", "theirs"]);
    expect(new Set(rows.map((r) => r.user_id)).size).toBe(2);
  });

  it("forgets everything when the account is deleted", async () => {
    const { w, a } = await pair();
    await a.account.signUp("p");
    await a.put("answers", "a1", { v: 1 }, T0);
    await a.sync.syncNow();
    await a.account.deleteAccount();
    expect(w.db.sql("SELECT * FROM docs")).toEqual([]);
    expect(a.get("answers", "a1")).toEqual({ v: 1 }); // the device keeps its own copy
    await a.put("answers", "a2", { v: 2 }, T0 + 1);
    expect(await a.outbox.count()).toBe(0);
    expect(a.kept).toBeNull();
  });

  it("ends the account on the device when the server says it is not signed in", async () => {
    const { a } = await pair();
    await a.account.signUp("p");
    await a.put("answers", "a1", { v: 1 }, T0);
    a.clearCookie();
    await a.sync.syncNow();
    expect(a.signedOutCalls).toBe(1);
    expect(a.account.view()).toMatchObject({ person: null });
    expect(a.account.view().message?.text).toMatch(/signed out/i);
    expect(await a.outbox.count()).toBe(1); // still waiting for the next sign-in
  });
});

describe("limits", () => {
  it("waits for tomorrow when the day's allowance is used", async () => {
    const w = await world({ DAILY_WRITES_PER_ACCOUNT: "10" } as never);
    const a = await device(w);
    await a.account.signUp("p");
    for (let i = 0; i < 12; i++) await a.put("answers", "a" + i, { i }, T0 + i);
    // 12 changes are more than a request may carry for this account: they go in smaller requests until the day's 10 are used up
    const s = await a.sync.syncNow();
    expect(s).toMatchObject({ error: "quota", pending: 6 });
    expect(w.db.sql("SELECT * FROM docs")).toHaveLength(6);
    w.clock.now = new Date(w.clock.now.getTime() + 86_400_000);
    expect(await a.sync.syncNow()).toMatchObject({ error: null, pending: 0 });
    expect(w.db.sql("SELECT * FROM docs")).toHaveLength(12);
  });

  it("makes progress when the queue is longer than the allowance for a day (the least the server allows is 10)", async () => {
    const w = await world({ DAILY_WRITES_PER_ACCOUNT: "10" } as never);
    const a = await device(w);
    await a.account.signUp("p");
    for (let i = 0; i < 25; i++) await a.put("answers", "a" + i, { i }, T0 + i);
    let docs = 0;
    for (let day = 0; day < 4 && a.sync.status().pending > 0; day++) {
      await a.sync.syncNow();
      docs = w.db.sql("SELECT * FROM docs").length;
      w.clock.now = new Date(w.clock.now.getTime() + 86_400_000);
    }
    expect(docs).toBeGreaterThan(0);
    expect(a.sync.status()).toMatchObject({ pending: 0, error: null });
    expect(w.db.sql("SELECT * FROM docs")).toHaveLength(25);
  });
});

describe("tabs", () => {
  it("does not run a round while another tab is in one", async () => {
    const { w, a } = await pair();
    await a.account.signUp("p");
    const { createSync } = await import("../../src/account/sync");
    let taken = false;
    const s = createSync({
      store: a.store,
      outbox: a.outbox,
      post: async () => { throw new Error("must not be called"); },
      exclusive: async (fn) => (taken ? undefined : fn()),
      setTimer: () => 0,
      clearTimer: () => {},
      debounceMs: 0,
    });
    await s.activate((await a.outbox.getMeta<string>("user"))!);
    await a.put("answers", "a1", { v: 1 }, T0);
    taken = true;
    const status = await s.syncNow();
    expect(status.last).toBeNull();
    expect(status.pending).toBe(1);
    expect(w).toBeTruthy();
    s.close();
    await settle();
  });
});

describe("races and failures on the device", () => {
  it("counts a request's size in bytes, so documents in other scripts do not make it too large", async () => {
    const { w, a } = await pair();
    await a.account.signUp("p");
    // 20 documents of 120,000 characters: about 2.4 million characters but 4.8 million bytes in UTF-8
    for (let i = 0; i < 20; i++) await a.put("answers", "a" + i, { text: "я".repeat(120_000) }, T0 + i);
    await a.sync.syncNow();
    expect(a.sync.status()).toMatchObject({ pending: 0, error: null });
    expect(w.db.sql<{ n: number }>("SELECT COUNT(*) AS n FROM docs")[0].n).toBe(20);
  });

  it("starts the first scan again when the page was closed during it, and keeps what was written meanwhile", async () => {
    const { w, a } = await pair();
    a.seed("answers", "old1", { at: "2026-10-12T08:00:00Z", v: "scanned" });
    a.seed(SYNC_COLLECTIONS[SYNC_COLLECTIONS.length - 1], "late", { at: "2026-10-12T09:00:00Z" });
    const documents = a.store.documents;
    let breakAt: string | null = SYNC_COLLECTIONS[SYNC_COLLECTIONS.length - 1];
    a.store.documents = async (col) => { if (col === breakAt) throw new Error("page closed"); return documents(col); };
    await a.account.signUp("p"); // the account is made, the scan fails
    expect(await a.outbox.getMeta("seeded")).toBeUndefined();
    await a.put("answers", "during", { at: "2026-10-12T10:00:00Z", v: "written after the scan began" }, T0); // the hook was already in place
    breakAt = null;
    await a.sync.activate((await a.outbox.getMeta<string>("user"))!); // the next start
    expect(await a.outbox.getMeta("seeded")).toBe(await a.outbox.getMeta("user"));
    await a.sync.syncNow();
    const ids = w.db.sql<{ id: string }>("SELECT id FROM docs ORDER BY id").map((r) => r.id);
    expect(ids).toEqual(["during", "late", "old1"]);
  });

  it("keeps a change whose note could not be stored and sends it in the next round", async () => {
    const { w, a } = await pair();
    await a.account.signUp("p");
    const real = a.outbox.note.bind(a.outbox);
    let full = true;
    a.outbox.note = async (e) => { if (full) throw new Error("storage full"); return real(e); };
    await a.put("answers", "a1", { v: 1 }, T0);
    expect(a.sync.status()).toMatchObject({ pending: 1, error: "unavailable" });
    await a.sync.syncNow(); // still full: the round fails and nothing is lost
    expect(a.sync.status()).toMatchObject({ pending: 1, error: "unavailable" });
    full = false;
    await a.sync.syncNow();
    expect(a.sync.status()).toMatchObject({ pending: 0, error: null });
    expect(w.db.sql<{ id: string }>("SELECT id FROM docs").map((r) => r.id)).toEqual(["a1"]);
  });

  it("does not overwrite a document written here while the server's copy was being judged", async () => {
    const { w, a, b } = await pair();
    await a.account.signUp("p");
    await b.account.signIn();
    await a.put("answers", "x", { v: 1 }, T0);
    await a.sync.syncNow();
    await b.sync.syncNow();
    await a.put("answers", "x", { v: 2 }, T0 + 1000);
    await a.sync.syncNow();
    // b is about to take v2; the page writes v3 while b is still reading its own copy
    b.hooks.afterRead = async () => { b.hooks.afterRead = undefined; await b.put("answers", "x", { v: 3 }, T0 + 9000); };
    const appliedBefore = b.applied.length;
    await b.sync.syncNow();
    expect(b.applied.slice(appliedBefore)).not.toContain("answers/x"); // v2 was not written over v3, not even for a moment
    expect(b.get("answers", "x")).toEqual({ v: 3 });
    await b.sync.syncNow();
    await a.sync.syncNow();
    expect(a.get("answers", "x")).toEqual({ v: 3 });
    expect(w.db.sql<{ data: string }>("SELECT data FROM docs WHERE id = 'x'")[0].data).toBe(JSON.stringify({ v: 3 }));
  });

  it("does not overwrite a document whose local write began before the server's copy was judged but was not noted yet", async () => {
    const { w, a, b } = await pair();
    await a.account.signUp("p");
    await b.account.signIn();
    await a.put("answers", "x", { v: 1 }, T0);
    await a.sync.syncNow();
    await b.sync.syncNow();
    await a.put("answers", "x", { v: 2 }, T0 + 1000);
    await a.sync.syncNow();
    // b's page has begun writing v3 (in memory, the revision is already newer) but the write is not saved, so it is not in the outbox either
    const finish = b.begin("answers", "x", { v: 3 }, T0 + 9000);
    const appliedBefore = b.applied.length;
    await b.sync.syncNow();
    expect(b.applied.slice(appliedBefore)).not.toContain("answers/x");
    expect(b.get("answers", "x")).toEqual({ v: 3 });
    await finish();
    await b.sync.syncNow();
    await a.sync.syncNow();
    expect(a.get("answers", "x")).toEqual({ v: 3 });
    expect(w.db.sql<{ data: string }>("SELECT data FROM docs WHERE id = 'x'")[0].data).toBe(JSON.stringify({ v: 3 }));
  });

  it("keeps the cursor where it was when a server copy is put off, so that a local save that fails does not lose it", async () => {
    const { a, b } = await pair();
    await a.account.signUp("p");
    await b.account.signIn();
    await a.put("answers", "x", { v: 1 }, T0);
    await a.sync.syncNow();
    await b.sync.syncNow();
    await a.put("answers", "x", { v: 2 }, T0 + 1000);
    await a.sync.syncNow();
    const save = b.begin("answers", "x", { v: 3 }, T0 + 9000);
    await b.sync.syncNow(); // the copy v2 waits for the write that is being saved
    expect(b.get("answers", "x")).toEqual({ v: 3 });
    save.rollback(); // the save failed: no note, no entry
    await b.sync.syncNow();
    expect(b.get("answers", "x")).toEqual({ v: 2 }); // the copy was not left behind the cursor
  });

  it("puts a server copy off, and keeps the cursor, when a write came in after the revision was read and its save then fails", async () => {
    const { a, b } = await pair();
    await a.account.signUp("p");
    await b.account.signIn();
    await a.put("answers", "x", { v: 1 }, T0);
    await a.sync.syncNow();
    await b.sync.syncNow();
    await a.put("answers", "x", { v: 2 }, T0 + 1000);
    await a.sync.syncNow();
    let save!: ReturnType<typeof b.begin>;
    b.hooks.afterRead = async () => { b.hooks.afterRead = undefined; save = b.begin("answers", "x", { v: 3 }, T0 + 9000); }; // after the revision was read, before the copy is stored
    await b.sync.syncNow();
    expect(b.get("answers", "x")).toEqual({ v: 3 });
    save.rollback();
    await b.sync.syncNow();
    expect(b.get("answers", "x")).toEqual({ v: 2 });
  });

  it("keeps the retry of the newest change when notes of one document finish out of order", async () => {
    const { w, a } = await pair();
    await a.account.signUp("p");
    const real = a.outbox.note.bind(a.outbox);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let calls = 0;
    a.outbox.note = async (e) => {
      calls += 1;
      if (calls === 1) { await gate; return real(e); } // the older note is slow and succeeds
      throw new Error("storage full"); // the newer one fails quickly
    };
    await a.put("answers", "x", { v: 1 }, T0);
    await a.put("answers", "x", { v: 2 }, T0 + 1000);
    a.outbox.note = real;
    release();
    await settle();
    await a.sync.syncNow();
    expect(a.sync.status()).toMatchObject({ pending: 0, error: null });
    expect(w.db.sql<{ data: string }>("SELECT data FROM docs WHERE id = 'x'")[0].data).toBe(JSON.stringify({ v: 2 }));
  });

  it("an explicit sync waits for the lock that another tab holds, where a background round leaves the work to that tab", async () => {
    let held = true;
    const w = await world();
    const a = await device(w, { exclusive: async (fn, wait) => (held && !wait ? undefined : fn()) });
    await a.account.signUp("p");
    await a.put("answers", "x", { v: 1 }, T0);
    a.sync.kick();
    await settle();
    expect(w.db.sql("SELECT id FROM docs")).toEqual([]); // the other tab has the lock
    await a.sync.syncNow();
    expect(a.sync.status().pending).toBe(0);
    expect(w.db.sql("SELECT id FROM docs")).toEqual([{ id: "x" }]);
    held = false;
  });

  it("waits for the notes that are under way before it clears the queue for another account", async () => {
    const { a } = await pair();
    await a.account.signUp("p");
    const real = a.outbox.note.bind(a.outbox);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    a.outbox.note = async (e) => { await gate; return real(e); };
    const writing = a.put("answers", "x", { v: 1 }, T0); // its note is held
    const leaving = a.sync.forget();
    await settle();
    release();
    await Promise.all([leaving, writing]);
    expect(await a.outbox.count()).toBe(0); // the late note did not land in the cleared queue
  });

  it("makes an explicit sync wait for the round in progress and then send what came after it", async () => {
    const { a } = await pair();
    await a.account.signUp("p");
    const { createSync } = await import("../../src/account/sync");
    const posts: number[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const s = createSync({
      store: a.store,
      outbox: a.outbox,
      post: async (req) => { posts.push(req.writes.length); if (posts.length === 1) await gate; return { cursor: 1, changes: [], rejected: [], more: false }; },
      setTimer: () => 0,
      clearTimer: () => {},
      debounceMs: 0,
    });
    await s.activate((await a.outbox.getMeta<string>("user"))!);
    await a.put("answers", "a1", { v: 1 }, T0);
    const first = s.syncNow(); // in flight, waiting for the gate
    await settle();
    await a.put("answers", "a2", { v: 2 }, T0 + 1);
    let secondDone = false;
    const second = s.syncNow().then((st) => { secondDone = true; return st; });
    await settle();
    expect(secondDone).toBe(false);
    release();
    await first;
    const status = await second;
    expect(status).toMatchObject({ busy: false, pending: 0, error: null });
    expect(posts.reduce((n, c) => n + c, 0)).toBeGreaterThanOrEqual(2);
    s.close();
  });
});

describe("changes of account and failures of the outbox", () => {
  it("does not apply, or keep the cursor of, an answer for the account that was left while the request was out", async () => {
    const { a, b } = await pair();
    await a.account.signUp("p");
    await b.account.signIn();
    await b.put("answers", "x", { v: "from b" }, T0);
    await b.sync.syncNow();
    // while a's request is out, another tab makes this browser follow someone else
    const real = a.client.sync.bind(a.client);
    a.client.sync = async (r) => {
      const res = await real(r);
      a.client.sync = real;
      await a.sync.activate("someone-else");
      return res;
    };
    await a.sync.syncNow();
    expect(a.get("answers", "x")).toBeNull();
    expect(await a.outbox.getMeta("cursor")).toBeUndefined();
    expect(await a.outbox.getMeta("user")).toBe("someone-else");
  });

  it("does not retry a note that was replaced while an earlier one was being stored", async () => {
    const { w, a } = await pair();
    await a.account.signUp("p");
    const real = a.outbox.note.bind(a.outbox);
    let full = true;
    let gate: (() => void) | null = null;
    a.outbox.note = async (e) => {
      if (full) throw new Error("storage full");
      if (e.key === "answers/a1" && gate === null) await new Promise<void>((resolve) => { gate = resolve; });
      return real(e);
    };
    await a.put("answers", "a1", { v: 1 }, T0);
    await a.put("answers", "b1", { v: "old" }, T0);
    expect(a.sync.status()).toMatchObject({ pending: 2, error: "unavailable" });
    full = false;
    const round = a.sync.syncNow(); // the notes of a1 and b1 are tried again; the first waits
    await settle();
    await a.put("answers", "b1", { v: "new" }, T0 + 5000); // stored at once, which settles b1
    gate!();
    await round;
    expect(w.db.sql<{ data: string }>("SELECT data FROM docs WHERE id = 'b1'").map((r) => JSON.parse(r.data))).toEqual([{ v: "new" }]);
  });

  it("starts a scan that failed again with the next round, without a new sign-in", async () => {
    const { w, a } = await pair();
    a.seed("answers", "old1", { at: "2026-10-12T08:00:00Z", v: "scanned" });
    const documents = a.store.documents;
    let broken = true;
    a.store.documents = async (col) => { if (broken) throw new Error("page closed"); return documents(col); };
    await a.account.signUp("p");
    expect(a.sync.status()).toMatchObject({ active: true, error: "unavailable" });
    broken = false;
    await a.sync.syncNow();
    expect(a.sync.status()).toMatchObject({ error: null, pending: 0 });
    expect(await a.outbox.getMeta("seeded")).toBe(await a.outbox.getMeta("user"));
    expect(w.db.sql<{ id: string }>("SELECT id FROM docs").map((r) => r.id)).toEqual(["old1"]);
  });
});

describe("what a failed step must not lose or send to the wrong account", () => {
  it("does not send a deletion whose note failed to the account that is signed in next", async () => {
    const w = await world();
    const a = await device(w);
    const c = await device(w);
    await a.account.signUp("first");
    await c.account.signUp("second");
    await c.put("answers", "x", { v: "second's" }, T0);
    await c.sync.syncNow();
    await a.put("answers", "x", { v: "first's" }, T0 + 1);
    await a.sync.syncNow();
    // the deletion cannot be noted, and neither can the flush before signing out
    const real = a.outbox.note.bind(a.outbox);
    let full = true;
    a.outbox.note = async (e) => { if (full) throw new Error("storage full"); return real(e); };
    await a.remove("answers", "x", T0 + 5000);
    expect(a.sync.status().pending).toBe(1);
    // the same browser signs in as the second person, and the storage works again
    a.key = c.key;
    full = false;
    await a.account.signIn();
    await a.sync.syncNow();
    const live = w.db.sql<{ data: string }>("SELECT data FROM docs WHERE id = 'x' AND data IS NOT NULL").map((r) => JSON.parse(r.data).v).sort();
    expect(live).toEqual(["first's", "second's"]); // the first person's document is theirs to keep, and the second's was not deleted
    expect(a.get("answers", "x")).toEqual({ v: "second's" });
  });

  it("keeps a write that lost until the server's copy is stored, so that a failed store is sent and answered again", async () => {
    const { a, b } = await pair();
    await a.account.signUp("p");
    await b.account.signIn();
    await b.put("answers", "x", { v: "b" }, T0 + 1000);
    await b.sync.syncNow();
    await a.sync.syncNow(); // a has b's copy, and a cursor beyond it
    await a.put("answers", "x", { v: "a" }, T0 + 10); // a's clock was behind: this change is older than the server's copy
    const real = a.store.applyRemote.bind(a.store);
    let fail = true;
    a.store.applyRemote = async (...args) => { if (fail) throw new Error("storage"); return real(...args); };
    await a.sync.syncNow();
    expect(a.sync.status()).toMatchObject({ error: "unavailable", pending: 1 });
    expect(a.get("answers", "x")).toEqual({ v: "a" });
    fail = false;
    await a.sync.syncNow();
    expect(a.sync.status()).toMatchObject({ error: null, pending: 0 });
    expect(a.get("answers", "x")).toEqual({ v: "b" });
  });
});

describe("an account that holds as many documents as it may", () => {
  it("sends the deletions first, still receives what other devices changed, and says the account is full", async () => {
    const w = await world({ MAX_DOCS_PER_ACCOUNT: "100" });
    const a = await device(w);
    const b = await device(w, { key: a.key });
    await a.account.signUp("p");
    for (let i = 0; i < 100; i++) await a.put("answers", "d" + i, { i }, T0 + i);
    await a.sync.syncNow();
    expect(a.sync.status()).toMatchObject({ error: null, pending: 0 });
    await b.account.signIn();
    await b.sync.syncNow();
    // 30 additions are queued ahead of a deletion
    for (let i = 0; i < 30; i++) await a.put("answers", "n" + i, { i }, T0 + 1000 + i);
    await a.remove("answers", "d0", T0 + 5000);
    expect(await a.sync.syncNow()).toMatchObject({ error: "full", pending: 30 });
    expect(w.db.sql<{ n: number }>("SELECT COUNT(*) AS n FROM docs WHERE data IS NOT NULL")[0].n).toBe(99); // the deletion went, and made room
    // b writes into the room that is left, and a, though full, receives it
    await b.put("answers", "fromB", { v: 1 }, T0 + 6000);
    await b.sync.syncNow();
    expect(await a.sync.syncNow()).toMatchObject({ error: "full" });
    expect(a.get("answers", "fromB")).toEqual({ v: 1 });
    // deleting more here lets the queue go
    for (let i = 1; i <= 40; i++) await a.remove("answers", "d" + i, T0 + 7000 + i);
    expect(await a.sync.syncNow()).toMatchObject({ error: null, pending: 0 });
  });
});

describe("an account that is full and a queue with as many additions as deletions in a request", () => {
  it("still sends the deletions that make room", async () => {
    const w = await world({ MAX_DOCS_PER_ACCOUNT: "250", DAILY_WRITES_PER_ACCOUNT: "100000" });
    const a = await device(w);
    for (let i = 0; i < 250; i++) a.seed("answers", "d" + i, { i });
    await a.account.signUp("p");
    await a.sync.syncNow();
    expect(a.sync.status()).toMatchObject({ error: null, pending: 0 });
    // 200 additions, all older than 200 deletions: the first request holds only additions, and the deletions are as many as it
    for (let i = 0; i < SYNC_LIMITS.writes; i++) await a.put("answers", "n" + i, { i }, T0 + 1000 + i);
    for (let i = 0; i < SYNC_LIMITS.writes; i++) await a.remove("answers", "d" + i, T0 + 9000 + i);
    await a.sync.syncNow();
    expect(a.sync.status()).toMatchObject({ error: null, pending: 0 });
    expect(w.db.sql<{ n: number }>("SELECT COUNT(*) AS n FROM docs WHERE data IS NOT NULL")[0].n).toBe(250);
  });
});

describe("a device that could not ask the server at start", () => {
  it("shows the Account row when the server answers later", async () => {
    const { a } = await pair();
    const real = a.client.available.bind(a.client);
    a.client.available = async () => null; // offline, or no answer in time
    await a.account.start();
    expect(a.account.view().available).toBe(false);
    a.account.wake();
    await settle();
    expect(a.account.view().available).toBe(false); // still no answer
    a.client.available = real;
    a.account.wake();
    await settle();
    expect(a.account.view().available).toBe(true);
  });
});

describe("tabs of one browser", () => {
  it("follows another tab that signed out", async () => {
    const { a } = await pair();
    await a.account.signUp("p");
    expect(a.sync.status().active).toBe(true);
    a.kept = null; // the other tab wrote this
    await a.account.reconcile();
    expect(a.account.view().person).toBeNull();
    expect(a.sync.status().active).toBe(false);
  });

  it("follows another tab that signed in as someone else, and starts noting for that account", async () => {
    const { a } = await pair();
    await a.account.signUp("p");
    await a.put("answers", "a1", { v: 1 }, T0);
    a.kept = { id: "someone-else", name: "Q", passkeys: 1, hasKey: false };
    await a.account.reconcile();
    expect(a.account.view().person?.id).toBe("someone-else");
    expect(await a.outbox.getMeta("user")).toBe("someone-else");
    expect(a.sync.status().active).toBe(true);
  });

  it("does not let the failure of a round for the earlier account sign the new one out", async () => {
    const { a } = await pair();
    await a.account.signUp("p");
    const { SyncError } = await import("../../src/account/sync");
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    a.client.sync = async () => { await gate; throw new SyncError("signed_out"); };
    await a.put("answers", "a1", { v: 1 }, T0);
    const round = a.sync.syncNow(); // out, for the first person
    await settle();
    a.kept = { id: "someone-else", name: "Q", passkeys: 1, hasKey: false }; // another tab signed in as someone else
    await a.account.reconcile();
    release();
    await round;
    await settle();
    expect(a.account.view().person?.id).toBe("someone-else");
    expect(a.sync.status().active).toBe(true);
    expect(a.signedOutCalls).toBe(0);
  });

  it("does not end the session of someone else when signing out: another tab signed in meanwhile", async () => {
    const { a } = await pair();
    await a.account.signUp("p");
    const real = await a.client.me();
    if (!real.signedIn) throw new Error("not signed in");
    a.client.me = async () => ({ ...real, user: { ...real.user, id: "someone-else", name: "Q" } });
    const logout = vi.spyOn(a.client, "logout");
    await a.account.signOut();
    expect(logout).not.toHaveBeenCalled();
    expect(a.account.view().person?.id).toBe("someone-else");
    expect(a.account.view().message?.bad).toBe(true);
  });

  it("waits for a write under way before switching accounts, so its note goes to the account it was made under", async () => {
    const { a } = await pair();
    await a.account.signUp("p");
    await a.put("answers", "x", { v: 1 }, T0);
    await a.sync.syncNow();
    const save = a.begin("answers", "x", null, T0 + 5000); // a deletion, still being saved
    const switching = a.sync.activate("someone-else");
    await settle();
    await save();
    await switching;
    const queued = await a.outbox.list(100);
    expect(queued.filter((e) => e.id === "x" && e.t === T0 + 5000)).toEqual([]);
  });

  it("stays inactive when the sign-out comes while a change of account is still waiting for a write", async () => {
    const { a } = await pair();
    await a.account.signUp("p");
    await a.put("answers", "x", { v: 1 }, T0);
    await a.sync.syncNow();
    const save = a.begin("answers", "x", { v: 2 }, T0 + 5000);
    const switching = a.sync.activate("someone-else"); // waits for the write under way
    await settle();
    a.sync.deactivate(); // the person was signed out meanwhile
    await save();
    await switching;
    expect(a.sync.status().active).toBe(false);
  });

  it("finishes a change of account before the next one begins, and ends with the last person", async () => {
    const { a } = await pair();
    await a.account.signUp("p");
    const real = a.sync.activate.bind(a.sync);
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    let calls = 0;
    a.sync.activate = async (id) => { if (++calls === 1) await gate; return real(id); }; // the first change is slow
    a.kept = { id: "first", name: "A", passkeys: 1, hasKey: false };
    const one = a.account.reconcile();
    await settle();
    a.kept = { id: "second", name: "B", passkeys: 1, hasKey: false };
    const two = a.account.reconcile();
    await settle();
    release();
    await Promise.all([one, two]);
    expect(a.account.view().person?.id).toBe("second");
    expect(await a.outbox.getMeta("user")).toBe("second");
  });

  it("adopts the person another tab put in place while this tab was starting, not the one it read first", async () => {
    const { a } = await pair();
    await a.account.signUp("p");
    const first = a.account.view().person!.id;
    const real = a.sync.resume.bind(a.sync);
    const activated: string[] = [];
    const realActivate = a.sync.activate.bind(a.sync);
    a.sync.activate = async (id) => { activated.push(id); return realActivate(id); };
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    a.sync.resume = async () => { await gate; return real(); };
    const { createAccount } = await import("../../src/account/account");
    const secondIsIn = { signedIn: true as const, user: { id: "second", name: "B", passkeys: 1, hasKey: false, createdAt: "2026-10-16T00:00:00Z" } }; // what the server says once the other tab has signed in
    const again = createAccount({ client: { ...a.client, me: async () => secondIsIn }, sync: a.sync, passkeys: { supported: () => true, create: async () => ({}), get: async () => ({}) }, keep: { read: () => a.kept, write: (p) => void (a.kept = p) } });
    const starting = again.start(); // waits for the outbox
    await settle();
    a.kept = { id: "second", name: "B", passkeys: 1, hasKey: false }; // another tab signed in as someone else
    await again.reconcile();
    release();
    await starting;
    await settle();
    expect(again.view().person?.id).toBe("second");
    expect(await a.outbox.getMeta("user")).toBe("second");
    expect(activated).not.toContain(first); // the person read before the wait was never put in place, not even for a moment
  });

  it("leaves the work to the tab that holds the lock and looks again later, not at once", async () => {
    const { a } = await pair();
    await a.account.signUp("p");
    const { createSync } = await import("../../src/account/sync");
    const timers: { fn: () => void; ms: number }[] = [];
    let rounds = 0;
    const s = createSync({
      store: a.store,
      outbox: a.outbox,
      post: async () => ({ cursor: 1, changes: [], rejected: [], more: false }),
      exclusive: async () => { rounds += 1; return undefined; }, // another tab has the lock
      setTimer: (fn, ms) => (timers.push({ fn, ms }), timers.length),
      clearTimer: () => {},
      debounceMs: 0,
      backoffMs: 15_000,
    });
    await s.activate((await a.outbox.getMeta<string>("user"))!);
    await a.put("answers", "a1", { v: 1 }, T0);
    const first = timers.at(-1)!;
    first.fn(); // the round: the lock is not available
    await settle();
    expect(rounds).toBe(1);
    expect(s.status().error).toBeNull();
    expect(timers.at(-1)!.ms).toBeGreaterThanOrEqual(15_000); // not again after the debounce
  });

  it("does not delete an account while the session belongs to no one, or to someone else than the one shown", async () => {
    const { w, a } = await pair();
    await a.account.signUp("p");
    a.clearCookie(); // the session ended in another tab
    await a.account.deleteAccount();
    expect(a.account.view().message?.bad).toBe(true);
    expect(a.account.view().person).toBeNull();
    expect(w.db.sql<{ n: number }>("SELECT COUNT(*) AS n FROM users")[0].n).toBe(1);
  });
});
