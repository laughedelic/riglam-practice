// Daily practice: a session of mixed practice in the app. The plan is made by src/domain/session.ts (rounds of questions that hang together); this
// runs it. Each step is a given question (practice/given.ts): it is shown in its own exercise, which asks, checks and keeps it like any other, and
// Next goes on to the step after it, whatever exercise that is in. When the plan's last step is left, the steps that were missed come back, each as
// another exercise on the same terms, and after the last of those the session's last station is in front (path/daily.tsx): how it went, and one more
// round for the days that want more. From there the roadmap is back, with the stop saying that a session was done today.
//
// A session has no clock by itself: Sprint is off for its questions, whatever the switch of each exercise says (an exercise with Sprint on would put a clock
// on a question here and there). The clock is the learner's choice: the last station offers the round that is added as a Sprint round, and the stopwatch in
// the top bar switches Sprint for the questions that follow, up to the last station. Neither touches an exercise's own switch (practice/given.ts, `sprint`).
//
// A session under way waits when the learner goes elsewhere (the roadmap, an exercise, Review): its stop on the roadmap says "continue" and puts its
// question back as it was left. It is kept in memory only: a cold start forgets it. What the device keeps (`rd-daily`) is the day of the last
// session done, how many were done that day, and the categories of the last one, which the next plan passes over while it has others.
//
// The last station is a screen of its own over the exercise the last question was in, whose own attempt waits under it untouched: while it is in front
// the page's view is `DAILY_VIEW`, which keeps the keys and the voice off the attempt under it (shell/keys.js, shell/voice.js), its clock still
// (shell/timers.js) and the thread from being pulled back (practice/trail.ts). Going anywhere else from it leaves the session for good.
import { state } from "../state.js";
import { today } from "../core/util.js";
import { toggleMenu } from "../shell/menu.js";
import { isEx, render, top0 } from "../shell/render.js";
import { setTab } from "../shell/tabs.js";
import { closeGiven, givenNow, givenShown, openGiven, resumeGiven } from "./given.ts";
import type { GivenHooks } from "./given.ts";
import { openNow, unmetNow } from "./stops.ts";
import type { DataIndex } from "../../ai-shared/lookup.ts";
import { givenQuestion } from "../../domain/given.ts";
import { SESSION_QUESTIONS, comeBacks, planSession, sessionMiss, stepKey, roundName } from "../../domain/session.ts";
import type { SessionOptions, SessionPlan, SessionStep } from "../../domain/session.ts";

/** The name of the mode, on the roadmap and wherever it is said. */
export const DAILY_NAME = "Daily practice";
/** What the roadmap says under the name before a session: how many questions it has when nothing is missed. */
export const DAILY_SIZE = SESSION_QUESTIONS + " questions";
/** The page's view while the session's last station is in front (state.js, `view`). */
export const DAILY_VIEW = "daily";
/** What the group of the questions that came back is called at the last station. */
export const DAILY_BACK = "Came back";
const KEY = "rd-daily";

/** How a step went: "" not answered (yet), the grade of its kept answer (ok, part, bad, pend), or "skip". */
export type DailyMark = "" | "ok" | "part" | "bad" | "pend" | "skip";

/** The steps that are asked one after another as a group: a round of the plan, or what came back. */
export interface DailyGroup {
  /** how many steps it has */
  n: number;
  /** what it is about, as the learner reads it: the round's term or terms, or `DAILY_BACK` */
  name: string;
}
/** A session under way. */
export interface DailyRun {
  plan: SessionPlan;
  /** the steps in the order they are asked: the plan's, then the ones that came back (and the same again for each round added at the last station) */
  steps: SessionStep[];
  /** the groups the steps fall into, in order */
  groups: DailyGroup[];
  marks: DailyMark[];
  /** the step on screen, or the one to go on with */
  at: number;
  /** the first step of the part under way: the plan's first, or the first of a round added at the last station */
  from: number;
  /** the misses of the part under way have been brought back: nothing more is added to it */
  back: boolean;
  /** the last step has been left: the last station is in front, until it is left */
  end: boolean;
  /** the session is counted among the day's: once, however many rounds are added to it */
  counted: boolean;
  /** Sprint for the questions of the part under way: a Sprint round from the last station, or the stopwatch switched on one of its questions */
  sprint: boolean;
  /** what the step on screen (or set aside) was opened with: tells the session's question from another given one */
  hooks: GivenHooks | null;
}
/** What the device keeps of the sessions done. */
export interface DailyDone {
  /** the day of the last session done */
  day: string;
  /** how many were done that day */
  n: number;
  /** the categories of the last one */
  cats: string[];
}

