// A session of mixed practice: a short run of questions that moves between the exercises by itself, planned ahead, and whose questions hang
// together in threads. A pair thread walks one pair of categories from one example (Categories on a thing with both among the rows, or Find an
// instance for the two) to the two terms (Relations or Pervasions) to a reason (a syllogism with one of them as the reason for the other). A
// term thread meets one course term from several sides, each time beside another partner. A question that was missed comes back before the
// session ends, as another exercise on the same terms (`comeBacks`).
//
// A plan holds no questions, only what each is about, written down as given.ts takes it (`Given`): the page makes the question when its turn
// comes, by the exercise's own rules, so it is shown and graded like any other. The planner makes each once, to know that the data can make it
// for this learner (the stages, the terms met), and reads from a syllogism which reply is right, so that the three replies come about as often.
// Each step after the first of a thread has a line that says what it carries over from the step before (`tie`): what is the same, never the
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
import { cap, pick } from "./util";

/** One question of a session. */
export interface SessionStep {
  /** what the question is about, as given.ts makes it when its turn comes */
  given: Given;
  /** the categories it turns on (ids): what the thread carries, and what a miss brings back */
  cats: string[];
  /** what it carries over from the step before, as the learner reads it; "" for the first step of a thread */
  tie: string;
  /** it came back after a miss */
  again?: true;
}

/** A few questions of different exercises about the same thing: a pair of categories, or one course term. */
export interface SessionThread {
  kind: "pair" | "term";
  /** the two categories of a pair thread, the category of a term thread */
  cats: string[];
  steps: SessionStep[];
}

export interface SessionPlan {
  threads: SessionThread[];
}

/** What a plan is made for. */
export interface SessionOptions {
  /** the learner's stages: every question is one a learner at them is asked */
  stages: Stages;
  /** the learner's terms (intro.ts): a category in `unmet` is in no question, and a term thread is about one of the `open` terms first */
  words?: PairWords;
  rng?: Rng;
  /** the pair pool (`buildPool`), where the caller keeps one; made once per data otherwise */
  pool?: readonly PoolEntry[];
  /** how many threads (default `SESSION_THREADS`) */
  threads?: number;
  /** categories to pass over while others remain: those of the sessions before, so that the next one is about something else */
  avoid?: ReadonlySet<string>;
}

/** The threads of a session: with three steps each, nine questions. */
export const SESSION_THREADS = 3;
/** The steps of the term thread a session opens with (a thing, a thing the learner names, a reason). */
export const TERM_STEPS = 3;

/** What a step is, among the steps of a plan: no two steps of a plan ask the same exercise of the same categories. */
export const stepKey = (s: Pick<SessionStep, "given" | "cats">): string => s.given.exercise + "|" + [...s.cats].sort().join("|");

interface Ctx {
  ix: DataIndex;
  on: Stages;
  rng: Rng;
  /** what every question of the plan is made with */
  given: GivenOptions;
  /** the pairs a thread can be about: those drawn at the stages, without the terms not met */
  pairs: readonly StagedEntry[];
  /** how often each reply to a syllogism is the right one in the plan so far */
  said: Record<Reply, number>;
}

