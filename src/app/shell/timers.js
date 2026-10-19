import { state } from "../state.js";
import { $, el } from "../core/dom.js";
import { tbIcon } from "../core/icons.js";
import { REL } from "../core/rel.js";
import { isWide, syncVv, wideMq } from "../core/viewport.js";
import { asking, checkDebate, limitMs, setBlitz, setTimer, startQ, stopTimer } from "../debate/flow.js";
import { toggleFav } from "../practice/favorites.js";
import { check } from "../practice/grading.js";
import { fillable } from "../practice/screen.js";
import { skipPair } from "../practice/skips.js";
import { toggleOpts } from "./options.js";
import { focusCin, render } from "./render.js";
import { setTab } from "./tabs.js";

$("obtn").addEventListener("click",()=>toggleOpts());
$("mopt").addEventListener("click",()=>toggleOpts());
// Home, the exercises and Review, in the rail and the tab bar; the back arrow of an exercise goes Home
for(const id of ["tabs","tabbar"]) $(id).addEventListener("click",e=>{ const b=/** @type {Element} */(e.target).closest("[data-go]"); if(b) setTab(b.getAttribute("data-go")); });
$("mback").append(tbIcon("back")); $("mback").addEventListener("click",()=>setTab("home"));
$("mfav").addEventListener("click",()=>{ if(state.cur&&state.cur.p) toggleFav(state.cur.p); });
$("mbz").addEventListener("click",()=>setBlitz(!state.blitz));
$("mskip").append(tbIcon("skip")); $("mskip").addEventListener("click",skipPair);
wideMq.addEventListener("change",()=>{ syncVv(); if(state.mode!=="loading") render(); });
// The blitz switch sits above the questions, since it is used often; its length is in the options.
// Blitz: a bolt in the top bar, left, next to the heading (the mode of practice): outline when off, filled when on. No box, no number: the seconds are in its name
// and editable in Options and beside the countdown. Two independent times: the relation (Relations and Pervasions) and the examples (each example in
// Relations, each question in Pervasions). The countdown that is running is the one the in-place field shows; changing one never changes the other.
// The toolbar icons (bolt, star, skip) share one line style: 24 px, stroke 1.75, outline when off, filled when on (src/app/core/icons.js).
export { tbIcon };
// which countdown belongs to the screen: "rel" while the relation is to be picked, "ex" for the examples (Relations) or the four questions (Pervasions)
export const tkind=()=>{
  if(!state.ui||state.ui.checked||state.mode!=="quiz"||(state.tab!=="practice"&&state.tab!=="debate")) return null;
  if(state.ui.debate) return state.ui.step<4?"ex":state.ui.rel?null:"rel";
  return state.ui.rel?"ex":"rel";
};
export const kindMs=k=>k==="rel"?state.relMs:state.timerMs;
const bzLabel=()=>state.blitz?"Blitz on: "+Math.round(state.relMs/1000)+" s relation, "+Math.round(state.timerMs/1000)+" s "+(state.ui&&state.ui.debate?"question":"example"):"Blitz off";
function fillBz(b){
  b.replaceChildren(tbIcon("bolt"));
  b.setAttribute("aria-checked",state.blitz?"true":"false"); b.setAttribute("aria-label",bzLabel()); b.title=bzLabel();
}
// the button in the action row (wide screens)
export function blitzBtn(){
  const b=el("button",{type:"button",class:"bz",role:"switch",onclick:()=>setBlitz(!state.blitz)}); fillBz(b); return b;
}
// the button in the narrow top bar, at the left; Relations and Pervasions share the one switch
export function syncBlitzBtn(){
  const b=$("mbz"), ok=state.mode==="quiz"&&(state.tab==="debate"||state.tab==="practice");
  b.hidden=!ok; if(ok) fillBz(b);
}
// the countdown bar with the seconds beside it: tap the number to change it right here (Enter or leaving the field saves, Escape cancels).
// kind "rel" is the relation's time, "ex" the time of one example or one question.
function timerRow(kind){
  kind=kind||"ex";
  const ms=kindMs(kind), secs=Math.round(ms/1000), mul=kind==="ex"?exMul():1;
  const what=kind==="rel"?"relation":state.ui&&state.ui.debate?"question":"example";
  let tv;
  if(state.timeEdit===kind){
    const inp=el("input",{type:"number",class:"tin",min:"2",max:"120",inputmode:"numeric",value:state.timeDraft||String(secs),"aria-label":"Blitz time for the "+what+" in seconds, 2 to 120"});
    let over=false;
    const leave=save=>{
      if(over) return; over=true; state.timeEdit=false;
      const v=Math.round(+inp.value);
      if(save&&v>=2&&v<=120&&v*1000!==ms){ setTimer(v*1000,kind); return; }
      if(state.blitz&&asking()) startQ(); else relReset();
      render();
    };
    inp.addEventListener("input",()=>{ state.timeDraft=inp.value; });
    inp.addEventListener("keydown",e=>{
      e.stopPropagation();
      if(e.key==="Enter"){ e.preventDefault(); leave(true); }
      else if(e.key==="Escape"){ e.preventDefault(); leave(false); }
    });
    inp.addEventListener("blur",()=>leave(true));
    tv=el("span",{class:"tedit"},inp,el("span",{class:"swt",text:"s"}));
    setTimeout(()=>{ if(inp.isConnected&&document.activeElement!==inp){ inp.focus(); inp.select(); } },0);
  } else {
    tv=el("button",{type:"button",class:"tval","aria-label":"Blitz time for the "+what+": "+secs+" seconds"+(mul>1?" for each of the "+mul+" examples":"")+". Change",onclick:()=>{ state.timeEdit=kind; state.timeDraft=String(secs); if(state.blitz) stopTimer(); render(); }},(mul>1?mul+" × ":"")+secs+" s");
  }
  return el("div",{class:"trow"},timerBar()||el("div",{class:"tbar","aria-hidden":"true"}),tv);
}
// the countdown row, or an empty one of the same height, so that the Blitz switch never moves what is below it
export const timerSlot=(kind,on)=>on?timerRow(kind):el("div",{class:"trow ph","aria-hidden":"true"});

// Relations tab, Blitz on: the relation pick has a countdown and the examples have one (the seconds for each example). Time up on the pick marks it wrong,
// shows the right relation and goes on to the examples. Time up on the examples checks whatever was typed; cells not reached count as left empty.
// Pervasions tab: each question has its countdown, and after the four, the relation pick has the relation's. Time up on the pick marks it wrong and shows the result.
export const relTimed=()=>!!(state.blitz&&state.ui&&!state.ui.debate&&!state.ui.checked&&state.mode==="quiz"&&state.tab==="practice");
export const relTimedD=()=>!!(state.blitz&&state.ui&&state.ui.debate&&state.ui.step>3&&!state.ui.rel&&!state.ui.checked&&state.mode==="quiz"&&state.tab==="debate");
const exMul=()=>(relTimed()&&state.ui.rel)?Math.max(1,fillable().length):1;
export function ensureRelTimer(){
  const u=state.ui;
  if(!u||state.mode!=="quiz"||u.checked||!state.blitz||state.timeEdit||u.tq||state.optsOpen) return;
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
function timerBar(){
  if(!state.ui.tq) return null;
  const e=Math.max(0,Math.round(performance.now()-state.ui.tq.t0));
  return el("div",{class:"tbar","aria-hidden":"true",style:"--t:"+state.ui.tq.limit+"ms;--e:"+e+"ms"},el("i"));
}
