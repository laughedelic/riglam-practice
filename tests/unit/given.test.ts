// src/domain/given.ts: a question that is given, not drawn. Made-up data with known classes and stages for the rules of each exercise, and the
// open data for what must hold for every question the draws themselves can make.
import { expect, test } from "vitest";
import { makeIndex } from "../../src/ai-shared";
import type { DrillData, Example } from "../../src/ai-shared";
import { givenInstance, givenPair, givenPlace, givenQuestion, givenRelation, givenSyllogism } from "../../src/domain/given";
import type { Given } from "../../src/domain/given";
import { askedFrom, drawInstance, instanceKey } from "../../src/domain/instance";
import { drawPlace } from "../../src/domain/place";
import { STAGES, poolAt } from "../../src/domain/stages";
import { drawSyllogism, syllogismOf } from "../../src/domain/syllogism";
import { buildPool, pairOf } from "../../src/domain/universe";
import openData from "../../src/data/drill-data.json";

/** A small deterministic random source (mulberry32), so a test draws the same numbers every time. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

//   Existent > Functional thing > Form > Color, Shape; Functional thing > Consciousness; Existent > Permanent. Form and Consciousness exclude each
//   other, so do Color and Shape, and Functional thing and Permanent. Form opens at stage 1 (also named "matter", a term of its own met later),
//   Color and Shape at stage 2, Consciousness at 3, Functional thing and Permanent at 5; the everyday categories are there from the start.
const term = (name: string, parent?: string, contra?: string[]) => ({ name, ch: "I", parent, contra });
const DATA = {
  terms: {
    Existent: term("Existent"),
    "Functional thing": term("Functional thing", "Existent", ["Permanent"]),
    Permanent: term("Permanent", "Existent", ["Functional thing"]),
    Form: term("Form", "Functional thing", ["Consciousness"]),
    Matter: term("Matter", "Functional thing"),
    Consciousness: term("Consciousness", "Functional thing", ["Form"]),
    Color: term("Color", "Form", ["Shape"]),
    Shape: term("Shape", "Form", ["Color"]),
  },
  chains: {},
  cats: [
    { id: "ft", kind: "dudra", term: "Functional thing", labels: ["functional things", "impermanent things"], type: "functional thing", phrases: ["a functional thing", "impermanent"], st: 5 },
    { id: "perm", kind: "dudra", term: "Permanent", labels: ["permanent things"], type: "permanent", phrases: ["permanent"], st: 5 },
    { id: "form", kind: "dudra", term: "Form", labels: ["forms", "matter"], type: "form", phrases: ["a form", "matter"], st: 1, named: [{ term: "Matter", words: ["matter"], st: 4 }] },
    { id: "cons", kind: "dudra", term: "Consciousness", labels: ["consciousnesses"], type: "consciousness", phrases: ["a consciousness"], st: 3 },
    { id: "col", kind: "dudra", term: "Color", labels: ["colors", "hues"], type: "color", phrases: ["a color"], sense: true, st: 2 },
    { id: "shape", kind: "dudra", term: "Shape", labels: ["shapes"], type: "shape", phrases: ["a shape"], sense: true, st: 2 },
    { id: "red", kind: "everyday", labels: ["red things"], type: "form: red things", phrases: ["red"] },
    { id: "round", kind: "everyday", labels: ["round things", "things that are round"], type: "form: round things", phrases: ["round"] },
    { id: "food", kind: "everyday", labels: ["food"], type: "form: things eaten as food", phrases: ["food"] },
    { id: "wooden", kind: "everyday", labels: ["wooden things"], type: "form: things made of wood", phrases: ["made of wood"] },
    { id: "emotion", kind: "everyday", labels: ["emotions"], type: "consciousness: emotions", phrases: ["an emotion"], within: ["cons"] },
  ],
  items: [
    { n: "a tomato", t: "Form", c: ["ft", "form", "red", "round", "food"], comp: true },
    { n: "a red brick", t: "Form", c: ["ft", "form", "red"], comp: true },
    { n: "a wooden ball", t: "Form", c: ["ft", "form", "round", "wooden"], comp: true },
    { n: "a banana", t: "Form", c: ["ft", "form", "food"], comp: true },
    { n: "a chair", t: "Form", c: ["ft", "form"], comp: true, may: ["wooden", "red"] },
    { n: "the red of a rose", t: "Color", c: ["ft", "form", "col", "red"], st: 2 },
    { n: "the roundness of a coin", t: "Shape", c: ["ft", "form", "shape", "round"], st: 2 },
    { n: "anger", t: "Consciousness", c: ["ft", "cons", "emotion"], st: 3 },
    { n: "your own joy", t: "Consciousness", c: ["ft", "cons", "emotion"], st: 3, nosubject: true },
    { n: "space", t: "Permanent", c: ["perm"], st: 5 },
    { n: "the horn of a rabbit", t: "Non-existent", c: [], ne: true, st: 5 },
  ],
  aliases: { ball: "a wooden ball" },
  bodySkip: [],
} as unknown as DrillData;
const ix = makeIndex(DATA);
const real = makeIndex(openData as unknown as DrillData);
const ALL = STAGES.map((s) => s.n);

// ---- Relations and Pervasions: a pair ----

test("givenPair: the two categories in the order given, with the relation and the cells of a drawn pair", () => {
  const p = givenPair(ix, "red", "round", { rng: seeded(1) })!;
  expect(p).toMatchObject({ catA: "red", catB: "round", a: "red things", relation: "4", generated: true });
  expect(["round things", "things that are round"]).toContain(p.b);
  expect(p.ex).toMatchObject({ both: "a tomato", anb: expect.stringMatching(/red brick|red of a rose/), bna: expect.stringMatching(/wooden ball|roundness/) });
  // the order is the given one, whichever way round: colors are inside forms, and forms have what is no color
  expect(givenPair(ix, "col", "form", { rng: seeded(1) })).toMatchObject({ catA: "col", catB: "form", relation: "3ab" });
  expect(givenPair(ix, "form", "col", { rng: seeded(1) })).toMatchObject({ catA: "form", catB: "col", relation: "3ba" });
  expect(givenPair(ix, "col", "shape", { rng: seeded(1) })).toMatchObject({ relation: "con" });
  // the same numbers, the same pair
  expect(givenPair(ix, "red", "round", { rng: seeded(7), now: () => 1 })).toEqual(givenPair(ix, "red", "round", { rng: seeded(7), now: () => 1 }));
});

test("givenPair: the labels a task says, a negated side, and the same category twice", () => {
  expect(givenPair(ix, "col", "round", { labels: ["hues", "things that are round"], rng: seeded(1) })).toBeNull(); // a sense category with an everyday one: not judged
  expect(givenPair(ix, "col", "form", { labels: ["hues"], rng: seeded(1) })).toMatchObject({ a: "hues", catA: "col" });
  expect(givenPair(ix, "col", "form", { labels: [null, "matter"], rng: seeded(1) })).toMatchObject({ b: "matter" });
  expect(givenPair(ix, "col", "form", { labels: ["tints"], rng: seeded(1) })).toBeNull();       // not a label of the category
  const neg = givenPair(ix, "red", "round", { neg: "b", labels: ["red things", "round things"], rng: seeded(1) })!;
  expect(neg).toMatchObject({ a: "red things", b: "non-(round things)", neg: "b" });
  expect(neg.relation).toBe(pairOf(ix, "red", "round", "red things", "round things", seeded(1), () => 1, undefined, undefined, "b").relation);
  expect(givenPair(ix, "red", "round", { neg: "b", labels: ["red things", "round things"], brackets: false, rng: seeded(1) })!.b).toBe("non-round things");
  // one category's own two labels: a pair of two names, mutually inclusive; an everyday category's labels are only other wordings
  const two = givenPair(ix, "form", "form", { rng: seeded(3) })!;
  expect(two.relation).toBe("mi");
  expect([two.a, two.b].sort()).toEqual(["forms", "matter"]);
  expect(givenPair(ix, "form", "form", { labels: ["matter"], rng: seeded(3) })).toMatchObject({ a: "matter", b: "forms" });
  expect(givenPair(ix, "form", "form", { labels: ["matter", "matter"], rng: seeded(3) })).toBeNull();
  expect(givenPair(ix, "round", "round", { rng: seeded(3) })).toBeNull();
  expect(givenPair(ix, "cons", "cons", { rng: seeded(3) })).toBeNull();                         // one label only
});

test("givenPair: null for what the data does not have or judge, and beyond the learner's stages and words", () => {
  expect(givenPair(ix, "red", "nowhere")).toBeNull();
  expect(givenPair(ix, "col", "red")).toBeNull();                                               // not judged (judgeable)
  // stages: a category not open yet, and a pair whose cells need things of a later stage
  expect(givenPair(ix, "col", "form", { stages: [0, 1], rng: seeded(1) })).toBeNull();
  expect(givenPair(ix, "col", "form", { stages: [0, 1, 2], rng: seeded(1) })).toBeNull();         // open, but what is neither is a thing of stage 3
  expect(givenPair(ix, "col", "form", { stages: [0, 1, 2, 3], rng: seeded(1) })).not.toBeNull();
  expect(givenPair(ix, "form", "cons", { stages: [0, 1, 2], rng: seeded(1) })).toBeNull();
  // the examples are things of the stages
  for (let s = 1; s < 20; s++) expect(givenPair(ix, "red", "round", { stages: [0], rng: seeded(s) })!.ex).toMatchObject({ anb: "a red brick", bna: "a wooden ball" });
  // words: a category whose term is not met makes no pair, and a named term's label waits for its stop
  expect(givenPair(ix, "col", "form", { words: { unmet: new Set(["col"]) }, rng: seeded(1) })).toBeNull();
  for (let s = 1; s < 20; s++) expect(givenPair(ix, "col", "form", { words: { unmet: new Set(["form:Matter"]) }, rng: seeded(s) })!.b).toBe("forms");
  expect(givenPair(ix, "form", "form", { words: { unmet: new Set(["form:Matter"]) }, rng: seeded(1) })).toBeNull(); // one label left to show
  // nor does a label the task says: "matter" is a named term's
  expect(givenPair(ix, "col", "form", { labels: [null, "matter"], words: { unmet: new Set(["form:Matter"]) }, rng: seeded(1) })).toBeNull();
  expect(givenPair(ix, "form", "form", { labels: ["forms", "matter"], words: { unmet: new Set(["form:Matter"]) }, rng: seeded(1) })).toBeNull();
  expect(givenPair(ix, "col", "form", { labels: [null, "forms"], words: { unmet: new Set(["form:Matter"]) }, rng: seeded(1) })).toMatchObject({ b: "forms" });
});

test("givenPair: every pair the draw can make at a learner's stages can be given, with the relation the pool has", () => {
  const pool = buildPool(real), rel = (r: string) => (r === "3ab" || r === "3ba" ? "3" : r);
  for (const on of [[0], [0, 1, 2, 3], ALL]) {
    for (const e of poolAt(real, pool, on)) {
      const p = givenPair(real, e.a, e.b, { stages: on, rng: seeded(1) });
      expect(p, e.a + " | " + e.b + " at " + on.join(",")).not.toBeNull();
      expect(rel(p!.relation)).toBe(e.r);
    }
  }
  // and nothing outside the pool makes a pair
  const keys = new Set(pool.map((e) => e.a + "|" + e.b)), ids = Object.keys(real.CAT);
  let outside = 0;
  for (const a of ids) for (const b of ids) if (!keys.has(a + "|" + b) && !keys.has(b + "|" + a)) { outside++; expect(givenPair(real, a, b, { rng: seeded(1) }), a + " | " + b).toBeNull(); }
  expect(outside).toBeGreaterThan(0);
}, 15_000); // every pair of the open data at three sets of stages, and every two categories outside it: a few seconds on a busy machine

// ---- Find a pair ----

test("givenRelation: one of the five relations, or null", () => {
  for (const r of ["mi", "con", "3ab", "3ba", "4"]) expect(givenRelation(r)).toBe(r);
  for (const r of ["3", "4n", "", null, undefined]) expect(givenRelation(r)).toBeNull();
});

// ---- Syllogisms ----

test("givenSyllogism: the subject, the reason and the predicate given, settled as the drill settles them", () => {
  const c = givenSyllogism(ix, "the roundness of a coin", "form", "col", { rng: seeded(1) })!;
  expect(c).toMatchObject({ subject: "the roundness of a coin", catR: "form", catP: "col", answer: "pervasion", predicate: "a color" });
  expect(c).toEqual(syllogismOf(ix, "the roundness of a coin", "form", "col", seeded(1)));
  expect(givenSyllogism(ix, "the red of a rose", "col", "form", { rng: seeded(1) })).toMatchObject({ answer: "accept" });
  expect(givenSyllogism(ix, "a banana", "red", "food", { rng: seeded(1) })).toMatchObject({ answer: "reason" });
  // the name with or without its article; an alias is another thing's name, and names nothing here
  expect(givenSyllogism(ix, "Tomato", "red", "food", { rng: seeded(1) })?.subject).toBe("a tomato");
  expect(givenSyllogism(ix, "ball", "red", "food")).toBeNull();
});

test("givenSyllogism: null for what the data cannot settle, a thing that cannot be the subject, and beyond the stages and words", () => {
  expect(givenSyllogism(ix, "a pear", "red", "food")).toBeNull();
  expect(givenSyllogism(ix, "a tomato", "red", "nowhere")).toBeNull();
  expect(givenSyllogism(ix, "your own joy", "emotion", "cons")).toBeNull();                      // said in the second person
  expect(givenSyllogism(ix, "the horn of a rabbit", "red", "food")).toBeNull();                  // does not exist
  expect(givenSyllogism(ix, "anger", "emotion", "cons", { stages: [0, 1, 2] })).toBeNull();      // the predicate opens at stage 3
  expect(givenSyllogism(ix, "anger", "emotion", "cons", { stages: [0, 3] })).toMatchObject({ answer: "accept" });
  expect(givenSyllogism(ix, "the red of a rose", "red", "food", { stages: [0, 1] })).toBeNull(); // a thing of stage 2
  expect(givenSyllogism(ix, "the red of a rose", "red", "food", { stages: [0, 2] })).not.toBeNull();
  expect(givenSyllogism(ix, "anger", "emotion", "cons", { words: { unmet: new Set(["cons"]) } })).toBeNull();
  // a named term's phrase waits for its stop: the predicate is "a form", never "matter"
  for (let s = 1; s < 20; s++) expect(givenSyllogism(ix, "a tomato", "red", "form", { words: { unmet: new Set(["form:Matter"]) }, rng: seeded(s) })!.predicate).toBe("a form");
  expect(new Set(Array.from({ length: 20 }, (_, s) => givenSyllogism(ix, "a tomato", "red", "form", { rng: seeded(s + 1) })!.predicate))).toEqual(new Set(["a form", "matter"]));
  // one class as reason and predicate needs two of its phrases: with "matter" still to come there is one
  expect(givenSyllogism(ix, "a tomato", "form", "form", { rng: seeded(1) })).not.toBeNull();
  expect(givenSyllogism(ix, "a tomato", "form", "form", { words: { unmet: new Set(["form:Matter"]) }, rng: seeded(1) })).toBeNull();
});

test("givenSyllogism: every syllogism the drill draws can be given again, with the same answer", () => {
  for (const on of [[0, 1, 2, 3], ALL]) {
    const recent: string[] = [];
    for (let s = 1; s <= 60; s++) {
      const c = drawSyllogism(real, { hist: [], recent, stages: on, rng: seeded(s) });
      const g = givenSyllogism(real, c.subject, c.catR, c.catP, { stages: on, rng: seeded(s) });
      expect(g, c.id).not.toBeNull();
      expect(g).toMatchObject({ id: c.id, answer: c.answer, situation: c.situation });
    }
  }
}, 15_000); // 120 draws on the open data, each made again: a few seconds on a busy machine

// ---- Categories ----

test("givenPlace: the thing given, with every given category among the rows", () => {
  for (let s = 1; s <= 30; s++) {
    const q = givenPlace(ix, "a tomato", ["food", "cons"], { rng: seeded(s) })!;
    expect(q.thing).toMatchObject({ n: "a tomato", st: 0 });
    const cats = q.rows.map((r) => r.cat);
    expect(cats).toEqual(expect.arrayContaining(["food", "cons"]));
    expect(new Set(cats).size).toBe(cats.length);
    expect(q.rows.length).toBeLessThanOrEqual(6);
    expect(q.rows.find((r) => r.cat === "food")!.answer).toBe(true);
    expect(q.rows.find((r) => r.cat === "cons")!.answer).toBe(false);
    // the rows around them are a question of the exercise's own: something to tick and something to refuse
    expect(q.rows.some((r) => r.answer) && q.rows.some((r) => !r.answer)).toBe(true);
  }
  // with no category given, the question the exercise would draw for the thing
  expect(givenPlace(ix, "a tomato", [], { rng: seeded(2) })!.rows.length).toBeGreaterThanOrEqual(3);
  // more given than the size: all of them are offered
  const many = givenPlace(ix, "a tomato", ["ft", "form", "red", "round", "food", "cons", "perm", "wooden"], { size: 4, rng: seeded(1) })!;
  expect(many.rows.map((r) => r.cat).sort()).toEqual(["cons", "food", "form", "ft", "perm", "red", "round", "wooden"]);
});

test("givenPlace: only the given categories, in the order given", () => {
  const q = givenPlace(ix, "the red of a rose", ["shape", "col", "form"], { only: true })!;
  expect(q.rows.map((r) => [r.cat, r.answer])).toEqual([["shape", false], ["col", true], ["form", true]]);
  expect(givenPlace(ix, "the red of a rose", ["col"], { only: true })).toBeNull();               // one row is no question
  expect(givenPlace(ix, "the red of a rose", [], { only: true })).toBeNull();
});

test("givenPlace: null for what the data lacks or leaves open, and beyond the stages and words", () => {
  expect(givenPlace(ix, "a pear", ["food"])).toBeNull();
  expect(givenPlace(ix, "a tomato", ["nowhere"])).toBeNull();
  expect(givenPlace(ix, "a chair", ["wooden"])).toBeNull();                                      // its name leaves it open
  expect(givenPlace(ix, "a tomato", ["col"])).toBeNull();                                        // a sense category is not asked of a whole thing
  expect(givenPlace(ix, "your own joy", ["cons"])).toBeNull();
  expect(givenPlace(ix, "the red of a rose", ["col"], { stages: [0, 1] })).toBeNull();           // a thing of stage 2
  expect(givenPlace(ix, "a tomato", ["cons"], { stages: [0, 1, 2] })).toBeNull();                // the category opens at stage 3
  expect(givenPlace(ix, "a tomato", ["cons"], { stages: [0, 1, 2, 3], rng: seeded(1) })).not.toBeNull();
  expect(givenPlace(ix, "a tomato", ["form"], { words: { unmet: new Set(["form"]) } })).toBeNull();
  // a learner's rows never have a category of a later stage or one not met
  for (let s = 1; s <= 30; s++) {
    const q = givenPlace(ix, "a tomato", ["food"], { stages: [0, 1, 2], words: { unmet: new Set(["shape"]) }, rng: seeded(s) })!;
    for (const r of q.rows) expect(["ft", "perm", "cons", "shape"]).not.toContain(r.cat);
  }
});

test("givenPlace: a reference example where the device holds them, and the practice item of the same name first", () => {
  const ex = (n: string, cls: string[], more: Partial<Example> = {}): Example => ({ n, cls, lv: 1, st: 3, cf: "confirmed", k: "thing", ...more }) as Example;
  const examples = [ex("a clay pot", ["Form"]), ex("a tomato", ["Consciousness"]), ex("a rumor", ["Form"], { cf: "commentator" }), ex("the blue of the sky", ["Color"])];
  const pot = givenPlace(ix, "clay pot", ["form", "cons"], { examples, only: true })!;
  expect(pot.thing).toMatchObject({ n: "a clay pot", cf: "confirmed" });
  expect(pot.thing.ex).toBe(examples[0]);
  expect(pot.rows.map((r) => r.answer)).toEqual([true, false]);
  expect(givenPlace(ix, "a clay pot", ["form", "cons"], { only: true })).toBeNull();             // no reference examples on the device
  expect(givenPlace(ix, "a tomato", ["form", "cons"], { examples, only: true })!.thing.item?.n).toBe("a tomato");
  expect(givenPlace(ix, "a rumor", ["form", "cons"], { examples, only: true })).toBeNull();      // not one a learner is shown
  // a reference example has a stage too: this one is known from stage 3
  expect(givenPlace(ix, "the blue of the sky", ["col", "shape"], { examples, only: true, stages: [0, 1, 2] })).toBeNull();
  expect(givenPlace(ix, "the blue of the sky", ["col", "shape"], { examples, only: true, stages: [0, 1, 2, 3] })!.rows.map((r) => r.answer)).toEqual([true, false]);
});

test("givenPlace: every thing Categories draws can be given again with the rows it was drawn with", () => {
  for (const on of [[0], [0, 1, 2, 3], ALL]) {
    for (let s = 1; s <= 40; s++) {
      const d = drawPlace(real, null, { stages: on, rng: seeded(s) })!;
      const cats = d.rows.map((r) => r.cat);
      const g = givenPlace(real, d.thing.n, cats, { stages: on, rng: seeded(s) });
      expect(g, d.thing.n).not.toBeNull();
      expect(g!.rows.map((r) => r.cat).sort()).toEqual([...cats].sort());
      expect(givenPlace(real, d.thing.n, cats, { stages: on, only: true })!.rows).toEqual(d.rows);
    }
  }
});

// ---- Find an instance ----

test("givenInstance: one to three categories the exercise asks, with what is in all of them or why nothing is", () => {
  const both = givenInstance(ix, ["red", "round"], { rng: seeded(1) })!;
  expect(both).toMatchObject({ possible: true, apart: null, known: ["a tomato"] });
  expect([...both.cats].sort()).toEqual(["red", "round"]);
  expect(givenInstance(ix, ["col", "shape"], { rng: seeded(1) })).toMatchObject({ possible: false, apart: { why: "Nothing is both a color and a shape." } });
  expect(givenInstance(ix, ["food"], { rng: seeded(1) })).toMatchObject({ possible: true, cats: ["food"] });
  expect(givenInstance(ix, ["red", "round", "food"], { rng: seeded(1) })).toMatchObject({ possible: true, known: ["a tomato"] });
});

test("givenInstance: null for a set the exercise does not ask, and beyond the stages and words", () => {
  expect(givenInstance(ix, [])).toBeNull();
  expect(givenInstance(ix, ["red", "red"])).toBeNull();
  expect(givenInstance(ix, ["red", "nowhere"])).toBeNull();
  expect(givenInstance(ix, ["red", "round", "food", "form"])).toBeNull();                        // four
  expect(givenInstance(ix, ["col", "red"])).toBeNull();                                          // a pair the data does not judge
  expect(givenInstance(ix, ["wooden", "food"])).toBeNull();                                      // nothing in both, and no reason the data can say
  expect(askedFrom(ix, ["shape", "col"])).toBe(askedFrom(ix, ["col", "shape"]));
  expect(givenInstance(ix, ["col", "shape"], { stages: [0, 1] })).toBeNull();                    // the categories open at stage 2
  expect(givenInstance(ix, ["col", "shape"], { stages: [0, 2], rng: seeded(1) })).not.toBeNull();
  expect(givenInstance(ix, ["red", "round"], { words: { unmet: new Set(["red"]) } })).toBeNull();
  // the things the learner knows at the stages: a color or a shape is known from stage 2
  expect(givenInstance(ix, ["red"], { stages: [0], rng: seeded(1) })!.known).toEqual(["a tomato", "a red brick"]);
});

test("givenInstance: every set Find an instance draws can be given again", () => {
  for (const on of [[0], [0, 1, 2, 3], ALL]) {
    for (let s = 1; s <= 60; s++) {
      const d = drawInstance(real, { rng: seeded(s), stages: on });
      if (!d) continue;
      const g = givenInstance(real, d.cats, { stages: on, rng: seeded(s) });
      expect(g, instanceKey(d.cats)).not.toBeNull();
      expect(g).toMatchObject({ possible: d.possible, known: d.known });
      expect(instanceKey(g!.cats)).toBe(instanceKey(d.cats));
    }
  }
});

// ---- a question as it is written down ----

test("givenQuestion: makes the question of each exercise from what a task or a plan writes down", () => {
  const o = { rng: seeded(1) };
  expect(givenQuestion(ix, { exercise: "practice", a: "red", b: "round" }, o)).toMatchObject({ exercise: "practice", pair: { catA: "red", catB: "round" } });
  expect(givenQuestion(ix, { exercise: "debate", a: "col", b: "form", labels: ["hues", "matter"] }, o)).toMatchObject({ exercise: "debate", pair: { a: "hues", b: "matter" } });
  expect(givenQuestion(ix, { exercise: "find", relation: "3ab" }, o)).toEqual({ exercise: "find", relation: "3ab" });
  expect(givenQuestion(ix, { exercise: "syllogism", subject: "the roundness of a coin", reason: "form", predicate: "col" }, o)).toMatchObject({ exercise: "syllogism", syllogism: { answer: "pervasion" } });
  expect(givenQuestion(ix, { exercise: "categories", thing: "a tomato", cats: ["food", "cons"], only: true }, o)).toMatchObject({ exercise: "categories", place: { rows: [{ cat: "food" }, { cat: "cons" }] } });
  expect(givenQuestion(ix, { exercise: "instance", cats: ["col", "shape"] }, o)).toMatchObject({ exercise: "instance", instance: { possible: false } });
  // what the data cannot make is null, whatever the exercise; so is an exercise there is none of
  const none: Given[] = [
    { exercise: "practice", a: "red", b: "nowhere" }, { exercise: "find", relation: "5" as never }, { exercise: "syllogism", subject: "a pear", reason: "red", predicate: "food" },
    { exercise: "categories", thing: "a pear" }, { exercise: "instance", cats: ["wooden", "food"] }, { exercise: "sprint" } as never,
  ];
  for (const g of none) expect(givenQuestion(ix, g, o)).toBeNull();
  // a written question survives being stored as text
  const g: Given = { exercise: "syllogism", subject: "a tomato", reason: "red", predicate: "food" };
  expect(givenQuestion(ix, JSON.parse(JSON.stringify(g)), { rng: seeded(4) })).toEqual(givenQuestion(ix, g, { rng: seeded(4) }));
});
