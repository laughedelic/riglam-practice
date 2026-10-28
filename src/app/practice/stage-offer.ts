// The offer of the stages, from the result of any exercise (src/domain/stages.ts, runAfter and stageOffer). On the Path the stages are chapters of one
// list of terms: a stage that brings new terms comes with the first of them, once the stage below has brought all of its own and few enough terms are
// open (src/domain/intro.ts, nextStageDue). The ladder ends at stage 9: the stages after it are the layers of depth, which the Path offers on a result like
// any offer (the first once the last answer on each term of stage 9 is right, the others after a run) and the Difficulty page sets; on the classic page
// every stage waits for a run of right answers.
// Every checked answer moves the run at the highest stage that is on, and the exercise's own record: whether it has warmed up, which sets how many of its
// questions are new, and its right answers, after which its guided form turns off (practice/guided.ts). On the Path the next stage comes by itself: when
// it is due, Next on the result goes to a station of its own that says which stage comes in (and, the first time, what the stages are), `ui.up`; Next from
// it takes the stage, and the learner may stay on the stage they are on a while longer (a run of right answers then comes after the terms) or move the
// stages themselves (the Stages page). Taking a stage off is still an offer on the result (`ui.offer`), as it is on the classic page, which shows both in
// Categories only; nothing changes there without a tap, and Next past it counts as Not now. The runs are part of the progression (practice/progress.ts).
import { state } from "../state.js";
import { DEPTH_NAME, isDepth } from "./difficulty.ts";
import { guideStep } from "./guided.ts";
import { saveProgress } from "./progress.ts";
import { render } from "../shell/render.js";
import { setStages, stageName } from "../shell/stages.js";
import type { DataIndex } from "../../ai-shared/lookup.ts";
import { nextStageDue, stageMarks } from "../../domain/intro.ts";
import { LADDER_TOP, NO_TERMS, cameDown, catStage, exerciseAfter, ladderOf, ladderTop, movedUp, newShare, pairStage, restartRun, runAfter, setManual, stageOffer, stageProgress, stayLonger, termsOf, topStage, withDepth, type MissKind, type StageProgress } from "../../domain/stages.ts";

const ix = () => state as unknown as DataIndex;
/** What a mistake in each exercise says about the words (src/domain/stages.ts, MissKind). */
const MISS: Record<string, MissKind> = { practice: "words", categories: "words", debate: "pair", find: "form", syllogism: "form", instance: "form" };
const shows = (ex: string) => state.design === "path" || ex === "categories";

/** The stage a pair is new at: its categories' and the things that fill its cells (pairStage); for a pair the stages cannot draw, its categories'. */
export function pairStageNow(a: string | null | undefined, b: string | null | undefined): number {
  const A = a ? state.CAT[a] : null, B = b ? state.CAT[b] : null;
  const st = A && B ? pairStage(ix(), A.id, B.id, state.stages) : null;
  return st ?? Math.max(A ? catStage(A) : 0, B ? catStage(B) : 0);
}
/** The stage of the categories a question used (a syllogism's reason and predicate). */
export const catsStageNow = (cats: (string | null | undefined)[]): number => Math.max(0, ...cats.map((c) => (c && state.CAT[c] ? catStage(state.CAT[c]) : 0)));

/** The share of new questions for the exercise on screen: a quarter until its first run of right answers, then half (src/domain/stages.ts). */
export const shareNow = (): number => newShare(state.exRuns[state.own || state.tab]);

/** The new terms of a stage with their marks (src/domain/intro.ts, stageMarks): on the Path, which has the term stops; none on the classic page, where the run alone moves the stages. */
const marksAt = (n: number) => (state.design === "path" && state.intro && state.DATA ? stageMarks(ix(), state.intro, n) : []);
const marksNow = () => marksAt(topStage(state.stages));
/** Whether the next stage's first term is due at the learner's pace (src/domain/intro.ts, nextStageDue): on the Path, when the next stage brings new terms; undefined otherwise. */
const nextNow = () => (state.design === "path" && state.intro && state.DATA ? nextStageDue(ix(), state.intro, state.stages, state.pace) : undefined);

