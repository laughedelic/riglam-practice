// "Find an instance", Categories the other way round: one to three practice categories are shown, and the learner names something that is in
// all of them, or says that nothing is. A set is asked only where the data settles it. Something is in all of them when a practice item is (the
// list's own categories). Nothing is when two of them exclude each other: by the term data, a class up one's chain marked as excluding a class
// up the other's (`contra`: no form is a consciousness), or as two course categories the list has nothing in common for, the pairs Relations
// calls apart. Two everyday categories that only happen to share no item ("white things", "furniture") are never asked as impossible: the
// list is not complete for them. A named thing is graded by the list when it is a practice item, by its classes when it is a reference example
// (`placeByClass`), and stays open otherwise. With the stages of the learning ladder a set is asked once each of its categories is open, and,
// where something is in all of them, once a thing in all of them is known; where nothing is, once the reason can be said (`setStage`). A practice
// item named is told as Categories tells it at those stages (`itemRows` of place.ts: plain words at first, a person kept out of the physical
// categories until the hold's stage). Pure functions of the data and of a random source, like the pair draw.
import type { Cat, DrillData, Item } from "../ai-shared/data";
import { matchExamples } from "../ai-shared/examples";
import type { Example, ExampleIndex } from "../ai-shared/examples";
import { leavesOpen, matchItem } from "../ai-shared/lookup";
import type { DataIndex } from "../ai-shared/lookup";
import { catChain, excludes, rung, termPhrase } from "./ladder";
import { itemRows as placeItemRows } from "./place";
import { placeByClass } from "./reference";
import { askedKey, termCats, wordsFor } from "./intro";
import { HOLD_STAGE, MAX_STAGE, catOpen, catStage, heldBack, itemStage, physical, topStage } from "./stages";
import type { Stages, Unmet } from "./stages";
import { FEATURE, cellsFor, inUniverse, judgeable, relOfCells } from "./universe";
import type { PairWords, Rng } from "./universe";
import { cap, pick } from "./util";

/** Why nothing is in all the categories: two of them that exclude each other, and the sentence that says so. */
export interface Apart {
  a: string;
  b: string;
  why: string;
}

export interface InstanceQuestion {
  /** the categories asked (ids), in the order shown */
  cats: string[];
  /** the label each is shown under */
  labels: string[];
  /** something is in all of them; when not, `apart` says why nothing is */
  possible: boolean;
  /** the practice items in all of them (names), those the learner knows at `stages` */
  known: string[];
  apart: Apart | null;
  /** the stages it was asked at: what is shown and how it is told follow them; none: every stage */
  stages?: number[];
}

/** How a category is said after "it is": "made of wood", "a sound", "a functional thing". */
export function catPhrase(cat: Cat): string {
  return cat.phrases?.[0] ?? (cat.term ? termPhrase(cat.term) : "one of the " + cat.labels[0]);
}
/** The class of the category's own term, the first of its chain, which a sentence need not repeat. */
const own = (cat: Cat, cls: string) => cat.kind === "dudra" && cat.term === cls;
/** Every stage on: a question asked without stages is told as at the last one. */
const ALL: Stages = Array.from({ length: MAX_STAGE }, (_, i) => i + 1);
/** The Dudra category of a class, if the data has one. */
const catOfTerm = (ix: DataIndex, term: string) => ix.DATA.cats.find((c) => c.kind === "dudra" && c.term === term);
/** The two classes a beginner meets before their names, in the words Categories says them in (place.ts): Form is anything physical at stage 1, a consciousness is a mind until the established bases. */
const PLAIN: Readonly<Record<string, string>> = { Form: "physical", Consciousness: "a mind" };
/** Whether the class is said in plain words at these stages. */
function plainAt(ix: DataIndex, term: string, on?: Stages): boolean {
  if (!on || !(term in PLAIN)) return false;
  const cat = catOfTerm(ix, term);
  return term === "Form" ? topStage(on) < 2 : !cat || !catOpen(cat, on);
}
/** The stage from which a class can be said in a reason: from the start in plain words, else when its category opens (never, without one). */
const wordsStage = (ix: DataIndex, term: string) => (term in PLAIN ? 1 : catStage(catOfTerm(ix, term) ?? { st: Infinity }));

/**
 * Why nothing is in both categories, or null when the data cannot show it: an exclusion up their chains ("Whatever is made of wood is a
 * form, whatever is an emotion is a consciousness, and nothing is both a form and a consciousness."), or two course categories with nothing in
 * common in the list. Null too for a pair the data does not judge (`judgeable`), and when the list has something in both, which an exclusion
 * would contradict.
 */
