// Guidance, the help each exercise gives on the Path, in three levels (src/domain/stages.ts): Detailed, Hints, None. An exercise starts at Detailed
// and steps down by itself as its right answers come (GUIDE_RIGHT each step), and the result says so; a level the learner picks in the exercise's
// practice options stays. Part of the progression (practice/progress.ts), so Reset progression starts every exercise at Detailed again.
import { state } from "../state.js";
import { saveProgress } from "./progress.ts";
import { render } from "../shell/render.js";
import { guidanceOf, guidanceStep } from "../../domain/stages.ts";
import type { ExerciseRun, Guidance } from "../../domain/stages.ts";

/** The names of the levels, as the practice options show them. */
export const GUIDANCE_NAMES: Record<Guidance, string> = { detailed: "Detailed", hints: "Hints", none: "None" };

/** Each exercise on the Path: its name, and what each level of guidance shows in it. */
export const GUIDES: Record<string, { name: string } & Record<Guidance, string>> = {
  practice: {
    name: "Relations",
    detailed: "Each relation spelled out with the pair’s two terms, and each example asked for in a full sentence.",
    hints: "Each relation spelled out with A and B; each example asked for by its case alone (both A and B); a case without your example says it has one, without naming it.",
    none: "The relations by their names alone; each example by its case; a case without your example says it has one, without naming it.",
  },
  debate: {
    name: "Pervasions",
    detailed: "Why? says what a counter-example would be, in the pair’s words, and asks for one the same way; the relations as in Relations.",
    hints: "Why? says what a counter-example would be, with A and B; the relations spelled out with A and B; a question without your example says there is one, without naming it.",
    none: "Accept and Why? side by side, and the relations by their names alone; a question without your example says there is one, without naming it.",
  },
  find: {
    name: "Find a pair",
    detailed: "The relation spelled out with A and B, course terms suggested as you type, and each example asked for in a full sentence.",
    hints: "The relation spelled out with A and B; nothing suggested as you type; each example asked for by its case alone (both A and B); a case without your example says it has one.",
    none: "The relation by its name alone; nothing suggested as you type; each example by its case; a case without your example says it has one.",
  },
  syllogism: {
    name: "Syllogisms",
    detailed: "Each reply spelled out with this syllogism’s own words, and the result explains all three checks.",
    hints: "Each reply as a formula in S, P and R, and the result shows only the check that decides, as a formula.",
    none: "The replies by their names alone, no S, P and R legend, and the result names only the check that decides.",
  },
  categories: {
    name: "Categories",
    detailed: "A line that says what to do, with the thing’s name.",
    hints: "A short line that says what to do.",
    none: "The categories alone.",
  },
  instance: {
    name: "Find an instance",
    detailed: "Things the course knows, suggested as you type.",
    hints: "Nothing suggested as you type.",
    none: "Nothing suggested as you type.",
  },
};

/** The level of guidance exercise `ex` shows. */
export const guidance = (ex: string): Guidance => guidanceOf(state.guided[ex], state.exRuns[ex]);
/** The learner's pick: it stays. */
export function setGuidance(ex: string, g: Guidance) { state.guided = { ...state.guided, [ex]: g }; saveProgress(); render(); }
/** A checked answer in `ex` (practice/stage-offer.ts, stageStep, which saves), `before` its record before the answer: when the answer took the guidance a step down by itself, the result says so. */
export function guideStep(ex: string, before: ExerciseRun | undefined) {
  if (!GUIDES[ex]) return;
  const to = guidanceStep(state.guided[ex], before, state.exRuns[ex]);
  if (to && state.ui) state.ui.guideDown = { ex, to };
}
