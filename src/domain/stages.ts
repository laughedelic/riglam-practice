// The learning ladder: stage 0 for everyday things alone, nine stages of course terms in three groups of three, then three steps of depth (LADDER_TOP). The data says at which stage each category opens and
// at which stage a newcomer knows each thing (`st`, docs/DATA.md); this says what the stages are called, which of them a learner
// draws from, and the rules that hold for every exercise: a category opens at its stage and stays open, a thing is drawn from the
// stages switched on, and a person or what does not exist meets the physical categories only from the established bases on (a dog
// is not a form, but that is taught with "a person is not its body"). Pure functions of the data, like the rest of this folder.
import type { Cat, Item } from "../ai-shared/data";
import { upChain } from "../ai-shared/lookup";
import type { DataIndex } from "../ai-shared/lookup";
import type { CellId } from "../ai-shared/relations";
import { CELLS } from "../ai-shared/relations";
import type { StageMark } from "./intro";
import { catChain } from "./ladder";
import type { PoolEntry } from "./types";
import { cellsFor } from "./universe";

/** A stage: its number, its name, and a sentence on what it adds; the first stage of a group of three names the group. */
export interface Stage {
  n: number;
  name: string;
  adds: string;
  group?: string;
}

export const STAGES: readonly Stage[] = [
  { n: 0, name: "Things around you", adds: "Everyday things, what they are made of, their colors and shapes; food, plants, animals, feelings and thoughts. No course terms yet." },
  { n: 1, name: "Form", adds: "Form and matter, two names for anything physical, and their first division: external form and external matter.", group: "Form, from outside" },
  { n: 2, name: "What the eye sees", adds: "Visible forms: colors and shapes as qualities of things, the red of an apple, not the apple." },
  { n: 3, name: "The other senses", adds: "Sounds, smells, tastes, and what is felt by touch, in plain words." },
  { n: 4, name: "The elements", adds: "What is felt by touch, divided: earth, water, fire and wind, and what arises from them, such as heaviness and smoothness.", group: "What things are made of, and what exists" },
  { n: 5, name: "What exists", adds: "Existents, functional and permanent things, consciousness and persons; people; what does not exist, and absences." },
  { n: 6, name: "The inner side", adds: "The inner side of form, the sense powers of the eye, ear, nose, tongue and body, and the minds: sense consciousness, and the mental consciousness that remembers and imagines." },
  { n: 7, name: "The five sense minds", adds: "The minds that see, hear, smell, taste and feel by touch, each by its name.", group: "Minds, and how things are known" },
  { n: 8, name: "Manifest and hidden", adds: "Manifest and hidden phenomena; things named by abstract words, such as impermanence and selflessness; sounds that express a meaning." },
  { n: 9, name: "The two truths", adds: "Two more ways of dividing what exists: ultimate and conventional truths, specifically and generally characterized phenomena." },
  { n: 10, name: "One-step chains", adds: "One step on a familiar thing: its absence, its cause, a mind that knows it." },
  { n: 11, name: "Two-step chains", adds: "Two steps in a row, such as the absence of the effect of a pot." },
  { n: 12, name: "Longer chains and statements", adds: "Three steps or more, and statements." },
];
/** The last stage, depth included. */
export const MAX_STAGE = STAGES[STAGES.length - 1]!.n;

/**
 * The last stage that brings new terms: the ladder ends there. The stages after it (chains of reasoning: one step, two, then longer) are the steps of depth,
 * a difficulty of its own like the negations: on the Path a result offers the next step (stageOffer, the same run as for any stage), never more by itself,
 * and the learner sets it on the Progression page.
 */
export const LADDER_TOP = 9;
/** The stages of the ladder as a row of rings shows them (the roadmap's foot, the stage station): those that bring course terms. Stage 0, everyday things alone, is on the Progression page only. */
export const RING_STAGES: readonly Stage[] = STAGES.filter((s) => s.n >= 1 && s.n <= LADDER_TOP);
/** The steps of depth that are on: how far past the ladder's last stage the highest stage on is, 0 to MAX_STAGE - LADDER_TOP. */
export const depthOf = (on: Stages): number => Math.max(0, topStage(on) - LADDER_TOP);
/** The stage of the ladder the learner is on: the highest that is on, or the ladder's last while depth is on. */
export const ladderTop = (on: Stages): number => Math.min(topStage(on), LADDER_TOP);
/** The stages of the ladder that are on, without the steps of depth (the ladder's top alone when only those are on). */
export function ladderOf(on: Stages): number[] {
  const l = on.filter((n) => n <= LADDER_TOP);
  return l.length ? [...l] : [ladderTop(on)];
}
/** Whether depth can be set: the ladder's last stage is on. */
export const depthOpen = (on: Stages): boolean => topStage(on) >= LADDER_TOP;
/** The stages with depth set to `d` steps: the ladder's as they are, then each step up to `d`. As they are while depth is not open. */
export function withDepth(on: Stages, d: number): number[] {
  if (!depthOpen(on)) return [...on];
  const k = Math.max(0, Math.min(MAX_STAGE - LADDER_TOP, Math.round(d)));
  return [...ladderOf(on), ...Array.from({ length: k }, (_, i) => LADDER_TOP + 1 + i)];
}

