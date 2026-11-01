import { state } from "../state.js";
import { REL } from "../core/rel.js";
import { checkDebate, expireQ } from "../debate/flow.js";
import { timeUpName } from "../find/flow.js";
import { timeUpCategories, timeUpCategory } from "../categories/flow.js";
import { timeUpInstance } from "../instance/flow.ts";
import { check } from "../practice/grading.js";
import { guidance } from "../practice/guided.ts";
import { keepOwn } from "../practice/per-exercise.ts";
import { moveOn } from "../practice/queue.js";
import { fillable, settled } from "../practice/screen.js";
import { expireSyllogism } from "../syllogism/flow.js";
import { focusCin, render } from "./render.js";
import { cue } from "../sound/play.ts";
import { NAME_TIMES, TIME_KEY, nextAfterTimeUp, timeUpView } from "../../domain/sprint.ts";

/* ---------- Sprint: the clock of a step (the code and what is stored still say Blitz) ---------- */
// A clock times one step of an exercise, the same way in all six: choosing the relation, choosing Accept or Why?, writing an example (each case on its own clock), naming a pair,
// the reply to a syllogism, the ticks of Categories (the screen, or one category), the thing named in Find an instance. `stepNow()` says which step the screen is at, and what
// time up does to it; the rest follows from that: `ensureClock()` runs at every render (shell/render.js) and starts the clock of the step the screen is at, ends the one of a step
// that is over, and pauses the one that is running while something covers the exercise (Settings, the practice options, the question before a skip, the roadmap, Review). A
// pause keeps the time the step had left, and the clock goes on from there; a new step is a new clock. The switch is the stopwatch in the top bar: each exercise keeps its own
// (practice/per-exercise.ts), and the times are in the practice options (domain/sprint.ts has the numbers). The bar that runs is path/clock.tsx.
//
// The state of an attempt (`state.ui`): `tq` the clock that runs ({t0, limit, key, kind}), `tid` its timeout, `rest` a paused clock ({key, spent}), `ck` the key of the step the
// attempt is at (even with the switch off: `qStart`, when that step began, is what the times of the answers are taken from), `hold` a clock stopped for a spoken answer.
const now = () => performance.now();
const store = (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* the choice holds for this visit */ } };
/** The exercise an attempt is in, by its tab. */
const tabOf = (u) => u.syllogism ? "syllogism" : u.debate ? "debate" : u.find ? "find" : u.cats ? "categories" : u.inst ? "instance" : "practice";
export const kindMs = (k) => state.times[k];
/** Something covers the exercise: the clock does not run behind it. */
export const paused = () => state.optsOpen || state.sessOpen || state.skipAsk || state.menuOpen;
/** The page of the relations is over the examples (Pick another, or Find a pair's relation): the case waits under it. */
const covered = (u) => !!u.open && (!!u.find || (!u.debate && !u.syllogism && !u.cats && !u.inst && !!u.rel));

const blurred = () => { const a = document.activeElement; if (a && a.blur) a.blur(); };

