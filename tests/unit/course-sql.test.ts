// The SQL that loads a part into course_data (scripts/lib/course-sql.mjs). D1 refuses a statement of more than about 100 KB, so a long
// part goes in pieces; run on a real SQLite with the migration's table, the pieces must give back the same text and keep the version rules.
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { pieces, rowStatements, PIECE } from "../../scripts/lib/course-sql.mjs";

const D1_LIMIT = 100_000;
const table = readFileSync(new URL("../../worker/migrations/0003_course_data.sql", import.meta.url), "utf8");
const fresh = () => { const db = new DatabaseSync(":memory:"); db.exec(table); return db; };
const load = (db: DatabaseSync, kind: string, body: string, now: string) => { for (const s of rowStatements(kind, body, now)) db.exec(s); };
const row = (db: DatabaseSync, kind: string) => db.prepare("SELECT body, updated_at AS at FROM course_data WHERE kind = ?").get(kind) as { body: string; at: string } | undefined;
/** Text with apostrophes and characters of one to four bytes (Latin, Cyrillic, Chinese, Tibetan, an emoji), as the course data has. */
const LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
const text = (n: number) => Array.from({ length: n }, (_, i) => ["it's ", "слово ", "名字", "ཨོཾ", "🙂", "x"][i % 6]).join("");

test("pieces cut by bytes of the quoted text, never inside a character, and give the text back", () => {
  const body = text(60_000);
  const parts = pieces(body, 1_000);
  expect(parts.length).toBeGreaterThan(10);
  expect(parts.join("")).toBe(body);
  for (const p of parts) {
    expect(Buffer.byteLength(p.replaceAll("'", "''"))).toBeLessThanOrEqual(1_000);
    expect(p, "no piece starts or ends inside an emoji").not.toMatch(LONE_SURROGATE);
  }
  expect(pieces("", 10)).toEqual([""]);
  expect(pieces("short")).toEqual(["short"]);
});

test("a short part is one statement, as before", () => {
  const stmts = rowStatements("notes", '{"a":"it\'s"}', "2026-10-21T00:00:00.000Z");
  expect(stmts).toHaveLength(1);
  expect(stmts[0]).toMatch(/^INSERT INTO course_data \(kind, body, updated_at\) VALUES \('notes', '\{"a":"it''s"\}', /);
});

test("a part longer than D1 takes in one statement goes in pieces that each fit, and rebuilds exactly", () => {
  const body = JSON.stringify({ items: text(300_000) });
  expect(Buffer.byteLength(body)).toBeGreaterThan(3 * D1_LIMIT);
  const stmts = rowStatements("examples", body, "2026-10-21T00:00:00.000Z");
  expect(stmts.length).toBeGreaterThan(4);
  for (const s of stmts) expect(Buffer.byteLength(s)).toBeLessThan(D1_LIMIT);
  expect(Math.max(...stmts.map((s) => Buffer.byteLength(s)))).toBeLessThanOrEqual(PIECE + 400);
  const db = fresh();
  load(db, "examples", body, "2026-10-21T00:00:00.000Z");
  expect(row(db, "examples")).toEqual({ body, at: "2026-10-21T00:00:00.000Z" });
  expect(db.prepare("SELECT kind FROM course_data").all(), "no scratch row is left").toEqual([{ kind: "examples" }]);
});

test("a part that did not change keeps its version, one that did gets the new one, a shorter one replaces the longer", () => {
  const db = fresh();
  const long = JSON.stringify({ items: text(300_000) });
  load(db, "examples", long, "2026-10-21T00:00:00.000Z");
  load(db, "examples", long, "2026-10-22T00:00:00.000Z");
  expect(row(db, "examples")!.at, "same text, same version").toBe("2026-10-21T00:00:00.000Z");
  const other = JSON.stringify({ items: text(200_000) });
  load(db, "examples", other, "2026-10-23T00:00:00.000Z");
  expect(row(db, "examples")).toEqual({ body: other, at: "2026-10-23T00:00:00.000Z" });
  load(db, "examples", '{"items":[]}', "2026-10-24T00:00:00.000Z");
  expect(row(db, "examples")).toEqual({ body: '{"items":[]}', at: "2026-10-24T00:00:00.000Z" });
  load(db, "notes", '{"a":1}', "2026-10-21T00:00:00.000Z");
  load(db, "notes", '{"a":1}', "2026-10-25T00:00:00.000Z");
  expect(row(db, "notes")!.at).toBe("2026-10-21T00:00:00.000Z");
});

test("a run that stops midway leaves the part as it was, and the next run overwrites the scratch row", () => {
  const db = fresh();
  const before = JSON.stringify({ items: text(200_000) });
  load(db, "examples", before, "2026-10-21T00:00:00.000Z");
  const after = JSON.stringify({ items: text(310_000) });
  const stmts = rowStatements("examples", after, "2026-10-22T00:00:00.000Z");
  for (const s of stmts.slice(0, 3)) db.exec(s);
  expect(row(db, "examples")).toEqual({ body: before, at: "2026-10-21T00:00:00.000Z" });
  load(db, "examples", after, "2026-10-22T00:00:00.000Z");
  expect(row(db, "examples")).toEqual({ body: after, at: "2026-10-22T00:00:00.000Z" });
  expect(db.prepare("SELECT kind FROM course_data").all()).toEqual([{ kind: "examples" }]);
});
