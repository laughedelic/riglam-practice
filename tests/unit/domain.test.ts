// src/domain: pairs, grading and Claude's verdicts as functions of the term data. Made-up data for the rules, the real
// open data for the properties that must hold for every pair the page can draw, and a check that the code stays free
// of the page and the browser.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "vitest";
import { CELLS, REL, makeIndex, refOf } from "../../src/ai-shared";
import type { CellId, DrillData, RelKey } from "../../src/ai-shared";
import {
  FEATURE, RECENT_MAX, applyVerdicts, factNote, fitOf, buildPool, cellsFor, chooseEntry, deriveRel, grade, gradeDebate, gradeOf, inUniverse, isMiss, judgeText, makePair,
  nextPair, pairKey, parseFactLine, parseVerdicts, pick, relOfCells, summarize, termLine,
} from "../../src/domain";
import type { DebateInput, GradeDraft, HistoryEntry, Pair, PoolEntry } from "../../src/domain";
import openData from "../../src/data/drill-data.json";

/** A small deterministic random source (mulberry32), so a test draws the same numbers every time. */
const seeded = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// ---- made-up data with known relations ----
//   form and matter hold the same things (mutually inclusive); wood is inside form; thing holds everything that is
//   anything; form and mind share nothing; wood and gray overlap.
const data = (): DrillData => ({
  terms: {},
  chains: { Form: ["Form", "Impermanent", "Existent", "Thing"], Mind: ["Mind", "Thing"], Person: ["Person", "Thing"] },
  cats: [
    { id: "form", kind: "dudra", term: "Form", labels: ["forms", "bodies"], type: "form: what has shape" },
    { id: "matter", kind: "dudra", term: "Form", labels: ["matter"], type: "matter" },
    { id: "mind", kind: "dudra", term: "Mind", labels: ["minds"], type: "mind" },
    { id: "wooden", kind: "everyday", labels: ["wooden things"], type: "form: things made of wood" },
    { id: "gray", kind: "everyday", labels: ["gray things"], type: "form: things that are gray" },
    { id: "thing", kind: "dudra", term: "Thing", labels: ["things", "existents"], type: "thing" },
    { id: "snd", kind: "dudra", term: "Sound", labels: ["sounds"], type: "sound", sense: true },
    { id: "plain", kind: "everyday", labels: ["plain things"], type: "form", sense: true },
  ],
  items: [
    { n: "a wooden chair", t: "Form", c: ["form", "matter", "wooden", "thing"] },
    { n: "a gray wooden table", t: "Form", c: ["form", "matter", "wooden", "gray", "thing"] },
    { n: "a gray stone", t: "Form", c: ["form", "matter", "gray", "thing"] },
    { n: "a gray cloud", t: "Form", c: ["form", "matter", "gray", "thing"] },
    { n: "a thought", t: "Mind", c: ["mind", "thing"] },
    { n: "your neighbor", t: "Person", c: ["thing"] },
    { n: "the sound of rain", t: "Form", c: ["form", "matter", "thing", "snd"], comp: true },
    { n: "your own hand", t: "Form", c: ["form", "matter", "thing"], body: true },
    { n: "the horn of a rabbit", t: "Non-existent", c: [], ne: true },
  ],
  bodySkip: ["mind"],
  nopair: [["gray", "wooden"]],
  aliases: {},
});
const ix = makeIndex(data());

const names = (xs: { n: string }[]) => xs.map((i) => i.n);

test("which relation two categories have follows from the items in the four cells", () => {
  const rel = (a: string, b: string) => relOfCells(cellsFor(ix, a, b));
  expect(rel("form", "mind")).toBe("con");
  expect(rel("form", "matter")).toBe("mi");
  expect(rel("wooden", "form")).toBe("3ab"); // everything wooden is a form, not the reverse
  expect(rel("form", "wooden")).toBe("3ba");
  expect(rel("wooden", "gray")).toBe("4");
  expect(rel("form", "thing")).toBe("3ab");
  const c = cellsFor(ix, "wooden", "gray");
  expect(names(c.both)).toEqual(["a gray wooden table"]);
  expect(names(c.anb)).toEqual(["a wooden chair"]);
  expect(names(c.bna)).toEqual(["a gray stone", "a gray cloud"]);
  expect(names(c.nei)).toEqual(["a thought", "your neighbor", "the sound of rain", "your own hand", "the horn of a rabbit"]);
});

