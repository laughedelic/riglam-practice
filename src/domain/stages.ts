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
/** The Dudra categories whose term the learner has not been introduced to yet (domain/intro.ts): they wait out of the questions. */
export type Unmet = ReadonlySet<string>;

/** Whether the category is open for a learner with these stages on: it opens at or below the highest, and its term has been introduced (none in `unmet`). */
export const catOpen = (cat: Pick<Cat, "st"> & { id?: string }, on: Stages, unmet?: Unmet): boolean => catStage(cat) <= topStage(on) && !(cat.id && unmet?.has(cat.id));

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

/** The highest stage at which a newly opened category's definition shows with the question by itself; above it the definition is a tap away. */
export const DEFINITION_STAGE = 3;

/**
 * The categories of a question (a pair's two, or the ones Categories asks about) whose definition shows with it: those that open at the
 * highest stage that is on, while that stage is at most DEFINITION_STAGE (help that fades: the words are new at the low stages, and from
 * the established bases on they are a tap away). Only categories with a Dudra term, since an everyday category has no definition. Ids,
 * in the order given, each once.
 */
export function newCategories(ix: DataIndex, cats: readonly (string | null | undefined)[], on: Stages): string[] {
  const top = topStage(on);
  if (top > DEFINITION_STAGE) return [];
  return cats.filter((c, i, all): c is string => !!c && all.indexOf(c) === i && !!ix.CAT[c]?.term && catStage(ix.CAT[c]) === top);
}

/** The negation track (Relations and Pervasions): off, one side negated in some pairs (A or B), or also both. */
export type Negation = "off" | "one" | "both";

/** The right answers in a row after which the next step of the negation track is offered (never taken without a tap). */
export const NEG_STREAK = 5;

/** A Relations answer as the negation offer reads it: right or not, and whether the pair had a negated side. */
export interface NegOutcome {
  ok: boolean;
  neg: boolean;
}

/**
 * The next step of the negation track to offer, as the tutors practice it: plain things first, then one side negated, then both. Offered
 * once the latest `need` answers of the kind the learner is on are right in a row: plain pairs while negations are off, negated pairs while
 * one side is; null otherwise, and with both sides on. Answers of the other kind neither extend nor break the run. `results` are oldest
 * first; the caller leaves out those from before the last time the offer was answered, so a "not now" is not asked again at once.
 */
export function negationOffer(results: readonly NegOutcome[], negation: Negation, need = NEG_STREAK): "one" | "both" | null {
  if (negation === "both") return null;
  const want = negation === "one";
  let n = 0;
  for (let i = results.length - 1; i >= 0 && n < need; i--) {
    if (results[i]!.neg !== want) continue;
    if (!results[i]!.ok) break;
    n++;
  }
  return n >= need ? (want ? "both" : "one") : null;
}

/** The right answers in a row, on questions new at the highest stage that is on, after which the next stage comes in: by itself on the Path, with a station that says so first; offered with a tap on the classic page. */
export const STAGE_STREAK = 5;
/** Staying on a stage a while longer asks this many more right answers in a row before the next one comes, up to STAGE_STREAK_MAX. */
export const STAGE_LONGER = 5;
export const STAGE_STREAK_MAX = 30;
/** The wrong answers in a row, on questions new at the highest stage that is on, after which taking it off is suggested. */
export const STAGE_STUMBLE = 4;

/** The run towards an offer of the stages, part of the learner's progression: right answers in a row at the highest stage on (`up`), wrong ones (`down`). */
export interface StageRun {
  up: number;
  down: number;
  /** the right answers in a row the next stage waits for, once the learner chose to stay longer (none: STAGE_STREAK) */
  need?: number;
  /** the stages have been explained at a station: the later ones come with a short line */
  told?: true;
  /** the learner moves the stages up themselves (the Stages page): no stage comes in by itself or is offered */
  manual?: true;
}
export const freshRun = (): StageRun => ({ up: 0, down: 0 });
export const runNeed = (run: StageRun): number => run.need ?? STAGE_STREAK;
/** The run starts again, with what the learner has told the page (the station was seen, the stages are theirs to move) kept. */
export const restartRun = (run: StageRun): StageRun => ({ up: 0, down: 0, ...(run.told ? { told: true as const } : {}), ...(run.manual ? { manual: true as const } : {}) });
/** The run once a stage came in: it starts again, and the station has been seen. */
export const movedUp = (run: StageRun): StageRun => ({ ...restartRun(run), told: true });
/** The run once the learner chose to stay on the stage a while longer (the station was seen): it starts again, and the next stage waits for more right answers. */
export const stayLonger = (run: StageRun): StageRun => ({ ...restartRun(run), told: true, need: Math.min(STAGE_STREAK_MAX, runNeed(run) + STAGE_LONGER) });
/** The run with the stages moved up by the learner (`manual`) or by the page (the default). */
export const setManual = (run: StageRun, manual: boolean): StageRun => { const r = { ...run }; delete r.manual; return manual ? { ...r, manual: true } : r; };

