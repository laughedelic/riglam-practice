import { state } from "../state.js";
import { flagEditorNode, flagKeyOf, flagPart } from "./flags.js";
import { quorumChip, quorumNeeded, quorumThings, runReading } from "./quorum.js";
import { CELL_NAME } from "../../ai-shared/prompts.ts";
import { el } from "../core/dom.js";

/* ---------- the Quorum panel of a result: the maintainer's view of the run behind the explanation ---------- */
// A chip on a checked answer, only where the server offers Quorum and this device has it on. It shows what every model and the judge said of each example the
// learner wrote, next to the page's own verdict, and the answers themselves. Any value can be flagged (collection "flags").
const sign=a=>a==="yes"?"✓":a==="no"?"✗":"?";
export const mname=k=>k==="judge"?"Judge":k?k[0].toUpperCase()+k.slice(1):"";
export const MODELS=3;     // the models of a run (src/ai/protocol.ts, QUORUM.models); the judge is a fourth call, asked only where they differ

export function statusOf(U){
  const q=U.quorum, rec=q&&q.record;
  if(!q) return {ic:"",sum:quorumNeeded(U)?"On: Explain asks three models, and Opus rules where they differ.":"Not needed here: every example has a verdict, so one model explains."};
  if(q.busy){
    const n=q.steps.filter(s=>s.name!=="Judge").length;
    return {ic:"…",sum:q.steps.some(s=>s.name==="Judge")?"The judge has ruled; the answer is on its way.":n<MODELS?"Models answered: "+n+" of "+MODELS:"Comparing the answers…"};
  }
  if(q.single) return {ic:"",sum:"Quorum’s budget for today is used, so one model answered this."};
  if(!rec) return {ic:"",sum:"No Quorum record came with this answer."};
  const good=rec.models.filter(m=>m.ok);
  let diff=false, judgeDiff=false;
  const J=rec.judge&&rec.judge.ok?rec.judge:null;
  quorumThings(U).forEach(t=>{
    const cs=new Set(good.map(m=>{ const r=runReading(m,t.text); return r&&r.cell; }).filter(Boolean)); if(cs.size>1) diff=true;
    const j=runReading(J,t.text), ruling=(j&&j.cell)||(cs.size===1?[...cs][0]:null);
    if(ruling&&!t.cells.includes(ruling)) judgeDiff=true;
  });
  const how=rec.judge?J?"the judge ruled (the models differed)":"the judge failed, so you see "+rec.shown+"’s answer":good.length>=2?"all agree, no judge needed":"only one answer could be used";
  return {ic:diff||judgeDiff?"≠":"=",sum:"Done: "+good.length+" of "+MODELS+" models answered; "+how+"."};
}
export function quorumItem(){
  const U=state.ui;
  if(!U||!U.checked||!quorumChip()) return null;
  const s=statusOf(U);
  // the chip never opens by itself; its sign says whether the answers agree ("…" while running, "≠" when models differ from each other or from you, "=" when all agree)
  return {key:"quorum",label:"Quorum",st:"none",ic:s.ic,body:()=>quorumNode(s),
    onopen:()=>requestAnimationFrame(()=>{ const v=document.querySelector(".vchips"); if(v) v.scrollIntoView({block:"start"}); })};
}
const failure=run=>run.name+": failed ("+(run.error||"error")+")";
function quorumNode(s){
  const U=state.ui, q=U.quorum, rec=q&&q.record, box=el("div",{class:"quorum"});
  box.append(el("p",{class:"quorum-h"},el("b",{text:"Quorum "}),el("span",{class:"quorum-s",text:s.sum})));
  if(!rec){
    const why=q&&q.busy?"The models answer one after the other; the explanation appears when they are done."
      :!q&&!quorumNeeded(U)?"Quorum is for examples the page could not check itself. Every example here has a verdict, so one model explains and the server keeps nothing."
      :"With Quorum on, the explanation of an answer with an example the page could not check comes from several models, and this panel shows each of them. The server keeps the run so the models can be compared.";
    box.append(el("p",{class:"note faint",text:why})); return box;
  }
  const errs=rec.models.concat(rec.judge?[rec.judge]:[]).filter(r=>!r.ok).map(failure);
  if(errs.length) box.append(el("p",{class:"status",text:errs.join(". ")+"."}));
  box.append(el("p",{class:"quorum-nj",text:"The answer you see is "+(rec.shown==="Judge"?"the judge’s":rec.shown+"’s")+"."}));
  const p=state.cur.p, tab=U.debate?"debate":"practice", J=rec.judge&&rec.judge.ok?rec.judge:null, caseKey=flagKeyOf(U);
  quorumThings(U).forEach((t,i)=>{
    const base={caseKey,thing:t.text,runId:rec.id,pair:{a:p.a,b:p.b,relation:p.relation,tab}};
    const jr=runReading(J,t.text), jcell=jr&&jr.cell;
    const rowFor=run=>{
      const isJudge=run===rec.judge, name=isJudge?"Judge’s ruling":run.name;
      if(!run.ok) return el("div",{class:"quorum-r off"},el("span",{class:"mn",text:name}),el("span",{class:"quorum-w",text:"no answer"}));
      const r=runReading(run,t.text);
      if(!r) return el("div",{class:"quorum-r"},el("span",{class:"mn",text:name}),el("span",{class:"quorum-w",text:"does not mention it"}));
      const c=Object.assign({},base,{model:isJudge?"judge":run.name.toLowerCase()}), P=(part,partLabel,shown,txt,cls)=>flagPart(Object.assign({},c,{part,partLabel,shown}),"t"+i,txt,cls);
      const same=!!r.cell&&t.cells.includes(r.cell);
      // against the ruling: the judge's cell, when it ruled
      const vs=!isJudge&&jcell&&r.cell?r.cell===jcell:null;
      return el("div",{class:"quorum-r"+(isJudge?" ruling":"")},
        el("span",{class:"mn",text:name}),
        el("span",{class:"lps"},
          r.cell?el("span",{class:"lcell "+(same?"ok":"diff"),title:same?"Same cell as yours":"A different cell from yours"},P("cell","cell",CELL_NAME[r.cell],CELL_NAME[r.cell])):P("unsure","cell","unsure","unsure","uns"),
          P("inA","in A",sign(r.a),"A "+sign(r.a)),
          P("inB","in B",sign(r.b),"B "+sign(r.b))),
        el("span",{class:"lt"},vs===null?null:el("b",{class:"vs "+(vs?"yes":"no"),text:vs?"= ruling":"≠ ruling",title:vs?"The same cell as the judge’s":"A different cell from the judge’s"}),(run.ms/1000).toFixed(1)+" s"));
    };
    const rows=rec.models.map(rowFor); if(rec.judge) rows.push(rowFor(rec.judge));
    // the page's own verdict(s) for this thing
    const pv=t.cells.map(c=>{ const rr=U.res.cells[c]; if(!rr) return null; const by=rr.by==="claude"?" (checked by Claude)":""; const says=({ok:"fits",bad:"does not fit",cmp:"not checked"})[rr.v]||rr.v; return {c,txt:CELL_NAME[c]+": "+says+by}; }).filter(Boolean);
    const pr=el("div",{class:"quorum-r page"},el("span",{class:"mn",text:"Page"}),el("span",{class:"lps"},pv.map(x=>flagPart(Object.assign({},base,{part:"verdict",partLabel:"page verdict",n:x.c,shown:x.txt}),"t"+i,x.txt))));
    const head=el("p",{class:"quorum-t"},el("b",{lang:"en",text:"“"+t.text+"”"}),el("span",{class:"you",text:" you put it in "+t.cells.map(c=>CELL_NAME[c]).join(", ")}),
      flagPart(Object.assign({},base,{part:"check",partLabel:"the whole check",shown:"all runs"}),"t"+i,"Flag all","all"));
    box.append(el("div",{class:"quorum-c"},head,rows,pr,flagEditorNode("t"+i)));
  });
  // the answers themselves
  const all=el("details",{class:"quorum-txt"},el("summary",{text:"The answers"}));
  for(const run of rec.models.concat(rec.judge?[rec.judge]:[])) if(run.ok) all.append(el("p",{class:"quorum-tn"},el("b",{text:(run===rec.judge?"Judge":run.name)+(rec.shown===run.name?" (shown)":"")})),el("p",{class:"quorum-tt",text:run.text}));
  box.append(all);
  box.append(el("p",{class:"note faint",text:"Tap any value to flag it. The server keeps this run so the models can be compared; the page verdicts are the ones from the answer you see."}));
  if(state.flagErr) box.append(el("p",{class:"status",text:state.flagErr}));
  return box;
}
