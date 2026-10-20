// The consequence drill: "Take a tomato. It follows it is food because it is red." The learner answers that they accept it, that
// the reason is not established, or that there is no pervasion. The answer is not a guess of the generator: it follows from three
// checks of the term data, E (the subject is the reason), V (whatever is the reason is the predicate) and T (the subject is the
// predicate), which fall into eight situations. A consequence is drawn by its answer and situation first, then by the links between
// its parts, so that the faulty ones tempt and the absurd ones stay few. Pure functions of the term data, like the rest of this folder.
//
// What proves what, as the practice data allows it: the subject's own category list proves E and T either way. Only the term chain
// (and the few pervasions stated by hand below) prove that a pervasion holds or is opposite; the items only disprove one, with a thing
// that is the reason and is not the predicate. Pairs that neither can settle are never drawn.
import type { DrillData, Item } from "../ai-shared/data";
import { upChain } from "../ai-shared/lookup";
import type { DataIndex } from "../ai-shared/lookup";
import type { CellId } from "../ai-shared/relations";
import { catChain, termPhrase } from "./ladder";
import type { HistoryEntry } from "./types";
import { cellsFor, judgeable } from "./universe";
import type { Rng } from "./universe";
import { RECENT_MAX } from "./universe";
import { cap, isMiss } from "./util";

/** What the learner says: accept the consequence, deny the reason ("the reason is not established"), or deny the pervasion. */
export type Reply = "accept" | "reason" | "pervasion";
/** The replies in the order the buttons show them. */
export const REPLIES: readonly Reply[] = ["accept", "reason", "pervasion"];

/** The eight combinations of the three checks: E (the subject is the reason), V (whatever is the reason is the predicate), T (the subject is the predicate). */
export type Situation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
/** Whether the pervasion holds, fails, or is opposite: whatever is the reason is *not* the predicate, as the term chain proves it. */
export type Pervasion = "holds" | "fails" | "opposite";

interface SituationRule {
  /** the reply that is right */
  answer: Reply;
  /** E and T */
  e: boolean;
  t: boolean;
  /** what the pervasion must be: "holds", "opposite" (the term chain proves it), "fails" (not that) or "no" (either of the two failing kinds) */
  v: "holds" | "opposite" | "fails" | "no";
  /** the cell of the grid for (reason, predicate) the subject comes from: both = reason and predicate, anb = the reason only, bna = the predicate only */
  cell: CellId;
  /** how likely it is to be drawn within its answer: the tempting faults count more */
  weight: number;
}
export const SITUATIONS: Record<Situation, SituationRule> = {
  1: { answer: "accept", e: true, t: true, v: "holds", cell: "both", weight: 1 },
  2: { answer: "pervasion", e: true, t: true, v: "no", cell: "both", weight: 1.4 },
  3: { answer: "pervasion", e: true, t: false, v: "fails", cell: "anb", weight: 1.4 },
  4: { answer: "pervasion", e: true, t: false, v: "opposite", cell: "anb", weight: 0.6 },
  5: { answer: "reason", e: false, t: true, v: "holds", cell: "bna", weight: 1.4 },
  6: { answer: "reason", e: false, t: false, v: "holds", cell: "nei", weight: 1.2 },
  7: { answer: "reason", e: false, t: true, v: "no", cell: "bna", weight: 1.4 },
  8: { answer: "reason", e: false, t: false, v: "no", cell: "nei", weight: 0.5 },
};
const SIT_IDS = Object.keys(SITUATIONS).map(Number) as Situation[];

