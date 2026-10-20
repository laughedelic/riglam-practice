import { state } from "../state.js";
import { makeExampleIndex, readExamples } from "../../ai-shared/examples.ts";
import { witnessesOf } from "../../domain/reference.ts";

/**
 * Reads the course's reference examples the platform holds (platform.examples, docs/DATA.md) into `state.EX`, or null when it has none.
 * The device gets them in the background after the start, so this runs at the start, after a Magic Key was taken in place, and whenever the
 * platform says a newer copy arrived (platform.onExamples). Nothing is drawn from here: what shows examples reads `state.EX` when it draws.
 */
export async function loadExamples(platform){
  try{ const ex=platform.examples?readExamples(await platform.examples()):null; state.EX=ex&&ex.items.length?makeExampleIndex(ex):null; }catch(e){ state.EX=null; }
}

/** The levels a learner can choose to see examples up to (Options, `rd-exlevel`). */
export const EX_LEVELS=[1,2,3,4];

/** More references for the cells of the next pair, from the reference examples up to the chosen level; undefined when this device has none (the practice list alone then). */
export function moreRefs(){ return state.EX?witnessesOf(state,state.EX.items,state.exLevel):undefined; }
