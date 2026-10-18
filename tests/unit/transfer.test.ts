// Export and import of the stored documents and settings (src/store/transfer.ts), against the in-memory local db.
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { createLocalDb } from "../../src/pwa/local-db";
import type { Db, Doc } from "../../src/platform/types";
import {
  COLLECTIONS, FORMAT, type DataFile, PREFERENCE_KEYS, TransferError, VERSION, applyImport, exportData, fileName, parseDataFile, planImport, serialize, stampOf,
} from "../../src/store/transfer";

const newDb = () => createLocalDb({ channel: false });
const fakeStorage = (init: Record<string, string> = {}): Storage => {
  const m = new Map(Object.entries(init));
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  };
};
const put = (db: Db, col: string, id: string, doc: Doc) => db.collection(col).doc(id).set(doc);
const read = async (db: Db, col: string) => Object.fromEntries((await db.collection(col).get()).docs.map((d) => [d.id, d.data()]));
const OLD = "2026-10-01T10:00:00.000Z";
const NEW = "2026-10-02T10:00:00.000Z";

describe("export", () => {
  it("collects every known collection and the settings that are set", async () => {
    const db = newDb();
    await put(db, "answers", "a1", { pairId: "a1", at: OLD });
    await put(db, "favorites", "f1", { key: "f1", at: OLD });
    const file = await exportData(db, { storage: fakeStorage({ "rd-notation": "sets", "unrelated": "x" }), now: new Date("2026-10-13T08:00:00Z") });
    expect(file.format).toBe(FORMAT);
    expect(file.version).toBe(VERSION);
    expect(file.exportedAt).toBe("2026-10-13T08:00:00.000Z");
    expect(Object.keys(file.collections)).toEqual([...COLLECTIONS]);
    expect(file.collections.answers).toEqual({ a1: { pairId: "a1", at: OLD } });
    expect(file.collections.debates).toEqual({});
    expect(file.preferences).toEqual({ "rd-notation": "sets" });
  });

  it("names the file after the date", () => {
    expect(fileName(new Date("2026-10-13T23:30:00Z"))).toBe("riglam-practice-2026-10-13.json");
  });
});

describe("round trip", () => {
  it("copies documents into an empty db, then a second import changes nothing", async () => {
    const a = newDb();
    await put(a, "answers", "a1", { pairId: "a1", at: OLD, cells: { both: { text: "x" } } });
    await put(a, "debates", "d1", { at: OLD });
    await put(a, "skips", "s1", { key: "s1", n: 2, at: OLD });
    const text = serialize(await exportData(a, { storage: fakeStorage({ "rd-wording": "plain" }) }));

    const b = newDb();
    const storage = fakeStorage();
    const plan = await planImport(b, parseDataFile(text), { storage });
    expect(plan.totals).toEqual({ add: 3, update: 0, same: 0, keep: 0 });
    expect(plan.preferences).toEqual({ "rd-wording": "plain" });
    const report = await applyImport(b, plan, { storage });
    expect(report).toEqual({ written: 3, skipped: 0, failed: [], preferencesRestored: 1 });
    expect(await read(b, "answers")).toEqual({ a1: { pairId: "a1", at: OLD, cells: { both: { text: "x" } } } });
    expect(storage.getItem("rd-wording")).toBe("plain");

    const again = await planImport(b, parseDataFile(text), { storage });
    expect(again.writes).toEqual([]);
    expect(again.totals).toEqual({ add: 0, update: 0, same: 3, keep: 0 });
    expect(again.preferences).toEqual({});
  });

  it("treats a document as the same whatever the order of its keys", async () => {
    const b = newDb();
    await put(b, "answers", "a1", { x: 1, y: { p: 1, q: 2 } });
    const file = parseDataFile(JSON.stringify({ format: FORMAT, version: 1, collections: { answers: { a1: { y: { q: 2, p: 1 }, x: 1 } } } }));
    expect((await planImport(b, file, { storage: null })).totals.same).toBe(1);
  });
});