export function apartOf(ix: DataIndex, a: string, b: string, on?: Stages): Apart | null {
  const r = apartWhy(ix, a, b, false, on);
  return r && { a, b, why: r.why };
}
// the reason, its key and the stage from which it can be said: the two classes that exclude each other, or "course" for two course categories
// the list keeps apart. `apart`: the pair is known to be judged, with nothing in both. `on`: the classes a beginner has no name for yet are
// said in plain words ("physical", "a mind")
function apartWhy(ix: DataIndex, a: string, b: string, apart = false, on?: Stages): { why: string; key: string; st: number } | null {
  const A = ix.CAT[a], B = ix.CAT[b];
  if (!A || !B || a === b || (!apart && (!judgeable(ix, a, b) || cellsFor(ix, a, b).both.length))) return null;
  const cb = catChain(ix, B), say = (t: string) => (plainAt(ix, t, on) ? PLAIN[t] : termPhrase(t));
  for (const x of catChain(ix, A)) {
    const y = cb.find((t) => excludes(ix, x, t));
    if (!y) continue;
    const sides = [own(A, x) ? "" : `whatever is ${catPhrase(A)} is ${say(x)}`, own(B, y) ? "" : `whatever is ${catPhrase(B)} is ${say(y)}`].filter(Boolean);
    const end = `nothing is both ${say(x)} and ${say(y)}.`;
    return { why: cap(sides.length ? sides.join(", ") + ", and " + end : end), key: [x, y].sort().join("|"), st: Math.max(wordsStage(ix, x), wordsStage(ix, y)) };
  }
  if (A.kind === "dudra" && B.kind === "dudra") return { why: `Nothing is both ${catPhrase(A)} and ${catPhrase(B)}: they have no common locus.`, key: "course", st: 1 };
  return null;
}

/** Whether the practice item is in every one of the categories, each of them a category the list can tell for it (`inUniverse`, pair by pair). */
export function inAll(ix: DataIndex, it: Item, cats: readonly string[]): boolean {
  if (it.ne || !cats.every((c) => it.c.includes(c))) return false;
  return cats.every((a, i) => cats.slice(i).every((b) => inUniverse(ix, it, a, b)));
}

/** The key of a set of categories, the same in any order. */
export const instanceKey = (cats: readonly string[]): string => [...cats].sort().join("|");
// the key of each set of the pool, made once: a draw looks at every set of a kind
const keys = new WeakMap<readonly string[], string>();
const keyOf = (set: readonly string[]) => { let k = keys.get(set); if (k === undefined) keys.set(set, (k = instanceKey(set))); return k; };

/** The stage at which the learner knows the item as a thing in the set: its own, or the hold's for a person or a permanent thing when one of them is physical, as in the pairs (`itemStageFor`). */
export function itemStageIn(ix: DataIndex, it: Item, set: readonly string[]): number {
  const s = itemStage(it);
  return s < HOLD_STAGE && heldBack(ix, it) && set.some((c) => physical(ix, ix.CAT[c])) ? HOLD_STAGE : s;
}
/** Whether the learner with these stages on knows the item as a thing in the set; every item when no stages are given. */
const knownAt = (ix: DataIndex, it: Item, set: readonly string[], on?: Stages) => !on || itemStageIn(ix, it, set) <= topStage(on);
/**
 * The stage from which the set is asked: the highest at which one of its categories opens, and at least, for a set something is in, the lowest
 * at which a thing in all of them is known (`items`, the items in all of them), and for a set where nothing can be, the stage from which its
 * reason can be said (`said`: "nothing is both a form and a non-associated compositional factor" waits for the course's words).
 */
export function setStage(ix: DataIndex, set: readonly string[], items: readonly Item[] = [], said = 1): number {
  const cats = Math.max(said, ...set.map((c) => catStage(ix.CAT[c])));
  return items.length ? Math.max(cats, Math.min(...items.map((it) => itemStageIn(ix, it, set)))) : cats;
}

/** A set of the pool and the stage from which it is asked (`setStage`). */
interface Staged { set: string[]; st: number }
/** Every set that can be asked, by kind; made once per data. */
interface Pool {
  /** single categories with an item */
  one: Staged[];
  /** pairs with an item in both, and their relation */
  two: (Staged & { r: string })[];
  /** pairs that exclude each other, grouped by the reason (the two excluding classes, or the course's own), so that the reasons come up more evenly than the pairs */
  apart: Staged[][];
  /** triples with an item in all three, no one of them inside another */
  three: Staged[];
  /** triples with a pair that excludes each other and a third category that overlaps one of them */
  threeApart: Staged[];
}
const pools = new WeakMap<DrillData, Pool>();

