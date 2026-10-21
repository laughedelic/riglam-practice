// The practice universe: which items fall in which cell for two categories, which relation that gives, the pool of
// category pairs, and the draw of the next pair. Functions of the term data (a DataIndex), with the randomness passed
// in, so the same data and the same random numbers give the same pairs.
import type { Item } from "../ai-shared/data";
import type { DataIndex } from "../ai-shared/lookup";
import { CELLS } from "../ai-shared/relations";
import type { CellId, RelKey } from "../ai-shared/relations";
import type { HistoryEntry, Pair, PoolEntry } from "./types";
import { cap, isMiss, pick } from "./util";

/** Returns a number in [0, 1), like `Math.random`. */
export type Rng = () => number;

/** Returns the current time in milliseconds, like `Date.now`; a pair's id is made from it. */
export type Clock = () => number;

// An alias ("table") names the thing without the feature the practice item has ("a wooden table"),
// so it cannot settle colour, material, shape or temperature.
export const FEATURE: ReadonlySet<string> = new Set(["wooden", "metal", "white", "red", "green", "round", "square", "hot"]);

/** Whether the item can be used for the two categories: no sense-object items for sense categories, no body items where the body is skipped. */
export function inUniverse(ix: DataIndex, it: Item, a: string, b: string): boolean {
  const sense = ix.CAT[a].sense || ix.CAT[b].sense;
  if (sense && it.comp) return false;
  if (it.body && (ix.DATA.bodySkip.includes(a) || ix.DATA.bodySkip.includes(b))) return false;
  return true;
}

/** More references for the cells of a pair of categories (the reference examples, src/domain/reference.ts): an example per cell it can fill, with `ne` where it does not exist. */
export type Witnesses = (a: string, b: string) => Record<CellId, readonly { n: string; ne?: boolean }[]>;

/** The items in each cell of the grid for two categories. */
export function cellsFor(ix: DataIndex, a: string, b: string): Record<CellId, Item[]> {
  const out: Record<CellId, Item[]> = { both: [], anb: [], bna: [], nei: [] };
  for (const it of ix.DATA.items) {
    if (!inUniverse(ix, it, a, b)) continue;
    const x = it.c.includes(a), y = it.c.includes(b);
    out[x && y ? "both" : x ? "anb" : y ? "bna" : "nei"].push(it);
  }
  return out;
}

/** The relation the filled cells show. */
export function relOfCells(c: Record<CellId, readonly unknown[]>): RelKey {
  if (!c.both.length) return "con";
  if (!c.anb.length && !c.bna.length) return "mi";
  if (!c.anb.length) return "3ab";
  if (!c.bna.length) return "3ba";
  return "4";
}

const typeText = (ix: DataIndex, cid: string): string => ix.CAT[cid].type.split(":")[0];