test("a sense-object item is left out for the sense categories, and a body item where the body is skipped", () => {
  const item = (n: string) => ix.DATA.items.find((i) => i.n === n)!;
  expect(inUniverse(ix, item("the sound of rain"), "form", "snd")).toBe(false);
  expect(inUniverse(ix, item("the sound of rain"), "form", "mind")).toBe(true);
  expect(inUniverse(ix, item("your own hand"), "form", "mind")).toBe(false);
  expect(inUniverse(ix, item("your own hand"), "form", "wooden")).toBe(true);
  expect(FEATURE.has("wooden")).toBe(true);
});

test("the pool has one entry per pair of categories, none that are listed as no-pair, and one per category with two labels", () => {
  const pool = buildPool(ix);
  const key = (e: PoolEntry) => pairKey(e);
  expect(pool.map(key)).not.toContain("gray|wooden"); // listed in nopair
  expect(pool.map(key)).not.toContain("plain|wooden"); // an everyday category beside a sense one
  expect(pool.find((e) => key(e) === "form|mind")?.r).toBe("con");
  expect(pool.find((e) => e.a === "form" && e.b === "matter")?.r).toBe("mi");
  expect(pool.find((e) => e.a === "form" && e.b === "wooden")?.r).toBe("3"); // either direction of three possibilities
  expect(pool.find((e) => e.a === "form" && e.b === "form")).toEqual({ a: "form", b: "form", r: "mi" }); // two labels of one category
  expect(pool.find((e) => e.a === "matter" && e.b === "matter")).toBeUndefined(); // one label only
});

test("a pair has the relation of its categories, an example for each cell that has one, and a reason for each that has none", () => {
  const rng = seeded(1);
  for (const cand of buildPool(ix)) {
    const p = makePair(ix, cand, rng);
    const cells = cellsFor(ix, p.catA as string, p.catB as string);
    expect(p.relation, pairKey(cand)).toBe(relOfCells(cells));
    expect(p.generated).toBe(true);
    expect(p.id).toMatch(/^g-/);
    for (const c of CELLS) {
      if (p.ex?.[c]) expect(names(cells[c]), `${pairKey(cand)} ${c}`).toContain(p.ex[c]);
      else expect(p.why?.[c], `${pairKey(cand)} ${c} has no example and no reason`).toBeTruthy();
    }
    expect(p.note).toBeTruthy();
    expect(JSON.stringify(p)).not.toMatch(/undefined|NaN/);
  }
});

test("a pair of the two labels of one category uses both labels; otherwise either order and one label of each", () => {
  const same = makePair(ix, { a: "form", b: "form", r: "mi" }, seeded(3));
  expect(new Set([same.a, same.b])).toEqual(new Set(["forms", "bodies"]));
  const orders = new Set<string>();
  for (let s = 0; s < 40; s++) { const p = makePair(ix, { a: "form", b: "mind", r: "con" }, seeded(s)); orders.add(p.catA + ">" + p.catB); }
  expect(orders).toEqual(new Set(["form>mind", "mind>form"]));
});

test("the same random numbers and the same clock give the same pair, id included", () => {
  const at = () => 1_700_000_000_000;
  const a = makePair(ix, { a: "wooden", b: "gray", r: "4" }, seeded(9), at), b = makePair(ix, { a: "wooden", b: "gray", r: "4" }, seeded(9), at);
  expect(a).toEqual(b);
  expect(a.id).toMatch(/^g-[0-9a-z]+$/);
});

// ---- the draw of the next pair ----

const pool = buildPool(ix);
const miss = (a: string, b: string, key: RelKey = "con"): HistoryEntry => ({ key, catA: a, catB: b, grade: "bad" });

test("the draw keeps the relations mixed: one seen eight times in a row comes up much less than the others", () => {
  const hist: HistoryEntry[] = Array.from({ length: 8 }, () => ({ key: "mi", catA: "form", catB: "matter", grade: "ok" }));
  const count: Record<string, number> = {};
  const rng = seeded(5);
  for (let i = 0; i < 600; i++) { const c = chooseEntry(ix, pool, { hist, recent: [], rng }); count[c.r] = (count[c.r] || 0) + 1; }
  expect(count.mi).toBeLessThan(count.con / 2);
  expect(count.mi).toBeLessThan(count["3"] / 2);
  expect(count["4"]).toBeUndefined(); // the fixture has no pair with four possibilities (the one that would is listed as no-pair)
  expect(count.mi).toBeGreaterThan(0); // the weight has a floor, so no relation disappears
});

test("a relation that has no pair in the pool is never chosen; an empty pool is an error", () => {
  const rng = seeded(4), seen = new Set<string>();
  for (let i = 0; i < 200; i++) seen.add(chooseEntry(ix, pool, { hist: [], recent: [], rng }).r);
  expect([...seen].sort()).toEqual(["3", "con", "mi"]);
  expect(() => chooseEntry(ix, [], { hist: [], recent: [], rng })).toThrow(/no pair/);
});

