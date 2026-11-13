// The format of the term data tiers (src/data/course.js), with made-up data.
import { expect, test } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { split, merge, lock, LOCKED_TEXT } from "../../src/data/course.js";
import { dataStamp } from "../../src/domain/stamp";

const stamp = (d: unknown) => dataStamp(d as never);      // the made-up data has only the parts these tests need

const sample = () => ({
  built: "2026-01-01",
  terms: {
    Form: { name: "Form", wylie: "gzugs", d: "an invented definition for the first sample term", d_ru: "придуманное определение первого образца", ru: "образец", note: "A note.", parent: "Thing" },
    Thing: { name: "Thing", wylie: "dngos po", d: "(Sample) an invented definition for the second sample term", ru: "вещь" },
    Bare: { name: "Bare", wylie: "x" },
  },
  chains: { Form: ["Form", "Thing"] },
  notes: { extf: ["a group note"] },
});

test("split takes definitions and notes out of the open data, and merge puts them back", () => {
  const full = sample();
  const { open: openPart, definitions, notes } = split(full);
  expect(Object.keys(openPart.terms.Form).sort()).toEqual(["name", "parent", "wylie"].concat("ru").sort());
  expect("notes" in openPart).toBe(false);
  expect(definitions).toEqual({ Form: { d: full.terms.Form.d, d_ru: full.terms.Form.d_ru }, Thing: { d: full.terms.Thing.d } });
  expect(notes).toEqual({ terms: { Form: "A note." }, groups: { extf: ["a group note"] } });
  expect(merge(openPart, definitions, notes)).toEqual(sample());
  expect(JSON.stringify(full), "split leaves its input alone").toBe(JSON.stringify(sample()));
});

test("without the notes the merged data has none; without definitions it has none", () => {
  const { open: openPart, definitions } = split(sample());
  const m = merge(openPart, definitions);
  expect("notes" in m || "note" in m.terms.Form).toBe(false);
  expect(m.terms.Thing.d).toBe(sample().terms.Thing.d);
  expect("d" in merge(openPart, null).terms.Form).toBe(false);
});

test("lock replaces every definition with the notice and drops nothing else", () => {
  const { open: openPart } = split(sample());
  const locked = lock(openPart);
  for (const t of Object.values<{ d: string }>(locked.terms)) expect(t.d).toBe(LOCKED_TEXT);
  expect(locked.terms.Form.wylie).toBe("gzugs");
  expect("d" in openPart.terms.Form, "lock leaves its input alone").toBe(false);
});

test("the stamp of the data is the same with or without the definitions and notes, and changes with what grades an answer", () => {
  const { open: openPart, definitions, notes } = split(sample());
  const s = stamp(openPart);
  expect(stamp(merge(openPart, definitions, notes))).toBe(s);
  expect(stamp(merge(openPart, definitions))).toBe(s);
  expect(stamp(lock(openPart))).toBe(s);
  expect(stamp(sample()), "the full export too").toBe(s);
  const moved = structuredClone(openPart);
  moved.terms.Form.parent = "Bare";
  expect(stamp(moved), "a term placed elsewhere").not.toBe(s);
  expect(stamp({ ...openPart, open: [["a", "b"]] }), "a pair left open").not.toBe(s);
  expect(stamp({ ...openPart, built: "2026-01-02" })).not.toBe(s);
});

// the real data: whatever the course tier holds is left out of the stamp (a field added to it later would change the stamp at every key taken in)
test.skipIf(!existsSync("data-private/definitions.json"))("the stamp of the real data is the same with its definitions and notes", () => {
  const read = (p: string) => JSON.parse(readFileSync(p, "utf8"));
  const openPart = read("src/data/drill-data.json"), definitions = read("data-private/definitions.json"), notes = existsSync("data-private/notes.json") ? read("data-private/notes.json") : undefined;
  expect(stamp(merge(openPart, definitions, notes))).toBe(stamp(openPart));
  expect(stamp(lock(openPart))).toBe(stamp(openPart));
});
