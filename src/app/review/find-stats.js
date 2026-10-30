import { state } from "../state.js";
import { REL, lcRel } from "../core/rel.js";
import { isFind } from "../core/util.js";
import { FIND_RELS } from "../../domain/find.ts";

/* ---------- Find a pair: what Review counts (path/review.tsx draws it) ---------- */
// The answers of Find a pair are kept with the Relations answers (collection "answers", mode "find") and left out of the Relations statistics; they are counted here.
// A pair of the learner's own that Claude has not judged (`relOpen`) is in the list but not in the percentages.
// null without any answers
export function findStats(){
  const all=Object.values(state.answers).filter(isFind).sort((x,y)=>(x.at||"").localeCompare(y.at||""));
  if(!all.length) return null;
  const judged=all.filter(a=>!a.relOpen), right=judged.filter(a=>a.correct).length, own=all.filter(a=>a.pair&&a.pair.own).length;
  const rows=FIND_RELS.map(r=>{ const xs=judged.filter(a=>a.chosen===r); return [r,xs.length,xs.filter(a=>a.correct).length]; });
  return {all,judged,right,own,rows};
}
// what a Find a pair answer says under its pair: the relation asked for, and whether the pair has it
export function findLine(a){
  const ask=REL[a.chosen]?lcRel(REL[a.chosen].name):String(a.chosen);
  const pairIs=a.correct?"the pair has it":a.relOpen?"not judged yet":REL[a.key]&&a.key!==a.chosen?"the pair is "+lcRel(REL[a.key].name):"the pair does not have it";
  return "Asked for "+ask+"; "+pairIs;
}