// ---- what each step does when its time is up
// Relations, the relation: marked wrong, the right one is shown (spelled out with the pair at Detailed, by its name at Hints), and the path goes on to the examples. At None
// the pair is kept as wrong with no example asked (its relation was not given), and the next pair comes (domain/sprint.ts, timeUpView).
function expireRel(u) {
  if (u !== state.ui || u.checked || u.rel || state.tab !== "practice") return;
  cue("timeup");
  const k = state.cur.p.relation;
  u.tid = null; u.tq = null; u.late = true; u.rel = k; u.open = false; u.ci = 0; u.seen = 0; u.pop = null;
  for (const c of REL[k].empty) { u.cells[c].t = ""; u.cells[c].none = false; }
  if (timeUpView(guidance("practice")) === "skip") {
    u.exLate = true; u.missed = Object.fromEntries(fillable().map((c) => [c, true])); u.pall = true; u.passOn = true;
    blurred(); check(); moveOn(); return;
  }
  render(); focusCin();
}
// Pervasions, the relation: the answers are checked with no relation chosen, and the result shows the right one
function expireRelD(u) {
  if (u !== state.ui || u.checked || u.rel || state.tab !== "debate" || u.step < 4) return;
  cue("timeup");
  u.tid = null; u.tq = null; u.late = true; u.rel = state.cur.p.relation; u.open = false;
  blurred();
  checkDebate();
}
// An example (Relations, Find a pair): the case stays as it is typed, empty if nothing is, and the path goes on to the next case with no example. A case that ran out is not
// asked again; after the last one the pair is checked.
function expireCase(u) {
  if (u !== state.ui || u.checked || u.pall || (u.find ? u.step !== 1 : !u.rel)) return;
  cue("timeup");
  u.tid = null; u.tq = null; u.exLate = true;
  const order = /** @type {string[]} */ (fillable()), ci = Math.max(0, Math.min(u.ci || 0, order.length - 1));
  u.missed = { ...u.missed, [order[ci]]: true };
  const next = nextAfterTimeUp(order, ci, (c) => settled(/** @type {any} */ (c), u));
  if (next) { u.ci = order.indexOf(next); u.pall = false; render(); focusCin(); return; }
  blurred();
  u.pall = true;
  check();
}
// Find a pair, the pair: two words named go on to the examples; otherwise it is a miss, with no result, and the next relation comes
function expireName(u) {
  if (u !== state.ui || u.checked || !u.find || u.step !== 0) return;
  cue("timeup");
  u.tid = null; u.tq = null; blurred();
  timeUpName();
}
// Categories, the ticks on one screen: what is ticked stands, and the screen is checked as it is
function expireCats(u) {
  if (u !== state.ui || u.checked || !u.cats || u.ask === "one") return;
  cue("timeup");
  u.tid = null; u.tq = null;
  timeUpCategories();
}
// Categories, one category: counts as no, and the next is asked
function expireCat(u) {
  if (u !== state.ui || u.checked || !u.cats || u.ask !== "one") return;
  cue("timeup");
  u.tid = null; u.tq = null;
  timeUpCategory();
}
// Find an instance: what is written stands and is checked; with nothing written it is a miss, with no result, and the next set comes
function expireInstance(u) {
  if (u !== state.ui || u.checked || !u.inst) return;
  cue("timeup");
  u.tid = null; u.tq = null; blurred();
  timeUpInstance();
}

// ---- the step the screen is at
/** The case of the examples that is open, with its clock; null when no case is open (the pick page is over them, or the Check was taken). `done`: it has an example already, so
 *  coming back to it starts no clock. */
function caseStep(u) {
  if (u.open || u.pall || (u.find && u.step !== 1)) return null;
  const order = fillable(); if (!order.length) return null;
  const c = order[Math.max(0, Math.min(u.ci || 0, order.length - 1))];
  return { key: "c-" + c, kind: "ex", done: settled(c, u), expire: expireCase };
}
/**
 * The step the attempt on screen is at, if an answer is asked for: `key` names it, `kind` is the time it takes (domain/sprint.ts; `mul` of it), `expire` what its time up does.
 * Null when nothing is asked: the result is shown, the exercise is under another screen, or the step has no clock (a pick page over the examples).
 */
export function stepNow() {
  const u = state.ui;
  if (!u || state.mode !== "quiz" || u.checked || state.tab !== tabOf(u)) return null;
  if (u.syllogism) return u.step === 0 ? { key: "reply", kind: "syl", expire: expireSyllogism } : null;
  if (u.debate) {
    if (u.step < 4) return u.pickWhy ? { key: "w" + u.step, kind: "ex", expire: expireQ } : { key: "q" + u.step, kind: "q", expire: expireQ };
    return u.rel ? null : { key: "rel", kind: "rel", expire: expireRelD };
  }
  if (u.find) return u.open ? null : u.step === 0 ? { key: "name", kind: "ex", mul: NAME_TIMES, expire: expireName } : caseStep(u);
  if (u.cats) return u.ask === "one" ? { key: "cat" + u.i, kind: "cat", expire: expireCat } : { key: "cats", kind: "cats", expire: expireCats };
  if (u.inst) return { key: "inst", kind: "ex", expire: expireInstance };
  return u.rel ? caseStep(u) : { key: "pick", kind: "rel", expire: expireRel };
}

