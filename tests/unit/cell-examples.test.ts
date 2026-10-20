// The reference examples as references of a practice pair's cells (src/domain/reference.ts witnessesOf and cellExample, the `more` of
// pairOf and nextPair): which examples may stand in a cell, at which level, and that the practice list still decides the relation and
// which cells are empty. Invented data and invented examples only.
import { expect, test } from "vitest";
import { CELLS, makeIndex } from "../../src/ai-shared";
import type { CellId, DrillData } from "../../src/ai-shared";
import { buildPool, cellExample, cellsFor, findPair, makePair, nameThing, nextPair, pairOf, placeByClass, witnessesOf } from "../../src/domain";
import type { Witnesses } from "../../src/domain";
import openData from "../../src/data/drill-data.json";
import { madeUpExamples } from "../../scripts/lib/made-up-course.mjs";

const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const at = () => 1_700_000_000_000;
/** The references of a drawn pair, by cell (a pair from the draw always has them). */
const exOf = (p: { ex?: Partial<Record<CellId, string | null>> }) => p.ex as Partial<Record<CellId, string | null>>;

//   Form excludes Consciousness; External form is a form; Color is an external form. The practice list has a pot (an external form), a
//   shape that is a form but no external one, and a mind: Form against External form is "three possibilities", with nothing in the
//   cell of an external form that is no form.
const ix = () => makeIndex({
  terms: {
    Existent: { name: "Existent", ch: "I" },
    "Functional thing": { name: "Functional thing", ch: "I", parent: "Existent" },
    Form: { name: "Form", ch: "I", parent: "Functional thing", contra: ["Consciousness"] },
    Consciousness: { name: "Consciousness", ch: "I", parent: "Functional thing" },
    "External form": { name: "External form", ch: "I", parent: "Form" },
    Color: { name: "Color", ch: "I", parent: "External form" },
  },
  chains: {},
  cats: [
    { id: "form", kind: "dudra", term: "Form", labels: ["forms"], type: "form" },
    { id: "extf", kind: "dudra", term: "External form", labels: ["external forms"], type: "form" },
    { id: "cons", kind: "dudra", term: "Consciousness", labels: ["consciousnesses"], type: "consciousness" },
  ],
  items: [
    { n: "a clay pot", t: "External form", c: ["form", "extf"] },
    { n: "a feeling of heat", t: "Form", c: ["form"] },
    { n: "a joy", t: "Consciousness", c: ["cons"] },
    { n: "the horn of a rabbit", t: "Existent", c: [], ne: true },
  ],
  bodySkip: [],
});

const ex = (n: string, cls: string[], lv: number, extra: object = {}) => ({ n, cls, lv, cf: "confirmed", k: "thing", ...extra });
const ITEMS = [
  ex("a blue wall", ["Color"], 1),
  ex("a green wall", ["Color"], 3),
  ex("a sense power", ["Form"], 2, { not: ["External form"] }),
  ex("a clay pot", ["Color"], 1), // the practice list has it
  ex("an idea", ["Consciousness"], 1),
  ex("a hope", ["Consciousness"], 2, { cf: "textbook" }),
  ex("a horn of a hare", [], 1, { ne: true }),
  ex("a poem about walls", ["Color"], 1, { cf: "commentator" }),
  ex("a rule about walls", ["Color"], 1, { k: "statement" }),
  ex("a wall and a floor", ["Color"], 1, { k: "combination", f: "combination" }),
  ex("the absence of a wall", ["Color"], 2, { k: "negation" }),
  ex("the cause of a wall", ["Color"], 3, { k: "relation" }),
  ex("a wall seen by a master", ["Color"], 2, { bg: "expert" }),
  ex("a wall in a hard text", ["Color"], 2, { bg: "glossed" }),
  ex("a hope of the unknown class", ["Unheard-of class"], 1),
];
const names = (w: Witnesses, a: string, b: string) => Object.fromEntries(CELLS.map((c) => [c, w(a, b)[c].map((i) => i.n)])) as Record<CellId, string[]>;

test("cellExample: confirmed and textbook, up to the level, of a kind a cell takes, and no expert background", () => {
  const ok = (e: object, lv: number) => cellExample({ cf: "confirmed", lv: 1, ...e }, lv);
  expect(ok({}, 1)).toBe(true);
  expect(ok({ lv: 2 }, 1)).toBe(false);
  expect(ok({ cf: "commentator" }, 4)).toBe(false);
  for (const k of ["thing", "representation", undefined]) expect(ok({ k }, 1), String(k)).toBe(true);
  for (const k of ["statement", "combination", "something else"]) expect(ok({ k }, 4), k).toBe(false);
  for (const k of ["relation", "negation"]) { expect(ok({ k, lv: 2 }, 2), k).toBe(false); expect(ok({ k, lv: 2 }, 3), k).toBe(true); }
  expect(ok({ bg: "expert" }, 4)).toBe(false);
  expect(ok({ bg: "glossed" }, 4)).toBe(true);
});

test("witnessesOf: the examples whose cell is proved for both categories, by level, never the practice list's own", () => {
  const data = ix();
  const w2 = witnessesOf(data, ITEMS, 2);
  // Form (a) against External form (b)
  expect(names(w2, "form", "extf")).toEqual({
    both: ["a blue wall", "a wall in a hard text"],
    anb: ["a sense power"],
    bna: [],
    nei: ["an idea", "a hope", "a horn of a hare"],
  });
  const w3 = names(witnessesOf(data, ITEMS, 3), "form", "extf");
  expect(w3.both).toEqual(["a blue wall", "a green wall", "the absence of a wall", "the cause of a wall", "a wall in a hard text"]);
  expect(names(witnessesOf(data, ITEMS, 1), "form", "extf")).toEqual({ both: ["a blue wall"], anb: [], bna: [], nei: ["an idea", "a horn of a hare"] });
  // the other order of the categories swaps the cells; a category the data does not have gives nothing
  expect(names(w2, "extf", "form").bna).toEqual(["a sense power"]);
  expect(names(w2, "form", "nothing")).toEqual({ both: [], anb: [], bna: [], nei: [] });
});

