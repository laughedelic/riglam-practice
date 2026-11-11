// A question that is given, not drawn. The terms come from outside the draw (a task from a class, a planned run of mixed practice), and each
// exercise's question is made from them the way its own draw makes it, so the page shows and grades it like any other. One function per exercise,
// each returning what that exercise's flow keeps: a Pair for Relations and Pervasions, a Syllogism, a PlaceQuestion for Categories, an
// InstanceQuestion for Find an instance, and for Find a pair the relation asked for. Each returns null when the data cannot make the question: a
// category or a thing it does not have, a pair it does not judge, a syllogism it cannot settle, a set its own draw would not ask.
//
// With `stages`, a question is also limited to what a learner at those stages is asked: its categories open at the highest of them, its things
// known there, its examples and reasons those of the stages. With `words`, a category whose term the learner has not met makes no question, and a
// named term's word waits for its stop (intro.ts, wordsFor). Without them everything the data has can be asked, in the words of the last stage.
// Pure functions of the data and of a random source, like the draws: the same data and the same random numbers give the same question.
import type { Item } from "../ai-shared/data";
import type { Example } from "../ai-shared/examples";
import { matchItem, spelled, stripDet } from "../ai-shared/lookup";
import type { DataIndex } from "../ai-shared/lookup";
import { negSides } from "../ai-shared/relations";
import type { Neg, RelKey } from "../ai-shared/relations";
import { FIND_RELS } from "./find";
import { askedFrom, instanceQuestion } from "./instance";
import type { InstanceQuestion } from "./instance";
import { wordsFor } from "./intro";
import { nearShare, placeQuestionRows, plainRows, thingRows } from "./place";
import type { PlaceQuestion, PlaceRow, PlaceThing } from "./place";
import { cellExample, exampleStage } from "./reference";
import { STAGES, catStage, itemKnown, itemStage, pairStage, topStage } from "./stages";
import type { Stages } from "./stages";
import { syllogismOf } from "./syllogism";
import type { Syllogism } from "./syllogism";
import type { Pair } from "./types";
import { judgeable, pairOf } from "./universe";
import type { Clock, PairWords, Rng, Witnesses } from "./universe";
import { pick } from "./util";

/** What the making of a given question may be told, the same for every exercise. */
export interface GivenOptions {
  /** the learner's stages: the question is limited to them (see the note above); none: whatever the data has */
  stages?: Stages;
  /** the learner's terms (intro.ts): a category in `unmet` makes no question, a named term's word waits or leans as in a draw */
  words?: PairWords;
  rng?: Rng;
  /** the clock for a pair's id */
  now?: Clock;
  /** more references for the cells of a pair than the practice list has (reference.ts, witnessesOf) */
  more?: Witnesses;
  /** how a negated name of more than one word is written, as in a draw; default: with brackets */
  brackets?: boolean;
}

/** Every stage on: a question made without stages is worded as at the last one. */
const ALL: Stages = STAGES.map((s) => s.n);

/** Whether a question may ask the category: the data has it, it opens at or below the highest stage, and its term has been met. */
function asked(ix: DataIndex, cat: string, o: GivenOptions): boolean {
  const c = ix.CAT[cat];
  return !!c && (!o.stages || catStage(c) <= topStage(o.stages)) && !o.words?.unmet?.has(cat);
}

/** The labels a side of a pair may be shown under: a negated side under one that is no negation already where there is one, none a named term's before its stop. */
function labelsOf(ix: DataIndex, cat: string, negated: boolean, words?: PairWords, lean = true): readonly string[] {
  const all = ix.CAT[cat].labels, plain = all.filter((l) => !l.startsWith("non-"));
  return wordsFor(ix, cat, negated && plain.length ? plain : all, words?.unmet, lean ? words?.open : undefined);
}

/** What a given pair may add to the options: the labels to show the two sides under, and a negated side. */
export interface GivenPairOptions extends GivenOptions {
  /** the label of each side, when the task says the words ("colors", not "hues"): each must be a label of its category; one left out is drawn */
  labels?: readonly [(string | null | undefined)?, (string | null | undefined)?];
  /** the side or sides to negate */
  neg?: Neg;
}

/**
 * The pair for Relations and Pervasions: these two categories in this order (A first), as `pairOf` makes a drawn pair. The same category twice
 * is the pair of two of its own labels, where it is a course category with two. Null for a category the data lacks, a pair it does not judge, a
 * label the category does not have; with `stages`, also for a pair a learner at them does not meet yet (`pairStage`: a category not open, or a
 * cell whose things come later). The random numbers are drawn in a fixed order: the label of A, of B (where not given), then the pair's.
 */
