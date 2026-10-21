// "Place a thing" (src/domain/place.ts): which categories a reference example is offered against, the answer and the reason of each,
// the draw by level, and the grading of the ticks. Invented data and examples only.
import { expect, test } from "vitest";
import { makeIndex, upTo } from "../../src/ai-shared";
import type { DrillData, Example } from "../../src/ai-shared";
import { buildPool } from "../../src/domain";
import { drawPlace, gradeNarrow, gradePlace, placeGrade, placeLevelDown, placeLevelUp, placeNarrow, placeQuestionRows, placeRows } from "../../src/domain/place";
import { placeByClass } from "../../src/domain/reference";
import openData from "../../src/data/drill-data.json";
import { madeUpExamples } from "../../scripts/lib/made-up-course.mjs";

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

//   Existent > Functional thing > Form > External form > Color, Shape; Form > Internal form; Functional thing > Consciousness; Existent > Permanent.
//   Functional thing and Permanent exclude each other, so do Form and Consciousness, External form and Internal form, Color and Shape.
const cat = (id: string, term: string, type: string) => ({ id, kind: "dudra" as const, term, labels: [id + "s"], type });
const ix = () => makeIndex({
  terms: {
    Existent: { name: "Existent", ch: "I" },
    "Functional thing": { name: "Functional thing", ch: "I", parent: "Existent", contra: ["Permanent"] },
    Permanent: { name: "Permanent", ch: "I", parent: "Existent", contra: ["Functional thing"] },
    Form: { name: "Form", ch: "I", parent: "Functional thing", contra: ["Consciousness"] },
    Consciousness: { name: "Consciousness", ch: "I", parent: "Functional thing", contra: ["Form"] },
    "External form": { name: "External form", ch: "I", parent: "Form", contra: ["Internal form"] },
    "Internal form": { name: "Internal form", ch: "I", parent: "Form", contra: ["External form"] },
    Color: { name: "Color", ch: "I", parent: "External form", contra: ["Shape"] },
    Shape: { name: "Shape", ch: "I", parent: "External form", contra: ["Color"] },
  },
  chains: {},
  cats: [
    cat("ft", "Functional thing", "functional thing"), cat("perm", "Permanent", "permanent phenomenon"), cat("form", "Form", "form (matter)"),
    cat("cons", "Consciousness", "consciousness"), cat("extf", "External form", "external form"), cat("intf", "Internal form", "internal form"),
    cat("col", "Color", "color"), cat("shape", "Shape", "shape"),
    { id: "wood", kind: "everyday" as const, labels: ["wooden things"], type: "form: things made of wood" },
  ],
  items: [],
  bodySkip: [],
} as unknown as DrillData);

const ex = (n: string, cls: string[], lv: number, extra: object = {}): Example => ({ n, cls, lv, cf: "confirmed", k: "thing", ...extra }) as Example;
const wall = ex("a blue wall", ["Color"], 1);
const answers = (rows: { cat: string; answer: boolean }[]) => Object.fromEntries(rows.map((r) => [r.cat, r.answer]));

test("placeRows: every Dudra category the data settles, with the answer and the steps that show it", () => {
  const rows = placeRows(ix(), wall);
  expect(answers(rows)).toEqual({ ft: true, perm: false, form: true, cons: false, extf: true, intf: false, col: true, shape: false });
  const by = Object.fromEntries(rows.map((r) => [r.cat, r]));
  expect(by.col).toMatchObject({ phrase: "a color", reason: "it is a color", why: "" });
  expect(by.form.reason).toBe("it is a color, which is an external form, which is a form");
  expect(by.cons).toMatchObject({ reason: "it is a color, which is an external form, which is a form", why: "Nothing is both a form and a consciousness." });
  expect(by.shape.why).toBe("Nothing is both a color and a shape.");
  // an everyday category is not offered, and what the data cannot tell is left out
  expect(rows.some((r) => r.cat === "wood")).toBe(false);
  expect(placeRows(ix(), ex("a hope of the unknown", ["Unheard-of class"], 1))).toEqual([]);
  expect(placeRows(ix(), ex("a thing with no class", [], 1))).toEqual([]);
});

