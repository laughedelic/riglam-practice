// Placing a reference example (docs/DATA.md) in a practice category by its classes alone, by the rule the tutor's notes prove a
// side with (ladder.ts): "yes" when the category's term is one of its classes or above one in the "is a" chain; "no" when a class in
// its chain excludes one the category's things are in (`contra`), when the category's things are all of a class the example is
// not, or when it does not exist. Anything else the data cannot tell, and the example stays out of that cell: a cell is never
// filled by guessing that what the data does not say is false.
import type { Cat } from "../ai-shared/data";
import type { Example } from "../ai-shared/examples";
import { upChain } from "../ai-shared/lookup";
import type { DataIndex } from "../ai-shared/lookup";
import { catChain, excludes } from "./ladder";

export type Placement = "yes" | "no" | null;

/**
 * Whether the example is in the category: "yes", "no", or null when the data cannot tell (or says both, which a wrong class in the
 * data would). Class names the data does not have are passed over, so an example made for a newer release places less, never wrongly.
 * A "yes" needs a Dudra category; an everyday one ("round things") is about more than the class, so only its "no" can be proved.
 */
export function placeByClass(ix: DataIndex, ex: Pick<Example, "cls" | "not" | "ne">, cat: Cat): Placement {
  const tc = catChain(ix, cat);
  if (!tc.length) return null;
  const ups = (ex.cls ?? []).map((c) => upChain(ix, c)).filter((u) => u.length);
  const yes = cat.kind === "dudra" && !!cat.term && ups.some((u) => u.includes(cat.term!));
  const no = !!ex.ne || (ex.not ?? []).some((n) => tc.includes(n)) || ups.some((u) => u.some((x) => tc.some((y) => excludes(ix, x, y))));
  if (yes && no) return null;
  return yes ? "yes" : no ? "no" : null;
}

/** The confirmations an example needs to be drawn into a cell; a commentator's example is shown with its term only. */
export const DRAWN = ["confirmed", "textbook"] as const;

/** Whether an example may be drawn for a learner who sees examples up to `maxLevel`. */
export function drawable(ex: Pick<Example, "cf" | "lv">, maxLevel: number): boolean {
  return (DRAWN as readonly (string | undefined)[]).includes(ex.cf) && ex.lv <= maxLevel;
}

/** How well the sources confirm an example, best first. */
const CONFIRMED = ["confirmed", "textbook", "commentator"];
const rank = (ex: Pick<Example, "cf">) => { const i = CONFIRMED.indexOf(ex.cf ?? ""); return i < 0 ? CONFIRMED.length : i; };

/**
 * Examples of a term for its definition card: its own (an instance of the term itself) before those of its subclasses, then the lowest
 * level, the better confirmed, and the name. A statement is not an example of a term and an example the sources say it is not an instance of
 * the term does not count. Up to `max`; after the term's own, as many different subclasses as possible first, so that a broad term shows a
 * spread and not three of one kind. The same list for the same data.
 */
export function examplesFor(ix: DataIndex, items: readonly Example[], term: string, max = 3): Example[] {
  if (!Object.hasOwn(ix.DATA.terms, term)) return [];
  const ranked: { ex: Example; own: boolean; cls: string }[] = [];
  for (const ex of items) {
    if (ex.k === "statement" || ex.not?.includes(term)) continue;
    const classes = (ex.cls ?? []).filter((c) => upChain(ix, c).includes(term));
    if (classes.length) ranked.push({ ex, own: classes.includes(term), cls: classes.includes(term) ? term : classes[0] });
  }
  ranked.sort((a, b) => Number(b.own) - Number(a.own) || a.ex.lv - b.ex.lv || rank(a.ex) - rank(b.ex) || a.ex.n.localeCompare(b.ex.n));
  const out = ranked.filter((r) => r.own).slice(0, max);
  const seen = new Set<string>();
  for (const r of ranked) {
    if (out.length < max && !r.own && !seen.has(r.cls)) {
      out.push(r);
      seen.add(r.cls);
    }
  }
  for (const r of ranked) if (out.length < max && !out.includes(r)) out.push(r);
  return out.map((r) => r.ex);
}
