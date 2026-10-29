// The practice universe: which items fall in which cell for two categories, which relation that gives, the pool of
// category pairs, and the draw of the next pair. Functions of the term data (a DataIndex), with the randomness passed
// in, so the same data and the same random numbers give the same pairs.
import type { DrillData, Item } from "../ai-shared/data";
import { leavesOpen } from "../ai-shared/lookup";
import type { DataIndex } from "../ai-shared/lookup";
import { CELLS, NEG_CELL, negLabel, negSides } from "../ai-shared/relations";
import type { CellId, Neg, RelKey } from "../ai-shared/relations";
import { itemKnown, itemOn, poolAt, topStage } from "./stages";
import type { Unmet } from "./stages";
import type { StagedEntry, Stages } from "./stages";
import type { HistoryEntry, Pair, PoolEntry } from "./types";
import { cap, isMiss, pick } from "./util";

/** Returns a number in [0, 1), like `Math.random`. */
export type Rng = () => number;

/** Returns the current time in milliseconds, like `Date.now`; a pair's id is made from it. */
export type Clock = () => number;

// An alias ("key") names the thing without the feature the practice item has ("a metal key"),
// so it cannot settle color, material, shape, temperature or whether it runs on electricity.
export const FEATURE: ReadonlySet<string> = new Set([
  "wooden", "metal", "glass", "plastic", "fabric", "leather", "ceramic", "paper", "white", "black", "red", "green", "blue", "yellow", "round", "square", "hot", "cold", "electric",
]);

/**
 * Whether the item can be used for the two categories: not one whose name leaves either open ("a chair" for wooden things), no
 * sense-object items for sense categories, no body items where the body is skipped.
 */
export function inUniverse(ix: DataIndex, it: Item, a: string, b: string): boolean {
  if (leavesOpen(it, a, b)) return false;
  const sense = ix.CAT[a].sense || ix.CAT[b].sense;
  if (sense && it.comp) return false;
  if (it.body && (ix.DATA.bodySkip.includes(a) || ix.DATA.bodySkip.includes(b))) return false;
  return true;
}

/** More references for the cells of a pair of categories (the reference examples, src/domain/reference.ts): an example per cell it can fill, with `ne` where it does not exist. */
export type Witnesses = (a: string, b: string) => Record<CellId, readonly { n: string; ne?: boolean }[]>;

// Per category, what each item (by its place in the list) is: 1 in it, 2 left open by its name, 0 neither. The pool and the syllogism
// drill ask for the cells of every pair, so the lists are read once per data, not once per pair; kept per data, as in syllogism.ts.
const OUT = 0, IN = 1, OPEN = 2;
const memberships = new WeakMap<DrillData, Map<string, Uint8Array>>();
function membership(ix: DataIndex, cat: string): Uint8Array {
  let byCat = memberships.get(ix.DATA);
  if (!byCat) memberships.set(ix.DATA, (byCat = new Map()));
  let m = byCat.get(cat);
  if (!m) {
    m = Uint8Array.from(ix.DATA.items, (it) => (it.may?.includes(cat) ? OPEN : it.c.includes(cat) ? IN : OUT));
    byCat.set(cat, m);
  }
  return m;
}

/** The items in each cell of the grid for two categories (those `inUniverse` allows). */
export function cellsFor(ix: DataIndex, a: string, b: string): Record<CellId, Item[]> {
  const out: Record<CellId, Item[]> = { both: [], anb: [], bna: [], nei: [] };
  const A = membership(ix, a), B = membership(ix, b), items = ix.DATA.items;
  const sense = ix.CAT[a].sense || ix.CAT[b].sense, body = ix.DATA.bodySkip.includes(a) || ix.DATA.bodySkip.includes(b);
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    if (A[i] === OPEN || B[i] === OPEN || (sense && it.comp) || (body && it.body)) continue; // as inUniverse
    const x = A[i] === IN, y = B[i] === IN;
    out[x && y ? "both" : x ? "anb" : y ? "bna" : "nei"].push(it);
  }
  return out;
}

/**
 * The relation the filled cells show. The neither cell does not enter: a pair with a negated side can have it empty (the horn of a rabbit is in
 * no category, so it is neither for every plain pair, but a negation takes it in), and the pair is still four possibilities.
 */
export function relOfCells(c: Record<CellId, readonly unknown[]>): RelKey {
  if (!c.both.length) return "con";
  if (!c.anb.length && !c.bna.length) return "mi";
  if (!c.anb.length) return "3ab";
  if (!c.bna.length) return "3ba";
  return "4";
}

