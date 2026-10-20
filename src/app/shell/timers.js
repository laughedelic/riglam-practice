import { state } from "../state.js";
import { $, el } from "../core/dom.js";
import { tbIcon } from "../core/icons.js";
import { REL } from "../core/rel.js";
import { isWide } from "../core/viewport.js";
import { checkDebate, limitMs, paused, stopTimer } from "../debate/flow.js";
import { check } from "../practice/grading.js";
import { fillable } from "../practice/screen.js";
import { focusCin, render } from "./render.js";

// Blitz: a stopwatch in the top bar, next to the practice options (the mode of practice): outline when off, filled when on. No box, no number: the seconds are in its name
// and set in the Practice options of the exercise (Blitz times). Two independent times: the relation (Relations and Pervasions) and the examples (each example in
// Relations, each question in Pervasions). The countdown that is running is the bar on the top edge of the pair bar (shell/pbar.js); changing one time never changes the other.
// The toolbar icons (stopwatch, star, skip) share one line style: 24 px, stroke 1.75, outline when off, filled when on (src/app/core/icons.js).
// which countdown belongs to the screen: "rel" while the relation is to be picked, "ex" for the examples (Relations) or the four questions (Pervasions)
export const tkind=()=>{
  if(!state.ui||state.ui.checked||state.mode!=="quiz"||(state.tab!=="practice"&&state.tab!=="debate")) return null;
  if(state.ui.debate) return state.ui.step<4?"ex":state.ui.rel?null:"rel";
  return state.ui.rel?"ex":"rel";
};
export const kindMs=k=>k==="rel"?state.relMs:state.timerMs;
const bzLabel=()=>state.blitz?"Blitz on: "+Math.round(state.relMs/1000)+" s relation, "+Math.round(state.timerMs/1000)+" s "+(state.ui&&state.ui.debate?"question":"example"):"Blitz off";
// the switch in the top bar; Relations and Pervasions share the one. Not there when Blitz is switched off in its options (state.blitzUse)
export function syncBlitzBtn(){
  const b=$("mbz"), ok=state.mode==="quiz"&&(state.tab==="debate"||state.tab==="practice");
  b.hidden=!ok||!state.blitzUse; if(b.hidden) return;
  b.replaceChildren(tbIcon("watch"));
  b.setAttribute("aria-checked",state.blitz?"true":"false"); b.setAttribute("aria-label",bzLabel()); b.title=bzLabel()+" (hold for the Blitz options)";
}
const exMul=()=>(relTimed()&&state.ui.rel)?Math.max(1,fillable().length):1;

// Relations tab, Blitz on: the relation pick has a countdown and the examples have one (the seconds for each example). Time up on the pick marks it wrong,
// shows the right relation and goes on to the examples. Time up on the examples checks whatever was typed; cells not reached count as left empty.
// Pervasions tab: each question has its countdown, and after the four, the relation pick has the relation's. Time up on the pick marks it wrong and shows the result.
export const relTimed=()=>!!(state.blitz&&state.ui&&!state.ui.debate&&!state.ui.checked&&state.mode==="quiz"&&state.tab==="practice");
export const relTimedD=()=>!!(state.blitz&&state.ui&&state.ui.debate&&state.ui.step>3&&!state.ui.rel&&!state.ui.checked&&state.mode==="quiz"&&state.tab==="debate");
export function ensureRelTimer(){
  const u=state.ui;
  if(!u||state.mode!=="quiz"||u.checked||!state.blitz||u.tq||paused()) return;
  const now=performance.now();
  if(u.debate){
    if(state.tab!=="debate"||u.step<4||u.rel||!state.relMs) return;
    u.tph="rel"; u.tq={t0:now,limit:state.relMs}; u.tid=setTimeout(()=>expireRelD(u),state.relMs);
    return;
  }
  if(state.tab!=="practice") return;
  const lim=limitMs(); if(!lim) return;
  if(!u.rel){ u.tph="pick"; u.tq={t0:now,limit:state.relMs}; u.tid=setTimeout(()=>expireRel(u),state.relMs); }
  else { const total=lim*exMul(); u.tph="ex"; u.tq={t0:now,limit:total}; u.tid=setTimeout(()=>expireEx(u),total); }
}
function expireRel(u){
  if(u!==state.ui||u.checked||u.rel||state.tab!=="practice") return;
  const k=state.cur.p.relation;
  u.tid=null; u.tq=null; u.late=true; u.rel=k; u.open=false; u.ci=0; u.seen=0; u.pop=null;
  for(const c of REL[k].empty){ u.cells[c].t=""; u.cells[c].none=false; }
  render(); if(!isWide()) focusCin();
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
/** The countdown bar of the pair on screen, or null while no countdown runs: drawn by the pair bar on its top edge. */
export function timerBar(){
  if(!state.ui||!state.ui.tq) return null;
  const e=Math.max(0,Math.round(performance.now()-state.ui.tq.t0));
  return el("div",{class:"tbar","aria-hidden":"true",style:"--t:"+state.ui.tq.limit+"ms;--e:"+e+"ms"},el("i"));
}