const pools = new WeakMap<object, readonly PoolEntry[]>();
function context(ix: DataIndex, o: SessionOptions): Ctx {
  const rng = o.rng ?? Math.random, unmet = o.words?.unmet;
  let pool = o.pool ?? pools.get(ix.DATA);
  if (!pool) pools.set(ix.DATA, (pool = buildPool(ix)));
  const pairs = poolAt(ix, pool, o.stages).filter((e) => e.a !== e.b && !unmet?.has(e.a) && !unmet?.has(e.b));
  return { ix, on: o.stages, rng, given: { stages: o.stages, words: o.words, rng, now: () => 0 }, pairs, said: { accept: 0, reason: 0, pervasion: 0 } };
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

// ---- a thread on one pair: an example, the two terms, a reason ----

/** The cases of a pair whose things tell the most about its relation: Categories asks about one of them. */
const TELLING: Record<RelKey, readonly CellId[]> = { "3ab": ["bna", "both"], "3ba": ["anb", "both"], "4": ["anb", "bna", "both"], con: ["anb", "bna"], mi: ["both"] };

/** A few things of each telling case of the pair that a question can be about, in a random order. */
function telling(c: Ctx, a: string, b: string): Item[] {
  const cells = cellsFor(c.ix, a, b);
  return shuffle(TELLING[relOfCells(cells)].flatMap((k) => shuffle(things(c, cells[k], a, b), c.rng).slice(0, 6)), c.rng);
}

/** How a pair thread is walked; what is left out is drawn. */
export interface PairThreadOptions {
  /** the exercise of the one example */
  first?: "categories" | "instance";
  /** the exercise of the two terms */
  two?: "practice" | "debate";
  /** a fourth step: Find a pair for the relation of the pair, the other way round */
  find?: boolean;
}

function pairThreadOf(c: Ctx, a: string, b: string, o: PairThreadOptions = {}): SessionThread | null {
  if (a === b || !c.ix.CAT[a] || !c.ix.CAT[b]) return null;
  const rel = relOfCells(cellsFor(c.ix, a, b));
  // 1 one example: a telling thing judged by categories with both terms among them, or something that is both, named
  const place = () => placeStep(c, telling(c, a, b), [a, b]), name = () => { const s = instanceStep(c, [a, b]); return s && { step: s, thing: undefined }; };
  const one = (o.first ?? pick(["categories", "instance"] as const, c.rng)) === "categories" ? place() ?? name() : name() ?? place();
  if (!one) return null;
  // 2 the two terms: their relation, by Relations or by the four statements
  const two = pairStep(c, o.two ?? (c.rng() < 0.6 ? "practice" : "debate"), a, b, one.thing ? "Two of the categories you just judged " + one.thing + " by, now side by side." : "The same two terms, now as a pair.");
  if (!two) return null;
  // 3 a reason: one of the two as the reason for the other
  const three = reasonStep(c, a, b, (s) => (s === one.thing ? cap(s) + " comes back as the subject. " : "") + "The same two terms: one is now the reason for the other.", one.thing);
  if (!three) return null;
  const steps = [one.step, two, three];
  // 4 the other way round: another pair with the same relation, named by the learner
  const relation = o.find ? givenRelation(rel) : null;
  if (relation) steps.push(step({ exercise: "find", relation }, [a, b], "The same relation, the other way round: you name a pair that has it."));
  return { kind: "pair", cats: [a, b], steps };
}

/**
 * A thread on one pair of categories: one example, the two terms, a reason (and with `find`, a pair of the learner's own). Null when the data
 * cannot make all three for the learner: a category it lacks or the learner has not met, a pair it does not judge, no syllogism it can settle.
 */
export function pairThread(ix: DataIndex, a: string, b: string, o: SessionOptions & PairThreadOptions): SessionThread | null {
  return pairThreadOf(context(ix, o), a, b, o);
}

// ---- a thread on one term: the same term from several sides, each time beside another partner ----

function termThreadOf(c: Ctx, id: string, max: number): SessionThread | null {
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
  const one = placeStep(c, shuffle(things(c, c.ix.DATA.items.filter((it) => it.c.includes(id)), id, id), c.rng).slice(0, 10), [id]);
  if (one) steps.push(one.step);
  // 2 a thing the learner names, together with a term that crosses it or holds it
  const cross = take(["4"]) ?? take(["3ab", "3ba"]);
  const two = cross && instanceStep(c, [id, cross.other], name + " again: this time you name the thing.");
  if (two) steps.push(two);
  // 3 beside what holds it or what it holds
  const up = take(["3ab", "3ba"]);
  const three = up && pairStep(c, "practice", id, up.other, name + " again, now as one of a pair.");
  if (three) steps.push(three);
  // 4 beside what it shuts out
  const out = take(["con"]);
  const four = out && pairStep(c, "debate", id, out.other, name + " again, beside another term, statement by statement.");
  if (four) steps.push(four);
  // 5 in a reason, with the first of the partners the data can make one for
  for (const p of [up, cross, out]) {
    const five = p && reasonStep(c, id, p.other, () => name + " again, now in a reason.");
    if (five) { steps.push(five); break; }
  }
  // a short thread keeps its ends: a thing first, a reason last
  const kept = steps.length > max ? [...steps.slice(0, max - 1), steps[steps.length - 1]] : steps;
  return kept.length >= 3 ? { kind: "term", cats: [id], steps: kept } : null;
}

/**
 * A thread on one course term, at most `steps` questions (default 5): a thing that is one, a thing the learner names, the term beside a wider or
 * narrower one, beside one it shuts out, and in a reason. Null when the data makes fewer than three of them for the learner.
 */
export function termThread(ix: DataIndex, id: string, o: SessionOptions & { steps?: number }): SessionThread | null {
  return termThreadOf(context(ix, o), id, o.steps ?? 5);
}

/** The course terms a term thread can be about, in the order to try them: the open ones (met, the last answer not right yet), then those of the highest stage, then the others; those to avoid last. */
function termOrder(c: Ctx, avoid?: ReadonlySet<string>): string[] {
  const top = topStage(c.on), unmet = c.given.words?.unmet, open = c.given.words?.open?.size ? termCats(c.given.words.open) : null;
  const ids = shuffle(Object.values(c.ix.CAT).filter((x) => x.kind === "dudra" && !!x.term && c.on.includes(catStage(x)) && !unmet?.has(x.id)).map((x) => x.id), c.rng);
  const rank = (id: string) => (avoid?.has(id) ? 3 : open?.has(id) ? 0 : catStage(c.ix.CAT[id]) === top ? 1 : 2);
  return ids.map((id, i) => ({ id, i })).sort((x, y) => rank(x.id) - rank(y.id) || x.i - y.i).map((x) => x.id);
}

// ---- the session ----

/**
 * A pair for a thread: none of the categories the plan has (`seen`), those to `avoid` and the relations it has (`rels`) only when nothing else is
 * left. A pair new at the highest stage half the time, then a relation, each as likely, then a pair, one with a course term most of the time.
 */
function drawPair(c: Ctx, seen: ReadonlySet<string>, failed: ReadonlySet<StagedEntry>, rels: ReadonlySet<PoolRel>, avoid?: ReadonlySet<string>): StagedEntry | null {
  const free = c.pairs.filter((e) => !seen.has(e.a) && !seen.has(e.b) && !failed.has(e));
  const fresh = free.filter((e) => !avoid?.has(e.a) && !avoid?.has(e.b)), all = fresh.length ? fresh : free;
  const other = all.filter((e) => !rels.has(e.r)), left = other.length ? other : all;
  if (!left.length) return null;
  const top = topStage(c.on), high = left.filter((e) => e.st === top), of = high.length && c.rng() < 0.5 ? high : left;
  const r = pick([...new Set(of.map((e) => e.r))], c.rng), ofRel = of.filter((e) => e.r === r);
  const course = ofRel.filter((e) => c.ix.CAT[e.a].kind === "dudra" || c.ix.CAT[e.b].kind === "dudra");
  return pick(course.length && c.rng() < 0.7 ? course : ofRel, c.rng);
}

/** How many pairs are tried for the threads of a plan before it is left shorter. */
const PAIR_TRIES = 200;

/**
 * The plan of a session: a short term thread first, where the learner has met a course term it can be about (an open one before the others),
 * then pair threads, each about other categories and, while the data has them, another relation; the example and the two terms of the pairs
 * come by turns from the two exercises that can ask them. Fewer threads than asked for, or none, when the data has no more for the learner.
 */
export function planSession(ix: DataIndex, o: SessionOptions): SessionPlan {
  const c = context(ix, o), n = Math.max(0, o.threads ?? SESSION_THREADS), threads: SessionThread[] = [], seen = new Set<string>();
  const add = (t: SessionThread) => { threads.push(t); for (const s of t.steps) for (const x of s.cats) seen.add(x); };
  if (n > 1) for (const id of termOrder(c, o.avoid)) {
    const t = termThreadOf(c, id, TERM_STEPS);
    if (t) { add(t); break; }
  }
  const failed = new Set<StagedEntry>(), rels = new Set<PoolRel>();
  for (let tries = 0, pairs = 0; tries < PAIR_TRIES && threads.length < n; tries++) {
    const e = drawPair(c, seen, failed, rels, o.avoid);
    if (!e) break;
    const t = pairThreadOf(c, e.a, e.b, pairs % 2 ? { first: "instance", two: "debate" } : { first: "categories", two: "practice" });
    if (t) { add(t); rels.add(e.r); pairs++; } else failed.add(e);
  }
  return { threads };
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

/** What a missed step comes back as: another exercise on the same categories, one the session has not asked of them (`asked`: step keys). */
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
    if (asked.has(WAY_EXERCISE[way] + "|" + [...cats].sort().join("|"))) continue;
    const s = make[way]();
    if (s) return { ...s, again: true };
  }
  // one term alone, and the data asks nothing more of it by itself: beside one of its partners
  if (!b) for (const e of shuffle(c.pairs.filter((p) => p.a === a || p.b === a), c.rng).slice(0, 6)) {
    const s = pairStep(c, "practice", e.a, e.b, lead + ", now as one of a pair.");
    if (s && !asked.has(stepKey(s))) return { ...s, again: true };
  }
  return null;
}

/**
 * The steps that come back at the end of a session for the ones that were missed (`missed`: their step keys), in the order of the plan: each as
 * another exercise on the same categories, and none a question the session has had or another miss has brought back. A miss the data has
 * nothing more for brings nothing.
 */
export function comeBacks(ix: DataIndex, plan: SessionPlan, missed: ReadonlySet<string>, o: SessionOptions): SessionStep[] {
  const c = context(ix, o), all = plan.threads.flatMap((t) => t.steps), asked = new Set(all.map(stepKey)), out: SessionStep[] = [];
  for (const s of all) {
    if (!missed.has(stepKey(s))) continue;
    const back = comeBack(c, s, asked);
    if (back) { out.push(back); asked.add(stepKey(back)); }
  }
  return out;
}
