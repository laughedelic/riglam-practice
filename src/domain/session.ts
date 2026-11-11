// A session of mixed practice: a short run of questions that moves between the exercises by itself, planned ahead, and whose questions hang
// together in rounds. A pair round walks one pair of categories from one example (Categories on a thing with both among the rows, or Find an
// instance for the two) to the two terms (Relations or Pervasions) to a reason (a syllogism with one of them as the reason for the other). A
// term round meets one course term from several sides, each time beside another partner. A question that was missed comes back before the
// session ends, as another exercise on the same terms (`comeBacks`).
//
// What a session is made of can be set (`mix`, `from`): the exercises it asks, two of them at the least, and what its rounds are drawn from. A round
// has a place for one example, one for the two terms and one to close with, and each place has two exercises that can fill it; where the mix has
// none for a place, the second exercise of another place steps in, so that a round is three questions while the mix has three exercises, and two
// with a mix of two.
//
// A plan holds no questions, only what each is about, written down as given.ts takes it (`Given`): the page makes the question when its turn
// comes, by the exercise's own rules, so it is shown and graded like any other. The planner makes each once, to know that the data can make it
// for this learner (the stages, the terms met), and reads from a syllogism which reply is right, so that the three replies come about as often.
// Each step after the first of a round has a line that says what it carries over from the step before (`tie`): what is the same, never the
// answer. Pure functions of the data and of a random source, like the draws: the same data and the same random numbers give the same plan.
import type { Item } from "../ai-shared/data";
import type { DataIndex } from "../ai-shared/lookup";
import { CELLS } from "../ai-shared/relations";
import type { CellId, RelKey } from "../ai-shared/relations";
import { givenInstance, givenPair, givenPlace, givenRelation, givenSyllogism } from "./given";
import type { Given, GivenOptions } from "./given";
import { termCats } from "./intro";
import { catStage, itemKnown, poolAt, topStage } from "./stages";
import type { StagedEntry, Stages } from "./stages";
import type { Reply } from "./syllogism";
import type { PoolEntry, PoolRel } from "./types";
import { buildPool, cellsFor, relOfCells } from "./universe";
import type { PairWords, Rng } from "./universe";
import { cap, isMiss, pick } from "./util";

/** One question of a session. */
export interface SessionStep {
  /** what the question is about, as given.ts makes it when its turn comes */
  given: Given;
  /** the categories it turns on (ids): what the round carries, and what a miss brings back */
  cats: string[];
  /** what it carries over from the step before, as the learner reads it; "" for the first step of a round */
  tie: string;
  /** it came back after a miss */
  again?: true;
}

/** A few questions of different exercises about the same thing: a pair of categories, or one course term. */
export interface SessionRound {
  kind: "pair" | "term";
  /** the two categories of a pair round, the category of a term round */
  cats: string[];
  steps: SessionStep[];
}

export interface SessionPlan {
  rounds: SessionRound[];
}

/** What a plan is made for. */
export interface SessionOptions {
  /** the learner's stages: every question is one a learner at them is asked */
  stages: Stages;
  /** the learner's terms (intro.ts): a category in `unmet` is in no question, and a term round is about one of the `open` terms first */
  words?: PairWords;
  rng?: Rng;
  /** the pair pool (`buildPool`), where the caller keeps one; made once per data otherwise */
  pool?: readonly PoolEntry[];
  /** how many rounds (default `SESSION_ROUNDS`) */
  rounds?: number;
  /** categories to pass over while others remain: those of the sessions before, so that the next one is about something else */
  avoid?: ReadonlySet<string>;
  /** the exercises the session asks (default `SESSION_MIX`): no question is of another */
  mix?: readonly SessionExercise[];
  /** what the rounds are drawn from (default `all`) */
  from?: SessionFrom;
  /** with `from: "missed"`: what the learner got wrong lately, as the categories of each question (`sessionMisses`); with none, the rounds are drawn as from `all` */
  missed?: readonly (readonly string[])[];
  /**
   * The rounds are added to a session under way that has had this many pair rounds: no term round opens them, and the pair rounds go on taking turns
   * from there.
   */
  turn?: number;
  /** with `turn`: the categories the session has had. They are passed over before anything else is looked at, also what was missed, while the data has others. */
  had?: ReadonlySet<string>;
}