/** The stage from which persons and what does not exist are asked about with the physical categories. */
export const HOLD_STAGE = 5;

/** The stages a learner draws from: any mix, never none. */
export type Stages = readonly number[];

/** A new device starts at stage 0 alone, everyday things: five right answers in a row bring stage 1, and with it the first course term. */
export const DEFAULT_STAGES: Stages = [0];

/** The valid stages in a stored value (a list, or "0,1"), once each, in order; the default when none is valid. */
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
 * stage up to the old top level's (level 1 is the ladder's last, each level after it a step of depth), so the practice items stay as they were and the
 * reference examples keep nearly all of what they had.
 */
export const stagesOfLevels = (levels: readonly number[]): number[] => {
  const top = Math.max(0, ...levels.filter((l) => Number.isInteger(l) && l >= 1 && l <= 4));
  return top ? STAGES.map((s) => s.n).filter((n) => n <= LADDER_TOP + top - 1) : [...DEFAULT_STAGES];
};

/** A practice item's stage; data without stages has everything at stage 0. */
export const itemStage = (it: Pick<Item, "st">): number => it.st ?? 0;
/** The stage at which a category opens; none: from the start. */
export const catStage = (cat: Pick<Cat, "st">): number => cat.st ?? 0;
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
export const DEFINITION_STAGE = 4;

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
/** The stage from which the learner can switch negations on (the Progression page), and the one from which a result of Relations suggests them. */
export const NEG_OPEN = 2;
export const NEG_SUGGEST = 3;
/**
 * Whether a result may suggest the next step of the negation track (negationOffer says which, after a run): from NEG_SUGGEST on, and while fewer terms are open
 * than the learner's pace allows (intro.ts, openTerms): sooner for a learner whose answers come easily, later for one who is struggling with the terms.
 */
export const negationSuggested = (on: Stages, open: number, cap: number): boolean => topStage(on) >= NEG_SUGGEST && open < cap;

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

/**
 * The right answers in a row, on questions new at the highest stage that is on (those from a stage below count half, LOWER_CREDIT), after which the next
 * stage comes in: by itself, with a station that says so first. The stages are chapters of one list of terms: a stage that brings new terms comes with the first of them,
 * once the stage below has brought all of its own and fewer terms are open than the learner's pace allows (intro.ts, nextStageDue); the first step of
 * depth (stage 10, after LADDER_TOP) is offered once the last answer on each new term of stage 9 is right (runWanted). The run is for stage 0, which
 * brings no terms, for the steps of depth, and for a stage the learner stayed on a while longer or came back down to.
 */
export const STAGE_STREAK = 5;
/** Staying on a stage a while longer asks this many more right answers in a row before the next one comes, up to STAGE_STREAK_MAX. */
export const STAGE_LONGER = 5;
export const STAGE_STREAK_MAX = 30;
/** The wrong answers in a row, on questions new at the highest stage that is on, after which taking it off is suggested. */
export const STAGE_STUMBLE = 4;

/** The run towards an offer of the stages, part of the learner's progression: right answers in a row at the highest stage on (`up`, in halves: LOWER_CREDIT), wrong ones (`down`). */
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
/** The run once the learner took the highest stage off: it starts again, and the stage comes back after a run of right answers, not at the next answer. */
export const cameDown = (run: StageRun): StageRun => ({ ...restartRun(run), need: runNeed(run) });
/** The run once the learner chose to stay on the stage a while longer (the station was seen): it starts again, and the next stage waits for more right answers. */
export const stayLonger = (run: StageRun): StageRun => ({ ...restartRun(run), told: true, need: Math.min(STAGE_STREAK_MAX, runNeed(run) + STAGE_LONGER) });
/** The run with the stages moved up by the learner (`manual`) or by the page (the default). */
export const setManual = (run: StageRun, manual: boolean): StageRun => { const r = { ...run }; delete r.manual; return manual ? { ...r, manual: true } : r; };

