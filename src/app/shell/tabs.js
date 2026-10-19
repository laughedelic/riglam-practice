import { state } from "../state.js";
import { advanceDebate, freshDebateUi, startQ, stopTimer } from "../debate/flow.js";
import { advanceFind } from "../find/flow.js";
import { advance, freshUi } from "../practice/queue.js";
import { skipCats } from "../practice/skips.js";
import { closeChat } from "./chat.js";
import { toggleOpts } from "./options.js";
import { toggleSess } from "./session.js";
import { render, top0 } from "./render.js";

const hold={};
// The screens: Home, the exercises ("practice" is Relations, "debate" Pervasions, "find" Find a pair) and Review. Each exercise keeps its own
// attempt while you are anywhere else: an unfinished one is parked and comes back as it was ("Continue" on Home). Relations and Pervasions work
// on one pair: opening one while the other has an unfinished pair, and nothing of its own begun or checked, opens that pair at its first step.
// Find a pair is its own exercise (the learner names the pair): it gives no pair to the other two and takes none from them.
// A checked attempt comes back on its result too; only Next pair moves on from it.
const isEx=k=>k==="practice"||k==="debate"||k==="find";
const sameP=(x,y)=>!!x&&!!y&&((x.id&&x.id===y.id)||(x.a===y.a&&x.b===y.b&&x.relation===y.relation));
function adoptPair(k,p){
  const [ca,cb]=skipCats(p); if(!ca||!cb) return false;
  const q=Object.assign({},p,{catA:ca,catB:cb});
  if(k==="debate"){ state.cur={p:q,debate:true}; state.ui=freshDebateUi(); state.mode="quiz"; startQ(); }
  else { state.cur={p:q}; state.ui=freshUi(); state.mode="quiz"; }
  return true;
}
/** Whether an attempt has begun: a relation picked, an example written, a question answered. A pair only drawn has not. */
export function begun(u){
  if(!u||u.checked) return false;
  const typed=()=>Object.values(u.cells).some(c=>c.t.trim()||c.none);
  if(u.find) return u.step>0||!!u.wordA.trim()||!!u.wordB.trim()||typed();          // Find a pair: its relation is given, so words count
  if(u.rel) return true;
  if(u.debate) return u.step>0||u.ans.some(a=>a.say||a.text);
  return typed();
}
/** The attempt an exercise holds: the one on screen for the current exercise, the parked one for the others. */
export function attemptOf(k){
  const h=k===state.own?{cur:state.cur,ui:state.ui}:hold[k];
  return h&&h.ui?h:null;
}
export function switchTo(k){
  stopTimer();
  if(isEx(k)&&state.own!==k){
    const from=state.own, left=k!=="find"&&from!=="find"&&state.cur&&state.cur.p&&state.ui&&!state.ui.checked?state.cur.p:null;
    hold[from]={cur: state.cur,ui: state.ui}; state.own=k;
    const h=hold[k];
    if(h&&h.ui&&(h.ui.checked||begun(h.ui)||!left||sameP(h.cur.p,left))){ state.cur=h.cur; state.ui=h.ui; }
    else if(k==="find") advanceFind();
    else if(left&&adoptPair(k,left)){}
    else if(k==="debate") advanceDebate(); else advance();
  }
  state.tab=k;
  if(k==="debate"&&state.ui&&state.ui.debate&&!state.ui.checked&&state.ui.step<4) startQ();
}
// Going to a screen from the bars, Home or the back arrow. A screen shows itself, not a panel over it: Options and the chat close first.
export function setTab(k){
  if(state.mode!=="quiz"&&isEx(k)) return;
  if(state.optsOpen) toggleOpts(false);
  if(state.sessOpen) toggleSess(false);
  if(state.view==="chat") closeChat();
  if(state.tab===k){ top0(); return; }
  const from=state.tab;
  switchTo(k); render(); top0(); keepFocus(from);
}
// A Home row or the back arrow is gone once it has been used: the keyboard focus goes to the new screen (back on Home, to the row of
// the exercise just left), not to the end of the page. A rail or tab bar button stays, and keeps it.
function keepFocus(from){
  const a=/** @type {HTMLElement|null} */(document.activeElement);
  if(a&&a!==document.body&&a.isConnected&&a.offsetParent) return;
  const row=/** @type {HTMLElement|null} */(state.tab==="home"?document.querySelector(`.exr[data-go="${from}"]`):null);
  (row||/** @type {HTMLElement} */(document.getElementById("stage"))).focus({preventScroll:true});
}