/** An exercise a session can ask. */
export type SessionExercise = Given["exercise"];
/** The exercises a session can mix, in the order they are offered: the two terms, the reasons, the one example, and Find a pair. */
export const SESSION_EXERCISES: readonly SessionExercise[] = ["practice", "debate", "syllogism", "categories", "instance", "find"];
/** The mix where none was chosen: every exercise but Find a pair, the longest question (the learner names a pair of their own), which is in a session only once it is added. */
export const SESSION_MIX: readonly SessionExercise[] = SESSION_EXERCISES.filter((x) => x !== "find");
/** The fewest exercises a mix has: with one, nothing would move between the exercises. */
export const SESSION_MIX_MIN = 2;
/** What the rounds of a session are drawn from: everything the learner practices, the newest stage first, or what was missed lately first. */
export type SessionFrom = "all" | "new" | "missed";
export const SESSION_FROM: readonly SessionFrom[] = ["all", "new", "missed"];

/**
 * The mix as it was kept (the exercises that are in it, with commas between), in the order they are offered. `SESSION_MIX` when nothing was kept, or
 * what was is no mix: a name that is no exercise is passed over, and fewer than `SESSION_MIX_MIN` are none.
 */
export function sessionMix(kept: string | null | undefined): SessionExercise[] {
  const names = typeof kept === "string" ? kept.split(",") : null, mix = names ? SESSION_EXERCISES.filter((x) => names.includes(x)) : [];
  return mix.length >= SESSION_MIX_MIN ? mix : [...SESSION_MIX];
}
/** What a session is drawn from as it was kept; `all` when nothing was, or what was is none of the three. */
export const sessionFrom = (kept: string | null | undefined): SessionFrom => SESSION_FROM.find((x) => x === kept) ?? "all";

/** A kept answer, as far as a session reads it: when it was given, how it went, and the categories it was about (by the exercise that kept it). */
export interface SessionAnswer {
  at?: string;
  mode?: string;
  grade?: string;
  correct?: boolean;
  /** the two terms of Relations and Pervasions, the reason and the predicate of a syllogism */
  catA?: string | null;
  catB?: string | null;
  /** Find an instance: the categories asked */
  cats?: readonly string[];
  /** Categories: each category offered, whether the thing is in it, and what the learner said */
  rows?: readonly { cat: string; yes: boolean; said: boolean }[];
}
/** How many of the last misses a session draws from. */
export const SESSION_MISSES = 40;
/**
 * What the learner got wrong lately, as the categories of each question, the newest first, at most `SESSION_MISSES`. Of the same categories the
 * last answer counts, whatever exercise asked them, so that what was put right since is no miss. A thing judged by categories is a question of each
 * category by itself: the ones it was judged wrongly by are missed.
 */
export function sessionMisses(answers: readonly SessionAnswer[]): string[][] {
  const last = new Map<string, { cats: string[]; miss: boolean; n: number }>();
  let n = 0;
  const say = (cats: readonly (string | null | undefined)[], miss: boolean) => {
    const of = [...new Set(cats.filter((x): x is string => !!x))].sort();
    if (of.length) last.set(of.join("|"), { cats: of, miss, n: n++ });
  };
  for (const a of [...answers].sort((x, y) => (x.at || "").localeCompare(y.at || ""))) {
    if (a.mode === "categories") { for (const r of a.rows ?? []) say([r.cat], r.yes !== r.said); continue; }
    const cats = a.cats ?? [a.catA, a.catB];
    // (a pair is its two categories: an answer that names one alone says nothing of it)
    if (a.cats || (a.catA && a.catB)) say(cats, isMiss(a));
  }
  return [...last.values()].filter((x) => x.miss).sort((x, y) => y.n - x.n).slice(0, SESSION_MISSES).map((x) => x.cats);
}

/** The rounds of a session: with three steps each, nine questions. */
export const SESSION_ROUNDS = 3;
/** The steps of the term round a session opens with (a thing, a thing the learner names, a reason). */
export const TERM_STEPS = 3;

/** The questions of a session where nothing is missed. */
export const SESSION_QUESTIONS = SESSION_ROUNDS * 3;
/** The exercises a term round has a step of. */
const TERM_EXERCISES: readonly SessionExercise[] = ["categories", "instance", "practice", "debate", "syllogism"];
/**
 * How many questions a session of this mix has where nothing is missed and the data has enough for the learner: three to a round, fewer where the mix has
 * fewer exercises for it (a term round has no step of Find a pair, and needs two of the others).
 */