/** The cells of a pair with a side negated (NEG_CELL), from the plain pair's. */
export function negateCells<T>(cells: Record<CellId, T>, neg: Neg): Record<CellId, T> {
  const out = {} as Record<CellId, T>;
  for (const c of CELLS) out[NEG_CELL[neg][c]] = cells[c];
  return out;
}

const typeText = (ix: DataIndex, cid: string): string => ix.CAT[cid].type.split(":")[0];

type Names = Pick<Pair, "a" | "b" | "typeA" | "typeB">;
// "black things" and "trees" are both form: that is no reason for them to have nothing in common, so only the list's word is given
const sameType = (p: Names): boolean => p.typeA === p.typeB;
// a pair with a negated side says why with the plain pair's reason: "furniture" and "non-(wooden things)" have nothing in both because all furniture is wooden
function whyEmpty(cell: CellId, p: Names, plain?: Names, neg?: Neg): string {
  if (plain && neg) return whyEmpty(NEG_CELL[neg][cell], plain);
  const A = p.a, B = p.b;
  const q = (x: string) => "“" + x + "”";
  if (cell === "both") return sameType(p) ? "Nothing in the practice list is both " + q(A) + " and " + q(B) + "." : q(A) + " are " + p.typeA + "; " + q(B) + " are " + p.typeB + ". Nothing is both.";
  if (cell === "anb") return "Whatever falls under " + q(A) + " also falls under " + q(B) + ".";
  if (cell === "bna") return "Whatever falls under " + q(B) + " also falls under " + q(A) + ".";
  return "Whatever exists falls under " + q(A) + " or under " + q(B) + "; only a non-existent is neither.";
}
function noteFor(p: Names & { relation: RelKey }, plain?: Names & { relation: RelKey }, neg?: Neg): string {
  if (plain && neg) {
    const outside = negSides({ neg }).flatMap((n, i) => (n ? ["“" + (i ? p.b : p.a) + "” takes in everything outside “" + (i ? plain.b : plain.a) + "”"] : []));
    return outside.join(", and ") + ", what does not exist included. " + noteFor(plain);
  }
  const t: Record<RelKey, string> = {
    mi: '"' + p.a + '" and "' + p.b + '" pick out the same class: ' + p.typeA + ".",
    con: sameType(p) ? "No common locus: nothing in the practice list is both " + p.a + " and " + p.b + "." : cap(p.a) + " are " + p.typeA + " and " + p.b + " are " + p.typeB + ": no common locus.",
    "3ab": "Whatever falls under “" + p.a + "” also falls under “" + p.b + "”, but not the reverse.",
    "3ba": "Whatever falls under “" + p.b + "” also falls under “" + p.a + "”, but not the reverse.",
    "4": cap(p.a) + " and " + p.b + " overlap without either containing the other.",
  };
  return t[p.relation];
}

/** Whether the items of the data can tell the relation of two different categories: not a pair the data lists as no-pair, and not an everyday category with a sense one. */
export function judgeable(ix: DataIndex, a: string, b: string): boolean {
  const A = ix.CAT[a], B = ix.CAT[b];
  if ((ix.DATA.nopair || []).some((x) => x.join("|") === [a, b].sort().join("|"))) return false;
  return !((A.kind === "everyday" || B.kind === "everyday") && (A.sense || B.sense));
}

/**
 * Every pair of categories worth drilling, with its relation, and every Dudra category that has two labels (a pair of its own labels: two names
 * of one term). An everyday category's labels are only other wordings ("kitchen things", "kitchenware"), so they make no pair: nothing is told apart.
 */
export function buildPool(ix: DataIndex): PoolEntry[] {
  const ids = Object.keys(ix.CAT), out: PoolEntry[] = [];
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = ids[i], b = ids[j];
      if (!judgeable(ix, a, b)) continue;
      const r = relOfCells(cellsFor(ix, a, b));
      out.push({ a, b, r: r === "3ab" || r === "3ba" ? "3" : r });
    }
  }
  for (const id of ids) if (ix.CAT[id].kind !== "everyday" && ix.CAT[id].labels.length > 1) out.push({ a: id, b: id, r: "mi" });
  return out;
}

