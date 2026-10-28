// "Place a thing" (the Categories exercise): a thing is shown and the learner says which of a few categories it is in. The thing is a
// practice item or a reference example of a stage that is on, and the rows are categories open at the learner's stage that the data
// settles for it: for a practice item its own list (with the everyday categories, but none its name leaves open), for a reference
// example `placeByClass` (yes up the "is a" chain, no by an exclusion, a class the sources say it is not, or because it does not exist).
// Each row has the steps that show why (`rung`) where the data has them, so grading is complete: every category offered has an answer,
// and none is a guess. Pure functions of the data and of a random source, like the pair draw.
import type { Cat, Item } from "../ai-shared/data";
import type { Example } from "../ai-shared/examples";
import { leavesOpen, spelled, stripDet, upChain } from "../ai-shared/lookup";
import type { DataIndex } from "../ai-shared/lookup";
import { catChain, rung, termPhrase } from "./ladder";
import { cellExample, exampleStage, placeByClass } from "./reference";
import { HOLD_STAGE, catOpen, heldBack, itemStage, normStages, physical, topStage } from "./stages";
import type { Stages, Unmet } from "./stages";

/** One category offered for a thing, with its answer and the reason. */
export interface PlaceRow {
  /** the category's id */
  cat: string;
  /** its Dudra term; "" for an everyday category */
  term: string;
  /** the category as a sentence says it: "an external form", "furniture" */
  phrase: string;
  /** whether the thing is in the category */
  answer: boolean;
  /** why, after "because": "it is a color, which is a visible form" */
  reason: string;
  /** a second sentence when the reason needs one (the exclusion that makes a "no"); "" when none */
  why: string;
}

/** A thing to place: a practice item (`item`) or a reference example (`ex`), with its name and stage. */
export interface PlaceThing {
  n: string;
  st: number;
  ne?: boolean;
  /** a reference example's confirmation (confirmed, textbook) */
  cf?: string;
  item?: Item;
  ex?: Example;
}

export interface PlaceQuestion {
  thing: PlaceThing;
  rows: PlaceRow[];
}

export interface PlaceDraw {
  /** the stages to draw things from (the learner's switches); each stage that has things is drawn as often as the others */
  stages: Stages;
  rng: () => number;
  /** names drawn lately, passed over while others remain */
  avoid?: ReadonlySet<string>;
  /** rows to offer (default 6): one to three "yes", the rest "no" */
  size?: number;
  /** the Dudra categories whose term the learner has not met yet (intro.ts): not asked about */
  unmet?: Unmet;
  /** the share of things from the highest stage on, when lower ones have things too (stages.ts, newShare); none: every stage as often as the others */
  newShare?: number;
  /** the terms met whose last answer is not right yet, at any stage (intro.ts, openTerms): the highest stage's questions ask about one of them while one can be asked */
  open?: ReadonlySet<string>;
}

/** A category as a sentence says it: a Dudra term with its article, an everyday category by its phrase ("furniture", "made of wood"). */
const catPhrase = (cat: Cat): string => (cat.term ? termPhrase(cat.term) : cat.phrases?.[0] ?? cat.labels[0]);

