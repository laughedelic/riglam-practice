import { state } from "../state.js";
import { el } from "../core/dom.js";
import { dayOf, isSyllogism } from "../core/util.js";
import { REPLIES, syllogismText } from "../../domain/syllogism.ts";
import { barNode, pct } from "./review.js";

/* ---------- Syllogisms: statistics and the last answers in the Review tab ---------- */
// The answers of Syllogisms are kept with the Relations answers (collection "answers", mode "syllogism") and left out of the Relations statistics; they are counted here.
// A reply counts as right when it was the reply the syllogism called for; a counter-example that was not one ("part") does not make the reply wrong, and has its own row.
const SAY={accept:"Accept",reason:"The reason is not established",pervasion:"There is no pervasion"};
const SAID={accept:"accept",reason:"the reason is not established",pervasion:"there is no pervasion"};
const MARK={ok:"✓",part:"~",bad:"✗"};
export function renderSyllogismStats(s){
  const all=/** @type {import("../types.ts").SyllogismDoc[]} */(/** @type {unknown} */(Object.values(state.answers).filter(isSyllogism))).sort((x,y)=>(x.at||"").localeCompare(y.at||""));
  if(!all.length) return;
  const right=all.filter(a=>a.correct).length;
  const rows=REPLIES.map(r=>{ const xs=all.filter(a=>a.answer===r); return [r,xs.length,xs.filter(a=>a.correct).length]; });
  const given=all.filter(a=>a.example), shown=given.filter(a=>a.example.verdict==="ok").length;
  // what was said instead of what was right, the most frequent first
  const mix={};
  for(const a of all) if(!a.correct) mix[a.said+">"+a.answer]=(mix[a.said+">"+a.answer]||0)+1;
  const mixed=Object.entries(mix).sort((x,y)=>y[1]-x[1]).slice(0,3);
  const sec=el("div",{class:"section"},el("p",{class:"label"},"Syllogisms",el("span",{class:"hint",text:all.length+(all.length===1?" syllogism":" syllogisms")+", reply right "+pct(right,all.length)+"%"})),
    el("table",{class:"tbl"},el("tbody",null,
      rows.map(([r,n,k])=>el("tr",null,el("td",{text:SAY[r]}),el("td",{class:"num"},n?k+" / "+n:"–",n?barNode(pct(k,n)):null))),
      given.length?el("tr",null,el("td",{text:"Counter-examples that were one"}),el("td",{class:"num"},shown+" / "+given.length,barNode(pct(shown,given.length)))):null)));
  if(mixed.length) sec.append(el("table",{class:"tbl"},el("tbody",null,
    mixed.map(([k,n])=>{ const [said,was]=k.split(">"); return el("tr",null,el("td",{text:"Said “"+SAID[said]+"” when it was “"+SAID[was]+"”"}),el("td",{class:"num",text:n+(n===1?" time":" times")})); }))));
  sec.append(el("ul",{class:"favs mist"},all.slice().reverse().slice(0,10).map(a=>
    el("li",null,el("div",{class:"sylrow"},el("span",{class:"m "+a.grade,text:MARK[a.grade]||"✗"}),
      el("span",null,syllogismText(/** @type {any} */(a),a.wording),
        el("span",{class:"sub",text:(a.correct?"Right: ":"You said “"+SAID[a.said]+"”; right: ")+SAID[a.answer]+" · "+dayOf(a.at)}),
        a.example?el("span",{class:"sub",text:"Your counter-example: "+a.example.text+(a.example.verdict==="ok"?" (it is one)":a.example.verdict==="bad"?" (it is not one)":" (not checked)")}):null))))));
  s.append(sec);
}
