// src/domain: pairs, grading and Claude's verdicts as functions of the term data. Made-up data for the rules, the real
// open data for the properties that must hold for every pair the page can draw, and a check that the code stays free
// of the page and the browser.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { expect, test } from "vitest";
import { CELLS, NEG_CELL, REL, cardBody, explainAsk, isNeg, makeIndex, negLabel, negLine, negSides, plainLabel, readReviewAnswer, refOf, reviewRequest } from "../../src/ai-shared";
import type { CellId, DrillData, RelKey } from "../../src/ai-shared";
import {
  FEATURE, RECENT_MAX, AUTO_FLAGS, applyVerdicts, autoFlagOf, decideFlag, factNote, fitOf, flagAnswerRef, flagAsked, flagStateText, flaggedPart, noteParts, buildPool, cellsFor, chooseEntry, deriveRel, grade, gradeDebate, gradeOf, inUniverse, isMiss, judgeText, makePair,
  negateCells, nextPair, pairKey, parseFactLine, parseVerdicts, pick, relOfCells, summarize, termLine, cellFor, cellOfFacts, disputeText, divided, quorumDisputes, quorumRows, readings,
  FIND_RELS, applyRelationVerdict, drawRelation, findId, findPair, gradeFind, judgeable, nameThing, pairOf, parseRelationVerdict, sameThing,
} from "../../src/domain";
import type { DebateInput, GradeDraft, HistoryEntry, Pair, PoolEntry } from "../../src/domain";
import openData from "../../src/data/drill-data.json";
import { drawable, examplesFor, placeByClass } from "../../src/domain";
import { LANGS, normLangs, termNames } from "../../src/domain";
import { AGAIN_AFTER, FIRST_AFTER, MISS_AFTER, SETTLED, SPACING, afterQuestion, againAsked, freshIntro, introduced, nextStop, normIntro, pairGraded, showAgain, stageMet, stageTerms, stageUp, stopShown, termTree, unmet } from "../../src/domain";
import { DEFAULT_STAGES, DEFINITION_STAGE, HOLD_STAGE, MAX_STAGE, NEG_STREAK, STAGES, START_SHARE, STAGE_STREAK, STAGE_STUMBLE, catOpen, drawSyllogism, heldBack, itemKnown, itemOn, itemStageFor, levelAt, negationOffer, newCategories, normStages, pairStage, physical, poolAt, stagesOfLevels, toggleStage, topStage } from "../../src/domain";
import { GUIDE_RIGHT, STAGE_LONGER, STAGE_STREAK_MAX, exerciseAfter, freshRun, guideTurnsOff, guidedOn, movedUp, newShare, normExRuns, normGuided, normRun, restartRun, runAfter, runNeed, setManual, stageOffer, stayLonger } from "../../src/domain";
import type { MissKind, StageRun } from "../../src/domain";
import { drawPlace, itemRows, placeThings } from "../../src/domain/place";
import { normLevels, upTo } from "../../src/ai-shared";
import { FACTS_EPOCH, factKey, learn, opinionOf, ruleSide, servable } from "../../src/domain";
import type { Answer, FactRow, Opinion, Ruling } from "../../src/domain";
import { knownLine, openExamples, referenceLines, wholeFirst } from "../../src/domain";
import { makeExampleIndex } from "../../src/ai-shared/examples";

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

