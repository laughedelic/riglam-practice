// The guided form of each exercise on the Path (src/domain/stages.ts, GUIDE_RIGHT). On by default, an exercise shows its hints: the structure,
// the sentences spelled out, the terms suggested. After GUIDE_RIGHT right answers in it, the guided form turns off by itself, once, and the result
// says so; from then on only the learner's switch in the exercise's practice options changes it. Part of the progression (practice/progress.ts),
// so Reset progression turns it on again. The classic page keeps its own switches.
import { state } from "../state.js";
import { saveProgress } from "./progress.ts";
import { render } from "../shell/render.js";
import { guideTurnsOff, guidedOn } from "../../domain/stages.ts";

/** The exercises with a guided form: the name, what the guided form shows, and what changes once it is off. */
export const GUIDES: Record<string, { name: string; on: string; off: string }> = {
  practice: { name: "Relations", on: "the relations spelled out with the pair", off: "the relations come by their names alone" },
  debate: { name: "Pervasions", on: "what Accept and Why? say, and the relations spelled out", off: "Accept, Why? and the relations come by their names alone" },
  find: { name: "Find a pair", on: "course terms suggested as you type", off: "the course terms are no longer suggested as you type" },
  syllogism: { name: "Syllogisms", on: "what each reply says in S, P and R", off: "the replies come with a few plain words, not spelled out in S, P and R" },
};

/** Whether exercise `ex` shows its guided form. */
export const guided = (ex: string): boolean => guidedOn(state.guided[ex]);
/** The learner's switch: it stays as set. */
export function setGuided(ex: string, on: boolean) { state.guided = { ...state.guided, [ex]: on }; saveProgress(); render(); }
/** A checked answer in `ex` (practice/stage-offer.ts, stageStep, which saves): the guided form turns off by itself once the exercise has its right answers, on the Path. */
export function guideStep(ex: string) {
  if (state.design !== "path" || !GUIDES[ex] || !guideTurnsOff(state.guided[ex], state.exRuns[ex])) return;
  state.guided = { ...state.guided, [ex]: false };
  if (state.ui) state.ui.guideOff = ex;
}
