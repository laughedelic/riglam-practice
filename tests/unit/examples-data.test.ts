// The reference examples: the format (src/data/examples.js), with the device part made from the full one and the checks against the
// open data; the made-up examples CI uses (scripts/lib/made-up-course.mjs); and how the tutor's code reads and matches them
// (src/ai-shared/examples.ts, the classify_example tool). Invented examples only: the real ones are course tier.
import { expect, test } from "vitest";
import { DEVICE_FORMAT, FORMAT, VERSION, deviceExamples, examplesProblems } from "../../src/data/examples.js";
import { MADE_UP_SOURCES, madeUpExamples } from "../../scripts/lib/made-up-course.mjs";
import { readOpen } from "../../scripts/lib/course-files.mjs";
import { exampleFacts, makeExampleIndex, makeIndex, matchExamples, readExamples, tutorTools } from "../../src/ai-shared";
import type { DrillData } from "../../src/ai-shared";

const OPEN = { terms: { Form: {}, Color: {} } };
const full = (items: object[]) => ({ format: FORMAT, version: VERSION, sources: { MA: { tier: "open" }, MX: { tier: "course" } }, items });
const ITEM = {
  n: "a vemo lake", al: ["vemo", "вемо", "\u6e56", "\u0f40"], cls: ["Color"], not: ["Form"], lv: 2, sc: 1, k: "thing", cf: "confirmed", gloss: "Invented.",
  base: "a vemo", mem: ["a", "b"], web: ["https://example.org/vemo"], src: [["MX", "12"], ["MA", "3-4"], ["MA", "9"]],
};

test("the device part leaves out the places, links, base, members, aliases in other scripts and the course booklets' ids", () => {
  const device = deviceExamples(full([ITEM, { n: "a kipa", al: ["\u6e56"], cls: ["Form"], lv: 1, src: [["MX", "1"]] }]), "2026-10-13");
  expect(device).toEqual({
    format: DEVICE_FORMAT, version: VERSION, built: "2026-10-13", sources: { MA: { tier: "open" } },
    items: [
      { n: "a vemo lake", al: ["vemo", "вемо"], cls: ["Color"], not: ["Form"], lv: 2, sc: 1, k: "thing", cf: "confirmed", gloss: "Invented.", s: ["MA"] },
      { n: "a kipa", cls: ["Form"], lv: 1, s: [] },
    ],
  });
  expect(ITEM.al, "the full part is not changed").toHaveLength(4);
  expect(JSON.stringify(device), "the course booklet's id is nowhere in what a device gets").not.toContain("MX");
});

test("examplesProblems accepts usable examples and names what is wrong otherwise", () => {
  expect(examplesProblems(full([ITEM]), OPEN)).toEqual([]);
  expect(examplesProblems([], OPEN)).toEqual(["the examples file is not a JSON object"]);
  expect(examplesProblems({ ...full([ITEM]), version: 1 }, OPEN)[0]).toMatch(/not riglam-examples version 2/);
  expect(examplesProblems(full([]), OPEN)).toEqual(["the examples file has no items"]);
  const problems = examplesProblems(full([
    { ...ITEM, lv: 5 },
    { ...ITEM, n: "a kipa", cls: ["Colour"], not: "Form" },
    { ...ITEM, n: "The vemo lake" },
    { ...ITEM, n: "a dobe", src: [] },
    { ...ITEM, n: "a sule", src: [["ZZ", "1"]] },
    { lv: 1 },
  ]), OPEN);
  expect(problems).toEqual([
    `"a vemo lake" has the level 5, not 1 to 4`,
    `"a kipa" has a not that is not a list of names`,
    `"a kipa" names "Colour" in cls, which is not a term of the open data`,
    `"The vemo lake" has the same name as "a vemo lake"`,
    `"a dobe" has no source`,
    `"a sule" names a source that is not in the table: ["ZZ","1"]`,
    "item 5 has no name",
  ]);
});