test("an answer without a relation does not break the draw", () => {
  const rng = seeded(6), seen = new Set<string>();
  for (let i = 0; i < 100; i++) seen.add(chooseEntry(ix, pool, { hist: [{ catA: "form", catB: "mind" }, { key: "nonsense", grade: "bad" }], recent: [], rng }).r);
  expect(seen.size).toBeGreaterThan(1);
});

test("pairs the learner got wrong lately come up more often", () => {
  // the two labels of wooden things were mixed up twice (another relation, so con stays as likely as before), which counts against wooden things only
  const hist = [miss("wooden", "wooden", "mi"), miss("wooden", "wooden", "mi")];
  const rng = seeded(8);
  let weak = 0, plain = 0;
  for (let i = 0; i < 600; i++) {
    const c = chooseEntry(ix, pool, { hist, recent: [], rng });
    if (pairKey(c) === "mind|wooden") weak++; else if (pairKey(c) === "form|snd") plain++;
  }
  expect(weak).toBeGreaterThan(plain * 2);
});

test("a pair drawn lately is drawn again much less often", () => {
  const rng = seeded(10);
  let fresh = 0, again = 0;
  for (let i = 0; i < 600; i++) {
    const c = chooseEntry(ix, pool, { hist: [], recent: ["mind|wooden"], rng });
    if (pairKey(c) === "mind|wooden") again++; else if (pairKey(c) === "form|snd") fresh++;
  }
  expect(again * 4).toBeLessThan(fresh);
});

test("hidden pairs are not drawn, unless every pair of the chosen relation is hidden", () => {
  const rng = seeded(12);
  const hidden = (c: PoolEntry) => pairKey(c) === "form|mind";
  for (let i = 0; i < 300; i++) expect(pairKey(chooseEntry(ix, pool, { hist: [], recent: [], isHidden: hidden, rng }))).not.toBe("form|mind");
  const conPairs = pool.filter((e) => e.r === "con");
  expect(conPairs.length).toBeGreaterThan(1);
  const allCon = (c: PoolEntry) => c.r === "con";
  const drawn = new Set<string>();
  for (let i = 0; i < 300; i++) drawn.add(chooseEntry(ix, pool, { hist: [], recent: [], isHidden: allCon, rng }).r);
  expect(drawn.has("con")).toBe(true); // the skips give way when nothing else of that relation is left
});

test("the next pair is remembered, and only the last RECENT_MAX are kept", () => {
  const recent: string[] = [], rng = seeded(14);
  for (let i = 0; i < RECENT_MAX + 5; i++) {
    const p = nextPair(ix, pool, { hist: [], recent, rng });
    expect(recent[recent.length - 1]).toBe(pairKey({ a: p.catA as string, b: p.catB as string }));
  }
  expect(recent).toHaveLength(RECENT_MAX);
});

test("nextPair is reproducible from the random numbers and the clock alone", () => {
  const at = () => 1_700_000_000_000;
  const draw = () => nextPair(ix, pool, { hist: [], recent: [], rng: seeded(21), now: at });
  expect(draw()).toEqual(draw());
});

// ---- grading ----

const pair = (extra: Partial<Pair> = {}): Pair => ({
  id: "g-test", a: "wooden things", b: "gray things", catA: "wooden", catB: "gray", typeA: "form", typeB: "form", relation: "4",
  ex: { both: "a gray wooden table", anb: "a wooden chair", bna: "a gray stone", nei: "a thought" }, why: {}, ...extra,
});
const cellsOf = (t: Partial<Record<CellId, string>>, none: CellId[] = []) =>
  Object.fromEntries(CELLS.map((c) => [c, { t: t[c] || "", none: none.includes(c) }])) as Record<CellId, { t: string; none: boolean }>;
const perfect = { both: "a gray wooden table", anb: "a wooden chair", bna: "a gray stone", nei: "a thought" };

test("a right relation and right examples are ok in every cell", () => {
  const r = grade(ix, pair(), { rel: "4", cells: cellsOf(perfect) });
  expect(r.overall).toBe("ok");
  expect(r.relOk).toBe(true);
  expect(CELLS.map((c) => r.cells[c].v)).toEqual(["ok", "ok", "ok", "ok"]);
  expect(r.cells.both.msg[0]).toBe("Right. ");
  expect(r.cells.both.msg[1]).toBe("A gray wooden table: formimpermanentexistent.");
  expect([r.occBad, r.exBad, r.exOpen, r.exN]).toEqual([0, 0, 0, 4]);
  expect(Object.keys(r)).toEqual(["relOk", "cells", "occBad", "exBad", "exOpen", "exN", "overall"]);
});

