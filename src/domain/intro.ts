// Introducing the course's terms (notes: the definition stop). A Dudra category is asked about only after a stop has shown its term and definition;
// everyday categories need none. A new learner meets a few everyday questions first, then the terms come one at a time, a few questions apart, from
// the lowest stage that is on up, and none while OPEN_CAP terms are still not right. The questions answered afterwards grade each term: a box from 1
// to 3, up one on a right answer, back to 1 on a mistake, and a mistake brings the term's stop back a few questions later, as a repetition (the result
// names the term at once, underlined). The learner may ask for one too. A settled term not met for a long time comes back once. This is the
// whole schedule: a record per term (part of the learner's progression, practice/progress.ts), and pure functions of it and the data.
import type { Cat } from "../ai-shared/data";
import { spelled, upChain } from "../ai-shared/lookup";
import type { DataIndex } from "../ai-shared/lookup";
import { catStage, topStage } from "./stages";
import type { Stages } from "./stages";

/** A new learner's first stop comes after this many questions: the first questions are on everyday categories. */
export const FIRST_AFTER = 3;
/** The next new term comes this many questions after the last stop. */
export const SPACING = 3;
/** A stop the learner asked to see again comes back after this many questions. */
export const AGAIN_AFTER = 10;
/** A mistake brings a term's stop back this many questions later; a mistake while a repetition is waiting adds none (two mistakes in a row bring it once). */
export const MISS_AFTER = 5;
/** The box of a term that holds. */
export const SETTLED = 3;
/** A settled term not met in any question for this many days comes back once. */
export const GAP_DAYS = 14;
/** The most terms that are open at once (met at their stop, the last answer on them not right yet): while this many are, no new term comes. */
export const OPEN_CAP = 3;

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
  /** the question count of the first answer that graded it: the stage's ring puts its terms in this order */
  first?: number;
  /** the question count of the answer that last made its last answer right (box 1 to 2): the next stage comes with the one that completes the stage */
  won?: number;
}

/** The device's record: how many questions it has answered since the record began, when the next new term may come, and each term met (by category id, or a named term's key). */
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

/**
 * The named terms: course terms mutually inclusive with a category's own that some of its labels and phrases name (the data's `named`): matter
 * next to form, the same things under another definition. Such a term shares the category and its questions, since their answers can never differ, but it has a
 * definition and divisions of its own: a stop and a segment of its own, right after the category's, and a question that says one of its words
 * grades it. The record keeps it under its key ("form:Matter"), and until its stop has come its words wait (`unmet`, `wordsFor`): a pair says
 * "forms", not "matter".
 */
export const namedKey = (cat: string, term: string): string => cat + ":" + term;
/** The keys of the named terms of a category, in the data's order. */
const namedKeys = (ix: DataIndex, cat: string): string[] => (ix.CAT[cat]?.named ?? []).filter((n) => Object.hasOwn(ix.DATA.terms, n.term)).map((n) => namedKey(cat, n.term));
/** The category a stop or a record is for: one of the data's, or for a named term its category under the term's name and words. */
export function stopCat(ix: DataIndex, id: string): Cat | null {
  if (Object.hasOwn(ix.CAT, id)) return ix.CAT[id]!;
  const i = id.indexOf(":"), base = i > 0 && Object.hasOwn(ix.CAT, id.slice(0, i)) ? ix.CAT[id.slice(0, i)]! : null;
  const n = base?.named?.find((x) => x.term === id.slice(i + 1));
  if (!base || !n || !Object.hasOwn(ix.DATA.terms, n.term)) return null;
  const c: Cat = { ...base, id, term: n.term, labels: base.labels.filter((l) => n.words.includes(l)), phrases: (base.phrases ?? []).filter((p) => n.words.includes(p)) };
  delete c.named;
  return c;
}
/** A word of a negated side, as its category has it: "non-(matter)" is said of matter. */
const unNegated = (w: string): string => (w.startsWith("non-(") && w.endsWith(")") ? w.slice(5, -1) : w.startsWith("non-") ? w.slice(4) : w);
/** The key a question grades when it says the category with this word (a label or a phrase): a named term's ("matter": form:Matter), else the category's. */
export function askedKey(ix: DataIndex, cat: string, word: string | null | undefined): string {
  const named = ix.CAT[cat]?.named; if (!named?.length || !word) return cat;
  const w = spelled(word), bare = spelled(unNegated(w)), n = named.find((x) => x.words.some((y) => { const k = spelled(y); return k === w || k === bare; }));
  return n ? namedKey(cat, n.term) : cat;
}
/**
 * The words (labels or phrases) a question may say the category with: none of a named term whose stop has not come (`unmet`), unless nothing
 * else is left; and while some of its terms are `open` (their last answer is not right yet), the words of those only.
 */
