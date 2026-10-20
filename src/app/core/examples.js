import { state } from "../state.js";
import { makeExampleIndex, readExamples } from "../../ai-shared/examples.ts";

/**
 * Reads the course's reference examples the platform holds (platform.examples, docs/DATA.md) into `state.EX`, or null when it has none.
 * The device gets them in the background after the start, so this runs at the start, after a Magic Key was taken in place, and whenever the
 * platform says a newer copy arrived (platform.onExamples). Nothing is drawn from here: what shows examples reads `state.EX` when it draws.
 */
export async function loadExamples(platform){
  try{ const ex=platform.examples?readExamples(await platform.examples()):null; state.EX=ex&&ex.items.length?makeExampleIndex(ex):null; }catch(e){ state.EX=null; }
}
