// The committed term data files: the open file holds no definitions or notes, the course files are encrypted, and
// (when the data key is at hand) the three together make the full data. Nothing in the repository may hold a
// definition in the clear, which this checks over every tracked file.
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { files, readKey, readFull, readOpen, root } from "../../scripts/lib/course-files.mjs";
import { split } from "../../src/data/course.js";

const key = readKey();
const withKey = test.skipIf(!key); // no data key (RIGLAM_DATA_KEY or .data-key)

const trackedFiles = () => execFileSync("git", ["ls-files", "-z"], { cwd: root }).toString().split("\0").filter(Boolean);

test("the open file has no definitions, no notes and no group notes", () => {
  const open = readOpen();
  expect(Object.keys(open.terms).length).toBeGreaterThan(100);
  for (const [name, t] of Object.entries<object>(open.terms)) for (const f of ["d", "d_ru", "note"]) expect(f in t, `${name}.${f} is in the open file`).toBe(false);
  expect("notes" in open).toBe(false);
});

test("the course files are encrypted: a magic header, and no JSON or readable word in them", () => {
  for (const f of [files.definitions, files.notes]) {
    const bytes = readFileSync(f);
    expect(bytes.subarray(0, 4).toString()).toBe("RGL1");
    expect(bytes.toString("latin1").includes('"d"'), f).toBe(false);
    expect(bytes.toString("latin1").includes("that which is"), f).toBe(false);
  }
});

withKey("the files together make the full data, and splitting that gives the same files back", async () => {
  const full = await readFull(key);
  const terms = Object.values<{ d?: unknown }>(full.terms);
  expect(terms.length).toBe(Object.keys(readOpen().terms).length);
  expect(terms.every((t) => typeof t.d === "string" && t.d.length > 0), "every term has a definition").toBe(true);
  expect(Object.keys(full.notes).length).toBeGreaterThan(0);
  expect(split(full).open).toEqual(readOpen());
});

withKey("no tracked file holds a definition or a note in the clear", async () => {
  const full = await readFull(key);
  const secrets: string[] = Object.values<{ d?: string; d_ru?: string; note?: string }>(full.terms)
    .flatMap((t) => [t.d, t.d_ru, t.note])
    .filter((s): s is string => typeof s === "string" && s.length > 30 && !s.startsWith("(no "));
  expect(secrets.length).toBeGreaterThan(150);
  const textFiles = trackedFiles().filter((f) => !/\.(png|woff2|ico|enc|jpg|svg)$/.test(f));
  for (const f of textFiles) {
    let content: string;
    try { content = readFileSync(`${root}/${f}`, "utf8"); } catch { continue; } // deleted in the working tree
    for (const s of secrets) expect(content.includes(s), `${f} holds: ${s.slice(0, 40)}`).toBe(false);
  }
});

withKey("no tracked file holds the key", () => {
  for (const f of trackedFiles().filter((f) => !/\.(png|woff2|ico|enc|jpg)$/.test(f))) {
    let content: string;
    try { content = readFileSync(`${root}/${f}`, "utf8"); } catch { continue; }
    expect(content.includes(key as string), `${f} holds the data key`).toBe(false);
  }
});

test("the key file is ignored by git", () => {
  expect(execFileSync("git", ["check-ignore", "-v", ".data-key"], { cwd: root }).toString()).toMatch(/\.gitignore/);
});