export function sessionSize(mix: readonly SessionExercise[] = SESSION_MIX, rounds = SESSION_ROUNDS): number {
  const pair = Math.min(3, new Set(mix).size), term = Math.min(TERM_STEPS, TERM_EXERCISES.filter((x) => mix.includes(x)).length);
  return rounds > 1 && term >= 2 ? term + (rounds - 1) * pair : rounds * pair;
}

/** Whether a step with this grade (of its kept answer: ok, part, bad, pend) was missed, so that it comes back: as Review counts a miss (util.ts, isMiss). */
export const sessionMiss = (grade: string | null | undefined): boolean => grade === "bad" || grade === "part";

/** How a session went: how many of its steps there are, and how many were right, partly right, wrong, wait for Claude's check, or were not answered. */
export interface SessionTally { n: number; right: number; partly: number; wrong: number; waiting: number; skipped: number }
/** The tally of a session, from the grade of each step (of its kept answer: ok, part, bad, pend; anything else is a step that was not answered). */
export function sessionTally(grades: readonly (string | null | undefined)[]): SessionTally {
  const t: SessionTally = { n: grades.length, right: 0, partly: 0, wrong: 0, waiting: 0, skipped: 0 };
  for (const g of grades) t[g === "ok" ? "right" : g === "part" ? "partly" : g === "bad" ? "wrong" : g === "pend" ? "waiting" : "skipped"]++;
  return t;
}

/** What a round is about, as the learner reads it: its term, or its two terms ("Color · Shape"). */
export function roundName(ix: DataIndex, t: Pick<SessionRound, "cats">): string {
  return t.cats.map((id) => { const c = ix.CAT[id]; return cap(c ? c.term || c.labels[0] : id); }).join(" · ");
}

/** What a step is, among the steps of a plan: no two steps of a plan ask the same exercise of the same categories. */
export const stepKey = (s: Pick<SessionStep, "given" | "cats">): string => s.given.exercise + "|" + [...s.cats].sort().join("|");

interface Ctx {
  ix: DataIndex;
  on: Stages;
  rng: Rng;
  /** what every question of the plan is made with */
  given: GivenOptions;
  /** the pairs a round can be about: those drawn at the stages, without the terms not met */
  pairs: readonly StagedEntry[];
  /** how often each reply to a syllogism is the right one in the plan so far */
  said: Record<Reply, number>;
  /** the exercises in the mix */
  can: ReadonlySet<SessionExercise>;
  from: SessionFrom;
  /** what was missed lately, with `from: "missed"`: the pairs (`pairKey`), every category of a missed question, and the categories of the misses that are no pair */
  missed: { pairs: ReadonlySet<string>; cats: ReadonlySet<string>; alone: ReadonlySet<string> };
}

const pairKey = (a: string, b: string): string => (a < b ? a + "|" + b : b + "|" + a);

const pools = new WeakMap<object, readonly PoolEntry[]>();
function context(ix: DataIndex, o: SessionOptions): Ctx {
  const rng = o.rng ?? Math.random, unmet = o.words?.unmet;
  let pool = o.pool ?? pools.get(ix.DATA);
  if (!pool) pools.set(ix.DATA, (pool = buildPool(ix)));
  const pairs = poolAt(ix, pool, o.stages).filter((e) => e.a !== e.b && !unmet?.has(e.a) && !unmet?.has(e.b));
  const from = o.from ?? "all", missed = from === "missed" ? o.missed ?? [] : [];
  return {
    ix, on: o.stages, rng, given: { stages: o.stages, words: o.words, rng, now: () => 0 }, pairs, said: { accept: 0, reason: 0, pervasion: 0 },
    can: new Set(o.mix ?? SESSION_MIX), from,
    missed: { pairs: new Set(missed.filter((m) => m.length === 2).map((m) => pairKey(m[0], m[1]))), cats: new Set(missed.flat()), alone: new Set(missed.filter((m) => m.length !== 2).flat()) },
  };
}

function shuffle<T>(xs: readonly T[], rng: Rng): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

const step = (given: Given, cats: readonly string[], tie = ""): SessionStep => ({ given, cats: [...cats], tie });

/** The things among these that a question about the two categories can be about for the learner: they exist, can be a subject, and are known at the stages. */
const things = (c: Ctx, items: readonly Item[], a: string, b: string): Item[] => items.filter((it) => !it.ne && !it.nosubject && itemKnown(c.ix, it, a, b, c.on));