type Names = Pick<Pair, "a" | "b" | "typeA" | "typeB">;
function whyEmpty(cell: CellId, p: Names): string {
  const A = p.a, B = p.b;
  const q = (x: string) => "“" + x + "”";
  if (cell === "both") return q(A) + " are " + p.typeA + "; " + q(B) + " are " + p.typeB + ". Nothing is both.";
  if (cell === "anb") return "Whatever falls under " + q(A) + " also falls under " + q(B) + ".";
  if (cell === "bna") return "Whatever falls under " + q(B) + " also falls under " + q(A) + ".";
  return "Whatever exists falls under " + q(A) + " or under " + q(B) + "; only a non-existent is neither.";
}
function noteFor(p: Names & { relation: RelKey }): string {
  const t: Record<RelKey, string> = {
    mi: '"' + p.a + '" and "' + p.b + '" pick out the same class: ' + p.typeA + ".",
    con: cap(p.a) + " are " + p.typeA + " and " + p.b + " are " + p.typeB + ": no common locus.",
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

/** Every pair of categories worth drilling, with its relation, and every category that has two labels (a pair of its own labels). */
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
  for (const id of ids) if (ix.CAT[id].labels.length > 1) out.push({ a: id, b: id, r: "mi" });
  return out;
}

/**
 * A pair from a pool entry: a random order and random labels, the relation the data gives, an example per cell where
 * there is one, and the reason where a cell is empty. The random numbers are drawn in a fixed order; the id is made from
 * the clock and one more random number, so with both given the whole pair is reproducible.
 */
export function makePair(ix: DataIndex, cand: PoolEntry, rng: Rng = Math.random, now: Clock = Date.now, more?: Witnesses): Pair {
  let a = cand.a, b = cand.b, la: string, lb: string;
  if (a === b) {
    const ls = ix.CAT[a].labels.slice().sort(() => rng() - 0.5);
    la = ls[0]; lb = ls[1];
  } else {
    if (rng() < 0.5) [a, b] = [b, a];
    la = pick(ix.CAT[a].labels, rng); lb = pick(ix.CAT[b].labels, rng);
  }
  return pairOf(ix, a, b, la, lb, rng, now, more);
}

/**
 * The pair for two categories in this order, shown under these labels (the learner's words in the pair-finding mode, a label of the category in a draw).
 * `more` adds references to the cells: the practice list decides the relation and which cells are empty, so a reference only joins a cell the list
 * fills, and one the list does not agree with never makes a cell hold what the relation says it cannot.
 */
export function pairOf(ix: DataIndex, a: string, b: string, la: string, lb: string, rng: Rng = Math.random, now: Clock = Date.now, more?: Witnesses): Pair {
  const cells = cellsFor(ix, a, b), relation = relOfCells(cells), extra = more ? more(a, b) : null;
  const ex: Partial<Record<CellId, string | null>> = {}, why: Partial<Record<CellId, string>> = {};
  const p: Pair = {
    id: "g-" + now().toString(36) + rng().toString(36).slice(2, 6), a: la, b: lb, catA: a, catB: b,
    typeA: typeText(ix, a), typeB: typeText(ix, b), relation, ex, why, generated: true,
  };
  for (const c of CELLS) {
    // the neither cell prefers an existent, as in debate; a non-existent only when nothing existent fits
    const all: readonly { n: string; ne?: boolean }[] = extra && cells[c].length ? [...cells[c], ...extra[c]] : cells[c];
    const pool = c === "nei" && all.some((i) => !i.ne) ? all.filter((i) => !i.ne) : all;
    ex[c] = pool.length ? pick(pool, rng).n : null;
    if (!ex[c]) why[c] = whyEmpty(c, p);
  }
  p.note = noteFor(p);
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
}

/** The pool entry for the next pair: the relation that has been seen least lately, then a pair of categories weighted by what the learner got wrong. */
export function chooseEntry(ix: DataIndex, pool: readonly PoolEntry[], st: DrawState): PoolEntry {
  const { hist, recent } = st, rng = st.rng || Math.random, isHidden = st.isHidden || (() => false);
  const last = hist.slice(-8).map((x) => (x.key === "3ab" || x.key === "3ba" ? "3" : x.key));
  const seen = new Set(hist.slice(-60).map((x) => [x.catA, x.catB].sort().join("|")).concat(recent));
  const weak: Record<string, number> = Object.create(null);
  for (const x of hist.slice(-40)) {
    if (!isMiss(x)) continue;
    if (x.catA) weak[x.catA] = (weak[x.catA] || 0) + 1;
    if (x.catB) weak[x.catB] = (weak[x.catB] || 0) + 1;
  }
  // the relation least seen lately comes first, so the stream stays mixed
  const rw: Record<string, number> = { mi: 1, con: 1, "3": 1.3, "4": 1 };
  for (const r of last) if (r && Object.hasOwn(rw, r)) rw[r] = Math.max(0.15, rw[r] * 0.45); // an answer without a relation counts for none
  const rels = Object.keys(rw).filter((r) => pool.some((c) => c.r === r)); // a relation the pool lacks cannot be drawn
  if (!rels.length) throw new Error("no pair to draw from");
  let tot = rels.reduce((s, r) => s + rw[r], 0), x = rng() * tot, R = rels[0];
  for (const r of rels) { if ((x -= rw[r]) <= 0) { R = r; break; } }
  let cands = pool.filter((c) => c.r === R && !isHidden(c));
  if (!cands.length) cands = pool.filter((c) => c.r === R); // everything of this relation is skipped: the skips give way

  const w = cands.map((c) => {
    let v = 1;
    if (seen.has(pairKey(c))) v *= 0.08;
    v *= 1 + 1.5 * ((weak[c.a] || 0) + (weak[c.b] || 0));
    if (R === "con" && ix.CAT[c.a].kind === "everyday" && ix.CAT[c.b].kind === "everyday") v *= 0.35;
    return v;
  });
  tot = w.reduce((s, v) => s + v, 0); x = rng() * tot;
  let ci = 0;
  for (; ci < w.length; ci++) { if ((x -= w[ci]) <= 0) break; }
  return cands[Math.min(ci, cands.length - 1)];
}

/** The next pair to practice: chooses an entry (see chooseEntry), remembers it in `st.recent`, and makes the pair. */
export function nextPair(ix: DataIndex, pool: readonly PoolEntry[], st: DrawState): Pair {
  const c = chooseEntry(ix, pool, st);
  st.recent.push(pairKey(c));
  if (st.recent.length > RECENT_MAX) st.recent.shift();
  return makePair(ix, c, st.rng || Math.random, st.now || Date.now, st.more);
}