test("placeRows: a thing that does not exist, or the sources say is not a class, is no in what they exclude", () => {
  const horn = placeRows(ix(), ex("the horn of a hare", [], 1, { ne: true }));
  expect(horn.length).toBe(8);
  for (const r of horn) { expect(r.answer, r.cat).toBe(false); expect(r.reason, r.cat).toBe("it does not exist"); expect(r.why, r.cat).toBe(`Nothing that does not exist is ${r.phrase}.`); }
  const odd = ex("an odd form", ["Form"], 2, { not: ["Color"] });
  const rows = placeRows(ix(), odd);
  expect(rows.find((r) => r.cat === "col")).toMatchObject({ answer: false, reason: "the sources say it is not a color" });
  for (const r of rows) expect(placeByClass(ix(), odd, ix().CAT[r.cat]), r.cat).toBe(r.answer ? "yes" : "no");
});

test("placeQuestionRows: one to three yes, the narrowest always, no rows half from its family, up to the size, in any order", () => {
  const data = ix();
  const seen = new Set<string>();
  for (let s = 0; s < 200; s++) {
    const rows = placeQuestionRows(data, wall, seeded(s))!;
    expect(rows.length).toBeLessThanOrEqual(6);
    const yes = rows.filter((r) => r.answer);
    expect(yes.length).toBeGreaterThanOrEqual(1);
    expect(yes.length).toBeLessThanOrEqual(3);
    expect(yes.map((r) => r.cat), "the narrowest category is always offered").toContain("col");
    expect(rows.filter((r) => !r.answer).length).toBeGreaterThanOrEqual(2);
    expect(new Set(rows.map((r) => r.cat)).size).toBe(rows.length);
    seen.add(rows.map((r) => r.cat).join());
    // the neighbours in the family of Color (a shape, an internal form) are among the refusals
    expect(rows.some((r) => !r.answer && ["shape", "intf"].includes(r.cat)), `seed ${s}`).toBe(true);
  }
  expect(seen.size, "the order and the choice vary").toBeGreaterThan(20);
  expect(placeQuestionRows(data, wall, seeded(1), 4)!.length).toBeLessThanOrEqual(4);
  expect(placeQuestionRows(data, ex("a hope of the unknown", ["Unheard-of class"], 1), seeded(1))).toBeNull();
  expect(placeQuestionRows(data, ex("a thing with no class", [], 1), seeded(1))).toBeNull();
  // a non-existent thing has nothing to tick
  const horn = placeQuestionRows(data, ex("the horn of a hare", [], 1, { ne: true }), seeded(2))!;
  expect(horn.every((r) => !r.answer)).toBe(true);
});

