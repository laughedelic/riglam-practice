import { state } from "../state.js";
import { quorumChip, quorumNeeded, quorumThings, runReading } from "./quorum.js";

/* ---------- the Quorum panel of a result: the maintainer's view of the run behind the explanation (drawn by path/flags.tsx) ---------- */
// A chip on a checked answer, only where the server offers Quorum and this device has it on. It shows what every model and the judge said of each example the
// learner wrote, next to the page's own verdict, and the answers themselves. Any value can be flagged (collection "flags").
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
// the chip never opens by itself; its sign (statusOf) says whether the answers agree ("…" while running, "≠" when models differ from each other or from you, "=" when all agree)
export function quorumShown(){
  const U=state.ui;
  return !!(U&&U.checked&&quorumChip());
}