// ---- the steps ----

/** Categories on the first of the things the exercise can ask it of, with the categories of `must` among the rows. */
function placeStep(c: Ctx, of: readonly Item[], must: readonly string[], tie = ""): { step: SessionStep; thing: string } | null {
  for (const it of of) {
    const q = givenPlace(c.ix, it.n, must, c.given);
    // a screen where everything applies asks nothing
    if (q && q.rows.some((r) => !r.answer)) return { thing: it.n, step: step({ exercise: "categories", thing: it.n, cats: [...must] }, must, tie) };
  }
  return null;
}

/** Find an instance for the set, where the exercise's own draw asks it. */
const instanceStep = (c: Ctx, set: readonly string[], tie = ""): SessionStep | null => (givenInstance(c.ix, set, c.given) ? step({ exercise: "instance", cats: [...set] }, set, tie) : null);

/** Relations or Pervasions on the pair, A first. */
const pairStep = (c: Ctx, exercise: "practice" | "debate", a: string, b: string, tie = ""): SessionStep | null => (givenPair(c.ix, a, b, c.given) ? step({ exercise, a, b }, [a, b], tie) : null);

/** How many things of each case of a pair are tried as the subject of a syllogism. */
const SUBJECTS = 4;

/**
 * A syllogism on the two categories, one as the reason for the other, about a thing of the pair. Of all that the data can make (either way round,
 * a few things of each case of the pair), one whose right reply the plan has had least: of those replies one, each as likely, then a thing that
 * gives it. `back` (the thing of the step before) comes first where it does, so that it returns as the subject, and a thing of the pair before
 * one that is in neither category.
 */
function reasonStep(c: Ctx, a: string, b: string, tie: (subject: string) => string, back?: string): SessionStep | null {
  const cells = cellsFor(c.ix, a, b), found: { subject: string; reason: string; predicate: string; answer: Reply; back: boolean; out: boolean }[] = [];
  for (const [reason, predicate] of [[a, b], [b, a]]) for (const k of CELLS) {
    const of = shuffle(things(c, cells[k], a, b), c.rng).sort((x, y) => Number(y.n === back) - Number(x.n === back)).slice(0, SUBJECTS);
    for (const it of of) {
      const y = givenSyllogism(c.ix, it.n, reason, predicate, c.given);
      if (y) found.push({ subject: it.n, reason, predicate, answer: y.answer, back: it.n === back, out: k === "nei" });
    }
  }
  if (!found.length) return null;
  const least = Math.min(...found.map((f) => c.said[f.answer]));
  const answer = pick([...new Set(found.filter((f) => c.said[f.answer] === least).map((f) => f.answer))], c.rng);
  let of = found.filter((f) => f.answer === answer);
  for (const first of [(f: (typeof found)[number]) => f.back, (f: (typeof found)[number]) => !f.out]) { const kept = of.filter(first); if (kept.length) of = kept; }
  const hit = pick(of, c.rng);
  c.said[hit.answer]++;
  return step({ exercise: "syllogism", subject: hit.subject, reason: hit.reason, predicate: hit.predicate }, [hit.reason, hit.predicate], tie(hit.subject));
}

// ---- a round on one pair: an example, the two terms, a reason ----

/** The cases of a pair whose things tell the most about its relation: Categories asks about one of them. */
const TELLING: Record<RelKey, readonly CellId[]> = { "3ab": ["bna", "both"], "3ba": ["anb", "both"], "4": ["anb", "bna", "both"], con: ["anb", "bna"], mi: ["both"] };

/** A few things of each telling case of the pair that a question can be about, in a random order. */
function telling(c: Ctx, a: string, b: string): Item[] {
  const cells = cellsFor(c.ix, a, b);
  return shuffle(TELLING[relOfCells(cells)].flatMap((k) => shuffle(things(c, cells[k], a, b), c.rng).slice(0, 6)), c.rng);
}

/** How a pair round is walked: the exercise of each of its three places, where the mix has it (else the other of the place); what is left out is drawn. */
export interface PairRoundOptions {
  /** the exercise of the one example */
  first?: "categories" | "instance";
  /** the exercise of the two terms */
  two?: "practice" | "debate";
  /** the exercise the round closes with: a reason, or the relation of the pair the other way round, for a pair of the learner's own (default: a reason) */
  last?: "syllogism" | "find";
}

