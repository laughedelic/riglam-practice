// Looking things up in the term data: the index built from it, and matching of free text to a practice item or
// category. Pure functions of the data, so the page and the Worker tutor resolve a learner's words the same way.
import type { Cat, DrillData, Item } from "./data";
import type { PairLike } from "./relations";

/** The lookup tables over the data. The page keeps the same five fields on its `state`, so `state` can be passed as an index. */
export interface DataIndex {
  DATA: DrillData;
  /** category id -> category */
  CAT: Record<string, Cat>;
  /** normalized item name (also without its article) -> item */
  ITEMIDX: Record<string, Item>;
  /** normalized alias ("table") -> item ("a wooden table"); never shadows an item name */
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

// The tables have no prototype: a learner's word such as "constructor" must find nothing, not Object's method.
const table = <T>(): Record<string, T> => Object.create(null);

export function makeIndex(DATA: DrillData): DataIndex {
  const CAT = table<Cat>();
  for (const c of DATA.cats) CAT[c.id] = c;
  const ITEMIDX = table<Item>();
  const put = (k: string, it: Item) => { if (k && !ITEMIDX[k]) ITEMIDX[k] = it; };
  for (const it of DATA.items) { const k = norm(it.n); put(k, it); put(stripDet(k), it); }
  const ALIASIDX = table<Item>();
  for (const [k, v] of Object.entries(DATA.aliases || {})) {
    const it = DATA.items.find((i) => i.n === v);
    if (it && !ITEMIDX[norm(k)]) ALIASIDX[norm(k)] = it;
  }
  const LABELIDX = table<string>();
  for (const c of DATA.cats) for (const l of c.labels) { const k = norm(l); if (!LABELIDX[k]) LABELIDX[k] = c.id; }
  return { DATA, CAT, ITEMIDX, ALIASIDX, LABELIDX };
}

/** Older batch pairs carry only labels; recover their categories when the labels are known. */
export function catByLabel(ix: DataIndex, l: unknown): string | null {
  const k = norm(l);
  return ix.LABELIDX[k] || ix.LABELIDX[k.replace(/s$/, "")] || ix.LABELIDX[k + "s"] || null;
}
export function pairCats(ix: DataIndex, p: PairLike): [string, string] | [null, null] {
  const a = p.catA || catByLabel(ix, p.a), b = p.catB || catByLabel(ix, p.b);
  return a && b && a !== b ? [a, b] : [null, null];
}
/** The practice item a learner's words name, or null. With `exactOnly` aliases do not count. */
export function matchItem(ix: DataIndex, text: unknown, exactOnly?: boolean): Item | null {
  const k = norm(text);
  if (!k) return null;
  const tries = [k, stripDet(k), stripDet(k).replace(/s$/, ""), stripDet(k).replace(/es$/, "")];
  for (const t of tries) if (ix.ITEMIDX[t]) return ix.ITEMIDX[t];
  if (exactOnly) return null;
  for (const t of tries) if (ix.ALIASIDX[t]) return ix.ALIASIDX[t];
  return null;
}