// What a category says after "it is" and after "because of being": the first phrase is the plain one, the others are other labels of the
// same class (so that "impermanent because a product" can be drawn). Some of the data's labels have no phrase here ("hidden phenomena" is
// the existent in the data and would make every consequence trivial). A category without a phrase is not drawn; the unit test names those.
const PHRASES: Record<string, readonly string[]> = {
  ft: ["impermanent", "a product", "a functional thing", "momentary", "able to perform a function"],
  perm: ["permanent", "a permanent phenomenon", "uncomposed", "non-produced"],
  form: ["a form", "matter", "a physical thing"],
  extf: ["an external form"], intf: ["an internal form"], sp: ["a sense power"],
  col: ["a color", "a hue"], shape: ["a shape"], vis: ["a visible form"], snd: ["a sound"], odr: ["an odor", "a smell"],
  tst: ["a taste"], tng: ["a tangible object"],
  cons: ["a consciousness", "a mind", "a knower", "an awareness"], sense: ["a sense consciousness", "a sense perception"],
  eye: ["an eye consciousness"], ment: ["a mental consciousness"],
  nonas: ["a non-associated compositional factor"], pers: ["a person", "a sentient being"], expr: ["an expressive sound"],
  wooden: ["made of wood", "wooden"], metal: ["made of metal", "metal"], white: ["white"], red: ["red"], green: ["green"],
  round: ["round"], square: ["square"], hot: ["hot"],
  liquid: ["a liquid"], food: ["food", "something you can eat"], drink: ["a drink"], furn: ["furniture"], instr: ["a musical instrument"],
  plant: ["a plant"], body: ["a body or a body part"], animal: ["an animal"], human: ["a human"],
  emotion: ["an emotion", "a feeling"], memory: ["a memory"], thought: ["a thought"], dream: ["a dream"],
};
/** The categories the drill leaves out for want of a phrase. */
export const NO_PHRASE: readonly string[] = ["hid"];

// Kinds of things that are mistaken for one another (a color for a shape), for the near misses; Dudra categories with the same parent
// term, or a parent and its child, are near by the data (not under the two widest classes: a permanent thing is no near miss for a table).
const GROUPS: readonly (readonly string[])[] = [
  ["wooden", "metal"], ["white", "red", "green"], ["round", "square"], ["liquid", "food", "drink"], ["furn", "instr"],
  ["plant", "animal", "human", "body"], ["emotion", "memory", "thought", "dream"],
];

// Pervasions among the practice categories that the term chain cannot show (an everyday category has no place of its own in it). Each one
// follows from the category's own description in the data ("consciousness: mental consciousness remembering"). The others the items show
// (everything made of wood is an external form, and so on) wait for a review: some rest on how the data treats a body.
const REVIEWED: ReadonlySet<string> = new Set(["drink>liquid", "memory>ment", "thought>ment", "dream>ment"]);

const WIDEST: ReadonlySet<string> = new Set(["Existent", "Functional thing"]);
// Things the page says in the second person cannot follow "Take": "Take you. It follows ..." reads as an order.
const NOT_A_SUBJECT: ReadonlySet<string> = new Set(["you"]);

type Holds = { how: "same" } | { how: "chain"; steps: string[] } | { how: "reviewed" };
/** A pair of categories (reason, predicate) the drill can make consequences from, and what is known about its pervasion. */
interface PairInfo {
  r: string;
  p: string;
  /** 1 when both are everyday categories, 2 when a term of the course is one of them */
  level: 1 | 2;
  /** how the pervasion is proved when it holds; null when it fails */
  holds: Holds | null;
  /** the classes of the term chains that exclude each other, when the pervasion is opposite */
  opposite: [string, string] | null;
  cells: Record<CellId, Item[]>;
  /** the reason and the predicate have something in common */
  related: boolean;
}
interface Cand { pair: PairInfo; item: Item; links: number }
/** The candidates of one pair of categories, with how likely they are as a group. */
interface Group { pair: PairInfo; cands: Cand[]; mean: number }
/** The candidates of a situation up to a level, by how well their parts are linked. `linked`: enough links for their level; `some`: at least one; `zero`: none. */
interface View { all: Group[]; linked: Group[]; some: Group[]; zero: Group[] }
interface Table {
  pairs: PairInfo[];
  near: Map<string, Set<string>>;
  /** category pairs whose pervasion the term data proves but an item contradicts, as "reason>predicate" */
  conflicts: string[];
  bySit: Map<Situation, Cand[]>;
  views: Map<string, View>;
}

