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
