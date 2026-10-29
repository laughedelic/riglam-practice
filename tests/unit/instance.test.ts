// "Find an instance" (src/domain/instance.ts): when nothing can be in a set of categories and why, which sets are drawn, and the grading of a
// thing named or of "nothing is". Invented data and examples, and the open data for the draw.
import { expect, test } from "vitest";
import { makeExampleIndex, makeIndex } from "../../src/ai-shared";
import type { DrillData, Example } from "../../src/ai-shared";
import { apartOf, drawInstance, gradeInstance, inAll, instanceGraded, instanceKey, instanceQuestion, itemStageIn, setStage } from "../../src/domain/instance";
import { HOLD_STAGE, catStage } from "../../src/domain/stages";
import openData from "../../src/data/drill-data.json";

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

//   Existent > Functional thing > Form > Color, Shape, Odor; Functional thing > Consciousness; Existent > Permanent.
//   Functional thing and Permanent exclude each other, so do Form and Consciousness, and Color and Shape; nothing says so of Shape and Odor.
const dudra = (id: string, term: string, extra: object = {}) => ({ id, kind: "dudra" as const, term, labels: [id + "s"], type: term.toLowerCase(), ...extra });
const everyday = (id: string, label: string, type: string, phrase: string) => ({ id, kind: "everyday" as const, labels: [label], type, phrases: [phrase] });
const DATA = {
  terms: {
    Existent: { name: "Existent", ch: "I" },
    "Functional thing": { name: "Functional thing", ch: "I", parent: "Existent", contra: ["Permanent"] },
    Permanent: { name: "Permanent", ch: "I", parent: "Existent", contra: ["Functional thing"] },
    Form: { name: "Form", ch: "I", parent: "Functional thing", contra: ["Consciousness"] },
    Consciousness: { name: "Consciousness", ch: "I", parent: "Functional thing", contra: ["Form"] },
    Color: { name: "Color", ch: "I", parent: "Form", contra: ["Shape"] },
    Shape: { name: "Shape", ch: "I", parent: "Form", contra: ["Color"] },
    Odor: { name: "Odor", ch: "I", parent: "Form" },
  },
  chains: {},
  cats: [
    dudra("ft", "Functional thing"), dudra("perm", "Permanent"), dudra("form", "Form"), dudra("cons", "Consciousness"),
    dudra("col", "Color", { sense: true }), dudra("shape", "Shape", { sense: true }), dudra("odor", "Odor", { sense: true }),
    everyday("wooden", "wooden things", "form: things made of wood", "made of wood"), everyday("red", "red things", "form: red things", "red"),
    everyday("round", "round things", "form: round things", "round"), everyday("furniture", "furniture", "form: furniture", "a piece of furniture"),
    everyday("emotion", "emotions", "consciousness: emotions", "an emotion"),
  ],
  items: [
    { n: "a wooden table", t: "Form", c: ["ft", "form", "wooden", "furniture"], comp: true },
    { n: "a red ball", t: "Form", c: ["ft", "form", "red", "round"], comp: true },
    { n: "a wooden ball", t: "Form", c: ["ft", "form", "wooden", "round"], comp: true },
    { n: "a red wooden ball", t: "Form", c: ["ft", "form", "wooden", "red", "round"], comp: true },
    { n: "the red of a rose", t: "Color", c: ["ft", "form", "col", "red"] },
    { n: "a round shape", t: "Shape", c: ["ft", "form", "shape", "round"] },
    { n: "the scent of a rose", t: "Odor", c: ["ft", "form", "odor"] },
    { n: "anger", t: "Consciousness", c: ["ft", "cons", "emotion"] },
    { n: "space", t: "Permanent", c: ["perm"] },
  ],
  aliases: { ball: "a red ball" },
  bodySkip: [],
} as unknown as DrillData;
const ix = () => makeIndex(DATA);
const q = (cats: string[]) => instanceQuestion(ix(), cats, seeded(1));

test("apartOf: two categories that exclude each other by the term data, or two course categories with nothing in common", () => {
  expect(apartOf(ix(), "col", "shape")?.why).toBe("Nothing is both a color and a shape.");
  expect(apartOf(ix(), "wooden", "emotion")?.why).toBe("Whatever is made of wood is a form, whatever is an emotion is a consciousness, and nothing is both a form and a consciousness.");
  expect(apartOf(ix(), "form", "emotion")?.why).toBe("Whatever is an emotion is a consciousness, and nothing is both a form and a consciousness.");
  expect(apartOf(ix(), "shape", "odor")?.why).toBe("Nothing is both a shape and an odor: they have no common locus.");
  // two everyday categories the list has nothing in common for are not shown to exclude each other, and neither are two that overlap or a pair the data does not judge
  expect(apartOf(ix(), "red", "furniture")).toBeNull();
  expect(apartOf(ix(), "red", "round")).toBeNull();
  expect(apartOf(ix(), "red", "col")).toBeNull();
});

