// Placing a reference example (docs/DATA.md) in a practice category by its classes alone, by the rule the tutor's notes prove a
// side with (ladder.ts): "yes" when the category's term is one of its classes or above one in the "is a" chain; "no" when a class in
// its chain excludes one the category's things are in (`contra`), when the category's things are all of a class the example is
// not, or when it does not exist. Anything else the data cannot tell, and the example stays out of that cell: a cell is never
// filled by guessing that what the data does not say is false.
import type { Cat } from "../ai-shared/data";
import { LEVELS, examplesFor } from "../ai-shared/examples";
import type { Example, Levels } from "../ai-shared/examples";
import { spelled, stripDet, upChain } from "../ai-shared/lookup";
import type { DataIndex } from "../ai-shared/lookup";
import type { CellId } from "../ai-shared/relations";
import { catChain, excludes } from "./ladder";
import type { Witnesses } from "./universe";

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

/** Whether an example may be drawn for a learner who draws examples from `levels`. */
export function drawable(ex: Pick<Example, "cf" | "lv">, levels: Levels): boolean {
  return (DRAWN as readonly (string | undefined)[]).includes(ex.cf) && levels.includes(ex.lv);
}

/** Switches a level on or off. The last level on stays on: examples always come from somewhere. */
export function toggleLevel(levels: Levels, level: number): number[] {
  const on = levels.includes(level);
  if (on && levels.length === 1) return [...levels];
  return LEVELS.filter((l) => (l === level ? !on : levels.includes(l)));
}

/** How many examples a learner can be shown at each level (`drawable` by confirmation), for the switches of the levels. */
export function levelCounts(items: readonly Pick<Example, "cf" | "lv">[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const l of LEVELS) out[l] = items.filter((ex) => drawable(ex, [l])).length;
  return out;
}

/** The kinds that may stand in a cell. Things and representations always; relations and negations when level 3 or 4 is on; a combination or a statement is another question's ("is X a Y?" would be wrong for it). */
const PLAIN_KINDS = ["thing", "representation"];
const LATER_KINDS = ["relation", "negation"];

/**
 * Whether the example may be shown as the reference of a cell of a practice pair for a learner who draws examples from `levels`: confirmed
 * or textbook (`drawable`), a kind a cell takes, and no expert background (one a beginner could not read).
 */
export function cellExample(ex: Pick<Example, "cf" | "lv" | "k" | "bg">, levels: Levels): boolean {
  if (!drawable(ex, levels) || ex.bg === "expert") return false;
  return !ex.k || PLAIN_KINDS.includes(ex.k) || (levels.some((l) => l >= 3) && LATER_KINDS.includes(ex.k));
}

/**
 * The reference examples that can stand in the cells of a pair of categories, from `levels`: those `cellExample` allows whose cell
 * `placeByClass` proves for both categories (a side it cannot prove leaves the example out), and not those the practice list has under
 * the same name (the list's own classes are the ones the practice grades with). A function of the pair, for `pairOf`.
 */
export function witnessesOf(ix: DataIndex, items: readonly Example[], levels: Levels): Witnesses {
  const usable = items.filter((ex) => cellExample(ex, levels));
  const key = (n: string) => stripDet(spelled(n));
  const listed = new Set(ix.DATA.items.map((i) => key(i.n)));
  return (a, b) => {
    const out: Record<CellId, Example[]> = { both: [], anb: [], bna: [], nei: [] };
    const A = ix.CAT[a], B = ix.CAT[b];
    if (!A || !B) return out;
    for (const ex of usable) {
      if (listed.has(key(ex.n))) continue;
      const x = placeByClass(ix, ex, A), y = placeByClass(ix, ex, B);
      if (x && y) out[x === "yes" ? (y === "yes" ? "both" : "anb") : y === "yes" ? "bna" : "nei"].push(ex);
    }
    return out;
  };
}

// The examples of a term (for a definition card, and for the tutor's examples_of) are chosen in src/ai-shared/examples.ts, where the tutor's code can use them.
export { examplesFor };
