import { state } from "../state.js";
import { labStart } from "../ai/lab.js";
import { CELLS, REL, refOf } from "../core/rel.js";
import { cap, pairsOf } from "../core/util.js";
import { stopTimer } from "../debate/flow.js";
import { persist } from "./answers.js";
import { clearSkip } from "./skips.js";
import { FEATURE, inUniverse, matchItem, pairCats } from "./universe.js";
import { render, top0 } from "../shell/render.js";

/* ---------- grading ---------- */
export function judgeText(p,c,t,cats){
  if(!state.DATA) return null;
  const [ca,cb]=cats||pairCats(p); if(!ca||!cb) return null;
  const feat=FEATURE.has(ca)||FEATURE.has(cb);
  const it=matchItem(t,feat); if(!it) return null;
  if(!inUniverse(it,ca,cb)) return null;
  const x=it.c.includes(ca), y=it.c.includes(cb);
  const where=x&&y?"both":x?"anb":y?"bna":"nei";
  const nm=cap(t.trim().replace(/[.!]+$/,""));
  if(where===c){
    if(it.ne){ const ref=p.ex&&p.ex[c], better=ref&&!((matchItem(ref)||{}).ne);
      return {v:"ok",msg:["Right. ",nm+" does not exist, and a non-existent counts as neither."+(better?" An existent such as "+ref+" is the better example when there is one.":"")]}; }
    return {v:"ok",msg:["Right. ",nm+": "+termLine(it.t)+"."]};
  }
  return {v:"bad",msg:["Belongs elsewhere. ",nm+" is "+({both:"both",anb:"A but not B",bna:"B but not A",nei:"neither"}[where])+" ("+termLine(it.t)+")."]};
}
function termLine(t){ const ch=(state.DATA.chains&&state.DATA.chains[t])||null; return ch?ch.slice(0,3).join("\uE000").toLowerCase():(t||"").toLowerCase(); }
function grade(p,u){
  const implied=REL[u.rel].empty, res={relOk:u.rel===p.relation&&!u.late, cells:{}};
  for(const c of CELLS){
    const key=refOf(p,c), why=(p.why&&p.why[c])||"";
    const none=implied.includes(c)||u.cells[c].none, t=(u.cells[c].t||"").trim();
    let v,msg,kind="occ";
    if(none){ if(key){v="bad";msg=["Counter-example: ",key];} else {v="ok";msg=["Right, empty. ",why];} }
    else if(t){
      if(!key){v="bad";msg=["Nothing can go here. ",why];}
      else { kind="ex"; const j=judgeText(p,c,t); if(j){v=j.v;msg=j.msg; if(j.v==="bad") msg[1]+=" Example: "+key+".";} else {v="cmp";msg=["Not checked. ","Reference: "+key+"."];} }
    }
    else { if(key){v="bad";msg=["Missing. For example: ",key];} else {v="ok";msg=["Right, empty. ",why];} }
    res.cells[c]={v,msg,kind};
  }
  return summarize(res);
}
// Three separate checks: the relation, which cells can be filled (both deterministic), and the examples themselves
// (deterministic when the item is in the practice list, otherwise "cmp" until Claude verifies them).
export function summarize(res){
  const cs=CELLS.map(c=>res.cells[c]);
  res.occBad=cs.filter(r=>r.kind==="occ"&&r.v==="bad").length;
  res.exBad=cs.filter(r=>r.kind==="ex"&&r.v==="bad").length;
  res.exOpen=cs.filter(r=>r.v==="cmp").length;
  res.exN=cs.filter(r=>r.kind==="ex").length;
  res.overall=!res.relOk?"bad":(res.occBad||res.exBad)?"part":res.exOpen?"pend":"ok";
  return res;
}
export async function check(){
  if(!state.ui||!state.ui.rel||state.ui.checked) return;
  const p=state.cur.p;
  stopTimer(); clearSkip(p); state.ui.res=grade(p,state.ui); state.ui.checked=true; state.ui.open=false; render();
  top0(); const bs=document.querySelectorAll("#stage .actions .btn"); if(bs.length) bs[bs.length-1].focus({preventScroll:true});
  if(!state.db) return;
  const cells=/** @type {import("../types.ts").AnswerDoc["cells"]} */({});
  for(const c of CELLS) cells[c]={text:(state.ui.cells[c].t||"").trim(), none:REL[state.ui.rel].empty.includes(c)||state.ui.cells[c].none, verdict:state.ui.res.cells[c].v};
  const id=state.ui.saveId=state.cur.legacy?p.id:(state.cur.retry?"r-":"")+(p.generated&&!state.cur.retry?p.id:"r"+Date.now().toString(36));
  const doc={pairId:id,batchId:state.cur.legacy?(state.batches.find(b=>pairsOf(b).includes(p))||{}).id||null:null,a:p.a,b:p.b,catA:pairCats(p)[0],catB:pairCats(p)[1],
    chosen:state.ui.late?null:state.ui.rel,key:p.relation,correct:state.ui.res.relOk,grade:state.ui.res.overall,cells,at:new Date().toISOString(),pair:p};
  if(state.cur.retry) doc.retryOf=p.id;
  if(state.ui.late||state.ui.exLate) doc.timeout=state.ui.late&&state.ui.exLate?"both":state.ui.late?"relation":"examples";
  state.ui.doc=doc;
  persist(state.ui,"Your answer");
  labStart(state.ui,state.cur);
}