export function wordsFor(ix: DataIndex, cat: string, words: readonly string[], unmet?: ReadonlySet<string>, open?: ReadonlySet<string>): readonly string[] {
  if (!ix.CAT[cat]?.named?.length) return words;
  const shown = unmet?.size ? words.filter((w) => !unmet.has(askedKey(ix, cat, w))) : words, all = shown.length ? shown : words;
  const lean = open?.size ? all.filter((w) => open.has(askedKey(ix, cat, w))) : [];
  return lean.length ? lean : all;
}
/** The categories of some terms (`open`, `unmet`): a named term's is the category it shares. */
export const termCats = (keys: Iterable<string>): Set<string> => new Set([...keys].map((k) => { const i = k.indexOf(":"); return i > 0 ? k.slice(0, i) : k; }));

/** A device's record before any question. */
export const freshIntro = (): Intro => ({ n: 0, next: FIRST_AFTER, terms: {} });

/** Whether a category needs its stop before it is asked about: a Dudra category with a term. */
export const needsIntro = (cat: Pick<Cat, "kind" | "term">): boolean => cat.kind === "dudra" && !!cat.term;

/** Whether the category may be asked about: an everyday one always, a Dudra one once its stop has come. */
export const introduced = (intro: Intro, cat: Pick<Cat, "id" | "kind" | "term">): boolean => !needsIntro(cat) || (intro.terms[cat.id]?.box ?? 0) >= 1;

/** Every course term with a stop, as its category (`stopCat`), in the course's order (the data's): each category's own, then its named terms. */
const courseTerms = (ix: DataIndex): Cat[] => Object.values(ix.CAT).filter(needsIntro).flatMap((c) => [c, ...namedKeys(ix, c.id).map((k) => stopCat(ix, k)!)]);

/** The terms that open at the stage, in the course's order: the categories' ids, each followed by its named terms' keys. */
export const stageTerms = (ix: DataIndex, stage: number): string[] => courseTerms(ix).filter((c) => catStage(c) === stage).map((c) => c.id);

/** The course terms whose stop has come, as their categories, in the course's order: the lowest stage first, then the data's. */
export const metTerms = (ix: DataIndex, intro: Intro): Cat[] => courseTerms(ix).filter((c) => introduced(intro, c)).sort((a, b) => catStage(a) - catStage(b));

/**
 * The course terms open at these stages whose stop has not come yet: a category waits out of the questions (domain/stages.ts, catOpen), a
 * named term's words wait out of its category's (`wordsFor`).
 */
export function unmet(ix: DataIndex, intro: Intro, on: Stages): Set<string> {
  const top = topStage(on), out = new Set<string>();
  for (const c of courseTerms(ix)) if (catStage(c) <= top && !introduced(intro, c)) out.add(c.id);
  return out;
}

/** Whether every term of the stage has had its stop. */
export const stageMet = (ix: DataIndex, intro: Intro, stage: number): boolean => stageTerms(ix, stage).every((id) => introduced(intro, stopCat(ix, id)!));

/**
 * Where a term stands for its stage: before its stop (`wait`), met and not answered yet (`met`), its last answer right (`ok`, box 2 or more), or its
 * last answer wrong, never right yet (`miss`) or right before (`slip`). A term met and not `ok` is open (`openTerms`).
 */
