import { state } from "../state.js";
import { REL } from "../core/rel.js";
import { checkDebate, limitMs, paused, stopTimer } from "../debate/flow.js";
import { check } from "../practice/grading.js";
import { fillable } from "../practice/screen.js";
import { focusCin, render } from "./render.js";

// Blitz: a stopwatch in the top bar, next to the practice options (the mode of practice). The seconds are set in the Practice options of the exercise (Blitz times). Three
// independent times: the relation (Relations and Pervasions), the examples (each example in Relations, each question in Pervasions) and the syllogism (Syllogisms: one
// countdown for the reply). The countdown that is running is the bar on the lower edge of the top bar (path/shell.tsx); changing one time never changes the others.
// which countdown belongs to the screen: "rel" while the relation is to be picked, "ex" for the examples (Relations) or the four questions (Pervasions), "syl" for the
// reply to a syllogism
export const tkind=()=>{
  if(state.ui&&state.ui.syllogism) return state.tab==="syllogism"&&!state.ui.checked&&state.ui.step===0&&state.mode==="quiz"?"syl":null;
  if(!state.ui||state.ui.checked||state.mode!=="quiz"||(state.tab!=="practice"&&state.tab!=="debate")) return null;
  if(state.ui.debate) return state.ui.step<4?"ex":state.ui.rel?null:"rel";
  return state.ui.rel?"ex":"rel";
};
export const kindMs=k=>k==="rel"?state.relMs:k==="syl"?state.sylMs:state.timerMs;
const exMul=()=>(relTimed()&&state.ui.rel)?Math.max(1,fillable().length):1;

// Relations tab, Blitz on: the relation pick has a countdown and the examples have one (the seconds for each example). Time up on the pick marks it wrong,
// shows the right relation and goes on to the examples. Time up on the examples checks whatever was typed; cells not reached count as left empty.
// Pervasions tab: each question has its countdown, and after the four, the relation pick has the relation's. Time up on the pick marks it wrong and shows the result.
export const relTimed=()=>!!(state.blitz&&state.ui&&!state.ui.debate&&!state.ui.checked&&state.mode==="quiz"&&state.tab==="practice");
export const relTimedD=()=>!!(state.blitz&&state.ui&&state.ui.debate&&state.ui.step>3&&!state.ui.rel&&!state.ui.checked&&state.mode==="quiz"&&state.tab==="debate");
// `spent`: the time of the countdown already gone (it goes on after a stop for a spoken answer, debate/flow.js)
export function ensureRelTimer(spent=0){
  const u=state.ui;
  if(!u||state.mode!=="quiz"||u.checked||!state.blitz||u.tq||u.hold||paused()) return;
  const t0=performance.now()-spent;
  if(u.debate){
    if(state.tab!=="debate"||u.step<4||u.rel||!state.relMs) return;
    u.tph="rel"; u.tq={t0,limit:state.relMs}; u.tid=setTimeout(()=>expireRelD(u),Math.max(1,state.relMs-spent));
    return;
  }
  if(state.tab!=="practice") return;
  const lim=limitMs(); if(!lim) return;
  if(!u.rel){ u.tph="pick"; u.tq={t0,limit:state.relMs}; u.tid=setTimeout(()=>expireRel(u),Math.max(1,state.relMs-spent)); }
  else { const total=lim*exMul(); u.tph="ex"; u.tq={t0,limit:total}; u.tid=setTimeout(()=>expireEx(u),Math.max(1,total-spent)); }
}
function expireRel(u){
  if(u!==state.ui||u.checked||u.rel||state.tab!=="practice") return;
  const k=state.cur.p.relation;
  u.tid=null; u.tq=null; u.late=true; u.rel=k; u.open=false; u.ci=0; u.seen=0; u.pop=null;
  for(const c of REL[k].empty){ u.cells[c].t=""; u.cells[c].none=false; }
  render(); focusCin();
}
function expireEx(u){
  if(u!==state.ui||u.checked||!u.rel||state.tab!=="practice") return;
  u.tid=null; u.tq=null; u.exLate=true;
  if(document.activeElement&&document.activeElement.blur) document.activeElement.blur();
  check();
}
// Pervasions: time up on the relation. The answers are checked with no relation chosen; the result shows the right one.
function expireRelD(u){
  if(u!==state.ui||u.checked||u.rel||state.tab!=="debate"||u.step<4) return;
  u.tid=null; u.tq=null; u.late=true; u.rel=state.cur.p.relation; u.open=false;
  if(document.activeElement&&document.activeElement.blur) document.activeElement.blur();
  checkDebate();
}
// a new start: after a change of the switch or the time, the running countdown begins again with its full time
export function relReset(){ if(state.ui&&!state.ui.checked&&(!state.ui.debate||state.ui.step>3)) stopTimer(); }
// the bar of a countdown that is stopped for a spoken answer (debate/flow.js) stands still where it is, and goes on with the clock
export function freezeBar(on){ for(const i of document.querySelectorAll(".pclock i")) i.style.animationPlayState=on?"paused":""; }
