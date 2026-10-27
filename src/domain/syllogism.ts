// The syllogism drill: "Take a tomato. It follows it is food because it is red." The learner answers that they accept it, that
// the reason is not established, or that there is no pervasion. The answer is not a guess of the generator: it follows from three
// checks of the term data, E (the subject is the reason), V (whatever is the reason is the predicate) and T (the subject is the
// predicate), which fall into eight situations. A syllogism is drawn by its answer and situation first, then by the links between
// its parts, so that the faulty ones tempt and the absurd ones stay few. Pure functions of the term data, like the rest of this folder.
//
// What proves what, as the practice data allows it: the subject's own category list proves E and T either way. Only the term chain
// (and the few pervasions stated by hand below) prove that a pervasion holds or is opposite; the items only disprove one, with a thing
// that is the reason and is not the predicate. Pairs that neither can settle are never drawn.
import type { DrillData, Item } from "../ai-shared/data";
import { matchItem, sameNames, upChain } from "../ai-shared/lookup";
import type { DataIndex } from "../ai-shared/lookup";
import type { CellId } from "../ai-shared/relations";
import { catChain, termPhrase } from "./ladder";
import type { HistoryEntry } from "./types";
import { cellsFor, judgeable } from "./universe";
import type { Rng } from "./universe";
import { FEATURE, RECENT_MAX, inUniverse } from "./universe";
import { vagueVerdict } from "./vague";
import { catOpen, itemOn, normStages, topStage } from "./stages";
import type { Stages, Unmet } from "./stages";
import { cap, isMiss } from "./util";

/** What the learner says: accept the syllogism, deny the reason ("the reason is not established"), or deny the pervasion. */
export type Reply = "accept" | "reason" | "pervasion";
/** The replies in the order the buttons show them. */
export const REPLIES: readonly Reply[] = ["reason", "pervasion", "accept"];

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

// What the drill takes from the term data (src/data/drill-data.json, written in the project's knowledge base, practice/drill/items.py), none of it here:
// - a category's `phrases`: what it says after "it is" and "because it is". The first is the plain one, the others are other labels of the same class
//   (so that "impermanent because a product" can be drawn). A category with none is not drawn;
// - a category's `within`: the pervasions among the practice categories that the term chain cannot show (an everyday category has no place of
//   its own in it), stated by hand there. The others the items show (everything made of wood is an external form) only disprove a pervasion;
// - the `confusable` groups: kinds of things that are mistaken for one another (a color for a shape), for the near misses;
// - an item's `nosubject`: the page says it in the second person, and "Take you. It follows ..." reads as an order.
// The rules themselves, and the wording of the sentences, are here.
const phrasesOf = (ix: DataIndex, id: string): readonly string[] => ix.CAT[id]?.phrases ?? [];
const hasPhrases = (ix: DataIndex, id: string) => phrasesOf(ix, id).length > 0;
/** The categories the data gives no phrase: the drill leaves them out. */
export const withoutPhrases = (ix: DataIndex): string[] => Object.keys(ix.CAT).filter((id) => !hasPhrases(ix, id));

type Holds = { how: "same" } | { how: "chain"; steps: string[] } | { how: "stated" };
/** A pair of categories (reason, predicate) the drill can make syllogisms from, and what is known about its pervasion. */
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
interface Cand { pair: PairInfo; item: Item; links: number; /** 2 when the pair or the subject needs the course's terms (the subject's `dudraOnly`) */ level: 1 | 2 }
const levelOf = (pair: PairInfo, item: Item): 1 | 2 => (item.dudraOnly ? 2 : pair.level);
/** The candidates of one pair of categories, with how likely they are as a group. */
interface Group { pair: PairInfo; cands: Cand[]; mean: number }
/** The candidates of a situation up to a level, by how well their parts are linked. `linked`: enough links for their level; `some`: at least one; `zero`: none. */
interface View { all: Group[]; linked: Group[]; some: Group[]; zero: Group[] }
interface Table {
  pairs: PairInfo[];
  near: Map<string, Set<string>>;
  /** category pairs whose pervasion the term data proves but an item contradicts, as "reason>predicate" */
  conflicts: string[];
  /** the candidates of a situation up to a level, for a set of stages, as "situation:level:stages" */
  bySit: Map<string, Cand[]>;
  views: Map<string, View>;
}

