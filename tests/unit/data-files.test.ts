// The term data files: the open file is committed and holds no definitions or notes; the course part lives in the git-ignored
// folder data-private/ (and on the server). With that folder at hand the two make the full data. Nothing in the repository
// may hold a definition in the clear, which this checks over every tracked file.
import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { hasCourse, hasExamples, readExamples, readFull, readOpen, root } from "../../scripts/lib/course-files.mjs";
import { split } from "../../src/data/course.js";
import { parseMagicKey } from "../../src/ai/magic-key";

const withCourse = test.skipIf(!hasCourse()); // no data-private/ (npm run data:import, or data:fixture for made-up text)

const trackedFiles = () => execFileSync("git", ["ls-files", "-z"], { cwd: root }).toString().split("\0").filter(Boolean);

test("the open file has no definitions, no notes and no group notes", () => {
  const open = readOpen();
  expect(Object.keys(open.terms).length).toBeGreaterThan(100);
  for (const [name, t] of Object.entries<object>(open.terms)) for (const f of ["d", "d_ru", "note"]) expect(f in t, `${name}.${f} is in the open file`).toBe(false);
  expect("notes" in open).toBe(false);
});

test("the course part is not tracked, and no encrypted copy is", () => {
  for (const f of ["definitions.json", "notes.json", "examples.json", "examples-device.json"]) expect(execFileSync("git", ["check-ignore", "-v", `data-private/${f}`], { cwd: root }).toString()).toMatch(/\.gitignore/);
  expect(trackedFiles().filter((f) => f.startsWith("data-private/") || f.endsWith(".enc"))).toEqual([]);
});

withCourse("the files together make the full data, and splitting that gives the open file back", () => {
  const full = readFull();
  const terms = Object.values<{ d?: unknown }>(full.terms);
  expect(terms.length).toBe(Object.keys(readOpen().terms).length);
  expect(terms.every((t) => typeof t.d === "string" && t.d.length > 0), "every term has a definition").toBe(true);
  expect(Object.keys(full.notes).length).toBeGreaterThan(0);
  expect(split(full).open).toEqual(readOpen());
});

withCourse("no tracked file holds a definition or a note in the clear", () => {
  const full = readFull();
  const secrets: string[] = Object.values<{ d?: string; d_ru?: string; note?: string }>(full.terms)
    .flatMap((t) => [t.d, t.d_ru, t.note])
    .filter((s): s is string => typeof s === "string" && s.length > 30 && !s.startsWith("(no "));
  expect(secrets.length).toBeGreaterThan(150);
  const textFiles = trackedFiles().filter((f) => !/\.(png|woff2|ico|jpg|svg)$/.test(f));
  for (const f of textFiles) {
    let content: string;
    try { content = readFileSync(`${root}/${f}`, "utf8"); } catch { continue; } // deleted in the working tree
    for (const s of secrets) expect(content.includes(s), `${f} holds: ${s.slice(0, 40)}`).toBe(false);
  }
});

// The reference examples are course tier too. A tracked file may name a few of them (an everyday "a clay pot" is in the open data as
// well), but not many, and no gloss.
test.skipIf(!hasExamples())("no tracked file holds the reference examples: more than a few of their names, or a gloss", () => {
  const items: { n: string; gloss?: string }[] = readExamples()!.full.items;
  const glosses = items.map((i) => i.gloss).filter((g): g is string => typeof g === "string" && g.length > 30);
  const names = items.map((i) => i.n).filter((n) => n.length > 12);
  expect(names.length).toBeGreaterThan(20);
  for (const f of trackedFiles().filter((f) => !/\.(png|woff2|ico|jpg|svg)$/.test(f))) {
    let content: string;
    try { content = readFileSync(`${root}/${f}`, "utf8"); } catch { continue; }
    for (const g of glosses) expect(content.includes(g), `${f} holds a gloss: ${g.slice(0, 40)}`).toBe(false);
    const named = names.filter((n) => content.includes(n));
    expect(named.length, `${f} names ${named.length} examples: ${named.slice(0, 3).join(", ")}`).toBeLessThanOrEqual(5);
  }
});

// The Magic Key, when this run has it (the environment of the owner's sessions): no tracked file may hold it.
const key = parseMagicKey(process.env.RIGLAM_DATA_KEY);
test.skipIf(!key)("no tracked file holds the Magic Key", () => {
  for (const f of trackedFiles().filter((f) => !/\.(png|woff2|ico|jpg)$/.test(f))) {
    let content: string;
    try { content = readFileSync(`${root}/${f}`, "utf8"); } catch { continue; }
    expect(content.includes(key as string), `${f} holds the Magic Key`).toBe(false);
  }
});
