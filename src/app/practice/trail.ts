// One step back along the Path: the result the learner has just left can be pulled back down and looked at again (path/back.ts is the pull, shell/render.js draws what is held). Only
// one step back is kept for each exercise, and only the result of the question before the one on screen, so there are at most two attempts at hand:
//
//   prev  the attempt Next went on from (a result: its answer was checked, and what Claude has said about it stays with it)
//   away  the attempt that was on screen when the pull went back, held exactly as it was (a question half answered, or a result) until Next comes forward to it
//
// Going back puts `prev` on screen and `away` aside; Next from there puts `away` back, and nothing is drawn or asked for: no new question, no stage or term that was met on the way.
// The trail belongs to the attempt it was made for (`of`): when anything else puts a different attempt on screen (a skip, another pair opened from Review, a new draw after a change of
// stages), the trail no longer fits, and the pull is not offered until Next from a result has made a new one. Sprint has no way back: a clock runs on each step of it.
import { state } from "../state.js";
import type { Current, Ui } from "../types.ts";

/** An attempt as the page holds it: the pair (or syllogism, or things) and the state of its screen. */
interface Attempt { cur: Current; ui: Ui }
export interface Trail {
  /** the result Next went on from */
  prev: Attempt | null;
  /** the attempt the result `prev` is the one before: the question that Next drew */
  of: Ui | null;
  /** while the result is back on screen: the attempt it took the place of */
  away: Attempt | null;
}

const trailOf = (): Trail => (state.trails[state.own] || (state.trails[state.own] = { prev: null, of: null, away: null }));

/** The result is back on screen (pulled back to) and the attempt it came from waits. */
export function backShown(): boolean {
  const t = state.trails[state.own];
  return !!(t && t.prev && t.away && state.ui === t.prev.ui);
}
/**
 * Whether the page can go back one step now: a question or result is on screen (not the last station of Daily practice over it: practice/daily.ts), the one before it is a
 * result that is still kept, and no clock is running.
 */
export function canGoBack(): boolean {
  const t = state.trails[state.own]; const u = state.ui;
  return !!(t && t.prev && !t.away && u && t.of === u && state.mode === "quiz" && state.view !== "daily" && !state.blitz && !u.stop && !(u.up && u.up.shown));
}
/**
 * Next went on from a result: it is kept as the step back (`left`, what was on screen before the new attempt was drawn). What the result had waiting for the question after it (a stage
 * offer, a term's stop, a note about the guidance) has been dealt with by the learner, and does not come with it again.
 */
export function keepBehind(left: Attempt | null): void {
  const t = trailOf();
  t.away = null;
  if (!left || !left.ui || !left.cur || !left.ui.checked || !state.ui || left.ui === state.ui) { t.prev = null; t.of = null; return; }
  const u = left.ui;
  u.stop = null; u.up = null; u.offer = null; u.guideDown = null; u.negOffer = null; u.dterm = null; u.pop = null;
  t.prev = left; t.of = state.ui;
}
/** The pull went over its curb and was let go: the result before this attempt is on screen, and this attempt is held as it is. */
export function goBack(): boolean {
  if (!canGoBack()) return false;
  const t = trailOf(), prev = t.prev as Attempt;
  t.away = { cur: state.cur as Current, ui: state.ui as Ui };
  state.cur = prev.cur; state.ui = prev.ui;
  return true;
}
/** Next from the result that was pulled back to: the attempt held goes back on screen. */
export function comeForward(): boolean {
  if (!backShown()) return false;
  const t = trailOf(), away = t.away as Attempt;
  state.cur = away.cur; state.ui = away.ui; t.away = null;
  return true;
}
/** What each exercise calls what it asks, as the name of its Next station does ("Next pair"). */
const NOUN: Record<string, string> = { practice: "pair", debate: "pair", find: "relation", syllogism: "syllogism", categories: "question", instance: "set" };
const noun = (): string => NOUN[state.own] || "question";
/** What the station of the attempt held says, at the foot of the result pulled back to: "Back to your pair" (where the exercise's Next says "Next pair"). */
export const forwardName = (): string => "Back to your " + noun();
/** The name of the step back, on the station that comes up at the top of the thread as it is pulled down: "Previous pair". */
export const previousName = (): string => "Previous " + noun();