/**
 * A pair from a pool entry: a random order and random labels, the relation the data gives, an example per cell where
 * there is one, and the reason where a cell is empty. The random numbers are drawn in a fixed order; the id is made from
 * the clock and one more random number, so with both given the whole pair is reproducible. With `on`, the examples are
 * things of those stages (see pairOf). With `neg`, A, B or both are negated, under a label that is not a negation already where the category has one.
 */
export function makePair(ix: DataIndex, cand: PoolEntry, rng: Rng = Math.random, now: Clock = Date.now, more?: Witnesses, on?: Stages, neg?: Neg, brackets = true): Pair {
  let a = cand.a, b = cand.b, la: string, lb: string;
  const [na, nb] = negSides({ neg }), labels = (cid: string, n: boolean) => {
    const all = ix.CAT[cid].labels, plain = all.filter((l) => !l.startsWith("non-"));
    return n && plain.length ? plain : all;
  };
  if (a === b) {
    const ls = labels(a, na || nb).slice().sort(() => rng() - 0.5);
    la = ls[0]; lb = ls[1] ?? ls[0];
  } else {
    if (rng() < 0.5) [a, b] = [b, a];
    la = pick(labels(a, na), rng); lb = pick(labels(b, nb), rng);
  }
  return pairOf(ix, a, b, la, lb, rng, now, more, on, neg, brackets);
}

/**
 * The pair for two categories in this order, shown under these labels (the learner's words in the pair-finding mode, a label of the category in a draw).
 * `more` adds references to the cells: the practice list decides the relation and which cells are empty, so a reference only joins a cell the list
 * fills, and one the list does not agree with never makes a cell hold what the relation says it cannot. With `on`, a cell's example from the list
 * is a thing of those stages (`itemOn`) where the cell has one, else one the learner knows from a stage below (`itemKnown`), else any thing of the cell.
 * With `neg`, the labels of the negated sides become their negations ("non-(wooden things)", or "non-wooden things" without `brackets`) and the cells move as NEG_CELL says.
 */
export function pairOf(ix: DataIndex, a: string, b: string, la: string, lb: string, rng: Rng = Math.random, now: Clock = Date.now, more?: Witnesses, on?: Stages, neg?: Neg, brackets = true): Pair {
  const plainCells = cellsFor(ix, a, b), plainExtra = more ? more(a, b) : null;
  const cells = neg ? negateCells(plainCells, neg) : plainCells, extra = plainExtra && neg ? negateCells(plainExtra, neg) : plainExtra;
  const relation = relOfCells(cells), [na, nb] = negSides({ neg });
  const ex: Partial<Record<CellId, string | null>> = {}, why: Partial<Record<CellId, string>> = {};
  const p: Pair = {
    id: "g-" + now().toString(36) + rng().toString(36).slice(2, 6), a: na ? negLabel(la, brackets) : la, b: nb ? negLabel(lb, brackets) : lb, catA: a, catB: b,
    typeA: typeText(ix, a), typeB: typeText(ix, b), relation, ex, why, generated: true, ...(neg ? { neg } : {}),
  };
  const plain = neg ? { a: la, b: lb, typeA: p.typeA, typeB: p.typeB, relation: relOfCells(plainCells) } : undefined;
  for (const c of CELLS) {
    // the neither cell prefers an existent, as in debate; a non-existent only when nothing existent fits (with a negated side, any cell, as a negation takes in what does not exist)
    const listed = on ? [cells[c].filter((it) => itemOn(ix, it, a, b, on)), cells[c].filter((it) => itemKnown(ix, it, a, b, on))].find((l) => l.length) ?? cells[c] : cells[c];
    const all: readonly { n: string; ne?: boolean }[] = extra && cells[c].length ? [...listed, ...extra[c]] : listed;
    const pool = (c === "nei" || neg) && all.some((i) => !i.ne) ? all.filter((i) => !i.ne) : all;
    ex[c] = pool.length ? pick(pool, rng).n : null;
    if (!ex[c]) why[c] = whyEmpty(c, p, plain, neg);
  }
  p.note = noteFor(p, plain, neg);
  return p;
}

/** The key of a pair of categories, the same for either order. */
export const pairKey = (c: { a: string; b: string }): string => [c.a, c.b].sort().join("|");

/** How many recently drawn pairs are remembered, so that they are not drawn again soon. */
export const RECENT_MAX = 20;