function poolOf(ix: DataIndex): Pool {
  const hit = pools.get(ix.DATA);
  if (hit) return hit;
  const ids = Object.keys(ix.CAT), items = ix.DATA.items;
  // each pair's relation and what the list has in both, once: "" for a pair the data does not judge
  const rels = new Map<string, { r: string; both: Item[] }>(), pairOf = (a: string, b: string) => {
    const k = instanceKey([a, b]);
    let p = rels.get(k);
    if (!p) {
      const cells = judgeable(ix, a, b) ? cellsFor(ix, a, b) : null;
      rels.set(k, (p = cells ? { r: relOfCells(cells), both: cells.both } : { r: "", both: [] }));
    }
    return p;
  };
  const relOf = (a: string, b: string) => pairOf(a, b).r;
  const one: Staged[] = [];
  for (const a of ids) { const ins = items.filter((it) => inAll(ix, it, [a])); if (ins.length) one.push({ set: [a], st: setStage(ix, [a], ins) }); }
  const two: Pool["two"] = [], byWhy = new Map<string, Staged[]>();
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j], r = relOf(a, b);
      if (!r) continue;
      if (r !== "con") { const ins = pairOf(a, b).both.filter((it) => inAll(ix, it, [a, b])); if (ins.length) two.push({ set: [a, b], r, st: setStage(ix, [a, b], ins) }); continue; }
      const why = apartWhy(ix, a, b, true);
      if (why) byWhy.set(why.key, [...(byWhy.get(why.key) ?? []), { set: [a, b], st: setStage(ix, [a, b], [], why.st) }]);
    }
  }
  const overlap = (a: string, b: string) => relOf(a, b) === "4";
  // a triple is found from each item in all three; it keeps the lowest stage of them
  const threes = new Map<string, Staged | null>();
  for (const it of items) {
    const cs = it.c.filter((c) => ix.CAT[c]);
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) for (let k = j + 1; k < cs.length; k++) {
      const set = [cs[i], cs[j], cs[k]], key = instanceKey(set), had = threes.get(key);
      if (had === null) continue;
      if (had === undefined && !(overlap(set[0], set[1]) && overlap(set[0], set[2]) && overlap(set[1], set[2]))) { threes.set(key, null); continue; }
      if (!inAll(ix, it, set)) continue;
      const st = setStage(ix, set, [it]);
      if (!had || st < had.st) threes.set(key, { set: had?.set ?? set, st });
    }
  }
  const three = [...threes.values()].filter((t): t is Staged => !!t);
  const apart = [...byWhy.values()], threeApart: Staged[] = [];
  for (const { set: [a, b], st } of apart.flat()) {
    for (const c of ids) {
      if (c === a || c === b || !relOf(a, c) || !relOf(b, c)) continue;
      if (overlap(a, c) || overlap(b, c)) threeApart.push({ set: [a, b, c], st: Math.max(st, setStage(ix, [a, b, c])) });
    }
  }
  const pool = { one, two, apart, three, threeApart };
  pools.set(ix.DATA, pool);
  return pool;
}

export interface InstanceDraw {
  rng: Rng;
  /** keys of the sets asked lately (`instanceKey`), passed over while others remain */
  avoid?: ReadonlySet<string>;
  /** the stages that are on (the learner's switches): only sets asked from the highest of them or below (`setStage`); every set when absent */
  stages?: Stages;
  /** the Dudra categories whose term the learner has not met yet (intro.ts): a set with one of them waits, unless nothing else can be asked */
  unmet?: Unmet;
  /** the terms met whose last answer is not right yet, at any stage (intro.ts, openTerms): `newShare` of the sets (half when absent) have one of them, while any can be asked */
  open?: ReadonlySet<string>;
  newShare?: number;
}

/** How often each size of set is asked, and how often a set of two or three is one where nothing can be. */
export const SIZES: Readonly<Record<1 | 2 | 3, number>> = { 1: 0.15, 2: 0.5, 3: 0.35 };
export const APART_SHARE = 0.4;
/** A kind of set the data has few of is asked less: its weight is at most its number of sets over this, so that each of them comes up about once in this many questions at most (somewhat more often when other kinds are short too). */
export const SPREAD = 60;