const terms = (ix: DataIndex) => ix.DATA.terms;
const excludes = (ix: DataIndex, x: string, y: string) => (terms(ix)[x]?.contra || []).includes(y) || (terms(ix)[y]?.contra || []).includes(x);
function excludingClasses(ix: DataIndex, r: string, p: string): [string, string] | null {
  const cr = catChain(ix, ix.CAT[r]), cp = catChain(ix, ix.CAT[p]);
  for (const x of cr) for (const y of cp) if (excludes(ix, x, y)) return [x, y];
  return null;
}
function holdsBy(ix: DataIndex, r: string, p: string): Holds | null {
  if (r === p) return { how: "same" };
  if (ix.CAT[r]?.within?.includes(p)) return { how: "stated" };
  const P = ix.CAT[p];
  if (P.kind !== "dudra" || !P.term) return null;
  const want = sameNames(ix, P.term), chain = catChain(ix, ix.CAT[r]), i = chain.findIndex((t) => want.has(t));
  return i < 0 ? null : { how: "chain", steps: chain.slice(0, i + 1) };
}

/** The terms too wide to make two categories near: on the chain of most of the Dudra categories (Existent, Functional thing), so a permanent thing is no near miss for a table. */
export function widest(ix: DataIndex): Set<string> {
  const dudra = Object.values(ix.CAT).filter((c) => c.kind === "dudra" && c.term), count = new Map<string, number>();
  for (const c of dudra) for (const t of catChain(ix, c)) count.set(t, (count.get(t) || 0) + 1);
  return new Set([...count].filter(([, n]) => n > dudra.length * WIDE_SHARE).map(([t]) => t));
}
/** The share of the Dudra categories a term must be above, on their chains, to be too wide. */
const WIDE_SHARE = 0.75;

function nearTable(ix: DataIndex): Map<string, Set<string>> {
  const ids = Object.keys(ix.CAT), out = new Map<string, Set<string>>(ids.map((id) => [id, new Set<string>()])), wide = widest(ix);
  const link = (x: string, y: string) => { out.get(x)?.add(y); out.get(y)?.add(x); };
  for (const g of ix.DATA.confusable ?? []) for (const x of g) for (const y of g) if (x !== y && ix.CAT[x] && ix.CAT[y]) link(x, y);
  for (const x of ids) {
    for (const y of ids) {
      const X = ix.CAT[x], Y = ix.CAT[y];
      if (x === y || X.kind !== "dudra" || Y.kind !== "dudra" || !X.term || !Y.term) continue;
      const tx = terms(ix)[X.term], ty = terms(ix)[Y.term];
      if (tx?.parent && !wide.has(tx.parent) && (tx.parent === ty?.parent || tx.parent === Y.term)) link(x, y);
    }
  }
  return out;
}

