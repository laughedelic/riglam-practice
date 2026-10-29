// The stop of a course term: before its category is asked about in any exercise, a screen of its own shows the term, where it sits in the course and
// its definition (the rules and the schedule are in src/domain/intro.ts). Before the next question, next() (practice/queue.js) asks takeStop whether a
// stop is due; the stop goes on the answer just finished (`ui.stop`), the Path draws it (path/stop.tsx), and Next goes on to the question. The questions
// answered grade the terms they used (gradeTerms): a mistake brings the stop back a few questions later, and the learner may ask for it again from the
// stop (toggleAgain). The draws leave out the categories whose stop has not come yet (unmetNow). The record is part of
// the learner's progression (`rd-terms`, synced by practice/progress.ts). Only the Path has the stops: the classic page asks about every category of its
// stages, as before, and keeps the record graded.
import { state } from "../state.js";
import { hasDef } from "./terms.js";
import { saveProgress } from "./progress.ts";
import { render } from "../shell/render.js";
import type { DataIndex } from "../../ai-shared/lookup.ts";
import { SETTLED, afterQuestion, againAsked, freshIntro, needsIntro, nextStop, pairGraded, showAgain, stageUp, stopShown, termTree, unmet, type Stop } from "../../domain/intro.ts";
import { catStage } from "../../domain/stages.ts";

const save = () => { if (state.intro) saveProgress(); };
const ix = () => state as unknown as DataIndex;
const now = () => new Date().toISOString();
const onPath = () => state.design === "path";

/** Once the term data is in: the record this device has, or a new one. */
export function startStops() {
  if (!state.intro && state.DATA) state.intro = freshIntro();
}
/** The categories of the stages on whose stop has not come yet: the draws leave them out. */
export const unmetNow = (): Set<string> => (onPath() && state.intro && state.DATA ? unmet(ix(), state.intro, state.stages) : new Set());
/**
 * An answer was checked: each course term it used goes up a box when the learner was right about it, and back to the first when not, which brings
 * its stop back a few questions later. `misses` false: an exercise where a mistake is mostly about its form (Syllogisms, Find a pair) counts only right answers.
 */
export function gradeTerms(graded: { cat: string | null | undefined; ok: boolean }[], misses = true) {
  if (!state.intro) return;
  state.intro = afterQuestion(state.intro, graded, now(), misses); save();
}
/** A pair's answer (Relations, Pervasions): a mistake counts against a term only when it is the pair's one course term (src/domain/intro.ts, pairGraded). */
export const gradePair = (cats: (string | null | undefined)[], ok: boolean) => gradeTerms(pairGraded(ix(), cats, ok));
/** The stop that Next would take now (the one `takeStop` would put on the answer on screen), or null: for a station that says what comes after it. */
export function dueStop(): Stop | null {
  const u = state.ui; if (!onPath() || !state.intro || !state.DATA || !u || u.stop) return null;
  return nextStop(ix(), state.intro, state.stages, now());
}
/** Before the next question: the stop that is due, if any, goes on the answer on screen and counts as shown. Whether one did. */
export function takeStop(): boolean {
  const u = state.ui; if (!onPath() || !state.intro || !state.DATA || !u || u.stop) return false;
  const s = nextStop(ix(), state.intro, state.stages, now()); if (!s) return false;
  state.intro = stopShown(state.intro, s.cat, now()); save();
  u.stop = s; u.dterm = null; u.pop = null;
  return true;
}
/** The highest stage went up (shell/stages.js): its first term comes at the next pull. */
export function stopsStageUp() { if (state.intro) { state.intro = stageUp(state.intro); save(); } }

/**
 * The course terms a question asks about that the learner is still meeting (met at a stop, not settled yet) and whose definition this device can read:
 * each has a small tag in the question that opens the definition (path/parts.tsx, PairStops; path/terms.tsx, TermTags). `asked` are the question's
 * categories, with their side in a pair. A category on both sides is tagged on the first only: two matching tags would say that the sides are one class.
 */
export function termTags(asked: { cat: string | null | undefined; side?: string }[]): { term: string; side?: string }[] {
  const intro = state.intro, out: { term: string; side?: string }[] = [], seen = new Set<string>(); if (!onPath() || !intro || !state.DATA) return out;
  for (const a of asked) {
    const c = a.cat ? state.CAT[a.cat] : null;
    if (!c || !c.term || !needsIntro(c) || seen.has(c.id)) continue;
    seen.add(c.id);
    const box = intro.terms[c.id]?.box ?? 0;
    if (box >= 1 && box < SETTLED && hasDef(state.DATA.terms[c.term])) out.push(a.side ? { term: c.term, side: a.side } : { term: c.term });
  }
  return out;
}
/** What the stop says above the term: a new term, its stage and where the course has it, or why it comes again. */
export function stopHead(s: Stop): { h: string; sub: string } {
  const c = state.CAT[s.cat], st = c ? catStage(c) : 0, ch = (c && c.term && state.DATA && state.DATA.terms[c.term] && state.DATA.terms[c.term].ch) || "";
  if (s.why === "new") return { h: "New term", sub: "stage " + st + (ch ? " \u00b7 " + ch : "") };
  return { h: "Repetition", sub: s.why === "miss" ? "you missed this before" : s.why === "gap" ? "not met for a while" : "as you asked" };
}
/** Whether the learner has asked from the stop on screen to see its term again. */
export const againOn = (cat: string): boolean => !!state.intro && againAsked(state.intro, cat);
/** The mark on the stop: its term comes again in a few questions, or, tapped again, not. */
export function toggleAgain(cat: string) {
  if (!state.intro) return;
  state.intro = showAgain(state.intro, cat, !againOn(cat)); save(); render();
}
/** The term of the stop: its name, and whether this device can read its definition. */
export function stopTerm(s: Stop): { name: string; def: boolean } {
  const c = state.CAT[s.cat], term = (c && c.term) || "";
  return { name: term, def: !!state.DATA && hasDef(state.DATA.terms[term]) };
}
/** Where the term of the stop sits: the terms above it, and the divisions of it that the learner has met (src/domain/intro.ts, termTree). */
export function stopTree(s: Stop) {
  const c = state.CAT[s.cat], term = (c && c.term) || "";
  return state.intro && state.DATA ? termTree(ix(), state.intro, term) : { up: [], kids: [], more: false };
}