/**
 * What a mistake in an exercise says: "words" (Categories, Relations: about the categories, so it also counts towards taking the stage off), "pair"
 * (Pervasions: it ends the run up), "form" (Syllogisms, Find a pair: mostly about the form of the exercise, so it neither ends the run nor counts).
 */
export type MissKind = "words" | "pair" | "form";

/**
 * The run after an answer to a question new at stage `st` (the highest stage of what it used: its categories, its thing, the things that fill its
 * cells). Any exercise counts: the stages are the same in all of them. Only a question new at the highest stage that is on counts; the others
 * neither extend nor end the run.
 */
export function runAfter(run: StageRun, on: Stages, st: number, ok: boolean, miss: MissKind): StageRun {
  if (st !== topStage(on)) return run;
  if (ok) return { ...run, up: run.up + 1, down: 0 };
  if (miss === "form") return run;
  return { ...run, up: 0, down: miss === "words" ? run.down + 1 : run.down };
}

/**
 * The stage move that is due, if any: the next stage once the run up is long enough (`need`, five unless the learner chose to stay longer) and every
 * course term of the highest stage on has had its stop (`met`; intro.ts, stageMet), unless the learner moves the stages themselves (`manual`);
 * taking the highest stage off after a run of mistakes, only where a mistake is about the words, and never at stage 1. The caller starts the run
 * again once a move is answered, so a "not now" is not asked again at once.
 */
export function stageOffer(run: StageRun, on: Stages, met: boolean, miss: MissKind): { kind: "up" | "down"; stage: number } | null {
  const top = topStage(on);
  if (!run.manual && run.up >= runNeed(run) && met && top < MAX_STAGE) return { kind: "up", stage: top + 1 };
  if (miss === "words" && run.down >= STAGE_STUMBLE && top > 1) return { kind: "down", stage: top };
  return null;
}

/** A stored run, each part checked; a fresh one when it cannot be read. */
export function normRun(raw: unknown): StageRun {
  let v: unknown = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw); } catch { return freshRun(); } }
  const o = (v && typeof v === "object" ? v : {}) as Partial<StageRun>, n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
  const need = n(o.need);
  return { up: n(o.up), down: n(o.down), ...(need > STAGE_STREAK ? { need: Math.min(STAGE_STREAK_MAX, need) } : {}), ...(o.told === true ? { told: true as const } : {}), ...(o.manual === true ? { manual: true as const } : {}) };
}

/** Until an exercise has had a run of STAGE_STREAK right answers, about this share of its questions are new at the highest stage, instead of half: a new exercise starts with review. */
export const START_SHARE = 0.25;

/** What the progression keeps of one exercise: the right answers in a row up to STAGE_STREAK, after which it stays there (the exercise has warmed up), and the right answers in all. */
export interface ExerciseRun {
  run: number;
  right: number;
}
/** An exercise's record after an answer. */
export function exerciseAfter(r: ExerciseRun | undefined, ok: boolean): ExerciseRun {
  const run = r?.run ?? 0, right = r?.right ?? 0;
  return { run: ok ? Math.min(STAGE_STREAK, run + 1) : run >= STAGE_STREAK ? run : 0, right: right + (ok ? 1 : 0) };
}
/** The share of an exercise's questions new at the highest stage on: START_SHARE until its first run of STAGE_STREAK right, then half. */
export const newShare = (r: ExerciseRun | undefined): number => ((r?.run ?? 0) >= STAGE_STREAK ? 0.5 : START_SHARE);
/** The stored records of the exercises, each checked; none when they cannot be read. */
export function normExRuns(raw: unknown): Record<string, ExerciseRun> {
  let v: unknown = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw); } catch { return {}; } }
  const out: Record<string, ExerciseRun> = {}, n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
  for (const [k, r] of Object.entries(v && typeof v === "object" ? v : {})) if (/^[a-z]{1,20}$/.test(k) && r && typeof r === "object") out[k] = { run: Math.min(STAGE_STREAK, n((r as ExerciseRun).run)), right: n((r as ExerciseRun).right) };
  return out;
}

/**
 * The right answers in an exercise after which its guided form (the hints, the structure shown, the sentences spelled out) turns off by itself,
 * with a line that says so; a choice the learner made stays.
 */
export const GUIDE_RIGHT = 20;
/** Whether an exercise shows its guided form: as set (by the learner, or by itself once), else on. */
export const guidedOn = (set: boolean | undefined): boolean => set ?? true;
/** Whether the guided form turns off by itself after this answer: nothing set yet, and the exercise has had GUIDE_RIGHT right answers. */
export const guideTurnsOff = (set: boolean | undefined, r: ExerciseRun | undefined): boolean => set === undefined && (r?.right ?? 0) >= GUIDE_RIGHT;
/** The stored choices of the guided form, by exercise; none when they cannot be read. */
export function normGuided(raw: unknown): Record<string, boolean> {
  let v: unknown = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw); } catch { return {}; } }
  const out: Record<string, boolean> = {};
  for (const [k, on] of Object.entries(v && typeof v === "object" ? v : {})) if (/^[a-z]{1,20}$/.test(k) && typeof on === "boolean") out[k] = on;
  return out;
}
