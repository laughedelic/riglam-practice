// A question that is given, not drawn, shown in its exercise. The rules that make one from its terms are in src/domain/given.ts; this is the page around
// them. Whoever gives the question (a task that everyone gets, a planned run of mixed practice) opens it here, and the exercise's own screen asks, checks and
// keeps it like any other. Three things differ from a drawn question:
//
//   - It takes the place of the exercise's own attempt, which waits untouched (`back`) and comes back when the given one is left: the roadmap goes on showing
//     the exercise as it was (shell/tabs.js, attemptOf).
//   - Next from its result, and Skip, draw nothing: they ask the one who gave it (`onNext`), which opens the question after it or closes. With nothing said,
//     the exercise's own attempt comes back.
//   - When its answer is kept (checked, and again when what Claude says changes it, also after the question was left), the one who gave it is told the
//     grade (`onChecked`).
//   - Its clock can be the giver's (`sprint`): Sprint is then on or off for it as the giver says, whatever its exercise's own switch is, and the stopwatch
//     switched while it is on screen is the giver's to keep (`givenSprint`, `sprintGiven`).
//   - The one who gives it may set it apart from the progression (`apart`: no term graded, no run moved, no stop or stage after it) and put a mark
//     of its own in the top bar (`mark`), where the progression ring stands.
//
// Going to an exercise by any other way (the roadmap, Review's "again") sets the given question aside as it is, and `resumeGiven` puts it back; a cold start
// forgets it (shell/keep.ts keeps no attempt while one is on screen). One given question at a time: opening another leaves the one before.
import { state } from "../state.js";
import { moreRefs } from "../core/examples.js";
import { drawKey, freshCategoriesUi } from "../categories/flow.js";
import { freshDebateUi } from "../debate/flow.js";
import { freshFindUi } from "../find/flow.js";
import { freshInstanceUi } from "../instance/flow.ts";
import { freshSyllogismUi } from "../syllogism/flow.js";
import { render, top0 } from "../shell/render.js";
import { begun, goTo } from "../shell/tabs.js";
import { pauseClock, stopTimer } from "../shell/timers.js";
import { ownSprint } from "./per-exercise.ts";
import { freshUi } from "./queue.js";
import { openNow, unmetNow } from "./stops.ts";
import type { Example } from "../../ai-shared/examples.ts";
import type { GivenOptions, GivenQuestion } from "../../domain/given.ts";
import type { Current, Ui } from "../types.ts";

/** An attempt as the page holds it: what is asked and the state of its screen. */
interface Attempt { cur: Current; ui: Ui }

/** What the one who gives a question wants to hear of it. */
export interface GivenHooks {
  /**
   * The answer is kept: `grade` as the kept answer has it (ok, part, bad, or pend while examples wait for Claude) and the answer itself. Called when the
   * question is checked and each time the kept answer changes after that (Claude's check of the examples, an explanation saved with it).
   */
  onChecked?: (grade: string, doc: Record<string, unknown>) => void;
  /**
   * Next was taken from its result, or it was skipped: open the question after it (`openGiven`), or close this one (`closeGiven`) and show something else.
   * When it does neither, the exercise's own attempt comes back on screen.
   */
  onNext?: (how: { skipped: boolean }) => void;
  /** the name of the station that goes on from its result; "Next question" when left out */
  next?: string;
  /** a line of the giver's own to show with the question (where it stands in a task or a run): kept here for the screen that draws it (`givenLine`) */
  line?: string;
  /**
   * Sprint for the question, whatever its exercise's own switch says (practice/per-exercise.ts): true asks it against the clock, false without one. Read
   * each time the page is drawn. Left out, the exercise's own switch holds.
   */
  sprint?: boolean;
  /** with `sprint`: the stopwatch was switched while the question was on screen. The giver keeps the new value; the exercise's own switch is not touched. */
  onSprint?: (on: boolean) => void;
  /**
   * The answer stands apart from the learner's progression: it grades no course term and moves no run (towards a stage, an offer of negations, the
   * exercise's guidance), and Next from its result brings neither a term's stop nor a stage. For a task that everyone gets, whatever their stages.
   * The answer is kept and shown in Review like any other.
   */
  apart?: boolean;
  /**
   * What stands in the top bar after the exercise's name while the question is on screen, in the place of the progression ring: a few words
   * ("1 of 3"), what a screen reader is told of it, and where a tap on it goes (the giver's own page).
   */
  mark?: { text: string; label: string; go: () => void };
}