const terms = (ix: DataIndex) => ix.DATA.terms;
function sameClass(ix: DataIndex, t: string): Set<string> {
  const T = terms(ix), out = new Set([t, ...(T[t]?.mi || [])]);
  for (const [k, v] of Object.entries(T)) if ((v.mi || []).includes(t)) out.add(k);
  return out;
}
const excludes = (ix: DataIndex, x: string, y: string) => (terms(ix)[x]?.contra || []).includes(y) || (terms(ix)[y]?.contra || []).includes(x);
function excludingClasses(ix: DataIndex, r: string, p: string): [string, string] | null {
  const cr = catChain(ix, ix.CAT[r]), cp = catChain(ix, ix.CAT[p]);
  for (const x of cr) for (const y of cp) if (excludes(ix, x, y)) return [x, y];
  return null;
}
function holdsBy(ix: DataIndex, r: string, p: string): Holds | null {
  if (r === p) return { how: "same" };
  if (REVIEWED.has(`${r}>${p}`)) return { how: "reviewed" };
  const P = ix.CAT[p];
  if (P.kind !== "dudra" || !P.term) return null;
  const want = sameClass(ix, P.term), chain = catChain(ix, ix.CAT[r]), i = chain.findIndex((t) => want.has(t));
  return i < 0 ? null : { how: "chain", steps: chain.slice(0, i + 1) };
}

function nearTable(ix: DataIndex): Map<string, Set<string>> {
  const ids = Object.keys(ix.CAT), out = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()]));
  const link = (x: string, y: string) => { out.get(x)?.add(y); out.get(y)?.add(x); };
  for (const g of GROUPS) for (const x of g) for (const y of g) if (x !== y && ix.CAT[x] && ix.CAT[y]) link(x, y);
  for (const x of ids) {
    for (const y of ids) {
      const X = ix.CAT[x], Y = ix.CAT[y];
      if (x === y || X.kind !== "dudra" || Y.kind !== "dudra" || !X.term || !Y.term) continue;
      const tx = terms(ix)[X.term], ty = terms(ix)[Y.term];
      if (tx?.parent && !WIDEST.has(tx.parent) && (tx.parent === ty?.parent || tx.parent === Y.term)) link(x, y);
    }
  }
  return out;
}

// kept per data, not per index: the page passes its `state` as the index, and the tables must follow a replaced data
const cache = new WeakMap<DrillData, Table>();
function tableOf(ix: DataIndex): Table {
  const hit = cache.get(ix.DATA);
  if (hit) return hit;
  const ids = Object.keys(ix.CAT).filter((id) => PHRASES[id]), pairs: PairInfo[] = [], conflicts: string[] = [];
  for (const r of ids) {
    for (const p of ids) {
      if (r === p ? PHRASES[r].length < 2 : !judgeable(ix, r, p)) continue;
      const cells = cellsFor(ix, r, p), level = ix.CAT[r].kind === "everyday" && ix.CAT[p].kind === "everyday" ? 1 : 2;
      const by = holdsBy(ix, r, p), excl = by || r === p ? null : excludingClasses(ix, r, p);
      // the data must agree with itself: a proved pervasion has no counter-example, a proved opposite no common thing
      if ((by && cells.anb.length) || (excl && cells.both.length)) { conflicts.push(`${r}>${p}`); continue; }
      if (!by && !cells.anb.length) continue; // neither the term data nor an item settles it
      pairs.push({ r, p, level, holds: by, opposite: excl, cells, related: r === p || cells.both.length > 0 });
    }
  }
  const t: Table = { pairs, near: nearTable(ix), conflicts, bySit: new Map(), views: new Map() };
  cache.set(ix.DATA, t);
  return t;
}

