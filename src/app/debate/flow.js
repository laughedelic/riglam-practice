import { state } from "../state.js";
import { afterCheck } from "../ai/known.js";
import { $ } from "../core/dom.js";
import { CELLS } from "../core/rel.js";
import { QCELL } from "./text.js";
import { persist } from "../practice/answers.js";
import { freshUi } from "../practice/queue.js";
import { clearSkip } from "../practice/skips.js";
import { pairStageNow, stageStep } from "../practice/stage-offer.ts";
import { gradePair } from "../practice/stops.ts";
import { guidance } from "../practice/guided.ts";
import { nextGenerated } from "../practice/universe.js";
import { focusAfterCheck, render } from "../shell/render.js";
import { stopTimer } from "../shell/timers.js";
import { cue } from "../sound/play.ts";
import { gradeDebate } from "../../domain/grading.ts";

export function freshDebateUi(){
  const u=freshUi();
  return Object.assign(u,{debate:true, step:0, ans:[0,1,2,3].map(()=>({say:null,text:"",ms:null,msEx:null,limit:0,timeout:false})),
    pickWhy:false, exText:"", open:true, tq:null, tid:null, qStart:0, col:"debates"});
}
export const debateList=()=>Object.values(state.debates).sort((x,y)=>(x.at||"").localeCompare(y.at||""));
export function advanceDebate(){ state.cur={p:nextGenerated(debateList(),true), debate:true}; state.ui=freshDebateUi(); state.mode="quiz"; }     // the negation track (Practice options) applies here as in Relations
// the clock of a question (accept or Why?, then the example) is Sprint's, in shell/timers.js; these are re-exported where the exercises have always taken them from
export { holdClock, paused, releaseClock, setBlitz, setTimer, stopTimer } from "../shell/timers.js";
// the time of the question (or of the example after Why?) gone so far; while the clock is held, `qStart` is stale, and the time is what the hold kept
const sinceStart=u=>u.hold?u.hold.spent:performance.now()-u.qStart;
// Time up on a question: with Accept or Why? not chosen it counts as accepting the statement. Time up on the example after Why?: what is typed stands, and nothing typed counts as accepting.
export function expireQ(u){
  if(u!==state.ui||state.tab!=="debate"||u.checked||u.step>3) return;
  cue("timeup");
  const a=u.ans[u.step], t=(u.exText||"").trim(), lim=u.tq?u.tq.limit:0; u.tid=null; u.tq=null; a.timeout=true;
  if(u.pickWhy&&t){ a.text=t; a.msEx=lim; }
  else if(u.pickWhy){ a.say="accept"; a.text=""; a.msEx=null; }
  else { a.say="accept"; a.text=""; a.ms=lim; a.msEx=null; }
  nextQ();
}
function nextQ(){
  state.ui.hold=null;       // answered by hand while voice held the question: its clock is the next question's now
  state.ui.step++; state.ui.pickWhy=false; state.ui.exText=""; state.ui.ro=null;
  if(state.ui.step>3){ stopTimer(); state.ui.open=true; }
  render();
}
// `voiced` when the answer was spoken (shell/voice.js): the example field is not focused, so a phone keeps its keyboard down,
// and an example said together with Why? is taken at once.
export function sayQ(say,voiced){
  if(!state.ui||!state.ui.debate||state.ui.checked||state.ui.step>3||state.ui.pickWhy) return;
  const a=state.ui.ans[state.ui.step]; a.say=say; a.ms=Math.round(sinceStart(state.ui));
  if(say==="accept"){ nextQ(); return; }
  state.ui.pickWhy=true; state.ui.exText="";
  if(voiced&&voiced.example){ state.ui.exText=voiced.example; submitWhy(); return; }
  render();
  if(voiced) return;
  const i=$("dex"); if(i) i.focus();
}
// An empty example is not an answer: Next stays off until something is written (Back returns to Accept / Why?).
export function submitWhy(){
  if(!state.ui||!state.ui.debate||state.ui.checked||state.ui.step>3||!state.ui.pickWhy) return;
  const t=(state.ui.exText||"").trim(); if(!t) return;
  const a=state.ui.ans[state.ui.step]; a.text=t; a.msEx=Math.round(sinceStart(state.ui));
  nextQ();
}
// Takes the answer to question `i` back (shell/voice.js, Change on a spoken answer): the question is open again with nothing said, and the Sprint clock of a step that is
// open again is a new one (shell/timers.js: a new step is a new clock). Only the last answer can be taken back, and not the relation, which checks the pair.
export function undoQ(i){
  const u=state.ui;
  if(!u||!u.debate||u.checked||i<0||i>3||u.step<i||u.step>4||u.rel) return;
  for(let j=i;j<4;j++) Object.assign(u.ans[j],{say:null,text:"",ms:null,msEx:null,limit:0,timeout:false});
  u.step=i; u.pickWhy=false; u.exText=""; u.ro=null; u.open=true;
  render();
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
  clearSkip(p); state.ui.res=gradeDebate(state,p,/** @type {import("../../domain/types.ts").DebateInput} */(state.ui),{refs:guidance("debate")==="detailed"}); state.ui.checked=true; state.ui.open=false;
  gradePair([p.catA,p.catB],!!state.ui.res.relOk,[p.a,p.b]);     // the course terms of the pair (practice/stops.ts), before the stage: its new terms count
  stageStep("debate",pairStageNow(p.catA,p.catB),!!state.ui.res.relOk);     // the run towards the next stage (practice/stage-offer.ts)
  render();
  focusAfterCheck();
  afterCheck(state.ui);
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
