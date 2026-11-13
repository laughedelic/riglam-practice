// The challenge: a short task that everyone gets, a few questions from a class or a practice session, each in its own exercise. There is one at a time:
// the next one takes the place of the one before. Its rules are in src/domain/challenge.ts (what a challenge is, how its questions are made, the record
// of how each went); this is the page around them.
//
// The platform gives it to a device that has the Magic Key (`challenge`, fetched in the background and kept for offline) and says when another one came,
// or when there is none any more. The roadmap has its stop while there is one (path/roadmap.tsx), and asks to look for another every time it opens.
// The stop opens the challenge's page (path/challenge.tsx), which stands in for Review as the Progression page does (`state.chalPage`; any setTab closes
// it): its date, title and note, its questions as stops, and a station that starts it, goes on with it, or asks it again.
//
// Each question is a given question (practice/given.ts), shown in its exercise, which asks, checks and keeps it like any other. It stands apart from the
// learner's progression: it is asked whatever the stages, grades no term and moves no run. The top bar has its place in the challenge where the
// progression ring stands, which leads back to the page. Next goes on to the next question that has no answer yet, and after the last one back to the
// page. A skipped question stays without an answer. How each went is kept on the device (`rd-challenge`), not in the account.
//
// A challenge has no clock by itself: Sprint is off for its questions, whatever the switch of each exercise says (an exercise with Sprint on would put
// a clock on a question here and there). The stopwatch in the top bar switches it for the questions that follow, until the last one is left, and
// touches no exercise's own switch (practice/given.ts, `sprint`).
import { state } from "../state.js";
import { toRoad, toggleMenu } from "../shell/menu.js";
import { isEx, render, top0 } from "../shell/render.js";
import { goTo, setTab } from "../shell/tabs.js";
import { closeGiven, givenNow, givenShown, openGiven, resumeGiven } from "./given.ts";
import type { GivenHooks } from "./given.ts";
import type { DataIndex } from "../../ai-shared/lookup.ts";
import { challengeQuestion, freshRecord, itemLine, marked, nextItem, normRecord, readChallenge, standing, stationOf } from "../../domain/challenge.ts";
import type { Challenge, ChallengeOptions, ChallengeRecord, ItemLine, Standing } from "../../domain/challenge.ts";

/** The name of the mode, on the roadmap and wherever it is said. */
export const CHALLENGE_NAME = "Challenge";
/** What Next says on the result of the last question. */
export const CHALLENGE_BACK = "Back to the challenge";
const KEY = "rd-challenge";

/** The challenge as this device has it. */
export interface ChallengeNow {
  doc: Challenge;
  /** how each question went here */
  rec: ChallengeRecord;
  /** what names each question on the page, or null for one this device's data cannot make; made again when the data they were made from changed (`from`) */
  lines: (ItemLine | null)[];
  from: unknown[];
  /** the question of it that is on screen in its exercise, or set aside: its place, and what it was opened with (which tells it from another given question) */
  at: number;
  hooks: GivenHooks | null;
  /** what the latest attempt at each question was opened with, by its place: what is kept late of an attempt before it (Claude's check of its examples) does not count */
  tries: GivenHooks[];
  /** it is asked again from the start: Next goes on to the next question whether it has an answer or not */
  again: boolean;
  /** Sprint for its questions: off until the stopwatch is switched on one of them, and off again once the last one is left. In memory only. */
  sprint: boolean;
}

const ix = () => state as unknown as DataIndex;
/** What the making of a question is told of this device: the references it holds beyond the practice data, and how a negated side is written. Not the stages, not the terms met. */
function options(): ChallengeOptions {
  const n = givenNow();
  return { more: n.more, brackets: n.brackets, examples: n.examples };
}
/** What the lines were made from: when any of it is another, they are made again. */
const madeFrom = (): unknown[] => [state.DATA, state.EX, state.negBrackets];