const weighted = <T>(xs: readonly T[], w: (x: T) => number, rng: Rng): T | undefined => {
  if (!xs.length) return undefined;
  let x = rng() * xs.reduce((s, v) => s + w(v), 0);
  for (const v of xs) if ((x -= w(v)) < 0) return v;
  return xs[xs.length - 1];
};
const shuffle = <T>(xs: readonly T[], rng: Rng): T[] => {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
};
// a pair in both of whose categories something is: mostly two that overlap, sometimes one inside the other ("a color that is a visible form")
const REL_W: Record<string, number> = { "4": 1, "3ab": 0.35, "3ba": 0.35, mi: 0.1 };

/**
 * The question for a set of categories: in a random order, each under a random label, with what is in all of them or why nothing is. With
 * `on`, the things in all of them are those the learner knows at these stages. With `words`, a label that names a term the learner has not met
 * waits, and an open one is said (intro.ts, wordsFor).
 */
export function instanceQuestion(ix: DataIndex, set: readonly string[], rng: Rng, on?: Stages, words?: PairWords): InstanceQuestion {
  const cats = shuffle(set, rng), labels = cats.map((c) => pick(wordsFor(ix, c, ix.CAT[c].labels, words?.unmet, words?.open), rng));
  const known = ix.DATA.items.filter((it) => inAll(ix, it, cats) && knownAt(ix, it, cats, on)).map((it) => it.n);
  let apart: Apart | null = null;
  for (let i = 0; i < cats.length && !apart; i++) for (let j = i + 1; j < cats.length && !apart; j++) apart = apartOf(ix, cats[i], cats[j], on);
  return { cats, labels, possible: !apart && known.length > 0, known: apart ? [] : known, apart, ...(on ? { stages: [...on] } : {}) };
}

/**
 * The next set to ask: its size by `SIZES`, and for two or three categories, by `APART_SHARE`, one where nothing can be; a kind with few sets
 * less often (`SPREAD`). Pairs where nothing can be come by their reason first, a reason with more pairs a little more often. Sets asked
 * lately (`avoid`) wait while others remain; with `stages`, only the sets asked at them; a set with a term not met yet (`unmet`) waits, and `newShare`
 * of the sets have one of the stage's `open` terms. Null when the data has nothing to ask.
 */
export function drawInstance(ix: DataIndex, draw: InstanceDraw): InstanceQuestion | null {
  // the sets with an open term for a share of the questions; if there are none, or none to ask, the set of any open category, and last the sets with a term not met yet
  const open = draw.open?.size && draw.rng() < (draw.newShare ?? 0.5) ? draw.open : undefined;
  const plans: [Unmet | undefined, ReadonlySet<string> | undefined][] = [[draw.unmet, open]];
  if (open) plans.push([draw.unmet, undefined]);
  if (draw.unmet?.size) plans.push([undefined, undefined]);
  for (const [unmet, lean] of plans) { const q = askSet(ix, draw, unmet, lean); if (q) return q; }
  return null;
}

function askSet(ix: DataIndex, draw: InstanceDraw, unmet?: Unmet, open?: ReadonlySet<string>): InstanceQuestion | null {
  const pool = poolOf(ix), rng = draw.rng, fresh = (s: { set: readonly string[] }) => !draw.avoid?.has(keyOf(s.set));
  const top = draw.stages ? topStage(draw.stages) : Infinity;
  const lean = open && termCats(open);
  const at = <T extends Staged>(sets: readonly T[]) => sets.filter((s) => s.st <= top && !(unmet?.size && s.set.some((c) => unmet.has(c))) && (!lean || s.set.some((c) => lean.has(c))));
  const choose = <T extends Staged>(sets: readonly T[], w: (s: T) => number = () => 1) => (weighted(sets.filter(fresh), w, rng) ?? weighted(sets, w, rng))?.set;
  const one = at(pool.one), two = at(pool.two), apart = pool.apart.map(at).filter((g) => g.length), three = at(pool.three), threeApart = at(pool.threeApart);
  const kinds = [
    { n: one.length, w: SIZES[1], set: () => choose(one) },
    { n: two.length, w: SIZES[2] * (1 - APART_SHARE), set: () => choose(two, (t) => REL_W[t.r] ?? 0) },
    { n: apart.flat().length, w: SIZES[2] * APART_SHARE, set: () => { const g = weighted(apart, (x) => Math.sqrt(x.length), rng); return g && choose(g); } },
    { n: three.length, w: SIZES[3] * (1 - APART_SHARE), set: () => choose(three) },
    { n: threeApart.length, w: SIZES[3] * APART_SHARE, set: () => choose(threeApart) },
  ];
  for (let tries = 0; tries < 6; tries++) {
    const set = weighted(kinds, (k) => Math.min(k.w, k.n / SPREAD), rng)?.set();
    if (!set) continue;
    const q = instanceQuestion(ix, set, rng, draw.stages, { unmet: draw.unmet, open: draw.open });
    if (q.possible || q.apart) return q;
  }
  return null;
}

