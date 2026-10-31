import { state } from "../state.js";
import { CELLS, REL, lcRel } from "../core/rel.js";
import { dayOf, gradeOf, isMiss, pairsOf } from "../core/util.js";
import { advance } from "../practice/queue.js";
import { answerList } from "../practice/universe.js";
import { render, top0 } from "../shell/render.js";
import { switchTo } from "../shell/tabs.js";

/* ---------- review: what the Review page counts (path/review.tsx draws it) ---------- */
export function pct(n,d){ return d?Math.round(100*n/d):0; }
// what Review counts of the Relations answers: the grades, the relation right, the last 14 days, each relation
/** @type {[string, string][]} */
export const GRADES=[["ok","Fully right"],["pend","Examples unchecked"],["part","Partly right"],["bad","Wrong"]];
export const RNAME={mi:"Mutually inclusive",con:"Mutually exclusive","3":"Three possibilities","4":"Four possibilities"};
/** @returns {{relOk: number, G: Record<string, number>, segs: [string, string][], days: [string, number][], byRel: [string, number, number][], ran: number}} */
export function overview(all){
  const relOk=all.filter(a=>a.correct).length, G={ok:0,pend:0,part:0,bad:0};
  for(const a of all){ const g=gradeOf(a); G[g in G?g:"bad"]++; }
  /** @type {[string, number][]} */ const days=[]; for(let i=13;i>=0;i--){ const d=new Date(Date.now()-i*864e5).toISOString().slice(0,10); days.push([d,all.filter(a=>dayOf(a.at)===d).length]); }
  const byRel=["mi","3","4","con"].map(r=>{ const xs=all.filter(a=>(a.key==="3ab"||a.key==="3ba"?"3":a.key)===r); return /** @type {[string, number, number]} */([r,xs.length,xs.filter(a=>a.correct).length]); });
  const ran=all.filter(a=>a.timeout).length;       // Sprint: the time ran out, on the relation or on an example
  return {relOk,G,segs:GRADES.filter(([g])=>G[g]),days,byRel,ran};
}
// what a mistake says under its pair: the relation chosen and the right one, the wrong cells, the time that ran out
export function mistakeLine(a){
  const bad=CELLS.filter(c=>a.cells&&a.cells[c]&&a.cells[c].verdict==="bad");
  return (a.correct?"Relation right ("+lcRel(REL[a.key].name)+"), ":(a.chosen==null?"No pick, time ran out":"Chose "+(REL[a.chosen]?lcRel(REL[a.chosen].name):a.chosen))+"; correct: "+(REL[a.key]?lcRel(REL[a.key].name):a.key)+". ")+
    (bad.length?(a.correct?"w":"W")+"rong cell"+(bad.length>1?"s":"")+": "+bad.map(c=>({both:"both",anb:"A not B",bna:"B not A",nei:"neither"}[c])).join(", ")+".":"")+(a.timeout==="examples"||a.timeout==="both"?" Time ran out on the examples.":"");
}
// the categories of the pairs missed most often, at most six, each in two pairs or more
export function weakSpots(all){
  const cs={};
  for(const a of all){ for(const c of [a.catA,a.catB]){ if(!c||!state.CAT[c]) continue; const o=cs[c]||(cs[c]={n:0,bad:0}); o.n++; if(isMiss(a)) o.bad++; } }
  return Object.entries(cs).filter(([,o])=>o.n>=2&&o.bad).sort((x,y)=>y[1].bad/y[1].n-x[1].bad/x[1].n||y[1].n-x[1].n).slice(0,6);
}
export function pairFromAnswer(a){
  if(a.pair) return a.pair;
  for(const b of state.batches){ const q=pairsOf(b).find(p=>p.id===a.pairId); if(q) return q; }
  return null;
}
export function uniqueMistakePairs(miss){
  const seen=new Set(), out=[];
  for(const a of miss){
    if(a.retryOf&&answerList().some(x=>x.retryOf===a.retryOf&&x.at>a.at&&gradeOf(x)==="ok")) continue;
    const p=pairFromAnswer(a); if(!p) continue;
    const k=p.a+"|"+p.b; if(seen.has(k)) continue;
    // skip pairs already put right in a later retry
    if(answerList().some(x=>x.retryOf===p.id&&x.at>a.at&&gradeOf(x)==="ok")) continue;
    seen.add(k); out.push(p);
  }
  return out;
}
export function startRetry(ps){ switchTo("practice"); state.retryQ=ps.slice(0,10); state.retryTag="Retry"; advance(); render(); top0(); }
