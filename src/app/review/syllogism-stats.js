import { state } from "../state.js";
import { isSyllogism } from "../core/util.js";
import { REPLIES } from "../../domain/syllogism.ts";

/* ---------- Syllogisms: what Review counts (path/review.tsx draws it) ---------- */
// The answers of Syllogisms are kept with the Relations answers (collection "answers", mode "syllogism") and left out of the Relations statistics; they are counted here.
// A reply counts as right when it was the reply the syllogism called for; a counter-example that was not one ("part") does not make the reply wrong, and has its own row.
// Blitz: when the time ran out there is no reply (`timeout`); it counts as wrong, is not a mix-up, and has its own row.
export const SAY={accept:"Accept",reason:"The reason is not established",pervasion:"There is no pervasion"};
export const SAID={accept:"accept",reason:"the reason is not established",pervasion:"there is no pervasion"};
// null without any answers
export function syllogismStats(){
  const all=/** @type {import("../types.ts").SyllogismDoc[]} */(/** @type {unknown} */(Object.values(state.answers).filter(isSyllogism))).sort((x,y)=>(x.at||"").localeCompare(y.at||""));
  if(!all.length) return null;
  const right=all.filter(a=>a.correct).length;
  const rows=REPLIES.map(r=>{ const xs=all.filter(a=>a.answer===r); return [r,xs.length,xs.filter(a=>a.correct).length]; });
  // a counter-example the page could not place ("not checked") is neither one nor not one: it stays out of the row, as an unjudged example does in Find a pair
  const given=all.filter(a=>a.example&&a.example.verdict!=="cmp"), shown=given.filter(a=>a.example.verdict==="ok").length, late=all.filter(a=>a.timeout).length;
  // what was said instead of what was right, the most frequent first
  const mix={};
  for(const a of all) if(!a.correct&&a.said) mix[a.said+">"+a.answer]=(mix[a.said+">"+a.answer]||0)+1;
  const mixed=Object.entries(mix).sort((x,y)=>y[1]-x[1]).slice(0,3);
  return {all,right,rows,given,shown,late,mixed};
}
// what a Syllogisms answer says under it: the reply and the right one, and the counter-example offered
export const sylLine=a=>(a.correct?"Right: ":a.said?"You said “"+SAID[a.said]+"”; right: ":"Time ran out; right: ")+SAID[a.answer];
export const sylExample=a=>a.example?"Your counter-example: "+a.example.text+(a.example.verdict==="ok"?" (it is one)":a.example.verdict==="bad"?" (it is not one)":" (not checked)"):"";
