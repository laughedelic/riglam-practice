// Introducing the course's terms (notes: the definition stop). A Dudra category is asked about only after a stop has shown its term and definition;
// everyday categories need none. A new learner meets a few everyday questions first, then the terms come one at a time, a few questions apart, from
// the lowest stage that is on up. The questions answered afterwards grade each term: a box from 1 to 3, up one on a right answer, back to 1 on a
// mistake, and a mistake brings the term's stop back right after the result. A settled term not met for a long time comes back once. This is the
// whole schedule: a record per term (part of the learner's progression, practice/progress.ts), and pure functions of it and the data.
import type { Cat } from "../ai-shared/data";
import type { DataIndex } from "../ai-shared/lookup";
import { catStage, topStage } from "./stages";
import type { Stages } from "./stages";

/** A new learner's first stop comes after this many questions: the first questions are on everyday categories. */
export const FIRST_AFTER = 3;
/** The next new term comes this many questions after the last stop. */
export const SPACING = 3;
/** A stop the learner asked to see again comes back after this many questions. */
export const AGAIN_AFTER = 10;
/** A mistake brings a term's stop back only when its last stop is at least this many questions ago (two mistakes in a row bring it once). */
export const MISS_GAP = 5;
/** The box of a term that holds. */
export const SETTLED = 3;
/** A settled term not met in any question for this many days comes back once. */
export const GAP_DAYS = 14;

/** What the device keeps of one term: its box (1 to 3; absent: not introduced), how often its stop came, and when. */
export interface IntroTerm {
  box: number;
  /** stops shown */
  shows: number;
  /** the question count at its last stop */
  at?: number;
  /** when its last stop came or a question last used it (ISO) */
  seen?: string;
  /** the question count from which its stop comes again, and why */
  due?: number;
  why?: "miss" | "again";
}

/** The device's record: how many questions it has answered since the record began, when the next new term may come, and each term met (by category id). */
export interface Intro {
  n: number;
  next: number;
  terms: Record<string, IntroTerm>;
}

/** Why a stop comes: a new term, a mistake on it, the learner's own ask, or a long time since it was met. */
export type StopWhy = "new" | "miss" | "again" | "gap";
export interface Stop {
  cat: string;
  why: StopWhy;
}

/** A device's record before any question. */
export const freshIntro = (): Intro => ({ n: 0, next: FIRST_AFTER, terms: {} });

/** Whether a category needs its stop before it is asked about: a Dudra category with a term. */
export const needsIntro = (cat: Pick<Cat, "kind" | "term">): boolean => cat.kind === "dudra" && !!cat.term;

/** Whether the category may be asked about: an everyday one always, a Dudra one once its stop has come. */
export const introduced = (intro: Intro, cat: Pick<Cat, "id" | "kind" | "term">): boolean => !needsIntro(cat) || (intro.terms[cat.id]?.box ?? 0) >= 1;

/** The categories whose term opens at the stage, in the course's order (the data's). */
export const stageTerms = (ix: DataIndex, stage: number): string[] => Object.values(ix.CAT).filter((c) => needsIntro(c) && catStage(c) === stage).map((c) => c.id);

/** The Dudra categories open at these stages whose stop has not come yet: they wait out of the questions (domain/stages.ts, catOpen). */
export function unmet(ix: DataIndex, intro: Intro, on: Stages): Set<string> {
  const top = topStage(on), out = new Set<string>();
  for (const c of Object.values(ix.CAT)) if (needsIntro(c) && catStage(c) <= top && !introduced(intro, c)) out.add(c.id);
  return out;
}

/** Whether every term of the stage has had its stop: the next stage is offered only then. */
export const stageMet = (ix: DataIndex, intro: Intro, stage: number): boolean => stageTerms(ix, stage).every((id) => introduced(intro, ix.CAT[id]!));

const DAY = 864e5;

/**
 * The stop that comes before the next question, or null. First a term due again (a mistake before an ask), then the next new term once the spacing
 * allows (the lowest stage first, in the course's order), then a settled term not met for GAP_DAYS. Only terms open at these stages.
 */
export function nextStop(ix: DataIndex, intro: Intro, on: Stages, now: string): Stop | null {
  const top = topStage(on), open = (id: string) => !!ix.CAT[id] && catStage(ix.CAT[id]!) <= top;
  let best: { id: string; t: IntroTerm } | null = null;
  for (const [id, t] of Object.entries(intro.terms)) {
    if (t.due === undefined || t.due > intro.n || !open(id)) continue;
    const rank = (x: IntroTerm) => (x.why === "miss" ? 0 : 1) * 1e9 + (x.due ?? 0);
    if (!best || rank(t) < rank(best.t)) best = { id, t };
  }
  if (best) return { cat: best.id, why: best.t.why === "again" ? "again" : "miss" };
  if (intro.n >= intro.next) {
    for (let s = 1; s <= top; s++) {
      const id = stageTerms(ix, s).find((c) => !introduced(intro, ix.CAT[c]!));
      if (id) return { cat: id, why: "new" };
    }
  }
  if (intro.n < intro.next) return null;
  // after a long break every settled term is due: they come back one at a time, spaced like new terms
  const t0 = Date.parse(now);
  for (const [id, t] of Object.entries(intro.terms)) {
    if (t.box >= SETTLED && open(id) && t.seen && t0 - Date.parse(t.seen) >= GAP_DAYS * DAY) return { cat: id, why: "gap" };
  }
  return null;
}