export type TermMark = "wait" | "met" | "ok" | "miss" | "slip";
export function termMark(intro: Intro, id: string): TermMark {
  const t = intro.terms[id];
  if (!t || t.box < 1) return "wait";
  if (t.box >= 2) return "ok";
  return t.first === undefined ? "met" : t.won !== undefined ? "slip" : "miss";
}
/** A new term of a stage with its mark; `now`: the latest answer made it right. */
export interface StageMark { id: string; mark: TermMark; now?: true }
/** The new terms of the stage with their marks, in the order the learner first answered them; then the ones met, then the ones still to come, in the course's order. */
export function stageMarks(ix: DataIndex, intro: Intro, stage: number): StageMark[] {
  const at = (id: string) => intro.terms[id]?.first ?? Infinity, wait = (id: string) => (termMark(intro, id) === "wait" ? 1 : 0);
  return stageTerms(ix, stage).map((id, i) => ({ id, i })).sort((a, b) => at(a.id) - at(b.id) || wait(a.id) - wait(b.id) || a.i - b.i).map(({ id }) => {
    const mark = termMark(intro, id);
    return mark === "ok" && intro.terms[id]!.won === intro.n ? { id, mark, now: true as const } : { id, mark };
  });
}
/**
 * The course terms open at these stages that have had their stop and whose last answer is not right yet, whatever their stage: the new questions lean
 * to them (universe.ts, place.ts), and while OPEN_CAP of them are, no new term comes (`newTermDue`).
 */
export function openTerms(ix: DataIndex, intro: Intro, on: Stages): Set<string> {
  const top = topStage(on), out = new Set<string>();
  for (const c of courseTerms(ix)) { const m = catStage(c) <= top ? termMark(intro, c.id) : "wait"; if (m !== "wait" && m !== "ok") out.add(c.id); }
  return out;
}
/** Whether a new term may come before the next question: the spacing since the last stop has passed, and fewer than OPEN_CAP terms are open. */
export const newTermDue = (ix: DataIndex, intro: Intro, on: Stages): boolean => intro.n >= intro.next && openTerms(ix, intro, on).size < OPEN_CAP;
/**
 * Whether the next stage comes in now: every new term of the highest stage on has had its stop, and a new term may come (`newTermDue`), which is the next
 * stage's first (stages.ts, stageOffer: the stages are chapters of one list of terms). Undefined when the next stage brings no term the learner has not
 * met: stages 9 to 11, which bring none, and one whose terms came before (the learner moved the stages, or came back down).
 */
export function nextStageDue(ix: DataIndex, intro: Intro, on: Stages): boolean | undefined {
  const top = topStage(on);
  if (!stageTerms(ix, top + 1).some((id) => !introduced(intro, stopCat(ix, id)!))) return undefined;
  return stageMet(ix, intro, top) && newTermDue(ix, intro, on);
}

/** A term in the tree a stop draws: `met` unless it is a course term whose own stop has not come yet (a term the course never stops at has nothing to wait for). */
export interface TreeTerm { name: string; met: boolean }
/**
 * Where a course term sits, for its stop: the terms above it, the broadest first, and below it its divisions that are course terms. Every term above is
 * named and marked met or not; of the divisions with a stop only the met ones are named, and `more` says that others will come, later. The divisions
 * the course never stops at (primary and secondary color, the five sense powers: no plain thing defines them, so they are things of their parent, not
 * categories) are `parts`, named from the start: there is nothing for them to wait for.
 */
export function termTree(ix: DataIndex, intro: Intro, term: string): { up: TreeTerm[]; kids: string[]; more: boolean; parts: string[] } {
  const stops = new Map<string, Cat>();
  for (const c of courseTerms(ix)) stops.set(c.term!, c);
  const met = (n: string) => { const c = stops.get(n); return !c || introduced(intro, c); };
  const up = ((ix.DATA.chains || {})[term] || upChain(ix, term)).slice(1).reverse().map((name) => ({ name, met: met(name) }));
  const all = Object.keys(ix.DATA.terms).filter((n) => ix.DATA.terms[n]!.parent === term), below = all.filter((n) => stops.has(n));
  return { up, kids: below.filter(met), more: below.some((n) => !met(n)), parts: all.filter((n) => !stops.has(n) && ix.DATA.terms[n]!.ch !== CROSS_CHECK) };
}

/** The chapter of the terms taken from Dampilon's tables, which are for cross-checking only: not divisions the course teaches. */
const CROSS_CHECK = "Dampilon tables";

const DAY = 864e5;

/**
 * The stop that comes before the next question, or null. First a term due again (a mistake before an ask), then the next new term once the spacing
 * allows and fewer than OPEN_CAP terms are open (the lowest stage first, in the course's order), then a settled term not met for GAP_DAYS. Only terms
 * open at these stages.
 */
