import { state } from "../state.js";
import { afterCheck } from "../ai/known.js";
import { $ } from "../core/dom.js";
import { CELLS } from "../core/rel.js";
import { isWide } from "../core/viewport.js";
import { QCELL } from "./text.js";
import { persist } from "../practice/answers.js";
import { freshUi } from "../practice/queue.js";
import { clearSkip } from "../practice/skips.js";
import { gradeTerms } from "../practice/stops.ts";
import { nextGenerated } from "../practice/universe.js";
import { focusAfterCheck, render } from "../shell/render.js";
import { ensureRelTimer, freezeBar, relReset, tkind } from "../shell/timers.js";
import { startSyllogismClock, syllogismAsking } from "../syllogism/flow.js";
import { gradeDebate } from "../../domain/grading.ts";

export function freshDebateUi(){
  const u=freshUi();
  return Object.assign(u,{debate:true, step:0, ans:[0,1,2,3].map(()=>({say:null,text:"",ms:null,msEx:null,limit:0,timeout:false})),
    pickWhy:false, exText:"", open:true, tq:null, tid:null, qStart:0, col:"debates"});
}
export const debateList=()=>Object.values(state.debates).sort((x,y)=>(x.at||"").localeCompare(y.at||""));
export function advanceDebate(){ state.cur={p:nextGenerated(debateList(),true), debate:true}; state.ui=freshDebateUi(); state.mode="quiz"; startQ(); }     // the negation track (Practice options) applies here as in Relations
export const limitMs=()=>state.blitz?state.timerMs:0;
/** The clock stands still while something covers the exercise: Settings, the practice options, the question before a skip, the menu on a phone. It starts again, with its full time, when that closes. */
export const paused=()=>state.optsOpen||state.sessOpen||state.skipAsk||(state.menuOpen&&!isWide());
export function stopTimer(){ if(state.ui&&state.ui.tid){ clearTimeout(state.ui.tid); state.ui.tid=null; } if(state.ui) state.ui.tq=null; }
// `spent`: the time of the question already gone (a countdown that goes on after a stop)
export function startQ(spent=0){
  stopTimer();
  if(syllogismAsking()){ if(!paused()) startSyllogismClock(); return; }       // Syllogisms: the one countdown of the reply
  if(!state.ui||!state.ui.debate||state.ui.checked||state.ui.step>3||state.ui.hold||paused()) return;
  const a=state.ui.ans[state.ui.step], lim=limitMs(); a.limit=lim;
  state.ui.qStart=performance.now()-spent;
  if(lim){ const u=state.ui; u.tq={t0:state.ui.qStart,limit:lim}; u.tid=setTimeout(()=>expireQ(u),Math.max(1,lim-spent)); }
}
// The Blitz countdown stands still while a question is read aloud and while a spoken answer waits for its confirmation (shell/voice.js),
// and that time is not counted in the time of the answer. `u.hold` also keeps the render from starting a countdown of its own.
const stageOf=u=>u.debate?(u.step<4?"q"+u.step:"rel"):(u.rel?"ex":"pick");
// the time of the question gone so far; while the clock is held, `qStart` is stale, and the time is what the hold kept
const sinceStart=u=>u.hold?u.hold.spent:performance.now()-u.qStart;
export function holdClock(){
  const u=state.ui; if(!u||u.hold||u.checked) return;
  const spent=u.debate&&u.step<4?performance.now()-u.qStart:u.tq?performance.now()-u.tq.t0:0;
  u.hold={spent,run:!!u.tq,stage:stageOf(u)};
  if(u.tid){ clearTimeout(u.tid); u.tid=null; }
  u.tq=null; freezeBar(true);
}
// `how`: "resume" when the answer was confirmed or taken back (the countdown goes on from where it stopped), "fresh" when the reading
// ended (the time of the question starts anew), "moved" when the screen went on some other way (the stage that is still the same goes on
// from where it stopped, a new stage starts its own). `ui` is the attempt that was held: it may have been put aside since, and then
// only the hold is dropped, as it starts its clocks afresh when it comes back.
export function releaseClock(how,ui=state.ui){
  const h=ui&&ui.hold; if(!ui||!h) return;
  ui.hold=null;
  if(ui!==state.ui) return;
  freezeBar(false);
  if(ui.checked) return;
  const spent=how==="fresh"||(how==="moved"&&stageOf(ui)!==h.stage)?0:h.spent;
  if(ui.debate&&ui.step<4){ if(state.tab==="debate") startQ(spent); }   // the screen may have gone to another tab with the hold still on it
  else if(how!=="resume"||h.run) ensureRelTimer(spent);
}
/** Whether a question with a clock is on screen: a Pervasions question, or the reply to a syllogism. */
export const asking=()=>(state.tab==="debate"&&state.ui&&state.ui.debate&&!state.ui.checked&&state.ui.step<4)||syllogismAsking();
export function setBlitz(on){
  state.blitz=on; try{ localStorage.setItem("rd-blitz",on?"1":"0"); }catch(e){}
  if(on&&state.ui&&state.ui.hold){ state.ui.hold.spent=0; state.ui.hold.run=true; }   // switched on while the clock is held: it runs, from the start, when the hold ends
  if(asking()) startQ(); else relReset();
  render();
}
// kind "rel": the relation's time; "syl": the time of a syllogism; otherwise the time of an example (Relations) or a question (Pervasions). Only the countdown that is running restarts.
export function setTimer(ms,kind){
  if(kind==="rel"){ state.relMs=ms; try{ localStorage.setItem("rd-timer-rel",String(ms)); }catch(e){} }
  else if(kind==="syl"){ state.sylMs=ms; try{ localStorage.setItem("rd-timer-syl",String(ms)); }catch(e){} }
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
  state.ui.hold=null;       // answered by hand while voice held the question: its clock is the next question's now
  state.ui.step++; state.ui.pickWhy=false; state.ui.exText=""; state.ui.ro=null;
  if(state.ui.step>3){ stopTimer(); state.ui.open=true; } else startQ();
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
  clearSkip(p); state.ui.res=gradeDebate(state,p,/** @type {import("../../domain/types.ts").DebateInput} */(state.ui)); state.ui.checked=true; state.ui.open=false;
  gradeTerms([{cat:p.catA,ok:!!state.ui.res.relOk},{cat:p.catB,ok:!!state.ui.res.relOk}]);     // both terms of the pair (practice/stops.ts)
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