const ix = () => state as unknown as DataIndex;
const MARKS: readonly string[] = ["ok", "part", "bad", "pend"];

/** What the device keeps, read once. */
function done(): DailyDone {
  if (!state.dailyDone) {
    let d: DailyDone = { day: "", n: 0, cats: [] };
    try {
      const v: unknown = JSON.parse(localStorage.getItem(KEY) || "null");
      if (v && typeof v === "object") {
        const r = v as Record<string, unknown>;
        if (typeof r.day === "string" && typeof r.n === "number" && Array.isArray(r.cats)) d = { day: r.day, n: r.n, cats: r.cats.filter((x): x is string => typeof x === "string") };
      }
    } catch { /* nothing kept, or not to be read: no session done */ }
    state.dailyDone = d;
  }
  return state.dailyDone;
}
/** How many sessions were done today. */
export const dailyToday = (): number => { const d = done(); return d.day === today() ? d.n : 0; };

/** What the plan and the steps that come back are made for: the learner's stages and terms, and the categories of the session before to pass over. */
const options = (): SessionOptions => ({ stages: state.stages, words: { unmet: unmetNow(), open: openNow() }, pool: state.POOL ?? undefined, avoid: new Set(done().cats) });
const groupsOf = (plan: SessionPlan): DailyGroup[] => plan.rounds.map((t) => ({ n: t.steps.length, name: roundName(ix(), t) }));

/**
 * Whether the session's last station is in front. Once anything else is (the roadmap, by the top bar or by Back), the session is over: it is forgotten here,
 * so every way of leaving the station ends it the same.
 */
export function dailyEnded(): boolean {
  const s = state.daily; if (!s || !s.end) return false;
  if (state.view === DAILY_VIEW && state.mode === "quiz" && isEx() && !state.menuOpen && !state.optsOpen) return true;
  state.daily = null; if (state.view === DAILY_VIEW) state.view = null;
  return false;
}
/** The session under way, or null. */
export function dailyRun(): DailyRun | null { dailyEnded(); return state.daily; }
/** Whether the question the exercise holds on screen is the session's (also while Review stands in front of the exercise). */
function held(): boolean {
  const s = state.daily, g = state.given;
  return !!s && !s.end && !!g && g.on && g.hooks === s.hooks && givenShown();
}
/** Whether the question on screen is the session's. */
export const dailyShown = (): boolean => held() && isEx();
/** Whether the step on screen is the last: the last of its part with nothing missed in it so far, or the last of what came back. What the Next of its result is named by. */
function last(s: DailyRun, k: number): boolean {
  return k === s.steps.length - 1 && (s.back || !s.marks.some((m, i) => i >= s.from && sessionMiss(m)));
}

