import { state } from "../state.js";
import { $ } from "../core/dom.js";
import { advanceDebate, asking, freshDebateUi, startQ, stopTimer } from "../debate/flow.js";
import { advanceCategories, categoriesBegun } from "../categories/flow.js";
import { advanceInstance, instanceBegun } from "../instance/flow.ts";
import { advanceSyllogism } from "../syllogism/flow.js";
import { advanceFind } from "../find/flow.js";
import { advance, freshUi } from "../practice/queue.js";
import { skipCats } from "../practice/skips.js";
import { closeChat } from "./chat.js";
import { toggleOpts } from "./options.js";
import { toggleSess } from "./session.js";
import { render, top0 } from "./render.js";

const hold={};
// The screens: the exercises ("practice" is Relations, "debate" Pervasions, "find" Find a pair) and Review. Each exercise keeps its own
// attempt while you are anywhere else: an unfinished one is parked and comes back as it was ("continue" in the menu). Relations and Pervasions work
// on one pair: opening one while the other has an unfinished pair, and nothing of its own begun or checked, opens that pair at its first step.
// Find a pair is its own exercise (the learner names the pair): it gives no pair to the other two and takes none from them. Syllogisms has no pair at all, only a syllogism,
// Categories only a thing with its categories, and Find an instance only a set of categories; each is apart in the same way.
// A checked attempt comes back on its result too; only Next pair moves on from it.
const isEx=k=>k==="practice"||k==="debate"||k==="find"||k==="syllogism"||k==="categories"||k==="instance";
const ownPair=k=>k==="find"||k==="syllogism"||k==="categories"||k==="instance";
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
  if(u.cats) return categoriesBegun(u);                                                    // Categories: something ticked or answered, or step 1 checked
  if(u.inst) return instanceBegun(u);                                                      // Find an instance: something written, or "nothing is"
  if(u.syllogism) return u.step>0;                                                         // Syllogisms: the reply is given, and the counter-example waits
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
/** The first pair, in the exercise the app opens on (the one used last). */
export function startFirst(){
  const k=state.tab==="review"?state.own:state.tab;   // Review opened before the first pair is drawn: the exercise under it gets its pair
  if(k==="debate") advanceDebate(); else if(k==="find") advanceFind(); else if(k==="categories") advanceCategories(); else if(k==="instance") advanceInstance(); else if(k==="syllogism") advanceSyllogism(); else advance();
  state.mode="quiz";
  if(k!==state.tab) stopTimer();                       // its clock starts when Review is left (setTab)
}
export function switchTo(k){
  stopTimer();
  if(isEx(k)&&state.own!==k){
    const from=state.own, left=!ownPair(k)&&!ownPair(from)&&state.cur&&state.cur.p&&state.ui&&!state.ui.checked?state.cur.p:null;
    hold[from]={cur: state.cur,ui: state.ui}; state.own=k;
    const h=hold[k];
    if(h&&h.ui&&(h.ui.checked||begun(h.ui)||!left||sameP(h.cur.p,left))){ state.cur=h.cur; state.ui=h.ui; }
    else if(k==="find") advanceFind();
    else if(k==="categories") advanceCategories();
    else if(k==="instance") advanceInstance();
    else if(k==="syllogism") advanceSyllogism();
    else if(left&&adoptPair(k,left)){}
    else if(k==="debate") advanceDebate(); else advance();
  }
  state.tab=k;
  if(isEx(k)) try{ localStorage.setItem("rd-ex",k); }catch(e){}
  if(k==="debate"&&state.ui&&state.ui.debate&&!state.ui.checked&&state.ui.step<4) startQ();
}
// Going to a screen from the menu or the back arrow. A screen shows itself, not a panel over it: Settings, the options and the chat close first, and so does the menu.
export function setTab(k){
  if(state.mode!=="quiz"&&isEx(k)) return;
  if(state.optsOpen) toggleOpts(false);
  if(state.sessOpen) toggleSess(false);
  if(state.view==="chat") closeChat();
  state.fromRoad=state.design==="path"&&!isEx(k)&&(state.menuOpen||state.fromRoad);   // Review from the roadmap goes back there (shell/history.js)
  state.skipAsk=false; state.menuOpen=false; state.menuPeek=false; state.pathProg=null;   // Review, not the Progression page that stands in for it (path/progression.tsx)
  if(state.tab!==k) switchTo(k);
  if(state.blitz&&asking()&&!state.ui.tq) startQ();       // the question's clock stood still behind the menu
  render(); top0(); focusStage();
}
// A menu row is gone once it has been used (the drawer closes): the keyboard focus goes to the new screen, not to the end of the page.
// A button that is still there (the pinned menu's) keeps it.
function focusStage(){
  const a=/** @type {HTMLElement|null} */(document.activeElement);
  if(a&&a!==document.body&&a.isConnected&&a.offsetParent) return;
  $("stage").focus({preventScroll:true});
}
