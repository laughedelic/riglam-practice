// A challenge: a task given to everyone at once, such as two phenomena to compare or a syllogism to answer that a class set. It is a short run of
// given questions (given.ts) in the exercises the app has, with a title and a note. There is one at a time, and the next one takes its place.
//
// This is the challenge as a document and what follows from it: reading one that was written or stored (`checkChallenge`, which says what is wrong
// with it), making its questions (`challengeQuestion`: the same ones for everybody, since the random numbers come from its id), the line that names
// a question before it is opened, and the record of how each went on a device (`ChallengeRecord`): which question comes next, and where the
// challenge stands. A challenge asks whatever the data has, whatever the learner's stages: its answers stand apart from the progression.
//
// A task often steps outside the data: two phenomena the app has no category for, a syllogism it cannot settle. Such a question brings its answer
// with it (`CarriedPair`, `CarriedSyllogism`): the relation with an example for each case, or the three checks of the syllogism, written from the
// reference when the challenge is. The question is then made from what it carries and is asked like any other: the relation, the empty cases
// and the reply are checked against it, and an example the learner writes is left to the tutor, who is told the answer (ai-shared/card.ts).
// What the data does know is written by its categories and is checked by the data.
// Pure functions of the data, like the rest of the domain.
import type { DataIndex } from "../ai-shared/lookup";
import { CELLS, REL, isNeg } from "../ai-shared/relations";
import type { CellId, RelKey } from "../ai-shared/relations";
import { FIND_RELS } from "./find";
import { givenQuestion } from "./given";
import type { Given, GivenOptions, GivenPlaceOptions, GivenQuestion } from "./given";
import { SITUATIONS, syllogismText } from "./syllogism";
import type { Pervasion, Situation, Syllogism } from "./syllogism";
import type { Pair } from "./types";
import { cap } from "./util";

/** The most questions a challenge holds: it is a task for a few minutes. */
export const CHALLENGE_MAX = 12;
/** The longest title and note, in characters. */
export const CHALLENGE_TITLE_MAX = 60;
export const CHALLENGE_NOTE_MAX = 400;

/** A challenge as it is written and kept. */
export interface Challenge {
  /** names this challenge: letters, digits, dots, dashes. Another id is another challenge, and the record of the one before is dropped */
  id: string;
  /** the day it was given, YYYY-MM-DD */
  date: string;
  title: string;
  /** a sentence or two in the giver's words; "" when there is none */
  note: string;
  /** its questions, in the order they are asked */
  items: ChallengeItem[];
}

/** A question of a challenge: one the data makes from its categories and things (`Given`), or one that brings its answer. */
export type ChallengeItem = Given | CarriedPair | CarriedSyllogism;
/** One side of a pair the data does not have, in the task's words: the plural it is shown under ("birds") and what one of them is called ("a bird"). */
export interface CarriedTerm { many: string; one: string }
/** A pair for Relations or Pervasions that the data does not have, with its answer. */
export interface CarriedPair {
  exercise: "practice" | "debate";
  /** A, then B */
  terms: readonly [CarriedTerm, CarriedTerm];
  answer: {
    relation: RelKey;
    /** an example for each case the relation has, Neither among them (what does not exist counts there) */
    ex: Partial<Record<CellId, string>>;
    /** why a case is empty, where the plain sentence is not enough */
    why?: Partial<Record<CellId, string>>;
    /** a sentence on the pair for the result; the plain one of its relation when left out */
    note?: string;
  };
}
/** A syllogism the data cannot settle, with its answer: what it says, and whether each of the three checks holds. */
export interface CarriedSyllogism {
  exercise: "syllogism";
  /** the subject as it is taken ("a bat"), the predicate after "it is" ("a bird"), the reason after "because it is" ("something that flies") */
  says: { subject: string; predicate: string; reason: string };
  answer: {
    /** the subject is the reason */
    reason: boolean;
    /** whatever is the reason is the predicate; "opposite": nothing that is the reason is the predicate */
    pervasion: boolean | "opposite";
    /** the subject is the predicate */
    thesis: boolean;
    /** the sentence the result shows for a check, where the plain one is not enough */
    lines?: { reason?: string; pervasion?: string; thesis?: string };
    /** a thing that is the reason and is not the predicate: the counter-example of a pervasion that fails, which the tutor names */
    witness?: string;
  };
}
/** Whether a question brings its answer. */
export const isCarried = (g: ChallengeItem): g is CarriedPair | CarriedSyllogism => "answer" in g;
/** The longest term, example or part of a syllogism a question carries, and the longest sentence, in characters. */
export const CARRIED_WORDS_MAX = 120;
export const CARRIED_LINE_MAX = 300;