test("an item the reader would drop is refused at the import: the two check the same fields", () => {
  const wrong: Record<string, unknown>[] = [
    { ne: "false" }, { inc: 1 }, { sc: "2" }, { gloss: ["x"] }, { k: 3 }, { f: {} }, { cf: false }, { cn: null }, { bg: 1 },
    { al: "vemo" }, { al: [1] }, { cls: "Color" }, { cls: [null] }, { not: "Form" }, { not: [["Form"]] },
  ];
  for (const bad of wrong) {
    const item = { ...ITEM, n: "a vemo", al: ["vemo"], base: undefined, ...bad };
    expect(examplesProblems(full([item]), OPEN), JSON.stringify(bad)).not.toEqual([]);
    expect(readExamples({ items: [{ ...deviceExamples(full([ITEM]), "x").items[0], ...bad }] })!.items, JSON.stringify(bad)).toEqual([]);
  }
  const good = { ...ITEM, ne: false, inc: true, sc: 2, k: "thing", f: "combination", cn: "medium", bg: "glossed" };
  expect(examplesProblems(full([good]), OPEN)).toEqual([]);
  expect(readExamples(deviceExamples(full([good]), "x"))!.items).toHaveLength(1);
});

test("the made-up examples fit the open data, are the same every time, and exercise every field the device part drops", () => {
  const open = readOpen();
  const made = madeUpExamples(open);
  expect(examplesProblems(made, open)).toEqual([]);
  expect(madeUpExamples(open)).toEqual(made);
  expect(made.sources).toEqual(MADE_UP_SOURCES);
  const fields = new Set(made.items.flatMap((i: object) => Object.keys(i)));
  for (const f of ["al", "cls", "not", "ne", "lv", "sc", "k", "f", "cf", "cn", "bg", "gloss", "base", "mem", "web", "src"]) expect(fields.has(f), f).toBe(true);
  const items = made.items as unknown as { al?: string[]; src: string[][] }[];
  expect(items.some((i) => i.al?.some((a) => /[\u4e00-\u9fff]/.test(a)))).toBe(true);
  expect(items.some((i) => i.src.some(([id]) => id === "MX"))).toBe(true);
  const device = JSON.stringify(deviceExamples(made, open.built).items);
  expect(device).not.toMatch(/"MX"|[\u4e00-\u9fff]|"src"|"web"|"mem"|"base"/);
  expect(readExamples(deviceExamples(made, open.built))!.items, "the reader keeps every item of a checked file").toHaveLength(made.items.length);
});

// ---- the reference examples ----
//   invented examples over a small chain: Color < External form < Form < Existent

const exData = (): DrillData => ({
  terms: {
    Existent: { name: "Existent", ch: "I" },
    Form: { name: "Form", ch: "I", parent: "Existent" },
    "External form": { name: "External form", ch: "I", parent: "Form" },
    Color: { name: "Color", ch: "I", parent: "External form" },
  },
  chains: { Form: ["Form", "Existent"] },
  cats: [{ id: "form", kind: "dudra", term: "Form", labels: ["forms"], type: "form" }],
  items: [{ n: "a blue ball", t: "Form", c: ["form"] }],
  bodySkip: [],
});
const REF = readExamples({
  format: "riglam-examples-device", version: 2, sources: {},
  items: [
    { n: "a vemo lake", al: ["vemo", "вемо"], cls: ["Color", "Unheard-of class"], not: ["Existent"], lv: 1, k: "thing", cf: "confirmed", gloss: "Invented for the test.", s: ["MA"] },
    { n: "the kipa glow", al: ["kipa"], cls: ["Form"], lv: 3, cf: "commentator" },
    { n: "a kipa stone", al: ["kipa"], cls: ["Form"], lv: 2, cf: "textbook" },
    { n: "a blue ball", cls: ["Color"], lv: 1, cf: "textbook" },
    { lv: 1 }, { n: "no level" }, null,
  ],
})!;