export function givenPair(ix: DataIndex, a: string, b: string, o: GivenPairOptions = {}): Pair | null {
  if (!asked(ix, a, o) || !asked(ix, b, o)) return null;
  if (a === b ? ix.CAT[a].kind === "everyday" : !judgeable(ix, a, b)) return null;
  if (o.stages && pairStage(ix, a, b, o.stages) === null) return null;
  const rng = o.rng ?? Math.random, [na, nb] = negSides({ neg: o.neg }), [wa, wb] = o.labels ?? [];
  if ((wa && !ix.CAT[a].labels.includes(wa)) || (wb && !ix.CAT[b].labels.includes(wb))) return null;
  let la: string, lb: string;
  if (a === b) {
    // two different labels of the one category, every one the learner has met: the open term's is not preferred, since both sides are said
    const ls = labelsOf(ix, a, na || nb, o.words, false);
    la = wa || pick(ls.filter((l) => l !== wb), rng);
    const rest = ls.filter((l) => l !== la);
    if (!la || (!wb && !rest.length) || wb === la) return null;
    lb = wb || pick(rest, rng);
  } else {
    la = wa || pick(labelsOf(ix, a, na, o.words), rng);
    lb = wb || pick(labelsOf(ix, b, nb, o.words), rng);
  }
  return pairOf(ix, a, b, la, lb, rng, o.now ?? Date.now, o.more, o.stages, o.neg, o.brackets ?? true);
}

/** The relation Find a pair asks for, or null when it is not one of the five. */
export const givenRelation = (rel: string | null | undefined): RelKey | null => (FIND_RELS.find((r) => r === rel) ?? null);

/** The practice item of this name (with or without its article; an alias does not count) that can be shown as the thing asked about, or null. */
function itemNamed(ix: DataIndex, name: string): Item | null {
  const it = matchItem(ix, name, true);
  return it && !it.nosubject ? it : null;
}

/**
 * The syllogism of this subject (a practice item's name), reason and predicate (category ids), as `syllogismOf` settles it. Null when the data
 * has no such thing or category, or cannot settle the three checks; with `stages`, also when the reason or the predicate is not open at them or
 * the learner does not know the subject there (a person or what does not exist with a physical category only from the hold's stage).
 */
export function givenSyllogism(ix: DataIndex, subject: string, reason: string, predicate: string, o: GivenOptions = {}): Syllogism | null {
  const item = itemNamed(ix, subject);
  if (!item || !asked(ix, reason, o) || !asked(ix, predicate, o)) return null;
  if (o.stages && !itemKnown(ix, item, reason, predicate, o.stages)) return null;
  return syllogismOf(ix, item.n, reason, predicate, o.rng ?? Math.random, o.words);
}

/** What a given thing of Categories may add to the options. */
export interface GivenPlaceOptions extends GivenOptions {
  /** the reference examples the device holds: a thing the practice list does not have may be one of them */
  examples?: readonly Example[] | null;
  /** how many categories to offer (default 6); the given ones are all offered, however many */
  size?: number;
  /** offer the given categories and no others, in the order given */
  only?: boolean;
}

const nameKey = (n: string) => stripDet(spelled(n));

/** The thing of this name: a practice item, else a reference example the learner can be shown (with classes; confirmed, a kind a cell takes). */
function thingNamed(ix: DataIndex, name: string, o: GivenPlaceOptions): PlaceThing | null {
  const it = itemNamed(ix, name);
  if (it) return { n: it.n, st: itemStage(it), ...(it.ne ? { ne: true } : {}), item: it };
  // a name the practice list has, said in the second person there, is not asked about as the reference example of that name either
  if (matchItem(ix, name, true)) return null;
  const k = nameKey(name), ex = k ? (o.examples ?? []).find((e) => nameKey(e.n) === k && !!e.cls?.length && cellExample(e, o.stages ? ALL.filter((s) => s <= topStage(o.stages!)) : ALL)) : undefined;
  return ex ? { n: ex.n, st: exampleStage(ex), ...(ex.ne ? { ne: true } : {}), ...(ex.cf ? { cf: ex.cf } : {}), ex } : null;
}

/**
 * The question of Categories for this thing (a practice item's name, or a reference example's where `examples` has it), with every one of the
 * given categories among the rows. The other rows are drawn as the exercise draws them (`placeQuestionRows`: the narrowest "yes", near misses),
 * and a given category takes the place of a drawn row with the same answer where there is one, so the mix of "yes" and "no" stays; with `only`
 * the rows are the given ones alone. Null for a thing the data lacks, a given category the data does not settle for it (its name leaves it open,
 * or it is not asked about such a thing), and when there are fewer than two rows; with `stages`, also for a thing of a later stage or a given
 * category not open at them.
 */
