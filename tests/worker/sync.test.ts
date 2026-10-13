// The server copy of a person's documents (worker/sync.ts): who may use it, what it keeps, and how two devices that wrote the same document are settled.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_API, SYNC_LIMITS } from "../../src/account/protocol";
import { signUp, sync, world, write, type World } from "./accounts-support";
import { json } from "./support";

beforeEach(() => void vi.spyOn(console, "error").mockImplementation(() => {}));
afterEach(() => vi.restoreAllMocks());

const T0 = Date.parse("2026-10-13T09:00:00Z");
const post = (w: World, cookie: string | undefined, body: unknown) => w.call(ACCOUNT_API.sync, { cookie, body });
const rows = (w: World) => w.db.sql<{ user_id: string; col: string; id: string; data: string | null; t: number; seq: number }>("SELECT user_id, col, id, data, t, seq FROM docs ORDER BY user_id, seq");

describe("who may sync", () => {
  it("only a signed-in person", async () => {
    const w = await world();
    const res = await post(w, undefined, { cursor: 0, writes: [] });
    expect(res.status).toBe(401);
    expect((await json(res)).error.code).toBe("signed_out");
    expect((await post(w, "__Secure-riglam-session=nope", { cursor: 0, writes: [] })).status).toBe(401);
  });

  it("keeps each person's documents apart", async () => {
    const w = await world();
    const a = await signUp(w, "a");
    const b = await signUp(w, "b");
    await sync(w, a, 0, [write("answers", "x", { v: "a's" }, T0)]);
    await sync(w, b, 0, [write("answers", "x", { v: "b's" }, T0 - 1000)]);
    expect((await sync(w, a, 0)).changes.map((c) => c.doc)).toEqual([{ v: "a's" }]);
    expect((await sync(w, b, 0)).changes.map((c) => c.doc)).toEqual([{ v: "b's" }]);
  });
});

describe("sending and receiving", () => {
  it("stores what is sent and gives it back to another device that asks from the start", async () => {
    const w = await world();
    const me = await signUp(w);
    const sent = await sync(w, me, 0, [write("answers", "a1", { at: "2026-10-13T08:00:00Z", right: true }, T0), write("favorites", "f1", { key: "k" }, T0 + 1)]);
    expect(sent.rejected).toEqual([]);
    expect(sent.more).toBe(false);
    // the request's own accepted writes come back too, with the cursor after them
    expect(sent.changes).toEqual([
      { c: "answers", id: "a1", doc: { at: "2026-10-13T08:00:00Z", right: true }, t: T0 },
      { c: "favorites", id: "f1", doc: { key: "k" }, t: T0 + 1 },
    ]);
    expect(sent.cursor).toBe(2);

    const other = await sync(w, me, 0);
    expect(other.changes).toEqual(sent.changes);
    expect(other.cursor).toBe(2);
  });

  it("gives only what is newer than the cursor", async () => {
    const w = await world();
    const me = await signUp(w);
    const first = await sync(w, me, 0, [write("answers", "a1", { n: 1 }, T0)]);
    await sync(w, me, first.cursor, [write("answers", "a2", { n: 2 }, T0 + 1)]);
    const later = await sync(w, me, first.cursor);
    expect(later.changes.map((c) => c.id)).toEqual(["a2"]);
    expect((await sync(w, me, later.cursor)).changes).toEqual([]);
    // nothing new: the cursor stays
    expect((await sync(w, me, later.cursor)).cursor).toBe(later.cursor);
  });

  it("numbers the changes in the order they were accepted, and a changed document moves to the end", async () => {
    const w = await world();
    const me = await signUp(w);
    await sync(w, me, 0, [write("answers", "a", { n: 1 }, T0), write("answers", "b", { n: 1 }, T0)]);
    await sync(w, me, 0, [write("answers", "a", { n: 2 }, T0 + 5)]);
    expect(rows(w).map((r) => [r.id, r.seq])).toEqual([["b", 2], ["a", 3]]);
    expect((await sync(w, me, 2)).changes.map((c) => c.id)).toEqual(["a"]);
  });

  it("pages a long list of changes", async () => {
    const w = await world();
    const me = await signUp(w);
    const many = Array.from({ length: SYNC_LIMITS.changes + 20 }, (_, i) => write("answers", "d" + i, { i }, T0 + i));
    for (let i = 0; i < many.length; i += SYNC_LIMITS.writes) await sync(w, me, 0, many.slice(i, i + SYNC_LIMITS.writes));
    const first = await sync(w, me, 0);
    expect(first.changes).toHaveLength(SYNC_LIMITS.changes);
    expect(first.more).toBe(true);
    const rest = await sync(w, me, first.cursor);
    expect(rest.changes).toHaveLength(20);
    expect(rest.more).toBe(false);
    expect(new Set([...first.changes, ...rest.changes].map((c) => c.id)).size).toBe(SYNC_LIMITS.changes + 20);
  });

  it("answers an empty request with the cursor it was given", async () => {
    const w = await world();
    const me = await signUp(w);
    expect(await sync(w, me, 0)).toEqual({ cursor: 0, changes: [], rejected: [], more: false });
    expect(await json(await post(w, me.cookie, { cursor: 7 }))).toEqual({ cursor: 7, changes: [], rejected: [], more: false });
  });
});