test("drawPlace: only examples a cell takes, of the levels that are on, each level as often as the others, recent names last, null when nothing fits", () => {
  const data = ix();
  const items = [
    ex("a blue wall", ["Color"], 1), ex("a round plate", ["Shape"], 1), ex("a hard text", ["Color"], 2), ex("a deep thought", ["Consciousness"], 3),
    ex("a rule about walls", ["Color"], 1, { k: "statement" }), ex("a poem about walls", ["Color"], 1, { cf: "commentator" }), ex("a wall seen by a master", ["Color"], 1, { bg: "expert" }),
    ex("the hope of the unknown", ["Unheard-of class"], 1), ex("a thing with no class", [], 1),
  ];
  const drawn = (levels: number[], n = 300, avoid?: Set<string>) => {
    const out: Record<string, number> = {};
    for (let s = 0; s < n; s++) { const q = drawPlace(data, items, { levels, rng: seeded(s), avoid }); if (q) out[q.thing.n] = (out[q.thing.n] ?? 0) + 1; }
    return out;
  };
  expect(Object.keys(drawn([1])).sort()).toEqual(["a blue wall", "a round plate"]);
  const two = drawn([1, 2]);
  expect(Object.keys(two).sort()).toEqual(["a blue wall", "a hard text", "a round plate"]);
  expect(two["a hard text"], "a level with one thing is drawn as often as one with two, so that thing twice as often").toBeGreaterThan(two["a blue wall"]);
  expect(Object.keys(drawn(upTo(3))).sort()).toEqual(["a blue wall", "a deep thought", "a hard text", "a round plate"]);
  // a set, not a ceiling
  expect(Object.keys(drawn([2, 3])).sort()).toEqual(["a deep thought", "a hard text"]);
  const skip = drawn([1, 3]);
  expect(Object.keys(skip).sort(), "no level 2").toEqual(["a blue wall", "a deep thought", "a round plate"]);
  expect(skip["a deep thought"], "half of the draws are of level 3").toBeGreaterThan(110);
  expect(skip["a deep thought"]).toBeLessThan(190);
  expect(Object.keys(drawn([1], 100, new Set(["a blue wall"])))).toEqual(["a round plate"]);
  expect(Object.keys(drawn([1], 100, new Set(["a blue wall", "a round plate"]))).sort(), "when all are recent, they are drawn anyway").toEqual(["a blue wall", "a round plate"]);
  expect(drawPlace(data, [], { levels: [1], rng: seeded(1) })).toBeNull();
  expect(drawPlace(data, [items[7], items[8]], { levels: [4], rng: seeded(1) })).toBeNull();
  // the same draw for the same random source; levels that are not 1 to 4 count for nothing, and none left means the default (level 1)
  expect(drawPlace(data, items, { levels: [2], rng: seeded(5) })).toEqual(drawPlace(data, items, { levels: [2], rng: seeded(5) }));
  expect(drawPlace(data, items, { levels: [9], rng: seeded(5) })).toEqual(drawPlace(data, items, { levels: [1], rng: seeded(5) }));
  expect(drawPlace(data, items, { levels: [], rng: seeded(5) })).toEqual(drawPlace(data, items, { levels: [1], rng: seeded(5) }));
  expect(drawPlace(data, items, { levels: [3, -3, 1], rng: seeded(5) })).toEqual(drawPlace(data, items, { levels: [1, 3], rng: seeded(5) }));
});

test("gradePlace: a row is right when ticked exactly if the thing is in the category", () => {
  const q = { thing: wall, rows: placeQuestionRows(ix(), wall, seeded(3))! };
  const yes = q.rows.filter((r) => r.answer).map((r) => r.cat);
  const perfect = gradePlace(q, yes);
  expect(perfect).toMatchObject({ ok: true, right: q.rows.length });
  expect(perfect.rows.every((r) => r.ok && r.picked === r.answer)).toBe(true);
  const none = gradePlace(q, []);
  expect(none.ok).toBe(false);
  expect(none.right).toBe(q.rows.length - yes.length);
  const wrong = q.rows.find((r) => !r.answer)!;
  const over = gradePlace(q, [...yes, wrong.cat]);
  expect(over.right).toBe(q.rows.length - 1);
  expect(over.rows.find((r) => r.cat === wrong.cat)).toMatchObject({ picked: true, ok: false });
  expect(gradePlace(q, [...yes, "not-a-category"]).ok, "an id that is not a row changes nothing").toBe(true);
});