/** One category for the thing named: whether it is in it (null when the data cannot tell), and why. */
export interface InstanceRow {
  cat: string;
  label: string;
  answer: boolean | null;
  /** why, after "because": "it is a color, which is a visible form"; "" when the data says no more than the answer */
  reason: string;
  /** a second sentence when the reason needs one (the exclusion that makes a "no") */
  why: string;
}

/**
 * What the classes (or the list) say of a thing and a category, as a reason: the steps up the "is a" chain, or the exclusion that makes a "no".
 * `cls` are the thing's classes, lowest first. Without such steps a "no" for an everyday category is only the list's word, and says so.
 */
function reasonOf(ix: DataIndex, cls: readonly string[], cat: Cat, label: string, answer: boolean, ne?: boolean): { reason: string; why: string } {
  if (ne) return { reason: "it does not exist", why: "" };
  const subject = cat.kind === "dudra" && cat.term ? termPhrase(cat.term) : "whatever is " + catPhrase(cat);
  for (const c of cls) {
    if (!Object.hasOwn(ix.DATA.terms, c)) continue;
    const r = rung(ix, c, cat, subject, "");
    if (r && (r.answer === "yes") === answer) return { reason: r.reason, why: r.why };
  }
  if (answer) return { reason: "it is " + catPhrase(cat), why: "" };
  return { reason: cat.kind === "dudra" ? "it is not " + catPhrase(cat) : "the practice list does not count it among the " + label, why: "" };
}

// the list leaves a whole thing out of the sense objects (its color or its sound is one; whether the thing is one is a question of its own), a body out of the categories skipped for it,
// and a feature its name does not say ("a wooden chair" may be red); a person, a permanent thing or what does not exist waits for the hold's stage in a physical category
const untold = (it: Item, cat: Cat) => leavesOpen(it, cat.id) ? "“" + it.n + "” leaves open whether it is " + catPhrase(cat)
  : (it.comp && cat.sense) || it.body ? "whether " + (it.comp && cat.sense ? "a whole thing" : "a body") + " is " + catPhrase(cat) + " is left open here"
  : "whether it is " + catPhrase(cat) + " is left for a later stage";

/**
 * The rows for a practice item at the stages `on` (every stage when absent): the list's own categories say yes and no, told as Categories tells
 * them (`itemRows` of place.ts). `loose` is the learner's word when it was a short name of the item ("ball" for "a red ball"), which leaves its
 * color, material, shape and warmth open (`FEATURE`), as it does in the pairs.
 */
export function itemRows(ix: DataIndex, it: Item, cats: readonly string[], labels: readonly string[], loose?: string, on: Stages = ALL): InstanceRow[] {
  const told = new Map(placeItemRows(ix, it, on).map((r) => [r.cat, r]));
  return cats.map((c, i) => {
    const row = { cat: c, label: labels[i] ?? ix.CAT[c].labels[0] }, r = told.get(c);
    if (loose && FEATURE.has(c) && inUniverse(ix, it, c, c)) return { ...row, answer: null, reason: "“" + loose + "” leaves open whether it is " + catPhrase(ix.CAT[c]), why: "" };
    return r ? { ...row, answer: r.answer, reason: r.reason, why: r.why } : { ...row, answer: null, reason: untold(it, ix.CAT[c]), why: "" };
  });
}

/** The rows for a reference example: placed by its classes (`placeByClass`), which can show only a "no" for an everyday category. */
export function exampleRows(ix: DataIndex, exs: readonly Example[], cats: readonly string[], labels: readonly string[]): InstanceRow[] {
  // a name several examples share is placed only where they all agree, as the references of Relations are (known.ts)
  const cls = exs.flatMap((ex) => ex.cls ?? []), not = exs.flatMap((ex) => ex.not ?? []), ne = exs.every((ex) => ex.ne);
  return cats.map((c, i) => {
    const row = { cat: c, label: labels[i] ?? ix.CAT[c].labels[0] }, got = new Set(exs.map((ex) => placeByClass(ix, ex, ix.CAT[c]))), p = got.size === 1 ? [...got][0] : null;
    if (!p) return { ...row, answer: null, reason: "the course data does not say whether it is " + catPhrase(ix.CAT[c]), why: "" };
    const answer = p === "yes", r = reasonOf(ix, cls, ix.CAT[c], row.label, answer, ne);
    const said = !answer && !r.why && not.find((n) => catChain(ix, ix.CAT[c]).includes(n));
    return { ...row, answer, ...(said ? { reason: "the sources say it is not " + termPhrase(said), why: "" } : r) };
  });
}