// kept per data, not per index: the page passes its `state` as the index, and the tables must follow a replaced data
const cache = new WeakMap<DrillData, Table>();
function tableOf(ix: DataIndex): Table {
  const hit = cache.get(ix.DATA);
  if (hit) return hit;
  const ids = Object.keys(ix.CAT).filter((id) => hasPhrases(ix, id)), pairs: PairInfo[] = [], conflicts: string[] = [];
  const seen = new Map<string, Record<CellId, Item[]>>();
  // the cells of (p, r) are those of (r, p) with the two one-sided cells swapped
  const cellsOf = (r: string, p: string) => {
    const back = seen.get(`${p}|${r}`);
    if (back) return { both: back.both, anb: back.bna, bna: back.anb, nei: back.nei };
    const c = cellsFor(ix, r, p);
    seen.set(`${r}|${p}`, c);
    return c;
  };
  for (const r of ids) {
    for (const p of ids) {
      if (r === p ? phrasesOf(ix, r).length < 2 : !judgeable(ix, r, p)) continue;
      const cells = cellsOf(r, p), level = ix.CAT[r].kind === "everyday" && ix.CAT[p].kind === "everyday" ? 1 : 2;
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

/** How many of the four links between the parts a syllogism has: the thesis is true, the reason is true or near the subject, the reason and predicate have something in common, the predicate is true or near the subject. */
function linksOf(t: Table, pair: PairInfo, item: Item, rule: SituationRule): number {
  const nearTo = (x: string) => item.c.some((c) => c !== x && t.near.get(x)?.has(c));
  return (rule.t ? 1 : 0) + (rule.e || nearTo(pair.r) ? 1 : 0) + (pair.related ? 1 : 0) + (rule.t || nearTo(pair.p) ? 1 : 0);
}

/**
 * About this many subjects of one pair are kept for a situation. The neither cell of a pair holds hundreds of things, a million
 * candidates over all pairs, which would cost seconds and megabytes on a phone; a fixed spread of a few dozen per pair keeps the variety.
 */
export const SUBJECTS_PER_PAIR = 24;
const hashOf = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const itemKeys = new WeakMap<Item, number>();
const keyOf = (item: Item) => { let k = itemKeys.get(item); if (k === undefined) itemKeys.set(item, (k = hashOf(item.n))); return k; };
/** About `n` of the items, the same ones for the same pair: those whose key, mixed with the pair's, falls lowest. */
function spread(items: readonly Item[], at: string, n: number): Item[] {
  if (items.length <= n) return items.slice();
  const mix = hashOf(at), limit = (n / items.length) * 2 ** 32;
  return items.filter((item) => (Math.imul(keyOf(item) ^ mix, 2654435761) >>> 0) < limit);
}

function candidates(ix: DataIndex, sit: Situation, top: 1 | 2, on?: Stages): Cand[] {
  const t = tableOf(ix), key = `${sit}:${top}:${on ? normStages(on).join(",") : ""}`, hit = t.bySit.get(key);
  if (hit) return hit;
  const rule = SITUATIONS[sit], out: Cand[] = [];
  for (const pair of t.pairs) {
    if (!matches(rule, pair) || (on && !(catOpen(ix.CAT[pair.r], on) && catOpen(ix.CAT[pair.p], on)))) continue;
    const items = pair.cells[rule.cell].filter((item) => !item.ne && !item.nosubject && levelOf(pair, item) <= top && (!on || itemOn(ix, item, pair.r, pair.p, on)));
    for (const item of spread(items, `${pair.r}|${pair.p}`, SUBJECTS_PER_PAIR)) out.push({ pair, item, links: linksOf(t, pair, item, rule), level: levelOf(pair, item) });
  }
  t.bySit.set(key, out);
  return out;
}

const weightOf = (links: number) => (1 + links) ** 2; // the more links, the likelier: the absurd ones are rare, not gone
function groupsOf(cands: readonly Cand[]): Group[] {
  const by = new Map<PairInfo, Cand[]>();
  for (const c of cands) { const g = by.get(c.pair); if (g) g.push(c); else by.set(c.pair, [c]); }
  return [...by].map(([pair, cs]) => ({ pair, cands: cs, mean: cs.reduce((s, c) => s + weightOf(c.links), 0) / cs.length }));
}
function viewOf(ix: DataIndex, sit: Situation, top: 1 | 2, on?: Stages): View {
  const t = tableOf(ix), key = `${sit}:${top}:${on ? normStages(on).join(",") : ""}`, hit = t.views.get(key);
  if (hit) return hit;
  const all = candidates(ix, sit, top, on);
  // at least one link at level 1, two at level 2 (the course's terms are easier to confuse, so they are held to more sense)
  const v: View = {
    all: groupsOf(all), zero: groupsOf(all.filter((c) => c.links === 0)), some: groupsOf(all.filter((c) => c.links > 0)),
    linked: groupsOf(all.filter((c) => c.links >= (c.level === 1 ? 1 : 2))),
  };
  t.views.set(key, v);
  return v;
}

/** The pairs of categories (as "reason>predicate") whose pervasion the term data proves but an item contradicts. Empty when the data agrees with itself. */
export const pervasionConflicts = (ix: DataIndex): string[] => tableOf(ix).conflicts.slice();

/** One of the three checks: whether it holds, and the sentence that shows it. */
export interface Check { ok: boolean; line: string }

/** A syllogism to answer: what it says, what is right, and why, so that it can be shown and graded without the data. */
export interface Syllogism {
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
  /** a thing that is the reason and is not the predicate, when the pervasion fails: kept for the tutor's explanation, the result does not show it */
  witness?: string;
}

const is = (yes: boolean, phrase: string) => (yes ? "is " : "is not ") + phrase;

// A term as the practice words it where it has a category ("a sound" for Sound source, "impermanent" for Functional thing), else as a term.
function termWord(ix: DataIndex, t: string): string {
  const cat = Object.values(ix.CAT).find((c) => c.kind === "dudra" && c.term === t && hasPhrases(ix, c.id));
  return cat ? phrasesOf(ix, cat.id)[0] : termPhrase(t);
}

function proofOfE(ix: DataIndex, item: Item, r: string, reason: string, yes: boolean): string {
  const base = `${cap(item.n)} ${is(yes, reason)}.`;
  if (yes) return base;
  // the lowest class of the subject that excludes a class of the reason says why not: "... is a form, and whatever is a memory is a consciousness, but nothing is both."
  const rc = catChain(ix, ix.CAT[r]);
  for (const x of upChain(ix, item.t)) {
    const y = rc.find((c) => excludes(ix, x, c));
    if (y) {
      const xw = termWord(ix, x), yw = termWord(ix, y);
      // where the excluded class is worded as the reason itself, "whatever is a color is a color" says nothing
      return yw === reason ? `${base} ${cap(item.n)} is ${xw}, and nothing is both ${xw} and ${reason}.`
        : `${base} ${cap(item.n)} is ${xw}, and whatever is ${reason} is ${yw}, but nothing is both.`;
    }
  }
  return base;
}

function proofOfV(ix: DataIndex, pair: PairInfo, reason: string, predicate: string): string {
  const every = `Whatever ${is(true, reason)} ${is(true, predicate)}`;
  if (pair.holds?.how === "same") return `${every}: these two name the same class.`;
  if (pair.holds?.how === "stated") return `${every}.`;
  if (pair.holds) {
    // the steps up the chain, from the reason's class (a Dudra reason is already that class) to the predicate's
    const up = pair.holds.steps.slice(ix.CAT[pair.r].kind === "dudra" ? 1 : 0);
    if (!up.length) return `${every}: these two name the same class.`;
    return up.length === 1 ? `${every}.` : `${every}, since it is ${up.map((t) => termWord(ix, t)).join(", which is ")}.`;
  }
  // the class's phrase; why it fails (a counter-example, an opposite pervasion) is for the tutor's explanation, not for every result
  return `Just because it is ${reason}, doesn't necessarily mean that it is ${predicate}.`;
}

function phrasesFor(ix: DataIndex, pair: PairInfo, rng: Rng): [string, string] {
  const rs = phrasesOf(ix, pair.r), ps = phrasesOf(ix, pair.p);
  if (pair.r === pair.p) {
    const i = Math.floor(rng() * rs.length);
    let j = Math.floor(rng() * (rs.length - 1));
    if (j >= i) j++;
    return [rs[i], rs[j]]; // the reason may not be the predicate (the same label twice is never drawn)
  }
  return [rs[Math.floor(rng() * rs.length)], ps[Math.floor(rng() * ps.length)]];
}

function make(ix: DataIndex, c: Cand, sit: Situation, rng: Rng): Syllogism {
  const { pair, item } = c, rule = SITUATIONS[sit];
  const [reason, first] = phrasesFor(ix, pair, rng);
  // two categories that share a phrase would give "it is X because it is X"
  const predicate = reason === first && pair.r !== pair.p ? phrasesOf(ix, pair.p).find((x) => x !== reason) || first : first;
  const others = pair.holds ? [] : pair.cells.anb.filter((i) => !i.ne && i !== item);
  const pool = others.length ? others : pair.cells.anb.filter((i) => !i.ne);
  const witness = pair.holds || !pool.length ? undefined : pool[Math.floor(rng() * pool.length)].n;
  const pervasion: Pervasion = pair.holds ? "holds" : pair.opposite ? "opposite" : "fails";
  return {
    id: `${pair.r}|${pair.p}|${item.n}`, subject: item.n, predicate, reason, catR: pair.r, catP: pair.p,
    situation: sit, answer: rule.answer, pervasion, level: c.level, links: c.links, witness,
    checks: {
      e: { ok: rule.e, line: proofOfE(ix, item, pair.r, reason, rule.e) },
      v: { ok: !!pair.holds, line: proofOfV(ix, pair, reason, predicate) },
      t: { ok: rule.t, line: `${cap(item.n)} ${is(rule.t, predicate)}.` },
    },
  };
}

/** What the data says about the syllogism of this subject (an item's name), reason and predicate (category ids), or null when the data cannot settle it. */
export function syllogismOf(ix: DataIndex, subject: string, catR: string, catP: string, rng: Rng = Math.random): Syllogism | null {
  const t = tableOf(ix), pair = t.pairs.find((x) => x.r === catR && x.p === catP), item = ix.DATA.items.find((i) => i.n === subject);
  if (!pair || !item || item.ne) return null;
  const cell = (["both", "anb", "bna", "nei"] as const).find((k) => pair.cells[k].includes(item));
  const sit = SIT_IDS.find((s) => { const rule = SITUATIONS[s]; return rule.cell === cell && matches(rule, pair); });
  return sit ? make(ix, { pair, item, links: linksOf(t, pair, item, SITUATIONS[sit]), level: levelOf(pair, item) }, sit, rng) : null;
}

// ---- wording ----

/** A syllogism as it is said, in pieces: plain text and the three parts that the page can show apart. */
export type Piece = string | { part: "subject" | "predicate" | "reason"; text: string };
const subj = (c: Syllogism): Piece => ({ part: "subject", text: c.subject });
const pred = (c: Syllogism): Piece => ({ part: "predicate", text: c.predicate });
const reas = (c: Syllogism): Piece => ({ part: "reason", text: c.reason });
/** The ways to say a syllogism: the class's "Take X. It follows it is P because it is R." and the formal one. */
const PIECES = {
  take: (c: Syllogism): Piece[] => ["Take ", subj(c), ". It follows it is ", pred(c), " because it is ", reas(c), "."],
  formal: (c: Syllogism): Piece[] => ["It follows that the subject, ", subj(c), ", is ", pred(c), " because of being ", reas(c), "."],
};
export type Wording = keyof typeof PIECES;
const joined = (ps: Piece[]) => ps.map((x) => (typeof x === "string" ? x : x.text)).join("");
export const WORDINGS = {
  take: (c: Syllogism) => joined(PIECES.take(c)),
  formal: (c: Syllogism) => joined(PIECES.formal(c)),
} as const;
/** The syllogism as a sentence, in one of the wordings (the class's by default). */
export const syllogismText = (c: Syllogism, wording: Wording = "take"): string => WORDINGS[wording](c);
/** The same sentence in pieces, so that a page can set the subject, the predicate and the reason apart. */
export const syllogismPieces = (c: Syllogism, wording: Wording = "take"): Piece[] => PIECES[wording](c);

// ---- grading ----

/** The result of an answer. A reply that finds a real fault but not the one to name first (the reason, when both fail) is wrong all the same, and says so (`missedPoint`). */
export interface SyllogismResult {
  grade: "ok" | "bad";
  correct: boolean;
  /** the reply that was given; null when the time ran out first (Blitz) */
  said: Reply | null;
  expected: Reply;
  /** the learner named a fault that is there, but not the first one to name */
  missedPoint: boolean;
  /** one sentence that says what was mixed up; empty for a right answer */
  confusion: string;
}

function confusionOf(c: Syllogism, said: Reply): string {
  const S = cap(c.subject), R = c.reason, P = c.predicate, every = `whatever is ${R} is ${P}`;
  const rule = SITUATIONS[c.situation];
  if (c.answer === "accept") {
    return said === "reason" ? `${S} is ${R} and ${every}, so there is nothing to deny: the syllogism stands.`
      : `${cap(every)}, so the pervasion holds.`;
  }
  if (c.answer === "pervasion") {
    return said === "accept"
      ? (rule.t ? `You accepted because the thesis is true, but the reason has to prove it, and it is false that ${every}.`
        : `${S} is ${R}, but it is false that ${every}, so the reason does not prove the thesis.`)
      : `${S} is ${R}, so the reason is established; what fails is the step from ${R} to ${P}.`;
  }
  if (said === "accept") {
    return rule.t ? `You accepted because the thesis is true, but the reason has to prove it, and ${c.subject} is not ${R}.`
      : `${S} is not ${R}, so the reason is not established.`;
  }
  if (c.checks.v.ok) return `${cap(every)}, so the pervasion holds; the trouble is that ${c.subject} is not ${R}.`;
  return `You are not wrong that the pervasion fails, but you missed the point: the reason comes first, and ${c.subject} is not ${R}.`;
}

/** Grades a reply to a syllogism. Needs no data: the syllogism carries its own proofs. */
export function gradeSyllogism(c: Syllogism, said: Reply): SyllogismResult {
  const correct = said === c.answer;
  return {
    grade: correct ? "ok" : "bad", correct, said, expected: c.answer,
    missedPoint: !correct && c.answer === "reason" && said === "pervasion" && !c.checks.v.ok,
    confusion: correct ? "" : confusionOf(c, said),
  };
}

/** The result when the time runs out with no reply (Blitz): wrong, and the right reply is named; nothing was mixed up, so there is nothing to say about it. */
export function gradeTimeout(c: Syllogism): SyllogismResult {
  return { grade: "bad", correct: false, said: null, expected: c.answer, missedPoint: false, confusion: "" };
}

/** What the learner's counter-example (a thing that is the reason and is not the predicate) comes to: "ok", "bad", or "cmp" when the data cannot place it. */
export interface ExampleVerdict { v: "ok" | "bad" | "cmp" | "self"; line: string }

/**
 * Grades a counter-example to the pervasion: it has to be the reason without being the predicate. A thing the data does not know, or cannot use for these two categories,
 * is not checked. The subject itself is "self": it may be the reason without being the predicate, but it is on the card already, so it is not taken as an answer (the page
 * asks for another thing and grades nothing).
 */
export function gradeExample(ix: DataIndex, c: Syllogism, text: string): ExampleVerdict {
  const t = text.trim().replace(/[.!]+$/, "");
  const it = t ? matchItem(ix, t, FEATURE.has(c.catR) || FEATURE.has(c.catP)) : null;
  if (it && it.n === c.subject) return { v: "self", line: `That is the subject itself. Name another thing that is ${c.reason} and is not ${c.predicate}.` };
  // a thing whose name leaves the reason or the predicate open ("a car" for black things) is asked to be named, as in the pairs (vague.ts): the reason yes, the predicate no
  const vague = it ? vagueVerdict(ix, it, t, [c.catR, c.catP], "anb", null, [c.reason, c.predicate]) : null;
  if (vague) return { v: vague.v, line: vague.msg[1] };
  if (!it || !inUniverse(ix, it, c.catR, c.catP)) return { v: "cmp", line: `Not checked: the page does not know ${t || "that"} well enough to say.` };
  // the thing as the data names it, not as it was typed ("red balls" is "a red ball"); the one thing said in the second person ("you") takes "are"
  const name = cap(it.n), be = it.nosubject ? "are" : "is", it_ = it.nosubject ? "you" : "it", r = it.c.includes(c.catR), p = it.c.includes(c.catP);
  if (r && !p) return { v: "ok", line: `${name} ${be} ${c.reason} and ${be} not ${c.predicate}, so there is no pervasion.` };
  if (r) return { v: "bad", line: `${name} ${be} ${c.reason}, but ${it_} ${be} also ${c.predicate}, so ${it_} ${be} no counter-example.` };
  return { v: "bad", line: `${name} ${be} not ${c.reason}, so ${it_} cannot show that being ${c.reason} is not enough for being ${c.predicate}.` };
}

// ---- the draw ----

/** What the draw reads from an earlier answer: a history entry (`catA` is the reason's category, `catB` the predicate's) with the reply that was right and the situation. */
export interface SyllogismHistory extends HistoryEntry {
  answer?: Reply;
  situation?: Situation;
}
export interface SyllogismDraw {
  /** the earlier answers, oldest first */
  hist: readonly SyllogismHistory[];
  /** ids of the syllogisms drawn lately; the draw appends to it and keeps the last RECENT_MAX */
  recent: string[];
  /** the highest level to draw from: 1 everyday things and properties only, 2 also the terms of the course; none: the stages' (`levelAt`), else 2 */
  level?: 1 | 2;
  /**
   * the stages the learner draws from (stages.ts): the reason and the predicate are categories open at the highest, and the subject a thing
   * of a stage that is on (a person or what does not exist with a physical category only from the hold's stage); none: every syllogism.
   * Stages that can draw nothing draw as if there were none.
   */
  stages?: Stages;
  /** the Dudra categories whose term the learner has not met yet (intro.ts): a reason or predicate among them waits, unless the situation has nothing else */
  unmet?: Unmet;
  /**
   * the new terms of the highest stage whose last answer is not right yet (intro.ts, openTerms): `newShare` of the syllogisms (half when absent) have one of
   * them as the reason or the predicate, with the course's terms even where the rest is everyday (`levelAt`), while any can be drawn. Not with `level` 1.
   */
  open?: ReadonlySet<string>;
  newShare?: number;
  rng?: Rng;
}

/** The share of syllogisms drawn with nothing linking their parts, as light relief (when the data has such ones). */
export const RELIEF = 0.1;

/** The stages up to which a syllogism keeps to everyday reasons and predicates: the categories of form are new there, and the course's terms come from the established bases. */
export const EVERYDAY_STAGES = 3;
/** The level of the syllogisms for a learner with these stages on: everyday (1) while the highest is at most `EVERYDAY_STAGES`, else with the course's terms (2). */
export const levelAt = (on: Stages): 1 | 2 => (topStage(on) <= EVERYDAY_STAGES ? 1 : 2);

/** The syllogism to practice next. See the note on the draw: the answer, then the situation, then the triple by its links. */
export function drawSyllogism(ix: DataIndex, st: SyllogismDraw): Syllogism {
  const rng = st.rng || Math.random, hist = st.hist;
  // a share of the questions asks one of the stage's open terms, which needs the course's terms where the stage is still everyday; if no syllogism has one, the draw is the plain one
  const plan = (open?: ReadonlySet<string>) => {
    const top = open ? 2 : st.level ?? (st.stages ? levelAt(st.stages) : 2);
    const staged = st.stages && SIT_IDS.some((s) => viewOf(ix, s, top, st.stages).all.length > 0) ? st.stages : undefined;
    const asks = (g: Group) => !open || open.has(g.pair.r) || open.has(g.pair.p);
    return { top, staged, asks, usable: (s: Situation) => viewOf(ix, s, top, staged).all.some(asks) };
  };
  const wants = st.open?.size && st.level !== 1 && rng() < (st.newShare ?? 0.5) ? st.open : undefined;
  let p = plan(wants);
  if (wants && !SIT_IDS.some(p.usable)) p = plan();
  const { top, staged, asks, usable } = p;
  // light relief: now and then a syllogism with nothing linking its parts at all (the reason is not established, and the pervasion fails as well)
  const zero = rng() < RELIEF ? viewOf(ix, 8, top, staged).zero.filter(asks) : [];
  let sit: Situation = 8, pool = zero;
  if (!zero.length) {
    // the answer: all three alike, the one asked lately less, the one missed lately more
    const aw: Record<Reply, number> = { accept: 1, reason: 1, pervasion: 1 };
    for (const h of hist.slice(-6)) if (h.answer) aw[h.answer] = Math.max(0.15, aw[h.answer] * 0.45);
    for (const h of hist.slice(-30)) if (h.answer && isMiss(h)) aw[h.answer] *= 1.4;
    const replies = REPLIES.filter((a) => SIT_IDS.some((s) => SITUATIONS[s].answer === a && usable(s)));
    if (!replies.length) throw new Error("no syllogism to draw from");
    const answer = chooseWeighted(replies, (a) => aw[a], rng);
    sit = chooseWeighted(SIT_IDS.filter((s) => SITUATIONS[s].answer === answer && usable(s)), (s) => SITUATIONS[s].weight, rng);
    const v = viewOf(ix, sit, top, staged), linked = v.linked.filter(asks), some = v.some.filter(asks);
    pool = linked.length ? linked : some.length ? some : v.all.filter(asks);
  }
  if (st.unmet?.size) {
    const met = pool.filter((g) => !st.unmet!.has(g.pair.r) && !st.unmet!.has(g.pair.p));
    if (met.length) pool = met;
  }

  const weak: Record<string, number> = Object.create(null);
  for (const h of hist.slice(-40)) {
    if (!isMiss(h)) continue;
    if (h.catA) weak[h.catA] = (weak[h.catA] || 0) + 1;
    if (h.catB) weak[h.catB] = (weak[h.catB] || 0) + 1;
  }
  const seen = new Set(st.recent), seenPair = new Set(st.recent.map((id) => id.split("|").slice(0, 2).join("|")));
  // the one just shown is not drawn again, when the pool has another
  const last = st.recent[st.recent.length - 1];
  const lastOf = (g: Group) => !!last && last.startsWith(`${g.pair.r}|${g.pair.p}|`);
  const others = last ? pool.map((g) => (lastOf(g) ? { ...g, cands: g.cands.filter((c) => `${g.pair.r}|${g.pair.p}|${c.item.n}` !== last) } : g)).filter((g) => g.cands.length) : pool;
  // the pair of categories first, then a subject, so that a pair with many subjects does not crowd out the others
  const group = chooseWeighted(others.length ? others : pool, (g) => {
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
