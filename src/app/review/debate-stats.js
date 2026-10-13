import { state } from "../state.js";
import { el } from "../core/dom.js";
import { qPlain } from "../debate/text.js";
import { barNode, pct } from "./review.js";

/* ---------- debate: statistics in the Review tab ---------- */
export function renderDebateStats(s){
  const all=Object.values(state.debates).sort((x,y)=>(x.at||"").localeCompare(y.at||""));
  if(!all.length) return;
  const relOk=all.filter(a=>a.correct).length;
  const rows=[0,1,2,3].map(i=>{ const xs=all.map(a=>a.qs&&a.qs[i]).filter(Boolean); return [i,xs.length,xs.filter(q=>q.dok).length]; });
  const times=all.flatMap(a=>(a.qs||[]).filter(q=>q.limit&&q.say!=="time"&&!q.timeout&&q.ms!=null).map(q=>q.ms)).sort((x,y)=>x-y);
  const med=times.length?times[Math.floor(times.length/2)]:null;
  const timedN=all.reduce((n,a)=>n+(a.qs||[]).filter(q=>q.limit).length,0), outN=all.reduce((n,a)=>n+(a.qs||[]).filter(q=>q.timeout).length,0);
  s.append(el("div",{class:"section"},el("p",{class:"label"},"Pervasions",el("span",{class:"hint",text:all.length+" pairs, relation right "+pct(relOk,all.length)+"%"})),
    el("table",{class:"tbl"},el("tbody",null,
      rows.map(([i,n,k])=>el("tr",null,el("td",{text:"Question "+(i+1)+": "+qPlain(i)}),el("td",{class:"num"},n?k+" / "+n:"–",n?barNode(pct(k,n)):null))),
      med!=null?el("tr",null,el("td",{text:"Median time to answer, blitz"}),el("td",{class:"num",text:(med/1000).toFixed(1)+" s"})):null,
      timedN?el("tr",null,el("td",{text:"Ran out of time (counted as accepted)"}),el("td",{class:"num",text:outN+" / "+timedN})):null))));
}
