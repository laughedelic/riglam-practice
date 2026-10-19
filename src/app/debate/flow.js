import { state } from "../state.js";
import { explainByItself } from "../ai/tutor.js";
import { $ } from "../core/dom.js";
import { CELLS } from "../core/rel.js";
import { QCELL } from "./text.js";
import { persist } from "../practice/answers.js";
import { freshUi } from "../practice/queue.js";
import { clearSkip } from "../practice/skips.js";
import { nextGenerated } from "../practice/universe.js";
import { render, top0 } from "../shell/render.js";
import { relReset, tkind } from "../shell/timers.js";
import { gradeDebate } from "../../domain/grading.ts";

export function freshDebateUi(){
  const u=freshUi();
  return Object.assign(u,{debate:true, step:0, ans:[0,1,2,3].map(()=>({say:null,text:"",ms:null,msEx:null,limit:0,timeout:false})),
    pickWhy:false, exText:"", open:true, tq:null, tid:null, qStart:0, col:"debates"});
}
export const debateList=()=>Object.values(state.debates).sort((x,y)=>(x.at||"").localeCompare(y.at||""));
export function advanceDebate(){ state.cur={p:nextGenerated(debateList()), debate:true}; state.ui=freshDebateUi(); state.mode="quiz"; startQ(); }
export const limitMs=()=>state.blitz?state.timerMs:0;
export function stopTimer(){ if(state.ui&&state.ui.tid){ clearTimeout(state.ui.tid); state.ui.tid=null; } if(state.ui) state.ui.tq=null; }
export function startQ(){
  stopTimer();
  if(!state.ui||!state.ui.debate||state.ui.checked||state.ui.step>3||state.optsOpen||state.sessOpen) return;
  const a=state.ui.ans[state.ui.step], lim=limitMs(); a.limit=lim;
  state.ui.qStart=performance.now();
  if(lim){ const u=state.ui; u.tq={t0:state.ui.qStart,limit:lim}; u.tid=setTimeout(()=>expireQ(u),lim); }
}
export const asking=()=>state.tab==="debate"&&state.ui&&state.ui.debate&&!state.ui.checked&&state.ui.step<4;
export function setBlitz(on){
  state.blitz=on; try{ localStorage.setItem("rd-blitz",on?"1":"0"); }catch(e){}
  if(asking()) startQ(); else relReset();
  render();
}
// kind "rel": the relation's time; otherwise the time of an example (Relations) or a question (Pervasions). Only the countdown that is running restarts.
export function setTimer(ms,kind){
  if(kind==="rel"){ state.relMs=ms; try{ localStorage.setItem("rd-timer-rel",String(ms)); }catch(e){} }
  else { state.timerMs=ms; try{ localStorage.setItem("rd-timer",String(ms)); }catch(e){} }
  if(state.blitz&&(kind||"ex")===tkind()){ if(asking()) startQ(); else relReset(); }
  render();
}
// Time up: an example already typed after Why? stands; anything else counts as accepting the statement.
function expireQ(u){
  if(u!==state.ui||state.tab!=="debate"||u.checked||u.step>3) return;
  const a=u.ans[u.step], t=(u.exText||"").trim(); u.tid=null; a.timeout=true;
  if(a.say==="why"&&t){ a.text=t; a.msEx=a.limit; } else { a.say="accept"; a.text=""; a.ms=a.limit; a.msEx=null; }
  nextQ();
}
function nextQ(){
  state.ui.step++; state.ui.pickWhy=false; state.ui.exText=""; state.ui.ro=null;
  if(state.ui.step>3){ stopTimer(); state.ui.open=true; } else startQ();
  render();
}
export function sayQ(say){
  if(!state.ui||!state.ui.debate||state.ui.checked||state.ui.step>3||state.ui.pickWhy) return;
  const a=state.ui.ans[state.ui.step]; a.say=say; a.ms=Math.round(performance.now()-state.ui.qStart);
  if(say==="accept"){ nextQ(); return; }
  state.ui.pickWhy=true; state.ui.exText=""; render();
  const i=$("dex"); if(i) i.focus();
}
// An empty example is not an answer: Next stays off until something is written (Back returns to Accept / Why?).
export function submitWhy(){
  if(!state.ui||!state.ui.debate||state.ui.checked||state.ui.step>3||!state.ui.pickWhy) return;
  const t=(state.ui.exText||"").trim(); if(!t) return;
  const a=state.ui.ans[state.ui.step]; a.text=t; a.msEx=Math.round(performance.now()-state.ui.qStart);
  nextQ();
}
export function backWhy(){
  if(!state.ui||!state.ui.debate||state.ui.checked||!state.ui.pickWhy) return;
  const a=state.ui.ans[state.ui.step]; a.say=null; a.ms=null; state.ui.pickWhy=false; state.ui.exText=""; render();
}
export function chooseD(k){
  if(!state.ui||!state.ui.debate||state.ui.checked||state.ui.step<4) return;
  state.ui.rel=k; state.ui.open=false; checkDebate();
}

export async function checkDebate(){
  if(!state.ui||!state.ui.debate||state.ui.checked||state.ui.step<4||!state.ui.rel) return;
  stopTimer();
  const p=state.cur.p;
  QCELL.forEach((c,i)=>{ state.ui.cells[c].t=(state.ui.ans[i].text||"").trim(); state.ui.cells[c].none=state.ui.ans[i].say==="accept"; });
  clearSkip(p); state.ui.res=gradeDebate(state,p,/** @type {import("../../domain/types.ts").DebateInput} */(state.ui)); state.ui.checked=true; state.ui.open=false; render();
  top0(); const bs=document.querySelectorAll("#stage .actions .btn"); if(bs.length) bs[bs.length-1].focus({preventScroll:true});
  explainByItself(state.ui);
  if(!state.db) return;
  const cells=/** @type {import("../types.ts").AnswerDoc["cells"]} */({}); for(const c of CELLS) cells[c]={text:state.ui.cells[c].t, none:state.ui.cells[c].none, verdict:state.ui.res.cells[c].v};
  const qs=QCELL.map((c,i)=>({c, say:state.ui.ans[i].say, text:state.ui.cells[c].t, dok:state.ui.res.dec[c], verdict:state.ui.res.cells[c].v,
    ms:state.ui.ans[i].ms, msEx:state.ui.ans[i].msEx, limit:state.ui.ans[i].limit||0, timeout:!!state.ui.ans[i].timeout}));
  const id=state.ui.saveId="q-"+p.id.replace(/^g-/,"");
  state.ui.doc={pairId:id,mode:"debate",a:p.a,b:p.b,catA:p.catA,catB:p.catB,key:p.relation,chosen:state.ui.late?null:state.ui.rel,implied:state.ui.res.implied||null,
    correct:state.ui.res.relOk,grade:state.ui.res.overall,cells,qs,at:new Date().toISOString(),pair:p};
  if(state.ui.late) state.ui.doc.timeout="relation";
  persist(state.ui,"Your answers");
}
