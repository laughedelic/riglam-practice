// The committed term data files: the open file holds no definitions or notes, the course files are encrypted, and
// (when the data key is at hand) the three together make the full data. Nothing in the repository may hold a
// definition in the clear, which this checks over every tracked file.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { files, readKey, readFull, readOpen, root } from "../../scripts/lib/course-files.mjs";
import { split } from "../../src/data/course.js";

const key = readKey();
const needKey = key ? false : "no data key (RIGLAM_DATA_KEY or .data-key)";

test("the open file has no definitions, no notes and no group notes", () => {
  const open = readOpen();
  assert.ok(Object.keys(open.terms).length > 100);
  for (const [name, t] of Object.entries(open.terms)) for (const f of ["d", "d_ru", "note"]) assert.ok(!(f in t), `${name}.${f} is in the open file`);
  assert.ok(!("notes" in open));
});

test("the course files are encrypted: a magic header, and no JSON or readable word in them", () => {
  for (const f of [files.definitions, files.notes]) {
    const bytes = readFileSync(f);
    assert.equal(bytes.subarray(0, 4).toString(), "RGL1");
    assert.ok(!bytes.toString("latin1").includes('"d"'), f);
    assert.ok(!bytes.toString("latin1").includes("that which is"), f);
  }
});

test("the files together make the full data, and splitting that gives the same files back", { skip: needKey }, async () => {
  const full = await readFull(key);
  const terms = Object.values(full.terms);
  assert.equal(terms.length, Object.keys(readOpen().terms).length);
  assert.ok(terms.every((t) => typeof t.d === "string" && t.d.length > 0), "every term has a definition");
  assert.ok(Object.keys(full.notes).length > 0);
  assert.deepEqual(split(full).open, readOpen());
});

test("no tracked file holds a definition or a note in the clear", { skip: needKey }, async () => {
  const full = await readFull(key);
  const secrets = Object.values(full.terms).flatMap((t) => [t.d, t.d_ru, t.note]).filter((s) => typeof s === "string" && s.length > 30 && !s.startsWith("(no "));
  assert.ok(secrets.length > 150);
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root }).toString().split("\0").filter(Boolean);
  const textFiles = tracked.filter((f) => !/\.(png|woff2|ico|enc|jpg|svg)$/.test(f));
  for (const f of textFiles) {
    let content;
    try { content = readFileSync(`${root}/${f}`, "utf8"); } catch { continue; } // deleted in the working tree
    for (const s of secrets) assert.ok(!content.includes(s), `${f} holds: ${s.slice(0, 40)}`);
  }
});

test("no tracked file holds the key", { skip: needKey }, () => {
  const tracked = execFileSync("git", ["ls-files", "-z"], { cwd: root }).toString().split("\0").filter(Boolean);
  for (const f of tracked.filter((f) => !/\.(png|woff2|ico|enc|jpg)$/.test(f))) {
    let content;
    try { content = readFileSync(`${root}/${f}`, "utf8"); } catch { continue; }
    assert.ok(!content.includes(key), `${f} holds the data key`);
  }
});

test("the key file is ignored by git", () => {
  assert.match(execFileSync("git", ["check-ignore", "-v", ".data-key"], { cwd: root }).toString(), /\.gitignore/);
});
