// The pair-finding mode: the usual exercise the other way round. The learner is given a relation and names the two phenomena that stand in it,
// then gives an example for each combination the relation leaves possible, as in the usual exercise. When both phenomena are categories of the
// practice data (and the data can judge the pair) the answer is graded exactly like the usual exercise's, with the relation asked for taken as
// the relation "chosen". Otherwise the page can settle nothing itself: the pair is the learner's own (`own`), and the relation and the examples
// wait for the tutor (see `applyRelationVerdict` in verdict.ts).
import { categoryOf, spelled, stemmed, stripDet } from "../ai-shared/lookup";
import type { DataIndex } from "../ai-shared/lookup";
import { pluralOf } from "../ai-shared/mentions";
import { CELLS, REL } from "../ai-shared/relations";
import type { CellId, RelKey } from "../ai-shared/relations";
import { grade, summarize } from "./grading";
import type { CellResult, GradeResult, Pair, PracticeAnswer } from "./types";
import { judgeable, pairOf } from "./universe";
import type { Clock, Rng, Witnesses } from "./universe";
import type { Stages } from "./stages";

/** The relations that can be asked for: the five of the course (three possibilities in both directions, since A is the one inside B in one and B inside A in the other). */
export const FIND_RELS: readonly RelKey[] = ["mi", "3ab", "3ba", "4", "con"];

// three possibilities is asked for less often per direction, so that it comes up as often as each of the others; four possibilities without
// neither, the case of the negation track, is never asked for
const WEIGHT: Record<RelKey, number> = { mi: 1, con: 1, "3ab": 0.65, "3ba": 0.65, "4": 1, "4n": 0 };

/**
 * The relation to ask for next. `asked` are the relations asked lately, oldest first; the six last ones count less each time they were asked,
 * so the stream stays mixed. `not` is a relation to leave out (the one the learner just turned down).
 */
export function drawRelation(asked: readonly (RelKey | null | undefined)[], rng: Rng = Math.random, not?: RelKey | null): RelKey {
  const w: Record<RelKey, number> = { ...WEIGHT };
  for (const r of asked.slice(-6)) if (r && Object.hasOwn(w, r)) w[r] = Math.max(0.15, w[r] * 0.45);
  const keys = FIND_RELS.filter((k) => k !== not);
  let x = rng() * keys.reduce((s, k) => s + w[k], 0);
  for (const k of keys) { if ((x -= w[k]) <= 0) return k; }
  return keys[keys.length - 1];
}

/** A phenomenon the learner named: the words as the page shows them, and the practice category they are, when they are one. */
export interface Named {
  label: string;
  cat: string | null;
}

/**
 * What the learner's words name. Words that are a label of a practice category (singular or plural, with or without an article) or its Dudra
 * term become that category, shown under the label they matched; anything else is kept as typed.
 */
export function nameThing(ix: DataIndex, text: string): Named {
  const typed = String(text || "").trim().replace(/\s+/g, " ").replace(/[.,;:!?]+$/, "").trim();
  const cat = categoryOf(ix, typed);
  if (!cat) return { label: typed, cat: null };
  const k = stripDet(spelled(typed)), want = new Set([k, pluralOf(k), k.replace(/ies$/, "y"), k.replace(/(?:es|s)$/, "")]);
  const labels = ix.CAT[cat].labels;
  return { label: labels.find((l) => want.has(spelled(l))) ?? labels.find((l) => stemmed(spelled(l)) === stemmed(k)) ?? labels[0], cat };
}

/** Whether two named phenomena are the same one (the same words, or the same label of a category). */
export const sameThing = (x: Named, y: Named): boolean => !!spelled(x.label) && spelled(x.label) === spelled(y.label);

/** A new id for a pair of this mode: it is the id of the answer kept for it, so every attempt (also one at a pair opened again from the skipped ones) has its own. */
export const findId = (rng: Rng = Math.random, now: Clock = Date.now): string => "f-" + now().toString(36) + rng().toString(36).slice(2, 6);

/**
 * The pair the learner named, for the relation asked for. A pair of practice categories the data can judge is made as the draw makes its pairs
 * (the relation it really has, an example for each cell that has one, of the stages `on` where the cell has one, the reason for each that has none),
 * under the learner's labels. Any other pair is the learner's own: it carries the relation asked for only as a placeholder (`own`), and nothing else is known about it.
 */
export function findPair(ix: DataIndex, asked: RelKey, a: Named, b: Named, rng: Rng = Math.random, now: Clock = Date.now, more?: Witnesses, on?: Stages): Pair {
  if (sameThing(a, b)) throw new RangeError("a pair needs two different phenomena");
  if (a.cat && b.cat && (a.cat === b.cat || judgeable(ix, a.cat, b.cat))) {
    const p = pairOf(ix, a.cat, b.cat, a.label, b.label, rng, now, more, on);
    p.id = "f-" + p.id.slice(2);
    delete p.generated;
    return p;
  }
  return {
    id: findId(rng, now), a: a.label, b: b.label, catA: a.cat, catB: b.cat,
    typeA: "", typeB: "", relation: asked, ex: {}, why: {}, own: true,
  };
}

/**
 * Checks an answer: `u.rel` is the relation asked for, `u.cells` the examples. A pair the data knows is graded as in the usual exercise. For the
 * learner's own pair nothing can be settled here: the relation is open, an example is "cmp" (not checked), a cell the relation leaves empty is "open",
 * and a cell it leaves possible with no example is missing. The tutor's verdicts settle the rest.
 */
export function gradeFind(ix: DataIndex, p: Pair, u: PracticeAnswer): GradeResult {
  if (!u.rel) throw new Error("gradeFind: no relation was asked for");
  if (!p.own) return grade(ix, p, u);
  const empty = REL[u.rel].empty, cells = {} as Record<CellId, CellResult>;
  for (const c of CELLS) {
    const none = empty.includes(c) || !!u.cells[c].none, t = (u.cells[c].t || "").trim();
    cells[c] = none ? { v: "open", msg: ["Empty by the relation. ", "Claude checks that nothing goes here."], kind: "occ" }
      : t ? { v: "cmp", msg: ["Not checked. ", ""], kind: "ex" }
      : { v: "bad", msg: ["Missing. ", "The relation leaves this cell possible: give an example, or change the pair."], kind: "occ" };
  }
  return summarize({ relOk: false, relOpen: true, cells });
}