const str = (v: unknown): v is string => typeof v === "string";
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const strs = (v: unknown): v is string[] => Array.isArray(v) && v.every(str);
const label = (v: unknown): v is string | null | undefined => v === undefined || v === null || str(v);
const realDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d) && !Number.isNaN(Date.parse(d + "T00:00:00Z")) && new Date(d + "T00:00:00Z").toISOString().slice(0, 10) === d;

/** A question as it is written, with nothing in it but what its exercise reads; null when it is not one. */
function givenOf(raw: unknown): Given | null {
  if (!obj(raw)) return null;
  switch (raw.exercise) {
    case "practice": case "debate": {
      if (!str(raw.a) || !str(raw.b)) return null;
      const l = raw.labels;
      if (l !== undefined && !(Array.isArray(l) && l.length <= 2 && l.every(label))) return null;
      const neg = raw.neg === undefined ? undefined : isNeg(raw.neg) ? raw.neg : null;
      if (neg === null) return null;
      return { exercise: raw.exercise, a: raw.a, b: raw.b, ...(l ? { labels: [l[0] ?? null, l[1] ?? null] as const } : {}), ...(neg ? { neg } : {}) };
    }
    case "find": {
      const relation = FIND_RELS.find((r) => r === raw.relation);
      return relation ? { exercise: "find", relation } : null;
    }
    case "syllogism":
      return str(raw.subject) && str(raw.reason) && str(raw.predicate) ? { exercise: "syllogism", subject: raw.subject, reason: raw.reason, predicate: raw.predicate } : null;
    case "categories": {
      const cats = raw.cats === undefined ? undefined : strs(raw.cats) ? raw.cats : null;
      if (!str(raw.thing) || cats === null) return null;
      if (raw.size !== undefined && !(Number.isInteger(raw.size) && (raw.size as number) >= 2 && (raw.size as number) <= 8)) return null;
      return { exercise: "categories", thing: raw.thing, ...(cats ? { cats } : {}), ...(raw.only === true ? { only: true } : {}), ...(raw.size !== undefined ? { size: raw.size as number } : {}) };
    }
    case "instance":
      return strs(raw.cats) ? { exercise: "instance", cats: raw.cats } : null;
    default: return null;
  }
}

const CELL_SAID: Record<CellId, string> = { both: "both", anb: "A not B", bna: "B not A", nei: "neither" };
/** Text of at most `max` characters, trimmed; "" when it is not that. */
const words = (v: unknown, max: number): string => { const t = str(v) ? v.trim() : ""; return t.length <= max ? t : ""; };
/** The sentences written by case, each a text of some length; null when one is not. Cases it does not know are left out. */
function byCell(raw: unknown, max: number): Partial<Record<CellId, string>> | null {
  if (raw === undefined) return {};
  if (!obj(raw)) return null;
  const out: Partial<Record<CellId, string>> = {};
  for (const c of CELLS) {
    if (raw[c] === undefined || raw[c] === null || raw[c] === "") continue;
    const t = words(raw[c], max);
    if (!t) return null;
    out[c] = t;
  }
  return out;
}

/**
 * A pair that brings its answer, as it is written: the pair, or what is wrong with it in words. The answer has to hang together: an example for
 * every case the relation has (Neither too: what does not exist counts there), none for a case it leaves empty.
 */