describe("what is replaced", () => {
  const fileWith = (doc: Doc) => parseDataFile(JSON.stringify({ format: FORMAT, version: 1, collections: { answers: { a1: doc } } }));

  it("replaces a document only with a later copy", async () => {
    const db = newDb();
    await put(db, "answers", "a1", { v: "mine", at: OLD });
    const newer = await planImport(db, fileWith({ v: "theirs", at: NEW }), { storage: null });
    expect(newer.totals).toEqual({ add: 0, update: 1, same: 0, keep: 0 });
    await applyImport(db, newer, { storage: null });
    expect((await read(db, "answers")).a1).toEqual({ v: "theirs", at: NEW });

    const older = await planImport(db, fileWith({ v: "old", at: OLD }), { storage: null });
    expect(older.totals).toEqual({ add: 0, update: 0, same: 0, keep: 1 });
    expect(older.writes).toEqual([]);
  });

  it("keeps the local copy at an equal time, and when the file's copy has no timestamp", async () => {
    const db = newDb();
    await put(db, "answers", "a1", { v: "mine", at: OLD });
    expect((await planImport(db, fileWith({ v: "theirs", at: OLD }), { storage: null })).totals.keep).toBe(1);
    expect((await planImport(db, fileWith({ v: "theirs" }), { storage: null })).totals.keep).toBe(1);
  });

  it("takes a timestamped copy over a local one without a timestamp", async () => {
    const db = newDb();
    await put(db, "answers", "a1", { v: "mine" });
    expect((await planImport(db, fileWith({ v: "theirs", at: OLD }), { storage: null })).totals.update).toBe(1);
  });

  it("counts a later verification as a later change", () => {
    expect(stampOf({ at: OLD, verifiedAt: NEW })).toBe(Date.parse(NEW));
    expect(stampOf({ at: OLD, updatedAt: "not a date" })).toBe(Date.parse(OLD));
    expect(stampOf({ v: 1 })).toBeUndefined();
  });

  it("never deletes what the file does not have", async () => {
    const db = newDb();
    await put(db, "answers", "mine", { at: OLD });
    const plan = await planImport(db, fileWith({ at: NEW }), { storage: null });
    await applyImport(db, plan, { storage: null });
    expect(Object.keys(await read(db, "answers")).sort()).toEqual(["a1", "mine"]);
  });

  it("does not overwrite a setting that is already set", async () => {
    const db = newDb();
    const storage = fakeStorage({ "rd-notation": "logic" });
    const file = parseDataFile(JSON.stringify({ format: FORMAT, version: 1, collections: {}, preferences: { "rd-notation": "sets", "rd-blitz": "1", "other": "x", "rd-timer": 5 } }));
    const plan = await planImport(db, file, { storage });
    expect(plan.preferences).toEqual({ "rd-blitz": "1" });
    expect(await applyImport(db, plan, { storage })).toMatchObject({ preferencesRestored: 1 });
    expect(storage.getItem("rd-notation")).toBe("logic");
    expect(storage.getItem("other")).toBeNull();
  });
});

describe("a setting under an earlier name", () => {
  const fileWith = (preferences: Record<string, string>) => parseDataFile(JSON.stringify({ format: FORMAT, version: 1, collections: {}, preferences }));

  it("brings in the Quorum choice a file made as 'rd-lab' as 'rd-quorum'", async () => {
    const storage = fakeStorage();
    const plan = await planImport(newDb(), fileWith({ "rd-lab": "0", "rd-blitz": "1" }), { storage });
    expect(plan.preferences).toEqual({ "rd-quorum": "0", "rd-blitz": "1" });
    await applyImport(newDb(), plan, { storage });
    expect(storage.getItem("rd-quorum")).toBe("0");
    expect(storage.getItem("rd-lab")).toBeNull();
  });

  it("prefers the new name when a file has both, and still leaves a device's own choice alone", async () => {
    expect(fileWith({ "rd-lab": "0", "rd-quorum": "1" }).preferences).toEqual({ "rd-quorum": "1" });
    const plan = await planImport(newDb(), fileWith({ "rd-lab": "0" }), { storage: fakeStorage({ "rd-quorum": "1" }) });
    expect(plan.preferences).toEqual({});
  });
});