test("the answer is case-insensitive, ignores an article and a closing mark", () => {
  const r = grade(ix, pair(), { rel: "4", cells: cellsOf({ ...perfect, anb: "A WOODEN CHAIR!", nei: "thought" }) });
  expect(r.overall).toBe("ok");
});

test("a wrong relation is bad, though the cells are still checked", () => {
  const r = grade(ix, pair(), { rel: "mi", cells: cellsOf(perfect, ["anb", "bna"]) });
  expect(r.overall).toBe("bad");
  expect(r.relOk).toBe(false);
  expect(r.cells.anb.v).toBe("bad"); // marked empty, but a wooden chair is in it
  expect(r.cells.anb.msg).toEqual(["Counter-example: ", "a wooden chair"]);
  expect(r.occBad).toBe(2);
});

test("time running out on the relation counts as wrong, even for the right one", () => {
  const r = grade(ix, pair(), { rel: "4", late: true, cells: cellsOf(perfect) });
  expect(r.relOk).toBe(false);
  expect(r.overall).toBe("bad");
});

test("an example in the wrong cell is bad and says where it belongs", () => {
  const r = grade(ix, pair(), { rel: "4", cells: cellsOf({ ...perfect, anb: "a gray stone" }) });
  expect(r.overall).toBe("part");
  expect(r.cells.anb.v).toBe("bad");
  expect(r.cells.anb.msg[0]).toBe("Belongs elsewhere. ");
  expect(r.cells.anb.msg[1]).toBe("A gray stone is B but not A (formimpermanentexistent). Example: a wooden chair.");
  expect(r.exBad).toBe(1);
});

test("an example the data does not know stays open, and the grade is pending", () => {
  const r = grade(ix, pair(), { rel: "4", cells: cellsOf({ ...perfect, bna: "a gray dragon" }) });
  expect(r.cells.bna).toEqual({ v: "cmp", msg: ["Not checked. ", "Reference: a gray stone."], kind: "ex" });
  expect([r.exOpen, r.overall]).toEqual([1, "pend"]);
});

test("a missing example, an example in an empty cell, and an empty cell marked empty", () => {
  const p = pair({ relation: "3ab", ex: { both: "a gray wooden table", anb: null, bna: "a gray stone", nei: "a thought" }, why: { anb: "Whatever is wooden is gray." } });
  const r = grade(ix, p, { rel: "4", cells: cellsOf({ both: "", anb: "a wooden chair", bna: "a gray stone", nei: "a thought" }) });
  expect(r.cells.both).toEqual({ v: "bad", msg: ["Missing. For example: ", "a gray wooden table"], kind: "occ" });
  expect(r.cells.anb).toEqual({ v: "bad", msg: ["Nothing can go here. ", "Whatever is wooden is gray."], kind: "occ" });
  const empty = grade(ix, p, { rel: "3ab", cells: cellsOf({ both: "a gray wooden table", bna: "a gray stone", nei: "a thought" }) });
  expect(empty.cells.anb).toEqual({ v: "ok", msg: ["Right, empty. ", "Whatever is wooden is gray."], kind: "occ" }); // the relation implies it
  expect(empty.overall).toBe("ok");
});

test("the neither cell always has an answer: a non-existent such as the horn of a rabbit", () => {
  const p = pair({ ex: { both: "a gray wooden table", anb: "a wooden chair", bna: "a gray stone", nei: null } });
  expect(refOf(p, "nei")).toBe("the horn of a rabbit");
  const r = grade(ix, p, { rel: "4", cells: cellsOf({ ...perfect, nei: "the horn of a rabbit" }) });
  expect(r.cells.nei.v).toBe("ok");
  expect(r.cells.nei.msg).toEqual(["Right. ", "The horn of a rabbit does not exist, and a non-existent counts as neither."]);
  const better = grade(ix, pair(), { rel: "4", cells: cellsOf({ ...perfect, nei: "the horn of a rabbit" }) });
  expect(better.cells.nei.msg[1]).toBe("The horn of a rabbit does not exist, and a non-existent counts as neither. An existent such as a thought is the better example when there is one.");
});

test("grading needs a relation", () => {
  expect(() => grade(ix, pair(), { rel: null, cells: cellsOf({}) })).toThrow(/no relation/);
});

test("an alias does not settle a feature: wooden, metal, white and the like need the exact name", () => {
  const d = data();
  d.aliases = { chair: "a wooden chair", stone: "a gray stone" };
  const aix = makeIndex(d);
  expect(judgeText(aix, pair(), "anb", "chair")).toBeNull(); // wood is a feature category
  expect(judgeText(aix, pair({ catA: "form", catB: "gray", a: "forms" }), "both", "stone")?.v).toBe("ok"); // neither category is a feature
});