test("pairOf with references: a cell the practice list fills may show one, a cell it leaves empty stays empty", () => {
  const data = ix();
  const more = witnessesOf(data, ITEMS, 2);
  const seen: Record<CellId, Set<string>> = { both: new Set(), anb: new Set(), bna: new Set(), nei: new Set() };
  for (let s = 0; s < 300; s++) {
    const p = pairOf(data, "form", "extf", "forms", "external forms", seeded(s), at, more);
    expect(p.relation).toBe("3ba");
    expect(exOf(p).bna, "the relation leaves this cell empty").toBeNull();
    expect(p.why?.bna).toBeTruthy();
    for (const c of CELLS) if (exOf(p)[c]) seen[c].add(exOf(p)[c] as string);
  }
  expect([...seen.both].sort()).toEqual(["a blue wall", "a clay pot", "a wall in a hard text"]);
  expect([...seen.anb].sort()).toEqual(["a feeling of heat", "a sense power"]);
  expect([...seen.nei].sort(), "the neither cell prefers an existent: no non-existent while one exists").toEqual(["a hope", "a joy", "an idea"]);

  // a reference in a cell the list leaves empty does not fill it
  const stray: Witnesses = () => ({ both: [], anb: [], bna: [{ n: "a stray" }], nei: [] });
  for (let s = 0; s < 40; s++) expect(exOf(pairOf(data, "form", "extf", "forms", "external forms", seeded(s), at, stray)).bna).toBeNull();
});

test("pairOf without references, or with none that fit, draws as it always did", () => {
  const data = ix();
  const none: Witnesses = () => ({ both: [], anb: [], bna: [], nei: [] });
  for (let s = 0; s < 30; s++) {
    const plain = pairOf(data, "form", "cons", "forms", "consciousnesses", seeded(s), at);
    expect(pairOf(data, "form", "cons", "forms", "consciousnesses", seeded(s), at, none)).toEqual(plain);
    expect(pairOf(data, "form", "cons", "forms", "consciousnesses", seeded(s), at, undefined)).toEqual(plain);
  }
});

test("makePair, nextPair and findPair pass the references on", () => {
  const data = ix();
  const more = witnessesOf(data, ITEMS, 2);
  const drawn = new Set<string>();
  for (let s = 0; s < 200; s++) {
    const p = makePair(data, { a: "form", b: "extf", r: "3" }, seeded(s), at, more);
    for (const c of CELLS) if (exOf(p)[c]) drawn.add(exOf(p)[c] as string);
  }
  expect(drawn.has("a blue wall")).toBe(true);
  const pool = buildPool(data);
  const viaNext = new Set<string>();
  for (let s = 0; s < 300; s++) {
    const p = nextPair(data, pool, { hist: [], recent: [], rng: seeded(s), now: at, more });
    for (const c of CELLS) if (exOf(p)[c]) viaNext.add(exOf(p)[c] as string);
  }
  expect(viaNext.has("a sense power") || viaNext.has("a blue wall")).toBe(true);
  expect([...viaNext].some((n) => ITEMS.some((i) => i.n === n && i.lv > 2)), "nothing above the chosen level").toBe(false);
  const found = new Set<string>();
  for (let s = 0; s < 200; s++) {
    const p = findPair(data, "3ab", nameThing(data, "forms"), nameThing(data, "external forms"), seeded(s), at, more);
    for (const c of CELLS) if (exOf(p)[c]) found.add(exOf(p)[c] as string);
  }
  expect(found.has("a blue wall")).toBe(true);
  expect(cellsFor(data, "form", "extf").bna).toEqual([]);
});

test("over the real pairs and made-up examples: only the cells the list fills are filled, and each reference is proved for its cell", () => {
  const rix = makeIndex(openData as unknown as DrillData);
  const items = (madeUpExamples(openData as never, 400) as unknown as { items: { n: string; cls?: string[]; lv: number }[] }).items;
  const more = witnessesOf(rix, items as never, 3);
  const listed = new Set(rix.DATA.items.map((i) => i.n));
  let fromExamples = 0;
  for (const e of buildPool(rix)) {
    for (let s = 0; s < 4; s++) {
      const p = makePair(rix, e, seeded(s * 131 + 7), at, more);
      const cells = cellsFor(rix, p.catA as string, p.catB as string);
      for (const c of CELLS) {
        expect(exOf(p)[c] === null, `${e.a}|${e.b} ${c}`).toBe(!cells[c].length);
        const n = exOf(p)[c];
        if (!n || listed.has(n)) continue;
        const it = items.find((i) => i.n === n)!;
        expect(it, n).toBeTruthy();
        fromExamples++;
        const x = placeByClass(rix, it as never, rix.CAT[p.catA as string]), y = placeByClass(rix, it as never, rix.CAT[p.catB as string]);
        expect(x && y ? (x === "yes" ? (y === "yes" ? "both" : "anb") : y === "yes" ? "bna" : "nei") : null, `${n} in ${p.catA}|${p.catB}`).toBe(c);
      }
    }
  }
  expect(fromExamples, "the made-up examples do reach cells").toBeGreaterThan(0);
});
