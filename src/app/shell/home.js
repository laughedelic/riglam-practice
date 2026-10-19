import { state } from "../state.js";
import { el } from "../core/dom.js";
import { tbIcon } from "../core/icons.js";
import { dayOf, gradeOf, today } from "../core/util.js";
import { attemptOf, begun, setTab } from "./tabs.js";

/* ---------- Home ---------- */
// (In the bars and the back arrow's name this screen is "Practice"; in the code it stays `home`.)
// The first screen: a line on today's practice, then one row per exercise. An exercise with an attempt waiting (begun, or its result not yet
// left with Next pair) says "Continue" on its own row; it is never listed a second time. An exercise opens over Home with a back arrow (narrow screens);
// on wide screens the rail lists the same exercises. A new exercise is one more entry here.
export const EXERCISES=[
  {k:"practice",name:"Relations",desc:"Pick how two terms relate, then give an example for each case that exists."},
  {k:"debate",name:"Pervasions",desc:"Answer the four questions on two terms, then pick how they relate."},
  {k:"find",name:"Find a pair",desc:"Take a relation and name two terms that have it, then give an example for each case."}
];
export const exName=k=>(EXERCISES.find(e=>e.k===k)||{name:""}).name;
/** An exercise with an attempt waiting while you are elsewhere: begun, or checked and its result not yet left with Next pair. */
export const parked=k=>{ const u=(attemptOf(k)||{}).ui; return state.tab!==k&&!!u&&(u.checked||begun(u)); };
/** Today's pairs over every exercise, and how many were fully right. */
export function todayCount(){
  const list=[...Object.values(state.answers),...Object.values(state.debates)].filter(a=>dayOf(a.at)===today());
  return {n:list.length,ok:list.filter(a=>gradeOf(a)==="ok").length};
}
function todayLine(){
  const t=todayCount();
  return el("p",{class:"hday"},el("span",{class:"hl",text:"Today"}),
    t.n?el("span",null,el("b",{text:String(t.n)}),t.n===1?" pair":" pairs",el("span",{class:"hsep","aria-hidden":"true",text:" · "}),el("b",{text:String(t.ok)})," fully right")
      :el("span",{class:"faint",text:"Nothing practiced yet"}));
}
export function renderHome(s){
  const ready=state.mode==="quiz";
  // While the saved answers are still coming, today's numbers are not known yet: the line waits (and says Loading., which the PWA's start
  // watchdog looks for), and the rows cannot be opened.
  if(state.mode==="loading") s.append(el("p",{class:"status hload",text:"Loading."}));
  else if(state.mode==="nodata") s.append(el("p",{class:"status",text:"The practice data could not be loaded. Reload the page to try again."}));
  else s.append(todayLine());
  const list=el("div",{class:"exs"});
  for(const e of EXERCISES){
    const go=parked(e.k);
    list.append(el("button",{type:"button",class:"exr","data-go":e.k,disabled:!ready,onclick:()=>setTab(e.k)},
      el("span",{class:"ext"},
        el("span",{class:"exh"},el("span",{class:"exn",text:e.name}),go?el("span",{class:"exc"},el("i",{"aria-hidden":"true"}),"Continue"):null),
        el("span",{class:"exd",text:e.desc})),
      el("span",{class:"exa","aria-hidden":"true"},tbIcon("chev"))));
  }
  s.append(el("section",{class:"home","aria-labelledby":"exh"},el("h2",{class:"label",id:"exh",text:"Exercises"}),list));
}