test("judging an example needs known categories; labels are enough for older pairs", () => {
  expect(judgeText(ix, { a: "wooden things", b: "gray things", relation: "4", ex: {} }, "both", "a gray wooden table")?.v).toBe("ok");
  expect(judgeText(ix, { a: "zzz", b: "yyy", relation: "4" }, "both", "a gray wooden table")).toBeNull();
  expect(judgeText(ix, { a: "forms", b: "forms", catA: "form", catB: "form", relation: "mi" }, "both", "a gray stone")).toBeNull(); // not two categories
  expect(judgeText(ix, pair(), "both", "a thing nobody listed")).toBeNull();
  expect(judgeText(ix, pair({ catA: "form", catB: "snd" }), "both", "the sound of rain")).toBeNull(); // a sense-object item, for a sense category
});

test("the chain of a type is shortened to three terms, lower case, or the type itself", () => {
  expect(termLine(ix, "Form")).toBe("formimpermanentexistent");
  expect(termLine(ix, "Person")).toBe("personthing");
  expect(termLine(ix, "Nothing Known")).toBe("nothing known");
});

const dAns = (...a: ({ say: "accept" | "why" | null; text?: string; timeout?: boolean })[]) => a;

test("the debate: accepting a question with no counter-example, or giving the example, is right", () => {
  const p = pair({ relation: "3ab", ex: { both: "a gray wooden table", anb: null, bna: "a gray stone", nei: "a thought" }, why: { anb: "Whatever is wooden is gray." } });
  const u: DebateInput = { rel: "3ab", ans: dAns({ say: "why", text: "a gray wooden table" }, { say: "accept" }, { say: "why", text: "A gray stone" }, { say: "why", text: "a thought" }) };
  const r = gradeDebate(ix, p, u);
  expect(r.implied).toBe("3ab");
  expect(r.overall).toBe("ok");
  expect(r.dec).toEqual({ both: true, anb: true, bna: true, nei: true });
  expect(r.cells.anb.msg).toEqual(["Right. ", "Whatever is wooden is gray."]);
  expect(r.cells.both.kind).toBe("ex");
  expect(r.cells.anb.kind).toBe("occ");
});

test("the debate: the three kinds of mistake, and time running out", () => {
  const p = pair({ relation: "3ab", ex: { both: "a gray wooden table", anb: null, bna: "a gray stone", nei: "a thought" }, why: { anb: "Whatever is wooden is gray." } });
  const r = gradeDebate(ix, p, {
    rel: "3ab",
    ans: dAns({ say: "accept" }, { say: "why", text: "a wooden chair" }, { say: "why", text: "", timeout: true }, { say: null }),
  });
  expect(r.cells.both).toEqual({ v: "bad", msg: ["Counter-example: ", "a gray wooden table"], kind: "occ" });
  expect(r.cells.anb).toEqual({ v: "bad", msg: ["Nothing can be posited. ", "Whatever is wooden is gray."], kind: "occ" });
  expect(r.cells.bna).toEqual({ v: "bad", msg: ["Time ran out. ", "For example: a gray stone."], kind: "ex" });
  expect(r.cells.nei).toEqual({ v: "bad", msg: ["Time ran out. ", "For example: a thought."], kind: "occ" });
  expect(r.dec).toEqual({ both: false, anb: false, bna: true, nei: false });
  expect(r.implied).toBe("con"); // accepted Q1, then two examples
});

test("the debate: an unknown example stays open, a wrong one says where it belongs", () => {
  const r = gradeDebate(ix, pair(), { rel: "4", ans: dAns({ say: "why", text: "a gray dragon" }, { say: "why", text: "a gray stone" }, { say: "why", text: "a gray stone" }, { say: "why", text: "a thought" }) });
  expect(r.cells.both.v).toBe("cmp");
  expect(r.cells.anb.v).toBe("bad");
  expect(r.cells.anb.msg[1]).toBe("A gray stone is B but not A (formimpermanentexistent). Example: a wooden chair.");
  expect(r.cells.bna.v).toBe("ok");
  expect([r.exOpen, r.overall]).toEqual([1, "part"]);
});

