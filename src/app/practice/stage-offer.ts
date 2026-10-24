// The offer of the stages, from the result of any exercise (src/domain/stages.ts, runAfter and stageOffer). Every checked answer moves the run at
// the highest stage that is on, and the exercise's own record: whether it has warmed up, which sets how many of its questions are new, and its right
// answers, after which its guided form turns off (practice/guided.ts). When an offer is due it goes on the result (`ui.offer`); nothing changes
// without a tap, and Next past it counts as Not now. The runs are part of the progression (practice/progress.ts). On the Path every exercise shows
// the offer; the classic page shows it in Categories only, and elsewhere it waits for the next Categories result.
import { state } from "../state.js";
import { guideStep } from "./guided.ts";
import { saveProgress } from "./progress.ts";
import { render } from "../shell/render.js";
import { setStages, stageName } from "../shell/stages.js";
import type { DataIndex } from "../../ai-shared/lookup.ts";
import { stageMet } from "../../domain/intro.ts";
import { catStage, exerciseAfter, freshRun, newShare, pairStage, runAfter, stageOffer, topStage, type MissKind } from "../../domain/stages.ts";

const ix = () => state as unknown as DataIndex;
/** What a mistake in each exercise says about the words (src/domain/stages.ts, MissKind). */
const MISS: Record<string, MissKind> = { practice: "words", categories: "words", debate: "pair", find: "form", syllogism: "form" };
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

/**
 * An answer in exercise `ex` was checked, on a question new at stage `st`: the runs move, and the offer that is due, if any, goes on the result.
 * Whether one did (the negation offer then waits, one offer at a time). On the Path the next stage waits until every course term of this one has had its stop.
 */
export function stageStep(ex: string, st: number, ok: boolean): boolean {
  const miss = MISS[ex] ?? "form";
  state.stageRun = runAfter(state.stageRun, state.stages, st, ok, miss);
  state.exRuns = { ...state.exRuns, [ex]: exerciseAfter(state.exRuns[ex], ok) };
  guideStep(ex);
  const met = state.design !== "path" || !state.intro || !state.DATA || stageMet(ix(), state.intro, topStage(state.stages));
  const o = shows(ex) ? stageOffer(state.stageRun, state.stages, met, miss) : null;
  if (o && state.ui) state.ui.offer = o;
  saveProgress();
  return !!o;
}

const pending = () => { const o = state.ui && state.ui.offer; return o && o.kind !== "done" ? (o as { kind: "up" | "down"; stage: number }) : null; };
/** The run that led to an offer is spent: the next one counts from now. */
function spend() { state.stageRun = freshRun(); saveProgress(); }
/** The next question is drawn: an offer passed over is Not now, so it asks again after another run, not after every result. */
export function passStageOffer() { if (pending()) spend(); }

/** "Add stage N" or "Switch off stage N": what the offer on the result says. Nothing is done without this tap. The stage applies to every exercise. */
export function acceptStageOffer() {
  const o = pending(); if (!o || !state.ui) return;
  spend();
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
  state.ui.offer = { kind: "done", text: o.kind === "up" ? "Stage " + (o.stage - 1) + " stays the highest. It asks again after another five right in a row."
    : "Stage " + o.stage + " stays on. It asks again after another four wrong in a row." };
  render();
}
