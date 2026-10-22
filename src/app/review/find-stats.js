import { state } from "../state.js";
import { el } from "../core/dom.js";
import { REL, lcRel } from "../core/rel.js";
import { dayOf, gradeOf, isFind } from "../core/util.js";
import { exerciseNode, practiceAgain } from "./exercise.js";
import { barNode, pct } from "./review.js";
import { FIND_ASKS } from "../../domain/find.ts";

/* ---------- Find a pair: statistics and the last answers in the Review tab ---------- */
// The answers of Find a pair are kept with the Relations answers (collection "answers", mode "find") and left out of the Relations statistics; they are counted here.
// A pair of the learner's own that Claude has not judged (`relOpen`) is in the list but not in the percentages.
const openFind=new Set();
const MARK={ok:"✓",part:"~",bad:"✗",pend:"?"};
// what Review counts of the Find a pair answers (the Path draws the same numbers, path/review.tsx); null without any
export function findStats(){
  const all=Object.values(state.answers).filter(isFind).sort((x,y)=>(x.at||"").localeCompare(y.at||""));
  if(!all.length) return null;
  const judged=all.filter(a=>!a.relOpen), right=judged.filter(a=>a.correct).length, own=all.filter(a=>a.pair&&a.pair.own).length;
  const rows=FIND_ASKS.filter(r=>r!=="4n"||all.some(a=>a.chosen===r)).map(r=>{ const xs=judged.filter(a=>a.chosen===r); return [r,xs.length,xs.filter(a=>a.correct).length]; });     // the sixth once it was asked for
  return {all,judged,right,own,rows};
}
// what a Find a pair answer says under its pair: the relation asked for, and whether the pair has it
export function findLine(a){
  const ask=REL[a.chosen]?lcRel(REL[a.chosen].name):String(a.chosen);
  const pairIs=a.correct?"the pair has it":a.relOpen?"not judged yet":REL[a.key]&&a.key!==a.chosen?"the pair is "+lcRel(REL[a.key].name):"the pair does not have it";
  return "Asked for "+ask+"; "+pairIs;
}
export function renderFindStats(s){
  const f=findStats(); if(!f) return;
  const {all,judged,right,own,rows}=f;
  const sec=el("div",{class:"section"},el("p",{class:"label"},"Find a pair",el("span",{class:"hint",text:all.length+" pairs, pair right "+pct(right,judged.length)+"%"})),
    el("table",{class:"tbl"},el("tbody",null,
      rows.map(([r,n,k])=>el("tr",null,el("td",{text:REL[r].name}),el("td",{class:"num"},n?k+" / "+n:"–",n?barNode(pct(k,n)):null))),
      own?el("tr",null,el("td",{text:"Pairs of your own words, judged by Claude"}),el("td",{class:"num",text:String(own)})):null)));
  sec.append(el("ul",{class:"favs mist"},all.slice().reverse().slice(0,10).map(a=>{
    const g=a.relOpen?"pend":gradeOf(a), k="f|"+a.pairId+"|"+a.at;
    const p=a.pair&&!a.pair.own?a.pair:null;
    return el("li",null,el("details",{open:openFind.has(k),ontoggle:e=>{ if(e.target.open) openFind.add(k); else openFind.delete(k); }},
      el("summary",null,el("span",{class:"m "+g,text:MARK[g]||"✗"}),el("span",null,a.a+" / "+a.b,el("span",{class:"sub",text:findLine(a)+" · "+dayOf(a.at)}))),
      el("div",{class:"fbody"},exerciseNode(a),p?el("div",{class:"actions left"},el("button",{type:"button",class:"btn",onclick:()=>practiceAgain(p,"Retry"),text:"Practice this pair"})):null)));
  })));
  s.append(sec);
}
