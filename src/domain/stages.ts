// The learning ladder: nine stages from everyday things to the deep layers. The data says at which stage each category opens and
// at which stage a newcomer knows each thing (`st`, docs/DATA.md); this says what the stages are called, which of them a learner
// draws from, and the rules that hold for every exercise: a category opens at its stage and stays open, a thing is drawn from the
// stages switched on, and a person or what does not exist meets the physical categories only from the established bases on (a dog
// is not a form, but that is taught with "a person is not its body"). Pure functions of the data, like the rest of this folder.
import type { Cat, Item } from "../ai-shared/data";
import { upChain } from "../ai-shared/lookup";
import type { DataIndex } from "../ai-shared/lookup";
import type { CellId } from "../ai-shared/relations";
import { CELLS } from "../ai-shared/relations";
import { catChain } from "./ladder";
import type { PoolEntry } from "./types";
import { cellsFor } from "./universe";

/** A stage: its number, its name, and a sentence on what it adds. */
export interface Stage {
  n: number;
  name: string;
  adds: string;
}

export const STAGES: readonly Stage[] = [
  { n: 1, name: "Things around you", adds: "Everyday things, what they are made of, their colors and shapes; food, plants, animals, feelings and thoughts. Form is anything physical." },
  { n: 2, name: "What you see", adds: "Colors and shapes as qualities of things: the red of an apple, not the apple." },
  { n: 3, name: "What you hear, smell, taste and touch", adds: "Sounds, smells, tastes, and what is felt by touch, in plain words." },
  { n: 4, name: "Established bases", adds: "Functional and permanent things, consciousness and persons; people; what does not exist, absences, and the textbook's own things." },
  { n: 5, name: "The inner side", adds: "The sense powers, and the minds that see, hear, smell, taste, feel, remember and imagine." },
  { n: 6, name: "Course words", adds: "Things named by the course's own words: generic images, selflessness, impermanence, the elements." },
  { n: 7, name: "One step further", adds: "One step on a familiar thing: its absence, its cause, a mind that knows it." },
  { n: 8, name: "Two steps", adds: "Two steps in a row, such as the absence of the effect of a pot." },
  { n: 9, name: "Deep layers and statements", adds: "Three steps or more, and statements." },
];
export const MAX_STAGE = STAGES.length;

/** The stage from which persons and what does not exist are asked about with the physical categories. */
export const HOLD_STAGE = 4;

/** The stages a learner draws from: any mix, never none. */
export type Stages = readonly number[];

/** A new device starts at stage 1 alone: the exercises offer the next stage once the answers come easily. */
export const DEFAULT_STAGES: Stages = [1];

/** The valid stages in a stored value (a list, or "1,2"), once each, in order; the default when none is valid. */
export function normStages(raw: unknown): number[] {
  const list: unknown[] = typeof raw === "string" ? raw.split(",").map((s) => (s.trim() ? +s : NaN)) : Array.isArray(raw) ? raw : [];
  const ok = STAGES.map((s) => s.n).filter((n) => list.includes(n));
  return ok.length ? ok : [...DEFAULT_STAGES];
}

/** The highest stage that is on: the categories open up to it, and it is the newest for the mix of the draw. */
export const topStage = (on: Stages): number => Math.max(...normStages(on));

/** Switches a stage on or off. The last stage on stays on: things are always drawn from somewhere. */
export function toggleStage(on: Stages, n: number): number[] {
  const now = normStages(on), has = now.includes(n);
  if (has && now.length === 1) return now;
  return STAGES.map((s) => s.n).filter((s) => (s === n ? !has : now.includes(s)));
}

/**
 * The stages that take the place of the example levels a device kept before the ladder (1 to 4 for the reference examples alone): every
 * stage up to the old top level's (level 1 is stage 6, level 4 stage 9), so the practice items stay as they were and the reference
 * examples keep nearly all of what they had.
 */
export const stagesOfLevels = (levels: readonly number[]): number[] => {
  const top = Math.max(0, ...levels.filter((l) => Number.isInteger(l) && l >= 1 && l <= 4));
  return top ? STAGES.map((s) => s.n).filter((n) => n <= top + 5) : [...DEFAULT_STAGES];
};

