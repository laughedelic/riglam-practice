// The server copy of a person's documents (worker/sync.ts): who may use it, what it keeps, and how two devices that wrote the same document are settled.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACCOUNT_API, SYNC_LIMITS } from "../../src/account/protocol";
import { beforeStatement, signIn, signUp, sync, world, write, type World } from "./accounts-support";
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

  it("keeps an answer to so much text, and says there is more until every document has come", async () => {
    const w = await world();
    const me = await signUp(w);
    const big = (i: number) => write("answers", "big" + i, { text: "x".repeat(200_000) }, T0 + i);
    for (let i = 0; i < 30; i += 10) await sync(w, me, 0, Array.from({ length: 10 }, (_, k) => big(i + k)));
    const seen: string[] = [];
    let cursor = 0;
    let rounds = 0;
    for (let more = true; more; rounds++) {
      const res = await sync(w, me, cursor);
      expect(res.changes.length).toBeGreaterThan(0);
      expect(res.changes.length).toBeLessThan(30); // 30 documents of 200 KB are over the limit of one answer
      expect(res.more).toBe(res.cursor < w.db.sql<{ m: number }>("SELECT MAX(seq) AS m FROM docs")[0].m);
      seen.push(...res.changes.map((c) => c.id));
      cursor = res.cursor;
      more = res.more;
    }
    expect(rounds).toBeGreaterThan(1);
    expect(new Set(seen).size).toBe(30);
  });

  it("always sends the first document, however large it is", async () => {
    const w = await world();
    const me = await signUp(w);
    await sync(w, me, 0, [write("answers", "a", { text: "x".repeat(SYNC_LIMITS.docBytes - 100) }, T0)]);
    const res = await sync(w, me, 0);
    expect(res.changes).toHaveLength(1);
    expect(res.more).toBe(false);
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

  it("counts the body in bytes as it arrives, not in characters, and not by what the header says", async () => {
    const w = await world();
    const me = await signUp(w);
    // 18 documents of 120 000 two-byte characters: 2.2 million characters, 4.3 million bytes
    const writes = Array.from({ length: 18 }, (_, i) => write("answers", "d" + i, { text: "é".repeat(120_000) }, T0 + i));
    const res = await post(w, me.cookie, { cursor: 0, writes });
    expect(res.status).toBe(413);
    expect(rows(w)).toHaveLength(0);
    const lying = await w.call(ACCOUNT_API.sync, { cookie: me.cookie, body: { cursor: 0, writes }, headers: { "content-length": "100" } });
    expect(lying.status).toBe(413);
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

  it("counts a rewrite of a document the account holds as no new document, though it is at its limit", async () => {
    const w = await world({ MAX_DOCS_PER_ACCOUNT: "100" });
    const me = await signUp(w);
    const batch = (n: number, from = 0, t = 0) => Array.from({ length: n }, (_, i) => write("answers", "d" + (from + i), { i, t }, T0 + t + from + i));
    await sync(w, me, 0, batch(100));
    const again = await post(w, me.cookie, { cursor: 0, writes: batch(100, 0, 1000) }); // every one is held; each is newer
    expect(again.status).toBe(200);
    // a deletion beside a new document leaves the count where it is
    const swap = await post(w, me.cookie, { cursor: 0, writes: [write("answers", "d0", null, T0 + 5000), write("answers", "new", {}, T0 + 5000)] });
    expect(swap.status).toBe(200);
    // two new ones beside one deletion do not
    const over = await post(w, me.cookie, { cursor: 0, writes: [write("answers", "d1", null, T0 + 6000), write("answers", "n1", {}, T0 + 6000), write("answers", "n2", {}, T0 + 6000)] });
    expect(over.status).toBe(429);
    // a new document that loses to a stored deletion adds nothing
    const stale = await post(w, me.cookie, { cursor: 0, writes: [write("answers", "d0", {}, T0 + 10), write("answers", "n3", null, T0)] });
    expect(stale.status).toBe(200);
    expect(rows(w).filter((r) => r.data !== null)).toHaveLength(100);
  });

  it("holds each account to so many rows, deletion marks included, and lets old marks go", async () => {
    const w = await world({ MAX_DOCS_PER_ACCOUNT: "100" });
    const me = await signUp(w);
    const marks = (n: number, from = 0, t = T0) => Array.from({ length: n }, (_, i) => write("answers", "m" + (from + i), null, t + i));
    await sync(w, me, 0, marks(200)); // deletions of documents the server never held: 200 rows, the most (twice the document limit)
    const over = await post(w, me.cookie, { cursor: 0, writes: marks(1, 200) });
    expect(over.status).toBe(429);
    expect(rows(w)).toHaveLength(200);
    // a mark that is there is changed, not added; a document that is there is rewritten; neither is a new row
    expect((await post(w, me.cookie, { cursor: 0, writes: [write("answers", "m0", null, T0 + 5000)] })).status).toBe(200);
    expect((await post(w, me.cookie, { cursor: 0, writes: [write("answers", "m1", {}, T0 + 5000)] })).status).toBe(200);
    // marks older than three months go to make room
    w.clock.now = new Date(w.clock.now.getTime() + 91 * 86_400_000);
    const t = w.clock.now.getTime();
    const later = await signIn(w, me.key); // the first session is over by now
    expect((await post(w, later.cookie, { cursor: 0, writes: marks(1, 200, t) })).status).toBe(200);
    const left = rows(w);
    expect(left.find((r) => r.id === "m200")).toBeTruthy();
    expect(left.find((r) => r.id === "m1")?.data).not.toBeNull(); // a document is never taken for a mark
    expect(left.length).toBeLessThan(200);
  });

  it("does not load more of the server's copies than an answer carries, however many small writes lose against large copies", async () => {
    const w = await world();
    const me = await signUp(w);
    const big = (i: number, t: number) => write("answers", "big" + i, { text: "x".repeat(200_000) }, t);
    for (let k = 0; k < 3; k++) await sync(w, me, 0, Array.from({ length: 10 }, (_, i) => big(k * 10 + i, T0 + 1000)));
    const upTo = rows(w).at(-1)!.seq;
    // 30 small writes, each older than the stored copy of its document: all lose, and their copies are 6 million characters together
    const stale = Array.from({ length: 30 }, (_, i) => write("answers", "big" + i, {}, T0));
    const first = await sync(w, me, upTo, stale);
    const chars = (cs: { doc: unknown }[]) => cs.reduce((n, c) => n + JSON.stringify(c.doc).length, 0);
    expect(chars(first.rejected)).toBeLessThanOrEqual(4 * 1024 * 1024);
    expect(first.rejected.length).toBeLessThan(30);
    // the copies that did not fit come with the changes, in this answer and the next ones, so that the device is given all 30
    const got = new Set(first.rejected.map((c) => c.id));
    let res = first;
    for (let rounds = 0; ; rounds++) {
      expect(rounds).toBeLessThan(10);
      res.changes.forEach((c) => got.add(c.id));
      expect(chars(res.changes) + chars(res.rejected)).toBeLessThanOrEqual(4 * 1024 * 1024 + 300_000);
      if (!res.more) break;
      res = await sync(w, me, res.cursor);
    }
    expect(got.size).toBe(30);
  });

  it("takes the day's allowance of writes in one step, so that a request arriving together with another cannot pass it", async () => {
    const w = await world({ DAILY_WRITES_PER_ACCOUNT: "30" });
    const me = await signUp(w);
    const batch = (from: number) => Array.from({ length: 20 }, (_, i) => write("answers", "d" + (from + i), { i }, T0 + from + i));
    // another request of the account takes 20 of the 30 after this one has looked at the room and before it stores anything
    beforeStatement(w, "COUNT(data) AS live FROM docs", () => w.db.sql("INSERT INTO sync_quota (day, user_id, writes) VALUES ('2026-10-13', ?, 20) RETURNING day", me.id));
    const res = await post(w, me.cookie, { cursor: 0, writes: batch(0) });
    expect(res.status).toBe(429);
    expect(rows(w)).toHaveLength(0);
    expect(w.db.sql<{ writes: number }>("SELECT writes FROM sync_quota")[0].writes).toBe(20);
  });

  it("stores nothing, and no counter, for an account deleted while the request was under way", async () => {
    const w = await world();
    const me = await signUp(w);
    beforeStatement(w, "INSERT INTO sync_quota", () => w.db.sql("DELETE FROM users"));
    const res = await post(w, me.cookie, { cursor: 0, writes: [write("answers", "a", {}, T0)] });
    expect(res.status).toBe(401);
    expect((await json(res)).error.code).toBe("signed_out");
    expect(rows(w)).toHaveLength(0);
    expect(w.db.sql("SELECT user_id FROM sync_quota")).toHaveLength(0);

    const other = await signUp(w, "other");
    beforeStatement(w, "INSERT INTO docs", () => w.db.sql("DELETE FROM users"));
    await post(w, other.cookie, { cursor: 0, writes: [write("answers", "a", {}, T0)] });
    expect(rows(w)).toHaveLength(0);
  });

  it("takes a setting that is not a sensible number as the default", async () => {
    const w = await world({ DAILY_WRITES_PER_ACCOUNT: "lots", MAX_DOCS_PER_ACCOUNT: "-5" });
    const me = await signUp(w);
    await sync(w, me, 0, [write("answers", "a", {}, T0)]);
    expect(rows(w)).toHaveLength(1);
  });
});