/** Puts the first step from `k` on that the data still makes on screen (the stages or the terms may have changed since the plan). Whether there was one. */
function open(k: number): boolean {
  const s = state.daily; if (!s) return false;
  for (let i = k; i < s.steps.length; i++) {
    const st = s.steps[i], q = givenQuestion(ix(), st.given, givenNow());
    if (!q) { s.marks[i] = "skip"; continue; }
    const hooks: GivenHooks = {
      line: st.tie,
      get next() { return last(s, i) ? "Finish" : undefined; },
      get sprint() { return s.sprint; },
      onSprint: (on) => { s.sprint = on; },
      // (the answer is kept after its result is drawn, and again when Claude's check changes it: the row on the result is drawn again with it)
      onChecked: (grade) => { if (MARKS.includes(grade) && s.marks[i] !== grade) { s.marks[i] = grade as DailyMark; if (dailyShown()) render(); } },
      onNext: ({ skipped }) => { if (skipped && !s.marks[i]) s.marks[i] = "skip"; go(i + 1); },
    };
    // where the session stands is set before the question is drawn, so that the screen it opens on shows it
    const was = { at: s.at, hooks: s.hooks };
    s.at = i; s.hooks = hooks;
    if (openGiven(q, hooks)) return true;
    s.at = was.at; s.hooks = was.hooks;
    return false;
  }
  return false;
}
/** On from a step: the step after it; after the last of a part, what was missed in it comes back; after the last of all, the last station. */
function go(k: number): void {
  const s = state.daily; if (!s) return;
  if (k >= s.steps.length && !s.back) {
    s.back = true;
    const missed = new Set(s.steps.filter((x, i) => i >= s.from && !x.again && sessionMiss(s.marks[i])).map(stepKey));
    // what came back before is asked already: it stands with the plan as a round of its own, so that nothing comes back as the same question twice
    const before = s.steps.filter((x) => x.again);
    const plan: SessionPlan = before.length ? { rounds: [...s.plan.rounds, { kind: "pair", cats: [], steps: before }] } : s.plan;
    const back = missed.size ? comeBacks(ix(), plan, missed, options()) : [];
    if (back.length) { s.steps.push(...back); s.marks.push(...back.map((): DailyMark => "")); s.groups.push({ n: back.length, name: DAILY_BACK }); }
  }
  if (!open(k)) end();
}
/** The last step is left: the session counts for the day, its categories are kept for the next plan to pass over, and the last station is in front. */
function end(): void {
  const s = state.daily; if (!s) return;
  if (s.hooks && state.given && state.given.hooks === s.hooks) closeGiven();
  const d: DailyDone = { day: today(), n: dailyToday() + (s.counted ? 0 : 1), cats: [...new Set(s.plan.rounds.flatMap((t) => t.steps.flatMap((x) => x.cats)))] };
  state.dailyDone = d;
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* not kept: the next session may meet the same categories */ }
  s.counted = true; s.end = true; s.hooks = null;
  state.view = DAILY_VIEW; state.menuOpen = false;
  render(); top0();
}
/** From the last station: the session is over, and the roadmap is back. */
export function leaveDaily(): void {
  if (state.view === DAILY_VIEW) state.view = null;
  state.daily = null;
  toggleMenu(true);
}
/**
 * From the last station: one more round, on terms the session has not had while there are others, against the clock when it is taken as a Sprint round
 * (`sprint`). What is missed in it comes back after it, and the last station again. Whether its first question is on screen: not when the data has no round
 * left to make for the learner.
 */
export function moreDaily(sprint = false): boolean {
  const s = state.daily; if (!s || !s.end) return false;
  const more = planSession(ix(), { ...options(), rounds: 1, avoid: new Set(s.steps.flatMap((x) => x.cats)) }), steps = more.rounds.flatMap((t) => t.steps);
  if (!steps.length) return false;
  const from = s.steps.length;
  s.plan = { rounds: [...s.plan.rounds, ...more.rounds] };
  s.steps.push(...steps); s.marks.push(...steps.map((): DailyMark => "")); s.groups.push(...groupsOf(more));
  s.from = from; s.back = false; s.end = false; s.sprint = sprint;
  state.view = null;
  if (open(from)) return true;
  end();
  return false;
}

/**
 * The roadmap's stop: a session under way goes on where it was left (its question as it stood, when it was set aside; asked anew when something else
 * took its place; its last station when nothing of it can be asked any more), else a new one starts. Whether the session is in front after it: not
 * before the first question of the app is drawn, and not when the data has nothing to plan for the learner.
 */
export function startDaily(): boolean {
  if (state.mode !== "quiz" || !state.cur || !state.ui) return false;
  const s = dailyRun();
  if (s) {
    if (s.end) return true;
    if (held()) { if (isEx()) toggleMenu(false); else setTab(state.own); return true; }
    if (state.given && !state.given.on && state.given.hooks === s.hooks && resumeGiven()) return true;
    if (!open(s.at)) end();
    return true;
  }
  const plan = planSession(ix(), options()), steps = plan.rounds.flatMap((t) => t.steps);
  if (!steps.length) return false;
  state.daily = { plan, steps, groups: groupsOf(plan), marks: steps.map((): DailyMark => ""), at: 0, from: 0, back: false, end: false, counted: false, sprint: false, hooks: null };
  if (open(0)) return true;
  state.daily = null; render();
  return false;
}