test("instanceQuestion: the items in all of them, or why nothing is", () => {
  const both = q(["red", "round"]);
  expect(both).toMatchObject({ possible: true, apart: null });
  expect(both.known.sort()).toEqual(["a red ball", "a red wooden ball"]);
  expect(both.labels).toEqual(both.cats.map((c) => ix().CAT[c].labels[0]));
  expect(q(["wooden", "red", "round"])).toMatchObject({ possible: true, known: ["a red wooden ball"] });
  const none = q(["wooden", "emotion", "red"]);
  expect(none.possible).toBe(false);
  expect(none.known).toEqual([]);
  expect([none.apart!.a, none.apart!.b]).toContain("emotion");
  // a whole thing is not counted among the sense objects, so nothing the list has is both a color and red
  expect(inAll(ix(), ix().DATA.items[1], ["col"])).toBe(false);
  // nothing in the list and nothing shown: not a question
  expect(q(["red", "furniture"])).toMatchObject({ possible: false, apart: null });
});

test("drawInstance: every size, sets where nothing is, each one settled by the data", () => {
  const data = ix(), sizes = new Set<number>(), kinds = new Set<boolean>();
  for (let s = 0; s < 300; s++) {
    const d = drawInstance(data, { rng: seeded(s) })!;
    sizes.add(d.cats.length); kinds.add(d.possible);
    expect(new Set(d.cats).size).toBe(d.cats.length);
    if (d.possible) {
      expect(d.known.length).toBeGreaterThan(0);
      for (const n of d.known) expect(inAll(data, data.DATA.items.find((i) => i.n === n)!, d.cats), n).toBe(true);
    } else {
      expect(d.apart, d.cats.join()).not.toBeNull();
      expect(d.cats).toContain(d.apart!.a);
      expect(d.cats).toContain(d.apart!.b);
    }
    // two everyday categories with nothing in common are never asked on their own
    expect(instanceKey(d.cats)).not.toBe(instanceKey(["red", "furniture"]));
  }
  expect([...sizes].sort()).toEqual([1, 2, 3]);
  expect([...kinds].sort()).toEqual([false, true]);
});

test("drawInstance: the sets asked lately wait while others remain", () => {
  const data = ix(), last = instanceKey(["red", "round"]);
  for (let s = 0; s < 200; s++) expect(instanceKey(drawInstance(data, { rng: seeded(s), avoid: new Set([last]) })!.cats)).not.toBe(last);
});

test("drawInstance: on the open data, every set drawn is settled, and some are impossible", () => {
  const data = makeIndex(openData as unknown as DrillData), avoid = new Set<string>();
  let impossible = 0;
  for (let s = 0; s < 150; s++) {
    const d = drawInstance(data, { rng: seeded(s), avoid })!;
    avoid.add(instanceKey(d.cats));
    if (d.possible) expect(d.known.length, d.cats.join()).toBeGreaterThan(0);
    else { impossible++; expect(d.apart, d.cats.join()).not.toBeNull(); expect(d.known).toEqual([]); }
    // nothing the list has may be in a set called impossible
    if (!d.possible) expect(data.DATA.items.filter((it) => inAll(data, it, d.cats)).map((it) => it.n), d.cats.join()).toEqual([]);
  }
  expect(impossible).toBeGreaterThan(20);
});

test("drawInstance: on the open data, no one set comes up much more often than the rest", () => {
  const data = makeIndex(openData as unknown as DrillData), recent: string[] = [], seen = new Map<string, number>(), n = 3000, rng = seeded(11);
  for (let s = 0; s < n; s++) {
    const k = instanceKey(drawInstance(data, { rng, avoid: new Set(recent) })!.cats);
    seen.set(k, (seen.get(k) ?? 0) + 1);
    recent.push(k); if (recent.length > 16) recent.shift();
  }
  expect(Math.max(...seen.values()) / n).toBeLessThan(1 / 30);
});

