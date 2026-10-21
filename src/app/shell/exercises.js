import { state } from "../state.js";
import { dayOf, gradeOf, isSyllogism, today } from "../core/util.js";
import { attemptOf, begun } from "./tabs.js";

/* ---------- the exercises ---------- */
// The list the menu is built from (shell/menu.js): a new exercise is one more entry here, plus its screen. `group` heads the entries
// in the menu once there is more than one group.
export const EXERCISES=[
  {k:"practice",name:"Relations",group:"Two terms",desc:"Pick how two terms relate, then give an example for each case that exists."},
  {k:"debate",name:"Pervasions",group:"Two terms",desc:"Answer the four questions on two terms, then pick how they relate."},
  {k:"find",name:"Find a pair",group:"Two terms",desc:"Take a relation and name two terms that have it, then give an example for each case."},
  {k:"syllogism",name:"Syllogisms",group:"Reasons",desc:"A subject, a predicate and a reason: deny the reason, deny the pervasion, or accept it."}
];
export const exName=k=>(EXERCISES.find(e=>e.k===k)||{name:""}).name;
/** An exercise with an attempt waiting while you are elsewhere: begun, or checked and its result not yet left with Next pair. */
export const parked=k=>{ const u=(attemptOf(k)||{}).ui; return state.tab!==k&&!!u&&(u.checked||begun(u)); };
/** Today's pairs over every exercise that has its answers in Review, and how many were fully right (a syllogism is not a pair, and Review does not list it). */
export function todayCount(){
  const list=[...Object.values(state.answers).filter(a=>!isSyllogism(a)),...Object.values(state.debates)].filter(a=>dayOf(a.at)===today());
  return {n:list.length,ok:list.filter(a=>gradeOf(a)==="ok").length};
}