// ---- the clock
/** Ends the clock of the step: it is answered, or the screen moved on. Nothing is kept of the time it had. */
export function stopTimer(u = state.ui) {
  if (!u) return;
  if (u.tid) { clearTimeout(u.tid); u.tid = null; }
  u.tq = null; u.rest = null;
}
/** Stops the running clock and keeps the time the step had left: it goes on from there when the exercise is in front again. */
export function pauseClock(u = state.ui) {
  if (!u) return;
  if (u.tid) { clearTimeout(u.tid); u.tid = null; }
  if (u.tq) { u.rest = { key: u.tq.key, spent: now() - u.tq.t0 }; u.tq = null; }
}
function begin(u, w, spent) {
  const was = u.rest && u.rest.key === w.key ? u.rest.spent : null;
  u.rest = null;
  const sp = spent !== undefined ? spent : was || 0, lim = state.blitz ? kindMs(w.kind) * (w.mul || 1) : 0;
  u.ck = w.key; u.qStart = now() - sp;
  if (w.kind === "q") u.ans[u.step].limit = lim;           // the time of the question, kept with the answer (Review)
  if (w.done && was === null && !sp) return;                // an example that is written: no clock for it
  if (!lim) return;
  u.tq = { t0: u.qStart, limit: lim, key: w.key, kind: w.kind }; u.tph = w.key;
  u.tid = setTimeout(() => w.expire(u), Math.max(1, lim - sp));
}
/**
 * Makes the clock fit the screen: runs at every render. `spent`: the time of the step already gone (a clock that goes on after a stop for a spoken answer, `releaseClock`);
 * without it a step that was paused goes on from where it stopped, and any other starts with its full time.
 */
export function ensureClock(spent) {
  const u = state.ui;
  if (!u || u.hold) return;
  if (paused() || state.mode !== "quiz" || state.tab !== tabOf(u) || (!u.checked && covered(u))) { pauseClock(u); return; }
  const w = u.checked ? null : stepNow();
  if (!w) { if (u.tq || u.rest) stopTimer(u); u.ck = null; return; }
  if (u.tq && u.tq.key === w.key) return;
  if (u.tq) stopTimer(u);                                   // the step moved on: a new step is a new clock
  const resuming = !!u.rest && u.rest.key === w.key;
  if (u.ck === w.key && !resuming && spent === undefined && (!state.blitz || w.done)) return;     // begun already, and no clock is to run on it
  begin(u, w, spent);
}

// ---- stopped for a spoken answer
// The clock stands still while a question is read aloud and while a spoken answer waits for its confirmation (shell/voice.js), and that time is not counted in the time of the
// answer. `u.hold` also keeps the render from starting a clock of its own.
// the bar of a clock that is stopped (debate/flow.js) stands still where it is, and goes on with the clock
export function freezeBar(on) { for (const i of document.querySelectorAll(".pclock i")) i.style.animationPlayState = on ? "paused" : ""; }
export function holdClock() {
  const u = state.ui; if (!u || u.hold || u.checked) return;
  const spent = u.tq ? now() - u.tq.t0 : u.rest ? u.rest.spent : u.ck ? now() - u.qStart : 0;
  u.hold = { spent, run: !!u.tq || !!u.rest, stage: u.ck };
  if (u.tid) { clearTimeout(u.tid); u.tid = null; }
  u.tq = null; freezeBar(true);
}
// `how`: "resume" when the answer was confirmed or taken back (the clock goes on from where it stopped), "fresh" when the reading ended (the time of the step starts anew),
// "moved" when the screen went on some other way (the step that is still the same goes on from where it stopped, a new step starts its own). `ui` is the attempt that was held:
// it may have been put aside since, and then only the hold is dropped, as it starts its clocks afresh when it comes back.
export function releaseClock(how, ui = state.ui) {
  const h = ui && ui.hold; if (!ui || !h) return;
  ui.hold = null;
  if (ui !== state.ui) return;
  freezeBar(false);
  if (ui.checked) return;
  const w = stepNow(), spent = how === "fresh" || (how === "moved" && (!w || w.key !== h.stage)) ? 0 : h.spent;
  ensureClock(spent);
}

// ---- the switch and the times
/** The stopwatch in the top bar: Sprint on or off for the exercise on screen. The step in front starts again, with its full time. */
export function setBlitz(on) {
  state.blitz = on; keepOwn("blitz", on, false);
  const u = state.ui;
  if (u) { if (on && u.hold) { u.hold.spent = 0; u.hold.run = true; } stopTimer(u); }
  render();
}
/** One of the times (domain/sprint.ts): the step in front starts again with the new time. */
export function setTimer(ms, kind) {
  state.times[kind] = ms; store(TIME_KEY[kind], String(ms));
  const u = state.ui;
  if (u) { u.rest = null; if (u.tq && u.tq.kind === kind) stopTimer(u); }
  render();
}
