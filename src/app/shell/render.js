import { state } from "../state.js";
import { $ } from "../core/dom.js";
import { dropStaleDef } from "../practice/terms.js";
import { navSync } from "./history.js";
import { ensureRelTimer } from "./timers.js";
import { voiceAfterRender, voiceBeforeRender } from "./voice.js";
import { pathTop, renderPath } from "../path/index.tsx";

/* ---------- rendering ---------- */
// The page is drawn by the Path (src/app/path) into #path from the state; this module only makes sure that every change of state that redraws the page
// does so, and the few things around the draw (the clock of a question, the voice, the history entries).
export const CELL_FULL={both:"Both A and B", anb:"A, not B", bna:"B, not A", nei:"Neither A nor B"};
export const top0=pathTop;
export const isEx=()=>state.tab==="practice"||state.tab==="debate"||state.tab==="find"||state.tab==="syllogism"||state.tab==="categories"||state.tab==="instance";
export const focusCin=()=>{ const i=$("cin"); if(i) i.focus({preventScroll:true}); };
export function render(){
  voiceBeforeRender();   // a screen that voice did not speak for lets go of its clock before this render starts the next one
  ensureRelTimer();
  renderPath(); dropStaleDef(); voiceAfterRender();
  state.motion=true; // from now on panels slide (shell/motion.js)
  navSync();
}
/** After a check the result is shown from its top; the Path puts the focus on its station itself (src/app/path). */
export function focusAfterCheck(){ top0(); }