/**
 * An answer in exercise `ex` was checked, on a question new at stage `st`, after its terms were graded (practice/stops.ts): the runs move, and what is
 * due, if anything, is kept for Next: the next stage on the Path (`ui.up`, a station), an offer on the result elsewhere (`ui.offer`). Whether something
 * was due (the negation offer then waits, one at a time). On the Path the next stage comes with its first term (`nextNow`).
 */
export function stageStep(ex: string, st: number, ok: boolean): boolean {
  const miss = MISS[ex] ?? "form";
  state.stageRun = runAfter(state.stageRun, state.stages, st, ok, miss);
  state.exRuns = { ...state.exRuns, [ex]: exerciseAfter(state.exRuns[ex], ok) };
  guideStep(ex);
  const marks = marksNow(), terms = marks.length ? { ...termsOf(marks), next: nextNow() } : NO_TERMS;
  const o = shows(ex) ? stageOffer(state.stageRun, state.stages, terms, miss) : null;
  if (o && state.ui) { if (o.kind === "up" && state.design === "path" && o.stage <= LADDER_TOP) state.ui.up = { stage: o.stage }; else state.ui.offer = o; }
  saveProgress();
  return !!o;
}

/**
 * How far the highest stage is towards the next one, for the ring in the top bar (src/domain/stages.ts, stageProgress): its new terms with their marks, or the run.
 * On the Path the ring is the ladder's: depth is a difficulty of its own (the Difficulty page), so from stage 9 on it shows stage 9's terms.
 */
export const progressNow = (): StageProgress => state.design === "path"
  ? stageProgress(state.stageRun, ladderOf(state.stages), marksAt(ladderTop(state.stages)), nextNow(), LADDER_TOP)
  : stageProgress(state.stageRun, state.stages, marksNow(), nextNow());

/** Whether an offer is of a layer of depth (on the Path: src/domain/stages.ts, LADDER_TOP), not of a stage. */
const deep = (stage: number) => state.design === "path" && isDepth(stage);
const pending = () => { const o = state.ui && state.ui.offer; return o && o.kind !== "done" ? (o as { kind: "up" | "down"; stage: number }) : null; };
/** The run that led to an offer is spent: the next one counts from now. */
function spend() { state.stageRun = restartRun(state.stageRun); saveProgress(); }
/** The next question is drawn: an offer passed over is Not now, so it asks again after another run, not after every result. */
export function passStageOffer() { if (pending()) spend(); }

/**
 * Before the next question: the stage that came due with this answer goes on it as a station of its own, which says which stage comes in. Whether it did.
 * A stage that is not the next one any more (the learner changed the stages meanwhile), or the learner moving the stages themselves, drops it.
 */