/** The learner's answer: a thing, or that nothing is in all of them. */
export type InstanceAnswer = { none: true } | { none?: false; text: string };

export interface InstanceResult {
  /** right, wrong, or open: a thing the data does not know (or cannot place in every category) */
  v: "ok" | "bad" | "open";
  /** the thing as the data names it, else as written; "" for "nothing is" */
  thing: string;
  /** where the data knows the thing from: the practice list, the reference examples, or nowhere */
  from: "item" | "example" | null;
  /** the categories for the thing named; none for "nothing is", or for a thing the data does not know */
  rows: InstanceRow[];
  /** where the answer is not right and something is in all of them: a practice item that is, with its rows */
  example: { thing: string; rows: InstanceRow[] } | null;
}

/**
 * The thing the learner's words name: a practice item, or the reference examples of that name when one has classes. A short name of an item
 * ("ball") comes back `loose` where a category is about a feature (a color, a material), since the name does not say which (`itemRows`).
 */
export function nameOf(ix: DataIndex, cats: readonly string[], text: string, ex?: ExampleIndex | null): { item: Item; loose?: boolean } | { exs: Example[] } | null {
  const item = matchItem(ix, text, true);
  if (item) return { item };
  const found = ex ? matchExamples(ex, text) : [];
  if (found.some((e) => e.ne || e.cls?.length)) return { exs: found };
  const alias = matchItem(ix, text);
  return alias ? { item: alias, loose: cats.some((c) => FEATURE.has(c)) } : null;
}

/** Grades the answer: "nothing is" is right exactly when nothing can be; a thing is right when the data places it in every category. */
export function gradeInstance(ix: DataIndex, q: InstanceQuestion, ans: InstanceAnswer, ex?: ExampleIndex | null, rng: Rng = Math.random): InstanceResult {
  const sample = () => {
    if (!q.possible || !q.known.length) return null;
    const name = pick(q.known, rng), it = ix.DATA.items.find((i) => i.n === name)!;
    return { thing: it.n, rows: itemRows(ix, it, q.cats, q.labels, undefined, q.stages) };
  };
  if (ans.none === true) return { v: q.possible ? "bad" : "ok", thing: "", from: null, rows: [], example: sample() };
  const text = ans.text.trim(), named = nameOf(ix, q.cats, text, ex);
  if (!named) return { v: q.possible ? "open" : "bad", thing: text, from: null, rows: [], example: sample() };
  const rows = "item" in named ? itemRows(ix, named.item, q.cats, q.labels, named.loose ? text : undefined, q.stages) : exampleRows(ix, named.exs, q.cats, q.labels);
  const thing = "item" in named ? (named.loose ? text : named.item.n) : named.exs[0].n, from = "item" in named ? "item" : "example";
  const v = !q.possible || rows.some((r) => r.answer === false) ? "bad" : rows.every((r) => r.answer) ? "ok" : "open";
  return { v, thing, from, rows, example: v === "ok" ? null : sample() };
}

/**
 * The course terms a checked answer grades (intro.ts, afterQuestion): a right thing is in every category of the set, so each of them was right; a right
 * "nothing is" shows that the two categories that exclude each other do. A wrong or open answer grades nothing: here a mistake is mostly about
 * knowing the thing, as in Syllogisms and Find a pair, which count only right answers as well. With the data, a category said under the label of a
 * named term grades that term ("matter": matter, not form; intro.ts, askedKey).
 */
export function instanceGraded(q: InstanceQuestion, res: Pick<InstanceResult, "v">, none: boolean, ix?: DataIndex): { cat: string; ok: boolean }[] {
  if (res.v !== "ok") return [];
  const key = (cat: string) => (ix ? askedKey(ix, cat, q.labels[q.cats.indexOf(cat)]) : cat);
  return (none && q.apart ? [q.apart.a, q.apart.b] : q.cats).map((cat) => ({ cat: key(cat), ok: true }));
}
