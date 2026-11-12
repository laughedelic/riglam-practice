// The challenges: short tasks that everyone gets, a few questions from a class or a practice session, each in its own exercise. They accumulate: a new
// one comes after those before it, by the day it was given. Their rules are in src/domain/challenge.ts (what a challenge is, how its questions are made,
// the record of how each went, which still wait); this is the page around them.
//
// The platform gives them to a device that has the Magic Key (`challenge`, fetched in the background and kept for offline) and says when they changed.
// The roadmap has their stop while there are any (path/roadmap.tsx), and asks to look for more every time it opens. The stop opens their page
// (path/challenge.tsx), which stands in for Review as the Progression page does (`state.chalPage`; any setTab closes it). It is a timeline: the earliest
// above, the latest lowest, by the station. The challenges that wait are on it, each folded to its day, its title and a small diamond for each question,
// but for the open one (`state.chalOpen`: the one picked, else the latest that waits), which shows its note and its questions as stops, and whose station
// starts it, goes on with it, or asks it again. A challenge whose questions all have an answer is done: it falls behind the top of the page
// (`state.chalFall`, while it goes), where a pull (path/back.tsx) or a tap brings all those done back, folded (`state.chalOut`), until the page is opened
// anew from the roadmap.
//
// Each question is a given question (practice/given.ts), shown in its exercise, which asks, checks and keeps it like any other. It stands apart from the
// learner's progression: it is asked whatever the stages, grades no term and moves no run. The top bar has its place in the challenge where the
// progression ring stands, which leads back to the page. Next goes on to the next question of the same challenge that has no answer yet, and after the
// last one back to the page. A skipped question stays without an answer. How each went is kept on the device (`rd-challenge`, by the challenge's id),
// not in the account.
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
import { challengeQuestion, itemLine, marked, nextItem, normRecords, readChallenges, standing, stationOf, stopSays, storedRecords, waits } from "../../domain/challenge.ts";
import type { Challenge, ChallengeOptions, ChallengeRecord, ItemLine, Standing } from "../../domain/challenge.ts";

/** The name of the mode, on the roadmap and wherever it is said. */
export const CHALLENGE_NAME = "Challenge";
/** What Next says on the result of the last question. */
export const CHALLENGE_BACK = "Back to the challenge";
const KEY = "rd-challenge";

/** A challenge as this device has it. */
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