test("the labels of an everyday category make no pair of their own, those of a Dudra category do", () => {
  const d = data();
  d.cats.find((c) => c.id === "gray")!.labels.push("gray stuff"); // another wording of the same class: nothing to tell apart
  const withTwo = buildPool(makeIndex(d));
  expect(withTwo.find((e) => e.a === "gray" && e.b === "gray")).toBeUndefined();
  expect(withTwo.find((e) => e.a === "form" && e.b === "form")).toEqual({ a: "form", b: "form", r: "mi" }); // two names of one term
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

test("a relation with only a pair or two in reach comes up in proportion, not as often as the others", () => {
  const con: PoolEntry[] = ["wooden", "gray", "snd", "plain", "thing", "matter", "form", "wooden", "gray"].map((b) => ({ a: "mind", b, r: "con" as const }));
  const share = (mi: number) => {
    const rng = seeded(11), thin: PoolEntry[] = [...con, ...Array.from({ length: mi }, () => ({ a: "form", b: "form", r: "mi" as const }))];
    let n = 0;
    for (let i = 0; i < 1000; i++) if (chooseEntry(ix, thin, { hist: [], recent: [], rng }).r === "mi") n++;
    return n / 1000;
  };
  expect(share(1)).toBeLessThan(0.2); // one pair weighs an eighth of a relation that has many
  expect(share(8)).toBeGreaterThan(0.4); // eight pairs weigh as much as the relation that has many (here: as much as the four others together)
  expect(share(1)).toBeGreaterThan(0); // it still comes up
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

test("an item whose name leaves a category open neither shows it nor refuses it, and changes no relation", () => {
  const d = data();
  d.items.push({ n: "a chair", t: "Form", c: ["form", "matter", "thing"], may: ["wooden", "gray"] });
  const mix = makeIndex(d), chair = mix.DATA.items.find((i) => i.n === "a chair")!;
  expect(inUniverse(mix, chair, "form", "wooden")).toBe(false);
  expect(inUniverse(mix, chair, "form", "mind")).toBe(true);
  expect(names(cellsFor(mix, "wooden", "gray").anb)).toEqual(["a wooden chair"]); // not "a chair": it may be wooden
  expect(names(cellsFor(mix, "wooden", "mind").nei)).not.toContain("a chair"); // nor wooden things' outside: it may be one
  expect(names(cellsFor(mix, "form", "mind").anb)).toContain("a chair");
  expect(relOfCells(cellsFor(mix, "wooden", "form"))).toBe(relOfCells(cellsFor(ix, "wooden", "form")));
  expect(judgeText(mix, pair(), "nei", "a chair")).toBeNull(); // the tutor's to check
  expect(judgeText(mix, pair({ catA: "form", catB: "mind", a: "forms", b: "minds" }), "anb", "a chair")?.v).toBe("ok");
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
  expect(deriveRel([W, W, W, A]), "nor does an accepted one: nothing neither is still four possibilities").toBe("4");
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
    label: "Q2", cell: "anb", example: "a banana", cls: "",
    a: { answer: "yes", say: "It is a thing you can eat." }, b: { answer: "no", say: "It is not an internal form, because it is not in a person's continuum." },
  });
  expect(parseFactLine("- **Both**: “a cup” | a yes: x | b yes: y")?.cell).toBe("both");
  expect(parseFactLine('Q4: "a pebble" | class: External form | A no: x | B no: y')).toMatchObject({ example: "a pebble", cls: "External form", a: { answer: "no", say: "x" } });
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

// The note writes the example once as the subject ("Take S:") and each fact as a consequence in the debate's form, "It follows it is
// (not) P, because R", with the term as P; a note on an example that fits has no conclusion line, one that does not fit says so.
test("the note for a fact line is the subject, a consequence per term, and a conclusion only when the example does not fit", () => {
  const terms = { a: "a memory", b: "a mind" };
  const f = parseFactLine('Q1: "the memory of a holiday" | A yes: it is a mental consciousness that remembers. | B yes: a mental consciousness')!;
  expect(noteParts(f, true)).toEqual([
    { kind: "take", subject: "the memory of a holiday" },
    { kind: "term", side: "A", not: false, reason: "it is a mental consciousness that remembers", why: "" },
    { kind: "term", side: "B", not: false, reason: "it is a mental consciousness", why: "" },
  ]);
  expect(factNote(f, false, terms).split("\n")).toEqual([
    "Take the memory of a holiday:",
    "It follows it is a memory, because it is a mental consciousness that remembers.",
    "It follows it is a mind, because it is a mental consciousness.",
  ]);
  // a denied term can say, on a line under it, why it follows from the reason; a pervasion on a term the example is (yes) is not shown
  const perv = parseFactLine('Q3: "hearing music" | A no: it is an ear consciousness; pervasion: memory is mental, not sense consciousness | B yes: it is an ear consciousness, which is a sense consciousness; pervasion: z')!;
  expect(factNote(perv, false, terms).split("\n")).toEqual([
    "Take hearing music:",
    "It follows it is not a memory, because it is an ear consciousness.",
    "Memory is mental, not sense consciousness.",
    "It follows it is a mind, because it is an ear consciousness, which is a sense consciousness.",
  ]);
  const noClass = parseFactLine('Q2: "a rock" | A no: it does not arise from memory; pervasion: x | B no: it is a form')!;
  expect(noteParts(noClass, false)[1]).toEqual({ kind: "term", side: "A", not: true, reason: "it does not arise from memory", why: "X." });
  const off = parseFactLine('Q2: "a rock" | A no: it is a form | B no: it is a stone')!;
  expect(factNote(off, false, terms).split("\n").at(-1)).toBe("So it does not fit.");
  expect(factNote(off, true, terms).split("\n").at(-1)).toBe("So it does not fit the cell of Q2 and is not a counter-example.");
  const unsure = parseFactLine('Both: "a dream" | A yes: it is a mental consciousness | B unsure: the sources differ')!;
  expect(factNote(unsure, false, terms).split("\n").slice(2)).toEqual(["Whether it is a mind is not settled: the sources differ.", "Claude is unsure whether it fits."]);
});

// Each term gets its own statement, also when the reasons are the same; a pervasion said twice, or one that only points back, is said once.
test("each term is its own consequence, and a pervasion is not repeated", () => {
  const terms = { a: "an external form", b: "a physical thing outside a person's continuum" };
  const both = parseFactLine("Q4: \"a memory\" | A no: it is a consciousness; pervasion: form and consciousness are two of the three kinds of functional thing | B no: It is a consciousness.; pervasion: same")!;
  expect(factNote(both, false, terms).split("\n")).toEqual([
    "Take a memory:",
    "It follows it is not an external form, because it is a consciousness.",
    "Form and consciousness are two of the three kinds of functional thing.",
    "It follows it is not a physical thing outside a person's continuum, because it is a consciousness.",
  ]);
  const whys = (line: string) => noteParts(parseFactLine(line)!, false).filter((p) => p.kind === "term" && p.why).length;
  expect(whys('Q4: "a memory" | A no: it is a consciousness; pervasion: w | B no: it is a mind; pervasion: w')).toBe(1);
  expect(whys('Q4: "a memory" | A no: it is a consciousness; pervasion: w | B no: it is a mind; pervasion: the same')).toBe(1);
  expect(whys('Q4: "a memory" | A no: it is a consciousness; pervasion: w | B no: it is a mind; pervasion: v')).toBe(2);
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

test("the real data: stages from 1 to 9, open qualities only of everyday categories and never also stated, contrasts of listed items", () => {
  const ids = new Set(real.cats.map((c) => c.id)), everyday = new Set(real.cats.filter((c) => c.kind === "everyday").map((c) => c.id));
  const stage = (st: unknown) => Number.isInteger(st) && (st as number) >= 1 && (st as number) <= 9;
  expect(real.cats.filter((c) => !stage(c.st)).map((c) => c.id)).toEqual([]);
  expect(real.items.filter((i) => !stage(i.st)).map((i) => i.n)).toEqual([]);
  for (const it of real.items) {
    expect((it.may ?? []).filter((c) => !everyday.has(c)), it.n).toEqual([]);
    expect((it.may ?? []).filter((c) => it.c.includes(c)), it.n).toEqual([]);
    expect(it.c.filter((c) => !ids.has(c)), it.n).toEqual([]);
  }
  const listed = new Set(real.items.map((i) => i.n));
  expect((real.contrasts ?? []).flat().filter((n) => !listed.has(n))).toEqual([]);
  expect(real.contrasts?.length).toBeGreaterThan(0);
});

// ---- the learning ladder (src/domain/stages.ts): which stages are on, and what each exercise draws from them ----

const upToStage = (n: number) => Array.from({ length: n }, (_, i) => i + 1);

test("the stages that are on: a stored value, switching one, the highest, and the old levels a device kept", () => {
  expect(STAGES.map((s) => s.n)).toEqual(upToStage(9));
  expect(MAX_STAGE).toBe(9);
  expect(STAGES.every((s) => s.name && s.adds)).toBe(true);
  expect(DEFAULT_STAGES).toEqual([1]);
  expect(normStages("1,2")).toEqual([1, 2]);
  expect(normStages("3, 1,1,12,x")).toEqual([1, 3]);
  expect(normStages([9, 2])).toEqual([2, 9]);
  for (const bad of ["", "0", "x,y", null, undefined, 7, []]) expect(normStages(bad), String(bad)).toEqual([1]);
  expect(topStage([1, 4, 2])).toBe(4);
  expect(toggleStage([1, 2], 3)).toEqual([1, 2, 3]);
  expect(toggleStage([1, 2, 3], 2)).toEqual([1, 3]);
  expect(toggleStage([2], 2), "the last stage on stays on").toEqual([2]);
  // a device that drew the reference examples by level keeps every stage up to its top level's: level 1 is stage 6
  expect(stagesOfLevels([1])).toEqual(upToStage(6));
  expect(stagesOfLevels([1, 3])).toEqual(upToStage(8));
  expect(stagesOfLevels([4])).toEqual(upToStage(9));
  expect(stagesOfLevels([]), "nothing kept: a new device").toEqual([1]);
  expect(stagesOfLevels([0, 7])).toEqual([1]);
  // the levels themselves stay for the reference examples' own field and the tutor's lookup
  expect(normLevels("3, 1,1,9,x")).toEqual([1, 3]);
  expect(upTo(3)).toEqual([1, 2, 3]);
});

test("the real data: a newly opened category's definition shows with the question up to stage 3, and only for a Dudra term", () => {
  const everyday = real.cats.find((c) => c.kind === "everyday")!.id;
  expect(DEFINITION_STAGE).toBe(3);
  expect(newCategories(rix, ["form", everyday], [1]), "Form opens at stage 1; an everyday category has no definition").toEqual(["form"]);
  expect(newCategories(rix, ["form", "col"], [1, 2]), "only the one that opens at the highest stage on").toEqual(["col"]);
  expect(newCategories(rix, ["col", "shape"], [2])).toEqual(["col", "shape"]);
  expect(newCategories(rix, ["col", "col"], [2]), "once each").toEqual(["col"]);
  expect(newCategories(rix, ["snd", "form"], [1, 3])).toEqual(["snd"]);
  expect(newCategories(rix, ["ft", "form"], [1, 2, 3, 4]), "from the established bases on, a tap away").toEqual([]);
  expect(newCategories(rix, ["form", null], [1])).toEqual(["form"]);
  expect(newCategories(rix, ["nope", "form"], [2]), "an unknown id, and Form is not new at stage 2").toEqual([]);
  expect(newCategories(rix, ["form", "col", "shape", "extf", everyday], [1, 2]), "the categories Categories asks about").toEqual(["col", "shape", "extf"]);
});

test("a term is introduced before it is asked about: everyday questions first, then one stop at a time, a few questions apart", () => {
  const T0 = "2026-10-24T12:00:00.000Z";
  expect(stageTerms(rix, 1)).toEqual(["form"]);
  expect(stageTerms(rix, 2)).toEqual(["extf", "col", "shape", "vis"]);
  expect(stageTerms(rix, 3)).toEqual(["snd", "odr", "tst", "tng"]);
  expect(stageTerms(rix, 7), "the upper stages open no categories").toEqual([]);
  let it = freshIntro();
  expect([...unmet(rix, it, [1])]).toEqual(["form"]);
  expect(introduced(it, rix.CAT.form!)).toBe(false);
  expect(introduced(it, real.cats.find((c) => c.kind === "everyday")!), "an everyday category needs no stop").toBe(true);
  // a new learner: FIRST_AFTER everyday questions, then Form
  for (let i = 0; i < FIRST_AFTER; i++) {
    expect(nextStop(rix, it, [1], T0), "question " + i).toBeNull();
    it = afterQuestion(it, [], T0);
  }
  expect(nextStop(rix, it, [1], T0)).toEqual({ cat: "form", why: "new" });
  it = stopShown(it, "form", T0);
  expect(introduced(it, rix.CAT.form!)).toBe(true);
  expect(unmet(rix, it, [1]).size).toBe(0);
  expect(nextStop(rix, it, [1], T0), "stage 1 has no other term").toBeNull();
  // stage 2 switched on: its first term at once, then one every SPACING questions, in the course's order
  it = stageUp(it);
  expect([...unmet(rix, it, [1, 2])]).toEqual(["extf", "col", "shape", "vis"]);
  expect(nextStop(rix, it, [1, 2], T0)).toEqual({ cat: "extf", why: "new" });
  it = stopShown(it, "extf", T0);
  for (let i = 0; i < SPACING; i++) { expect(nextStop(rix, it, [1, 2], T0)).toBeNull(); it = afterQuestion(it, [], T0); }
  expect(nextStop(rix, it, [1, 2], T0)).toEqual({ cat: "col", why: "new" });
  expect(stageMet(rix, it, 2), "the next stage waits for all four").toBe(false);
  for (const c of ["col", "shape", "vis"]) it = stopShown(it, c, T0);
  expect(stageMet(rix, it, 2)).toBe(true);
  // stages are a set, not a ceiling: with 1 and 3 on, the terms of stage 2 come first, since its categories are open too
  const gap = stopShown(stageUp(freshIntro()), "form", T0);
  expect(nextStop(rix, stageUp(gap), [1, 3], T0)).toEqual({ cat: "extf", why: "new" });
});

test("a stop shows where its term sits: every term above it, those whose own stop has not come yet marked, and only the divisions met, with a sign of more to come", () => {
  const T0 = "2026-10-24T12:00:00.000Z", id = (term: string) => real.cats.find((c) => c.term === term)!.id;
  let it = freshIntro();
  let tree = termTree(rix, it, "Color");
  expect(tree.up.map((t) => t.name), "the broadest first, down to the term's parent").toEqual(["Existent", "Functional thing", "Form", "External form", "Form source"]);
  expect(tree.up.map((t) => t.met), "Existent has no stop of its own to wait for; the others have not come yet").toEqual([true, false, false, false, false]);
  expect(tree.kids, "the divisions of Color are not course terms: nothing to name, nothing to promise").toEqual([]);
  expect(tree.more).toBe(false);
  for (const t of ["Form", "External form"]) it = stopShown(it, id(t), T0);
  expect(termTree(rix, it, "Color").up.map((t) => t.met)).toEqual([true, false, true, true, false]);
  // Consciousness divides into two course terms: none met, then one, then both
  tree = termTree(rix, it, "Consciousness");
  expect(tree.kids).toEqual([]);
  expect(tree.more, "there are divisions to come").toBe(true);
  it = stopShown(it, id("Sense consciousness"), T0);
  tree = termTree(rix, it, "Consciousness");
  expect(tree.kids).toEqual(["Sense consciousness"]);
  expect(tree.more).toBe(true);
  it = stopShown(it, id("Mental consciousness"), T0);
  tree = termTree(rix, it, "Consciousness");
  expect(tree.kids).toEqual(["Sense consciousness", "Mental consciousness"]);
  expect(tree.more, "all met: no ellipsis").toBe(false);
  expect(termTree(rix, it, "Existent").up, "a term with nothing above it").toEqual([]);
});

test("the questions grade the terms they use: right moves a term up, a mistake brings its stop back a few questions later", () => {
  const T0 = "2026-10-24T12:00:00.000Z";
  let it = stopShown(stopShown(freshIntro(), "form", T0), "col", T0);
  expect(it.terms.form!.box).toBe(1);
  it = afterQuestion(it, [{ cat: "form", ok: true }, { cat: "everyday-x", ok: true }], T0);
  expect(it.terms.form!.box).toBe(2);
  expect(it.terms["everyday-x"], "a category without a stop is not recorded").toBeUndefined();
  it = afterQuestion(afterQuestion(it, [{ cat: "form", ok: true }], T0), [{ cat: "form", ok: true }], T0);
  expect(it.terms.form!.box, "box 3 is settled, and stays").toBe(SETTLED);
  // a mistake: back to box 1, and the stop comes back MISS_AFTER questions later, as a repetition
  it = afterQuestion(it, [{ cat: "form", ok: false }], T0);
  expect(it.terms.form!.box).toBe(1);
  const missed = it.n;
  for (let i = 1; i < MISS_AFTER; i++) {
    it = afterQuestion(it, i === 2 ? [{ cat: "form", ok: false }] : [], T0);
    expect(nextStop(rix, it, [1], T0), "question " + i + " after the mistake").toBeNull();
  }
  expect(it.terms.form!.due, "a second mistake while the repetition waits adds none and does not put it off").toBe(missed + MISS_AFTER);
  it = afterQuestion(it, [], T0);
  expect(nextStop(rix, it, [1, 2], T0), "the repetition comes before a new term").toEqual({ cat: "form", why: "miss" });
  it = stopShown(it, "form", T0);
  expect(it.terms.form!.due).toBeUndefined();
  expect(nextStop(rix, it, [1], T0)).toBeNull();
  // the same category twice in a question (two labels of one term) counts as wrong if either is
  it = afterQuestion(stopShown(freshIntro(), "col", T0), [{ cat: "col", ok: true }, { cat: "col", ok: false }], T0);
  expect(it.terms.col!.box).toBe(1);
  // an exercise whose mistakes are mostly about its form: right answers count, mistakes do not
  let sy = stopShown(freshIntro(), "ft", T0);
  sy = afterQuestion(sy, [{ cat: "ft", ok: true }], T0, false);
  sy = afterQuestion(sy, [{ cat: "ft", ok: false }], T0, false);
  expect(sy.terms.ft!.box).toBe(2);
  expect(sy.terms.ft!.due).toBeUndefined();
  // the learner asks to see it again: after AGAIN_AFTER questions
  let ag = showAgain(stopShown(freshIntro(), "form", T0), "form");
  for (let i = 0; i < AGAIN_AFTER - 1; i++) ag = afterQuestion(ag, [], T0);
  expect(nextStop(rix, ag, [1], T0)).toBeNull();
  ag = afterQuestion(ag, [], T0);
  expect(nextStop(rix, ag, [1], T0)).toEqual({ cat: "form", why: "again" });
  // ... and may take the ask back; a mistake while it waits brings it no later than MISS_AFTER, as a repetition of the mistake
  const asked = showAgain(stopShown(freshIntro(), "form", T0), "form");
  expect(againAsked(asked, "form")).toBe(true);
  expect(showAgain(asked, "form", false)).toEqual(stopShown(freshIntro(), "form", T0));
  expect(againAsked(showAgain(asked, "form", false), "form")).toBe(false);
  expect(afterQuestion(asked, [{ cat: "form", ok: false }], T0).terms.form).toMatchObject({ due: 1 + MISS_AFTER, why: "miss" });
  // a settled term not met for GAP_DAYS comes back once, spaced like a new term
  const old = { ...freshIntro(), terms: { form: { box: SETTLED, shows: 1, seen: "2026-10-01T12:00:00.000Z" } } };
  expect(nextStop(rix, { ...old, n: 9, next: 9 }, [1], "2026-10-10T12:00:00.000Z")).toBeNull();
  expect(nextStop(rix, { ...old, n: 9, next: 9 }, [1], "2026-10-16T12:00:00.000Z")).toEqual({ cat: "form", why: "gap" });
  expect(nextStop(rix, { ...old, n: 9, next: 12 }, [1], "2026-10-16T12:00:00.000Z"), "not before the spacing allows").toBeNull();
  // a pair's question: right counts for both its course terms; a mistake only for the one course term of a pair with an everyday side
  const everyday = real.cats.find((c) => c.kind === "everyday")!.id;
  expect(pairGraded(rix, ["form", "col"], true)).toEqual([{ cat: "form", ok: true }, { cat: "col", ok: true }]);
  expect(pairGraded(rix, ["form", "col"], false), "two course terms: the miss may be about either, or the relation").toEqual([]);
  expect(pairGraded(rix, ["form", everyday], false)).toEqual([{ cat: "form", ok: false }]);
  expect(pairGraded(rix, ["form", "form"], false), "one term on both sides").toEqual([{ cat: "form", ok: false }]);
  expect(pairGraded(rix, [everyday, null], false)).toEqual([]);
  // the stored record is read back as it was; a broken one starts fresh
  expect(normIntro(JSON.stringify(it))).toEqual(it);
  expect(normIntro("{nope")).toEqual(freshIntro());
  expect(normIntro({ n: -1, terms: { form: { box: 0 }, col: { box: 9, shows: 2, due: 4, why: "x" } } })).toEqual({ n: 0, next: FIRST_AFTER, terms: { col: { box: SETTLED, shows: 2 } } });
});

test("the real data: a category waits out of every exercise until its term has been introduced", () => {
  const T0 = "2026-10-24T12:00:00.000Z";
  const waiting = unmet(rix, freshIntro(), [1, 2]);
  expect(catOpen(rix.CAT.col!, [1, 2])).toBe(true);
  expect(catOpen(rix.CAT.col!, [1, 2], waiting)).toBe(false);
  // Relations and Pervasions: no pair with a category still waiting
  const recent: string[] = [];
  for (let s = 1; s <= 60; s++) {
    const p = nextPair(rix, realPool, { hist: [], recent, rng: seeded(s), now: () => 1_700_000_000_000, stages: [1, 2], unmet: waiting });
    expect(waiting.has(p.catA!) || waiting.has(p.catB!), p.a + " / " + p.b).toBe(false);
  }
  // with Form and Color met, their pairs come back
  const met = unmet(rix, stopShown(stopShown(freshIntro(), "form", T0), "col", T0), [1, 2]);
  const seen = new Set<string>();
  for (let s = 1; s <= 200; s++) {
    const p = nextPair(rix, realPool, { hist: [], recent: [], rng: seeded(s), now: () => 1_700_000_000_000, stages: [1, 2], unmet: met });
    expect(met.has(p.catA!) || met.has(p.catB!)).toBe(false);
    seen.add(p.catA!); seen.add(p.catB!);
  }
  expect(seen.has("form") || seen.has("col"), "the met terms are asked about").toBe(true);
  // Categories: no row for a waiting category
  for (let s = 1; s <= 40; s++) {
    const q = drawPlace(rix, null, { stages: [1, 2], rng: seeded(s), unmet: waiting });
    if (q) for (const r of q.rows) expect(waiting.has(r.cat), q.thing.n + ": " + r.cat).toBe(false);
  }
  // Syllogisms: from the established bases on the course's terms come in, and a waiting one is passed over while others remain
  const four = unmet(rix, freshIntro(), [1, 2, 3, 4]);
  const some = new Set([...four].filter((c) => c !== "form" && c !== "ft"));
  for (let s = 1; s <= 40; s++) {
    const c = drawSyllogism(rix, { hist: [], recent: [], rng: seeded(s), stages: [1, 2, 3, 4], unmet: some });
    expect(some.has(c.catR) || some.has(c.catP), c.id).toBe(false);
  }
});

test("the negation track is offered step by step: one side after plain pairs in a row, both sides after negated ones", () => {
  const run = (n: number, ok: boolean, neg = false) => Array.from({ length: n }, () => ({ ok, neg }));
  expect(NEG_STREAK).toBe(5);
  expect(negationOffer(run(4, true), "off")).toBeNull();
  expect(negationOffer(run(5, true), "off")).toBe("one");
  expect(negationOffer([...run(5, true), ...run(1, false)], "off"), "a miss ends the run").toBeNull();
  expect(negationOffer([...run(1, false), ...run(5, true)], "off"), "an earlier miss does not count").toBe("one");
  expect(negationOffer([...run(3, true), ...run(2, false, true), ...run(2, true)], "off"), "a negated pair neither extends nor breaks the plain run").toBe("one");
  expect(negationOffer(run(9, true), "one"), "on one side, only negated pairs count").toBeNull();
  expect(negationOffer([...run(4, true, true), ...run(3, false), ...run(1, true, true)], "one")).toBe("both");
  expect(negationOffer([...run(4, true, true), ...run(1, false, true)], "one")).toBeNull();
  expect(negationOffer(run(20, true, true), "both"), "nothing after both sides").toBeNull();
  expect(negationOffer(run(3, true), "off", 3)).toBe("one");
});

test("the run towards the stages: any exercise moves it up, only questions new at the highest stage on count, and a miss counts as its exercise says", () => {
  const walk = (on: number[], steps: [number, boolean, MissKind][], run: StageRun = freshRun()) => steps.reduce((r, [st, ok, miss]) => runAfter(r, on, st, ok, miss), run);
  const right = (n: number, st = 1, miss: MissKind = "words") => Array.from({ length: n }, () => [st, true, miss] as [number, boolean, MissKind]);
  const wrong = (n: number, st = 1, miss: MissKind = "words") => Array.from({ length: n }, () => [st, false, miss] as [number, boolean, MissKind]);
  expect(STAGE_STREAK).toBe(5);
  expect(STAGE_STUMBLE).toBe(4);
  expect(walk([1], right(5))).toEqual({ up: 5, down: 0 });
  expect(walk([1, 2], [...right(3, 2), ...right(4, 1), ...wrong(2, 1), ...right(2, 2)]), "a lower stage neither extends nor ends the run").toEqual({ up: 5, down: 0 });
  expect(walk([1, 2], [...right(2, 2, "words"), ...right(2, 2, "pair"), ...right(1, 2, "form")]), "every exercise moves it up").toEqual({ up: 5, down: 0 });
  expect(walk([1], [...right(4), ...wrong(1, 1, "form")]), "a wrong syllogism or own pair is about the form: nothing changes").toEqual({ up: 4, down: 0 });
  expect(walk([1], [...right(4), ...wrong(1, 1, "pair")]), "a wrong pervasion ends the run up").toEqual({ up: 0, down: 0 });
  expect(walk([1], [...wrong(3), ...wrong(1, 1, "pair")]), "and does not count down").toEqual({ up: 0, down: 3 });
  expect(walk([1, 2], [...wrong(3, 2), ...right(1, 2, "form")]), "a right answer ends the run down").toEqual({ up: 1, down: 0 });
  expect(walk([1, 2], wrong(4, 2))).toEqual({ up: 0, down: 4 });
});

test("the offer of the stages: up after five right when the stage's terms have had their stops, down after four wrong about the words, never below 1", () => {
  const r = (up: number, down = 0): StageRun => ({ up, down });
  expect(stageOffer(r(4), [1], true, "words")).toBeNull();
  expect(stageOffer(r(5), [1], true, "form")).toEqual({ kind: "up", stage: 2 });
  expect(stageOffer(r(5), [1, 3], true, "pair"), "above the highest on, not the next one that is off").toEqual({ kind: "up", stage: 4 });
  expect(stageOffer(r(5), [1], false, "words"), "the next stage waits for this stage's terms").toBeNull();
  expect(stageOffer(r(9), [MAX_STAGE], true, "words"), "nothing above the top").toBeNull();
  expect(stageOffer(r(0, 4), [1, 2], true, "words")).toEqual({ kind: "down", stage: 2 });
  expect(stageOffer(r(0, 4), [1, 2], true, "pair"), "down only where a mistake is about the words").toBeNull();
  expect(stageOffer(r(0, 4), [1, 2], true, "form")).toBeNull();
  expect(stageOffer(r(0, 3), [1, 2], true, "words")).toBeNull();
  expect(stageOffer(r(0, 9), [1], true, "words"), "nothing below stage 1").toBeNull();
  expect(normRun('{"up":3,"down":-2}')).toEqual({ up: 3, down: 0 });
  expect(normRun("not json")).toEqual(freshRun());
  expect(normRun(null)).toEqual(freshRun());
});

test("staying on a stage longer asks for more right answers; the learner's own moves stop the stages coming by themselves; what they told the page survives a restart of the run", () => {
  const r = (extra: Partial<StageRun> = {}): StageRun => ({ up: 5, down: 0, ...extra });
  expect(runNeed(freshRun())).toBe(STAGE_STREAK);
  const once = stayLonger(r());
  expect(once, "the station was seen, so the next one is told shortly").toEqual({ up: 0, down: 0, told: true, need: STAGE_STREAK + STAGE_LONGER });
  expect(stageOffer({ ...once, up: 9 }, [1], true, "words"), "ten are needed now").toBeNull();
  expect(stageOffer({ ...once, up: 10 }, [1], true, "words")).toEqual({ kind: "up", stage: 2 });
  expect(runNeed(stayLonger(stayLonger(once)))).toBe(STAGE_STREAK + 3 * STAGE_LONGER);
  expect(runNeed(Array.from({ length: 20 }).reduce<StageRun>((x) => stayLonger(x), freshRun())), "up to a limit").toBe(STAGE_STREAK_MAX);
  expect(movedUp(once), "a stage came in: the usual length again, and the station has been seen").toEqual({ up: 0, down: 0, told: true });
  expect(restartRun({ up: 3, down: 2, need: 10, told: true, manual: true }), "an offer answered keeps what the learner told").toEqual({ up: 0, down: 0, told: true, manual: true });
  const own = setManual(r(), true);
  expect(stageOffer(own, [1], true, "words"), "moving the stages themselves: no stage comes").toBeNull();
  expect(stageOffer({ ...own, up: 0, down: 4 }, [1, 2], true, "words"), "taking one off is still suggested").toEqual({ kind: "down", stage: 2 });
  expect(setManual(own, false)).toEqual({ up: 5, down: 0 });
  expect(runAfter({ up: 2, down: 0, need: 10, told: true, manual: true }, [1], 1, true, "words"), "the answers move the run, what the learner told stays").toEqual({ up: 3, down: 0, need: 10, told: true, manual: true });
  expect(runAfter({ up: 2, down: 0, need: 10, told: true }, [1], 1, false, "pair")).toEqual({ up: 0, down: 0, need: 10, told: true });
  expect(normRun(JSON.stringify({ up: 1, down: 0, need: 10, told: true, manual: true }))).toEqual({ up: 1, down: 0, need: 10, told: true, manual: true });
  expect(normRun('{"up":1,"down":0,"need":3,"told":"yes","manual":1}'), "a need below the usual one and loose flags are dropped").toEqual({ up: 1, down: 0 });
  expect(runNeed(normRun('{"need":9999}'))).toBe(STAGE_STREAK_MAX);
});

test("a new exercise starts with review: a quarter of its questions new at the highest stage until its first run of five right, then half", () => {
  expect(newShare(undefined)).toBe(START_SHARE);
  expect(START_SHARE).toBe(0.25);
  const after = (oks: boolean[]) => oks.reduce((r, ok) => exerciseAfter(r, ok), undefined as ReturnType<typeof exerciseAfter> | undefined);
  expect(after([true, true, true, true])).toEqual({ run: 4, right: 4 });
  expect(newShare(after([true, true, true, true, false, true]))).toBe(START_SHARE);
  const warm = after([true, true, true, true, true]);
  expect(warm).toEqual({ run: 5, right: 5 });
  expect(newShare(warm)).toBe(0.5);
  expect(after([true, true, true, true, true, false, false, true]), "once warmed up, it stays so; every right answer counts").toEqual({ run: 5, right: 6 });
  expect(normExRuns('{"practice":{"run":9,"right":12},"Bad Key":{"run":1,"right":1},"debate":"x"}')).toEqual({ practice: { run: 5, right: 12 } });
  expect(normExRuns("[")).toEqual({});
  // the pair draw follows the share
  const on = [1, 2, 3], at3 = new Set(poolAt(rix, realPool, on).filter((e) => e.st === 3).map(pairKey));
  const share3 = (newShare?: number) => Array.from({ length: 1000 }, (_, s) => chooseEntry(rix, realPool, { hist: [], recent: [], rng: seeded(s), stages: on, newShare })).filter((e) => at3.has(pairKey(e))).length / 1000;
  expect(share3(0.25)).toBeGreaterThan(0.15);
  expect(share3(0.25)).toBeLessThan(0.35);
  expect(share3(0.5)).toBeGreaterThan(0.4);
  expect(share3(0.5)).toBeLessThan(0.6);
  expect(share3(), "half when no share is given").toBeCloseTo(share3(0.5), 5);
});

test("an exercise's guided form is on until its twentieth right answer turns it off, once; a choice the learner made stays", () => {
  expect(GUIDE_RIGHT).toBe(20);
  expect(guidedOn(undefined)).toBe(true);
  expect(guidedOn(false)).toBe(false);
  expect(guideTurnsOff(undefined, { run: 5, right: 19 })).toBe(false);
  expect(guideTurnsOff(undefined, { run: 5, right: 20 })).toBe(true);
  expect(guideTurnsOff(undefined, undefined)).toBe(false);
  expect(guideTurnsOff(true, { run: 5, right: 40 }), "turned on by the learner: it stays on").toBe(false);
  expect(guideTurnsOff(false, { run: 5, right: 40 }), "already off").toBe(false);
  expect(normGuided('{"practice":false,"find":true,"Bad":false,"debate":"no"}')).toEqual({ practice: false, find: true });
  expect(normGuided("nope")).toEqual({});
});

test("the real data: a category opens at its stage and stays open; a person or what does not exist meets the physical categories from stage 4", () => {
  const C = rix.CAT, item = (n: string) => real.items.find((i) => i.n === n)!;
  expect(catOpen(C.form, [1])).toBe(true);
  expect(catOpen(C.extf, [1])).toBe(false);
  expect(catOpen(C.extf, [2])).toBe(true);
  expect(catOpen(C.extf, [1, 5]), "open below the highest stage on, whether or not its own stage is on").toBe(true);
  expect(catOpen(C.cons, [1, 2, 3])).toBe(false);
  expect(catOpen(C.human, [3])).toBe(false);
  expect(catOpen(C.human, [4])).toBe(true);
  expect([C.form, C.col, C.wooden, C.animal].map((c) => physical(rix, c))).toEqual([true, true, true, false]);
  const dog = item("a dog"), joy = real.items.find((i) => i.t === "Mental factor" && (i.st ?? 1) === 1)!, chair = item("a wooden chair");
  expect([heldBack(rix, dog), heldBack(rix, joy), heldBack(rix, chair)]).toEqual([true, false, false]);
  expect(itemStageFor(rix, dog, "form", "animal")).toBe(HOLD_STAGE);
  expect(itemStageFor(rix, dog, "animal", "emotion"), "against categories that are not physical: its own stage").toBe(1);
  expect(itemOn(rix, dog, "form", "animal", [1, 2, 3])).toBe(false);
  expect(itemOn(rix, dog, "form", "animal", [1, 4])).toBe(true);
  expect(itemOn(rix, dog, "form", "animal", [4]), "its own stage is off").toBe(false);
  expect(itemKnown(rix, dog, "form", "animal", [4])).toBe(true);
  expect(itemOn(rix, joy, "form", "emotion", [1])).toBe(true);
});

test("the real data: a pair is new at the stage where both categories are open and a thing the learner knows fills every cell", () => {
  // Form against Visible form waits for the sounds of stage 3, which give a form that is not seen; Form against External form for the sense powers of stage 5
  expect(pairStage(rix, "form", "vis", [1, 2])).toBeNull();
  expect(pairStage(rix, "form", "vis", [1, 2, 3])).toBe(3);
  expect(pairStage(rix, "form", "vis", [3]), "the things of a stage below count, on or off").toBe(3);
  expect(pairStage(rix, "form", "extf", upToStage(4))).toBeNull();
  expect(pairStage(rix, "form", "extf", upToStage(5))).toBe(5);
  for (const top of [1, 3, 4, 6]) {
    const on = upToStage(top), pool = poolAt(rix, realPool, on);
    expect(pool.length, `stages 1 to ${top}`).toBeGreaterThan(100);
    expect(new Set(pool.map((e) => e.r)), `every relation comes up at stages 1 to ${top}`).toEqual(new Set(["mi", "con", "3", "4"]));
    for (const e of pool) {
      expect(e.st).toBeLessThanOrEqual(top);
      expect(catOpen(rix.CAT[e.a], on) && catOpen(rix.CAT[e.b], on), pairKey(e)).toBe(true);
      const cells = cellsFor(rix, e.a, e.b);
      for (const c of CELLS) if (cells[c].length) expect(cells[c].some((it) => itemKnown(rix, it, e.a, e.b, on)), `${pairKey(e)} ${c}`).toBe(true);
    }
  }
  // a set, not a ceiling: stages 1 and 3 draw the pairs new at either, never one new at stage 2
  const skip = poolAt(rix, realPool, [1, 3]);
  expect(skip.some((e) => e.st === 3) && skip.some((e) => e.st === 1) && !skip.some((e) => e.st === 2)).toBe(true);
  expect(poolAt(rix, realPool, upToStage(6)).length, "by stage 6 every pair is in").toBe(realPool.length);
  expect(poolAt(rix, realPool, [7]), "a stage the practice list has nothing new at draws no pair of its own").toEqual([]);
});

test("the real data: the next pair comes from the stages that are on, about half of it new at the highest, with things of those stages", () => {
  const on = [1, 2, 3], ok = new Set(poolAt(rix, realPool, on).map((e) => [e.a, e.b].sort().join("|")));
  const newAt3 = new Set(poolAt(rix, realPool, on).filter((e) => e.st === 3).map((e) => [e.a, e.b].sort().join("|")));
  let fresh = 0, n = 0, staged = 0, cellsSeen = 0;
  const hist: HistoryEntry[] = [], recent: string[] = [];
  for (let s = 0; s < 400; s++) {
    const p = nextPair(rix, realPool, { hist, recent, rng: seeded(s), now: () => 1_700_000_000_000, stages: on });
    const key = [p.catA, p.catB].sort().join("|");
    expect(ok.has(key), key).toBe(true);
    n++; if (newAt3.has(key)) fresh++;
    for (const c of CELLS) {
      const ex = p.ex?.[c]; if (!ex) continue;
      cellsSeen++;
      if (on.includes(real.items.find((i) => i.n === ex)?.st ?? 0)) staged++;
    }
  }
  expect(fresh / n, "about half new at the highest stage").toBeGreaterThan(0.3);
  expect(fresh / n).toBeLessThan(0.7);
  expect(cellsSeen).toBeGreaterThan(400);
  expect(staged, "the examples are things of the stages that are on").toBe(cellsSeen);
  // stages that can draw no pair of their own draw from every pair
  expect(() => nextPair(rix, realPool, { hist: [], recent: [], rng: seeded(1), stages: [8] })).not.toThrow();
  // just after a stage went up, three possibilities come more often
  const threes = (fresh: boolean) => Array.from({ length: 300 }, (_, s) => chooseEntry(rix, realPool, { hist: [], recent: [], rng: seeded(s), stages: on, fresh })).filter((e) => e.r === "3").length;
  expect(threes(true)).toBeGreaterThan(threes(false) * 1.5);
  // a device that kept its settings from before the ladder (stages 1 to 6) draws every pair alike: the pairs new at stage 6 come about as often as their share
  const all = [1, 2, 3, 4, 5, 6], at6 = new Set(poolAt(rix, realPool, all).filter((e) => e.st === 6).map(pairKey));
  const share6 = (even: boolean) => Array.from({ length: 1000 }, (_, s) => chooseEntry(rix, realPool, { hist: [], recent: [], rng: seeded(s), stages: all, even })).filter((e) => at6.has(pairKey(e))).length / 1000;
  expect(share6(true)).toBeLessThan(0.2);
  expect(share6(false)).toBeGreaterThan(0.3);
});

test("the real data: Categories asks about things of the stages that are on, practice items too, and never a category a name leaves open", () => {
  const things = placeThings(rix, [], [1]);
  expect(things.length).toBeGreaterThan(200);
  expect(things.every((t) => t.item && t.st === 1 && !t.item.nosubject)).toBe(true);
  for (let s = 0; s < 200; s++) {
    const on = s % 2 ? [1] : [1, 2, 3, 4];
    const q = drawPlace(rix, null, { stages: on, rng: seeded(s) })!;
    expect(q, `seed ${s}`).toBeTruthy();
    const it = q.thing.item!;
    expect(on).toContain(it.st);
    for (const r of q.rows) {
      expect(catOpen(rix.CAT[r.cat], on), `${it.n} ${r.cat}`).toBe(true);
      expect(it.may?.includes(r.cat) ?? false, `${it.n} leaves ${r.cat} open`).toBe(false);
      expect(r.answer).toBe(it.c.includes(r.cat));
      expect(r.reason).toBeTruthy();
    }
  }
  // a person is not asked about the physical categories before stage 4, and at stage 1 a form is "anything physical"
  const dog = real.items.find((i) => i.n === "a dog")!;
  expect(itemRows(rix, dog, [1, 2, 3]).some((r) => physical(rix, rix.CAT[r.cat]))).toBe(false);
  expect(itemRows(rix, dog, [1, 2, 3, 4]).some((r) => r.cat === "form")).toBe(true);
  const chair = itemRows(rix, real.items.find((i) => i.n === "a wooden chair")!, [1]);
  expect(chair.find((r) => r.cat === "form")).toMatchObject({ answer: true, reason: "it is physical" });
});

test("the real data: Syllogisms keep to everyday reasons and predicates up to stage 3, with subjects of the stages that are on", () => {
  expect([1, 3, 4, 9].map((t) => levelAt([t]))).toEqual([1, 1, 2, 2]);
  for (const on of [[1], [1, 2, 3], [1, 4]]) {
    for (let s = 0; s < 40; s++) {
      const c = drawSyllogism(rix, { hist: [], recent: [], rng: seeded(s), stages: on });
      const R = rix.CAT[c.catR], P = rix.CAT[c.catP], it = real.items.find((i) => i.n === c.subject)!;
      expect(catOpen(R, on) && catOpen(P, on), c.id).toBe(true);
      if (topStage(on) <= 3) expect([R.kind, P.kind], c.id).toEqual(["everyday", "everyday"]);
      expect(itemOn(rix, it, c.catR, c.catP, on) || itemOn(rix, it, c.catP, c.catR, on), c.id).toBe(true);
    }
  }
});

// A note takes the steps the term data gives: up the "is a" chain to the term, or up to a class the data marks as excluding one
// the term is in, with why under it. A listed example is placed as the grading places it; elsewhere the tutor's class counts.
test("a note states the term data's steps: up the chain to the term, or to the class that excludes it", () => {
  const S: Record<string, string> = { forms: "a form", "red things": "a red thing", food: "food", "wooden things": "a wooden thing", "musical instruments": "a musical instrument", thoughts: "a thought", "sense powers": "a sense power", "external forms": "an external form", smells: "a smell", drinks: "a drink", "white things": "a white thing", "permanent phenomena": "a permanent phenomenon" };
  const note = (a: string, ca: string, b: string, cb: string, line: string) => {
    const p = { a, b, catA: ca, catB: cb, relation: "4" as const }, terms = { a: S[a], b: S[b] };
    return factNote(parseFactLine(line)!, false, terms, { ix: rix, p, terms }).split("\n");
  };
  // the oak tree is listed (External form): no step is skipped, and the exclusion names the term's class
  expect(note("thoughts", "thought", "sense powers", "sp", 'Q4: "an oak tree" | A no: it is a tree | B no: it is a tree')).toEqual([
    "Take an oak tree:",
    "It follows it is not a thought, because it is a tree, which is an external form, which is a form.",
    "A thought is a consciousness, and nothing is both a form and a consciousness.",
    "It follows it is not a sense power, because it is a tree.", // external and internal form are not exclusive in the data: the tutor's reason stays
  ]);
  expect(note("thoughts", "thought", "sense powers", "sp", 'Q2: "a thought about lunch" | A yes: it is a mind that apprehends lunch | B no: it is a consciousness').slice(2)).toEqual([
    "It follows it is not a sense power, because it is a consciousness.",
    "A sense power is an internal form, which is a form, and nothing is both a consciousness and a form.",
  ]);
  expect(note("external forms", "extf", "smells", "odr", 'Q2: "the saltiness of sea water" | A yes: it is a taste source | B no: it is a taste')[1])
    .toBe("It follows it is an external form, because it is a taste source, which is an external form.");
  expect(note("external forms", "extf", "permanent phenomena", "perm", 'Q4: "compassion" | A no: it is a mental factor | B no: it is a mental factor').slice(1)).toEqual([
    "It follows it is not an external form, because it is a mental factor, which is a consciousness.",
    "An external form is a form, and nothing is both a consciousness and a form.",
    "It follows it is not a permanent phenomenon, because it is a mental factor, which is a consciousness, which is a functional thing.",
    "Nothing is both a functional thing and a permanent phenomenon.",
  ]);
  // an example that is not listed takes the tutor's class; a reason that is not a plain "it is a ..." goes on with "so it is"
  expect(note("external forms", "extf", "smells", "odr", 'Q2: "the taste of salt" | class: Taste source | A yes: it is the taste of salt | B no: it is a taste')[1])
    .toBe("It follows it is an external form, because it is the taste of salt, so it is a taste source, which is an external form.");
  // everyday terms the data does not chain keep the tutor's reasons
  expect(note("drinks", "drink", "white things", "white", 'Q2: "a cup of hot tea" | A yes: it is a liquid people drink | B no: it is brown').slice(1)).toEqual([
    "It follows it is a drink, because it is a liquid people drink.",
    "It follows it is not a white thing, because it is brown.",
  ]);
  // a listed example is placed by the data, whatever the tutor answered; without the data's steps the statement has no reason
  expect(note("drinks", "drink", "white things", "white", 'Q2: "a cup of hot tea" | A no: it is hot | B no: it is brown')[1]).toBe("It follows it is a drink.");
  // an alias settles a side that is not about a feature: "an apple" is food whatever the tutor says, while its color stays the tutor's
  const apple = 'Q2: "an apple" | A yes: it is a red apple | B no: it is eaten as food';
  expect(note("red things", "red", "food", "food", apple).slice(1)).toEqual([
    "It follows it is a red thing, because it is a red apple.",
    "It follows it is food.",
    "So it does not fit.",
  ]);
  const d = { ix: rix, p: { a: "red things", b: "food", catA: "red", catB: "food", relation: "4" as const }, terms: { a: "a red thing", b: "food" } };
  expect(parseVerdicts(apple, d)).toEqual([{ cell: "anb", answer: "no" }]); // the cell settles as the note reads
  expect(parseVerdicts(apple)).toEqual([{ cell: "anb", answer: "yes" }]); // without the data, the tutor's facts
  // a permanent phenomenon is excluded from a form through functional thing
  expect(note("wooden things", "wooden", "musical instruments", "instr", 'Q4: "the absence of an elephant in an empty room" | A no: it is an absence | B no: it is an absence').slice(1, 3)).toEqual([
    "It follows it is not a wooden thing, because it is an absence, which is a permanent phenomenon.",
    "A wooden thing is a form, which is a functional thing, and nothing is both a permanent phenomenon and a functional thing.",
  ]);
  // a step the reason already names is not said again, and a name inside a longer one is not a step of its own: "an external form"
  // is not also "a form", and "a form source" is neither
  expect(note("forms", "form", "thoughts", "thought", 'Q2: "a puddle" | class: External form | A yes: it is an external form | B no: it is a puddle').slice(1)).toEqual([
    "It follows it is a form, because it is an external form, which is a form.",
    "It follows it is not a thought, because it is a puddle, which is an external form, which is a form.",
    "A thought is a consciousness, and nothing is both a form and a consciousness.",
  ]);
  expect(note("forms", "form", "thoughts", "thought", 'Q2: "a glint" | class: Form source | A yes: it is a form source | B no: it is a glint')[1])
    .toBe("It follows it is a form, because it is a form source, which is an external form, which is a form.");
  // an alias the data gives a step names that step: "a visible form" is Form source (not Form), so External form still follows
  expect(note("forms", "form", "thoughts", "thought", 'Q2: "a glint" | class: Form source | A yes: it is a visible form | B no: it is a glint')[1])
    .toBe("It follows it is a form, because it is a visible form, which is an external form, which is a form.");
  expect(note("forms", "form", "thoughts", "thought", 'Q2: "a glint" | class: Form source | A yes: it is a visible form and an external form | B no: it is a glint')[1])
    .toBe("It follows it is a form, because it is a visible form and an external form, which is a form.");
  // an alias names the step only as a class ("a taste"), not inside the example's own phrase ("the taste of salt")
  expect(note("external forms", "extf", "smells", "odr", 'Q2: "the taste of salt" | class: Taste source | A yes: it is a taste | B no: it is a taste')[1])
    .toBe("It follows it is an external form, because it is a taste, which is an external form.");
  // the tutor's class does not overrule its own answer, nor the answer the class: where the data's steps from the class go against the answer, the line
  // contradicts itself and the side is not settled; a side the steps say nothing of (external and internal form overlap) keeps the tutor's answer and reason
  expect(note("thoughts", "thought", "sense powers", "sp", 'Q2: "a hunch" | class: External form | A yes: it is a mind | B no: it is a hunch').slice(1, 3)).toEqual([
    "Whether it is a thought is not settled: Claude's class for it (external form) and its answer disagree.",
    "It follows it is not a sense power, because it is a hunch.",
  ]);
});

// The case that was flagged: "leather boots" for the first question of leather things / things made of atoms (A leather, B form). The tutor's line
// named the class External form and then answered "B no" with a reason that makes them physical, and the page took the "no": "Does not fit".
test("a tutor line that contradicts its own class settles nothing on that side, so a slip is not a wrong verdict", () => {
  const p = { a: "leather things", b: "things made of atoms", catA: "leather", catB: "form", relation: "3ab" as const }, terms = { a: "a leather thing", b: "a thing made of atoms" };
  const d = { ix: rix, p, terms };
  const slip = 'Q1: "leather boots" | class: External form | A yes: they are boots made of leather | B no: it is a solid object with a shape and color';
  expect(parseVerdicts(slip, d)).toEqual([{ cell: "both", answer: "unsure" }]);
  expect(factNote(parseFactLine(slip)!, true, terms, d).split("\n")).toEqual([
    "Take leather boots:",
    "It follows it is a leather thing, because they are boots made of leather.",
    "Whether it is a thing made of atoms is not settled: Claude's class for it (external form) and its answer disagree.",
    "Claude is unsure whether it is a counter-example.",
  ]);
  // the same line without the slip settles the cell, and the note shows the steps
  const right = slip.replace("B no", "B yes");
  expect(parseVerdicts(right, d)).toEqual([{ cell: "both", answer: "yes" }]);
  expect(factNote(parseFactLine(right)!, true, terms, d).split("\n").slice(2)).toEqual(["It follows it is a thing made of atoms, because it is a solid object with a shape and color, which is an external form, which is a form."]);
  // a class the data does not have, or a side the class says nothing of, leaves the tutor's answers as they are; without the data they are the tutor's
  expect(parseVerdicts(slip.replace("External form", "Leather boot"), d)).toEqual([{ cell: "both", answer: "no" }]);
  expect(parseVerdicts(slip)).toEqual([{ cell: "both", answer: "no" }]);
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

// ---- flags on what Claude said ----

test("a flag names the stored answer it was made on, by its case key", () => {
  expect(flagAnswerRef({ caseKey: "answers_r-mv9q" })).toEqual({ col: "answers", id: "r-mv9q" });
  expect(flagAnswerRef({ caseKey: "debates_q-mv9q_2" })).toEqual({ col: "debates", id: "q-mv9q_2" });
  expect(flagAnswerRef({ caseKey: "labruns_x" })).toBeNull();
  expect(flagAnswerRef({})).toBeNull();
});

test("a flag says in words what it is on", () => {
  expect(flaggedPart({ part: "explain", n: null })).toBe("Claude’s explanation");
  expect(flaggedPart({ part: "explain", n: "both", caseKey: "answers_r-1" })).toBe("Claude’s note on Both");
  expect(flaggedPart({ part: "explain", n: "bna", caseKey: "debates_q-1" })).toBe("Claude’s note on Q3");
  expect(flaggedPart({ part: "explain", n: "nei", pair: { tab: "debate" } })).toBe("Claude’s note on Q4");
  expect(flaggedPart({ part: "explain", n: "rel" })).toBe("Claude’s note on the relation");
  expect(flaggedPart({ part: "chat", n: "3" })).toBe("Claude’s answer in the chat");
  expect(flaggedPart({ part: "reply", n: "fl_a" })).toBe("The reply to a flag");
  expect(flaggedPart({ part: "verdict", thing: "a pot", model: "m1" }, (id) => id.toUpperCase())).toBe("“a pot” · M1 · verdict");
  expect([flagStateText("new"), flagStateText(undefined), flagStateText("reviewed"), flagStateText("resolved")]).toEqual(["Not reviewed yet", "Not reviewed yet", "Reviewed", "Resolved"]);
});

test("a flag written by a program is told from a hand-made one by a name the app knows", () => {
  expect(AUTO_FLAGS).toEqual(["quorum"]);
  expect(autoFlagOf({ auto: "quorum", part: "quorum" })).toBe("quorum");
  for (const flag of [{}, { auto: "" }, { auto: "other" }, { auto: true }, { auto: ["quorum"] }, { auto: "Quorum" }, { note: "auto: quorum" }]) expect(autoFlagOf(flag)).toBeNull();
});

test("a flag on a chat answer keeps the question it answered", () => {
  expect(flagAsked({ role: "user", content: "Why not?" })).toBe("Why not?");
  expect(flagAsked({ role: "user", content: "THE CARD\n\nIs a chair a form?", hidden: true, asked: "Is a chair a form?" })).toBe("Is a chair a form?"); // the first turn of a chat
  expect(flagAsked({ role: "user", content: "THE CARD\n\nExplain.", hidden: true })).toBeNull(); // the page's own request
  expect(flagAsked({ role: "user", content: "Check the examples.", hidden: true })).toBeNull();
  expect(flagAsked({ role: "assistant", content: "Yes." })).toBeNull();
  expect(flagAsked(undefined)).toBeNull();
});

test("after two reviews a flag gets a reply, a prepared fix, or goes to the maintainer", () => {
  const r = (verdict: string, cause: string, confident = true) => ({ verdict, cause, confident, reply: verdict + " " + cause, fix: cause === "none" ? "" : "change " + cause }) as Parameters<typeof decideFlag>[0][number];
  const act = (...rs: ReturnType<typeof r>[]) => decideFlag(rs).action;
  expect(decideFlag([r("learner_wrong", "none"), r("learner_wrong", "none")])).toEqual({ action: "reply", reason: "the learner is wrong", reply: "learner_wrong none", fix: "", cause: "none" });
  expect(act(r("learner_right", "tutor"), r("learner_right", "tutor"))).toBe("reply");
  expect(act(r("partly", "tutor"), r("partly", "tutor"))).toBe("reply");
  expect(act(r("learner_right", "wording"), r("learner_right", "wording"))).toBe("fix");
  for (const cause of ["data", "generator", "grading"]) {
    const o = decideFlag([r("learner_right", cause), r("learner_right", cause)]);
    expect(o.action).toBe("escalate");
    expect(o.reply).toBe("learner_right " + cause); // the learner can read the agreed reply while the maintainer decides
  }
  expect(decideFlag([r("learner_right", "generator")])).toMatchObject({ action: "escalate", reason: "fewer than two reviews", reply: "" });
  expect(decideFlag([r("learner_right", "tutor"), r("learner_wrong", "none")])).toMatchObject({ action: "escalate", reply: "" });
  expect(act(r("unclear", "none"), r("unclear", "none"))).toBe("escalate");
  expect(act(r("learner_right", "tutor"), r("learner_right", "data"))).toBe("escalate");
  expect(act(r("learner_wrong", "none"), r("learner_wrong", "none", false))).toBe("escalate");
  // nothing is agreed when the causes differ or a reviewer is unsure: no reply for the learner, and no reviewer's fix
  expect(decideFlag([r("learner_right", "tutor"), r("learner_right", "data")])).toEqual({ action: "escalate", reason: "the reviewers disagree on the cause", reply: "", fix: "", cause: "" });
  expect(decideFlag([r("learner_right", "data"), r("learner_right", "data", false)])).toEqual({ action: "escalate", reason: "a reviewer is not sure", reply: "", fix: "", cause: "data" });
  expect(decideFlag([r("learner_wrong", "none"), r("learner_wrong", "none", false)])).toMatchObject({ action: "escalate", reason: "a reviewer is not sure", reply: "" }); // nothing the reviewers do not stand behind is shown
  expect(act(r("learner_right", "none"), r("learner_right", "none"))).toBe("escalate");
});

// ---- Quorum: which examples are worth a flag ----

const th = (text: string, cells: ("both" | "anb" | "bna" | "nei")[], page: Record<string, string>) => ({ text, cells, page });
const run = (name: string, ...cells: ("both" | "anb" | "bna" | "nei")[]) => ({ name, cells });

test("Quorum is disputed where the models give different cells, and the text names each model's cell", () => {
  const things = [th("a table", ["anb"], { anb: "ok" }), th("a song", ["bna"], { bna: "ok" })];
  const d = quorumDisputes(things, [run("Haiku", "anb", "nei"), run("Sonnet", "anb", "bna"), run("Opus", "anb", "bna")], ["anb", "bna"]);
  expect(d).toHaveLength(1);
  expect(d[0]).toMatchObject({ index: 1, kinds: ["models"], ruling: "bna", judge: "bna" });
  expect(disputeText(d[0], things[1])).toBe("The models gave different cells. Models: Haiku Neither, Sonnet B not A, Opus B not A. Judge: B not A. You put it in B not A (the page: fits).");
});

test("Quorum is disputed where the models agree but the page's verdict cannot stand beside the cell they agree on", () => {
  const things = [th("a table", ["anb"], { anb: "bad" }), th("a song", ["bna"], { bna: "ok" }), th("a stone", ["both"], { both: "ok" }), th("a mule", ["nei"], { nei: "cmp" })];
  const models = [run("Haiku", "anb", "anb", "both", "bna"), run("Sonnet", "anb", "anb", "both", "bna")];
  const d = quorumDisputes(things, models, null);
  // a table: the page says it does not fit A not B, the models put it there; a song: the page says it fits B not A, the models say A not B
  expect(d.map((x) => [x.index, x.kinds, x.ruling])).toEqual([[0, ["page"], "anb"], [1, ["page"], "anb"]]);
  expect(disputeText(d[0], things[0])).toBe("The models agree, but the page does not. Models: Haiku A not B, Sonnet A not B. You put it in A not B (the page: does not fit).");
});

test("Quorum is not disputed where the page and the ruling agree, where the page did not check, or with fewer than two runs", () => {
  const things = [th("a table", ["anb"], { anb: "ok" }), th("a song", ["bna"], { bna: "bad" }), th("a mule", ["nei"], { nei: "cmp" })];
  // the learner is wrong about the song and the page says so: nothing to flag
  expect(quorumDisputes(things, [run("Haiku", "anb", "anb", "nei"), run("Sonnet", "anb", "anb", "nei")], null)).toEqual([]);
  expect(quorumDisputes(things, [run("Haiku", "bna", "nei", "both")], ["bna", "nei", "both"])).toEqual([]);
  // models that differ are disputed even when the page did not check
  expect(quorumDisputes(things, [run("Haiku", "anb", "anb", "nei"), run("Sonnet", "anb", "anb", "both")], null).map((x) => x.index)).toEqual([2]);
});

test("Quorum: an example written in two cells is disputed if the ruling contradicts the page in either", () => {
  const things = [th("a pot", ["anb", "bna"], { anb: "ok", bna: "bad" })];
  expect(quorumDisputes(things, [run("Haiku", "anb"), run("Sonnet", "anb")], null)).toEqual([]);
  const d = quorumDisputes(things, [run("Haiku", "bna"), run("Sonnet", "bna")], null);
  expect(d.map((x) => x.kinds)).toEqual([["page"]]);
  expect(disputeText(d[0], things[0])).toContain("You put it in A not B (the page: fits), B not A (the page: does not fit).");
});

test("Quorum: an answer that is unsure about an example, or does not mention it, gives no cell and divides nobody", () => {
  const things = [th("a table", ["anb"], { anb: "ok" })];
  expect(quorumDisputes(things, [{ name: "Haiku", cells: [null] }, run("Sonnet", "bna")], null)).toEqual([]);
  expect(quorumDisputes(things, [{ name: "Haiku", cells: [null] }, { name: "Sonnet", cells: [null] }], null)).toEqual([]);
  // a ruling still counts when only one model gave a cell
  expect(quorumDisputes(things, [{ name: "Haiku", cells: [null] }, run("Sonnet", "bna")], ["bna"]).map((x) => [x.kinds, x.ruling])).toEqual([[["page"], "bna"]]);
});

// ---- Quorum: what the answers say of the examples ----

const fact = (label: string, ex: string, a: string, b: string) => `${label}: "${ex}" | class: Table | A ${a}: it is ${ex} | B ${b}: because it is wood`;

test("an answer's fact lines give the cell each example belongs in, from its two facts", () => {
  const text = [fact("Both", "a table", "yes", "yes"), fact("A not B", "a song", "yes", "no"), fact("B not A", "wood", "no", "yes"), fact("Neither", "a horn", "no", "no"), fact("Both", "an apple", "unsure", "yes"), "Common locus: yes."].join("\n");
  expect(readings(text).map((r) => [r.example, r.line, r.cell, r.a, r.b])).toEqual([
    ["a table", "both", "both", "yes", "yes"], ["a song", "anb", "anb", "yes", "no"], ["wood", "bna", "bna", "no", "yes"], ["a horn", "nei", "nei", "no", "no"], ["an apple", "both", null, "unsure", "yes"],
  ]);
  expect(cellOfFacts("yes", "no")).toBe("anb");
  expect(cellOfFacts("unsure", "no")).toBeNull();
  // a cell is looked up by the example, in the words of the page's own matching (case, quotes and punctuation do not matter)
  const rs = readings(text);
  expect(cellFor(rs, "A Song!")).toBe("anb");
  expect(cellFor(rs, "an apple")).toBeNull();
  expect(cellFor(rs, "a stone")).toBeNull();
});

test("the examples of several answers are gathered, with the cell each answer gave; they are divided by two different cells only", () => {
  const rows = quorumRows([
    { name: "Haiku", text: [fact("Both", "a table", "yes", "yes"), fact("Neither", "a stone", "no", "no")].join("\n") },
    { name: "Sonnet", text: [fact("Both", "A table", "yes", "no"), fact("Neither", "a stone", "unsure", "no")].join("\n") },
    { name: "Opus", text: fact("Both", "a table.", "yes", "no") },
  ]);
  expect(rows).toEqual([
    { example: "a table", lines: ["both"], cells: { Haiku: "both", Sonnet: "anb", Opus: "anb" } },
    { example: "a stone", lines: ["nei"], cells: { Haiku: "nei", Sonnet: null } },
  ]);
  expect(rows.map(divided)).toEqual([true, false]);
});

// ---- the pair-finding mode: the usual exercise the other way round ----

const named = (text: string) => nameThing(ix, text);

test("the learner's words name a category by a label (singular or plural, with an article) or stay as typed", () => {
  expect(nameThing(ix, "Forms")).toEqual({ label: "forms", cat: "form" });
  expect(nameThing(ix, "a wooden thing.")).toEqual({ label: "wooden things", cat: "wooden" });
  expect(nameThing(ix, "  the   bodies ")).toEqual({ label: "bodies", cat: "form" });
  expect(nameThing(ix, "a sound")).toEqual({ label: "sounds", cat: "snd" });
  expect(nameThing(ix, "Red apples!")).toEqual({ label: "Red apples", cat: null });
  expect(nameThing(ix, "  ")).toEqual({ label: "", cat: null });
  // two names of one category are two different words for the same thing in the course, but not the same thing to type twice
  expect(sameThing(named("forms"), named("a form"))).toBe(true);
  expect(sameThing(named("forms"), named("bodies"))).toBe(false);
  expect(sameThing(named(""), named(""))).toBe(false);
});

test("the relation to ask for is one of the five, never the one turned down, and one asked often lately comes up less", () => {
  const rng = seeded(11);
  const count = (asked: (RelKey | null | undefined)[], not?: RelKey) => {
    const n: Record<string, number> = Object.fromEntries(FIND_RELS.map((k) => [k, 0]));
    for (let i = 0; i < 800; i++) n[drawRelation(asked, rng, not)]++;
    return n;
  };
  const fresh = count([]), worn = count(["4", "4", "4", "4", "4", "4"]);
  expect(Object.keys(fresh).sort()).toEqual(["3ab", "3ba", "4", "con", "mi"]);
  for (const k of FIND_RELS) expect(fresh[k], k).toBeGreaterThan(0);
  expect(worn["4"]).toBeLessThan(fresh["4"] / 2);
  expect(worn["4"]).toBeGreaterThan(0); // the weight has a floor
  expect(count([], "mi").mi).toBe(0);
  expect(count([null, undefined, "x" as RelKey]).mi).toBeGreaterThan(0); // answers of other modes and old ones carry no relation, or an unknown one
  expect(drawRelation([], () => 0.999999999)).toBe("con"); // the last of the list is where a random source at the top ends up
});

test("the learner can name a negation, and the pair is made with that side negated", () => {
  const at = () => 1_700_000_000_000;
  for (const w of ["non-(wooden things)", "non-wooden things", "Non wooden thing.", "non-(a wooden thing)"]) expect(named(w), w).toEqual({ label: "non-(wooden things)", cat: "wooden", neg: true });
  expect(named("non-forms")).toEqual({ label: "non-forms", cat: "form", neg: true });
  expect(named("non-apples")).toEqual({ label: "non-apples", cat: null });
  expect(named("non-(non-forms)"), "a negation of a negation stays as typed").toEqual({ label: "non-(non-forms)", cat: null });
  // all wooden things are forms: with B negated, nothing is neither (what is not a form is not wooden either), so four possibilities with an empty Neither
  const b = findPair(ix, "4", named("forms"), named("non-wooden things"), seeded(4), at);
  expect(b).toMatchObject({ a: "forms", b: "non-(wooden things)", catA: "form", catB: "wooden", neg: "b", relation: "4" });
  expect(refOf(b, "nei")).toBeNull();
  // the same with A negated: the pair of the learner's order, not B's
  const a = findPair(ix, "4", named("non-wooden things"), named("forms"), seeded(4), at);
  expect(a).toMatchObject({ a: "non-(wooden things)", b: "forms", catA: "wooden", catB: "form", neg: "a", relation: "4" });
  // with the brackets switched off the learner's words are kept as the course book's plain form: "non-wooden things"
  const nb = nameThing(ix, "non-(wooden things)", false);
  expect(nb).toEqual({ label: "non-wooden things", cat: "wooden", neg: true });
  expect(findPair(ix, "4", named("forms"), nb, seeded(4), at, undefined, undefined, false)).toMatchObject({ b: "non-wooden things", catB: "wooden", neg: "b", relation: "4" });
  // a thing and its own negation have no common locus, and nothing is neither
  expect(findPair(ix, "con", named("wooden things"), named("non-wooden things"), seeded(4), at)).toMatchObject({ neg: "b", relation: "con" });
  expect(findPair(ix, "mi", named("non-forms"), named("non-bodies"), seeded(4), at)).toMatchObject({ neg: "ab", relation: "mi" });
  // a negation beside the learner's own words: the pair is the learner's own, and keeps the category of the negated side and which side it is, as a known pair does
  expect(findPair(ix, "4", named("non-wooden things"), named("red apples"), seeded(4), at)).toMatchObject({ own: true, a: "non-(wooden things)", catA: "wooden", neg: "a", b: "red apples", catB: null });
});

test("a negation of A alone moves the cells as A's own map, which is its own inverse; with B's it makes both sides", () => {
  for (const neg of ["a", "b", "ab"] as const) for (const c of CELLS) expect(NEG_CELL[neg][NEG_CELL[neg][c]], neg + " " + c).toBe(c);
  for (const c of CELLS) expect(NEG_CELL.a[NEG_CELL.b[c]]).toBe(NEG_CELL.ab[c]);
  expect([negSides({ neg: "a" }), negSides({ neg: "b" }), negSides({ neg: "ab" }), negSides({})]).toEqual([[true, false], [false, true], [true, true], [false, false]]);
  expect([isNeg("a"), isNeg("b"), isNeg("ab"), isNeg("x"), isNeg(undefined)]).toEqual([true, true, true, false, false]);
  expect(negLine({ a: "non-forms", b: "sounds", neg: "a" })).toContain('Negation: A ("non-forms") is a negation');
});

test("every attempt at a pair of this mode has an id of its own, in the form of the pair ids", () => {
  expect(findId(seeded(1), () => 1_700_000_000_000)).toMatch(/^f-[0-9a-z]+$/);
  expect(findId(seeded(1), () => 1_700_000_000_000)).not.toBe(findId(seeded(2), () => 1_700_000_000_000));
  expect(findId()).not.toBe(findId());
});

test("a pair the data can judge is made as the draw makes its pairs, under the learner's labels; any other is the learner's own", () => {
  const at = () => 1_700_000_000_000;
  const known = findPair(ix, "3ab", named("wooden things"), named("a form"), seeded(4), at);
  expect(known).toMatchObject({ a: "wooden things", b: "forms", catA: "wooden", catB: "form", relation: "3ab" });
  expect(known.id).toMatch(/^f-[0-9a-z]+$/);
  expect(known.own).toBeUndefined();
  expect(known.generated).toBeUndefined();
  expect(known.note).toBeTruthy();
  expect(known).toEqual(findPair(ix, "3ab", named("wooden things"), named("a form"), seeded(4), at));
  // the relation of a known pair is the one its categories have, not the one asked for
  expect(findPair(ix, "mi", named("wooden things"), named("a form"), seeded(4), at).relation).toBe("3ab");
  // two labels of one category are a pair of the course too (mutually inclusive)
  expect(findPair(ix, "4", named("forms"), named("bodies"), seeded(4), at)).toMatchObject({ a: "forms", b: "bodies", catA: "form", catB: "form", relation: "mi" });
  // a pair the data lists as no-pair, an everyday category beside a sense one, a phenomenon of the learner's own: nothing is known about it
  for (const [x, y] of [["gray things", "wooden things"], ["plain things", "wooden things"], ["red apples", "pears"], ["forms", "red apples"]]) {
    const p = findPair(ix, "4", named(x), named(y), seeded(4), at);
    expect(p, x + "/" + y).toMatchObject({ own: true, relation: "4", ex: {}, why: {}, typeA: "", typeB: "" });
    expect(p.id).toMatch(/^f-[0-9a-z]+$/);
  }
  expect(findPair(ix, "4", named("forms"), named("red apples"), seeded(4), at)).toMatchObject({ a: "forms", catA: "form", b: "red apples", catB: null });
  expect(judgeable(ix, "gray", "wooden")).toBe(false);
  expect(() => findPair(ix, "4", named("forms"), named("a form"))).toThrow(RangeError);
  expect(() => findPair(ix, "4", named("pears"), named("Pears."))).toThrow(RangeError);
});

test("pairOf makes the pair of two categories under any labels, and makePair is the same with the labels drawn", () => {
  const at = () => 1_700_000_000_000;
  const a = pairOf(ix, "wooden", "gray", "wooden things", "gray things", seeded(9), at);
  expect(a).toMatchObject({ a: "wooden things", b: "gray things", relation: "4", generated: true });
  expect(a.id).toMatch(/^g-/);
});

test("a known pair is graded in the pair-finding mode as in the usual exercise, with the relation asked for as the relation chosen", () => {
  const p = findPair(ix, "3ab", named("wooden things"), named("forms"), seeded(1));
  const right = (rel: RelKey) => Object.fromEntries(CELLS.map((c) => [c, { t: REL[rel].empty.includes(c) ? "" : refOf(p, c) || "", none: REL[rel].empty.includes(c) }])) as Record<CellId, { t: string; none: boolean }>;
  const good = gradeFind(ix, p, { rel: "3ab", cells: right("3ab") });
  expect(good.overall).toBe("ok");
  expect(good).toEqual(grade(ix, p, { rel: "3ab", cells: right("3ab") }));
  expect(good.relOpen).toBeUndefined();
  // a pair that does not have the relation asked for is wrong, though its examples are checked
  const wrong = gradeFind(ix, p, { rel: "mi", cells: right("3ab") });
  expect(wrong.relOk).toBe(false);
  expect(wrong.overall).toBe("bad");
  expect(wrong.relOpen).toBeUndefined();
  expect(() => gradeFind(ix, p, { rel: null, cells: right("3ab") })).toThrow();
});

test("the learner's own pair is not decided by the page: the relation and the examples are left to the tutor", () => {
  const p = findPair(ix, "mi", named("red apples"), named("pears"), seeded(1));
  const r = gradeFind(ix, p, { rel: "mi", cells: cellsOf({ both: "a red pear", nei: "a stone" }, ["anb", "bna"]) });
  expect(r).toMatchObject({ relOk: false, relOpen: true, overall: "pend" });
  expect(CELLS.map((c) => r.cells[c].v)).toEqual(["cmp", "open", "open", "cmp"]);
  expect(r.cells.anb.msg).toEqual(["Empty by the relation. ", "Claude checks that nothing goes here."]);
  expect(r.cells.both.kind).toBe("ex");
  expect(r.cells.anb.kind).toBe("occ");
  expect([r.occBad, r.exBad, r.exOpen, r.exN]).toEqual([0, 0, 2, 2]);
  // as in the usual exercise, a cell the relation leaves empty, or one the learner marks empty, is not read for text; the tutor says whether it is right to leave it
  expect(gradeFind(ix, p, { rel: "mi", cells: cellsOf({ both: "x", anb: "y", nei: "z" }) }).cells.anb.v).toBe("open");
  expect(gradeFind(ix, p, { rel: "4", cells: cellsOf({ both: "x", anb: "y", nei: "z" }, ["bna"]) }).cells.bna.v).toBe("open");
  // a cell the relation leaves possible with nothing in it is missing, but nothing is final until the tutor has said whether the pair has the relation
  const gap = gradeFind(ix, p, { rel: "4", cells: cellsOf({ both: "x", anb: "y", bna: "z" }) });
  expect(gap.cells.nei).toMatchObject({ v: "bad", kind: "occ" });
  expect([gap.occBad, gap.overall, gap.relOpen]).toEqual([1, "pend", true]);
});

test("the tutor's line on the relation of a pair: which relation holds, in the loose forms it may be written", () => {
  const read = (t: string, asked: RelKey) => parseRelationVerdict(t, asked);
  expect(read("Relation: Four possibilities => yes", "4")).toEqual({ answer: "yes", rel: "4" });
  expect(read("Relation: Four possibilities => YES.", "4")).toEqual({ answer: "yes", rel: "4" });
  expect(read("- **Relation**: mutually inclusive => no", "4")).toEqual({ answer: "no", rel: "mi" });
  expect(read("Relation: Three possibilities, A in B => no", "mi")).toEqual({ answer: "no", rel: "3ab" });
  expect(read("Relation: three possibilities A in B => no", "mi")).toEqual({ answer: "no", rel: "3ab" });
  expect(read("Relation: Three possibilities, B in A => no", "3ab")).toEqual({ answer: "no", rel: "3ba" });
  expect(read("Relation: Mutually exclusive => no", "3ba")).toEqual({ answer: "no", rel: "con" });
  // four possibilities without neither (a pair with a negation) is four possibilities
  expect(read("Relation: Four possibilities without neither => yes", "4")).toEqual({ answer: "yes", rel: "4" });
  expect(read("Relation: none of them => unsure", "4")).toEqual({ answer: "unsure", rel: null });
  expect(read("Relation: => no", "4")).toEqual({ answer: "no", rel: null }); // wrong, but it says not which relation the pair has
  // the relation named wins over the yes or no when the two disagree
  expect(read("Relation: Mutually exclusive => yes", "4")).toEqual({ answer: "no", rel: "con" });
  expect(read("Relation: Four possibilities => no", "4")).toEqual({ answer: "unsure", rel: null });
  // the first line counts; lines without a verdict, and other lines, do not
  expect(read("Both: x => yes\nRelation: Four possibilities\nRelation: Mutually inclusive => no\nRelation: Four possibilities => yes", "4")).toEqual({ answer: "no", rel: "mi" });
  expect(read("Both: x => yes", "4")).toBeNull();
  expect(read("", "4")).toBeNull();
  expect(parseRelationVerdict(null, "4")).toBeNull();
  expect(parseRelationVerdict(undefined, "4")).toBeNull();
});

test("the tutor's verdict on the relation settles the relation, the pair's own relation, and the cells the relation asked for leaves empty", () => {
  const own = (asked: RelKey, none: CellId[]) => {
    const p = findPair(ix, asked, named("red apples"), named("pears"), seeded(1));
    return { p, res: gradeFind(ix, p, { rel: asked, cells: cellsOf(Object.fromEntries(CELLS.filter((c) => !none.includes(c)).map((c) => [c, "x " + c])), none) }) };
  };
  // yes: the relation asked for holds, so the cells it leaves empty are right
  let { p, res } = own("mi", ["anb", "bna"]);
  expect(applyRelationVerdict(p, res, { answer: "yes", rel: "mi" })).toBe(true);
  expect([res.relOpen, res.relOk, p.relation, res.cells.anb.v, res.cells.anb.msg[0], res.overall]).toEqual([false, true, "mi", "ok", "Right, empty. ", "pend"]);
  // the examples are still to be checked; once they are, the answer is ok
  expect(applyVerdicts(p, res, parseVerdicts("Both: x => yes\nNeither: y => yes"))).toBe(2);
  expect(res.overall).toBe("ok");
  // a second verdict changes nothing
  expect(applyRelationVerdict(p, res, { answer: "no", rel: "4" })).toBe(false);
  expect([res.relOk, p.relation]).toEqual([true, "mi"]);
  // no, and the pair has four possibilities: nothing is empty, so the cells marked empty are wrong
  ({ p, res } = own("mi", ["anb", "bna"]));
  expect(applyRelationVerdict(p, res, { answer: "no", rel: "4" })).toBe(true);
  expect([res.relOpen, res.relOk, p.relation, res.cells.anb.v, res.cells.bna.v, res.overall]).toEqual([false, false, "4", "bad", "bad", "bad"]);
  expect(res.cells.anb.msg[0]).toBe("Not empty. ");
  // no, and the pair has three possibilities (A in B): A not B is empty for it too, B not A is not
  ({ p, res } = own("mi", ["anb", "bna"]));
  applyRelationVerdict(p, res, { answer: "no", rel: "3ab" });
  expect([p.relation, res.cells.anb.v, res.cells.anb.msg[0], res.cells.bna.v]).toEqual(["3ab", "ok", "Right, empty. ", "bad"]);
  // no, without saying which relation the pair has: the cells stay open
  ({ p, res } = own("mi", ["anb", "bna"]));
  applyRelationVerdict(p, res, { answer: "no", rel: null });
  expect([res.relOpen, res.relOk, p.relation, res.cells.anb.v, res.overall]).toEqual([false, false, "mi", "open", "bad"]);
  // yes, but the learner marked a cell empty that the relation leaves possible: it is wrong, as the usual exercise shows a counter-example
  ({ p, res } = own("4", ["bna"]));
  applyRelationVerdict(p, res, { answer: "yes", rel: "4" });
  expect([res.relOk, res.cells.bna.v, res.cells.bna.msg[0], res.overall]).toEqual([true, "bad", "Not empty. ", "part"]);
  // unsure: nothing is settled, the question is closed
  ({ p, res } = own("4", []));
  expect(applyRelationVerdict(p, res, { answer: "unsure", rel: null })).toBe(true);
  expect([res.relOpen, res.relUns, res.overall, p.relation]).toEqual([true, true, "pend", "4"]);
  // a pair of the data has its relation graded already
  const known = findPair(ix, "3ab", named("wooden things"), named("forms"), seeded(1));
  const kr = gradeFind(ix, known, { rel: "3ab", cells: cellsOf({ both: "a gray wooden table", bna: "a thought" }, ["anb"]) });
  expect(applyRelationVerdict(known, kr, { answer: "no", rel: "4" })).toBe(false);
});

test("a blank cell the asked relation leaves possible is right after all when the relation the pair has leaves it empty", () => {
  const blank = (asked: RelKey, verdict: Parameters<typeof applyRelationVerdict>[2], left: CellId = "bna") => {
    const p = findPair(ix, asked, named("red apples"), named("pears"), seeded(1));
    const res = gradeFind(ix, p, { rel: asked, cells: cellsOf(Object.fromEntries(CELLS.filter((c) => c !== left).map((c) => [c, "x " + c]))) }); // one cell is left blank (B not A)
    expect([res.cells[left].v, res.cells[left].msg[0], res.occBad]).toEqual(["bad", "Missing. ", 1]);
    applyRelationVerdict(p, res, verdict);
    return res;
  };
  // four possibilities was asked and the pair is mutually inclusive: nothing goes in B not A, so the blank was right (the example in A not B is the one cell wrong)
  let res = blank("4", { answer: "no", rel: "mi" });
  expect([res.cells.bna.v, res.cells.bna.msg[0], res.cells.anb.v, res.occBad, res.overall]).toEqual(["ok", "Right, empty. ", "bad", 1, "bad"]);
  // the pair has the relation asked for, or another one that leaves the cell possible, or the tutor names none: it stays missing
  res = blank("4", { answer: "yes", rel: "4" });
  expect([res.cells.bna.v, res.occBad]).toEqual(["bad", 1]);
  res = blank("4", { answer: "no", rel: "3ab" });
  expect([res.cells.bna.v, res.occBad]).toEqual(["bad", 2]); // the other is the example in A not B, which three possibilities (A in B) leaves empty
  res = blank("4", { answer: "no", rel: null });
  expect([res.cells.bna.v, res.occBad]).toEqual(["bad", 1]);
  // Both is the cell mutually exclusive things leave empty
  res = blank("4", { answer: "no", rel: "con" }, "both");
  expect([res.cells.both.v, res.cells.both.msg[0], res.occBad]).toEqual(["ok", "Right, empty. ", 0]);
});

test("an example in a cell the relation the pair has leaves empty is a cell filled wrongly, whatever the tutor said of the example", () => {
  const settled = (verdicts: Parameters<typeof applyVerdicts>[2], rel: RelKey | null) => {
    const p = findPair(ix, "4", named("red apples"), named("pears"), seeded(1));
    const res = gradeFind(ix, p, { rel: "4", cells: cellsOf({ both: "a", anb: "b", bna: "c", nei: "d" }) }); // four possibilities was asked and every cell is filled
    applyVerdicts(p, res, verdicts);
    applyRelationVerdict(p, res, { answer: "no", rel });
    return res;
  };
  const wrong = (res: ReturnType<typeof settled>) => [res.cells.anb, res.cells.bna].map((r) => [r.v, r.kind, r.msg[0], r.uns]);
  // the pair is mutually inclusive: A not B and B not A stay empty, whether the tutor turned the examples down, took them or could not tell
  for (const answer of ["no", "yes", "unsure"] as const) {
    const res = settled([{ cell: "anb", answer }, { cell: "bna", answer }], "mi");
    expect(wrong(res), answer).toEqual([["bad", "occ", "Nothing goes here. ", false], ["bad", "occ", "Nothing goes here. ", false]]);
    expect([res.occBad, res.exBad, res.exN, res.overall]).toEqual([2, 0, 2, "bad"]);
  }
  // the examples in the cells that mutual inclusion leaves possible are still the tutor's to settle
  expect(settled([], "mi").cells.both.v).toBe("cmp");
  // three possibilities (A in B) empties A not B only
  expect(wrong(settled([], "3ab")).map((r) => r[0])).toEqual(["bad", "cmp"]);
  // when the tutor names no relation for the pair, the examples stay to be checked
  expect(wrong(settled([], null)).map((r) => r[0])).toEqual(["cmp", "cmp"]);
});

test("a pair of the learner's own gets no reference example from the page when the tutor turns an example down", () => {
  const p = findPair(ix, "4", named("red apples"), named("pears"), seeded(1));
  const res = gradeFind(ix, p, { rel: "4", cells: cellsOf({ both: "x", anb: "y", bna: "z", nei: "the horn of a rabbit" }) });
  applyVerdicts(p, res, [{ cell: "nei", answer: "no" }, { cell: "both", answer: "unsure" }]);
  expect(res.cells.nei.msg).toEqual(["Does not fit", "", "by Claude"]);
  expect(res.cells.both.msg[1]).toBe("Claude could not settle it; see below.");
  // a pair of the practice list keeps its example
  const known = findPair(ix, "4", named("wooden things"), named("forms"), seeded(1));
  const kr = gradeFind(ix, known, { rel: "4", cells: cellsOf({ nei: "x" }) });
  kr.cells.nei = { v: "cmp", msg: ["Not checked. ", ""], kind: "ex" };
  applyVerdicts(known, kr, [{ cell: "nei", answer: "no" }]);
  expect(kr.cells.nei.msg[1]).toBe(". Example: " + known.ex!.nei + ".");
});

test("the tutor alone places the examples of a pair of the learner's own, also when both phenomena are categories the data cannot judge", () => {
  const own = findPair(ix, "mi", named("gray things"), named("wooden things"), seeded(1));
  expect(own.own).toBe(true);
  expect([own.catA, own.catB]).toEqual(["gray", "wooden"]); // listed as a pair the data cannot judge (nopair)
  const line = 'Both: "a wooden chair" | class: Form | A yes: it is painted gray | B yes: it is made of wood';
  const terms = { a: "a gray thing", b: "a wooden thing" };
  // the tutor accepts the chair as both; the data would say it is not gray, but this is not a pair the data answers for
  expect(parseVerdicts(line, { ix, p: own, terms })).toEqual([{ cell: "both", answer: "yes" }]);
  expect(noteParts(parseFactLine(line)!, false, { ix, p: own, terms }).some((n) => n.kind === "end")).toBe(false);
  // the same line for a pair the data does answer for is placed by the data
  const known = { ...own, own: false };
  expect(parseVerdicts(line, { ix, p: known, terms })).toEqual([{ cell: "both", answer: "no" }]);
  expect(noteParts(parseFactLine(line)!, false, { ix, p: known, terms }).some((n) => n.kind === "end")).toBe(true);
});

test("the learner's words name a category of the real data also in the singular form of a compound label", () => {
  const cat = (t: string) => nameThing(rix, t);
  expect(cat("a thing that changes")).toEqual({ label: "things that change", cat: "ft" });
  expect(cat("A thing you can eat.")).toEqual({ label: "things you can eat", cat: "food" });
  expect(cat("an object of eye consciousness")).toEqual({ label: "objects of eye consciousness", cat: "vis" });
  expect(cat("a sense consciousness").cat).toBe("sense");
  expect(cat("the metal things")).toEqual({ label: "metal things", cat: "metal" });
  expect(cat("a thing that changes").label).not.toBe("functional things"); // the label shown is the one the words matched, not the first of the category
  expect(cat("a thing that changes slowly").cat).toBeNull();
  // two spellings of one phrase are the same phenomenon to type twice
  expect(sameThing(cat("a thing you can eat"), cat("things you can eat"))).toBe(true);
  // a loose match never takes a label of another category: every label still names its own category
  for (const c of real.cats) for (const l of c.labels) expect(rix.CAT[nameThing(rix, l).cat as string].labels, l).toContain(l);
});

test("asking Claude again about a pair of the learner's own replaces what it said about the examples before, and never what the page graded", () => {
  const p = findPair(ix, "4", named("red apples"), named("pears"), seeded(1));
  const fresh = () => gradeFind(ix, p, { rel: "4", cells: cellsOf({ both: "a", anb: "b", nei: "c" }) }); // B not A is left blank: the page graded it "Missing"
  const first: Parameters<typeof applyVerdicts>[2] = [{ cell: "both", answer: "no" }, { cell: "anb", answer: "yes" }, { cell: "bna", answer: "yes" }];
  const second: Parameters<typeof applyVerdicts>[2] = [{ cell: "both", answer: "yes" }, { cell: "anb", answer: "unsure" }, { cell: "bna", answer: "yes" }];
  // as it was: the first verdicts stand
  let res = fresh();
  applyVerdicts(p, res, first);
  expect(applyVerdicts(p, res, second)).toBe(0); // nothing is open any more
  expect([res.cells.both.v, res.cells.anb.v]).toEqual(["bad", "ok"]);
  // asked again: the second answer settles the cells Claude settled before
  res = fresh();
  applyVerdicts(p, res, first);
  applyVerdicts(p, res, second, true);
  expect([res.cells.both.v, res.cells.both.by, res.cells.anb.v, res.cells.anb.uns]).toEqual(["ok", "claude", "cmp", true]);
  // the cell the page graded itself (left blank, "Missing") is never taken over by a verdict
  expect([res.cells.bna.v, res.cells.bna.msg[0], res.cells.bna.by]).toEqual(["bad", "Missing. ", undefined]);
});

test("every label of every category of the real data names that category, and its plural or singular too", () => {
  for (const c of real.cats) {
    for (const l of c.labels) {
      const n = nameThing(rix, l);
      if (n.cat !== c.id) expect(rix.LABELIDX[l.toLowerCase()], `${c.id}: ${l} is also a label of another category`).toBeDefined(); // two categories may share a label; then the label names the one the index has
      expect(n.label.length, l).toBeGreaterThan(0);
    }
  }
  const cats = new Set(real.cats.flatMap((c) => c.labels.map((l) => nameThing(rix, l).cat)));
  expect(cats.size).toBeGreaterThan(real.cats.length * 0.9);
  expect(nameThing(rix, "a form").cat).toBe("form");
  expect(nameThing(rix, "the unicorn")).toEqual({ label: "the unicorn", cat: null });
});

test("for every pair the page can draw, naming it and asking for its relation is graded ok; asking for another relation is not", () => {
  const rng = seeded(31);
  for (const e of realPool) {
    const drawn = makePair(rix, e, rng), why = `${pairKey(e)} ${drawn.a} / ${drawn.b}`;
    const a = nameThing(rix, drawn.a), b = nameThing(rix, drawn.b);
    if (sameThing(a, b)) continue; // the same words in two places of one category cannot be told apart
    expect(a.cat && b.cat, why).toBeTruthy();
    const p = findPair(rix, drawn.relation, a, b, rng);
    expect(p.own, why).toBeUndefined();
    const asked = p.relation, cells = Object.fromEntries(CELLS.map((c) => [c, { t: REL[asked].empty.includes(c) ? "" : refOf(p, c) || "", none: REL[asked].empty.includes(c) }])) as Record<CellId, { t: string; none: boolean }>;
    const r = gradeFind(rix, p, { rel: asked, cells });
    expect(r.relOk, why).toBe(true);
    expect(CELLS.map((c) => r.cells[c].v).filter((v) => v === "bad"), why).toEqual([]);
    expect(["ok", "pend"], why).toContain(r.overall);
    if (e.a !== e.b) expect(r.overall, why).toBe("ok");
    const other = FIND_RELS.find((k) => k !== asked && !(asked === "3ab" || asked === "3ba" ? ["3ab", "3ba"] : []).includes(k)) as RelKey;
    const wrong = gradeFind(rix, p, { rel: other, cells });
    expect(wrong.relOk, why).toBe(false);
    expect(wrong.overall, why).toBe("bad");
  }
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

// ---- placing a reference example by its classes ----
//   Form and Consciousness are functional things and exclude each other; Permanent excludes Functional thing; Color is an
//   external form; a non-existent excludes every existent.

const refIx = () => makeIndex({
  terms: {
    Existent: { name: "Existent", ch: "I" },
    "Functional thing": { name: "Functional thing", ch: "I", parent: "Existent" },
    Permanent: { name: "Permanent", ch: "I", parent: "Existent", contra: ["Functional thing"] },
    Form: { name: "Form", ch: "I", parent: "Functional thing", contra: ["Consciousness"] },
    Consciousness: { name: "Consciousness", ch: "I", parent: "Functional thing" },
    "External form": { name: "External form", ch: "I", parent: "Form" },
    Color: { name: "Color", ch: "I", parent: "External form" },
    "Non-existent": { name: "Non-existent", ch: "I", contra: ["Existent"] },
  },
  chains: {},
  cats: [
    { id: "form", kind: "dudra", term: "Form", labels: ["forms"], type: "form" },
    { id: "extf", kind: "dudra", term: "External form", labels: ["external forms"], type: "form" },
    { id: "cons", kind: "dudra", term: "Consciousness", labels: ["consciousnesses"], type: "consciousness" },
    { id: "perm", kind: "dudra", term: "Permanent", labels: ["permanent phenomena"], type: "permanent" },
    { id: "round", kind: "everyday", labels: ["round things"], type: "form: things that are round" },
    { id: "moods", kind: "everyday", labels: ["moods"], type: "consciousness: moods" },
  ],
  items: [],
  bodySkip: [],
});
const placed = (ex: Parameters<typeof placeByClass>[1]) => {
  const ix = refIx();
  return Object.fromEntries(ix.DATA.cats.map((c) => [c.id, placeByClass(ix, ex, c)]));
};

test("placeByClass: yes up the chain to a Dudra category's term, no by an exclusion, and nothing it cannot prove", () => {
  expect(placed({ cls: ["Color"] })).toEqual({ form: "yes", extf: "yes", cons: "no", perm: "no", round: null, moods: "no" });
  // the class is the category's term itself; a class above the term says nothing about it
  expect(placed({ cls: ["Form"] })).toEqual({ form: "yes", extf: null, cons: "no", perm: "no", round: null, moods: "no" });
});

test("placeByClass: what an example is not, and a non-existent, prove a no", () => {
  expect(placed({ cls: ["Form"], not: ["External form"] }).extf).toBe("no");
  expect(placed({ cls: ["Functional thing"], not: ["Form"] })).toEqual({ form: "no", extf: "no", cons: null, perm: "no", round: "no", moods: null });
  expect(Object.values(placed({ cls: ["Non-existent"], ne: true }))).toEqual(Array(6).fill("no"));
  expect(Object.values(placed({ ne: true }))).toEqual(Array(6).fill("no"));
});

test("placeByClass: passes over classes the data does not have, and leaves out a side the data says both of", () => {
  expect(placed({ cls: ["Unheard-of class", "Color"] })).toEqual(placed({ cls: ["Color"] }));
  expect(Object.values(placed({ cls: ["Unheard-of class"] }))).toEqual(Array(6).fill(null));
  expect(Object.values(placed({}))).toEqual(Array(6).fill(null));
  expect(placed({ cls: ["Color"], not: ["Form"] }).form, "a wrong class in the data shows as no answer, not a wrong one").toBeNull();
});

test("drawable: confirmed and textbook examples of the stages that are on, never a commentator's", () => {
  // an example without a stage of its own is at its level's: level 1 is stage 6
  expect(drawable({ cf: "confirmed", lv: 2 }, [6, 7])).toBe(true);
  expect(drawable({ cf: "textbook", lv: 1 }, [6, 7])).toBe(true);
  expect(drawable({ cf: "textbook", lv: 3 }, [6, 7])).toBe(false);
  expect(drawable({ cf: "textbook", lv: 1 }, [7, 8])).toBe(false);
  expect(drawable({ cf: "textbook", lv: 3, st: 2 }, [1, 2])).toBe(true);
  expect(drawable({ cf: "commentator", lv: 1 }, [1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(false);
  expect(drawable({ lv: 1 }, [1, 2, 3, 4, 5, 6, 7, 8, 9])).toBe(false);
});

// ---- learned facts: what the analyses said of a learner's example, per category ----

const op = (model: string, a: Answer, b: Answer, judge = false): Opinion => ({ name: model, model, judge, cls: "Table", sides: [{ answer: a, say: `${model} says ${a}; pervasion: whatever` }, { answer: b, say: `${model} says ${b}.` }] });

test("an example is kept by its words as the lookup compares them, and not at all when it is too long", () => {
  expect(factKey("A Grey Table!")).toBe("gray table");
  expect(factKey("  the colour of a pot ")).toBe("color of a pot");
  expect(factKey("")).toBeNull();
  expect(factKey("x".repeat(81))).toBeNull();
  expect(factKey("x".repeat(80))).toBe("x".repeat(80));
});

test("an answer's opinion of an example is its first line about it that is sure of something", () => {
  const text = [fact("Both", "A table", "unsure", "unsure"), "Common locus: a table.", fact("A not B", "a table", "yes", "no"), fact("Both", "a stone", "no", "no")].join("\n");
  expect(opinionOf(text, "the table")).toEqual({ cls: "Table", sides: [{ answer: "yes", say: "it is a table" }, { answer: "no", say: "because it is wood" }] });
  expect(opinionOf(fact("Both", "a table", "unsure", "unsure"), "table")?.sides.map((s) => s.answer)).toEqual(["unsure", "unsure"]);
  expect(opinionOf(text, "a song")).toBeNull();
});

test("one explain question settles a side of an example by how far its answers agree", () => {
  const side = (r: Ruling | null) => r && [r.answer, r.strength];
  expect(side(ruleSide([op("Sonnet", "yes", "no")], null, 0))).toEqual(["yes", "single"]);
  expect(side(ruleSide([op("Haiku", "yes", "no"), op("Sonnet", "yes", "no"), op("Opus", "yes", "no")], null, 1))).toEqual(["no", "unanimous"]);
  expect(side(ruleSide([op("Haiku", "unsure", "no"), op("Sonnet", "yes", "no"), op("Opus", "yes", "no")], null, 0))).toEqual(["yes", "partial"]);
  // divided: the judge rules, or else the majority; on a tie the strongest model (the last) has it
  expect(side(ruleSide([op("Haiku", "no", "no"), op("Sonnet", "yes", "no"), op("Opus", "yes", "no")], op("Judge", "no", "no", true), 0))).toEqual(["no", "ruled"]);
  expect(side(ruleSide([op("Haiku", "no", "no"), op("Sonnet", "yes", "no"), op("Opus", "yes", "no")], null, 0))).toEqual(["yes", "split"]);
  expect(side(ruleSide([op("Sonnet", "no", "no"), op("Opus", "yes", "no")], op("Judge", "unsure", "no", true), 0))).toEqual(["yes", "split"]);
  // the judge was asked about another side: it is unanimous here only if every model agrees with it
  expect(side(ruleSide([op("Haiku", "yes", "no"), op("Opus", "yes", "yes")], op("Judge", "yes", "no", true), 0))).toEqual(["yes", "unanimous"]);
  expect(side(ruleSide([op("Haiku", "no", "no"), op("Opus", "no", "yes")], op("Judge", "yes", "no", true), 0))).toEqual(["yes", "ruled"]);
  expect(ruleSide([], null, 0)).toBeNull();
  const r = ruleSide([op("Haiku", "yes", "no"), op("Opus", "yes", "no")], null, 0)!;
  expect(r.reason).toBe("Opus says yes"); // the strongest model speaks, without its pervasion
  expect(r.votes).toEqual([{ model: "Haiku", answer: "yes" }, { model: "Opus", answer: "yes" }]);
});

test("a fact becomes checked by agreement, disputed by disagreement, and only the maintainer settles a dispute", () => {
  const at = (day: string) => ({ src: "explain" as const, text: "a table", day });
  const rule = (answer: Answer, strength: Ruling["strength"]): Ruling => ({ answer, strength, reason: "r " + answer, cls: "Table", votes: [{ model: "m", answer }] });
  const one = learn(null, rule("yes", "single"), at("2026-10-19"));
  expect(one).toMatchObject({ answer: "yes", state: "candidate", agree: 1, against: 0, seen: 1, epoch: FACTS_EPOCH, first_day: "2026-10-19", last_day: "2026-10-19" });
  expect(learn(null, rule("no", "unanimous"), at("d")).state).toBe("checked");
  expect(learn(null, rule("no", "ruled"), at("d")).state).toBe("candidate");
  expect(learn(null, rule("no", "split"), at("d"))).toMatchObject({ state: "disputed", against: 1 });
  const two = learn(one, rule("yes", "single"), at("2026-10-20"));
  expect(two).toMatchObject({ state: "checked", agree: 2, seen: 2, first_day: "2026-10-19", last_day: "2026-10-20" });
  expect(learn(two, rule("unsure", "single"), at("d"))).toMatchObject({ state: "checked", agree: 2, answer: "yes", seen: 3 });
  const torn = learn(two, rule("no", "unanimous"), at("d"));
  expect(torn).toMatchObject({ state: "disputed", answer: "yes", agree: 2, against: 1 });
  expect(learn(torn, rule("yes", "unanimous"), at("d")).state).toBe("disputed");
  expect(learn(two, rule("yes", "split"), at("d")).state).toBe("disputed");
  // a first "unsure" is taken over by the first sure answer
  expect(learn(learn(null, rule("unsure", "single"), at("d")), rule("no", "single"), at("d"))).toMatchObject({ answer: "no", state: "candidate", seen: 2 });
  // an unsure row that a flag disputed stays disputed: only the maintainer closes a dispute
  const flagged: FactRow = { ...learn(null, rule("unsure", "single"), at("d")), state: "disputed" };
  expect(learn(flagged, rule("yes", "unanimous"), at("d"))).toMatchObject({ answer: "yes", state: "disputed", seen: 2 });
  // the maintainer's row is never changed by a model; an older epoch starts again
  const mine: FactRow = { ...two, state: "reviewed", src: "maintainer", answer: "no" };
  expect(learn(mine, rule("yes", "unanimous"), at("d"))).toMatchObject({ state: "reviewed", answer: "no", src: "maintainer", seen: 3 });
  expect(learn({ ...two, epoch: FACTS_EPOCH - 1 }, rule("no", "single"), at("d"))).toMatchObject({ answer: "no", state: "candidate", agree: 1, seen: 3, epoch: FACTS_EPOCH });
});

test("only a checked fact of this epoch, or the maintainer's, with a yes or no, may answer a check", () => {
  expect(servable({ state: "checked", answer: "yes", epoch: FACTS_EPOCH })).toBe(true);
  expect(servable({ state: "reviewed", answer: "no", epoch: 0 })).toBe(true);
  expect(servable({ state: "checked", answer: "yes", epoch: FACTS_EPOCH - 1 })).toBe(false);
  expect(servable({ state: "checked", answer: "unsure", epoch: FACTS_EPOCH })).toBe(false);
  for (const state of ["candidate", "disputed"] as const) expect(servable({ state, answer: "yes", epoch: FACTS_EPOCH })).toBe(false);
});

// ---- examples known without the AI: the reference examples on the device, and the server's learned facts, as the tutor's lines ----

test("a known example is written as the tutor's line, which reads back to the same facts", () => {
  const line = knownLine("A not B", 'a "red" | flower\n', { answer: "yes", reason: "it is a color | a form", cls: "Color" }, { answer: "no", reason: "", cls: "" });
  expect(line).toBe(`A not B: "a 'red' flower" | class: Color | A yes: it is a color a form | B no: `);
  expect(parseFactLine(line)).toMatchObject({ cell: "anb", example: "a 'red' flower", cls: "Color", a: { answer: "yes", say: "it is a color a form" }, b: { answer: "no", say: "" } });
  expect(knownLine("Both", "a pot", { answer: "no", reason: "r", cls: "" }, { answer: "no", reason: "s", cls: "Pot" })).toBe(`Both: "a pot" | class: Pot | A no: r | B no: s`);
});

const refPair = (own = false) => ({ a: "forms", b: "consciousnesses", relation: "con" as RelKey, catA: "form", catB: "cons", ex: {}, why: {}, ...(own ? { own: true } : {}) });
const refExamples = makeExampleIndex({
  format: "test", version: 1, sources: {},
  items: [
    { n: "a red flower", cls: ["Color"], lv: 1 },
    { n: "the horn of a rabbit", al: ["a rabbit's horn"], ne: true, lv: 2 },
    { n: "a cup", cls: ["Form"], lv: 1 },
    { n: "a cup", cls: ["Functional thing"], lv: 1 },
  ],
});

test("the reference examples settle an open example when every one of its name places it on both sides", () => {
  const ix = refIx();
  const open = [{ cell: "anb", text: "A red flower" }, { cell: "nei", text: "a rabbit's horn" }, { cell: "both", text: "a cup" }, { cell: "nei", text: "a song" }] as const;
  const lines = referenceLines(ix, refExamples, refPair(), open);
  expect(lines).toEqual([
    { cell: "anb", text: "A red flower", line: `A not B: "A red flower" | class: Color | A yes:  | B no: ` },
    { cell: "nei", text: "a rabbit's horn", line: `Neither: "a rabbit's horn" | A no: it does not exist | B no: it does not exist` },
  ]);
  expect(parseVerdicts(lines.map((l) => l.line).join("\n"))).toEqual([{ cell: "anb", answer: "yes" }, { cell: "nei", answer: "yes" }]);
  expect(referenceLines(ix, refExamples, refPair(true), open), "a pair of the learner's own").toEqual([]);
  expect(referenceLines(ix, null, refPair(), open)).toEqual([]);
  expect(referenceLines(ix, refExamples, { ...refPair(), catB: "nowhere", b: "nothing known" }, open), "a side the data does not have").toEqual([]);
});

test("an example placed on one side only is settled when that side fails the cell, and never when it could only fit", () => {
  const ix = refIx();
  // a red flower is a form; nothing says whether it is round
  const pair = { ...refPair(), b: "round things", relation: "4" as RelKey, catB: "round" };
  const open = [
    { cell: "nei", text: "a red flower" }, { cell: "anb", text: "a red flower" }, { cell: "both", text: "a red flower" }, { cell: "bna", text: "the horn of a rabbit" },
  ] as const;
  const lines = referenceLines(ix, refExamples, pair, open);
  // the horn of a rabbit does not exist, so it is placed on both sides: the whole line comes first, though it was asked about last
  expect(lines.map((l) => [l.cell, l.text, !!l.half])).toEqual([["bna", "the horn of a rabbit", false], ["nei", "a red flower", true]]);
  expect(lines[1]!.line).toBe(`Neither: "a red flower" | class: Color | A yes:  | B unsure: `);
  expect(parseVerdicts(lines[1]!.line)).toEqual([{ cell: "nei", answer: "no" }]);
  // fitting needs both sides: the same example in "A not B" or "Both" says nothing yet
  expect(lines.some((l) => l.cell === "anb" || l.cell === "both")).toBe(false);
  expect(wholeFirst([{ n: 1, half: true as const }, { n: 2 }, { n: 3, half: true as const }, { n: 4 }]).map((x) => x.n)).toEqual([2, 4, 1, 3]);
});

test("the open examples are the learner's examples still not checked, none for a pair of the learner's own", () => {
  const res = { cells: { both: { v: "ok" }, anb: { v: "cmp" }, bna: { v: "cmp" }, nei: { v: "bad" } } } as unknown as Parameters<typeof openExamples>[1];
  const things = [{ text: "a pot", cells: ["both", "anb"] as CellId[] }, { text: "a mind", cells: ["bna"] as CellId[] }];
  expect(openExamples(refPair(), res, things)).toEqual([{ cell: "anb", text: "a pot" }, { cell: "bna", text: "a mind" }]);
  expect(openExamples(refPair(), res, things, 1)).toEqual([{ cell: "anb", text: "a pot" }]);
  expect(openExamples(refPair(true), res, things)).toEqual([]);
});

test("a verdict known without the AI says where it came from, and never leaves a cell unsure", () => {
  const p = pair();
  const res = grade(ix, p, { rel: "4", cells: cellsOf({ ...perfect, both: "a gray dragon", bna: "a gray ghost", nei: "a thought" }) });
  expect(applyVerdicts(p, res, [{ cell: "both", answer: "yes" }, { cell: "bna", answer: "unsure" }], false, "course")).toBe(1);
  expect(res.cells.both).toMatchObject({ v: "ok", msg: ["Verified", "", "by the course examples"], by: "course" });
  expect(res.cells.bna.v).toBe("cmp");
  expect(applyVerdicts(p, res, [{ cell: "bna", answer: "no" }], false, "learned")).toBe(1);
  expect(res.cells.bna).toMatchObject({ v: "bad", msg: ["Does not fit", ". Example: a gray stone.", "from an earlier check"], by: "claude" });
});

test("a reason that names the pair's own letters is not kept, since the same category is the other letter in another pair", () => {
  const said = (say: string): Opinion => ({ name: "m", model: "m", judge: false, cls: "Table", sides: [{ answer: "yes", say }, { answer: "no", say: "it is round" }] });
  expect(ruleSide([said("a cabinet can be any color; a white one is B")], null, 0)?.reason).toBe("");
  expect(ruleSide([said("it is in both A and B")], null, 0)?.reason).toBe("");
  expect(ruleSide([said("A cabinet is furniture")], null, 0)?.reason, "an article is not a letter").toBe("A cabinet is furniture");
  expect(ruleSide([said("it is a form; pervasion: what is B")], null, 0)?.reason, "the pervasion is left out before").toBe("it is a form");
});

test("examplesFor: a term's own examples first, then the plainest, a spread of classes, never a statement or what the sources say it is not", () => {
  const ix = refIx();
  const ex = (n: string, cls: string[], lv: number, extra: object = {}) => ({ n, cls, lv, cf: "confirmed", ...extra });
  const items = [
    ex("a blue wall", ["Color"], 1),
    ex("a red wall", ["Color"], 1),
    ex("a green wall", ["Color"], 3),
    ex("a clay form", ["Form"], 4),
    ex("a shape of smoke", ["External form"], 2, { cf: "commentator" }),
    ex("a shape of fog", ["External form"], 2, { cf: "textbook" }),
    ex("a mind", ["Consciousness"], 1),
    ex("a rule about form", ["Form"], 1, { k: "statement" }),
    ex("a color that is not a form", ["Color"], 1, { not: ["Form"] }),
    ex("a hope", ["Unheard-of class"], 1),
  ];
  const names = (term: string, max?: number) => examplesFor(ix, items, term, max).map((i) => i.n);
  expect(names("Form")).toEqual(["a clay form", "a blue wall", "a shape of fog"]); // own first; then one of each other class, lowest level first
  expect(names("Form", 5)).toEqual(["a clay form", "a blue wall", "a shape of fog", "a red wall", "a shape of smoke"]);
  expect(names("Color")).toEqual(["a blue wall", "a color that is not a form", "a red wall"]); // what is not a form still is a color
  expect(names("External form")).toEqual(["a shape of fog", "a shape of smoke", "a blue wall"]);
  expect(names("Consciousness")).toEqual(["a mind"]);
  expect(names("Permanent")).toEqual([]);
  expect(names("Unheard-of class")).toEqual([]);
  expect(names("Form", 0)).toEqual([]);
});

// ---------- the negation track: "non-B" pairs, where nothing may be neither ----------

test("a negated side moves the things between the cells, and each move undone by itself", () => {
  const cells = { both: ["x"], anb: ["y"], bna: ["z"], nei: ["w"] };
  expect(negateCells(cells, "b")).toEqual({ both: ["y"], anb: ["x"], bna: ["w"], nei: ["z"] });
  expect(negateCells(cells, "ab")).toEqual({ both: ["w"], anb: ["z"], bna: ["y"], nei: ["x"] });
  for (const n of ["b", "ab"] as const) expect(negateCells(negateCells(cells, n), n)).toEqual(cells);
  // something both and something in each alone is four possibilities, whether or not anything is neither: the neither cell says nothing about the relation
  expect(relOfCells({ both: [1], anb: [1], bna: [1], nei: [] })).toBe("4");
  expect(relOfCells({ both: [1], anb: [1], bna: [1], nei: [1] })).toBe("4");
  expect(Object.keys(REL).sort()).toEqual(["3ab", "3ba", "4", "con", "mi"]);
  expect(negLabel("products")).toBe("non-products");
  expect(negLabel("wooden things")).toBe("non-(wooden things)");
  expect(plainLabel("non-(non-produced phenomena)")).toBe("non-produced phenomena");
  expect(plainLabel("non-food")).toBe("food");
});

test("a plain pair of four possibilities always has something neither: what does not exist is neither of any two categories", () => {
  for (const c of realPool) if (c.a !== c.b) { const cells = cellsFor(rix, c.a, c.b); if (relOfCells(cells) === "4") expect(cells.nei.length, c.a + " / " + c.b).toBeGreaterThan(0); }
});

test("a pair with B negated: its label, its cells, its relation and why a cell is empty", () => {
  const at = () => 0;
  // wooden things are physical: physical things and non-(wooden things) overlap, and nothing is neither (nor the horn of a rabbit)
  const p = pairOf(rix, "form", "wooden", "physical things", "wooden things", seeded(1), at, undefined, [1], "b");
  expect(p).toMatchObject({ a: "physical things", b: "non-(wooden things)", catA: "form", catB: "wooden", neg: "b", relation: "4" });
  expect(p.ex!.nei).toBeNull();
  expect(p.why!.nei).toBe("Whatever falls under “wooden things” also falls under “physical things”.");
  expect(refOf(p, "nei")).toBeNull();                   // the horn of a rabbit is not "neither" here
  expect(p.note).toMatch(/^“non-\(wooden things\)” takes in everything outside “wooden things”, what does not exist included\. /);
  // a wooden table is physical but not a non-(wooden thing); a metal key is both
  expect(judgeText(rix, p, "anb", "a wooden table")?.v).toBe("ok");
  expect(judgeText(rix, p, "both", "a metal key")?.v).toBe("ok");
  expect(judgeText(rix, p, "nei", "a metal key")).toMatchObject({ v: "bad", msg: ["Belongs elsewhere. ", expect.stringMatching(/ is both /)] });
  // a non-existent is taken in by the negation: here it is non-B but not A
  expect(judgeText(rix, p, "bna", "the horn of a rabbit")?.v).toBe("ok");
  // the plain pair is as before
  expect(pairOf(rix, "form", "wooden", "physical things", "wooden things", seeded(1), at, undefined, [1])).toMatchObject({ b: "wooden things", relation: "3ba" });
  expect(pairOf(rix, "form", "wooden", "physical things", "wooden things", seeded(1), at, undefined, [1]).neg).toBeUndefined();
});

test("the brackets of a negated name are a choice, and the cells and the relation do not depend on it", () => {
  expect(negLabel("wooden things", false)).toBe("non-wooden things");
  expect(negLabel("products", false)).toBe("non-products");
  expect(negLabel("wooden things", true)).toBe("non-(wooden things)");
  expect(plainLabel("non-wooden things")).toBe("wooden things");
  const make = (brackets: boolean) => pairOf(rix, "form", "wooden", "physical things", "wooden things", seeded(1), () => 0, undefined, [1], "b", brackets);
  const [without, withBrackets] = [make(false), make(true)];
  expect(without).toMatchObject({ a: "physical things", b: "non-wooden things", neg: "b", relation: "4" });
  expect({ ...without, b: withBrackets.b, note: withBrackets.note }).toEqual(withBrackets);          // the note names the label, and says what it takes in either way
  expect(without.note).toMatch(/^“non-wooden things” takes in everything outside “wooden things”/);
});

test("a pair with both sides negated: what excludes each other becomes four possibilities, with nothing neither", () => {
  const p = pairOf(rix, "form", "emotion", "forms", "emotions", seeded(2), () => 0, undefined, [1, 2, 3, 4], "ab");
  expect(relOfCells(cellsFor(rix, "form", "emotion"))).toBe("con");
  expect(p).toMatchObject({ a: "non-forms", b: "non-emotions", neg: "ab", relation: "4" });
  expect(p.ex!.nei).toBeNull();
  expect(p.why!.nei).toMatch(/Nothing is both\.$/);
  expect(judgeText(rix, p, "both", "the horn of a rabbit")?.v).toBe("ok");
});

test("a tree comes in the colors of its bark, leaves and char: only blue trees are left out of the pool, not told to be exclusive", () => {
  for (const color of ["black", "white", "red", "yellow"]) {
    const c = cellsFor(rix, color, "tree");
    expect(relOfCells(c), color + " things and trees").toBe("4");
    expect(c.both.length).toBeGreaterThan(0);
  }
  expect(cellsFor(rix, "black", "tree").both.map((i) => i.n)).toContain("a burnt tree");
  expect(relOfCells(cellsFor(rix, "black", "plant"))).toBe("4");
  expect(realPool.some((e) => [e.a, e.b].sort().join("|") === "blue|tree")).toBe(false);
});

test("a body part has a color or a temperature and a scarf a shape: those pairs are four possibilities, and yellow body parts are not asked", () => {
  for (const [a, b, item] of [["blue", "body", "blue eyes"], ["green", "body", "green eyes"], ["hot", "body", "a hot forehead"], ["clothes", "square", "a square scarf"]] as const) {
    const c = cellsFor(rix, a, b);
    expect(relOfCells(c), a + " and " + b).toBe("4");
    expect(c.both.map((i) => i.n), a + " and " + b).toContain(item);
  }
  expect(realPool.some((e) => [e.a, e.b].sort().join("|") === "body|yellow")).toBe(false);
});

test("two everyday categories of one kind with nothing in both do not give their kind as the reason", () => {
  const same = pairOf(rix, "red", "green", "red things", "green things", seeded(1), () => 0);
  expect(same.relation).toBe("con");
  expect(same.why!.both).toBe("Nothing in the practice list is both “red things” and “green things”.");
  expect(same.note).toBe("No common locus: nothing in the practice list is both red things and green things.");
  // across kinds the kind is the reason
  const across = pairOf(rix, "red", "emotion", "red things", "emotions", seeded(1), () => 0);
  expect(across.why!.both).toBe("“red things” are form; “emotions” are consciousness. Nothing is both.");
  expect(across.note).toBe("Red things are form and emotions are consciousness: no common locus.");
});

test("the tutor's facts on a negated side are read in reverse, and the tutor is told what the negation takes in", () => {
  const p = pairOf(rix, "form", "wooden", "physical things", "wooden things", seeded(1), () => 0, undefined, [1], "b");
  const f = parseFactLine("both: a metal key | A yes: it is physical | B yes: it is not wooden")!;
  expect(fitOf(f)).toBe("yes");
  const parts = noteParts(f, false, { ix: rix, p, terms: { a: "a physical thing", b: "a non-(wooden thing)" } });
  expect(parts.filter((x) => x.kind === "term").map((x) => x.kind === "term" && x.not)).toEqual([false, false]);
  expect(parts.some((x) => x.kind === "end")).toBe(false);
  expect(negLine(p)).toMatch(/^Negation: B \("non-\(wooden things\)"\) is a negation of the category in "negation_of"/);
  expect(negLine({ a: "x", b: "y" })).toBe("");
  const body = cardBody(rix, p, { rel: "4", cells: { both: { t: "", none: false }, anb: { t: "", none: false }, bna: { t: "", none: false }, nei: { t: "", none: true } }, res: grade(rix, p, { rel: "4", cells: { both: {}, anb: {}, bna: {}, nei: { none: true } } }) } as never);
  expect(body).toContain('"negation_of":');
  expect(body).toContain("Correct relation: Four possibilities.");
  expect(body).toContain('an empty Neither ("nothing exists") is then right');
  // what is not known of the categories themselves is the tutor's to check, and nothing is asked of the server
  expect(openExamples(p, { cells: { both: { v: "cmp", msg: [], kind: "ex" } } as never }, [{ text: "a pebble", cells: ["both"] }])).toEqual([]);
  // the general rule that only Neither takes what does not exist is set aside on this pair, in the card and in the question
  expect(negLine(p)).toContain("replaces the rule above that only Neither takes what does not exist");
  const res = { cells: { both: { v: "cmp" }, anb: { v: "ok" }, bna: { v: "ok" }, nei: { v: "ok" } } } as never;
  expect(explainAsk({ res }, true)).toContain('as no for a plain term and yes for a "non-" term');
  expect(explainAsk({ res })).toContain("but in Neither a non-existent");
  // a flag on the pair is reviewed on the server with the negation
  expect(readReviewAnswer({ chosen: "4", pair: { a: p.a, b: p.b, relation: p.relation, neg: "b" } })?.pair.neg).toBe("b");
  const req = reviewRequest(rix, { what: "the explanation", shown: "It is four possibilities." } as never, readReviewAnswer({ chosen: "4", pair: { ...p }, cells: {} })!);
  expect(req).toContain('Negation: B ("non-(wooden things)")');
  expect(req).toContain('"negation_of":');
  expect(readReviewAnswer({ chosen: null, pair: { a: p.a, b: p.b, relation: p.relation, neg: "x" } })?.pair.neg).toBeUndefined();
});

test("the negation track: about a third of the pairs negated, both sides only when asked, and none when off", () => {
  const count = (negation?: "one" | "both") => {
    const st = { hist: [] as HistoryEntry[], recent: [] as string[], rng: seeded(7), now: () => 0, stages: [1, 2, 3, 4, 5, 6], ...(negation ? { negation } : {}) };
    const n: Record<string, number> = { none: 0, a: 0, b: 0, ab: 0 };
    for (let i = 0; i < 300; i++) {
      const p = nextPair(rix, realPool, st);
      n[p.neg ?? "none"]++;
      negSides(p).forEach((on, i) => on && expect(i ? p.b : p.a, p.neg).toMatch(/^non-/));
      // the examples show the relation: a cell has one exactly where the cells of the data are filled (a negated label with its own category,
      // "tastes" and "non-(objects of tongue consciousness)", leaves nothing that is neither, and stays mutually exclusive)
      const shown = Object.fromEntries(CELLS.map((c) => [c, refOf(p, c) ? [c] : []])) as Record<CellId, string[]>;
      expect(relOfCells(shown), p.a + " / " + p.b).toBe(p.relation);
      if (p.neg) expect(p.relation).toBe(relOfCells(negateCells(cellsFor(rix, p.catA!, p.catB!), p.neg)));
    }
    return n;
  };
  expect(count()).toEqual({ none: 300, a: 0, b: 0, ab: 0 });
  // one side is A or B alike, as the tutors negate either ("non-colors" and "form sources", "tangible objects" and "non-(form sources)")
  const one = count("one");
  expect(one.ab).toBe(0);
  expect(one.a + one.b).toBeGreaterThan(60);
  expect(one.a + one.b).toBeLessThan(140);
  expect(one.a).toBeGreaterThan(25);
  expect(one.b).toBeGreaterThan(25);
  const both = count("both");
  expect(both.ab).toBeGreaterThan(20);
  expect(both.a + both.b).toBeGreaterThan(20);
});

test("a term's names by language: Tibetan with its Wylie, Chinese in traditional and simplified with pinyin, and only the languages that are on", () => {
  const t = openData.terms["Sound source" as keyof typeof openData.terms] as Parameters<typeof termNames>[0];
  expect(termNames(t, [])).toEqual([]);
  expect(termNames(t, ["bo", "zh"]).map((n) => n.main + n.rest)).toEqual(["སྒྲའི་སྐྱེ་མཆེད (sgra'i skye mched)", "聲處（声处，shēng chù）"]);
  // always in the order of LANGS, whatever the order they were ticked in; Russian and Sanskrit are plain
  expect(termNames(t, ["skt", "ru"]).map((n) => n.id + ":" + n.main + n.rest)).toEqual(["ru:база звука", "skt:śabdāyatana"]);
  // the simplified form is left out where it is the same, and a name a term lacks leaves its language out
  expect(termNames({ zh: "色", zhs: "色", py: "sè" }, ["zh", "bo", "ru"])).toEqual([{ id: "zh", lang: "zh-Hant", main: "色", rest: "（sè）" }]);
  expect(termNames({ wylie: "gzugs" }, ["bo"])).toEqual([{ id: "bo", lang: "", main: "gzugs", rest: "" }]);
  // every term of the course has a name in each language that names it
  for (const [name, term] of Object.entries(openData.terms)) {
    const names = termNames(term as Parameters<typeof termNames>[0], ["bo", "zh"]);
    expect(names.map((n) => n.id), name).toEqual(["bo", "zh"]);
    expect(names[0]!.rest, name).toBe(` (${term.wylie})`);
  }
  expect(LANGS.map((l) => l.id)).toEqual(["ru", "bo", "skt", "zh"]);
});

test("a stored choice of languages is read as the name-only languages in order, and anything else as none", () => {
  expect(normLangs('["zh","bo","bo","xx","ru"]')).toEqual(["bo", "zh"]);
  expect(normLangs(["skt"])).toEqual(["skt"]);
  for (const bad of [null, undefined, "", "bo", "{", 3, {}]) expect(normLangs(bad)).toEqual([]);
});
