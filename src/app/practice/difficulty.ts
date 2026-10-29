// The difficulty besides the stages, on the Difficulty section of the Path's Progression page (path/difficulty.tsx): the pace (how many course terms may be open at once before a new
// one waits, and how many questions apart new terms come, src/domain/intro.ts, PACES and paceSpacing), the negations (src/domain/stages.ts, NEG_OPEN) and the depth (layers of chains: the stages after the ladder's last, LADDER_TOP).
// The pace starts steady, the negations and the depth off; all are part of the progression (practice/progress.ts). A result suggests the next step of the negations and the next layer of depth
// (practice/negations.ts, practice/stage-offer.ts), and the page sets them.
import { state } from "../state.js";
import { render } from "../shell/render.js";
import { setStages } from "../shell/stages.js";
import { saveProgress } from "./progress.ts";
import { normPace } from "../../domain/intro.ts";
import { LADDER_TOP, NEG_OPEN, depthOf, depthOpen, restartRun, topStage, withDepth } from "../../domain/stages.ts";

const store = (key: string, v: string) => { try { localStorage.setItem(key, v); } catch { /* private mode: the page's start has it */ } };

/** The names of the paces, by the most terms open at once. */
export const PACE_NAME: Record<number, string> = { 2: "careful", 3: "steady", 5: "brisk" };
/** The layers of depth, by how many are on (each a stage after the ladder's last), in a few words; and as the Progression page's choice says them. */
export const DEPTH_NAME = ["off", "one layer", "two layers", "three or more layers"] as const;
export const DEPTH_PICK = ["Off", "One layer", "Two layers", "Three or more"] as const;
/** What each layer of depth asks, in a few words (the stages after the ladder's last say more: src/domain/stages.ts). */
export const DEPTH_ASKS = ["", "the absence of a familiar thing, its cause, a mind that knows it.", "one layer on another, such as the absence of the effect of a pot.", "three layers or more, and statements."] as const;

export function setPace(n: number) { state.pace = normPace(n); store("rd-pace", String(state.pace)); saveProgress(); render(); }

/** Whether the negations can be switched on: from stage NEG_OPEN. */
export const negationsOpen = (): boolean => topStage(state.stages) >= NEG_OPEN;
/** The layers of depth that are on, and whether depth can be set (stage LADDER_TOP is on). */
export const depthNow = (): number => depthOf(state.stages);
export const depthCanSet = (): boolean => depthOpen(state.stages);
/** Whether a stage is a layer of depth: after the ladder's last. */
export const isDepth = (stage: number): boolean => stage > LADDER_TOP;

/** Depth set on the page: the layers up to `d` are on, those after off, and the run starts again. */
export function setDepth(d: number) {
  const now = withDepth(state.stages, d); if (now.join() === state.stages.join()) return;
  state.stageRun = restartRun(state.stageRun);
  setStages(now);
}