function kept(doc: Challenge): ChallengeRecord {
  try { return normRecord(JSON.parse(localStorage.getItem(KEY) || "null"), doc); } catch { return freshRecord(doc.id); }
}
function keep(c: ChallengeNow): void {
  try { localStorage.setItem(KEY, JSON.stringify(c.rec)); } catch { /* not kept: the next visit starts it again */ }
}
/** The lines of the questions, by their places. */
function lines(c: ChallengeNow): (ItemLine | null)[] {
  const from = madeFrom();
  if (from.some((x, i) => x !== c.from[i])) {
    const o = options();
    c.lines = c.doc.items.map((_, i) => { const q = challengeQuestion(ix(), c.doc, i, o); return q ? itemLine(q) : null; });
    c.from = from;
  }
  return c.lines;
}
/** For each question, whether this device can ask it. */
const askable = (c: ChallengeNow): boolean[] => lines(c).map((l) => !!l);

/** The challenge, or null when there is none. */
export const challengeNow = (): ChallengeNow | null => state.chal;
/** What its page and its stop say of it. */
export interface ChallengeView {
  doc: Challenge;
  rec: ChallengeRecord;
  lines: (ItemLine | null)[];
  standing: Standing;
  /** how many questions this device can ask, and how many of those have an answer */
  n: number;
  done: number;
  /** the place of the question that is on screen in its exercise or waits there, or -1 */
  at: number;
}
export function challengeView(): ChallengeView | null {
  const c = state.chal; if (!c) return null;
  const ask = askable(c);
  return { doc: c.doc, rec: c.rec, lines: c.lines, standing: standing(c.rec, ask), n: ask.filter(Boolean).length, done: ask.filter((a, i) => a && c.rec.marks[i]).length, at: held(c) ? c.at : -1 };
}

/** Whether the exercise holds a question of the challenge: on screen (also while a page stands in front of the exercise), or set aside. */
function held(c: ChallengeNow): boolean {
  const g = state.given;
  return !!c.hooks && !!g && g.hooks === c.hooks && (!g.on || givenShown());
}
/** Whether the question on screen is the challenge's. */
export function challengeShown(): boolean {
  const c = state.chal, g = state.given;
  return !!c && !!g && g.on && held(c) && isEx();
}
/** Whether a question of the challenge waits where it was left, while something else is on screen (what its stop calls "continue"). */
export function challengeWaits(): boolean {
  const c = state.chal;
  return !!c && held(c) && !challengeShown();
}
/** Whether its page is in front. */
export const challengePageOn = (): boolean => state.tab === "review" && state.chalPage && !!state.chal;

/**
 * Takes what the platform has of the challenge into the page: another one starts as new, the same one (by its id) stays as it stands, and when there is none any
 * more the stop goes (its page, if it is in front, gives way to the roadmap). A question of the one before that is still on screen stays there until it
 * is left.
 */
export function setChallenge(raw: unknown): void {
  const doc = raw ? readChallenge(raw) : null, was = state.chal;
  if (!doc) {
    if (!was) return;
    const front = challengePageOn();
    state.chal = null; state.chalPage = false;
    if (front) toRoad(); else if (state.mode !== "loading") render();
    return;
  }
  if (was && JSON.stringify(was.doc) === JSON.stringify(doc)) return;
  if (was && was.doc.id === doc.id) {
    // the same challenge said anew (its title, its note, a question set right): it stays as it stands, with its record and its question on screen; its lines are made again
    was.doc = doc; was.rec = normRecord(was.rec, doc); was.from = [];
    keep(was);
  } else state.chal = { doc, rec: kept(doc), lines: [], from: [], at: -1, hooks: null, tries: [], again: false, sprint: false };
  if (state.mode !== "loading") render();
}
/** Reads the challenge the platform holds, at the start, after a Magic Key was taken in place, and whenever the platform says it changed. */
export async function loadChallenge(platform: { challenge?(): Promise<object | null>; lookForChallenge?(): void }): Promise<void> {
  state.chalLook = platform.lookForChallenge ? () => platform.lookForChallenge?.() : null;
  let raw: unknown;
  try { raw = platform.challenge ? await platform.challenge() : null; } catch { raw = null; }
  setChallenge(raw);
}
/** The roadmap opened: the platform looks for another challenge, where it can. */
export function lookForChallenge(): void { if (state.chalLook) state.chalLook(); }