/**
 * What a mistake in an exercise says: "words" (Categories, Relations: about the categories, so it also counts towards taking the stage off), "pair"
 * (Pervasions: it ends the run up), "form" (Syllogisms, Find a pair: mostly about the form of the exercise, so it neither ends the run nor counts).
 */
export type MissKind = "words" | "pair" | "form";

/** What a right answer to a question from a stage below the highest adds to the run: half, since review counts, but the stage the learner is climbing counts more. */
export const LOWER_CREDIT = 0.5;

/**
 * The run after an answer to a question new at stage `st` (the highest stage of what it used: its categories, its thing, the things that fill its
 * cells). Any exercise counts: the stages are the same in all of them. A question new at the highest stage that is on counts whole; a right
 * answer to one from a stage below counts LOWER_CREDIT, and a wrong one neither extends nor ends the run.
 */
export function runAfter(run: StageRun, on: Stages, st: number, ok: boolean, miss: MissKind): StageRun {
  const top = topStage(on);
  if (st >= 0 && st < top) return ok ? { ...run, up: run.up + LOWER_CREDIT } : run;
  if (st !== top) return run;
  if (ok) return { ...run, up: run.up + 1, down: 0 };
  if (miss === "form") return run;
  return { ...run, up: 0, down: miss === "words" ? run.down + 1 : run.down };
}

/**
 * The new terms of the highest stage on, for its move: how many it has, whether the last answer on each of them is right (intro.ts, termMark), and whether
 * the latest answer is the one that made them all right (`just`); and when the next stage brings new terms, whether its first is due now (`next`,
 * intro.ts, nextStageDue): the next stage then comes with it, whatever the marks.
 */
export interface StageTerms {
  n: number;
  right: boolean;
  just: boolean;
  next?: boolean;
}
/** A stage without new terms (stage 0, and the steps of depth), or a device that has no term stops yet: the run alone moves the stages. */
export const NO_TERMS: StageTerms = { n: 0, right: true, just: false };
/** The new terms of a stage from their marks. */
export function termsOf(marks: readonly StageMark[]): StageTerms {
  const right = marks.every((t) => t.mark === "ok");
  return { n: marks.length, right, just: right && marks.some((t) => t.now) };
}

/**
 * The right answers in a row the next stage waits for. When it brings new terms (`next`), none, unless the learner stayed longer or came back down
 * (`need`). Else none when the latest answer made the last new term of the stage right (unless `need` is set), and STAGE_STREAK or `need` otherwise: on
 * a stage without new terms, and on one whose terms were all right before.
 */
export const runWanted = (run: StageRun, terms: StageTerms): number => (terms.next !== undefined ? run.need ?? 0 : terms.just && run.need === undefined ? 0 : runNeed(run));
/** Whether the next stage is due by the terms and the run (`stageOffer`, `stageProgress`): its first term with a long enough run, or, when it brings none, the terms of this one right. */
const upDue = (run: StageRun, terms: StageTerms): boolean => (terms.next ?? terms.right) && run.up >= runWanted(run, terms);

/**
 * The stage move that is due, if any: the next stage once its first new term is due (`terms.next`), or, when it brings none, once the last answer on each
 * new term of the highest stage on is right, and the run up is as long as it has to be (`runWanted`), unless the learner moves the stages themselves
 * (`manual`); taking the highest stage off after a run of mistakes, only where a mistake is about the words, and never at stage 1 or 0. The caller starts the
 * run again once a move is answered, so a "not now" is not asked again at once.
 */
export function stageOffer(run: StageRun, on: Stages, terms: StageTerms, miss: MissKind): { kind: "up" | "down"; stage: number } | null {
  const top = topStage(on);
  if (!run.manual && upDue(run, terms) && top < MAX_STAGE) return { kind: "up", stage: top + 1 };
  if (miss === "words" && run.down >= STAGE_STUMBLE && top > 1) return { kind: "down", stage: top };
  return null;
}

