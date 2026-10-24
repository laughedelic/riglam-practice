// Looking things up in the term data: the index built from it, and matching of free text to a practice item or
// category. Pure functions of the data, so the page and the Worker tutor resolve a learner's words the same way.
import type { Cat, DrillData, Item } from "./data";
import { pluralOf, termNamed } from "./mentions";
import type { PairLike } from "./relations";

/** The lookup tables over the data. The page keeps the same five fields on its `state`, so `state` can be passed as an index. */
export interface DataIndex {
  DATA: DrillData;
  /** category id -> category */
  CAT: Record<string, Cat>;
  /** normalized item name (also without its article) -> item */
  ITEMIDX: Record<string, Item>;
  /** normalized alias ("key") -> item ("a metal key"); never shadows an item name */
  ALIASIDX: Record<string, Item>;
  /** normalized category label -> category id */
  LABELIDX: Record<string, string>;
}

export function norm(s: unknown): string {
  return String(s || "").toLowerCase().replace(/[“”"'’.,!?;:()]/g, "").replace(/\s+/g, " ").trim();
}
export function stripDet(s: string): string {
  return s.replace(/^(a|an|the|my|your|some)\s+/, "");
}

// The data is spelled the American way (color, odor, neighbor, aging, gray). Older saved pairs, and what a learner types,
// may carry the British forms the sources used before, so a lookup compares the American spelling of both sides. The map
// is only the words the data has; it is not a general converter. Keys that are stored (favourites, skips) use `norm`, not this.
const BRITISH: [RegExp, string][] = [
  [/colour/g, "color"],
  [/odour/g, "odor"],
  [/neighbour/g, "neighbor"],
  [/ageing/g, "aging"],
  [/\bgrey(s|ish)?\b/g, "gray$1"],
];
export function american(s: string): string {
  return BRITISH.reduce((t, [re, to]) => t.replace(re, to), s);
}
/** The form in which words are compared: normalized, with the American spelling. */
export const spelled = (s: unknown): string => american(norm(s));

// The tables have no prototype: a learner's word such as "constructor" must find nothing, not Object's method.
const table = <T>(): Record<string, T> => Object.create(null);

export function makeIndex(DATA: DrillData): DataIndex {
  const CAT = table<Cat>();
  for (const c of DATA.cats) CAT[c.id] = c;
  const ITEMIDX = table<Item>();
  const put = (k: string, it: Item) => { if (k && !ITEMIDX[k]) ITEMIDX[k] = it; };
  for (const it of DATA.items) { const k = spelled(it.n); put(k, it); put(stripDet(k), it); }
  const ALIASIDX = table<Item>();
  for (const [k, v] of Object.entries(DATA.aliases || {})) {
    const it = DATA.items.find((i) => i.n === v);
    if (it && !ITEMIDX[spelled(k)]) ALIASIDX[spelled(k)] = it;
  }
  const LABELIDX = table<string>();
  for (const c of DATA.cats) for (const l of c.labels) { const k = spelled(l); if (!LABELIDX[k]) LABELIDX[k] = c.id; }
  return { DATA, CAT, ITEMIDX, ALIASIDX, LABELIDX };
}

/** The term and its parents, lowest first; empty for a name the data does not have. */
export function upChain(ix: DataIndex, name: string): string[] {
  const T = ix.DATA.terms, out: string[] = [];
  for (let n: string | undefined = name; n && Object.hasOwn(T, n) && !out.includes(n); n = T[n].parent) out.push(n);
  return out;
}
/** The classes of the data's "is a" tree under Existent, which the tutor names an example's class from (not the other names of form, "matter"). */
export function classNames(ix: DataIndex): string[] {
  return Object.keys(ix.DATA.terms).filter((n) => n !== "Existent" && !/matter$/i.test(n) && upChain(ix, n).at(-1) === "Existent");
}

/** Older batch pairs carry only labels; recover their categories when the labels are known. */
export function catByLabel(ix: DataIndex, l: unknown): string | null {
  const k = spelled(l);
  return ix.LABELIDX[k] || ix.LABELIDX[k.replace(/s$/, "")] || ix.LABELIDX[k + "s"] || null;
}
export function pairCats(ix: DataIndex, p: PairLike): [string, string] | [null, null] {
  const a = p.catA || catByLabel(ix, p.a), b = p.catB || catByLabel(ix, p.b);
  return a && b && a !== b ? [a, b] : [null, null];
}
/** The categories the tutor's fine points are taken from: the pair's two, and for a pair of the learner's own each side the data recognizes (the other may be the learner's words only). */
export function noteCats(ix: DataIndex, p: PairLike): string[] {
  if (!p.own) return pairCats(ix, p).filter((c): c is string => !!c);
  return [p.catA || catByLabel(ix, p.a), p.catB || catByLabel(ix, p.b)].filter((c): c is string => !!c);
}
// A phrase without the plural or third-person -s of any of its words, so that "a thing that changes" and the label "things that change" are one phrase.
const stemWord = (w: string): string =>
  w === "phenomena" ? "phenomenon"
  : w.length <= 3 || /(?:ss|us|is)$/.test(w) ? w
  : /ies$/.test(w) ? w.slice(0, -3) + "y"
  : /(?:ches|shes|xes|zes|sses)$/.test(w) ? w.slice(0, -2)
  : w.endsWith("s") ? w.slice(0, -1) : w;
/** The loose form of a phrase in which a learner's words are compared with the labels of compound categories ("things you can eat"). */
export const stemmed = (s: string): string => s.split(" ").map(stemWord).join(" ");
// one table per label table: the loose form of every label -> category id (the first category wins, as for the labels themselves)
const stemTables = new WeakMap<object, Record<string, string>>();
function stemTable(ix: DataIndex): Record<string, string> {
  let t = stemTables.get(ix.LABELIDX);
  if (!t) {
    t = table<string>();
    for (const [l, id] of Object.entries(ix.LABELIDX)) { const k = stemmed(l); if (!t[k]) t[k] = id; }
    stemTables.set(ix.LABELIDX, t);
  }
  return t;
}
/**
 * The practice category a learner's words name, or null: one of its labels (singular or plural, with or without an article, a compound one
 * such as "things that change" also as "a thing that changes"), or its Dudra term ("Consciousness", "permanent phenomenon"). A phenomenon the
 * practice list has no category for gives null.
 */
export function categoryOf(ix: DataIndex, text: unknown): string | null {
  const k = stripDet(spelled(text));
  if (!k) return null;
  for (const t of [k, pluralOf(k), k.replace(/ies$/, "y"), k.replace(/(?:es|s)$/, "")]) if (ix.LABELIDX[t]) return ix.LABELIDX[t];
  const loose = stemTable(ix)[stemmed(k)];
  if (loose) return loose;
  const term = termNamed(ix, k);
  return (term && ix.DATA.cats.find((c) => c.kind === "dudra" && c.term === term)?.id) || null;
}
/** Whether the item's name leaves one of the categories open ("a chair" may be wooden): then the item says nothing about it. */
export const leavesOpen = (it: Pick<Item, "may">, ...cats: readonly (string | null | undefined)[]): boolean =>
  !!it.may?.length && cats.some((c) => !!c && it.may!.includes(c));
/** The practice item a learner's words name, or null. With `exactOnly` aliases do not count. */
export function matchItem(ix: DataIndex, text: unknown, exactOnly?: boolean): Item | null {
  const k = spelled(text);
  if (!k) return null;
  const tries = [k, stripDet(k), stripDet(k).replace(/s$/, ""), stripDet(k).replace(/es$/, "")];
  for (const t of tries) if (ix.ITEMIDX[t]) return ix.ITEMIDX[t];
  if (exactOnly) return null;
  for (const t of tries) if (ix.ALIASIDX[t]) return ix.ALIASIDX[t];
  return null;
}

/** How alike two strings are, from 0 to 1: one minus their edit distance (Levenshtein) over the length of the longer one. */
export function similarity(a: string, b: string): number {
  const m = a.length, n = b.length;
  if (!m || !n) return m === n ? 1 : 0;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

/** A speech recognizer's reading of a learner's words, resolved to the practice item it most likely names. */
export interface NearItem {
  /** the item's name or the alias, as the data spells it */
  said: string;
  item: Item;
  /** the similarity of what was heard to `said`, 0 to 1 */
  score: number;
}
/**
 * The practice item whose name or alias is nearest to `text`, when it is at least `min` alike (articles left out on
 * both sides). A recognizer mishears rare words ("a medal table", "a wooden tablet"); typed text goes through
 * `matchItem`, which needs the words exactly.
 */
export function nearestItem(ix: DataIndex, text: unknown, min = 0.8): NearItem | null {
  const k = stripDet(spelled(text));
  if (k.length < 3) return null;
  let best: NearItem | null = null;
  const consider = (said: string, item: Item) => {
    const score = similarity(k, stripDet(spelled(said)));
    if (score >= min && (!best || score > best.score)) best = { said, item, score };
  };
  for (const it of ix.DATA.items) consider(it.n, it);
  for (const [alias, name] of Object.entries(ix.DATA.aliases || {})) {
    const it = ix.ALIASIDX[spelled(alias)];
    if (it && it.n === name) consider(alias, it);
  }
  return best;
}