/** The records kept on this device for these challenges (a fresh one for a challenge it has none of). */
function kept(docs: Challenge[]): Record<string, ChallengeRecord> {
  let raw: unknown = null;
  try { raw = JSON.parse(localStorage.getItem(KEY) || "null"); } catch { /* none kept */ }
  return normRecords(raw, docs);
}
/** Keeps the records of all the challenges (those of challenges no longer there go). */
function keep(): void {
  const rs = Object.fromEntries(state.chals.map((c) => [c.doc.id, c.rec]));
  try { localStorage.setItem(KEY, JSON.stringify(storedRecords(rs))); } catch { /* not kept: the next visit starts them again */ }
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
/** Whether the challenge still waits (`waits`). */
const waiting = (c: ChallengeNow): boolean => waits(c.rec, askable(c));
const byId = (id: string | null): ChallengeNow | null => (id && state.chals.find((c) => c.doc.id === id)) || null;

/** What the page and the stop say of a challenge. */
export interface ChallengeView {
  doc: Challenge;
  rec: ChallengeRecord;
  lines: (ItemLine | null)[];
  standing: Standing;
  /** it still waits; one that does not is done */
  waits: boolean;
  /** how many questions this device can ask, and how many of those have an answer */
  n: number;
  done: number;
  /** the place of the question that is on screen in its exercise or waits there, or -1 */
  at: number;
}
function viewOf(c: ChallengeNow): ChallengeView {
  const ask = askable(c);
  return { doc: c.doc, rec: c.rec, lines: c.lines, standing: standing(c.rec, ask), waits: waits(c.rec, ask), n: ask.filter(Boolean).length, done: ask.filter((a, i) => a && c.rec.marks[i]).length, at: held(c) ? c.at : -1 };
}
/** The challenge with this id as the page and the stop say it, or null. */
export const challengeView = (id: string): ChallengeView | null => { const c = byId(id); return c ? viewOf(c) : null; };

/** The page's timeline. */
export interface Timeline {
  /** the challenges on it, in their order: the done ones that were brought back, then the ones that wait (with the one falling behind the top, in its place) */
  shown: ChallengeView[];
  /** how many are done and behind the top */
  hidden: number;
  /** the id of the open one, or null (none waits, or one is falling and the next is not open yet) */
  open: string | null;
  /** how many wait */
  waiting: number;
}
export function challengeTimeline(): Timeline {
  const all = state.chals.map((c) => ({ c, v: viewOf(c) }));
  const out = all.filter(({ c, v }) => !v.waits && state.chalOut.includes(c.doc.id) && c.doc.id !== state.chalFall);
  const rest = all.filter(({ c, v }) => v.waits || c.doc.id === state.chalFall);
  const shown = [...out, ...rest].map(({ v }) => v), wait = all.filter(({ v }) => v.waits);
  const latest = wait.length ? wait[wait.length - 1].c.doc.id : null;
  const open = state.chalOpen && shown.some((v) => v.doc.id === state.chalOpen) ? state.chalOpen : state.chalFall ? null : latest;
  return { shown, hidden: all.length - shown.length, open, waiting: wait.length };
}

/** What the stop on the roadmap says: "new" while a challenge came that was not seen on its page, then how many wait, and nothing once none does (`stopSays`). */
export function challengeStop(): { fresh: boolean; text: string; title: string } {
  return stopSays(state.chals.map((c) => ({ doc: c.doc, rec: c.rec, askable: askable(c) })));
}

/** Whether the exercise holds a question of this challenge: on screen (also while a page stands in front of the exercise), or set aside. */
function held(c: ChallengeNow): boolean {
  const g = state.given;
  return !!c.hooks && !!g && g.hooks === c.hooks && (!g.on || givenShown());
}
/** The challenge whose question the exercise holds, or null. */
const holder = (): ChallengeNow | null => state.chals.find(held) || null;
/** The challenge whose question is on screen, or null. */
function shownOne(): ChallengeNow | null {
  const c = holder(), g = state.given;
  return c && g && g.on && isEx() ? c : null;
}
/** Whether the question on screen is a challenge's. */
export const challengeShown = (): boolean => !!shownOne();
/** The challenge whose question is on screen or waits where it was left, as the stop says it ("1 of 3", "continue"), or null. */
export function challengeHeld(): ChallengeView | null {
  const c = holder();
  return c ? viewOf(c) : null;
}
/** Whether a question of a challenge waits where it was left, while something else is on screen (what the stop calls "continue"). */
export const challengeWaits = (): boolean => !!holder() && !challengeShown();
/** Whether their page is in front. */
export const challengePageOn = (): boolean => state.tab === "review" && state.chalPage && state.chals.length > 0;

/**
 * Takes what the platform has of the challenges into the page. A challenge already here (by its id) stays as it stands, with its record and its question
 * on screen, also when it is said anew (its title, its note, a question set right: its lines are made again); a new one starts as new; one no longer
 * there goes (and so does its record). When there are none any more the stop goes, and their page, if it is in front, gives way to the roadmap. A
 * question of one that went, still on screen, stays there until it is left.
 */
export function setChallenges(raw: unknown): void {
  const docs = raw ? readChallenges(raw) : [], was = state.chals;
  if (!docs.length) {
    if (!was.length) return;
    const front = challengePageOn();
    state.chals = []; state.chalPage = false; state.chalOpen = null; state.chalOut = []; state.chalFall = null;
    if (front) toRoad(); else if (state.mode !== "loading") render();
    return;
  }
  if (was.length === docs.length && was.every((c, i) => JSON.stringify(c.doc) === JSON.stringify(docs[i]))) return;
  const recs = kept(docs);
  state.chals = docs.map((doc) => {
    const c = was.find((x) => x.doc.id === doc.id);
    if (!c) return { doc, rec: recs[doc.id], lines: [], from: [], at: -1, hooks: null, tries: [], again: false, sprint: false };
    if (JSON.stringify(c.doc) !== JSON.stringify(doc)) { c.doc = doc; c.rec = normRecords({ [doc.id]: c.rec }, [doc])[doc.id]; c.from = []; }
    return c;
  });
  if (!byId(state.chalOpen)) state.chalOpen = null;
  if (!byId(state.chalFall)) state.chalFall = null;
  state.chalOut = state.chalOut.filter((id) => byId(id));
  keep();
  if (state.mode !== "loading") render();
}
/** Reads the challenges the platform holds, at the start, after a Magic Key was taken in place, and whenever the platform says they changed. */
export async function loadChallenge(platform: { challenge?(): Promise<object | null>; lookForChallenge?(): void }): Promise<void> {
  state.chalLook = platform.lookForChallenge ? () => platform.lookForChallenge?.() : null;
  let raw: unknown;
  try { raw = platform.challenge ? await platform.challenge() : null; } catch { raw = null; }
  setChallenges(raw);
}
/** The roadmap opened: the platform looks for more challenges, where it can. */
export function lookForChallenge(): void { if (state.chalLook) state.chalLook(); }

/** Puts question `i` of the challenge on screen in its exercise. Whether it did: not when this device's data cannot make it. */
function ask(c: ChallengeNow, i: number): boolean {
  const q = challengeQuestion(ix(), c.doc, i, options());
  if (!q) return false;
  const n = c.doc.items.length, where = (i + 1) + " of " + n;
  const here = () => state.chals.includes(c);
  const hooks: GivenHooks = {
    apart: true,
    mark: { text: where, label: CHALLENGE_NAME + ", question " + where + ": back to the challenge", go: () => { showChallenge("mark"); } },
    get next() { return !here() || nextItem(c.rec, askable(c), i, c.again) < 0 ? CHALLENGE_BACK : undefined; },
    get sprint() { return c.sprint; },
    onSprint: (on) => { c.sprint = on; },
    // (the answer is kept when it is checked, and again when Claude's check changes it)
    onChecked: (grade) => { if (here() && c.tries[i] === hooks) { c.rec = marked(c.rec, i, grade); keep(); } },
    onNext: () => {
      const k = here() ? nextItem(c.rec, askable(c), i, c.again) : -1;
      if (k >= 0 && ask(c, k)) return;
      // the last one is left (or the challenge is no longer there): the page is back, and from it the roadmap
      closeGiven();
      c.at = -1; c.hooks = null; c.again = false; c.sprint = false;
      if (!showChallenge("end", c)) toRoad();
    },
  };
  // where the challenge stands is set before the question is drawn, so that the screen it opens on shows it
  const was = { at: c.at, hooks: c.hooks };
  c.at = i; c.hooks = hooks;
  if (openGiven(q, hooks)) { c.tries[i] = hooks; state.chalOpen = c.doc.id; return true; }
  c.at = was.at; c.hooks = was.hooks;
  return false;
}
/** Back to the question of a challenge that the exercise holds, as it was left. */
function backToHeld(): boolean {
  const g = state.given; if (!g) return false;
  if (!g.on) return resumeGiven();
  if (state.tab !== state.own) setTab(state.own); else if (state.menuOpen) toggleMenu(false);      // (gone to again, the exercise on screen would set the question aside: shell/tabs.js)
  return true;
}

/**
 * Their page in front, which counts as having seen them all. How it was opened:
 * - `road`, from the roadmap: the done ones are behind the top again, and the open one is the one whose question waits in its exercise, else the latest
 *   that waits;
 * - `mark`, from a question's mark in the top bar: the question's challenge is open (brought back from behind the top if it is done), and Back goes
 *   back to the question;
 * - `end`, after the last question of a run of `c`: `c` is open, and if it is done now (and was not brought back) it falls behind the top; Back goes to
 *   the roadmap.
 * Whether there are any to show.
 */
export function showChallenge(how: "road" | "mark" | "end" = "road", c: ChallengeNow | null = null): boolean {
  if (!state.chals.length) return false;
  goTo("review");
  state.chalPage = true; state.chalFall = null;
  if (how === "road") {
    const h = holder();
    state.chalOut = []; state.chalOpen = h && waiting(h) ? h.doc.id : null;
  } else {
    const one = how === "mark" ? holder() : c && state.chals.includes(c) ? c : null;
    if (one) {
      state.chalOpen = one.doc.id;
      if (!waiting(one) && !state.chalOut.includes(one.doc.id)) {
        if (how === "end") state.chalFall = one.doc.id; else state.chalOut = [...state.chalOut, one.doc.id];
      }
    }
    if (how === "end") state.fromRoad = true;
  }
  if (state.chals.some((x) => !x.rec.seen)) { for (const x of state.chals) if (!x.rec.seen) x.rec = { ...x.rec, seen: true }; keep(); }
  render(); top0(); revealOpen(false);
  return true;
}
/** Brings the open challenge's heading into view on the page: the challenges above it are folded, and it may stand below the screen's foot. */
export function revealOpen(smooth: boolean): void {
  const sc = document.querySelector<HTMLElement>("#path .pscroll"), n = sc && sc.querySelector<HTMLElement>(".chx[data-open]");
  if (!sc || !n) return;
  const y = n.getBoundingClientRect().top - sc.getBoundingClientRect().top, how = smooth ? "smooth" : "auto";
  if (y < 4) sc.scrollBy({ top: y - 8, behavior: how });
  else if (y > sc.clientHeight - 170) sc.scrollBy({ top: y - 70, behavior: how });
}
/** A challenge on the page is unfolded by its title, and the one open before is folded. */
export function openChallenge(id: string): void {
  if (!byId(id) || state.chalOpen === id) return;
  state.chalOpen = id;
  render();
}
/** The challenge that fell behind the top is there: the latest that waits is open. */
export function endFall(): void {
  if (!state.chalFall) return;
  if (state.chalOpen === state.chalFall) state.chalOpen = null;
  state.chalFall = null;
}
/** The challenge falling folds (it is no longer the open one) before it rides up. */
export function foldFall(): void {
  if (state.chalFall && state.chalOpen === state.chalFall) { state.chalOpen = null; render(); }
}
/**
 * What a pull at the top of the page takes, while some challenges are done and behind it: their number, said as the station above the thread says it
 * ("2 done"), and the way to bring them all back. Null where there is nothing to take (not the page, or none behind the top).
 */
export function challengePast(): { name: string; take: () => boolean } | null {
  if (!challengePageOn() || state.optsOpen || state.chalFall) return null;
  const t = challengeTimeline(); if (!t.hidden) return null;
  return {
    name: t.hidden + " done",
    take: () => {
      const behind = state.chals.filter((c) => !waiting(c) && !state.chalOut.includes(c.doc.id)).map((c) => c.doc.id);
      if (!behind.length) return false;
      state.chalOut = [...state.chalOut, ...behind];
      return true;
    },
  };
}

/** A question of the page is opened: the one that waits in its exercise comes back as it was left, any other is asked anew. */
export function openItem(id: string, i: number): boolean {
  const c = byId(id); if (!c) return false;
  if (held(c) && c.at === i) { state.chalOpen = id; return backToHeld(); }
  c.again = false;
  return ask(c, i);
}
/**
 * The station of the page, of the open challenge: Start with its first question, Continue with the first that has no answer yet (or with the one that
 * waits in its exercise, not checked yet), Again from the first once all have one. Null when none is open, or this device can ask none of its questions.
 */
export function challengeStation(): { name: string; act: () => void } | null {
  const c = byId(challengeTimeline().open); if (!c) return null;
  const g = state.given;
  if (held(c) && g && !g.ui.checked && !c.rec.marks[c.at]) return { name: "Continue", act: () => { backToHeld(); } };
  const s = stationOf(c.rec, askable(c));
  if (s.at < 0) return null;
  return { name: s.name, act: () => { c.again = s.again; ask(c, s.at); } };
}