function matches(rule: SituationRule, pair: PairInfo): boolean {
  switch (rule.v) {
    case "holds": return !!pair.holds;
    case "opposite": return !pair.holds && !!pair.opposite;
    case "fails": return !pair.holds && !pair.opposite;
    default: return !pair.holds;
  }
}

/** How many of the four links between the parts a consequence has: the thesis is true, the reason is true or near the subject, the reason and predicate have something in common, the predicate is true or near the subject. */
function linksOf(t: Table, pair: PairInfo, item: Item, rule: SituationRule): number {
  const nearTo = (x: string) => item.c.some((c) => c !== x && t.near.get(x)?.has(c));
  return (rule.t ? 1 : 0) + (rule.e || nearTo(pair.r) ? 1 : 0) + (pair.related ? 1 : 0) + (rule.t || nearTo(pair.p) ? 1 : 0);
}

function candidates(ix: DataIndex, sit: Situation): Cand[] {
  const t = tableOf(ix), hit = t.bySit.get(sit);
  if (hit) return hit;
  const rule = SITUATIONS[sit], out: Cand[] = [];
  for (const pair of t.pairs) {
    if (!matches(rule, pair)) continue;
    for (const item of pair.cells[rule.cell]) if (!item.ne && !NOT_A_SUBJECT.has(item.n)) out.push({ pair, item, links: linksOf(t, pair, item, rule) });
  }
  t.bySit.set(sit, out);
  return out;
}

const weightOf = (links: number) => (1 + links) ** 2; // the more links, the likelier: the absurd ones are rare, not gone
function groupsOf(cands: readonly Cand[]): Group[] {
  const by = new Map<PairInfo, Cand[]>();
  for (const c of cands) by.set(c.pair, [...(by.get(c.pair) || []), c]);
  return [...by].map(([pair, cs]) => ({ pair, cands: cs, mean: cs.reduce((s, c) => s + weightOf(c.links), 0) / cs.length }));
}
function viewOf(ix: DataIndex, sit: Situation, top: 1 | 2): View {
  const t = tableOf(ix), key = `${sit}:${top}`, hit = t.views.get(key);
  if (hit) return hit;
  const all = candidates(ix, sit).filter((c) => c.pair.level <= top);
  // at least one link at level 1, two at level 2 (the course's terms are easier to confuse, so they are held to more sense)
  const v: View = {
    all: groupsOf(all), zero: groupsOf(all.filter((c) => c.links === 0)), some: groupsOf(all.filter((c) => c.links > 0)),
    linked: groupsOf(all.filter((c) => c.links >= (c.pair.level === 1 ? 1 : 2))),
  };
  t.views.set(key, v);
  return v;
}

/** The pairs of categories (as "reason>predicate") whose pervasion the term data proves but an item contradicts. Empty when the data agrees with itself. */
export const pervasionConflicts = (ix: DataIndex): string[] => tableOf(ix).conflicts.slice();

/** One of the three checks: whether it holds, and the sentence that shows it. */
export interface Check { ok: boolean; line: string }

/** A consequence to answer: what it says, what is right, and why, so that it can be shown and graded without the data. */
export interface Consequence {
  /** the subject, the reason and the predicate, "reason|predicate|subject": the same one has the same id */
  id: string;
  subject: string;
  /** after "it is" */
  predicate: string;
  /** after "it is" (or "because of being") */
  reason: string;
  catR: string;
  catP: string;
  situation: Situation;
  answer: Reply;
  pervasion: Pervasion;
  level: 1 | 2;
  /** how many of the four links between the parts it has */
  links: number;
  checks: { e: Check; v: Check; t: Check };
  /** a thing that is the reason and is not the predicate, when the pervasion fails */
  witness?: string;
}

const is = (yes: boolean, phrase: string) => (yes ? "is " : "is not ") + phrase;

// A term as the practice words it where it has a category ("a sound" for Sound source, "impermanent" for Functional thing), else as a term.
function termWord(ix: DataIndex, t: string): string {
  const cat = Object.values(ix.CAT).find((c) => c.kind === "dudra" && c.term === t && PHRASES[c.id]);
  return cat ? PHRASES[cat.id][0] : termPhrase(t);
}

