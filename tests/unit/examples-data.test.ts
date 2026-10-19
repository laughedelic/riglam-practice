// The reference examples format (src/data/examples.js): the device part made from the full one, the checks against the open data,
// and the made-up examples CI uses (scripts/lib/made-up-course.mjs). Invented examples only: the real ones are course tier.
import { expect, test } from "vitest";
import { DEVICE_FORMAT, FORMAT, VERSION, deviceExamples, examplesProblems } from "../../src/data/examples.js";
import { MADE_UP_SOURCES, madeUpExamples } from "../../scripts/lib/made-up-course.mjs";
import { readOpen } from "../../scripts/lib/course-files.mjs";

const OPEN = { terms: { Form: {}, Color: {} } };
const full = (items: object[]) => ({ format: FORMAT, version: VERSION, sources: { MA: { tier: "open" }, MX: { tier: "course" } }, items });
const ITEM = {
  n: "a vemo lake", al: ["vemo", "вемо", "\u6e56", "\u0f40"], cls: ["Color"], not: ["Form"], lv: 2, sc: 1, k: "thing", cf: "confirmed", gloss: "Invented.",
  base: "a vemo", mem: ["a", "b"], web: ["https://example.org/vemo"], src: [["MX", "12"], ["MA", "3-4"], ["MA", "9"]],
};

test("the device part leaves out the places, links, base, members, aliases in other scripts and the course booklets' ids", () => {
  const device = deviceExamples(full([ITEM, { n: "a kipa", al: ["\u6e56"], cls: ["Form"], lv: 1, src: [["MX", "1"]] }]), "2026-10-13");
  expect(device).toEqual({
    format: DEVICE_FORMAT, version: VERSION, built: "2026-10-13", sources: { MA: { tier: "open" }, MX: { tier: "course" } },
    items: [
      { n: "a vemo lake", al: ["vemo", "вемо"], cls: ["Color"], not: ["Form"], lv: 2, sc: 1, k: "thing", cf: "confirmed", gloss: "Invented.", s: ["MA"] },
      { n: "a kipa", cls: ["Form"], lv: 1, s: [] },
    ],
  });
  expect(ITEM.al, "the full part is not changed").toHaveLength(4);
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
});