/** The stop for `cat` has been shown: the term is introduced (box 1 at least), its return is spent, and the next new term waits SPACING questions. */
export function stopShown(intro: Intro, cat: string, now: string): Intro {
  const t = intro.terms[cat];
  const rec: IntroTerm = { box: Math.max(1, t?.box ?? 0), shows: (t?.shows ?? 0) + 1, at: intro.n, seen: now };
  return { ...intro, next: intro.n + SPACING, terms: { ...intro.terms, [cat]: rec } };
}

/** The learner asks to see the term again: its stop comes back after AGAIN_AFTER questions (a mistake before then brings it sooner). */
export function showAgain(intro: Intro, cat: string): Intro {
  const t = intro.terms[cat]; if (!t) return intro;
  return { ...intro, terms: { ...intro.terms, [cat]: { ...t, due: intro.n + AGAIN_AFTER, why: "again" } } };
}

/**
 * A question has been answered: the count goes up, and each introduced term it used is graded. `graded` are the categories with whether the learner
 * was right about each (a category listed twice counts as wrong if either is). Right: one box up. Wrong, unless `misses` is false (an exercise where a
 * mistake is mostly about its form): back to box 1, and its stop comes before the next question if the last one is MISS_GAP questions ago or more.
 */
export function afterQuestion(intro: Intro, graded: readonly { cat: string | null | undefined; ok: boolean }[], now: string, misses = true): Intro {
  const n = intro.n + 1, terms = { ...intro.terms }, ok = new Map<string, boolean>();
  for (const g of graded) if (g.cat) ok.set(g.cat, (ok.get(g.cat) ?? true) && g.ok);
  for (const [cat, right] of ok) {
    const t = terms[cat];
    if (!t || t.box < 1) continue;
    if (right) terms[cat] = { ...t, box: Math.min(SETTLED, t.box + 1), seen: now };
    else if (misses) {
      const back = n - (t.at ?? -Infinity) >= MISS_GAP;
      terms[cat] = { ...t, box: 1, seen: now, ...(back ? { due: n, why: "miss" as const } : {}) };
    } else terms[cat] = { ...t, seen: now };
  }
  return { ...intro, n, terms };
}

/**
 * A pair's question (Relations, Pervasions) graded for its course terms. Right: each of them was right. Wrong: the mistake counts against a term only
 * when it is the pair's one course term; with two, it may be about either, or about the relation, and neither moves.
 */
export function pairGraded(ix: DataIndex, cats: readonly (string | null | undefined)[], ok: boolean): { cat: string; ok: boolean }[] {
  const course = [...new Set(cats.filter((c): c is string => !!c && !!ix.CAT[c] && needsIntro(ix.CAT[c]!)))];
  return ok || course.length === 1 ? course.map((cat) => ({ cat, ok })) : [];
}

/** A stage has just been switched on: its first term comes before the next question, whatever the spacing. */
export const stageUp = (intro: Intro): Intro => ({ ...intro, next: Math.min(intro.next, intro.n) });

/** A stored record (JSON), each part checked; a fresh one when it cannot be read. */
export function normIntro(raw: unknown): Intro {
  let v: unknown = raw;
  if (typeof raw === "string") { try { v = JSON.parse(raw); } catch { return freshIntro(); } }
  if (!v || typeof v !== "object") return freshIntro();
  const o = v as Partial<Intro>, num = (x: unknown, d: number) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : d);
  const terms: Record<string, IntroTerm> = {};
  for (const [id, t] of Object.entries(o.terms && typeof o.terms === "object" ? o.terms : {})) {
    if (!t || typeof t !== "object") continue;
    const box = num((t as IntroTerm).box, 0);
    if (box < 1) continue;
    const r: IntroTerm = { box: Math.min(SETTLED, Math.floor(box)), shows: num((t as IntroTerm).shows, 0) };
    if (typeof (t as IntroTerm).at === "number") r.at = (t as IntroTerm).at;
    if (typeof (t as IntroTerm).seen === "string") r.seen = (t as IntroTerm).seen;
    if (typeof (t as IntroTerm).due === "number" && ((t as IntroTerm).why === "miss" || (t as IntroTerm).why === "again")) { r.due = (t as IntroTerm).due; r.why = (t as IntroTerm).why; }
    terms[id] = r;
  }
  return { n: num(o.n, 0), next: num(o.next, FIRST_AFTER), terms };
}