test("placeNarrow: the categories the thing is in, whatever was ticked, with the most specific and its line up; none when there is nothing to narrow", () => {
  const data = ix();
  let asked = 0, skipped = 0;
  for (let s = 0; s < 200; s++) {
    const q = { thing: wall, rows: placeQuestionRows(data, wall, seeded(s))! };
    const yes = q.rows.filter((r) => r.answer);
    const n = placeNarrow(data, q, seeded(s + 1000));
    if (yes.length < 2) { expect(n, "one category applies: nothing to narrow").toBeNull(); skipped++; continue; }
    asked++;
    expect(n!.options.map((r) => r.cat).sort()).toEqual(yes.map((r) => r.cat).sort());
    expect(n!.options.every((r) => r.answer)).toBe(true);
    expect(n!.cat, "a color is the narrowest it can be in this data").toBe("col");
    expect(n!.line.map((x) => x.term)).toEqual(["Color", "External form", "Form", "Functional thing", "Existent"]);
    expect(n!.line.filter((x) => x.option).map((x) => x.term).sort()).toEqual(yes.map((r) => r.term).sort());
    expect(n!.line[0]).toEqual({ term: "Color", phrase: "a color", option: true });
  }
  expect(asked).toBeGreaterThan(20);
  expect(skipped).toBeGreaterThan(5);
  // a thing of two classes is in a category of each: the categories do not lie on one line, so there is nothing to pick
  const mixed = ex("a mixed thing", ["Color", "Consciousness"], 1);
  expect(placeNarrow(data, { thing: mixed, rows: placeRows(data, mixed) }, seeded(1))).toBeNull();
  // a thing that is nowhere has no category to pick
  const horn = ex("the horn of a hare", [], 1, { ne: true });
  expect(placeNarrow(data, { thing: horn, rows: placeRows(data, horn) }, seeded(1))).toBeNull();
  // the order of the options follows the random source
  const q = { thing: wall, rows: placeRows(data, wall) };
  const orders = new Set(Array.from({ length: 30 }, (_, i) => placeNarrow(data, q, seeded(i))!.options.map((r) => r.cat).join()));
  expect(orders.size).toBeGreaterThan(1);
});

test("gradeNarrow: only the most specific one is right, a broader one is true but not the most specific, and says how far up it is", () => {
  const data = ix(), q = { thing: wall, rows: placeRows(data, wall) };
  const n = placeNarrow(data, q, seeded(7))!;
  expect(n.options.length).toBe(4);
  expect(gradeNarrow(n, "col")).toMatchObject({ ok: true, picked: { cat: "col" } });
  const broad = gradeNarrow(n, "form")!;
  expect(broad.ok).toBe(false);
  expect(broad.picked.cat).toBe("form");
  expect(broad.upTo.map((x) => x.term), "from the most specific up to the pick").toEqual(["Color", "External form", "Form"]);
  expect(gradeNarrow(n, "shape"), "a category that was not offered").toBeNull();
  expect(gradeNarrow(n, "nonsense")).toBeNull();
});

test("placeGrade: right when step 1 is all right and step 2 is right or skipped, wrong when no part asked is right", () => {
  expect(placeGrade(true, null)).toBe("ok");
  expect(placeGrade(false, null)).toBe("bad");
  expect(placeGrade(true, true)).toBe("ok");
  expect(placeGrade(true, false)).toBe("part");
  expect(placeGrade(false, true)).toBe("part");
  expect(placeGrade(false, false)).toBe("bad");
});

const run = (lv: number, n: number, ok: boolean) => Array.from({ length: n }, () => ({ lv, ok }));

test("placeLevelUp: five right answers in a row at the highest level on, and the level above it to offer", () => {
  expect(placeLevelUp(run(1, 4, true), [1])).toBeNull();
  expect(placeLevelUp(run(1, 5, true), [1])).toBe(2);
  expect(placeLevelUp([...run(1, 9, true), { lv: 1, ok: false }], [1]), "a miss ends the run").toBeNull();
  expect(placeLevelUp([...run(1, 5, true), { lv: 1, ok: false }, ...run(1, 4, true)], [1]), "four since the miss").toBeNull();
  expect(placeLevelUp([{ lv: 1, ok: false }, ...run(1, 5, true)], [1]), "an earlier miss does not count").toBe(2);
  expect(placeLevelUp([...run(2, 4, true), ...run(1, 3, true), ...run(2, 1, true)], [1, 2]), "a lower level neither extends nor breaks the run").toBe(3);
  expect(placeLevelUp([...run(2, 4, true), ...run(1, 3, false), ...run(2, 1, true)], [1, 2]), "a miss at a lower level does not break it either").toBe(3);
  expect(placeLevelUp([...run(1, 6, true), ...run(2, 4, true)], [1, 2]), "five at the highest level on, not in all").toBeNull();
  expect(placeLevelUp(run(1, 30, true), [1, 2]), "an easier level does not offer").toBeNull();
  expect(placeLevelUp(run(3, 5, true), [1, 3]), "above the highest on, not the next one that is off").toBe(4);
  expect(placeLevelUp(run(4, 30, true), [4]), "nothing above the top").toBeNull();
  expect(placeLevelUp(run(2, 3, true), [2], 3)).toBe(3);
});

