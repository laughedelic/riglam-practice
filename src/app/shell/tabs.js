import { state } from "../state.js";
import { advanceDebate, freshDebateUi, startQ, stopTimer } from "../debate/flow.js";
import { advanceFind } from "../find/flow.js";
import { advance, freshUi } from "../practice/queue.js";
import { skipCats } from "../practice/skips.js";
import { render, top0 } from "./render.js";

 const hold={};
// Practice, Debate and Find a pair each keep their own pair while you look at another tab or at Review.
// Relations and Pervasions work on one pair: leaving one with its pair unfinished, the other opens the same pair at its first step (and keeps its own
// progress if it already holds that pair). A pair that is finished gives the other tab a new pair, as Next pair does.
// Find a pair is its own exercise (the learner names the pair): it gives no pair to the other two and takes none from them. Going to or from it, the exercise
// you left keeps its place if it was unfinished, and a finished one starts again.
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
    const from=state.own, left=state.cur&&state.cur.p&&state.ui&&!state.ui.checked?state.cur.p:null, was=state.cur&&state.cur.p;
    hold[from]={cur: state.cur,ui: state.ui}; state.own=k;
    const h=hold[k];
    if(k==="find"||from==="find"){
      if(h&&h.cur&&h.ui&&!h.ui.checked){ state.cur=h.cur; state.ui=h.ui; }
      else if(k==="find") advanceFind(); else if(k==="debate") advanceDebate(); else advance();
    }
    else if(h&&h.cur&&was&&sameP(h.cur.p,was)){ state.cur=h.cur; state.ui=h.ui; }
    else if(left&&adoptPair(k,left)){}
    else if(k==="debate") advanceDebate(); else advance();
  }
  state.tab=k;
  if(k==="debate"&&state.ui&&state.ui.debate&&!state.ui.checked&&state.ui.step<4) startQ();
}
export function setTab(k){ if(state.mode!=="quiz"&&k!=="review") return; switchTo(k); render(); top0(); }