describe("two devices write the same document", () => {
  it("the later write wins, on whichever device it came from", async () => {
    const w = await world();
    const me = await signUp(w);
    await sync(w, me, 0, [write("answers", "a", { by: "phone" }, T0 + 10)]);
    const lost = await sync(w, me, 0, [write("answers", "a", { by: "laptop" }, T0)]);
    expect(lost.rejected).toEqual([{ c: "answers", id: "a", doc: { by: "phone" }, t: T0 + 10 }]);
    const won = await sync(w, me, 0, [write("answers", "a", { by: "laptop, later" }, T0 + 20)]);
    expect(won.rejected).toEqual([]);
    expect(rows(w).map((r) => JSON.parse(r.data!).by)).toEqual(["laptop, later"]);
  });

  it("on a tie the server's copy stays, so that sending the same write twice changes nothing", async () => {
    const w = await world();
    const me = await signUp(w);
    const one = write("answers", "a", { n: 1 }, T0);
    await sync(w, me, 0, [one]);
    const before = rows(w);
    const again = await sync(w, me, 0, [one]);
    expect(again.rejected).toEqual([one]);
    expect(rows(w)).toEqual(before);
    const other = await sync(w, me, 0, [write("answers", "a", { n: 2 }, T0)]);
    expect(other.rejected).toEqual([one]);
    expect(rows(w)[0].data).toBe(JSON.stringify({ n: 1 }));
  });

  it("a deletion is a write like any other: it beats an older copy and loses to a newer one", async () => {
    const w = await world();
    const me = await signUp(w);
    await sync(w, me, 0, [write("favorites", "f", { key: "k" }, T0)]);
    const gone = await sync(w, me, 1, [write("favorites", "f", null, T0 + 5)]);
    expect(gone.changes).toEqual([{ c: "favorites", id: "f", doc: null, t: T0 + 5 }]);
    // another device that has not heard of it asks from the start and learns of the deletion
    expect((await sync(w, me, 0)).changes).toEqual([{ c: "favorites", id: "f", doc: null, t: T0 + 5 }]);
    // an older copy written later (a device that was offline) does not bring it back
    const late = await sync(w, me, 2, [write("favorites", "f", { key: "k", again: true }, T0 + 2)]);
    expect(late.rejected).toEqual([{ c: "favorites", id: "f", doc: null, t: T0 + 5 }]);
    // a newer one does
    const back = await sync(w, me, 2, [write("favorites", "f", { key: "k", again: true }, T0 + 9)]);
    expect(back.rejected).toEqual([]);
    expect(JSON.parse(rows(w)[0].data!)).toEqual({ key: "k", again: true });
  });

  it("a deletion of a document the server never had is kept, so that it beats an older copy that turns up later", async () => {
    const w = await world();
    const me = await signUp(w);
    await sync(w, me, 0, [write("skips", "s", null, T0 + 5)]);
    expect(rows(w)).toHaveLength(1);
    const late = await sync(w, me, 0, [write("skips", "s", { n: 1 }, T0)]);
    expect(late.rejected).toHaveLength(1);
  });

  it("takes the last of several writes to one document in one request", async () => {
    const w = await world();
    const me = await signUp(w);
    await sync(w, me, 0, [write("answers", "a", { n: 2 }, T0 + 2), write("answers", "a", { n: 1 }, T0 + 1), write("answers", "a", { n: 3 }, T0 + 3)]);
    expect(rows(w).map((r) => JSON.parse(r.data!).n)).toEqual([3]);
    expect(w.db.sql<{ writes: number }>("SELECT writes FROM sync_quota")[0].writes).toBe(1);
  });

  it("returns the server's copy for every write that lost, however many", async () => {
    const w = await world();
    const me = await signUp(w);
    const docs = Array.from({ length: 90 }, (_, i) => write("answers", "d" + i, { i }, T0 + 100));
    await sync(w, me, 0, docs);
    const older = docs.map((d) => ({ ...d, doc: { stale: true }, t: T0 }));
    const res = await sync(w, me, 0, older);
    expect(res.rejected).toHaveLength(90);
    expect(res.rejected.every((r) => !("stale" in (r.doc as object)))).toBe(true);
  });
});