function proofOfE(ix: DataIndex, item: Item, r: string, reason: string, yes: boolean): string {
  const base = `${cap(item.n)} ${is(yes, reason)}.`;
  if (yes) return base;
  // the lowest class of the subject that excludes a class of the reason says why not: "... is a form, and whatever is a memory is a consciousness, but nothing is both."
  const rc = catChain(ix, ix.CAT[r]);
  for (const x of upChain(ix, item.t)) {
    const y = rc.find((c) => excludes(ix, x, c));
    if (y) return `${base} ${cap(item.n)} is ${termWord(ix, x)}, and whatever is ${reason} is ${termWord(ix, y)}, but nothing is both.`;
  }
  return base;
}

function proofOfV(ix: DataIndex, pair: PairInfo, reason: string, predicate: string, witness: string | undefined): string {
  const every = `Whatever ${is(true, reason)} ${is(true, predicate)}`;
  if (pair.holds?.how === "same") return `${every}: these two name the same class.`;
  if (pair.holds?.how === "reviewed") return `${every}.`;
  if (pair.holds) {
    // the steps up the chain, from the reason's class (a Dudra reason is already that class) to the predicate's
    const up = pair.holds.steps.slice(ix.CAT[pair.r].kind === "dudra" ? 1 : 0);
    if (!up.length) return `${every}: these two name the same class.`;
    return up.length === 1 ? `${every}.` : `${every}, since it is ${up.map((t) => termWord(ix, t)).join(", which is ")}.`;
  }
  const fails = `${cap(witness || "")} ${is(true, reason)} and ${is(false, predicate)}, so not everything that is ${reason} is ${predicate}.`;
  if (!pair.opposite) return fails;
  const [x, y] = pair.opposite;
  return `${fails} The pervasion is even opposite: whatever is ${reason} is ${termWord(ix, x)}, whatever is ${predicate} is ${termWord(ix, y)}, and nothing is both.`;
}

function phrasesFor(pair: PairInfo, rng: Rng): [string, string] {
  const rs = PHRASES[pair.r], ps = PHRASES[pair.p];
  if (pair.r === pair.p) {
    const i = Math.floor(rng() * rs.length);
    let j = Math.floor(rng() * (rs.length - 1));
    if (j >= i) j++;
    return [rs[i], rs[j]]; // the reason may not be the predicate (the same label twice is never drawn)
  }
  return [rs[Math.floor(rng() * rs.length)], ps[Math.floor(rng() * ps.length)]];
}

function make(ix: DataIndex, c: Cand, sit: Situation, rng: Rng): Consequence {
  const { pair, item } = c, rule = SITUATIONS[sit];
  const [reason, first] = phrasesFor(pair, rng);
  // two categories that share a phrase would give "it is X because it is X"
  const predicate = reason === first && pair.r !== pair.p ? PHRASES[pair.p].find((x) => x !== reason) || first : first;
  const others = pair.holds ? [] : pair.cells.anb.filter((i) => !i.ne && i !== item);
  const pool = others.length ? others : pair.cells.anb.filter((i) => !i.ne);
  const witness = pair.holds || !pool.length ? undefined : pool[Math.floor(rng() * pool.length)].n;
  const pervasion: Pervasion = pair.holds ? "holds" : pair.opposite ? "opposite" : "fails";
  return {
    id: `${pair.r}|${pair.p}|${item.n}`, subject: item.n, predicate, reason, catR: pair.r, catP: pair.p,
    situation: sit, answer: rule.answer, pervasion, level: pair.level, links: c.links, witness,
    checks: {
      e: { ok: rule.e, line: proofOfE(ix, item, pair.r, reason, rule.e) },
      v: { ok: !!pair.holds, line: proofOfV(ix, pair, reason, predicate, witness) },
      t: { ok: rule.t, line: `${cap(item.n)} ${is(rule.t, predicate)}.` },
    },
  };
}