/** How far the highest stage on is towards the next one (what the heading's ring shows). */
export interface StageProgress {
  /** the highest stage on: the one the learner is climbing */
  top: number;
  /** the stage that comes in next; none when the learner moves the stages themselves or the last one is on */
  next: number | null;
  /** the new terms of the stage with their marks, in the ring's order (intro.ts, stageMarks); none on a stage without */
  terms: readonly StageMark[];
  /** what the ring counts: the terms while one is not right yet, or the right answers in a row (a stage without new terms, or one whose terms were right before) */
  shows: "terms" | "run";
  /** the right answers in a row it waits for (in halves: LOWER_CREDIT; runWanted) */
  need: number;
  /** the part that is done, 0 to 1: the terms whose last answer is right, or the run (0 when no stage comes by itself) */
  frac: number;
  /** the next stage is due */
  full: boolean;
  /** the next stage brings new terms: it comes with the first of them, whatever the marks of these (`StageTerms.next`) */
  flow: boolean;
}
/**
 * `next`: whether the next stage's first new term is due (intro.ts, nextStageDue); undefined when it brings none, or on a page without term stops. `end`: the
 * last stage the ring leads to (the Path's ladder ends at LADDER_TOP); on it the ring shows its terms, however they stand.
 */
export function stageProgress(run: StageRun, on: Stages, marks: readonly StageMark[] = [], next?: boolean, end = MAX_STAGE): StageProgress {
  const top = topStage(on), up = run.manual || top >= end ? null : top + 1, terms = { ...termsOf(marks), ...(next === undefined ? {} : { next }) }, need = runWanted(run, terms);
  const shows = terms.n && (!terms.right || need === 0 || top >= end) ? "terms" : "run";
  const frac = up === null ? 0 : shows === "terms" ? marks.filter((t) => t.mark === "ok").length / terms.n : need ? Math.min(1, run.up / need) : 1;
  return { top, next: up, terms: marks, shows, need, frac, full: up !== null && upDue(run, terms), flow: next !== undefined };
}

/** A stored run, each part checked; a fresh one when it cannot be read. */
export function normRun(raw: unknown): StageRun {
  let v: unknown = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw); } catch { return freshRun(); } }
  const o = (v && typeof v === "object" ? v : {}) as Partial<StageRun>, n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
  const need = n(o.need), half = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x * 2) / 2 : 0);
  return { up: half(o.up), down: n(o.down), ...(need >= STAGE_STREAK ? { need: Math.min(STAGE_STREAK_MAX, need) } : {}), ...(o.told === true ? { told: true as const } : {}), ...(o.manual === true ? { manual: true as const } : {}) };
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
 * Guidance, the help an exercise gives on the Path, in three levels: Detailed spells things out in the item's own words (the relations with the
 * pair's terms, a counter-example or a syllogism's reply in full, course terms suggested where something is named), Hints gives the same shape with
 * letters (A and B; S, P and R), and None gives the names alone. An exercise starts at Detailed and steps down by itself: to Hints after GUIDE_RIGHT
 * right answers in it, to None after GUIDE_RIGHT more, with a line on the result each time. A level the learner picked stays.
 */
export type Guidance = "detailed" | "hints" | "none";
export const GUIDANCE: readonly Guidance[] = ["detailed", "hints", "none"];
/** The right answers in an exercise that each step of its guidance takes. */
export const GUIDE_RIGHT = 20;
/** The level an exercise's right answers bring it to by themselves: Detailed, Hints from GUIDE_RIGHT, None from twice that. */
export const guidanceByRight = (right: number): Guidance => (right >= 2 * GUIDE_RIGHT ? "none" : right >= GUIDE_RIGHT ? "hints" : "detailed");
/** An exercise's level: the learner's pick, else the one its right answers have brought it to. */
export const guidanceOf = (set: Guidance | undefined, r: ExerciseRun | undefined): Guidance => set ?? guidanceByRight(r?.right ?? 0);
/** The level an answer took the exercise down to by itself (its record before and after the answer), or null: none when the learner picked one. */
export function guidanceStep(set: Guidance | undefined, before: ExerciseRun | undefined, after: ExerciseRun | undefined): Guidance | null {
  if (set !== undefined) return null;
  const was = guidanceByRight(before?.right ?? 0), now = guidanceByRight(after?.right ?? 0);
  return was === now ? null : now;
}
/** The stored picks of guidance, by exercise; none when they cannot be read. A switch stored before the levels (on or off) reads as Detailed or None. */
export function normGuided(raw: unknown): Record<string, Guidance> {
  let v: unknown = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw); } catch { return {}; } }
  const out: Record<string, Guidance> = {};
  for (const [k, g] of Object.entries(v && typeof v === "object" ? v : {})) {
    if (!/^[a-z]{1,20}$/.test(k)) continue;
    if (typeof g === "boolean") out[k] = g ? "detailed" : "none";
    else if (GUIDANCE.includes(g as Guidance)) out[k] = g as Guidance;
  }
  return out;
}