describe("what a write may be", () => {
  const refused = async (w: World, me: { cookie: string }, writes: unknown[], status = 400) => {
    const res = await post(w, me.cookie, { cursor: 0, writes });
    expect(res.status, JSON.stringify(writes).slice(0, 80)).toBe(status);
    expect(rows(w)).toHaveLength(0);
    return res;
  };

  it("belongs to a collection the app has, with an id the stores accept", async () => {
    const w = await world();
    const me = await signUp(w);
    await refused(w, me, [write("secrets", "x", {}, T0)]);
    await refused(w, me, [write("answers", "__proto__", {}, T0)]);
    await refused(w, me, [write("answers", "..", {}, T0)]);
    await refused(w, me, [write("answers", "a/b", {}, T0)]);
    await refused(w, me, [write("answers", "", {}, T0)]);
    await refused(w, me, [write("answers", "x".repeat(201), {}, T0)]);
    await refused(w, me, [write("__proto__", "x", {}, T0)]);
    await refused(w, me, [{ c: "answers", id: 5, doc: {}, t: T0 }]);
    // one bad write refuses the whole request, so that the device does not think the rest went through
    await refused(w, me, [write("answers", "ok", {}, T0), write("nope", "x", {}, T0)]);
  });

  it("is an object, or a deletion, with a time", async () => {
    const w = await world();
    const me = await signUp(w);
    await refused(w, me, [{ c: "answers", id: "a", doc: [1], t: T0 }]);
    await refused(w, me, [{ c: "answers", id: "a", doc: "text", t: T0 }]);
    await refused(w, me, [{ c: "answers", id: "a", t: T0 }]);
    await refused(w, me, [{ c: "answers", id: "a", doc: {}, t: "yesterday" }]);
    await refused(w, me, [{ c: "answers", id: "a", doc: {}, t: -1 }]);
    await refused(w, me, [{ c: "answers", id: "a", doc: {} }]);
    await refused(w, me, ["answers/a"]);
    await refused(w, me, [null]);
  });

  it("is not larger than a store takes", async () => {
    const w = await world();
    const me = await signUp(w);
    await refused(w, me, [write("answers", "big", { text: "x".repeat(SYNC_LIMITS.docBytes) }, T0)]);
    await sync(w, me, 0, [write("answers", "fits", { text: "x".repeat(SYNC_LIMITS.docBytes - 100) }, T0)]);
    expect(rows(w)).toHaveLength(1);
  });

  it("comes in a list that is not too long, with a body that is not too large", async () => {
    const w = await world();
    const me = await signUp(w);
    await refused(w, me, Array.from({ length: SYNC_LIMITS.writes + 1 }, (_, i) => write("answers", "d" + i, {}, T0)));
    const big = await post(w, me.cookie, { cursor: 0, writes: [write("answers", "a", { text: "x".repeat(SYNC_LIMITS.body) }, T0)] });
    expect(big.status).toBe(413);
    expect((await post(w, me.cookie, { cursor: 0, writes: "no" })).status).toBe(400);
    expect((await post(w, me.cookie, { cursor: -1, writes: [] })).status).toBe(400);
    expect((await post(w, me.cookie, { cursor: 1.5, writes: [] })).status).toBe(400);
    expect((await post(w, me.cookie, { cursor: "0", writes: [] })).status).toBe(400);
    expect((await post(w, me.cookie, {})).status).toBe(400);
    expect((await post(w, me.cookie, [])).status).toBe(400);
  });

  it("is dated at most a few minutes ahead, so that a clock that is wrong cannot make a copy that nobody can beat", async () => {
    const w = await world();
    const me = await signUp(w);
    const now = w.clock.now.getTime();
    await sync(w, me, 0, [write("answers", "a", { n: 1 }, now + 10 * 365 * 86_400_000)]);
    expect(rows(w)[0].t).toBe(now + 5 * 60_000);
    // an honest write made a little later still wins
    const next = await sync(w, me, 0, [write("answers", "a", { n: 2 }, now + 5 * 60_000 + 1)]);
    expect(next.rejected).toHaveLength(1); // clamped to the same time: a tie
    w.clock.now = new Date(now + 10 * 60_000);
    expect((await sync(w, me, 0, [write("answers", "a", { n: 3 }, now + 9 * 60_000)])).rejected).toEqual([]);
  });

  it("keeps a document as it came: nested objects, arrays, numbers, unicode", async () => {
    const w = await world();
    const me = await signUp(w);
    const doc = { a: [1, 2.5, null, true], b: { c: "рупа 色 ✓" }, "ключ": 0 };
    const res = await sync(w, me, 0, [write("debates", "d", doc, T0)]);
    expect(res.changes[0].doc).toEqual(doc);
  });
});

