// The format of the term data tiers (src/data/course.js), with made-up data.
import { expect, test } from "vitest";
import { split, merge, lock, LOCKED_TEXT } from "../../src/data/course.js";

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
