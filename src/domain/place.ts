// "Place a thing": a reference example is shown and the learner says which of a few Dudra categories it is in. The rows of a
// question are categories the data settles for the example (`placeByClass`: yes up the "is a" chain, no by an exclusion, a class
// the sources say it is not, or because it does not exist), each with the steps that show why (`rung`), so that grading is complete:
// every category offered has an answer, and none is a guess. Pure functions of the data and of a random source, like the pair draw.
import type { Cat } from "../ai-shared/data";
import { normLevels } from "../ai-shared/examples";
import type { Example, Levels } from "../ai-shared/examples";
import { upChain } from "../ai-shared/lookup";
import type { DataIndex } from "../ai-shared/lookup";
import { catChain, rung, termPhrase } from "./ladder";
import { cellExample, placeByClass } from "./reference";

/** One category offered for a thing, with its answer and the reason. */
export interface PlaceRow {
  /** the category's id */
  cat: string;
  /** its Dudra term */
  term: string;
  /** the term as a sentence says it: "an external form" */
  phrase: string;
  /** whether the thing is in the category */
  answer: boolean;
  /** why, after "because": "it is a color, which is a visible form" */
  reason: string;
  /** a second sentence when the reason needs one (the exclusion that makes a "no"); "" when none */
  why: string;
}

export interface PlaceQuestion {
  thing: Example;
  rows: PlaceRow[];
}

export interface PlaceDraw {
  /** the levels of thing to draw from (the learner's switches); each level that has things is drawn as often as the others */
  levels: Levels;
  rng: () => number;
  /** names drawn lately, passed over while others remain */
  avoid?: ReadonlySet<string>;
  /** rows to offer (default 6): one to three "yes", the rest "no" */
  size?: number;
}

/** The correct answers at the highest level that is on after which the next level is offered (never taken without a tap). */
export const PLACE_NEED = 10;

const MAX_LEVEL = 4;

/** Why the example is, or is not, in the category: the steps of the data, else what the sources say about the example itself. */
function explain(ix: DataIndex, ex: Example, cat: Cat, answer: boolean): { reason: string; why: string } {
  const term = cat.term!, subject = termPhrase(term);
  for (const cls of ex.cls ?? []) {
    const r = Object.hasOwn(ix.DATA.terms, cls) ? rung(ix, cls, cat, subject, "") : null;
    if (r && (r.answer === "yes") === answer) return { reason: r.reason, why: r.why };
  }
  if (answer) return { reason: ex.cls?.includes(term) ? "it is " + termPhrase(term) : "", why: "" };
  if (ex.ne) return { reason: "it does not exist", why: `Nothing that does not exist is ${termPhrase(term)}.` };
  const said = (ex.not ?? []).find((n) => catChain(ix, cat).includes(n));
  if (said) return { reason: "the sources say it is not " + termPhrase(said), why: "" };
  return { reason: "", why: "" };
}

/** Every Dudra category the data settles for the example, with the answer and its reason; none for one it cannot tell. */
export function placeRows(ix: DataIndex, ex: Example): PlaceRow[] {
  const rows: PlaceRow[] = [];
  for (const cat of Object.values(ix.CAT)) {
    if (cat.kind !== "dudra" || !cat.term) continue;
    const p = placeByClass(ix, ex, cat);
    if (!p) continue;
    const answer = p === "yes";
    rows.push({ cat: cat.id, term: cat.term, phrase: termPhrase(cat.term), answer, ...explain(ix, ex, cat, answer) });
  }
  return rows;
}

/** How low in the "is a" chain a term sits: the nearer to the example's own class, the narrower the category. */
const depthOf = (ix: DataIndex, term: string) => upChain(ix, term).length;
/** The family of a category: the term just below Functional thing (Form, Consciousness, Person, ...), or its own term. */
const familyOf = (ix: DataIndex, cat: string) => {
  const c = ix.CAT[cat], chain = c ? catChain(ix, c) : [];
  return chain[Math.max(0, chain.length - 3)] ?? "";
};

function shuffle<T>(xs: readonly T[], rng: () => number): T[] {
  const out = [...xs];
  for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
  return out;
}