/** The three places of a pair round, and the two exercises that can fill each. */
const PLACES: readonly (readonly [SessionExercise, SessionExercise])[] = [["categories", "instance"], ["practice", "debate"], ["syllogism", "find"]];
/**
 * The order of the exercises in a round. Where a place has both of its exercises: the thing is named before a thing is judged (so that the thing judged
 * is not there to be named), the relation is said before it is walked statement by statement (Pervasions ends on the relation), and the pair of the
 * learner's own comes last.
 */
const ORDER: readonly SessionExercise[] = ["instance", "categories", "practice", "debate", "syllogism", "find"];

/**
 * The exercises of a pair round, in the order they are asked: of each place the one asked for where the mix has it, else the other; with a place the
 * mix has nothing for, the other exercise of another place steps in (of the two terms first, then of the example, then of the close), up to three.
 */
function walkOf(c: Ctx, o: PairRoundOptions): SessionExercise[] {
  const want: SessionExercise[] = [o.first ?? pick(["categories", "instance"] as const, c.rng), o.two ?? (c.rng() < 0.6 ? "practice" : "debate"), o.last ?? "syllogism"];
  const walk: SessionExercise[] = [], spare: (SessionExercise | undefined)[] = [];
  PLACES.forEach(([x, y], i) => {
    const first = want[i], other = first === x ? y : x;
    if (c.can.has(first)) { walk.push(first); if (c.can.has(other)) spare[i] = other; } else if (c.can.has(other)) walk.push(other);
  });
  for (const i of [1, 0, 2]) { const x = spare[i]; if (x && walk.length < PLACES.length) walk.push(x); }
  return ORDER.filter((x) => walk.includes(x));
}

function pairRoundOf(c: Ctx, a: string, b: string, o: PairRoundOptions = {}): SessionRound | null {
  if (a === b || !c.ix.CAT[a] || !c.ix.CAT[b]) return null;
  const walk = walkOf(c, o), steps: SessionStep[] = [];
  if (walk.length < 2) return null;
  // what the steps so far hand on: the thing that was judged, and whether the two terms have stood side by side (their relation was said)
  let thing: string | undefined, sided = false;
  const place = (tie: string) => { const p = placeStep(c, telling(c, a, b), [a, b], tie); if (p) thing = p.thing; return p ? p.step : null; };
  for (const ex of walk) {
    const first = !steps.length;
    let s: SessionStep | null;
    if (ex === "instance") {
      // something that is both, named; where the data asks no such thing of the pair, a thing judged instead (unless that comes anyway)
      s = instanceStep(c, [a, b]) ?? (c.can.has("categories") && !walk.includes("categories") ? place("") : null);
    } else if (ex === "categories") {
      // a telling thing judged by categories with both terms among them; where there is none, something that is both, named (unless that came already)
      s = place(first ? "" : "The same two terms are now among the categories you judge a thing by.") ?? (c.can.has("instance") && !walk.includes("instance") ? instanceStep(c, [a, b]) : null);
    } else if (ex === "practice" || ex === "debate") {
      // the two terms: their relation, by Relations or by the four statements
      s = pairStep(c, ex, a, b, first ? "" : sided ? "The same pair, now statement by statement." : thing ? "Two of the categories you just judged " + thing + " by, now side by side." : "The same two terms, now as a pair.");
      sided = true;
    } else if (ex === "syllogism") {
      // a reason: one of the two as the reason for the other
      s = reasonStep(c, a, b, (subject) => (first ? "" : (subject === thing ? cap(subject) + " comes back as the subject. " : "") + "The same two terms: one is now the reason for the other."), thing);
    } else {
      // the other way round: another pair with the same relation, named by the learner (the line says that the relation is the same only once it was said)
      const relation = givenRelation(relOfCells(cellsFor(c.ix, a, b)));
      s = relation ? step({ exercise: "find", relation }, [a, b], first ? "" : sided ? "The same relation, the other way round: you name another pair that has it." : "Now the other way round: you are given a relation, and name a pair that has it.") : null;
    }
    if (!s) return null;
    steps.push(s);
  }
  return { kind: "pair", cats: [a, b], steps };
}

/**
 * A round on one pair of categories: one example, the two terms, and a reason (or with `last: "find"`, a pair of the learner's own), as far as the
 * mix has the exercises for them. Null when the data cannot make every step for the learner (a category it lacks or the learner has not met, a
 * pair it does not judge, no syllogism it can settle), or the mix leaves fewer than two.
 */