/** What the data says about a consequence of this subject (an item's name), reason and predicate (category ids), or null when the data cannot settle it. */
export function consequenceOf(ix: DataIndex, subject: string, catR: string, catP: string, rng: Rng = Math.random): Consequence | null {
  const t = tableOf(ix), pair = t.pairs.find((x) => x.r === catR && x.p === catP), item = ix.DATA.items.find((i) => i.n === subject);
  if (!pair || !item || item.ne) return null;
  const cell = (["both", "anb", "bna", "nei"] as const).find((k) => pair.cells[k].includes(item));
  const sit = SIT_IDS.find((s) => { const rule = SITUATIONS[s]; return rule.cell === cell && matches(rule, pair); });
  return sit ? make(ix, { pair, item, links: linksOf(t, pair, item, SITUATIONS[sit]) }, sit, rng) : null;
}

// ---- wording ----

/** The ways to say a consequence: the class's "Take X. It follows it is P because it is R." and the textbook's. */
export const WORDINGS = {
  take: (c: Consequence) => `Take ${c.subject}. It follows it is ${c.predicate} because it is ${c.reason}.`,
  textbook: (c: Consequence) => `It follows that the subject, ${c.subject}, is ${c.predicate} because of being ${c.reason}.`,
} as const;
export type Wording = keyof typeof WORDINGS;
/** The consequence as a sentence, in one of the wordings (the class's by default). */
export const consequenceText = (c: Consequence, wording: Wording = "take"): string => WORDINGS[wording](c);

// ---- grading ----

/** The result of an answer. A reply that finds a real fault but not the one to name first (the reason, when both fail) is wrong all the same, and says so (`missedPoint`). */
export interface ConsequenceResult {
  grade: "ok" | "bad";
  correct: boolean;
  said: Reply;
  expected: Reply;
  /** the learner named a fault that is there, but not the first one to name */
  missedPoint: boolean;
  /** one sentence that says what was mixed up; empty for a right answer */
  confusion: string;
}

function confusionOf(c: Consequence, said: Reply): string {
  const S = cap(c.subject), R = c.reason, P = c.predicate, every = `whatever is ${R} is ${P}`;
  const rule = SITUATIONS[c.situation];
  if (c.answer === "accept") {
    return said === "reason" ? `${S} is ${R} and ${every}, so there is nothing to deny: the consequence stands.`
      : `${cap(every)}, so the pervasion holds.`;
  }
  if (c.answer === "pervasion") {
    return said === "accept"
      ? (rule.t ? `You accepted because the conclusion is true, but the reason has to prove it, and it is false that ${every}.`
        : `${S} is ${R}, but it is false that ${every}, so the reason does not prove the conclusion.`)
      : `${S} is ${R}, so the reason is established; what fails is the step from ${R} to ${P}.`;
  }
  if (said === "accept") {
    return rule.t ? `You accepted because the conclusion is true, but the reason has to prove it, and ${c.subject} is not ${R}.`
      : `${S} is not ${R}, so the reason is not established.`;
  }
  if (c.checks.v.ok) return `${cap(every)}, so the pervasion holds; the trouble is that ${c.subject} is not ${R}.`;
  return `You are not wrong that the pervasion fails, but you missed the point: the reason comes first, and ${c.subject} is not ${R}.`;
}

/** Grades a reply to a consequence. Needs no data: the consequence carries its own proofs. */
export function gradeConsequence(c: Consequence, said: Reply): ConsequenceResult {
  const correct = said === c.answer;
  return {
    grade: correct ? "ok" : "bad", correct, said, expected: c.answer,
    missedPoint: !correct && c.answer === "reason" && said === "pervasion" && !c.checks.v.ok,
    confusion: correct ? "" : confusionOf(c, said),
  };
}

// ---- the draw ----