// The same data with the stages of the learning ladder: the course's functional, permanent and conscious things open at stage 4, colors, shapes
// and odors as qualities at stage 2, and so is the red of a rose; the name "a wooden table" does not say whether it is red.
const STAGED = {
  ...DATA,
  cats: DATA.cats.map((c) => ({ ...c, ...(["ft", "perm", "cons"].includes(c.id) ? { st: 4 } : ["col", "shape", "odor"].includes(c.id) ? { st: 2 } : {}) })),
  items: DATA.items.map((it) => (it.n === "the red of a rose" ? { ...it, st: 2 } : it.n === "a wooden table" ? { ...it, may: ["red"] } : it)),
} as DrillData;

test("drawInstance: with stages, only categories open at the highest of them, and things known at them", () => {
  const data = makeIndex(STAGED), rose = data.DATA.items.find((i) => i.n === "the red of a rose")!;
  expect(setStage(data, ["col"], [rose])).toBe(2);
  expect(setStage(data, ["ft", "cons"])).toBe(4);
  expect(setStage(data, ["form", "red"], data.DATA.items.filter((it) => inAll(data, it, ["form", "red"])))).toBe(0);
  expect(instanceQuestion(data, ["form", "red"], seeded(1), [1]).known).toEqual(["a red ball", "a red wooden ball"]);
  expect(instanceQuestion(data, ["form", "red"], seeded(1)).known).toContain("the red of a rose");
  const late = new Set(["ft", "perm", "cons", "col", "shape", "odor"]), kinds = new Set<boolean>();
  for (let s = 0; s < 300; s++) {
    const d = drawInstance(data, { rng: seeded(s), stages: [1] })!;
    kinds.add(d.possible);
    expect(d.cats.filter((c) => late.has(c)), d.cats.join()).toEqual([]);
    expect(d.known).not.toContain("the red of a rose");
  }
  expect([...kinds].sort()).toEqual([false, true]);
  // at stage 2 a color is asked too, with the red of a rose as the thing in it
  const cols = Array.from({ length: 300 }, (_, s) => drawInstance(data, { rng: seeded(s), stages: [2] })!).filter((d) => d.cats.length === 1 && d.cats[0] === "col");
  expect(cols.length).toBeGreaterThan(0);
  expect(cols[0].known).toEqual(["the red of a rose"]);
});

test("drawInstance: on the open data at stages 0 and 1, every category is open, every thing shown is known, and no reason uses the course's words", () => {
  const data = makeIndex(openData as unknown as DrillData), avoid = new Set<string>();
  let impossible = 0;
  for (let s = 0; s < 150; s++) {
    const d = drawInstance(data, { rng: seeded(s), avoid, stages: [0, 1] })!;
    avoid.add(instanceKey(d.cats));
    for (const c of d.cats) expect(catStage(data.CAT[c]), c).toBeLessThanOrEqual(1);
    for (const n of d.known) expect(itemStageIn(data, data.DATA.items.find((i) => i.n === n)!, d.cats), n).toBe(0);
    if (d.possible) expect(d.known.length, d.cats.join()).toBeGreaterThan(0);
    else { impossible++; expect(d.apart!.why).not.toMatch(/a form|consciousness|compositional|functional|permanent|person/); }
  }
  expect(impossible).toBeGreaterThan(10);
});

test("drawInstance: stage 0 alone, where every learner starts, has sets of everyday categories to ask", () => {
  const data = makeIndex(openData as unknown as DrillData);
  for (let s = 0; s < 50; s++) {
    const d = drawInstance(data, { rng: seeded(s), stages: [0] });
    expect(d, "a set at stage 0").not.toBeNull();
    for (const c of d!.cats) expect(catStage(data.CAT[c]), c).toBe(0);
  }
});

test("instanceQuestion: at the first stages a reason says physical and a mind, as Categories does; the course's words once they open", () => {
  const data = makeIndex(STAGED);
  expect(instanceQuestion(data, ["wooden", "emotion"], seeded(1), [1]).apart!.why).toBe("Whatever is made of wood is physical, whatever is an emotion is a mind, and nothing is both physical and a mind.");
  expect(instanceQuestion(data, ["wooden", "emotion"], seeded(1), [2]).apart!.why).toBe("Whatever is made of wood is a form, whatever is an emotion is a mind, and nothing is both a form and a mind.");
  expect(instanceQuestion(data, ["wooden", "emotion"], seeded(1), [4]).apart!.why).toBe("Whatever is made of wood is a form, whatever is an emotion is a consciousness, and nothing is both a form and a consciousness.");
  // the rows of a thing named follow the stages the question was asked at
  const anger = gradeInstance(data, instanceQuestion(data, ["wooden", "emotion"], seeded(1), [1]), { text: "anger" });
  expect(anger.rows.find((x) => x.cat === "wooden")).toMatchObject({ answer: false, reason: "it is a mind, not something physical" });
});