/**
 * The rows of a question for the thing: the narrowest "yes" and up to two more, and "no" rows half from the family of the narrowest
 * "yes" (the hard ones: a color is not a shape) and half from the others. Null when the data settles too little to ask: nothing to
 * pick for a thing that is in no category, or nothing to refuse.
 */
export function placeQuestionRows(ix: DataIndex, ex: Example, rng: () => number, size = 6): PlaceRow[] | null {
  const all = placeRows(ix, ex);
  const yes = all.filter((r) => r.answer).sort((a, b) => depthOf(ix, b.term) - depthOf(ix, a.term) || a.cat.localeCompare(b.cat));
  const no = all.filter((r) => !r.answer);
  if ((!yes.length && !ex.ne) || no.length < 2) return null;
  const nYes = Math.min(yes.length, 1 + Math.floor(rng() * 3), size - 2);
  const picked = yes.length ? [yes[0], ...shuffle(yes.slice(1), rng).slice(0, nYes - 1)] : [];
  const fam = yes.length ? familyOf(ix, yes[0].cat) : "";
  const near = shuffle(no.filter((r) => familyOf(ix, r.cat) === fam), rng);
  const far = shuffle(no.filter((r) => familyOf(ix, r.cat) !== fam), rng);
  const nNo = Math.min(no.length, size - picked.length);
  const first = Math.min(near.length, Math.ceil(nNo / 2));
  const chosen = [...near.slice(0, first), ...far.slice(0, nNo - first)];
  for (const r of near.slice(first)) if (chosen.length < nNo) chosen.push(r);
  return shuffle([...picked, ...chosen], rng);
}

/**
 * The next thing to place: a reference example `cellExample` allows at the level, for which the data settles enough categories
 * (`placeQuestionRows`). A level is drawn first, each level that still has things as likely as the others, then a thing of it; names
 * in `avoid` wait while others remain. Levels outside 1 to 4 count for nothing, and none left means the default levels. Null when nothing
 * qualifies (a device with no examples, or none at those levels).
 */
export function drawPlace(ix: DataIndex, items: readonly Example[], draw: PlaceDraw): PlaceQuestion | null {
  const levels = normLevels(draw.levels);
  const usable = items.filter((ex) => cellExample(ex, levels) && ex.cls?.length);
  const fresh = usable.filter((ex) => !draw.avoid?.has(ex.n));
  for (const pool of fresh.length ? [fresh, usable] : [usable]) {
    let left = pool;
    while (left.length) {
      const have = levels.filter((l) => left.some((ex) => ex.lv === l));
      const level = have[Math.floor(draw.rng() * have.length)];
      const of = left.filter((ex) => ex.lv === level);
      const thing = of[Math.floor(draw.rng() * of.length)];
      const rows = placeQuestionRows(ix, thing, draw.rng, draw.size);
      if (rows) return { thing, rows };
      left = left.filter((ex) => ex !== thing);
    }
  }
  return null;
}

export interface PlaceGraded extends PlaceRow {
  picked: boolean;
  ok: boolean;
}

export interface PlaceResult {
  rows: PlaceGraded[];
  /** how many rows are right */
  right: number;
  /** every row is right */
  ok: boolean;
}

/** Grades the categories the learner ticked (ids) against the rows: a row is right when ticked exactly if the thing is in the category. */
export function gradePlace(q: PlaceQuestion, picked: readonly string[]): PlaceResult {
  const ticked = new Set(picked);
  const rows = q.rows.map((r) => ({ ...r, picked: ticked.has(r.cat), ok: ticked.has(r.cat) === r.answer }));
  const right = rows.filter((r) => r.ok).length;
  return { rows, right, ok: right === rows.length };
}

/**
 * The level to offer adding: the one above the highest level that is on, once `need` of the results at that highest level are right;
 * null before that, and at the top level. The offer adds the level and switches nothing off.
 */
export function placeLevelUp(results: readonly { lv: number; ok: boolean }[], levels: Levels, need = PLACE_NEED): number | null {
  const top = Math.max(...normLevels(levels));
  return top < MAX_LEVEL && results.filter((r) => r.lv === top && r.ok).length >= need ? top + 1 : null;
}