export function takeStageUp(): boolean {
  const u = state.ui, up = u && u.up; if (!u || !up || up.shown) return false;
  if (up.stage !== topStage(state.stages) + 1 || state.stageRun.manual) { u.up = null; return false; }
  u.up = { ...up, shown: true, first: !state.stageRun.told }; u.dterm = null; u.pop = null;
  return true;
}
/** Whether Next on the answer on screen goes to the station of the stage coming in (what `takeStageUp` would do), for the name and look of the Next station. */
export function stageUpDue(): boolean {
  const u = state.ui, up = u && u.up;
  return !!up && !up.shown && up.stage === topStage(state.stages) + 1 && !state.stageRun.manual;
}
/** Next on the station: the stage comes in next to the ones that were on, and the run starts again; unless the learner chose to stay, or took the stages into their own hands meanwhile. */
export function closeStageUp() {
  const u = state.ui, up = u && u.up; if (!u || !up || !up.shown) return;
  u.up = null;
  if (up.stayed || state.stageRun.manual) return;
  state.stageRun = movedUp(state.stageRun);
  if (state.stages.includes(up.stage)) saveProgress();
  else setStages([...state.stages, up.stage].sort((a: number, b: number) => a - b));     // saves the progression, and its first term comes at the next pull
}
/** "Stay on stage N a while longer": the stage does not come in now, and comes after a longer run of right answers. */
export function stayOnStage() {
  const u = state.ui, up = u && u.up; if (!u || !up || !up.shown || up.stayed) return;
  u.up = { ...up, stayed: true, was: state.stageRun }; state.stageRun = stayLonger(state.stageRun); saveProgress(); render();
}
/** Undo of "stay": the run is as it was, and the stage comes in at Next again (the station was seen, so it stays told). */
export function undoStay() {
  const u = state.ui, up = u && u.up; if (!u || !up || !up.stayed || !up.was) return;
  state.stageRun = { ...up.was, told: true }; u.up = { stage: up.stage, shown: true, ...(up.first ? { first: true } : {}) }; saveProgress(); render();
}
/** Whether the stages move up by themselves (the default), or the learner moves them (the Stages page). */
export const movesUp = (): boolean => !state.stageRun.manual;
export function setMovesUp(on: boolean) { state.stageRun = setManual(state.stageRun, !on); saveProgress(); render(); }

/** "Add stage N" or "Switch off stage N": what the offer on the result says. Nothing is done without this tap. The stage applies to every exercise. */
export function acceptStageOffer() {
  const o = pending(); if (!o || !state.ui) return;
  if (o.kind === "up") spend(); else { state.stageRun = cameDown(state.stageRun); saveProgress(); }     // a stage taken off comes back after a run, not at the next answer
  if (deep(o.stage)) {      // on the Path, a layer of depth: what it is named on the Difficulty page
    const d = o.stage - LADDER_TOP - (o.kind === "up" ? 0 : 1);
    state.ui.offer = { kind: "done", text: o.kind === "up" ? "Depth: " + DEPTH_NAME[d] + ", from the next question, in every exercise. Change it on the Difficulty page."
      : (d ? "Depth: " + DEPTH_NAME[d] + " for now." : "No chains for now.") + " Change it on the Difficulty page." };
    setStages(withDepth(state.stages, d));
    return;
  }
  if (o.kind === "up") {
    state.ui.offer = { kind: "done", text: "Stage " + o.stage + ", " + stageName(o.stage).toLowerCase() + ", is on now in every exercise, next to the stages you had. Switch any of them off in the practice options." };
    setStages([...state.stages, o.stage].sort((a, b) => a - b));
  } else {
    const rest = state.stages.filter((n: number) => n !== o.stage), now = rest.length ? rest : [o.stage - 1];     // the only stage on: the one below takes its place
    state.ui.offer = { kind: "done", text: "Stage " + o.stage + " is off for now" + (rest.length ? "" : ", stage " + (o.stage - 1) + " is on instead") + ". Switch stages on and off in the practice options." };
    setStages(now);
  }
}
/** "Not now": the stages stay as they are, and the next offer needs another run. */
export function declineStageOffer() {
  const o = pending(); if (!o || !state.ui) return;
  spend();
  if (deep(o.stage)) {
    state.ui.offer = { kind: "done", text: o.kind === "up" ? (o.stage === LADDER_TOP + 1 ? "No chains for now." : "No deeper layer for now.") + " It asks again after another five right in a row."
      : "The chains stay. It asks again after another four wrong in a row." };
    render();
    return;
  }
  state.ui.offer = { kind: "done", text: o.kind === "up" ? "Stage " + (o.stage - 1) + " stays the highest. It asks again after another five right in a row."
    : "Stage " + o.stage + " stays on. It asks again after another four wrong in a row." };
  render();
}