export function pairRound(ix: DataIndex, a: string, b: string, o: SessionOptions & PairRoundOptions): SessionRound | null {
  return pairRoundOf(context(ix, o), a, b, o);
}

// ---- a round on one term: the same term from several sides, each time beside another partner ----

function termRoundOf(c: Ctx, id: string, max: number): SessionRound | null {
  const cat = c.ix.CAT[id];
  if (!cat || c.given.words?.unmet?.has(id)) return null;
  const name = cap(cat.term || cat.labels[0]), steps: SessionStep[] = [];
  const partners = shuffle(c.pairs.filter((e) => e.a === id || e.b === id), c.rng).map((e) => { const other = e.a === id ? e.b : e.a; return { other, rel: relOfCells(cellsFor(c.ix, id, other)) }; });
  const used = new Set<string>();
  /** A partner with one of the relations that no step has yet, a course term before an everyday category. */
  const take = (rels: readonly RelKey[]) => {
    const of = partners.filter((p) => rels.includes(p.rel) && !used.has(p.other)), hit = of.find((p) => c.ix.CAT[p.other].kind === "dudra") ?? of[0];
    if (hit) used.add(hit.other);
    return hit;
  };
  // 1 a thing that is one, judged by categories with the term among them
  const one = c.can.has("categories") && placeStep(c, shuffle(things(c, c.ix.DATA.items.filter((it) => it.c.includes(id)), id, id), c.rng).slice(0, 10), [id]);
  if (one) steps.push(one.step);
  // 2 a thing the learner names, together with a term that crosses it or holds it
  const cross = take(["4"]) ?? take(["3ab", "3ba"]);
  const two = cross && c.can.has("instance") && instanceStep(c, [id, cross.other], name + " again: this time you name the thing.");
  if (two) steps.push(two);
  // 3 beside what holds it or what it holds
  const up = take(["3ab", "3ba"]);
  const three = up && c.can.has("practice") && pairStep(c, "practice", id, up.other, name + " again, now as one of a pair.");
  if (three) steps.push(three);
  // 4 beside what it shuts out
  const out = take(["con"]);
  const four = out && c.can.has("debate") && pairStep(c, "debate", id, out.other, name + " again, beside another term, statement by statement.");
  if (four) steps.push(four);
  // 5 in a reason, with the first of the partners the data can make one for
  if (c.can.has("syllogism")) for (const p of [up, cross, out]) {
    const five = p && reasonStep(c, id, p.other, () => name + " again, now in a reason.");
    if (five) { steps.push(five); break; }
  }
  // a short round keeps its ends: a thing first, a reason last
  const kept = steps.length > max ? [...steps.slice(0, max - 1), steps[steps.length - 1]] : steps;
  // as many as a session's term round has, or as the mix has exercises for; two at the least
  if (kept.length < Math.max(2, Math.min(TERM_STEPS, TERM_EXERCISES.filter((x) => c.can.has(x)).length))) return null;
  // (each line is written for a step that follows another: the first of the round carries nothing over)
  return { kind: "term", cats: [id], steps: kept.map((x, i) => (i ? x : { ...x, tie: "" })) };
}

/**
 * A round on one course term, at most `steps` questions (default 5): a thing that is one, a thing the learner names, the term beside a wider or
 * narrower one, beside one it shuts out, and in a reason, each where the mix has its exercise. Null when the data makes fewer than three of them
 * for the learner (two, with a mix that has only two of these exercises).
 */
export function termRound(ix: DataIndex, id: string, o: SessionOptions & { steps?: number }): SessionRound | null {
  return termRoundOf(context(ix, o), id, o.steps ?? 5);
}

/**
 * The course terms a term round can be about, in the order to try them: the open ones (met, the last answer not right yet), then those of the highest
 * stage, then the others; those to avoid last. Drawn from the newest stage, its terms come before every other, the open ones first among them and
 * those to avoid last. Drawn from what was missed, the open terms and then the terms missed by themselves come first, also the ones to avoid (the
 * terms of a missed pair are left for the round on that pair: no category of one round is in another).
 */