/** A practice item's stage; data without stages has everything at stage 1. */
export const itemStage = (it: Pick<Item, "st">): number => it.st ?? 1;
/** The stage at which a category opens; none: from the start. */
export const catStage = (cat: Pick<Cat, "st">): number => cat.st ?? 1;
/** Whether the category is open for a learner with these stages on: it opens at or below the highest. */
export const catOpen = (cat: Pick<Cat, "st">, on: Stages): boolean => catStage(cat) <= topStage(on);

/** Whether the category is about physical things: Form, what is below it, or an everyday category of forms. */
export const physical = (ix: DataIndex, cat: Cat): boolean => catChain(ix, cat).includes("Form");

/** Whether the item is neither physical nor a mind (a person, a permanent thing, what does not exist), so it is held back from the physical categories. */
export const heldBack = (ix: DataIndex, it: Pick<Item, "t">): boolean => {
  const up = upChain(ix, it.t);
  return !up.includes("Form") && !up.includes("Consciousness");
};

/** The stage at which the item can stand for the pair: its own, or the hold's when it is held back and either category is physical. */
export function itemStageFor(ix: DataIndex, it: Item, a: string, b: string): number {
  const s = itemStage(it);
  return s < HOLD_STAGE && heldBack(ix, it) && (physical(ix, ix.CAT[a]) || physical(ix, ix.CAT[b])) ? HOLD_STAGE : s;
}

/** Whether a learner with these stages on is shown the item for the pair: its own stage is on, and when it is held back the highest stage has reached the hold. */
export function itemOn(ix: DataIndex, it: Item, a: string, b: string, on: Stages): boolean {
  return on.includes(itemStage(it)) && itemKnown(ix, it, a, b, on);
}
/** Whether the learner knows the item for the pair: its stage for the pair is at most the highest that is on (a stage below may be off). */
export const itemKnown = (ix: DataIndex, it: Item, a: string, b: string, on: Stages): boolean => itemStageFor(ix, it, a, b) <= topStage(on);

/**
 * The stage a pair is new at: the highest of its categories' stages and, for each cell the whole data fills, the lowest stage of a thing
 * that fills it (held back where the hold applies). A learner meets the pair from that stage on, when the relation shown is the true one and
 * every cell has a thing the learner knows. Null when the highest stage that is on is below it.
 */
export function pairStage(ix: DataIndex, a: string, b: string, on: Stages, cells: Record<CellId, readonly Item[]> = cellsFor(ix, a, b)): number | null {
  const A = ix.CAT[a], B = ix.CAT[b], top = topStage(on);
  if (!A || !B || !catOpen(A, on) || !catOpen(B, on)) return null;
  let st = Math.max(catStage(A), catStage(B));
  for (const c of CELLS) {
    if (!cells[c].length) continue;
    let low = Infinity;
    for (const it of cells[c]) low = Math.min(low, itemStageFor(ix, it, a, b));
    st = Math.max(st, low);
  }
  return st <= top ? st : null;
}

/** A pool entry a learner with these stages on can be drawn, with the stage it is new at (one of those that are on). */
export interface StagedEntry extends PoolEntry {
  st: number;
}

// kept per pool and per set of stages: the pool is made once per data, and a learner changes stages rarely
const staged = new WeakMap<readonly PoolEntry[], Map<string, StagedEntry[]>>();
/**
 * The entries of the pool that can be drawn with these stages on: those new at a stage that is on (a set, not a ceiling: stages 1 and 3 draw
 * the pairs new at either, and their cells may hold things of stage 2), each with the stage it is new at.
 */
export function poolAt(ix: DataIndex, pool: readonly PoolEntry[], on: Stages): StagedEntry[] {
  const key = normStages(on).join(",");
  let byKey = staged.get(pool);
  if (!byKey) staged.set(pool, (byKey = new Map()));
  const hit = byKey.get(key);
  if (hit) return hit;
  const out: StagedEntry[] = [];
  for (const e of pool) {
    const st = pairStage(ix, e.a, e.b, on);
    if (st !== null && on.includes(st)) out.push({ ...e, st });
  }
  byKey.set(key, out);
  return out;
}
