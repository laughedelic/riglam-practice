// "Find an instance", Categories the other way round: one to three practice categories are shown, and the learner names something that is in
// all of them, or says that nothing is. A set is asked only where the data settles it. Something is in all of them when a practice item is (the
// list's own categories). Nothing is when two of them exclude each other: by the term data, a class up one's chain marked as excluding a class
// up the other's (`contra`: no form is a consciousness), or as two course categories the list has nothing in common for, the pairs Relations
// calls apart. Two everyday categories that only happen to share no item ("white things", "furniture") are never asked as impossible: the
// list is not complete for them. A named thing is graded by the list when it is a practice item, by its classes when it is a reference example
// (`placeByClass`), and stays open otherwise. Pure functions of the data and of a random source, like the pair draw.
import type { Cat, DrillData, Item } from "../ai-shared/data";
import { matchExamples } from "../ai-shared/examples";
import type { Example, ExampleIndex } from "../ai-shared/examples";
import { matchItem } from "../ai-shared/lookup";
import type { DataIndex } from "../ai-shared/lookup";
import { catChain, excludes, rung, termPhrase } from "./ladder";
import { placeByClass } from "./reference";
import { FEATURE, cellsFor, inUniverse, judgeable, relOfCells } from "./universe";
import type { Rng } from "./universe";
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
  /** the practice items in all of them (names) */
  known: string[];
  apart: Apart | null;
}

/** How a category is said after "it is": "made of wood", "a sound", "a functional thing". */
export function catPhrase(cat: Cat): string {
  return cat.phrases?.[0] ?? (cat.term ? termPhrase(cat.term) : "one of the " + cat.labels[0]);
}
/** The class of the category's own term, the first of its chain, which a sentence need not repeat. */
const own = (cat: Cat, cls: string) => cat.kind === "dudra" && cat.term === cls;

/**
 * Why nothing is in both categories, or null when the data cannot show it: an exclusion up their chains ("Whatever is made of wood is a
 * form, whatever is an emotion is a consciousness, and nothing is both a form and a consciousness."), or two course categories with nothing in
 * common in the list. Null too for a pair the data does not judge (`judgeable`), and when the list has something in both, which an exclusion
 * would contradict.
 */
export function apartOf(ix: DataIndex, a: string, b: string): Apart | null {
  const r = apartWhy(ix, a, b);
  return r && { a, b, why: r.why };
}
// the reason, and its key: the two classes that exclude each other, or "course" for two course categories the list keeps apart. `apart`: the
// pair is known to be judged, with nothing in both
function apartWhy(ix: DataIndex, a: string, b: string, apart = false): { why: string; key: string } | null {
  const A = ix.CAT[a], B = ix.CAT[b];
  if (!A || !B || a === b || (!apart && (!judgeable(ix, a, b) || cellsFor(ix, a, b).both.length))) return null;
  const cb = catChain(ix, B);
  for (const x of catChain(ix, A)) {
    const y = cb.find((t) => excludes(ix, x, t));
    if (!y) continue;
    const sides = [own(A, x) ? "" : `whatever is ${catPhrase(A)} is ${termPhrase(x)}`, own(B, y) ? "" : `whatever is ${catPhrase(B)} is ${termPhrase(y)}`].filter(Boolean);
    const end = `nothing is both ${termPhrase(x)} and ${termPhrase(y)}.`;
    return { why: cap(sides.length ? sides.join(", ") + ", and " + end : end), key: [x, y].sort().join("|") };
  }
  if (A.kind === "dudra" && B.kind === "dudra") return { why: `Nothing is both ${catPhrase(A)} and ${catPhrase(B)}: they have no common locus.`, key: "course" };
  return null;
}

/** Whether the practice item is in every one of the categories, each of them a category the list can tell for it (`inUniverse`, pair by pair). */
export function inAll(ix: DataIndex, it: Item, cats: readonly string[]): boolean {
  if (it.ne || !cats.every((c) => it.c.includes(c))) return false;
  return cats.every((a, i) => cats.slice(i).every((b) => inUniverse(ix, it, a, b)));
}

/** The key of a set of categories, the same in any order. */
export const instanceKey = (cats: readonly string[]): string => [...cats].sort().join("|");