function termOrder(c: Ctx, avoid?: ReadonlySet<string>): string[] {
  const top = topStage(c.on), unmet = c.given.words?.unmet, open = c.given.words?.open?.size ? termCats(c.given.words.open) : null;
  const ids = shuffle(Object.values(c.ix.CAT).filter((x) => x.kind === "dudra" && !!x.term && c.on.includes(catStage(x)) && !unmet?.has(x.id)).map((x) => x.id), c.rng);
  const high = (id: string) => catStage(c.ix.CAT[id]) === top;
  const rank = (id: string) =>
    c.from === "new" ? (high(id) ? 0 : 4) + (avoid?.has(id) ? 2 : 0) + (open?.has(id) ? 0 : 1)
    : c.from === "missed" && (open?.has(id) || c.missed.alone.has(id)) ? (open?.has(id) ? -2 : -1)
    : avoid?.has(id) ? 3 : open?.has(id) ? 0 : high(id) ? 1 : 2;
  return ids.map((id, i) => ({ id, i })).sort((x, y) => rank(x.id) - rank(y.id) || x.i - y.i).map((x) => x.id);
}

// ---- the session ----

/**
 * A pair for a round: none of the categories the plan has (`seen`), those to `avoid` and the relations it has (`rels`) only when nothing else is
 * left. A pair new at the highest stage half the time, then a relation, each as likely, then a pair, one with a course term most of the time.
 * Drawn from the newest stage, a pair new at it while there is one. Drawn from what was missed, a pair that was missed while there is one, then a
 * pair with a category of a miss, also among those to avoid. What a session under way has `had` is passed over first of all, while there are others.
 */
function drawPair(c: Ctx, seen: ReadonlySet<string>, failed: ReadonlySet<StagedEntry>, rels: ReadonlySet<PoolRel>, avoid?: ReadonlySet<string>, had?: ReadonlySet<string>): StagedEntry | null {
  const top = topStage(c.on);
  let left = c.pairs.filter((e) => !seen.has(e.a) && !seen.has(e.b) && !failed.has(e));
  /** Keeps the pairs that are so, while there are any. Whether there were. */
  const prefer = (so: (e: StagedEntry) => boolean): boolean => { const kept = left.filter(so); if (kept.length) left = kept; return kept.length > 0; };
  if (had) prefer((e) => !had.has(e.a) && !had.has(e.b));
  const missed = c.from === "missed" && (prefer((e) => c.missed.pairs.has(pairKey(e.a, e.b))) || prefer((e) => c.missed.cats.has(e.a) || c.missed.cats.has(e.b)));
  const newest = c.from === "new" && prefer((e) => e.st === top);
  if (!missed) prefer((e) => !avoid?.has(e.a) && !avoid?.has(e.b));
  prefer((e) => !rels.has(e.r));
  if (!left.length) return null;
  const high = newest ? [] : left.filter((e) => e.st === top), of = high.length && c.rng() < 0.5 ? high : left;
  const r = pick([...new Set(of.map((e) => e.r))], c.rng), ofRel = of.filter((e) => e.r === r);
  const course = ofRel.filter((e) => c.ix.CAT[e.a].kind === "dudra" || c.ix.CAT[e.b].kind === "dudra");
  return pick(course.length && c.rng() < 0.7 ? course : ofRel, c.rng);
}

/** How many pairs are tried for the rounds of a plan before it is left shorter. */
const PAIR_TRIES = 200;

/**
 * The plan of a session: a short term round first, where the learner has met a course term it can be about (an open one before the others),
 * then pair rounds, each about other categories and, while the data has them, another relation; the example, the two terms and the close of the
 * pairs come by turns from the two exercises that can ask them, where the mix has both. Fewer rounds than asked for, or none, when the data has
 * no more for the learner. With `turn`, the rounds are added to a session under way: pair rounds only, taking turns from there.
 */
export function planSession(ix: DataIndex, o: SessionOptions): SessionPlan {
  const c = context(ix, o), n = Math.max(0, o.rounds ?? SESSION_ROUNDS), rounds: SessionRound[] = [], seen = new Set<string>();
  const add = (t: SessionRound) => { rounds.push(t); for (const s of t.steps) for (const x of s.cats) seen.add(x); };
  if (n > 1 && o.turn === undefined) for (const id of termOrder(c, o.avoid)) {
    const t = termRoundOf(c, id, TERM_STEPS);
    if (t) { add(t); break; }
  }
  const failed = new Set<StagedEntry>(), rels = new Set<PoolRel>();
  for (let tries = 0, turn = o.turn ?? 0; tries < PAIR_TRIES && rounds.length < n; tries++) {
    const e = drawPair(c, seen, failed, rels, o.avoid, o.turn === undefined ? undefined : o.had);
    if (!e) break;
    const t = pairRoundOf(c, e.a, e.b, turn % 2 ? { first: "instance", two: "debate", last: "find" } : { first: "categories", two: "practice", last: "syllogism" });
    if (t) { add(t); rels.add(e.r); turn++; } else failed.add(e);
  }
  return { rounds };
}