/** The hooks each given question was opened with, by the state of its screen: what is kept of its answer reaches them after it was left (`givenKept`). */
const givers = new WeakMap<Ui, GivenHooks>();

/** The given question the page holds: on screen in its exercise (`on`), or set aside. */
export interface GivenState extends Attempt {
  /** its exercise, as the page calls it ("practice" is Relations) */
  ex: string;
  on: boolean;
  /** while it is on screen: the exercise's own attempt, whose place it took */
  back: Attempt | null;
  hooks: GivenHooks;
}

/** The given question on screen, or null. One that something else took the place of (a new draw after a reset) is forgotten. */
function live(): GivenState | null {
  const g = state.given;
  if (!g || !g.on) return null;
  if (state.ui !== g.ui) { state.given = null; return null; }
  return g;
}
/** Whether the question on screen is a given one. */
export const givenShown = (): boolean => !!live();
/** The attempt of the exercise on screen that is its own: the one on screen, or the one waiting behind a given question. */
export function ownAttempt(): { cur: Current | null; ui: Ui | null } {
  const g = live();
  return g && g.back ? g.back : { cur: state.cur, ui: state.ui };
}
/** Whether the question on screen is a given one whose answer stands apart from the progression (`GivenHooks.apart`). */
export const givenApart = (): boolean => !!live()?.hooks.apart;
/** The mark of the given question on screen for the top bar (`GivenHooks.mark`), or null: none was given, or the question on screen is the exercise's own. */
export const givenMark = (): GivenHooks["mark"] | null => live()?.hooks.mark ?? null;
/** Whether a given question is on screen with something to continue: begun, or checked and its result not left yet (what the roadmap's Continue goes back to). */
export function givenUnderWay(): boolean {
  const g = live();
  return !!g && (!!g.ui.checked || begun(g.ui));
}
/** The given question set aside, if there is one: its exercise, and whether it was begun or is checked (what a "Continue" would go back to). */
export function givenAside(): { ex: string; begun: boolean; checked: boolean } | null {
  const g = state.given;
  return g && !g.on ? { ex: g.ex, begun: begun(g.ui), checked: !!g.ui.checked } : null;
}

/** What the page tells the making of a given question (src/domain/given.ts): the learner's stages and terms and the references, as the draws are told. */
export const givenNow = (): GivenOptions & { examples: readonly Example[] | null } => ({
  stages: state.stages, words: { unmet: unmetNow(), open: openNow() }, more: moreRefs(), brackets: state.negBrackets, examples: state.EX ? state.EX.items : null,
});

const none = null as never;      // an exercise without a pair has null in its place (types.ts, Current)
const ui = (u: unknown) => u as Ui;      // the screens' own makers of a new attempt are JavaScript: what they return is the state of a screen
/** A new attempt at the question, as its exercise's own draw would start it. Nothing is counted as drawn: the exercise's memory of what it asked lately stays its own. */
function attemptFor(q: GivenQuestion): Attempt {
  switch (q.exercise) {
    case "practice": return { cur: { p: q.pair }, ui: ui(freshUi()) };
    case "debate": return { cur: { p: q.pair, debate: true }, ui: ui(freshDebateUi()) };
    case "find": return { cur: { p: none, find: true }, ui: ui(freshFindUi(q.relation)) };
    case "syllogism": return { cur: { p: none, syllogism: true, c: q.syllogism }, ui: ui(freshSyllogismUi()) };
    case "categories": return { cur: { p: none, cats: true, q: q.place, tried: drawKey() }, ui: ui(freshCategoriesUi()) };
    case "instance": return { cur: { p: none, inst: true, iq: q.instance }, ui: freshInstanceUi() };
  }
}
/** Puts the given question on screen in the place of its exercise's own attempt, which is the one on screen now. */
function put(g: GivenState): void {
  pauseClock();        // the exercise's own attempt keeps the time its step had left
  g.back = { cur: state.cur as Current, ui: state.ui as Ui }; g.on = true;
  state.given = g; state.cur = g.cur; state.ui = g.ui; state.mode = "quiz";
}

