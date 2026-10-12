// The PWA's stand-in for the artifact `db` capability (src/pwa/local-db.js), exercised in the real browser
// through window.claude.use("db"), the way the page uses it.
import { test, expect } from "../../support/test.js";
import { ready } from "../../support/page.js";

const open = async (page) => {
  await page.goto("/");
  await ready(page);
};
// each test uses its own collection so tests running in parallel (and left-over data) never collide
const col = (testInfo) => `t${testInfo.workerIndex}x${testInfo.parallelIndex}x${Date.now()}`;

test("the runtime offers db and no sample", async ({ page }) => {
  await open(page);
  expect(await page.evaluate(async () => [!!(await window.claude.use("db")), await window.claude.use("sample"), await window.claude.use("nothing")])).toEqual([true, null, null]);
});

test("set, get, update, delete", async ({ page }, testInfo) => {
  await open(page);
  const c = col(testInfo);
  const r = await page.evaluate(async (c) => {
    const db = await window.claude.use("db");
    const ref = db.collection(c).doc("a");
    const out = {};
    out.missing = (await ref.get()).exists;
    await ref.set({ n: 1, nested: { x: 1, y: 2 }, list: [1, 2] });
    out.got = (await ref.get()).data();
    await ref.update({ n: 2, nested: { y: 3 }, list: [9] });
    out.merged = (await ref.get()).data();
    out.frozen = Object.isFrozen((await ref.get()).data());
    try { await db.collection(c).doc("nope").update({ a: 1 }); } catch (e) { out.updateMissing = e.code; }
    try { await ref.set([1]); } catch (e) { out.badBody = e.code; }
    await ref.delete();
    out.afterDelete = (await ref.get()).exists;
    try { db.doc(c); } catch (e) { out.oddDoc = e instanceof TypeError; }
    try { db.collection(c + "/a"); } catch (e) { out.evenCol = e instanceof TypeError; }
    return out;
  }, c);
  expect(r).toEqual({
    missing: false,
    got: { n: 1, nested: { x: 1, y: 2 }, list: [1, 2] },
    merged: { n: 2, nested: { x: 1, y: 3 }, list: [9] },
    frozen: true,
    updateMissing: "invalid_argument",
    badBody: "invalid_argument",
    afterDelete: false,
    oddDoc: true,
    evenCol: true,
  });
});

test("queries order, filter and limit", async ({ page }, testInfo) => {
  await open(page);
  const c = col(testInfo);
  const r = await page.evaluate(async (c) => {
    const db = await window.claude.use("db");
    const k = db.collection(c);
    await Promise.all([["a", 3, "x"], ["b", 1, "y"], ["c", 2, "x"], ["d", undefined, "y"]].map(([id, n, g]) => k.doc(id).set(n === undefined ? { g } : { n, g })));
    const ids = async (q) => (await q.get()).docs.map((d) => d.id);
    return {
      byId: await ids(k),
      asc: await ids(k.orderBy("n")),
      desc: await ids(k.orderBy("n", "desc")),
      limited: await ids(k.orderBy("n").limit(2)),
      eq: await ids(k.where("g", "==", "x")),
      gt: await ids(k.where("n", ">", 1)),
      inOp: await ids(k.where("g", "in", ["y"])),
    };
  }, c);
  expect(r).toEqual({ byId: ["a", "b", "c", "d"], asc: ["b", "c", "a", "d"], desc: ["a", "c", "b", "d"], limited: ["b", "c"], eq: ["a", "c"], gt: ["a", "c"], inOp: ["b", "d"] });
});

test("onSnapshot delivers the current state, then every change", async ({ page }, testInfo) => {
  await open(page);
  const c = col(testInfo);
  const seen = await page.evaluate(async (c) => {
    const db = await window.claude.use("db");
    const k = db.collection(c);
    const log = [];
    let un;
    await new Promise((first) => {
      un = k.orderBy("n").onSnapshot((s) => { log.push(s.docs.map((d) => d.id + ":" + d.data().n).join(",")); first(); });
    });
    await k.doc("a").set({ n: 1 });
    await k.doc("b").set({ n: 0 });
    await k.doc("a").update({ n: 5 });
    await k.doc("b").delete();
    await new Promise((r) => setTimeout(r, 50));
    un();
    await k.doc("z").set({ n: 9 });
    await new Promise((r) => setTimeout(r, 50));
    return log;
  }, c);
  expect(seen[0]).toBe(""); // first delivery: the collection is empty
  expect(seen.at(-1)).toBe("a:5"); // last: after the deletion, and nothing after unsubscribing
  expect(seen).toContain("b:0,a:1");
});

test("documents survive a reload", async ({ page }, testInfo) => {
  await open(page);
  const c = col(testInfo);
  await page.evaluate(async (c) => { await (await window.claude.use("db")).collection(c).doc("kept").set({ v: 42 }); }, c);
  await page.reload();
  await ready(page);
  expect(await page.evaluate(async (c) => (await (await window.claude.use("db")).collection(c).doc("kept").get()).data(), c)).toEqual({ v: 42 });
});

test("a second tab sees changes made in the first", async ({ page, context }, testInfo) => {
  await open(page);
  const other = await context.newPage();
  await open(other);
  const c = col(testInfo);
  await other.evaluate(async (c) => {
    const db = await window.claude.use("db");
    window.__got = [];
    db.collection(c).onSnapshot((s) => window.__got.push(s.size));
  }, c);
  await page.evaluate(async (c) => { await (await window.claude.use("db")).collection(c).doc("x").set({ v: 1 }); }, c);
  await expect.poll(() => other.evaluate(() => window.__got.at(-1))).toBe(1);
});
