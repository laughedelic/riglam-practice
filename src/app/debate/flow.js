import { state } from "../state.js";
import { labStart } from "../ai/lab.js";
import { $ } from "../core/dom.js";
import { CELLS, refOf } from "../core/rel.js";
import { QCELL } from "./text.js";
import { persist } from "../practice/answers.js";
import { judgeText, summarize } from "../practice/grading.js";
import { freshUi } from "../practice/queue.js";
import { clearSkip } from "../practice/skips.js";
import { nextGenerated } from "../practice/universe.js";
import { render, top0 } from "../shell/render.js";
import { relReset, tkind } from "../shell/timers.js";

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
  if(!state.ui||!state.ui.debate||state.ui.checked||state.ui.step>3) return;
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

/* what three answers give: Q1 accepted = no common locus; Q2 and Q3 accepted = pervasion each way */
function deriveRel(ans){
  const s=ans.slice(0,3).map(a=>a.say);
  if(s.some(x=>x!=="accept"&&x!=="why")) return null;      // time ran out on one of them
  const [x,y,z]=s.map(v=>v==="accept");
  if(x&&!y&&!z) return "con";
  if(!x&&y&&z) return "mi";
  if(!x&&y&&!z) return "3ab";
  if(!x&&!y&&z) return "3ba";
  if(!x&&!y&&!z) return "4";
  return "bad";                                            // accepting no-common-locus together with a pervasion
}
function gradeDebate(p,u){
  const res={relOk:u.rel===p.relation&&!u.late, cells:{}, dec:{}, implied:deriveRel(u.ans)};
  QCELL.forEach((c,i)=>{
    const a=u.ans[i], ref=refOf(p,c), has=!!ref, why=(p.why&&p.why[c])||"", t=(a.text||"").trim();
    let v,msg,kind="occ",dec=false;
    if(a.say==="accept"){
      if(!has){ v="ok"; msg=["Right. ",why]; dec=true; } else { v="bad"; msg=["Counter-example: ",ref]; }
    } else if(a.say==="why"){
      if(!has){ v="bad"; msg=["Nothing can be posited. ",why]; }
      else {
        dec=true; kind="ex";
        if(!t){ v="bad"; msg=[a.timeout?"Time ran out. ":"No example. ","For example: "+ref+"."]; }
        else {
          const j=judgeText(p,c,t,[p.catA,p.catB]);
          if(j){ v=j.v; msg=j.msg.slice(); if(v==="bad") msg[1]+=" Example: "+ref+"."; }
          else { v="cmp"; msg=["Not checked. ","Reference: "+ref+"."]; }
        }
      }
    } else { v="bad"; msg=["Time ran out. ",has?"For example: "+ref+".":why]; }
    res.cells[c]={v,msg,kind}; res.dec[c]=dec;
  });
  return summarize(res);
}
export async function checkDebate(){
  if(!state.ui||!state.ui.debate||state.ui.checked||state.ui.step<4||!state.ui.rel) return;
  stopTimer();
  const p=state.cur.p;
  QCELL.forEach((c,i)=>{ state.ui.cells[c].t=(state.ui.ans[i].text||"").trim(); state.ui.cells[c].none=state.ui.ans[i].say==="accept"; });
  clearSkip(p); state.ui.res=gradeDebate(p,state.ui); state.ui.checked=true; state.ui.open=false; render();
  top0(); const bs=document.querySelectorAll("#stage .actions .btn"); if(bs.length) bs[bs.length-1].focus({preventScroll:true});
  if(!state.db) return;
  const cells={}; for(const c of CELLS) cells[c]={text:state.ui.cells[c].t, none:state.ui.cells[c].none, verdict:state.ui.res.cells[c].v};
  const qs=QCELL.map((c,i)=>({c, say:state.ui.ans[i].say, text:state.ui.cells[c].t, dok:state.ui.res.dec[c], verdict:state.ui.res.cells[c].v,
    ms:state.ui.ans[i].ms, msEx:state.ui.ans[i].msEx, limit:state.ui.ans[i].limit||0, timeout:!!state.ui.ans[i].timeout}));
  const id=state.ui.saveId="q-"+p.id.replace(/^g-/,"");
  state.ui.doc={pairId:id,mode:"debate",a:p.a,b:p.b,catA:p.catA,catB:p.catB,key:p.relation,chosen:state.ui.late?null:state.ui.rel,implied:state.ui.res.implied||null,
    correct:state.ui.res.relOk,grade:state.ui.res.overall,cells,qs,at:new Date().toISOString(),pair:p};
  if(state.ui.late) state.ui.doc.timeout="relation";
  persist(state.ui,"Your answers");
  labStart(state.ui,state.cur);
}