describe("a file that is not right", () => {
  const file = (collections: unknown) => parseDataFile(JSON.stringify({ format: FORMAT, version: 1, collections }));

  it("leaves out invalid documents and collections the app does not use, and says so", async () => {
    const plan = await planImport(newDb(), file({
      answers: { ok: { at: OLD }, "bad/id": { at: OLD }, "..": { at: OLD }, notAnObject: "text", list: [1], big: { s: "x".repeat(300 * 1024) } },
      secrets: { s1: { at: OLD } },
    }), { storage: null });
    expect(plan.totals.add).toBe(1);
    expect(plan.invalid).toBe(5);
    expect(plan.ignored).toEqual(["secrets"]);
    expect(plan.writes.map((w) => w.collection + "/" + w.id)).toEqual(["answers/ok"]);
  });

  it("refuses text that is not a data file", () => {
    expect(() => parseDataFile("{")).toThrow(TransferError);
    expect(() => parseDataFile("[]")).toThrow(/not a data file/);
    expect(() => parseDataFile(JSON.stringify({ format: "other", version: 1, collections: {} }))).toThrow(/not a data file/);
    expect(() => parseDataFile(JSON.stringify({ format: FORMAT, collections: {} }))).toThrow(/version/);
    expect(() => parseDataFile(JSON.stringify({ format: FORMAT, version: 1 }))).toThrow(/collections/);
  });

  it("refuses a file from a newer version", () => {
    expect(() => parseDataFile(JSON.stringify({ format: FORMAT, version: VERSION + 1, collections: {} }))).toThrow(/newer version/);
  });

  it("reports a document that cannot be written and goes on with the rest", async () => {
    const db = newDb();
    const real = db.collection.bind(db);
    db.collection = (path: string) => {
      const c = real(path);
      const doc = c.doc.bind(c);
      c.doc = (id?: string) => {
        const d = doc(id);
        if (id === "boom") d.set = async () => { throw Object.assign(new Error("full"), { code: "quota_exceeded" }); };
        return d;
      };
      return c;
    };
    const plan = await planImport(db, file({ answers: { boom: { at: OLD }, fine: { at: OLD } } }), { storage: null });
    const report = await applyImport(db, plan, { storage: null });
    expect(report).toMatchObject({ written: 1, failed: ["answers/boom (quota_exceeded)"] });
  });
});

describe("the list of settings", () => {
  it("covers every rd- key the page stores", () => {
    const dir = new URL("../../src/app/", import.meta.url);
    const files = (readdirSync(dir, { recursive: true }) as string[]).filter((f) => f.endsWith(".js"));
    const used = new Set<string>();
    for (const f of files) for (const m of readFileSync(new URL(f, dir), "utf8").matchAll(/["'](rd-[a-z-]+)["']/g)) used.add(m[1]);
    used.delete("rd-lab"); // the earlier name of rd-quorum: read once and removed (state.js), never stored again
    expect(files.length).toBeGreaterThan(20);
    expect([...used].sort()).toEqual([...PREFERENCE_KEYS].sort());
  });
});

describe("reserved ids", () => {
  it("leaves out a document called __proto__, which would change the prototype of an object keyed by id", async () => {
    const db = newDb();
    const text = '{"format":"riglam-practice-data","version":1,"collections":{"answers":{"__proto__":{"at":"2026-10-01T10:00:00.000Z"},"a1":{"at":"2026-10-01T10:00:00.000Z"}}}}';
    const plan = await planImport(db, parseDataFile(text));
    expect(plan.invalid).toBe(1);
    expect(plan.writes.map((w) => w.id)).toEqual(["a1"]);
  });
});

const fileWith = (answers: Record<string, Doc>): DataFile => ({ format: FORMAT, version: VERSION, exportedAt: "", collections: { answers }, preferences: {} });

describe("a preview that is out of date", () => {
  it("does not replace a document that was saved after the plan with an older copy from the file", async () => {
    const db = newDb();
    await put(db, "answers", "a1", { pairId: "a1", at: OLD });
    const file = fileWith({ a1: { pairId: "a1", at: NEW, from: "file" } });
    const plan = await planImport(db, file);
    expect(plan.totals.update).toBe(1);
    // a flag is saved while the preview is open
    await put(db, "answers", "a1", { pairId: "a1", at: OLD, verifiedAt: "2026-10-03T10:00:00.000Z", from: "local" });
    const report = await applyImport(db, plan, { storage: null });
    expect(report).toMatchObject({ written: 0, skipped: 1, failed: [] });
    expect((await read(db, "answers")).a1).toMatchObject({ from: "local" });
  });

  it("does not replace a document that appeared after the plan and is newer", async () => {
    const db = newDb();
    const file = fileWith({ a1: { pairId: "a1", at: OLD, from: "file" } });
    const plan = await planImport(db, file);
    expect(plan.totals.add).toBe(1);
    await put(db, "answers", "a1", { pairId: "a1", at: NEW, from: "local" });
    expect(await applyImport(db, plan, { storage: null })).toMatchObject({ written: 0, skipped: 1 });
    expect((await read(db, "answers")).a1).toMatchObject({ from: "local" });
  });

  it("still writes everything that did not change since the plan", async () => {
    const db = newDb();
    const file = fileWith({ a1: { pairId: "a1", at: OLD }, a2: { pairId: "a2", at: OLD } });
    const plan = await planImport(db, file);
    expect(await applyImport(db, plan, { storage: null })).toMatchObject({ written: 2, skipped: 0, failed: [] });
  });
});