/** Puts question `i` on screen in its exercise. Whether it did: not when this device's data cannot make it. */
function ask(c: ChallengeNow, i: number): boolean {
  const q = challengeQuestion(ix(), c.doc, i, options());
  if (!q) return false;
  const n = c.doc.items.length, where = (i + 1) + " of " + n;
  const hooks: GivenHooks = {
    apart: true,
    mark: { text: where, label: CHALLENGE_NAME + ", question " + where + ": back to the challenge", go: () => { showChallenge(); } },
    get next() { return state.chal !== c || nextItem(c.rec, askable(c), i, c.again) < 0 ? CHALLENGE_BACK : undefined; },
    get sprint() { return c.sprint; },
    onSprint: (on) => { c.sprint = on; },
    // (the answer is kept when it is checked, and again when Claude's check changes it)
    onChecked: (grade) => { if (state.chal === c && c.tries[i] === hooks) { c.rec = marked(c.rec, i, grade); keep(c); } },
    onNext: () => {
      const k = state.chal === c ? nextItem(c.rec, askable(c), i, c.again) : -1;
      if (k >= 0 && ask(c, k)) return;
      // the last one is left (or another challenge took this one's place meanwhile): the page is back, and from it the roadmap
      closeGiven();
      c.at = -1; c.hooks = null; c.again = false; c.sprint = false;
      if (!showChallenge(true)) toRoad();
    },
  };
  // where the challenge stands is set before the question is drawn, so that the screen it opens on shows it
  const was = { at: c.at, hooks: c.hooks };
  c.at = i; c.hooks = hooks;
  if (openGiven(q, hooks)) { c.tries[i] = hooks; return true; }
  c.at = was.at; c.hooks = was.hooks;
  return false;
}
/** Back to the question of the challenge that the exercise holds, as it was left. */
function backToHeld(): boolean {
  const g = state.given; if (!g) return false;
  if (!g.on) return resumeGiven();
  if (state.tab !== state.own) setTab(state.own); else if (state.menuOpen) toggleMenu(false);      // (gone to again, the exercise on screen would set the question aside: shell/tabs.js)
  return true;
}

/**
 * The challenge's page in front, which counts as having seen the challenge. `road`: Back from it goes to the roadmap (its last question was just left);
 * opened from the roadmap it does so anyway, and opened from a question it goes back to the question. Whether there is a challenge to show.
 */
export function showChallenge(road = false): boolean {
  const c = state.chal; if (!c) return false;
  goTo("review");
  if (road) state.fromRoad = true;
  state.chalPage = true;
  if (!c.rec.seen) { c.rec = { ...c.rec, seen: true }; keep(c); }
  render(); top0();
  return true;
}
/** A question of the page is opened: the one that waits in its exercise comes back as it was left, any other is asked anew. */
export function openItem(i: number): boolean {
  const c = state.chal; if (!c) return false;
  if (held(c) && c.at === i) return backToHeld();
  c.again = false;
  return ask(c, i);
}
/**
 * The station of the page: Start with the first question, Continue with the first that has no answer yet (or with the one that waits in its exercise,
 * not checked yet), Again from the first once all have one. Null when this device can ask none of them.
 */
export function challengeStation(): { name: string; act: () => void } | null {
  const c = state.chal; if (!c) return null;
  const g = state.given;
  if (held(c) && g && !g.ui.checked && !c.rec.marks[c.at]) return { name: "Continue", act: () => { backToHeld(); } };
  const s = stationOf(c.rec, askable(c));
  if (s.at < 0) return null;
  return { name: s.name, act: () => { c.again = s.again; ask(c, s.at); } };
}