function carriedPairOf(raw: Record<string, unknown>): CarriedPair | string {
  const exercise = raw.exercise === "practice" || raw.exercise === "debate" ? raw.exercise : null;
  if (!exercise) return "an answer is carried by a pair (practice, debate) or a syllogism";
  const ts = Array.isArray(raw.terms) && raw.terms.length === 2 ? raw.terms.map((t) => (obj(t) ? { many: words(t.many, CARRIED_WORDS_MAX), one: words(t.one, CARRIED_WORDS_MAX) } : { many: "", one: "" })) : null;
  if (!ts || ts.some((t) => !t.many || !t.one)) return "terms: two sides, each with `many` (\"birds\") and `one` (\"a bird\")";
  if (ts[0].many === ts[1].many) return "terms: the two sides are the same";
  const a = obj(raw.answer) ? raw.answer : null, relation = a ? FIND_RELS.find((r) => r === a.relation) : undefined;
  if (!a || !relation) return "answer.relation: one of " + FIND_RELS.join(", ");
  const ex = byCell(a.ex, CARRIED_WORDS_MAX), why = byCell(a.why, CARRIED_LINE_MAX), note = a.note === undefined ? "" : words(a.note, CARRIED_LINE_MAX);
  if (!ex) return "answer.ex: an example by case (both, anb, bna, nei), each of at most " + CARRIED_WORDS_MAX + " characters";
  if (!why) return "answer.why: a sentence by case, each of at most " + CARRIED_LINE_MAX + " characters";
  if (a.note !== undefined && !note) return "answer.note: a sentence of at most " + CARRIED_LINE_MAX + " characters";
  for (const c of CELLS) {
    const empty = REL[relation].empty.includes(c);
    if (empty && ex[c]) return "answer.ex: " + REL[relation].name + " leaves " + CELL_SAID[c] + " empty, and it has an example";
    if (!empty && !ex[c]) return "answer.ex: " + REL[relation].name + " has something that is " + CELL_SAID[c] + ", and no example is given" + (c === "nei" ? " (what does not exist counts, such as the horn of a rabbit)" : "");
    if (!empty && why[c]) return "answer.why: " + CELL_SAID[c] + " is not empty";
  }
  return { exercise, terms: [ts[0], ts[1]], answer: { relation, ex, ...(Object.keys(why).length ? { why } : {}), ...(note ? { note } : {}) } };
}

/**
 * A syllogism that brings its answer, as it is written: the syllogism, or what is wrong with it in words. The three checks have to hang together
 * (a subject that is the reason is the predicate when the pervasion holds, and is not when it is opposite), and a pervasion that fails names its
 * counter-example.
 */
function carriedSyllogismOf(raw: Record<string, unknown>): CarriedSyllogism | string {
  const says = obj(raw.says) ? { subject: words(raw.says.subject, CARRIED_WORDS_MAX), predicate: words(raw.says.predicate, CARRIED_WORDS_MAX), reason: words(raw.says.reason, CARRIED_WORDS_MAX) } : null;
  if (!says || !says.subject || !says.predicate || !says.reason) return "says: the subject, the predicate (after \"it is\") and the reason (after \"because it is\")";
  const a = obj(raw.answer) ? raw.answer : null;
  if (!a || typeof a.reason !== "boolean" || typeof a.thesis !== "boolean" || !(typeof a.pervasion === "boolean" || a.pervasion === "opposite")) return "answer: reason and thesis (true or false) and pervasion (true, false or \"opposite\")";
  const reason = a.reason, thesis = a.thesis, pervasion = a.pervasion;
  if (reason && pervasion === true && !thesis) return "answer: the subject is the reason and the pervasion holds, so the thesis cannot be false";
  if (reason && pervasion === "opposite" && thesis) return "answer: the subject is the reason and nothing that is the reason is the predicate, so the thesis cannot be true";
  const lines: { reason?: string; pervasion?: string; thesis?: string } = {};
  if (a.lines !== undefined) {
    if (!obj(a.lines)) return "answer.lines: a sentence for reason, pervasion or thesis";
    for (const k of ["reason", "pervasion", "thesis"] as const) {
      if (a.lines[k] === undefined) continue;
      const t = words(a.lines[k], CARRIED_LINE_MAX);
      if (!t) return "answer.lines." + k + ": a sentence of at most " + CARRIED_LINE_MAX + " characters";
      lines[k] = t;
    }
  }
  const witness = a.witness === undefined ? "" : words(a.witness, CARRIED_WORDS_MAX);
  if (a.witness !== undefined && !witness) return "answer.witness: a thing, in at most " + CARRIED_WORDS_MAX + " characters";
  if (pervasion === true && witness) return "answer.witness: the pervasion holds, so nothing is the reason without being the predicate";
  if (pervasion === false && !witness) return "answer.witness: a pervasion that fails names a thing that is the reason and is not the predicate";
  return { exercise: "syllogism", says, answer: { reason, pervasion, thesis, ...(Object.keys(lines).length ? { lines } : {}), ...(witness ? { witness } : {}) } };
}