describe("limits", () => {
  it("allows each account so many document changes a day, and starts again the next day", async () => {
    const w = await world({ DAILY_WRITES_PER_ACCOUNT: "30" });
    const me = await signUp(w);
    const other = await signUp(w, "other");
    const batch = (n: number, from = 0) => Array.from({ length: n }, (_, i) => write("answers", "d" + (from + i), { i }, T0 + from + i));
    await sync(w, me, 0, batch(25));
    const over = await post(w, me.cookie, { cursor: 0, writes: batch(6, 25) });
    expect(over.status).toBe(429);
    expect(over.headers.get("retry-after")).toBeTruthy();
    expect((await json(over)).error.code).toBe("quota");
    expect(rows(w).filter((r) => r.user_id === me.id)).toHaveLength(25); // nothing of the refused request was kept
    await sync(w, me, 0, batch(5, 25)); // up to the limit
    // another account has its own count
    await sync(w, other, 0, batch(25));
    // reading is not limited
    expect((await sync(w, me, 0)).changes.length).toBeGreaterThan(0);
    w.clock.now = new Date(w.clock.now.getTime() + 86_400_000);
    await sync(w, me, 0, batch(10, 100));
  });

  it("holds each account to so many documents; deletions and changes to existing ones do not count against it", async () => {
    const w = await world({ MAX_DOCS_PER_ACCOUNT: "100" });
    const me = await signUp(w);
    const batch = (n: number, from = 0) => Array.from({ length: n }, (_, i) => write("answers", "d" + (from + i), { i }, T0 + from + i));
    await sync(w, me, 0, batch(100));
    const over = await post(w, me.cookie, { cursor: 0, writes: batch(1, 100) });
    expect(over.status).toBe(429);
    await sync(w, me, 0, [write("answers", "d0", null, T0 + 1000)]); // deleting makes room
    await sync(w, me, 0, batch(1, 100));
    expect(rows(w).filter((r) => r.data !== null)).toHaveLength(100);
  });

  it("takes a setting that is not a sensible number as the default", async () => {
    const w = await world({ DAILY_WRITES_PER_ACCOUNT: "lots", MAX_DOCS_PER_ACCOUNT: "-5" });
    const me = await signUp(w);
    await sync(w, me, 0, [write("answers", "a", {}, T0)]);
    expect(rows(w)).toHaveLength(1);
  });
});
