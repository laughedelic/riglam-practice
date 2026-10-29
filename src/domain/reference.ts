// Placing a reference example (docs/DATA.md) in a practice category by its classes alone, by the rule the tutor's notes prove a
// side with (ladder.ts): "yes" when the category's term is one of its classes or above one in the "is a" chain; "no" when a class in
// its chain excludes one the category's things are in (`contra`), when the category's things are all of a class the example is
// not, or when it does not exist. Anything else the data cannot tell, and the example stays out of that cell: a cell is never
// filled by guessing that what the data does not say is false.
import type { Cat } from "../ai-shared/data";
import { examplesFor } from "../ai-shared/examples";
import type { Example } from "../ai-shared/examples";
import { spelled, stripDet, upChain } from "../ai-shared/lookup";
import type { DataIndex } from "../ai-shared/lookup";
import type { CellId } from "../ai-shared/relations";
import { catChain, excludes } from "./ladder";
import { LADDER_TOP, MAX_STAGE, STAGES, normStages, topStage } from "./stages";
import type { Stages } from "./stages";
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

/**
 * Where the export's stages fall on this ladder. The exporter numbers them by the ladder of nine stages it was written for: 1 everyday things,
 * 2 what is seen, 3 what is heard, smelled, tasted or touched, 4 the textbook's own things, what does not exist and minds, 5 a sense or mental
 * consciousness, 6 the course's words (things named or glossed by them), 7 one step, 8 two steps, 9 more. Each goes to the stage that opens
 * what it needs, never an earlier one.
 */
const EXPORT_STAGE: Readonly<Record<number, number>> = { 1: 0, 2: 2, 3: 3, 4: 5, 5: 6, 6: 8, 7: 10, 8: 11, 9: 12 };

/**
 * A reference example's stage: its own (format 3, `EXPORT_STAGE`), else its level's: the examples are the course's, so a plain one (level 1)
 * waits for the course words (stage 8) and each level after it is a step of depth.
 */
export const exampleStage = (ex: Pick<Example, "lv" | "st">): number =>
  typeof ex.st === "number" && EXPORT_STAGE[ex.st] !== undefined ? EXPORT_STAGE[ex.st] : ex.lv <= 1 ? 8 : Math.min(MAX_STAGE, ex.lv + LADDER_TOP - 1);

/** Whether an example may be drawn for a learner with these stages on: confirmed or textbook, of a stage that is on. */
export function drawable(ex: Pick<Example, "cf" | "lv" | "st">, on: Stages): boolean {
  return (DRAWN as readonly (string | undefined)[]).includes(ex.cf) && normStages(on).includes(exampleStage(ex));
}

/** How many examples a learner can be shown at each stage (`drawable` by confirmation), for the switches of the stages. */
export function stageCounts(items: readonly Pick<Example, "cf" | "lv" | "st">[]): Record<number, number> {
  const out: Record<number, number> = {};
  for (const s of STAGES) out[s.n] = 0;
  for (const ex of items) if ((DRAWN as readonly (string | undefined)[]).includes(ex.cf)) out[exampleStage(ex)]++;
  return out;
}

/** The kinds that may stand in a cell. Things and representations always; relations and negations from the stage that takes one step further; a combination or a statement is another question's ("is X a Y?" would be wrong for it). */
const PLAIN_KINDS = ["thing", "representation"];
const LATER_KINDS = ["relation", "negation"];
const LATER_STAGE = LADDER_TOP + 1;

/**
 * Whether the example may be shown as the reference of a cell of a practice pair for a learner with these stages on: confirmed or textbook
 * of a stage that is on (`drawable`), a kind a cell takes, and no expert background (one a beginner could not read).
 */
export function cellExample(ex: Pick<Example, "cf" | "lv" | "st" | "k" | "bg">, on: Stages): boolean {
  if (!drawable(ex, on) || ex.bg === "expert") return false;
  return !ex.k || PLAIN_KINDS.includes(ex.k) || (topStage(on) >= LATER_STAGE && LATER_KINDS.includes(ex.k));
}

/**
 * The reference examples that can stand in the cells of a pair of categories, for these stages: those `cellExample` allows whose cell
 * `placeByClass` proves for both categories (a side it cannot prove leaves the example out), and not those the practice list has under
 * the same name (the list's own classes are the ones the practice grades with). A function of the pair, for `pairOf`.
 */
export function witnessesOf(ix: DataIndex, items: readonly Example[], on: Stages): Witnesses {
  const usable = items.filter((ex) => cellExample(ex, on));
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