/** Why the example is, or is not, in the category: the steps of the data, else what the sources say about the example itself. */
function explain(ix: DataIndex, ex: Pick<Example, "cls" | "not" | "ne">, cat: Cat, answer: boolean): { reason: string; why: string } {
  if (!cat.term) return { reason: "", why: "" };
  const term = cat.term, subject = termPhrase(term);
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

/** Every Dudra category the data settles for the example, with the answer and its reason; none for one it cannot tell. Only categories open at `on`, when given. */
export function placeRows(ix: DataIndex, ex: Example, on?: Stages, unmet?: Unmet): PlaceRow[] {
  const rows: PlaceRow[] = [];
  for (const cat of Object.values(ix.CAT)) {
    if (cat.kind !== "dudra" || !cat.term || (on && !catOpen(cat, on, unmet))) continue;
    const p = placeByClass(ix, ex, cat);
    if (!p) continue;
    const answer = p === "yes";
    rows.push({ cat: cat.id, term: cat.term, phrase: termPhrase(cat.term), answer, ...explain(ix, ex, cat, answer) });
  }
  return rows;
}

/**
 * Every category open at `on` that the practice list settles for its item, Dudra and everyday: the list's own categories say yes and no.
 * Left out: a category its name leaves open ("a chair" and wooden things), the sense objects for a whole thing and the body's for a body
 * (as in the pairs), and the physical categories for a person or what does not exist until the hold's stage is reached.
 */
export function itemRows(ix: DataIndex, it: Item, on: Stages, unmet?: Unmet): PlaceRow[] {
  const rows: PlaceRow[] = [], held = heldBack(ix, it) && topStage(on) < HOLD_STAGE, plain = plainWords(ix, it, on, unmet);
  const mind = upChain(ix, it.t).includes("Consciousness"), body = upChain(ix, it.t).includes("Form");
  for (const cat of Object.values(ix.CAT)) {
    if (!catOpen(cat, on, unmet) || leavesOpen(it, cat.id) || (cat.sense && it.comp) || (it.body && ix.DATA.bodySkip.includes(cat.id))) continue;
    if (held && physical(ix, cat)) continue;
    const answer = it.c.includes(cat.id), phys = physical(ix, cat);
    let why = plain ? { reason: "", why: "" } : explain(ix, { cls: [it.t], ne: it.ne }, cat, answer);
    // in everyday words, or where the steps of the data say nothing (an everyday category): Form is "anything physical", and the list's own word is the reason
    if (!why.reason) {
      const reason = cat.term === "Form" ? (answer ? "it is physical" : mind ? "it is a mind, not something physical" : "it is not physical")
        : answer ? "it is " + catPhrase(cat) : phys && mind ? "it is a mind, not something physical" : phys && !body ? "it is not physical" : "it is not " + catPhrase(cat);
      why = { reason, why: "" };
    }
    rows.push({ cat: cat.id, term: cat.term ?? "", phrase: catPhrase(cat), answer, ...why });
  }
  return rows;
}

/**
 * Whether the reasons for the item are said in everyday words: at stage 1, where Form is "anything physical", and while the category of the
 * item's own kind is not open (a joy is a consciousness from the established bases on; before that it is a mind).
 */
function plainWords(ix: DataIndex, it: Item, on: Stages, unmet?: Unmet): boolean {
  if (topStage(on) < 2) return true;
  const cats = Object.values(ix.CAT);
  for (const term of upChain(ix, it.t)) {
    const own = cats.find((c) => c.term === term);
    if (own) return !catOpen(own, on, unmet);
  }
  return false;
}

/** How low in the "is a" chain a term sits: the nearer to the example's own class, the narrower the category (an everyday one, with no term, counts as none). */
const depthOf = (ix: DataIndex, term: string) => (term ? upChain(ix, term).length : 0);
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
 * The rows of a question for the thing: the narrowest "yes" and up to two more, and "no" rows, `near` of them (half by default) from the
 * family of the narrowest "yes" (the hard ones: a color is not a shape) and the rest from the others. At most `plain` of the rows are everyday
 * categories (none beyond them while other rows serve). Null when the data settles too little to ask: nothing to pick for a thing that is in no
 * category, or nothing to refuse. `all` are the rows to choose from (`placeRows` by default).
 */
export function placeQuestionRows(ix: DataIndex, ex: Pick<Example, "ne"> & Partial<Example>, rng: () => number, size = 6, all: PlaceRow[] = placeRows(ix, ex as Example), near = 0.5, plain = size): PlaceRow[] | null {
  const yes = all.filter((r) => r.answer).sort((a, b) => depthOf(ix, b.term) - depthOf(ix, a.term) || a.cat.localeCompare(b.cat));
  const no = all.filter((r) => !r.answer);
  if ((!yes.length && !ex.ne) || no.length < 2) return null;
  const nYes = Math.min(yes.length, 1 + Math.floor(rng() * 3), size - 2);
  const picked = yes.length ? [yes[0], ...shuffle(yes.slice(1), rng).slice(0, nYes - 1)] : [];
  const fam = yes.length ? familyOf(ix, yes[0].cat) : "";
  const close = shuffle(no.filter((r) => familyOf(ix, r.cat) === fam), rng);
  const far = shuffle(no.filter((r) => familyOf(ix, r.cat) !== fam), rng);
  const nNo = Math.min(no.length, size - picked.length);
  const first = Math.min(close.length, Math.ceil(nNo * near));
  let room = plain - picked.filter((r) => !r.term).length;
  const chosen: PlaceRow[] = [], over: PlaceRow[] = [];
  for (const r of [...close.slice(0, first), ...far.slice(0, nNo - first), ...close.slice(first), ...far.slice(nNo - first)]) {
    if (chosen.length >= nNo) break;
    if (r.term || room-- > 0) chosen.push(r); else over.push(r);
  }
  for (const r of over) if (chosen.length < nNo) chosen.push(r);
  return shuffle([...picked, ...chosen], rng);
}

/** The rows with one "no" row, not on an open term, replaced by a "no" row on an open term from `all`; as they are when either is missing. */
function withOpenRow(rows: readonly PlaceRow[], all: readonly PlaceRow[], open: ReadonlySet<string>, rng: () => number): PlaceRow[] {
  const add = all.filter((r) => !r.answer && open.has(r.cat)), out = rows.flatMap((r, i) => (!r.answer && !open.has(r.cat) ? [i] : []));
  if (!add.length || !out.length) return [...rows];
  const at = out[Math.floor(rng() * out.length)]!, row = add[Math.floor(rng() * add.length)]!;
  return rows.map((r, i) => (i === at ? row : r));
}

/** The most rows of a question that are everyday categories ("wooden things"): any while the course categories are few (stage 1), from stage 2 on a third, since the rows then teach the terms. */
export const plainRows = (top: number, size = 6): number => (top >= 2 ? Math.floor(size / 3) : size);

/** The share of the "no" rows that are near misses: few while the categories are new (up to stage 4), half from the established bases on. */
export const nearShare = (top: number): number => (top <= 4 ? 0.25 : 0.5);

const key = (n: string) => stripDet(spelled(n));

/**
 * The things a learner with these stages on can be asked about: practice items of a stage that is on (not one said in the second person),
 * and reference examples `cellExample` allows, with classes, that the practice list does not have under the same name.
 */
export function placeThings(ix: DataIndex, examples: readonly Example[], on: Stages): PlaceThing[] {
  const out: PlaceThing[] = [], listed = new Set(ix.DATA.items.map((i) => key(i.n)));
  for (const it of ix.DATA.items) if (on.includes(itemStage(it)) && !it.nosubject) out.push({ n: it.n, st: itemStage(it), ...(it.ne ? { ne: true } : {}), item: it });
  for (const ex of examples) {
    if (!cellExample(ex, on) || !ex.cls?.length || listed.has(key(ex.n))) continue;
    out.push({ n: ex.n, st: exampleStage(ex), ...(ex.ne ? { ne: true } : {}), ...(ex.cf ? { cf: ex.cf } : {}), ex });
  }
  return out;
}

/** The rows a thing can be asked about at these stages: its practice item's (`itemRows`) or its reference example's (`placeRows`). */
export const thingRows = (ix: DataIndex, t: PlaceThing, on: Stages, unmet?: Unmet): PlaceRow[] => (t.item ? itemRows(ix, t.item, on, unmet) : t.ex ? placeRows(ix, t.ex, on, unmet) : []);

/**
 * The next thing to place, from `placeThings` (the reference examples are optional), for which the data settles enough categories
 * (`placeQuestionRows`). A stage is drawn first, each stage that still has things as likely as the others (or the highest of them `newShare` of the time), then a thing of it
 * that can be asked (those that cannot are passed over without changing the stage); names in `avoid` wait while others remain. Stages outside 1 to 11 count for nothing, and none left means the default. Null when nothing qualifies.
 */
export function drawPlace(ix: DataIndex, examples: readonly Example[] | null, draw: PlaceDraw): PlaceQuestion | null {
  const on = normStages(draw.stages), near = nearShare(topStage(on)), high = topStage(on);
  const usable = placeThings(ix, examples ?? [], on);
  const fresh = usable.filter((t) => !draw.avoid?.has(t.n));
  for (const pool of fresh.length ? [fresh, usable] : [usable]) {
    let left = pool;
    while (left.length) {
      const have = on.filter((s) => left.some((t) => t.st === s)), top = have[have.length - 1]!, rest = have.slice(0, -1);
      const r = draw.rng(), stage = draw.newShare === undefined || !rest.length ? have[Math.floor(r * have.length)]
        : r < draw.newShare ? top : rest[Math.floor(((r - draw.newShare) / (1 - draw.newShare)) * rest.length)];
      // a thing the data settles too little for is passed over within its stage, so that the stage keeps its share (a stage whose reference
      // examples cannot be asked would otherwise lose its draws to the stage below); a stage with nothing to ask is left out
      let of = left.filter((t) => t.st === stage);
      // the highest stage's share goes to the terms met whose last answer is not right yet: its things are those that can be asked about one (the things
      // of the highest stage that has any: the elements bring terms and no things, so the things of the senses are asked about them), or, when none of
      // them can be (an open term of a stage below), the things of any stage that can
      const open = stage === top && draw.open?.size ? draw.open : null, asks = (rows: readonly PlaceRow[]) => rows.some((r) => open!.has(r.cat));
      const can = (t: PlaceThing) => asks(thingRows(ix, t, on, draw.unmet));
      if (open) { const lean = of.filter(can); if (lean.length) of = lean; else { const any = left.filter((t) => t.st !== stage && can(t)); if (any.length) of = any; } }
      while (of.length) {
        const thing = of[Math.floor(draw.rng() * of.length)], all = thingRows(ix, thing, on, draw.unmet);
        const pick = () => placeQuestionRows(ix, thing, draw.rng, draw.size, all, near, plainRows(high, draw.size));
        let rows = pick();
        // the rows are a sample of the thing's: a few more tries for one with an open term in it
        for (let k = 0; open && rows && !asks(rows) && asks(all) && k < 6; k++) rows = pick() ?? rows;
        // still none (a stage with many terms leaves each a small share of the rows): a "no" row gives way to one on an open term
        if (open && rows && !asks(rows)) rows = withOpenRow(rows, all, open, draw.rng);
        if (rows) return { thing, rows };
        of = of.filter((t) => t !== thing);
      }
      left = left.filter((t) => t.st !== stage);
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

/** One step of the line from the most specific category up to the top of the "is a" chain: a category the question offered for step 2, or one it left out. */
export interface PlaceStep {
  /** the Dudra term; "" for an everyday category, which `cat` names */
  term: string;
  cat?: string;
  phrase: string;
  option: boolean;
}

/** Step 2 of a question: pick the most specific of the categories the thing is in. */
export interface PlaceNarrow {
  /** the categories of the question the thing is in, whatever was ticked in step 1 (the corrected set), in the order step 2 lists them */
  options: PlaceRow[];
  /** the most specific of them (a category id) */
  cat: string;
  /** from the most specific category up to the top, each marked as an option or not */
  line: PlaceStep[];
}

/**
 * Step 2 of the question: the categories the thing is in, from which the learner picks the most specific. Null when there is nothing to narrow:
 * fewer than two categories apply, or they do not lie on one line of the "is a" chain (a thing of two classes can be in a category of each).
 * An everyday category stands just below the term its kind names ("furniture" below Form, "humans" below Person); when the everyday categories
 * that apply are not on one line with the rest ("wooden things" and "furniture"), step 2 asks about the course's categories alone, as before them.
 */
export function placeNarrow(ix: DataIndex, q: PlaceQuestion, rng: () => number): PlaceNarrow | null {
  const all = q.rows.filter((r) => r.answer);
  const key = (r: PlaceRow) => r.term || "@" + r.cat;
  const chainOf = (r: PlaceRow) => (r.term ? upChain(ix, r.term) : ["@" + r.cat, ...catChain(ix, ix.CAT[r.cat])]);
  const lowest = (rows: PlaceRow[]) => (rows.length < 2 ? undefined : rows.find((r) => { const up = chainOf(r); return rows.every((o) => up.includes(key(o))); }));
  let yes = all, narrowest = lowest(yes);
  if (!narrowest) { yes = all.filter((r) => r.term); narrowest = lowest(yes); }
  if (!narrowest) return null;
  const offered = new Set(yes.map(key));
  const line = chainOf(narrowest).map((k): PlaceStep =>
    k.startsWith("@") ? { term: "", cat: k.slice(1), phrase: narrowest.phrase, option: true } : { term: k, phrase: termPhrase(k), option: offered.has(k) });
  return { options: shuffle(yes, rng), cat: narrowest.cat, line };
}

export interface NarrowGraded {
  /** the category the learner picked */
  picked: PlaceRow;
  /** it is the most specific one */
  ok: boolean;
  /** the steps from the most specific category up to the one picked: "it is a color, which is a form source, which is an external form" */
  upTo: PlaceStep[];
}

/** Grades the pick of step 2 (a category id); null for a category that was not offered. */
export function gradeNarrow(n: PlaceNarrow, cat: string): NarrowGraded | null {
  const picked = n.options.find((r) => r.cat === cat);
  if (!picked) return null;
  const at = n.line.findIndex((s) => (picked.term ? s.term === picked.term : s.cat === picked.cat));
  return { picked, ok: cat === n.cat, upTo: n.line.slice(0, at + 1) };
}

/** How a thing went: `ok` when step 1 is all right and step 2 is right or was not asked (`s2` null), `bad` when no part that was asked is right, else `part`. */
export type PlaceGrade = "ok" | "part" | "bad";
export function placeGrade(s1: boolean, s2: boolean | null): PlaceGrade {
  if (s2 === null) return s1 ? "ok" : "bad";
  return s1 && s2 ? "ok" : s1 || s2 ? "part" : "bad";
}