test("what three answers imply", () => {
  const A = { say: "accept" as const }, W = { say: "why" as const }, N = { say: null };
  expect(deriveRel([A, W, W, W])).toBe("con");
  expect(deriveRel([W, A, A, W])).toBe("mi");
  expect(deriveRel([W, A, W, W])).toBe("3ab");
  expect(deriveRel([W, W, A, W])).toBe("3ba");
  expect(deriveRel([W, W, W, W])).toBe("4");
  expect(deriveRel([A, A, W, W])).toBe("bad"); // no common locus together with a pervasion
  expect(deriveRel([A, A, A, W])).toBe("bad");
  expect(deriveRel([A, W, N, W])).toBeNull();
  expect(deriveRel([W, W, W, N])).toBe("4"); // the fourth answer does not enter
});

test("summarize counts the cells and chooses the overall grade, changing the object it is given", () => {
  const cell = (v: string, kind: "occ" | "ex") => ({ v, kind, msg: [] as string[] });
  const draft = (relOk: boolean, cells: [string, "occ" | "ex"][]): GradeDraft => ({ relOk, cells: Object.fromEntries(CELLS.map((c, i) => [c, cell(...cells[i])])) as GradeDraft["cells"] });
  const d = draft(true, [["ok", "ex"], ["ok", "occ"], ["cmp", "ex"], ["ok", "occ"]]);
  const out = summarize(d);
  expect(out).toBe(d);
  expect([out.occBad, out.exBad, out.exOpen, out.exN, out.overall]).toEqual([0, 0, 1, 2, "pend"]);
  expect(summarize(draft(true, [["bad", "occ"], ["ok", "ex"], ["cmp", "ex"], ["ok", "occ"]])).overall).toBe("part"); // a wrong cell outranks an open one
  expect(summarize(draft(true, [["ok", "ex"], ["bad", "ex"], ["ok", "ex"], ["ok", "ex"]])).overall).toBe("part");
  expect(summarize(draft(false, [["ok", "ex"], ["ok", "ex"], ["ok", "ex"], ["ok", "ex"]])).overall).toBe("bad");
  expect(summarize(draft(true, [["ok", "occ"], ["ok", "occ"], ["ok", "occ"], ["ok", "occ"]])).overall).toBe("ok");
});

// ---- Claude's verdicts ----

test("the tutor's lines are read in several forms, and everything else is ignored", () => {
  const text = [
    "Both: a gray wooden table is gray and wooden => yes",
    "- **A not B**: a wooden chair => no.",
    "• q3: a gray dragon => unsure",
    "Neither: a thought => YES!",
    "Common locus: there is none => yes",
    "Q5: not a question => yes",
    "Both: no verdict at all",
    "",
  ].join("\n");
  expect(parseVerdicts(text)).toEqual([
    { cell: "both", answer: "yes" }, { cell: "anb", answer: "no" }, { cell: "bna", answer: "unsure" }, { cell: "nei", answer: "yes" },
  ]);
  expect(parseVerdicts(null)).toEqual([]);
  expect(parseVerdicts("")).toEqual([]);
});

test("verdicts settle only the cells that are still open, and the grade is counted again", () => {
  const p = pair();
  const res = grade(ix, p, { rel: "4", cells: cellsOf({ ...perfect, both: "a gray dragon", bna: "a gray ghost", nei: "a thought" }) });
  expect(res.overall).toBe("pend");
  const n = applyVerdicts(p, res, parseVerdicts("Both: x => yes\nA not B: y => no\nB not A: z => unsure"));
  expect(n).toBe(2); // the A-not-B cell was already settled by the data
  expect(res.cells.both).toEqual({ v: "ok", msg: ["Verified", "", "by Claude"], kind: "ex", uns: false, by: "claude" });
  expect(res.cells.anb.v).toBe("ok");
  expect(res.cells.bna).toMatchObject({ v: "cmp", uns: true, by: "claude" });
  expect(res.cells.bna.msg).toEqual(["Unsure. ", "Claude could not settle it; see below. Reference: a gray stone."]);
  expect(res.overall).toBe("pend"); // one still open
  expect(applyVerdicts(p, res, [{ cell: "bna", answer: "no" }])).toBe(1);
  expect(res.cells.bna).toMatchObject({ v: "bad", msg: ["Does not fit", ". Example: a gray stone.", "by Claude"], uns: false });
  expect([res.exBad, res.exOpen, res.overall]).toEqual([1, 0, "part"]);
  expect(applyVerdicts(p, res, parseVerdicts("Both: x => no"))).toBe(0);
  expect(res.cells.both.v).toBe("ok");
});