test("readExamples keeps the items with a name and a level, and reads nothing from what is not the format", () => {
  expect(REF.items.map((i) => i.n)).toEqual(["a vemo lake", "the kipa glow", "a kipa stone", "a blue ball"]);
  expect(readExamples(null)).toBeNull();
  expect(readExamples({ items: "no" })).toBeNull();
  expect(readExamples([1, 2])).toBeNull();
});

test("readExamples drops an item whose optional field is not of its type, and the valid ones still work", () => {
  const ok = { n: "a vemo", cls: ["Color"], lv: 1 };
  const read = readExamples({
    items: [
      ok,
      { ...ok, n: "cls is text", cls: "Form" }, { ...ok, n: "al is an object", al: {} }, { ...ok, n: "not has a number", not: [1] }, { ...ok, n: "s is text", s: "MA" },
      { ...ok, n: "ne is text", ne: "false" }, { ...ok, n: "gloss is a list", gloss: ["x"] }, { ...ok, n: "sc is text", sc: "2" },
      { ...ok, n: "a kipa", al: ["kipa"], not: ["Form"], ne: false, inc: true, s: ["MA"], k: "thing", cf: "confirmed" },
    ],
  })!;
  expect(read.items.map((i) => i.n)).toEqual(["a vemo", "a kipa"]);
  const ix = makeIndex(exData());
  const eix = makeExampleIndex(read);
  for (const words of ["a vemo", "kipa"]) for (const it of matchExamples(eix, words)) expect(() => exampleFacts(ix, it), words).not.toThrow();
});

test("matchExamples finds an example by its name, without the article, by an alias, in the plural, and every example a name names", () => {
  const eix = makeExampleIndex(REF);
  for (const words of ["a vemo lake", "Vemo lake", "the vemo lakes", "VEMO", "вемо"]) expect(matchExamples(eix, words).map((i) => i.n), words).toEqual(["a vemo lake"]);
  expect(matchExamples(eix, "kipa").map((i) => i.n)).toEqual(["the kipa glow", "a kipa stone"]);
  // an article does not hide a shared name: "a dobe" and "dobe" name the same two examples
  const eix2 = makeExampleIndex(readExamples({ items: [{ n: "the sule", al: ["a dobe"], lv: 1 }, { n: "the kari", al: ["dobe"], lv: 2 }] })!);
  for (const words of ["a dobe", "dobe", "the dobe"]) expect(matchExamples(eix2, words).map((i) => i.n), words).toEqual(["the sule", "the kari"]);
  for (const words of ["", "constructor", "toString", "lake", null]) expect(matchExamples(eix, words), String(words)).toEqual([]);
});

test("classify_example looks in the practice list first, then in the reference examples, and shows a shared name as two", () => {
  const ix = makeIndex(exData());
  const classify = (examples: ReturnType<typeof makeExampleIndex> | null) => tutorTools(ix, examples).find((t) => t.name === "classify_example")!;
  const eix = makeExampleIndex(REF);
  expect(classify(null).description).not.toMatch(/reference/);
  expect(classify(eix).description).toMatch(/reference examples/);
  expect(classify(null).execute({ thing: "a vemo lake" })).toEqual({ found: false });
  expect(classify(eix).execute({ thing: "a blue ball" })).toMatchObject({ found: true, item: "a blue ball", dudra_type: "Form", categories: ["forms"] });
  expect(classify(eix).execute({ thing: "vemo" })).toEqual({
    found: true, source: "reference", item: "a vemo lake", existent: true,
    classes: ["Color > External form > Form > Existent"], not: ["Existent"], level: 1, kind: "thing", confirmation: "confirmed", why: "Invented for the test.",
  });
  const two = classify(eix).execute({ thing: "kipa" }) as { ambiguous: boolean; candidates: { item: string; level: number }[] };
  expect(two.ambiguous).toBe(true);
  expect(two.candidates.map((c) => [c.item, c.level])).toEqual([["the kipa glow", 3], ["a kipa stone", 2]]);
  expect(classify(eix).execute({ thing: "something else" })).toEqual({ found: false });
});
