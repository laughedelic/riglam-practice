import { state } from "../state.js";
import { persist } from "../practice/answers.js";
import { freshUi, moveOn } from "../practice/queue.js";
import { guidance } from "../practice/guided.ts";
import { render, top0 } from "../shell/render.js";
import { drawPlace, gradePlace, placeGrade } from "../../domain/place.ts";
import { timeUpView } from "../../domain/sprint.ts";
import { gradeTerms, openNow, unmetNow } from "../practice/stops.ts";
import { shareNow, stageStep } from "../practice/stage-offer.ts";

/* ---------- Categories: a thing is shown; tick the categories it is in ---------- */
// The rules (which things and categories are asked, what is right and why) are in src/domain/place.ts, the offer of another stage in practice/stage-offer.ts; this is the page around them: the
// steps, the screen state and the saved answer. An answer is kept in the collection "answers" with `mode: "categories"`, so it is stored and synced like the others, and the lists
// that mean the Relations exercise leave it out (practice/universe.js, answerList). The state of the screen is the usual one with `step` 0 while the categories are asked (all at
// once, or one category at a time: `i` is the one asked), and 1 with `checked` once they are checked and the result is shown. A second step, the most specific of the categories
// that apply (domain/place.ts, placeNarrow), was asked here until it was taken out; answers stored before keep it as `narrow` and `s2`.
const RECENT=12;
const store=(key,v)=>{ try{ localStorage.setItem(key,v); }catch(e){} };
/** The answers to Categories, oldest first. They sit in the collection of the Relations answers, in a shape of their own (types.ts, CategoriesDoc). */
export function freshCategoriesUi(){
  return Object.assign(freshUi(),{cats:true, open:false, step:0, ticked:[], i:0, said:{}, ask:state.catsAsk, g1:null, grade:null, offer:null});
}
/** The thing on screen with its categories, or undefined when the stages that are on have nothing to ask about. */
export const shownThing=()=>state.cur.q;

/** Draws the next thing: a practice item or a reference example (where the device holds them) of the stages that are on, leaning away from the ones asked lately. */
export function advanceCategories(){
  const q=drawPlace(state,state.EX?state.EX.items:null,{stages:state.stages,unmet:unmetNow(),open:openNow(),rng:Math.random,avoid:new Set(state.catsRecent),newShare:shareNow()});
  if(q) state.catsRecent=[...state.catsRecent,q.thing.n].slice(-RECENT);
  state.cur=/** @type {any} */({p:null,cats:true,q:q||undefined,tried:drawKey()}); state.ui=freshCategoriesUi(); state.mode="quiz";
}
/** What the last draw drew from: the stages, whether the device held the reference examples, and how many course terms were not met yet. A draw that found nothing is tried again once this changes. */
export const drawKey=()=>state.stages.join(",")+(state.EX?"+ex":"")+"-"+unmetNow().size;
/** Skip: another thing, with nothing kept (there is no pair to set aside and bring back). */
export function skipCategories(){ advanceCategories(); render(); top0(); }

/** Whether this attempt has begun: something ticked or answered, or checked. */
export const categoriesBegun=u=>u.step>0||u.ticked.length>0||u.i>0;
/** The way the categories are asked ("all" at once, or "one" by one), kept on this device. It applies at once to a thing that has not been started, and from the next thing otherwise. */
export function setCategoriesAsk(k){
  state.catsAsk=k==="one"?"one":"all"; store("rd-cats-ask",state.catsAsk);
  const u=state.ui; if(u&&u.cats&&!u.checked&&!categoriesBegun(u)) u.ask=state.catsAsk;
  render();
}

// ---- all at once: tick, then check
/** Ticks or unticks a category. */
export function tickCategory(cat){
  const u=state.ui; if(!u||!u.cats||u.step!==0||u.checked||u.ask!=="all") return;
  u.ticked=u.ticked.includes(cat)?u.ticked.filter(c=>c!==cat):[...u.ticked,cat];
  render();
}
/** Unticks everything (the Path's "reset"): what is left is the answer "none of these". */
export function resetCategories(){
  const u=state.ui; if(!u||!u.cats||u.step!==0||u.checked||u.ask!=="all") return;
  u.ticked=[];
  render();
}
/** Check: grades what was ticked; nothing ticked is the answer "none of these". */
export function checkCategories(){
  const u=state.ui; if(!u||!u.cats||u.step!==0||u.checked||u.ask!=="all"||!state.cur.q) return;
  finishThing(u.ticked);
}
// ---- one at a time: yes or no for each category
/** The answer to the category asked now. After the last one the answers are checked, from what was said yes to. */
export function sayCategory(yes){
  const u=state.ui, q=state.cur.q; if(!u||!u.cats||u.step!==0||u.checked||u.ask!=="one"||!q||u.i>=q.rows.length) return;
  u.said[q.rows[u.i].cat]=yes; u.i++;
  if(u.i>=q.rows.length){ finishThing(q.rows.filter(r=>u.said[r.cat]).map(r=>r.cat)); return; }
  render();
}
/** Time up on the ticks of one screen (Sprint, shell/timers.js): what is ticked stands, the rest counts as not ticked, and the screen is checked as it is. With nothing ticked at
 *  None, it is kept so, with no result, and the next thing comes (domain/sprint.ts, timeUpView). */
export function timeUpCategories(){
  const u=state.ui; if(!u||!u.cats||u.step!==0||u.checked||u.ask!=="all"||!state.cur.q) return;
  u.ranOut=true;
  const skip=!u.ticked.length&&timeUpView(guidance("categories"))==="skip";
  if(skip) u.passOn=true;
  finishThing(u.ticked);
  if(skip) moveOn();
}
/** Time up on one category: it counts as no, and the next is asked. */
export function timeUpCategory(){
  const u=state.ui; if(!u||!u.cats||u.step!==0||u.checked||u.ask!=="one") return;
  u.ranOut=true;
  sayCategory(false);
}
const docId=()=>"categories-"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
// The thing is done: the categories said (ids) are graded, the result shows, the answer is kept, and a stage may be offered or taken off.
// `level` is a reference example's (a practice item is a plain thing, level 1, as earlier versions read it); `stage` is the thing's.
function finishThing(picked){
  const u=state.ui, q=state.cur.q;
  u.g1=gradePlace(q,picked);
  const s1=u.g1.ok;
  u.grade=placeGrade(s1,null); u.step=1; u.checked=true;
  const doc=/** @type {import("../types.ts").CategoriesDoc} */({pairId:docId(),mode:"categories",thing:q.thing.n,level:q.thing.ex?q.thing.ex.lv:1,stage:q.thing.st,
    rows:u.g1.rows.map(r=>({cat:r.cat,yes:r.answer,said:r.picked})),s1,grade:u.grade,ask:u.ask,...(u.ranOut?{timeout:true}:{}),at:new Date().toISOString()});
  gradeTerms(doc.rows.map(r=>({cat:r.cat,ok:r.yes===r.said})));     // each row grades its category's term (practice/stops.ts)
  stageStep("categories",q.thing.st,u.grade==="ok");     // the run towards an offer of the stages, and the offer when one is due (practice/stage-offer.ts)
  render(); top0();
  if(!state.db) return;
  u.saveId=doc.pairId; u.doc=/** @type {any} */(doc);       // the stored shape of Categories is not a pair's (types.ts); persist() only reads its keys
  persist(u,"Your answer");
}