/** A question as it is written: one of an exercise, or one that brings its answer (it has `answer`); else what is wrong with it. */
function itemOf(raw: unknown): ChallengeItem | string {
  if (obj(raw) && raw.answer !== undefined) return raw.exercise === "syllogism" ? carriedSyllogismOf(raw) : carriedPairOf(raw);
  return givenOf(raw) ?? "is not a question of an exercise";
}

/**
 * Reads a challenge as it was written or stored. `problems` says in words what keeps it from being one (empty: none), each naming the field or the
 * question, counted from 1; `challenge` is the challenge when there are none. Fields it does not know are left out, so a later format's extras do no harm.
 * Whether the data can make its questions is another matter (`challengeQuestion`).
 */
export function checkChallenge(raw: unknown): { challenge: Challenge | null; problems: string[] } {
  if (!obj(raw)) return { challenge: null, problems: ["It is not an object."] };
  const problems: string[] = [];
  const id = str(raw.id) ? raw.id : "", date = str(raw.date) ? raw.date : "", title = str(raw.title) ? raw.title.trim() : "", note = raw.note === undefined ? "" : str(raw.note) ? raw.note.trim() : null;
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id)) problems.push("id: a name of letters, digits, dots and dashes, at most 64.");
  if (!realDay(date)) problems.push("date: a day as YYYY-MM-DD.");
  if (!title || title.length > CHALLENGE_TITLE_MAX) problems.push("title: a few words, at most " + CHALLENGE_TITLE_MAX + " characters.");
  if (note === null || note.length > CHALLENGE_NOTE_MAX) problems.push("note: text of at most " + CHALLENGE_NOTE_MAX + " characters, or left out.");
  const list = Array.isArray(raw.items) ? raw.items : null, items: ChallengeItem[] = [];
  if (!list || !list.length || list.length > CHALLENGE_MAX) problems.push("items: one to " + CHALLENGE_MAX + " questions.");
  else list.forEach((it, i) => { const g = itemOf(it); if (typeof g === "string") problems.push("items: question " + (i + 1) + (g.startsWith("is ") ? " " : ": ") + g + "."); else items.push(g); });
  return problems.length ? { challenge: null, problems } : { challenge: { id, date, title, note: note ?? "", items }, problems };
}
/** The challenge in what was written or stored, or null when it is not one (`checkChallenge`). */
export const readChallenge = (raw: unknown): Challenge | null => checkChallenge(raw).challenge;