/** Every set that can be asked, by kind; made once per data. */
interface Pool {
  /** single categories with an item */
  one: string[];
  /** pairs with an item in both, and their relation */
  two: { set: string[]; r: string }[];
  /** pairs that exclude each other, grouped by the reason (the two excluding classes, or the course's own) so that each reason comes up as often */
  apart: string[][][];
  /** triples with an item in all three, no one of them inside another */
  three: string[][];
  /** triples with a pair that excludes each other and a third category that overlaps one of them */
  threeApart: string[][];
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
  const one = ids.filter((a) => items.some((it) => inAll(ix, it, [a])));
  const two: Pool["two"] = [], byWhy = new Map<string, string[][]>();
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j], r = relOf(a, b);
      if (!r) continue;
      if (r !== "con") { if (pairOf(a, b).both.some((it) => inAll(ix, it, [a, b]))) two.push({ set: [a, b], r }); continue; }
      const why = apartWhy(ix, a, b, true);
      if (why) byWhy.set(why.key, [...(byWhy.get(why.key) ?? []), [a, b]]);
    }
  }
  const overlap = (a: string, b: string) => relOf(a, b) === "4";
  const seen = new Set<string>(), three: string[][] = [];
  for (const it of items) {
    const cs = it.c.filter((c) => ix.CAT[c]);
    for (let i = 0; i < cs.length; i++) for (let j = i + 1; j < cs.length; j++) for (let k = j + 1; k < cs.length; k++) {
      const set = [cs[i], cs[j], cs[k]], key = instanceKey(set);
      if (seen.has(key)) continue;
      seen.add(key);
      if (overlap(set[0], set[1]) && overlap(set[0], set[2]) && overlap(set[1], set[2]) && inAll(ix, it, set)) three.push(set);
    }
  }
  const apart = [...byWhy.values()], threeApart: string[][] = [];
  for (const [a, b] of apart.flat()) {
    for (const c of ids) {
      if (c === a || c === b || !relOf(a, c) || !relOf(b, c)) continue;
      if (overlap(a, c) || overlap(b, c)) threeApart.push([a, b, c]);
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
}

/** How often each size of set is asked, and how often a set of two or three is one where nothing can be. */
export const SIZES: readonly [number, number][] = [[1, 0.15], [2, 0.5], [3, 0.35]];
export const APART_SHARE = 0.4;

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

/** The question for a set of categories: in a random order, each under a random label, with what is in all of them or why nothing is. */
export function instanceQuestion(ix: DataIndex, set: readonly string[], rng: Rng): InstanceQuestion {
  const cats = shuffle(set, rng), labels = cats.map((c) => pick(ix.CAT[c].labels, rng));
  const known = ix.DATA.items.filter((it) => inAll(ix, it, cats)).map((it) => it.n);
  let apart: Apart | null = null;
  for (let i = 0; i < cats.length && !apart; i++) for (let j = i + 1; j < cats.length && !apart; j++) apart = apartOf(ix, cats[i], cats[j]);
  return { cats, labels, possible: !apart && known.length > 0, known: apart ? [] : known, apart };
}

/**
 * The next set to ask: its size by `SIZES`, and for two or three categories, by `APART_SHARE`, one where nothing can be. Sets asked lately
 * (`avoid`) wait while others remain. Null when the data has nothing to ask.
 */
export function drawInstance(ix: DataIndex, draw: InstanceDraw): InstanceQuestion | null {
  const pool = poolOf(ix), rng = draw.rng, fresh = (s: { set: readonly string[] }) => !draw.avoid?.has(instanceKey(s.set));
  const choose = <T extends { set: string[] }>(sets: readonly T[], w: (s: T) => number = () => 1) => (weighted(sets.filter(fresh), w, rng) ?? weighted(sets, w, rng))?.set;
  const plain = (sets: readonly string[][]) => sets.map((set) => ({ set }));
  for (let tries = 0; tries < 6; tries++) {
    const size = weighted(SIZES, ([, w]) => w, rng)![0], apart = size > 1 && rng() < APART_SHARE;
    let set: string[] | undefined;
    if (size === 1) set = choose(plain(pool.one.map((c) => [c])));
    else if (size === 2 && apart) { const group = pool.apart.length ? pick(pool.apart, rng) : null; set = group ? choose(plain(group)) : undefined; }
    else if (size === 2) set = choose(pool.two, (t) => REL_W[t.r] ?? 0);
    else set = choose(plain(apart ? pool.threeApart : pool.three));
    if (!set) continue;
    const q = instanceQuestion(ix, set, rng);
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

// the list leaves a whole thing out of the sense objects (its color or its sound is one; whether the thing is one is a question of its own), and a body out of the categories skipped for it
const untold = (it: Item, cat: Cat) => "whether " + (it.comp && cat.sense ? "a whole thing" : "a body") + " is " + catPhrase(cat) + " is left open here";

/**
 * The rows for a practice item: the list's own categories say yes and no. `loose` is the learner's word when it was a short name of the item
 * ("ball" for "a red ball"), which leaves its color, material, shape and warmth open (`FEATURE`), as it does in the pairs.
 */
export function itemRows(ix: DataIndex, it: Item, cats: readonly string[], labels: readonly string[], loose?: string): InstanceRow[] {
  return cats.map((c, i) => {
    const row = { cat: c, label: labels[i] ?? ix.CAT[c].labels[0] };
    if (!inUniverse(ix, it, c, c)) return { ...row, answer: null, reason: untold(it, ix.CAT[c]), why: "" };
    if (loose && FEATURE.has(c)) return { ...row, answer: null, reason: "“" + loose + "” leaves open whether it is " + catPhrase(ix.CAT[c]), why: "" };
    const answer = it.c.includes(c);
    return { ...row, answer, ...reasonOf(ix, [it.t], ix.CAT[c], row.label, answer, it.ne) };
  });
}

/** The rows for a reference example: placed by its classes (`placeByClass`), which can show only a "no" for an everyday category. */
export function exampleRows(ix: DataIndex, ex: Example, cats: readonly string[], labels: readonly string[]): InstanceRow[] {
  return cats.map((c, i) => {
    const row = { cat: c, label: labels[i] ?? ix.CAT[c].labels[0] }, p = placeByClass(ix, ex, ix.CAT[c]);
    if (!p) return { ...row, answer: null, reason: "the course data does not say whether it is " + catPhrase(ix.CAT[c]), why: "" };
    const answer = p === "yes", r = reasonOf(ix, ex.cls ?? [], ix.CAT[c], row.label, answer, ex.ne);
    const said = !answer && !r.why && (ex.not ?? []).find((n) => catChain(ix, ix.CAT[c]).includes(n));
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
 * The thing the learner's words name: a practice item, or a reference example with classes. A short name of an item ("ball") comes back
 * `loose` where a category is about a feature (a color, a material), since the name does not say which (`itemRows`).
 */
export function nameOf(ix: DataIndex, cats: readonly string[], text: string, ex?: ExampleIndex | null): { item: Item; loose?: boolean } | { ex: Example } | null {
  const item = matchItem(ix, text, true);
  if (item) return { item };
  const found = ex ? matchExamples(ex, text).find((e) => e.ne || e.cls?.length) : undefined;
  if (found) return { ex: found };
  const alias = matchItem(ix, text);
  return alias ? { item: alias, loose: cats.some((c) => FEATURE.has(c)) } : null;
}

/** Grades the answer: "nothing is" is right exactly when nothing can be; a thing is right when the data places it in every category. */
export function gradeInstance(ix: DataIndex, q: InstanceQuestion, ans: InstanceAnswer, ex?: ExampleIndex | null, rng: Rng = Math.random): InstanceResult {
  const sample = () => {
    if (!q.possible || !q.known.length) return null;
    const name = pick(q.known, rng), it = ix.DATA.items.find((i) => i.n === name)!;
    return { thing: it.n, rows: itemRows(ix, it, q.cats, q.labels) };
  };
  if (ans.none === true) return { v: q.possible ? "bad" : "ok", thing: "", from: null, rows: [], example: sample() };
  const text = ans.text.trim(), named = nameOf(ix, q.cats, text, ex);
  if (!named) return { v: q.possible ? "open" : "bad", thing: text, from: null, rows: [], example: sample() };
  const rows = "item" in named ? itemRows(ix, named.item, q.cats, q.labels, named.loose ? text : undefined) : exampleRows(ix, named.ex, q.cats, q.labels);
  const thing = "item" in named ? (named.loose ? text : named.item.n) : named.ex.n, from = "item" in named ? "item" : "example";
  const v = !q.possible || rows.some((r) => r.answer === false) ? "bad" : rows.every((r) => r.answer) ? "ok" : "open";
  return { v, thing, from, rows, example: v === "ok" ? null : sample() };
}