// A line with the two facts about an example (is it A, is it B) is read as a fact line, and the cell it fits is drawn from the facts,
// so a reason about the wrong term cannot make a wrong verdict.
test("a fact line is read as two facts, and the verdict is what the facts give for the cell", () => {
  const line = (cell: string, a: string, b: string) => `${cell}: "a banana" | A ${a}: It is a thing you can eat. | B ${b}: It is not an internal form, because it is not in a person's continuum.`;
  expect(parseFactLine(line("Q2", "yes", "no"))).toEqual({
    label: "Q2", cell: "anb", example: "a banana",
    a: { answer: "yes", say: "It is a thing you can eat." }, b: { answer: "no", say: "It is not an internal form, because it is not in a person's continuum." },
  });
  expect(parseFactLine("- **Both**: “a cup” | a yes: x | b yes: y")?.cell).toBe("both");
  expect(parseFactLine("Both: a cup => yes")).toBeNull();
  expect(parseFactLine("Both: a cup | A maybe: x | B yes: y")).toBeNull();
  const q = { both: "Q1", anb: "Q2", bna: "Q3", nei: "Q4" };
  const fit = (cell: CellId, a: string, b: string) => fitOf(parseFactLine(line(q[cell], a, b))!);
  expect([fit("both", "yes", "yes"), fit("anb", "yes", "no"), fit("bna", "no", "yes"), fit("nei", "no", "no")]).toEqual(["yes", "yes", "yes", "yes"]);
  expect([fit("both", "yes", "no"), fit("anb", "yes", "yes"), fit("bna", "yes", "yes"), fit("nei", "no", "yes")]).toEqual(["no", "no", "no", "no"]);
  expect([fit("both", "yes", "unsure"), fit("nei", "unsure", "unsure"), fit("anb", "no", "unsure")]).toEqual(["unsure", "unsure", "no"]); // one fact that contradicts the cell settles it
  // the verdict lines of both forms are read in order
  expect(parseVerdicts([line("Q2", "yes", "no"), "Both: a cup => no", line("Q4", "no", "yes")].join("\n"))).toEqual([
    { cell: "anb", answer: "yes" }, { cell: "both", answer: "no" }, { cell: "nei", answer: "no" },
  ]);
});

// The note writes each fact as a consequence in the debate's form, "Take S, it follows it is P, because R", with the example as S and
// the term as P, and draws the conclusion from the facts.
test("the note for a fact line is a consequence per term and a conclusion, for a Why? example and for an accepted question", () => {
  const terms = { a: "a memory", b: "a mind" };
  const f = parseFactLine('Q1: "the memory of a holiday" | A yes: it is a mental consciousness that remembers. | B yes: a mental consciousness')!;
  expect(factNote(f, false, terms).split("\n")).toEqual([
    "Take the memory of a holiday, it follows it is a memory, because it is a mental consciousness that remembers.",
    "Take the memory of a holiday, it follows it is a mind, because it is a mental consciousness.",
    "So it fits.",
  ]);
  expect(factNote(f, true, terms).split("\n")[0]).toBe("You accepted Q1, but there is a counter-example: the memory of a holiday.");
  // a reason for the reason becomes one more consequence
  const chain = parseFactLine('Q3: "hearing music" | A no: It is not a consciousness that remembers | B yes: it is an ear consciousness <= it is a consciousness that knows a sound')!;
  expect(factNote(chain, false, terms).split("\n")).toEqual([
    "Take hearing music, it follows it is not a memory, because it is not a consciousness that remembers.",
    "Take hearing music, it follows it is a mind, because it is an ear consciousness.",
    "Take hearing music, it follows it is an ear consciousness, because it is a consciousness that knows a sound.",
    "So it fits.",
  ]);
  const off = parseFactLine('Q2: "a rock" | A no: it is a form | B no: it is a form')!;
  expect(factNote(off, false, terms).split("\n").at(-1)).toBe("So it does not fit.");
  expect(factNote(off, true, terms).split("\n").at(-1)).toBe("So it does not fit the cell of Q2 and is not a counter-example.");
  const unsure = parseFactLine('Both: "a dream" | A yes: it is a mental consciousness | B unsure: the sources differ')!;
  expect(factNote(unsure, false, terms).split("\n").slice(1)).toEqual([
    "Take a dream: whether it is a mind is not settled: the sources differ.",
    "Claude is unsure whether it fits.",
  ]);
});

// ---- small helpers ----

test("pick draws one of the choices from the given random source; grades of old answers read as before", () => {
  expect(pick(["a", "b", "c"], () => 0)).toBe("a");
  expect(pick(["a", "b", "c"], () => 0.999)).toBe("c");
  expect(gradeOf({ grade: "part" })).toBe("part");
  expect(gradeOf({ correct: true })).toBe("ok");
  expect(gradeOf({ correct: false })).toBe("bad");
  expect(gradeOf(null)).toBe("");
  expect([isMiss({ grade: "bad" }), isMiss({ grade: "part" }), isMiss({ grade: "ok" }), isMiss({ correct: false }), isMiss(undefined)]).toEqual([true, true, false, true, false]);
});