/**
 * Shows a given question in its exercise, as a new attempt. Whether it did: not before the first question of the app is drawn. A given question that was on
 * screen or set aside is left for good.
 */
export function openGiven(q: GivenQuestion, hooks: GivenHooks = {}): boolean {
  if (state.mode !== "quiz" || !state.cur || !state.ui) return false;
  closeGiven();
  if (!goTo(q.exercise)) return false;
  const a = attemptFor(q);
  givers.set(a.ui, hooks);
  put({ ex: q.exercise, on: false, ...a, back: null, hooks });
  render(); top0();
  return true;
}
/** Puts the given question that was set aside back on screen, as it was left. Whether there was one. */
export function resumeGiven(): boolean {
  const g = state.given;
  if (!g || g.on || state.mode !== "quiz" || !goTo(g.ex)) return false;
  put(g);
  render(); top0();
  return true;
}
/** An exercise is gone to by another way: the given question on screen is set aside as it is, and the exercise's own attempt is back in its place. Draws nothing. */
export function setAsideGiven(): void {
  const g = live(); if (!g) return;
  pauseClock(g.ui);
  g.cur = state.cur as Current;      // what is asked may have moved on with the screen (Find a pair's named pair)
  g.on = false;
  if (g.back) { state.cur = g.back.cur; state.ui = g.back.ui; }
  g.back = null;
}
/** Leaves the given question for good, on screen or set aside; from the screen, the exercise's own attempt is back in its place. Draws nothing. */
export function closeGiven(): void {
  const g = state.given; if (!g) return;
  if (live()) {
    stopTimer(g.ui);
    if (g.ui.ctl) g.ui.ctl.abort();      // Claude's answer to it is not waited for, as when Next leaves a result
    if (g.back) { state.cur = g.back.cur; state.ui = g.back.ui; }
  }
  state.given = null;
}

/**
 * Next from a given question's result, or (`skipped`) a skip or a time-up with nothing to show: the one who gave it says what comes. Whether the question on
 * screen was a given one; when not, the exercise draws its own next question as always.
 */
export function nextGiven(skipped = false): boolean {
  const g = live(); if (!g) return false;
  if (g.hooks.onNext) g.hooks.onNext({ skipped });
  if (state.given === g && g.on) closeGiven();
  return true;
}
/**
 * An answer is kept (practice/answers.js, persist, before it is saved): when it is a given question's, the one who gave it is told, also when the question
 * was left meanwhile (Claude's check of its examples comes after Next); one set apart from the progression is marked so in its document (`apart`), which
 * the runs read back from the saved answers leave out (practice/negations.ts).
 */
export function givenKept(u: Ui | null): void {
  const h = u ? givers.get(u) : undefined;
  if (!h || !u || !u.doc) return;
  const doc = u.doc as unknown as Record<string, unknown>;
  if (h.apart) doc.apart = true;
  if (h.onChecked) h.onChecked(String(doc.grade ?? ""), doc);
}
/**
 * The clock of a given question is its giver's where the giver says so (`sprint`). Runs before the page is drawn and its clock made to fit (shell/render.js):
 * while such a question is on screen Sprint is as the giver says, and once it no longer is (left, set aside, something took its place), the switch of the
 * exercise under the screen is back.
 */
export function givenSprint(): void {
  const g = live(), on = g ? g.hooks.sprint : undefined;
  if (on !== undefined) { state.givenSprint = true; state.blitz = on; }
  else if (state.givenSprint) { state.givenSprint = false; state.blitz = ownSprint(state.own); }
}
/** The stopwatch was switched (shell/timers.js). Whether the clock of the question on screen is its giver's, who is told then; when not, the switch is the exercise's own. */
export function sprintGiven(on: boolean): boolean {
  const g = live();
  if (!g || g.hooks.sprint === undefined) return false;
  if (g.hooks.onSprint) g.hooks.onSprint(on);
  return true;
}
/** The giver's line for the given question on screen, or null: none was given, or the question on screen is the exercise's own. */
export function givenLine(): string | null {
  const g = live();
  return (g && g.hooks.line) || null;
}
/** The name of the Next station on a given question's result, or null when the question on screen is the exercise's own. */
export function givenNextName(): string | null {
  const g = live();
  return g ? g.hooks.next || "Next question" : null;
}