/** Random numbers that are the same for the same text: everybody gets a challenge's questions in the same words. */
function seeded(text: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  let s = h >>> 0;
  return () => {     // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** What the making of a challenge's question may be told: what a device holds beyond the practice list. The stages and the terms met are not asked. */
export type ChallengeOptions = Pick<GivenOptions, "more" | "brackets" | "now"> & Pick<GivenPlaceOptions, "examples">;

/**
 * The question `i` of the challenge (from 0), as its exercise keeps it, or null when the data cannot make it. It is made without the learner's stages
 * and terms: a challenge asks everybody the same. What is drawn in the making (the label of a side, the rows of Categories) is drawn from the
 * challenge's id and the question's place, so it is the same on every device and every time.
 */
export function challengeQuestion(ix: DataIndex, ch: Challenge, i: number, o: ChallengeOptions = {}): GivenQuestion | null {
  const g = ch.items[i];
  if (!g) return null;
  const rng = seeded(ch.id + "#" + i);
  if (!isCarried(g)) return givenQuestion(ix, g, { ...o, rng });
  // a question that brings its answer needs nothing of the data: every device can ask it
  return g.exercise === "syllogism" ? { exercise: "syllogism", syllogism: carriedSyllogism(g) } : { exercise: g.exercise, pair: carriedPair(g, rng, o.now ?? Date.now) };
}

const quoted = (x: string) => "\u201c" + x + "\u201d";
/** Why a case of a carried pair is empty, in the plain sentence of its relation (the pair's own `why` goes first). */
const WHY_EMPTY: Record<CellId, (a: string, b: string) => string> = {
  both: (a, b) => "Nothing is both " + quoted(a) + " and " + quoted(b) + ".",
  anb: (a, b) => "Whatever falls under " + quoted(a) + " also falls under " + quoted(b) + ".",
  bna: (a, b) => "Whatever falls under " + quoted(b) + " also falls under " + quoted(a) + ".",
  nei: () => "",
};
/** The plain sentence on a carried pair by its relation (the pair's own `note` goes first). */
const NOTE: Record<RelKey, (a: string, b: string) => string> = {
  mi: (a, b) => quoted(cap(a)) + " and " + quoted(b) + " pick out the same things.",
  con: (a, b) => "No common locus: nothing is both " + a + " and " + b + ".",
  "3ab": (a, b) => "Whatever falls under " + quoted(a) + " also falls under " + quoted(b) + ", but not the reverse.",
  "3ba": (a, b) => "Whatever falls under " + quoted(b) + " also falls under " + quoted(a) + ", but not the reverse.",
  "4": (a, b) => cap(a) + " and " + b + " overlap without either containing the other.",
};
/** The pair a carried question is asked as: its two sides under the task's words, with no categories, and the answer it brought (`carried`). */
function carriedPair(g: CarriedPair, rng: () => number, now: () => number): Pair {
  const [A, B] = g.terms, ans = g.answer;
  const ex: Partial<Record<CellId, string | null>> = {}, why: Partial<Record<CellId, string>> = {};
  for (const c of CELLS) {
    ex[c] = ans.ex[c] ?? null;
    if (!ex[c]) why[c] = ans.why?.[c] || WHY_EMPTY[c](A.many, B.many);
  }
  return {
    id: "g-" + now().toString(36) + rng().toString(36).slice(2, 6), a: A.many, b: B.many, catA: null, catB: null, relation: ans.relation, ex, why,
    note: ans.note || NOTE[ans.relation](A.many, B.many), generated: true, carried: true, sing: [A.one, B.one],
  };
}

const isOr = (yes: boolean, phrase: string) => (yes ? "is " : "is not ") + phrase;
/** The syllogism a carried question is asked as: its three checks as they were written, each with its plain sentence where none was given (`carried`). */
function carriedSyllogism(g: CarriedSyllogism): Syllogism {
  const { subject, predicate, reason } = g.says, ans = g.answer, S = cap(subject);
  const holds = ans.pervasion === true, pervasion: Pervasion = holds ? "holds" : ans.pervasion === "opposite" ? "opposite" : "fails";
  // the one of the eight situations that has these three checks (the reader has left out the two that cannot be)
  const situation = (Object.keys(SITUATIONS).map(Number) as Situation[]).find((k) => {
    const r = SITUATIONS[k];
    return r.e === ans.reason && r.t === ans.thesis && (r.v === pervasion || (r.v === "no" && !holds));
  }) ?? 1;
  return {
    id: reason + "|" + predicate + "|" + subject, subject, predicate, reason, catR: "", catP: "", situation, answer: SITUATIONS[situation].answer, pervasion,
    level: 2, links: 0, carried: true, ...(ans.witness ? { witness: ans.witness } : {}),
    checks: {
      e: { ok: ans.reason, line: ans.lines?.reason || S + " " + isOr(ans.reason, reason) + "." },
      v: { ok: holds, line: ans.lines?.pervasion || (holds ? "Whatever is " + reason + " is " + predicate + "." : "Just because it is " + reason + ", doesn't necessarily mean that it is " + predicate + ".") },
      t: { ok: ans.thesis, line: ans.lines?.thesis || S + " " + isOr(ans.thesis, predicate) + "." },
    },
  };
}

/** What names a question on the challenge's page before it is opened: the two terms of a pair, or a line of text. */
export type ItemLine = { pair: readonly [string, string] } | { text: string };
/** The line of a question that was made: the pair's two sides as they are shown, the relation asked for, the syllogism as it is said, the thing, the categories. */
export function itemLine(q: GivenQuestion): ItemLine {
  switch (q.exercise) {
    case "practice": case "debate": return { pair: [q.pair.a, q.pair.b] };
    case "find": return { text: REL[q.relation].name };
    case "syllogism": return { text: syllogismText(q.syllogism) };
    case "categories": return { text: cap(q.place.thing.n) };
    case "instance": return { text: q.instance.labels.join(" · ") };
  }
}

/** The replies of Syllogisms as the app says them. */
const REPLY_SAID: Record<string, string> = { accept: "I accept", reason: "The reason is not established", pervasion: "There is no pervasion" };
/**
 * What the data answers to a question that was made, in a line: for whoever writes a challenge, to check it before it is given out. "" where the
 * question has no one answer (Find a pair: the pair is the learner's own).
 */
export function itemAnswer(q: GivenQuestion): string {
  switch (q.exercise) {
    case "practice": case "debate": return REL[q.pair.relation].name;
    case "find": return "";
    case "syllogism": return REPLY_SAID[q.syllogism.answer] || "";
    case "categories": return q.place.rows.filter((r) => r.answer).map((r) => r.phrase).join(", ") || "none of the rows";
    case "instance": return q.instance.possible ? (q.instance.known.length ? "for example " + q.instance.known.slice(0, 3).join(", ") : "something is in all of them") : "nothing is";
  }
}

/** How a question went, as an answer's grade says it: right, partly right, not right, or right so far with examples still to be checked. */
export type ItemMark = "ok" | "part" | "bad" | "pend";
/** The mark of an answer's grade: one of the four as it is, anything else (an answer nobody could check) as still open. */
export const markOf = (grade: string): ItemMark => (grade === "ok" || grade === "part" || grade === "bad" ? grade : "pend");

/** What a device keeps of the current challenge: whether its page was opened, and how each question went the last time it was answered, by its place. */
export interface ChallengeRecord {
  /** the challenge it is of */
  id: string;
  seen: boolean;
  marks: Record<number, ItemMark>;
}
export const freshRecord = (id: string): ChallengeRecord => ({ id, seen: false, marks: {} });
/** The record kept for this challenge, as it was stored: one of another challenge, or none, starts again; a mark of a question it does not have is dropped. */
export function normRecord(raw: unknown, ch: Challenge): ChallengeRecord {
  if (!obj(raw) || raw.id !== ch.id) return freshRecord(ch.id);
  const marks: Record<number, ItemMark> = {};
  if (obj(raw.marks)) for (const [k, v] of Object.entries(raw.marks)) { const i = Number(k); if (Number.isInteger(i) && i >= 0 && i < ch.items.length && str(v)) marks[i] = markOf(v); }
  return { id: ch.id, seen: raw.seen === true || Object.keys(marks).length > 0, marks };
}
/** The record after question `i` was answered with this grade. */
export const marked = (r: ChallengeRecord, i: number, grade: string): ChallengeRecord => ({ ...r, seen: true, marks: { ...r.marks, [i]: markOf(grade) } });

/** Where a challenge stands on a device: not opened yet, opened with nothing answered, some of it answered, all of it answered. */
export type Standing = "new" | "open" | "under" | "done";
/**
 * Where the challenge stands. `askable`: for each question, whether this device can ask it (`challengeQuestion` made one); those it cannot are not
 * waited for, and their marks do not count.
 */
export function standing(r: ChallengeRecord, askable: readonly boolean[]): Standing {
  const n = askable.filter(Boolean).length, k = askable.filter((a, i) => a && r.marks[i]).length;
  if (!r.seen) return "new";
  if (!k) return "open";
  return k >= n ? "done" : "under";
}
/**
 * The question to ask after question `after` (-1: from the start): the next one this device can ask that has no answer yet; with `again`, the next
 * one it can ask, answered or not. -1 when there is none.
 */
export function nextItem(r: ChallengeRecord, askable: readonly boolean[], after = -1, again = false): number {
  for (let i = after + 1; i < askable.length; i++) if (askable[i] && (again || !r.marks[i])) return i;
  return -1;
}
/** What the station of the challenge's page says, and the question it opens: the first not answered yet, or, once all are answered, the first again. -1: nothing to ask. */
export function stationOf(r: ChallengeRecord, askable: readonly boolean[]): { name: "Start" | "Continue" | "Again"; at: number; again: boolean } {
  const first = nextItem(r, askable), any = Object.keys(r.marks).length > 0;
  if (first >= 0) return { name: any ? "Continue" : "Start", at: first, again: false };
  return { name: "Again", at: nextItem(r, askable, -1, true), again: true };
}
/** The day of a challenge as its page says it: "7 Nov". */
export function dayText(date: string): string {
  const [, m, d] = date.split("-").map(Number);
  return (d || "") + " " + (["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][(m || 1) - 1] || "");
}