// ---- the real open data ----

const real = openData as unknown as DrillData;
const rix = makeIndex(real);
const realPool = buildPool(rix);

test("every category of the real data is in the pool, and the relations of the pool follow its items", () => {
  const inPool = new Set(realPool.flatMap((e) => [e.a, e.b]));
  expect(real.cats.filter((c) => !inPool.has(c.id)).map((c) => c.id), "categories that are never drawn").toEqual([]);
  expect(new Set(realPool.map((e) => e.r))).toEqual(new Set(["mi", "con", "3", "4"]));
  for (const e of realPool.filter((e) => e.a !== e.b)) {
    const r = relOfCells(cellsFor(rix, e.a, e.b));
    expect(e.r, pairKey(e)).toBe(r === "3ab" || r === "3ba" ? "3" : r);
  }
});

test("for every pair the page can draw, the right answer is ok in practice and in the debate", () => {
  const rng = seeded(2024);
  for (const e of realPool) {
    const p = makePair(rix, e, rng);
    expect(JSON.stringify(p), pairKey(e)).not.toMatch(/undefined|NaN/);
    expect(REL[p.relation], pairKey(e)).toBeDefined();
    const cells = Object.fromEntries(CELLS.map((c) => [c, { t: REL[p.relation].empty.includes(c) ? "" : refOf(p, c) || "", none: REL[p.relation].empty.includes(c) }])) as Record<CellId, { t: string; none: boolean }>;
    const r = grade(rix, p, { rel: p.relation, cells });
    const why = `${pairKey(e)} ${p.a} / ${p.b} ${JSON.stringify(p.ex)}`;
    // the two labels of one category are not two categories, so their examples cannot be classified: open, never wrong
    if (e.a === e.b) { expect(CELLS.map((c) => r.cells[c].v).filter((v) => v === "bad"), why).toEqual([]); expect(["ok", "pend"], why).toContain(r.overall); }
    else { expect(CELLS.map((c) => r.cells[c].v), why).toEqual(["ok", "ok", "ok", "ok"]); expect(r.overall).toBe("ok"); }
    const d = gradeDebate(rix, p, {
      rel: p.relation,
      ans: ["both", "anb", "bna", "nei"].map((c) => { const ref = refOf(p, c as CellId); return ref ? { say: "why" as const, text: ref } : { say: "accept" as const }; }),
    });
    expect(d.implied, pairKey(e)).toBe(p.relation);
    expect(d.overall, `${pairKey(e)} ${JSON.stringify(p.ex)}`).toBe("ok");
  }
});

test("the real data draws pairs of every relation, for a long run", () => {
  const rng = seeded(77), recent: string[] = [], hist: HistoryEntry[] = [], rels = new Set<string>();
  for (let i = 0; i < 300; i++) {
    const p = nextPair(rix, realPool, { hist, recent, rng });
    rels.add(p.relation);
    hist.push({ key: p.relation, catA: p.catA, catB: p.catB, grade: i % 3 ? "ok" : "bad" });
  }
  expect([...rels].sort()).toEqual(["3ab", "3ba", "4", "con", "mi"]);
});

// ---- the code stays free of the page and the browser ----

const here = resolve(__dirname, "../../src/domain");
const aiShared = resolve(__dirname, "../../src/ai-shared");
const sources = readdirSync(here).filter((f) => f.endsWith(".ts")).map((f) => join(here, f));

test("src/domain imports only itself and src/ai-shared, and touches nothing of the page or the browser", () => {
  expect(sources.length).toBeGreaterThan(4);
  for (const f of sources) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/^(?:import|export)\s[^;]*?from\s+["']([^"']+)["']/gm)) {
      expect(m[1].startsWith("./") || m[1].startsWith("../ai-shared"), `${f} imports ${m[1]}`).toBe(true);
      const target = resolve(dirname(f), m[1]);
      expect(target.startsWith(here) || target.startsWith(aiShared), `${f} imports ${m[1]}`).toBe(true);
    }
    const code = text.replace(/\/\/.*$/gm, "").replace(/\/\*[^]*?\*\//g, "");
    expect(code, f).not.toMatch(/\b(window|document|localStorage|sessionStorage|navigator|fetch|XMLHttpRequest|process)\b/);
  }
});

test("src/ai-shared does not depend on src/domain", () => {
  for (const f of readdirSync(aiShared).filter((f) => f.endsWith(".ts"))) {
    expect(readFileSync(join(aiShared, f), "utf8"), f).not.toMatch(/from\s+["'][^"']*domain/);
  }
});
