// The tutor's examples_of tool (src/ai-shared/tools.ts) and the level cap of examplesFor (src/ai-shared/examples.ts): the examples of a
// term from the reference examples, up to a level, with the subclass each one is an instance of. Invented data and examples only.
import { expect, test } from "vitest";
import { examplesFor, makeExampleIndex, makeIndex, readExamples, tutorTools } from "../../src/ai-shared";
import type { DrillData } from "../../src/ai-shared";

const data = (): DrillData => ({
  terms: {
    Existent: { name: "Existent", ch: "I" },
    Form: { name: "Form", ch: "I", parent: "Existent", aliases: ["Matter"], ru: "Форма" },
    "External form": { name: "External form", ch: "I", parent: "Form" },
    Color: { name: "Color", ch: "I", parent: "External form" },
    Consciousness: { name: "Consciousness", ch: "I", parent: "Existent" },
  },
  chains: {},
  cats: [],
  items: [],
  bodySkip: [],
});
const ex = (n: string, cls: string[], lv: number, extra: object = {}) => ({ n, cls, lv, cf: "confirmed", k: "thing", ...extra });
const ITEMS = [
  ex("a clay form", ["Form"], 1, { gloss: "Why a clay form is a form." }),
  ex("a hard form", ["Form"], 3),
  ex("a blue wall", ["Color"], 1),
  ex("a green wall", ["Color"], 4, { cf: "commentator" }),
  ex("a shape of fog", ["External form"], 2, { cf: "textbook" }),
  ex("a rule about form", ["Form"], 1, { k: "statement" }),
  ex("a mind", ["Consciousness"], 1),
];
const tool = (name: string, examples = ITEMS) => {
  const ix = makeIndex(data());
  const eix = makeExampleIndex(readExamples({ items: examples })!);
  return tutorTools(ix, eix).find((t) => t.name === name)!;
};
type Result = { found: boolean; term?: string; level_cap?: number; examples?: { item: string; level: number; kind?: string; confirmation?: string; of: string; why?: string }[]; harder?: boolean };
const run = (input: unknown, items = ITEMS) => tool("examples_of", items).execute(input) as Result;

test("examplesFor takes only examples of the levels it is given", () => {
  const ix = makeIndex(data());
  const names = (max: number, lv?: number[]) => examplesFor(ix, ITEMS, "Form", max, lv).map((i) => i.n);
  expect(names(9)).toEqual(["a clay form", "a hard form", "a blue wall", "a shape of fog", "a green wall"]);
  expect(names(9, [1, 2])).toEqual(["a clay form", "a blue wall", "a shape of fog"]);
  expect(names(9, [1])).toEqual(["a clay form", "a blue wall"]);
  expect(names(9, [2])).toEqual(["a shape of fog"]);
  expect(names(9, [1, 3])).toEqual(["a clay form", "a hard form", "a blue wall"]); // no level 2 and no level 4
  expect(names(9, [])).toEqual([]);
});

test("examples_of is a tool only where the reference examples are, and lists a term's own examples first with the class of each", () => {
  const ix = makeIndex(data());
  expect(tutorTools(ix).map((t) => t.name)).toEqual(["lookup_term", "classify_example"]);
  expect(tutorTools(ix, null).map((t) => t.name)).toEqual(["lookup_term", "classify_example"]);
  expect(tool("examples_of")).toBeTruthy();

  expect(run({ term: "Form" })).toEqual({
    found: true, term: "Form", level_cap: 2, harder: true,
    examples: [
      { item: "a clay form", level: 1, kind: "thing", confirmation: "confirmed", of: "Form", why: "Why a clay form is a form." },
      { item: "a blue wall", level: 1, kind: "thing", confirmation: "confirmed", of: "Color" },
      { item: "a shape of fog", level: 2, kind: "thing", confirmation: "textbook", of: "External form" },
    ],
  });
});

test("examples_of takes a level and a count, clamps them, and says whether harder ones exist", () => {
  expect(run({ term: "Form", level: 4, count: 9 }).examples!.map((e) => e.item)).toEqual(["a clay form", "a hard form", "a blue wall", "a shape of fog", "a green wall"]);
  expect(run({ term: "Form", level: 4, count: 9 }).harder).toBe(false);
  expect(run({ term: "Form", level: 1 })).toMatchObject({ level_cap: 1, harder: true, examples: [{ item: "a clay form" }, { item: "a blue wall" }] });
  expect(run({ term: "Form", count: 1 }).examples!.map((e) => e.item)).toEqual(["a clay form"]);
  for (const level of [0, -3, "high", null, NaN]) expect(run({ term: "Form", level }).level_cap, String(level)).toBe(level === 0 || (typeof level === "number" && level < 0) ? 1 : 2);
  expect(run({ term: "Form", level: 99 }).level_cap).toBe(4);
  expect(run({ term: "Form", count: 0 }).examples).toHaveLength(1);
  expect(run({ term: "Form", count: 1e9 }).examples!.length).toBeLessThanOrEqual(5);
  expect(run({ term: "Form", level: 2.6 }).level_cap).toBe(3);
});

test("examples_of finds a term by its name, an alias or its Russian name, and reports an unknown term or one with no examples", () => {
  for (const term of ["form", "Matter", "Форма"]) expect(run({ term }), term).toMatchObject({ found: true, term: "Form" });
  expect(run({ term: "Unheard-of class" })).toEqual({ found: false });
  expect(run({ term: "constructor" })).toEqual({ found: false });
  expect(() => run({})).toThrow("empty term");
  expect(() => run(null)).toThrow("empty term");
  expect(run({ term: "Existent", level: 1, count: 5 }).examples!.length).toBeGreaterThan(0);
  // a term whose examples are all above the cap
  expect(run({ term: "Consciousness", level: 1 }, [ex("a deep mind", ["Consciousness"], 3)])).toEqual({ found: true, term: "Consciousness", level_cap: 1, examples: [], harder: true });
  expect(run({ term: "Consciousness" }, [])).toMatchObject({ found: true, examples: [], harder: false });
});

test("lookup_term names the close terms when it finds none", () => {
  const ix = makeIndex(data());
  const lookup = tutorTools(ix).find((t) => t.name === "lookup_term")!;
  expect(lookup.execute({ name: "Unheard-of form" })).toEqual({ found: false, close: ["Form", "External form"] });
  expect(lookup.execute({ name: "zzzz" })).toEqual({ found: false, close: [] });
});