export function nextStop(ix: DataIndex, intro: Intro, on: Stages, now: string): Stop | null {
  const top = topStage(on), open = (id: string) => { const c = stopCat(ix, id); return !!c && catStage(c) <= top; };
  let best: { id: string; t: IntroTerm } | null = null;
  for (const [id, t] of Object.entries(intro.terms)) {
    if (t.due === undefined || t.due > intro.n || !open(id)) continue;
    const rank = (x: IntroTerm) => (x.why === "miss" ? 0 : 1) * 1e9 + (x.due ?? 0);
    if (!best || rank(t) < rank(best.t)) best = { id, t };
  }
  if (best) return { cat: best.id, why: best.t.why === "again" ? "again" : "miss" };
  if (newTermDue(ix, intro, on)) {
    for (let s = 1; s <= top; s++) {
      const id = stageTerms(ix, s).find((c) => !introduced(intro, stopCat(ix, c)!));
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

/** The learner asks to see the term again (`on`), or takes the ask back: its stop comes back after AGAIN_AFTER questions (a mistake before then brings it sooner). */
export function showAgain(intro: Intro, cat: string, on = true): Intro {
  const t = intro.terms[cat]; if (!t) return intro;
  if (on) return { ...intro, terms: { ...intro.terms, [cat]: { ...t, due: intro.n + AGAIN_AFTER, why: "again" } } };
  if (t.why !== "again") return intro;
  const rest = { ...t }; delete rest.due; delete rest.why;
  return { ...intro, terms: { ...intro.terms, [cat]: rest } };
}
/** Whether the learner has asked to see the term again, and it has not come yet. */
export const againAsked = (intro: Intro, cat: string): boolean => intro.terms[cat]?.why === "again" && intro.terms[cat]?.due !== undefined;

/**
 * A question has been answered: the count goes up, and each introduced term it used is graded. `graded` are the categories with whether the learner
 * was right about each (a category listed twice counts as wrong if either is). Right: one box up. Wrong, unless `misses` is false (an exercise where a
 * mistake is mostly about its form): back to box 1, and its stop comes back MISS_AFTER questions later, or sooner when it was due sooner already.
 * The first answer that grades a term is kept (`first`, the ring's order), and the one that made its last answer right (`won`).
 */
export function afterQuestion(intro: Intro, graded: readonly { cat: string | null | undefined; ok: boolean }[], now: string, misses = true): Intro {
  const n = intro.n + 1, terms = { ...intro.terms }, ok = new Map<string, boolean>();
  for (const g of graded) if (g.cat) ok.set(g.cat, (ok.get(g.cat) ?? true) && g.ok);
  for (const [cat, right] of ok) {
    const t = terms[cat];
    if (!t || t.box < 1) continue;
    const first = right || misses ? { first: t.first ?? n } : {};
    if (right) terms[cat] = { ...t, ...first, box: Math.min(SETTLED, t.box + 1), seen: now, ...(t.box === 1 ? { won: n } : {}) };
    else if (misses) {
      terms[cat] = { ...t, ...first, box: 1, seen: now, due: Math.min(t.due ?? Infinity, n + MISS_AFTER), why: "miss" };
    } else terms[cat] = { ...t, seen: now };
  }
  return { ...intro, n, terms };
}

/**
 * A pair's question (Relations, Pervasions) graded for its course terms. Right: each of them was right. Wrong: the mistake counts against a term only
 * when it is the pair's one course term; with two, it may be about either, or about the relation, and neither moves. With the pair's `labels`, a side
 * shown under the label of a named term grades that term (a pair that says "matter" grades matter, not form).
 */
export function pairGraded(ix: DataIndex, cats: readonly (string | null | undefined)[], ok: boolean, labels: readonly (string | null | undefined)[] = []): { cat: string; ok: boolean }[] {
  const keys = cats.map((c, i) => (c ? askedKey(ix, c, labels[i]) : c));
  const course = [...new Set(keys.filter((c): c is string => !!c && !!stopCat(ix, c) && needsIntro(stopCat(ix, c)!)))];
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
    if (typeof (t as IntroTerm).first === "number" && (t as IntroTerm).first! >= 0) r.first = (t as IntroTerm).first;
    if (typeof (t as IntroTerm).won === "number" && (t as IntroTerm).won! >= 0) r.won = (t as IntroTerm).won;
    terms[id] = r;
  }
  return { n: num(o.n, 0), next: num(o.next, FIRST_AFTER), terms };
}