export interface DrawState {
  /** the earlier answers, oldest first */
  hist: readonly HistoryEntry[];
  /** keys of the pairs drawn lately; the draw appends to it and keeps the last RECENT_MAX */
  recent: string[];
  /** whether the pair is hidden for now (skipped); when every pair of a relation is hidden, the hiding gives way */
  isHidden?: (c: PoolEntry) => boolean;
  rng?: Rng;
  /** the clock for the id of the pair that `nextPair` makes */
  now?: Clock;
  /** more references for the cells than the practice list has */
  more?: Witnesses;
  /**
   * the stages the learner draws from (stages.ts): only pairs that can be drawn with them, about half of them new at the highest stage
   * and the rest from below, with examples of those stages; none, or stages that can draw no pair: every pair, as before the ladder
   */
  stages?: Stages;
  /** the Dudra categories whose term the learner has not met yet (intro.ts): pairs with one of them wait, unless nothing else can be drawn */
  unmet?: Unmet;
  /** the learner has just reached the highest stage that is on: its first pairs lean to three possibilities, with familiar things inside familiar kinds */
  fresh?: boolean;
  /** every pair the stages can draw weighs the same, none more for being new at the highest stage: a device that kept its settings from before the ladder draws as it did */
  even?: boolean;
  /** the share of the pairs new at the highest stage (stages.ts, newShare): a quarter while the exercise is new to the learner; none: half */
  newShare?: number;
  /** the new terms of the highest stage whose last answer is not right yet (intro.ts, openTerms): its pairs are drawn among theirs while any can be */
  open?: ReadonlySet<string>;
  /**
   * the negation track: about a third of the pairs have one side negated, A or B alike ("one", as the tutors negate either), or, with "both", half
   * of those have A and B negated. None: no negation, and the draw takes the same random numbers as before the track.
   */
  negation?: "one" | "both";
  /** a negated name of more than one word is written in brackets ("non-(wooden things)"), as the course book does; false: "non-wooden things". Default: with brackets */
  brackets?: boolean;
}

/** How many of the pairs have a negated side when the negation track is on. */
export const NEG_SHARE = 1 / 3;

/** How much more likely a three-possibility pair is while the learner has just reached a stage (`fresh`). */
const FRESH_THREE = 2.5;

/** The weight of a pair of two everyday categories from stage 2 on, against 1 for a pair with a course category (stage 1 is mostly such pairs, and so is a third of stage 4). */
export const EVERYDAY_ONLY = 0.35;

/** Whether the pair is of two everyday categories, with no course term in it. */
const everydayOnly = (ix: DataIndex, c: PoolEntry): boolean => ix.CAT[c.a].kind === "everyday" && ix.CAT[c.b].kind === "everyday";

/** A relation with fewer pairs than this in reach is drawn in proportion to how many it has, so that its one or two pairs do not come back every few questions. */
const THIN_RELATION = 8;

/**
 * The pool entry for the next pair: the relation that has been seen least lately, then a pair of categories weighted by what the learner got
 * wrong. With `stages`, from the pairs those stages can draw, the stage comes first: half the time (or `newShare`) the highest, else one of the
 * stages below, each as likely as the others (not each pair: stage 1 has a third of all the pairs), a stage made of pairs of two everyday
 * categories counting for less (EVERYDAY_ONLY) once a course term is in play; a pair of the highest stage has one of its `open` terms while one can.
 */