test("placeLevelDown: four wrong answers in a row at the highest level on suggest taking it off, never at level 1", () => {
  expect(placeLevelDown(run(2, 3, false), [1, 2])).toBeNull();
  expect(placeLevelDown(run(2, 4, false), [1, 2])).toBe(2);
  expect(placeLevelDown([...run(2, 4, false), { lv: 2, ok: true }], [1, 2]), "a right answer ends the run").toBeNull();
  expect(placeLevelDown([...run(2, 3, false), ...run(1, 2, true), ...run(2, 1, false)], [1, 2]), "a lower level does not break the run").toBe(2);
  expect(placeLevelDown(run(1, 9, false), [1, 2]), "only the highest level on counts").toBeNull();
  expect(placeLevelDown(run(1, 9, false), [1]), "nothing below level 1").toBeNull();
  expect(placeLevelDown(run(3, 4, false), [3])).toBe(3);
  expect(placeLevelDown(run(3, 2, false), [3], 2)).toBe(3);
});

test("over the real categories and made-up examples: every row agrees with placeByClass and has a reason, and the draw is quick", () => {
  const rix = makeIndex(openData as unknown as DrillData);
  const items = (madeUpExamples(openData as never, 400) as unknown as { items: Example[] }).items;
  expect(buildPool(rix).length).toBeGreaterThan(100);
  let asked = 0, narrowed = 0, yesRows = 0, noRows = 0;
  const t0 = performance.now();
  for (let s = 0; s < 400; s++) {
    const q = drawPlace(rix, items, { levels: upTo(1 + (s % 4)), rng: seeded(s) });
    if (!q) continue;
    asked++;
    expect(q.rows.length).toBeGreaterThanOrEqual(3);
    expect(q.rows.length).toBeLessThanOrEqual(6);
    const n = placeNarrow(rix, q, seeded(s + 1));
    const yes = q.rows.filter((r) => r.answer);
    if (n) {
      narrowed++;
      expect(yes.length, q.thing.n).toBeGreaterThanOrEqual(2);
      expect(n.options.length).toBe(yes.length);
      expect(n.options.some((r) => r.cat === n.cat), q.thing.n).toBe(true);
      expect(gradeNarrow(n, n.cat)!.ok).toBe(true);
    } else if ((q.thing.cls ?? []).length === 1) {
      expect(yes.length, `${q.thing.n}: a thing of one class has its categories on one line`).toBeLessThan(2);
    }
    for (const r of q.rows) {
      expect(placeByClass(rix, q.thing, rix.CAT[r.cat]), `${q.thing.n} in ${r.cat}`).toBe(r.answer ? "yes" : "no");
      expect(r.reason, `${q.thing.n} in ${r.cat}`).toBeTruthy();
      if (r.answer) yesRows++;
      else noRows++;
    }
  }
  expect(asked, "the made-up examples do give questions").toBeGreaterThan(300);
  expect(narrowed, "step 2 is asked for a good share of them").toBeGreaterThan(50);
  expect(yesRows).toBeGreaterThan(0);
  expect(noRows).toBeGreaterThan(0);
  expect(performance.now() - t0, "400 draws").toBeLessThan(4000);
});