/** What the draw reads from an earlier answer: a history entry (`catA` is the reason's category, `catB` the predicate's) with the reply that was right and the situation. */
export interface ConsequenceHistory extends HistoryEntry {
  answer?: Reply;
  situation?: Situation;
}
export interface ConsequenceDraw {
  /** the earlier answers, oldest first */
  hist: readonly ConsequenceHistory[];
  /** ids of the consequences drawn lately; the draw appends to it and keeps the last RECENT_MAX */
  recent: string[];
  /** the highest level to draw from: 1 everyday things and properties only, 2 also the terms of the course (the default) */
  level?: 1 | 2;
  rng?: Rng;
}

/** The share of consequences drawn with nothing linking their parts, as light relief (when the data has such ones). */
export const RELIEF = 0.1;

/** The consequence to practice next. See the note on the draw: the answer, then the situation, then the triple by its links. */
export function drawConsequence(ix: DataIndex, st: ConsequenceDraw): Consequence {
  const rng = st.rng || Math.random, top = st.level ?? 2, hist = st.hist;
  const usable = (s: Situation) => viewOf(ix, s, top).all.length > 0;
  // light relief: now and then a consequence with nothing linking its parts at all (the reason is not established, and the pervasion fails as well)
  const zero = rng() < RELIEF ? viewOf(ix, 8, top).zero : [];
  let sit: Situation = 8, pool = zero;
  if (!zero.length) {
    // the answer: all three alike, the one asked lately less, the one missed lately more
    const aw: Record<Reply, number> = { accept: 1, reason: 1, pervasion: 1 };
    for (const h of hist.slice(-6)) if (h.answer) aw[h.answer] = Math.max(0.15, aw[h.answer] * 0.45);
    for (const h of hist.slice(-30)) if (h.answer && isMiss(h)) aw[h.answer] *= 1.4;
    const replies = REPLIES.filter((a) => SIT_IDS.some((s) => SITUATIONS[s].answer === a && usable(s)));
    if (!replies.length) throw new Error("no consequence to draw from");
    const answer = chooseWeighted(replies, (a) => aw[a], rng);
    sit = chooseWeighted(SIT_IDS.filter((s) => SITUATIONS[s].answer === answer && usable(s)), (s) => SITUATIONS[s].weight, rng);
    const v = viewOf(ix, sit, top);
    pool = v.linked.length ? v.linked : v.some.length ? v.some : v.all;
  }

  const weak: Record<string, number> = Object.create(null);
  for (const h of hist.slice(-40)) {
    if (!isMiss(h)) continue;
    if (h.catA) weak[h.catA] = (weak[h.catA] || 0) + 1;
    if (h.catB) weak[h.catB] = (weak[h.catB] || 0) + 1;
  }
  const seen = new Set(st.recent), seenPair = new Set(st.recent.map((id) => id.split("|").slice(0, 2).join("|")));
  // the pair of categories first, then a subject, so that a pair with many subjects does not crowd out the others
  const group = chooseWeighted(pool, (g) => {
    const { r, p } = g.pair;
    return g.mean * (seenPair.has(`${r}|${p}`) ? 0.4 : 1) * (1 + 1.5 * ((weak[r] || 0) + (weak[p] || 0)));
  }, rng);
  const cand = chooseWeighted(group.cands, (c) => weightOf(c.links) * (seen.has(`${group.pair.r}|${group.pair.p}|${c.item.n}`) ? 0.05 : 1), rng);
  const c = make(ix, cand, sit, rng);
  st.recent.push(c.id);
  if (st.recent.length > RECENT_MAX) st.recent.shift();
  return c;
}

function chooseWeighted<T>(xs: readonly T[], w: (x: T) => number, rng: Rng): T {
  const ws = xs.map(w);
  let x = rng() * ws.reduce((s, v) => s + v, 0);
  for (const [i, v] of ws.entries()) { if ((x -= v) <= 0) return xs[i]; }
  return xs[xs.length - 1];
}
