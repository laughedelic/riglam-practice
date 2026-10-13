import { state } from "../state.js";
import { advanceDebate, freshDebateUi, startQ, stopTimer } from "../debate/flow.js";
import { advance, freshUi } from "../practice/queue.js";
import { skipCats } from "../practice/skips.js";
import { render, top0 } from "./render.js";

 const hold={};
// Practice and Debate each keep their own pair while you look at the other tab or at Review.
// Relations and Pervasions work on one pair: leaving one with its pair unfinished, the other opens the same pair at its first step (and keeps its own
// progress if it already holds that pair). A pair that is finished gives the other tab a new pair, as Next pair does.
const sameP=(x,y)=>!!x&&!!y&&((x.id&&x.id===y.id)||(x.a===y.a&&x.b===y.b&&x.relation===y.relation));
function adoptPair(k,p){
  const [ca,cb]=skipCats(p); if(!ca||!cb) return false;
  const q=Object.assign({},p,{catA:ca,catB:cb});
  if(k==="debate"){ state.cur={p:q,debate:true}; state.ui=freshDebateUi(); state.mode="quiz"; startQ(); }
  else { state.cur={p:q}; state.ui=freshUi(); state.mode="quiz"; }
  return true;
}
export function switchTo(k){
  stopTimer();
  if(k!=="review"&&state.own!==k){
    const left=state.cur&&state.cur.p&&state.ui&&!state.ui.checked?state.cur.p:null, was=state.cur&&state.cur.p;
    hold[state.own]={cur: state.cur,ui: state.ui}; state.own=k;
    const h=hold[k];
    if(h&&h.cur&&was&&sameP(h.cur.p,was)){ state.cur=h.cur; state.ui=h.ui; }
    else if(left&&adoptPair(k,left)){}
    else if(k==="debate") advanceDebate(); else advance();
  }
  state.tab=k;
  if(k==="debate"&&state.ui&&state.ui.debate&&!state.ui.checked&&state.ui.step<4) startQ();
}
export function setTab(k){ if(state.mode!=="quiz"&&k!=="review") return; switchTo(k); render(); top0(); }
