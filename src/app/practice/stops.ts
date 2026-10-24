// The stop of a course term: before its category is asked about in any exercise, a screen of its own shows the term, where it sits in the course and
// its definition (the rules and the schedule are in src/domain/intro.ts). Before the next question, next() (practice/queue.js) asks takeStop whether a
// stop is due; the stop goes on the answer just finished (`ui.stop`), the classic page draws it with stopNode and the Path with StopScreen
// (path/stop.tsx), and Next goes on to the question. The questions answered grade the terms they used (gradeTerms), and the draws leave out the
// categories whose stop has not come yet (unmetNow). The record is kept on the device (`rd-terms`).
import { state } from "../state.js";
import { el } from "../core/dom.js";
import { isA } from "./screen.js";
import { hasDef, plainDefCard } from "./terms.js";
import type { DataIndex } from "../../ai-shared/lookup.ts";
import { SETTLED, afterQuestion, freshIntro, needsIntro, nextStop, settle, stageUp, stopShown, unmet, type Stop } from "../../domain/intro.ts";
import { catStage, topStage } from "../../domain/stages.ts";

const store = (key: string, v: string) => { try { localStorage.setItem(key, v); } catch (e) { /* private mode: the terms are met again on the next start */ } };
const save = () => { if (state.intro) store("rd-terms", JSON.stringify(state.intro)); };
const ix = () => state as unknown as DataIndex;
const now = () => new Date().toISOString();

/** Once the term data is in: the device's record, or a new one. A device used before the stops has met every term of the stages it has on. */
export function startStops() {
  if (state.intro || !state.DATA) return;
  let intro = freshIntro();
  if (state.introOld) {
    const top = topStage(state.stages);
    intro = settle(intro, Object.values(state.CAT).filter((c) => needsIntro(c) && catStage(c) <= top).map((c) => c.id), now());
  }
  state.intro = intro; save();
}
/** The categories of the stages on whose stop has not come yet: the draws leave them out. */
export const unmetNow = (): Set<string> => (state.intro && state.DATA ? unmet(ix(), state.intro, state.stages) : new Set());
/**
 * An answer was checked: each course term it used goes up a box when the learner was right about it, and back to the first when not, which brings
 * its stop before the next question. `misses` false: an exercise where a mistake is mostly about its form (Syllogisms, Find a pair) counts only right answers.
 */
export function gradeTerms(graded: { cat: string | null | undefined; ok: boolean }[], misses = true) {
  if (!state.intro) return;
  state.intro = afterQuestion(state.intro, graded, now(), misses); save();
}
/** Before the next question: the stop that is due, if any, goes on the answer on screen and counts as shown. Whether one did. */
export function takeStop(): boolean {
  const u = state.ui; if (!state.intro || !state.DATA || !u || u.stop) return false;
  const s = nextStop(ix(), state.intro, state.stages, now()); if (!s) return false;
  state.intro = stopShown(state.intro, s.cat, now()); save();
  u.stop = s; u.dterm = null; u.pop = null;
  return true;
}
/** The highest stage went up (shell/stages.js): its first term comes at the next pull. */
export function stopsStageUp() { if (state.intro) { state.intro = stageUp(state.intro); save(); } }

/**
 * The course terms a question asks about that the learner is still meeting (met at a stop, not settled yet) and whose definition this device can read:
 * each has a small tag in the question that opens the definition (practice/terms.js, termTagsNode; path/parts.tsx, PairStops). `asked` are the question's
 * categories, with their side in a pair. A category on both sides is tagged on the first only: two matching tags would say that the sides are one class.
 */
export function termTags(asked: { cat: string | null | undefined; side?: string }[]): { term: string; side?: string }[] {
  const intro = state.intro, out: { term: string; side?: string }[] = [], seen = new Set<string>(); if (!intro || !state.DATA) return out;
  for (const a of asked) {
    const c = a.cat ? state.CAT[a.cat] : null;
    if (!c || !c.term || !needsIntro(c) || seen.has(c.id)) continue;
    seen.add(c.id);
    const box = intro.terms[c.id]?.box ?? 0;
    if (box >= 1 && box < SETTLED && hasDef(state.DATA.terms[c.term])) out.push(a.side ? { term: c.term, side: a.side } : { term: c.term });
  }
  return out;
}
/** What the stop says above the term: a new term and its stage, or why it comes again. */
export function stopHead(s: Stop): { h: string; sub: string } {
  const c = state.CAT[s.cat], st = c ? catStage(c) : 0;
  if (s.why === "new") return { h: "New term", sub: "stage " + st };
  if (s.why === "miss") return { h: "Again", sub: "from the last question" };
  return { h: "Again", sub: s.why === "gap" ? "not met for a while" : "as you asked" };
}
/** The term of the stop: its name, where it sits ("is an external form is a form ..."), and its definition when this device can read it. */
export function stopTerm(s: Stop): { name: string; up: string[]; def: boolean } {
  const c = state.CAT[s.cat], term = (c && c.term) || "", chain = ((state.DATA && state.DATA.chains) || {})[term] || [term];
  return { name: term, up: chain.slice(1).map((n: string) => n.toLowerCase()), def: !!state.DATA && hasDef(state.DATA.terms[term]) };
}
/** The classic page's stop: the term and its definition card (or, without the Magic Key, where it sits), then Next. */
export function stopNode(s: Stop, fwd: HTMLElement): HTMLElement {
  const h = stopHead(s), t = stopTerm(s);
  return el("div", { class: "termstop" },
    el("div", { class: "section" }, el("p", { class: "label" }, h.h, el("span", { class: "hint", text: h.sub })),
      t.def ? plainDefCard(t.name)
        : el("div", { class: "tstop" }, el("p", { class: "tstop-n", text: t.name }),
          t.up.length ? el("p", { class: "tm-c" }, t.up.flatMap((n, i) => [i ? " " : "", el("i", { class: "isa", text: isA(n) }), " ", n])) : null,
          state.unlock ? el("p", { class: "tm-key", text: "Its definition comes with the Magic Key from your study group's link." }) : null)),
    fwd);
}
