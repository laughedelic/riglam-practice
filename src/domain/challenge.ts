// A challenge: a task given to everyone at once, such as two phenomena to compare or a syllogism to answer that a class set. It is a short run of
// given questions (given.ts) in the exercises the app has, with a title and a note. There is one at a time, and the next one takes its place.
//
// This is the challenge as a document and what follows from it: reading one that was written or stored (`checkChallenge`, which says what is wrong
// with it), making its questions (`challengeQuestion`: the same ones for everybody, since the random numbers come from its id), the line that names
// a question before it is opened, and the record of how each went on a device (`ChallengeRecord`): which question comes next, and where the
// challenge stands. A challenge asks whatever the data has, whatever the learner's stages: its answers stand apart from the progression.
// Pure functions of the data, like the rest of the domain.
import type { DataIndex } from "../ai-shared/lookup";
import { REL, isNeg } from "../ai-shared/relations";
import { FIND_RELS } from "./find";
import { givenQuestion } from "./given";
import type { Given, GivenOptions, GivenPlaceOptions, GivenQuestion } from "./given";
import { syllogismText } from "./syllogism";
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
  items: Given[];
}

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
  const list = Array.isArray(raw.items) ? raw.items : null, items: Given[] = [];
  if (!list || !list.length || list.length > CHALLENGE_MAX) problems.push("items: one to " + CHALLENGE_MAX + " questions.");
  else list.forEach((it, i) => { const g = givenOf(it); if (g) items.push(g); else problems.push("items: question " + (i + 1) + " is not a question of an exercise."); });
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
  return g ? givenQuestion(ix, g, { ...o, rng: seeded(ch.id + "#" + i) }) : null;
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