export function chooseEntry(ix: DataIndex, full: readonly PoolEntry[], st: DrawState): PoolEntry {
  const { hist, recent } = st, rng = st.rng || Math.random, isHidden = st.isHidden || (() => false);
  // stages whose things cannot fill a single pair (only the upper stages, which the practice list has nothing of) draw from every pair
  const staged = st.stages ? poolAt(ix, full, st.stages) : [], drawable: readonly (PoolEntry & Partial<StagedEntry>)[] = staged.length ? staged : full;
  // a pair waits while one of its categories has a term the learner has not met; if that leaves nothing, the stages' pairs are drawn as they are
  const met = st.unmet?.size ? drawable.filter((c) => !st.unmet!.has(c.a) && !st.unmet!.has(c.b)) : drawable;
  const top = staged.length && !st.even ? topStage(st.stages!) : 0;
  const all = met.length ? met : drawable;
  // the stage first: the highest `newShare` of the time (a quarter while the exercise is new to the learner), else one below it, in proportion to what it teaches
  let pool = all;
  if (top) {
    const size = new Map<number, number>(), plain = new Map<number, number>();
    for (const c of all) { size.set(c.st!, (size.get(c.st!) || 0) + 1); if (everydayOnly(ix, c)) plain.set(c.st!, (plain.get(c.st!) || 0) + 1); }
    const below = [...size.keys()].filter((s) => s !== top).sort((a, b) => a - b);
    const weight = (s: number) => (top > 1 ? 1 - (1 - EVERYDAY_ONLY) * ((plain.get(s) || 0) / size.get(s)!) : 1);
    let stage = top;
    if (below.length && (!size.has(top) || rng() >= (st.newShare ?? 0.5))) {
      let x = rng() * below.reduce((sum, s) => sum + weight(s), 0);
      stage = below[below.length - 1];
      for (const s of below) { if ((x -= weight(s)) <= 0) { stage = s; break; } }
    }
    pool = all.filter((c) => c.st === stage);
    // the stage waits for the last answer on each of its new terms to be right: its questions go to the terms that are not yet
    if (stage === top && st.open?.size) {
      const lean = pool.filter((c) => st.open!.has(c.a) || st.open!.has(c.b));
      if (lean.length) pool = lean;
    }
  }
  const last = hist.slice(-8).map((x) => (x.key === "3ab" || x.key === "3ba" ? "3" : x.key));
  const seen = new Set(hist.slice(-60).map((x) => [x.catA, x.catB].sort().join("|")).concat(recent));
  const weak: Record<string, number> = Object.create(null);
  for (const x of hist.slice(-40)) {
    if (!isMiss(x)) continue;
    if (x.catA) weak[x.catA] = (weak[x.catA] || 0) + 1;
    if (x.catB) weak[x.catB] = (weak[x.catB] || 0) + 1;
  }
  // the relation least seen lately comes first, so the stream stays mixed
  const rw: Record<string, number> = { mi: 1, con: 1, "3": st.fresh ? 1.3 * FRESH_THREE : 1.3, "4": 1 };
  for (const r of last) if (r && Object.hasOwn(rw, r)) rw[r] = Math.max(0.15, rw[r] * 0.45); // an answer without a relation counts for none
  const depth: Record<string, number> = Object.create(null);
  for (const c of pool) depth[c.r] = (depth[c.r] || 0) + 1;
  for (const r of Object.keys(rw)) rw[r] *= Math.min(1, (depth[r] || 0) / THIN_RELATION);
  const rels = Object.keys(rw).filter((r) => depth[r]); // a relation the pool lacks cannot be drawn
  if (!rels.length) throw new Error("no pair to draw from");
  let tot = rels.reduce((s, r) => s + rw[r], 0), x = rng() * tot, R = rels[0];
  for (const r of rels) { if ((x -= rw[r]) <= 0) { R = r; break; } }
  let cands = pool.filter((c) => c.r === R && !isHidden(c));
  if (!cands.length) cands = pool.filter((c) => c.r === R); // everything of this relation is skipped: the skips give way

  const w = cands.map((c) => {
    let v = 1;
    if (seen.has(pairKey(c))) v *= 0.08;
    v *= 1 + 1.5 * ((weak[c.a] || 0) + (weak[c.b] || 0));
    // two everyday categories teach little once a course term is in play: at stage 1 only the exclusive pairs (white things, black things) are damped, from stage 2 on all of them
    if (everydayOnly(ix, c)) v *= top > 1 ? EVERYDAY_ONLY : R === "con" ? 0.35 : 1;
    return v;
  });
  tot = w.reduce((s, v) => s + v, 0); x = rng() * tot;
  let ci = 0;
  for (; ci < w.length; ci++) { if ((x -= w[ci]) <= 0) break; }
  return cands[Math.min(ci, cands.length - 1)];
}

/** The next pair to practice: chooses an entry (see chooseEntry), remembers it in `st.recent`, and makes the pair. */
export function nextPair(ix: DataIndex, pool: readonly PoolEntry[], st: DrawState): Pair {
  const c = chooseEntry(ix, pool, st), rng = st.rng || Math.random;
  st.recent.push(pairKey(c));
  if (st.recent.length > RECENT_MAX) st.recent.shift();
  const neg: Neg | undefined = st.negation && rng() < NEG_SHARE ? (st.negation === "both" && rng() < 0.5 ? "ab" : rng() < 0.5 ? "a" : "b") : undefined;
  return makePair(ix, c, rng, st.now || Date.now, st.more, st.stages, neg, st.brackets);
}