// ---- a miss comes back from another side ----

/** The ways a miss can come back: in a reason, as a thing to name, as a thing to judge, as a pair for Relations, and statement by statement in Pervasions. */
type Way = "reason" | "named" | "placed" | "pair" | "stated";
const WAY_EXERCISE: Record<Way, Given["exercise"]> = { reason: "syllogism", named: "instance", placed: "categories", pair: "practice", stated: "debate" };
/** The ways to try for a miss in each exercise, the first the data can make and the session has not asked: the side furthest from the miss first. */
const BACK: Record<Given["exercise"], readonly Way[]> = {
  practice: ["reason", "named", "placed", "stated"],
  debate: ["reason", "named", "placed", "pair"],
  find: ["reason", "named", "placed", "pair", "stated"],
  syllogism: ["pair", "stated", "named", "placed"],
  categories: ["named", "pair", "stated", "reason"],
  instance: ["placed", "pair", "stated", "reason"],
};

/** What a missed step comes back as: another exercise of the mix on the same categories, one the session has not asked of them (`asked`: step keys). */
function comeBack(c: Ctx, missed: SessionStep, asked: ReadonlySet<string>): SessionStep | null {
  const [a, b] = missed.cats, ex = missed.given.exercise;
  if (!a || !c.ix.CAT[a] || (b && !c.ix.CAT[b])) return null;
  const cats = b ? [a, b] : [a];
  const lead = ex === "syllogism" ? "The reason and the predicate of the syllogism you missed" : b ? "Two terms you missed earlier" : "A term you missed earlier";
  const make: Record<Way, () => SessionStep | null | undefined> = {
    reason: () => (b ? reasonStep(c, a, b, () => lead + ", now in a reason.") : null),
    named: () => instanceStep(c, cats, lead + ". This time you name the thing."),
    placed: () => placeStep(c, b ? telling(c, a, b) : shuffle(things(c, c.ix.DATA.items.filter((it) => it.c.includes(a)), a, a), c.rng).slice(0, 10), cats, lead + ", now with a thing to judge by " + (b ? "them." : "it."))?.step,
    pair: () => (b ? pairStep(c, "practice", a, b, lead + ", now as a pair.") : null),
    stated: () => (b ? pairStep(c, "debate", a, b, lead + ", statement by statement.") : null),
  };
  for (const way of BACK[ex] ?? []) {
    if (!c.can.has(WAY_EXERCISE[way]) || asked.has(WAY_EXERCISE[way] + "|" + [...cats].sort().join("|"))) continue;
    const s = make[way]();
    if (s) return { ...s, again: true };
  }
  // one term alone, and the data asks nothing more of it by itself: beside one of its partners
  if (!b && c.can.has("practice")) for (const e of shuffle(c.pairs.filter((p) => p.a === a || p.b === a), c.rng).slice(0, 6)) {
    const s = pairStep(c, "practice", e.a, e.b, lead + ", now as one of a pair.");
    if (s && !asked.has(stepKey(s))) return { ...s, again: true };
  }
  return null;
}

/**
 * The steps that come back at the end of a session for the ones that were missed (`missed`: their step keys), in the order of the plan: each as
 * another exercise on the same categories, and none a question the session has had or another miss has brought back. One for each round, for
 * its first miss that the data has something more for, so that a session stays about as long as it was planned however it went: three rounds of
 * three are nine to twelve questions.
 */
export function comeBacks(ix: DataIndex, plan: SessionPlan, missed: ReadonlySet<string>, o: SessionOptions): SessionStep[] {
  const c = context(ix, o), asked = new Set(plan.rounds.flatMap((t) => t.steps.map(stepKey))), out: SessionStep[] = [];
  for (const t of plan.rounds) for (const s of t.steps) {
    if (!missed.has(stepKey(s))) continue;
    const back = comeBack(c, s, asked);
    if (back) { out.push(back); asked.add(stepKey(back)); break; }
  }
  return out;
}