test("gradeInstance: before the hold's stage a person in a physical category is left for later, as in Categories", () => {
  const data = makeIndex(openData as unknown as DrillData);
  const early = gradeInstance(data, instanceQuestion(data, ["round"], seeded(1), [1]), { text: "a dog" });
  expect(early).toMatchObject({ v: "open", thing: "a dog", from: "item" });
  expect(early.rows[0]).toMatchObject({ answer: null, reason: "whether it is round is left for a later stage" });
  expect(gradeInstance(data, instanceQuestion(data, ["round"], seeded(1), [HOLD_STAGE]), { text: "a dog" }).rows[0].answer).toBe(false);
});

test("gradeInstance: a practice item, by the list's categories, with the reason for each", () => {
  const r = gradeInstance(ix(), q(["red", "round"]), { text: "A red ball" });
  expect(r).toMatchObject({ v: "ok", thing: "a red ball", from: "item", example: null });
  expect(r.rows.map((x) => x.answer)).toEqual([true, true]);
  const table = gradeInstance(ix(), q(["red", "round"]), { text: "a wooden table" }, null, seeded(2));
  expect(table.v).toBe("bad");
  expect(table.rows.find((x) => x.cat === "red")).toMatchObject({ answer: false, reason: "it is not red" });
  expect(table.example!.thing).toMatch(/^a red (wooden )?ball$/);
  expect(table.example!.rows.every((x) => x.answer)).toBe(true);
  // a Dudra category: the steps up the chain, and the exclusion that makes a no
  const rose = gradeInstance(ix(), q(["ft", "cons"]), { text: "the red of a rose" });
  expect(rose.rows.find((x) => x.cat === "ft")).toMatchObject({ answer: true, reason: "it is a color, which is a form, which is a functional thing" });
  expect(rose.rows.find((x) => x.cat === "cons")).toMatchObject({ answer: false, why: "Nothing is both a form and a consciousness." });
  expect(rose.v).toBe("bad");
});

test("gradeInstance: what the list leaves open stays open", () => {
  // a whole thing, for a category of sense objects
  const whole = gradeInstance(ix(), q(["col"]), { text: "a red ball" });
  expect(whole).toMatchObject({ v: "open", from: "item" });
  expect(whole.rows[0]).toMatchObject({ answer: null, reason: "whether a whole thing is a color is left open here" });
  // a short name of an item says nothing of its color or shape
  const ball = gradeInstance(ix(), q(["red", "round"]), { text: "ball" });
  expect(ball).toMatchObject({ v: "open", thing: "ball", from: "item" });
  expect(ball.rows[0].reason).toMatch(/^“ball” leaves open whether it is (red|round)$/);
  // a feature the item's name does not say
  const staged = makeIndex(STAGED), table = gradeInstance(staged, instanceQuestion(staged, ["wooden", "red"], seeded(1)), { text: "a wooden table" });
  expect(table).toMatchObject({ v: "open", thing: "a wooden table", from: "item" });
  expect(table.rows.find((x) => x.cat === "red")).toMatchObject({ answer: null, reason: "“a wooden table” leaves open whether it is red" });
  // a thing the data does not know
  const unknown = gradeInstance(ix(), q(["red", "round"]), { text: "a fire truck" }, null, seeded(3));
  expect(unknown).toMatchObject({ v: "open", thing: "a fire truck", from: null, rows: [] });
  expect(unknown.example).not.toBeNull();
});

test("gradeInstance: \"nothing is\" is right exactly when nothing can be, and any thing is wrong then", () => {
  const none = q(["wooden", "emotion"]), some = q(["wooden", "round"]);
  expect(gradeInstance(ix(), none, { none: true })).toMatchObject({ v: "ok", rows: [], example: null });
  expect(gradeInstance(ix(), some, { none: true }, null, seeded(4))).toMatchObject({ v: "bad", example: { thing: expect.stringMatching(/ball$/) } });
  const anger = gradeInstance(ix(), none, { text: "anger" });
  expect(anger).toMatchObject({ v: "bad", from: "item" });
  expect(anger.rows.find((x) => x.cat === "wooden")!.answer).toBe(false);
  expect(gradeInstance(ix(), none, { text: "a unicorn" })).toMatchObject({ v: "bad", from: null, example: null });
});