export function givenPlace(ix: DataIndex, thing: string, cats: readonly string[] = [], o: GivenPlaceOptions = {}): PlaceQuestion | null {
  const t = thingNamed(ix, thing, o), on = o.stages ?? ALL, top = topStage(on);
  if (!t || t.st > top) return null;
  const all = thingRows(ix, t, on, o.words?.unmet), given: PlaceRow[] = [];
  for (const c of new Set(cats)) {
    const row = all.find((r) => r.cat === c);
    if (!row) return null;
    given.push(row);
  }
  if (o.only) return given.length >= 2 ? { thing: t, rows: given } : null;
  const rng = o.rng ?? Math.random, size = o.size ?? 6;
  const rows = placeQuestionRows(ix, t, rng, size, all, nearShare(top), plainRows(top, size)) ?? [];
  const fixed = new Set(given.map((r) => r.cat));
  for (const g of given) {
    if (rows.some((r) => r.cat === g.cat)) continue;
    // the place of a drawn row with the same answer, else of any drawn row; with none left to give way, one more row
    const free = rows.flatMap((r, i) => (fixed.has(r.cat) ? [] : [i])), same = free.filter((i) => rows[i].answer === g.answer), at = (same.length ? same : free)[0];
    if (at === undefined) rows.push(g); else rows[at] = g;
  }
  return rows.length >= 2 ? { thing: t, rows } : null;
}

/**
 * The question of Find an instance for these categories (one to three, ids), each under a label as a draw gives it. Only a set the exercise's own
 * draw asks (`askedFrom`): something is in all of them, or the data can say why nothing is. Null otherwise, for a category twice, and for a
 * category the learner has not met; with `stages`, also for a set asked only from a later stage.
 */
export function givenInstance(ix: DataIndex, cats: readonly string[], o: GivenOptions = {}): InstanceQuestion | null {
  if (!cats.length || cats.length > 3 || new Set(cats).size !== cats.length || !cats.every((c) => asked(ix, c, o))) return null;
  const from = askedFrom(ix, cats);
  if (from === null || (o.stages && from > topStage(o.stages))) return null;
  const q = instanceQuestion(ix, cats, o.rng ?? Math.random, o.stages, o.words);
  return q.possible || q.apart ? q : null;
}

/**
 * A given question as it is written down (in a task, in a plan): the exercise and the terms, as the data names them. `practice` is Relations,
 * `debate` Pervasions, as the page calls its exercises.
 */
export type Given =
  | { exercise: "practice" | "debate"; a: string; b: string; labels?: readonly [(string | null)?, (string | null)?]; neg?: Neg }
  | { exercise: "find"; relation: RelKey }
  | { exercise: "syllogism"; subject: string; reason: string; predicate: string }
  | { exercise: "categories"; thing: string; cats?: readonly string[]; only?: boolean; size?: number }
  | { exercise: "instance"; cats: readonly string[] };

/** A given question made: the exercise, and what its flow keeps. */
export type GivenQuestion =
  | { exercise: "practice" | "debate"; pair: Pair }
  | { exercise: "find"; relation: RelKey }
  | { exercise: "syllogism"; syllogism: Syllogism }
  | { exercise: "categories"; place: PlaceQuestion }
  | { exercise: "instance"; instance: InstanceQuestion };

/** Makes the question a `Given` writes down, by its exercise's function above; null when the data cannot make it. */
export function givenQuestion(ix: DataIndex, g: Given, o: GivenOptions & Pick<GivenPlaceOptions, "examples"> = {}): GivenQuestion | null {
  switch (g.exercise) {
    case "practice": case "debate": {
      const pair = givenPair(ix, g.a, g.b, { ...o, labels: g.labels, neg: g.neg });
      return pair && { exercise: g.exercise, pair };
    }
    case "find": {
      const relation = givenRelation(g.relation);
      return relation && { exercise: "find", relation };
    }
    case "syllogism": {
      const syllogism = givenSyllogism(ix, g.subject, g.reason, g.predicate, o);
      return syllogism && { exercise: "syllogism", syllogism };
    }
    case "categories": {
      const place = givenPlace(ix, g.thing, g.cats, { ...o, only: g.only, size: g.size });
      return place && { exercise: "categories", place };
    }
    case "instance": {
      const instance = givenInstance(ix, g.cats, o);
      return instance && { exercise: "instance", instance };
    }
    default: return null;
  }
}
