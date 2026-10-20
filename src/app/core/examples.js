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

/** What each level is, for its switch in Options: a name and a sentence (the levels are explained in docs/DATA.md). */
export const LEVEL_INFO={
  1:["Plain things","Everyday things as they are: a clay pot, smoke, a color. No twist."],
  2:["One step","One twist on a plain thing: its absence, its cause, a mind that sees it. Or a term that needs a short note."],
  3:["Two steps","Two twists in a row, such as the absence of the effect of a pot. Or an example that rests on doctrine."],
  4:["Layered","Three or more twists, such as a mind that sees the absence of the cause of a pot."]
};

/** More references for the cells of the next pair, from the reference examples of the levels that are on; undefined when this device has none (the practice list alone then). */
export function moreRefs(){ return state.EX?witnessesOf(state,state.EX.items,state.exLevels):undefined; }