test("gradeInstance: a reference example, by its classes", () => {
  const ex = (n: string, cls: string[], extra: object = {}): Example => ({ n, cls, lv: 1, cf: "confirmed", k: "thing", ...extra }) as Example;
  const eix = makeExampleIndex({ format: "x", version: 1, sources: {}, items: [ex("the blue of the sky", ["Color"]), ex("the horn of a hare", [], { ne: true })] });
  const sky = gradeInstance(ix(), q(["ft", "form"]), { text: "the blue of the sky" }, eix);
  expect(sky).toMatchObject({ v: "ok", thing: "the blue of the sky", from: "example" });
  // an everyday category can only be a no by the classes, so the rest stays open
  const red = gradeInstance(ix(), q(["form", "red"]), { text: "the blue of the sky" }, eix, seeded(5));
  expect(red.v).toBe("open");
  expect(red.rows.find((x) => x.cat === "red")).toMatchObject({ answer: null, reason: "the course data does not say whether it is red" });
  // a name two examples share is placed only where they agree
  const two = makeExampleIndex({ format: "x", version: 1, sources: {}, items: [ex("a patch", ["Color"]), ex("a patch", ["Shape"])] });
  const patch = gradeInstance(ix(), q(["ft", "form"]), { text: "a patch" }, two);
  expect(patch).toMatchObject({ v: "ok", from: "example" });
  const col = gradeInstance(ix(), q(["col"]), { text: "a patch" }, two, seeded(7));
  expect(col.v).toBe("open");
  expect(col.rows[0].answer).toBeNull();
  const horn = gradeInstance(ix(), q(["ft"]), { text: "the horn of a hare" }, eix, seeded(6));
  expect(horn).toMatchObject({ v: "bad", from: "example" });
  expect(horn.rows[0]).toMatchObject({ answer: false, reason: "it does not exist" });
});

test("drawInstance: a set with a term not met yet waits, and a share of the sets have one of the stage's open terms", () => {
  const data = makeIndex(openData as unknown as DrillData), on = [1, 2, 3];
  const vis = Object.values(data.CAT).filter((c) => c.kind === "dudra" && catStage(c) === 2).map((c) => c.id), open = new Set(vis);
  // the terms of stage 3 are not met: no set has one, though stage 3 is on
  const waiting = new Set(Object.values(data.CAT).filter((c) => catStage(c) === 3).map((c) => c.id));
  for (let s = 0; s < 200; s++) for (const c of drawInstance(data, { rng: seeded(s), stages: on, unmet: waiting })!.cats) expect(waiting.has(c), c).toBe(false);
  // open terms: every set when the whole share is theirs, a share of them by default, and none of them is no lean
  const asks = (share: number | undefined) => Array.from({ length: 300 }, (_, s) => drawInstance(data, { rng: seeded(s), stages: on, unmet: waiting, open, newShare: share })!).filter((d) => d.cats.some((c) => open.has(c))).length;
  expect(asks(1)).toBe(300);
  expect(asks(0.5)).toBeGreaterThan(asks(0));
  expect(asks(0.5)).toBeLessThan(300);
});

test("instanceGraded: a right thing ticks each category of the set, a right \"nothing is\" the two that exclude each other, a wrong answer none", () => {
  const data = makeIndex(openData as unknown as DrillData);
  // a color that is a form source: the red of a rose is both
  const q = instanceQuestion(data, ["col", "vis"], seeded(3), [1, 2, 3]);
  expect(q.possible, "a color is a form source").toBe(true);
  const said = gradeInstance(data, q, { text: "the red of a rose" });
  expect(said.v).toBe("ok");
  expect(instanceGraded(q, said, false)).toEqual(q.cats.map((cat) => ({ cat, ok: true })));
  expect(instanceGraded(q, gradeInstance(data, q, { none: true }), true)).toEqual([]);
  expect(instanceGraded(q, gradeInstance(data, q, { text: "a cloud of nothing in particular" }), false)).toEqual([]);
  // a set where nothing can be: "nothing is" is right and proves the two categories that exclude each other
  for (let s = 0; s < 80; s++) {
    const a = drawInstance(data, { rng: seeded(s), stages: [1, 2, 3, 4] })!;
    if (!a.apart) continue;
    const none = gradeInstance(data, a, { none: true });
    expect(none.v).toBe("ok");
    expect(instanceGraded(a, none, true).map((g) => g.cat).sort()).toEqual([a.apart.a, a.apart.b].sort());
    expect(instanceGraded(a, none, true).every((g) => g.ok)).toBe(true);
  }
});
