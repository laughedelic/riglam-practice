import { state } from "../state.js";
import { $ } from "../core/dom.js";
import { isCategories } from "../core/util.js";
import { isWide } from "../core/viewport.js";
import { persist } from "../practice/answers.js";
import { freshUi } from "../practice/queue.js";
import { render, renderKeepFocus, top0 } from "../shell/render.js";
import { drawPlace, gradeNarrow, gradePlace, placeGrade, placeNarrow } from "../../domain/place.ts";
import { gradeTerms, openNow, unmetNow } from "../practice/stops.ts";
import { acceptStageOffer, declineStageOffer, shareNow, stageStep } from "../practice/stage-offer.ts";

/* ---------- Categories: a thing is shown; tick the categories it is in, then pick the most specific ---------- */
// The rules (which things and categories are asked, what is right and why) are in src/domain/place.ts, the offer of another stage in practice/stage-offer.ts; this is the page around them: the
// steps, the screen state and the saved answer. An answer is kept in the collection "answers" with `mode: "categories"`, so it is stored and synced like the others, and the lists
// that mean the Relations exercise leave it out (practice/universe.js, answerList). The state of the screen is the usual one with `step` 0 while step 1 is asked (all at once,
// or one category at a time: `i` is the one asked), 1 once step 1 is checked, 2 while the most specific category is picked, and `checked` once the thing is done and its result is shown.
const RECENT=12;
const store=(key,v)=>{ try{ localStorage.setItem(key,v); }catch(e){} };
/** The answers to Categories, oldest first. They sit in the collection of the Relations answers, in a shape of their own (types.ts, CategoriesDoc). */
export const categoriesList=()=>/** @type {import("../types.ts").CategoriesDoc[]} */(/** @type {unknown} */(Object.values(state.answers).filter(isCategories))).sort((x,y)=>(x.at||"").localeCompare(y.at||""));
export function freshCategoriesUi(){
  return Object.assign(freshUi(),{cats:true, open:false, step:0, ticked:[], none:false, i:0, said:{}, ask:state.catsAsk, g1:null, narrow:null, g2:null, grade:null, offer:null});
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

/** Whether this attempt has begun: something ticked or answered, or past step 1. */
export const categoriesBegun=u=>u.step>0||u.ticked.length>0||u.none||u.i>0;
/** The way step 1 asks ("all" at once, or "one" by one), kept on this device. It applies at once to a thing that has not been started, and from the next thing otherwise. */
export function setCategoriesAsk(k){
  state.catsAsk=k==="one"?"one":"all"; store("rd-cats-ask",state.catsAsk);
  const u=state.ui; if(u&&u.cats&&!u.checked&&!categoriesBegun(u)) u.ask=state.catsAsk;
  render();
}

const focusFwd=()=>{ if(!isWide()){ const bs=document.querySelectorAll("#stage .actions .btn"); if(bs.length) /** @type {HTMLElement} */(bs[bs.length-1]).focus({preventScroll:true}); } else $("stage").focus({preventScroll:true}); };

// ---- step 1, all at once: tick, then check
/** Ticks or unticks a category; "None of these" and a tick exclude each other. */
export function tickCategory(cat){
  const u=state.ui; if(!u||!u.cats||u.step!==0||u.checked||u.ask!=="all") return;
  u.none=false;
  u.ticked=u.ticked.includes(cat)?u.ticked.filter(c=>c!==cat):[...u.ticked,cat];
  renderKeepFocus();
}
export function tickNone(){
  const u=state.ui; if(!u||!u.cats||u.step!==0||u.checked||u.ask!=="all") return;
  u.none=!u.none; if(u.none) u.ticked=[];
  renderKeepFocus();
}
/** Unticks everything (the Path's "reset"): what is left is the answer "none of these". */
export function resetCategories(){
  const u=state.ui; if(!u||!u.cats||u.step!==0||u.checked||u.ask!=="all") return;
  u.ticked=[]; u.none=false;
  renderKeepFocus();
}
/** Check: grades what was ticked. Needs a tick or "None of these", unless `emptyIsNone` (the Path, which has no "None of these": nothing ticked is that answer). */
export function checkCategories(emptyIsNone=false){
  const u=state.ui; if(!u||!u.cats||u.step!==0||u.checked||u.ask!=="all"||(!u.ticked.length&&!u.none&&!emptyIsNone)||!state.cur.q) return;
  finishStep1(u.ticked);
}
// ---- step 1, one at a time: yes or no for each category
/** The answer to the category asked now. After the last one step 1 is checked, from what was said yes to. */
export function sayCategory(yes){
  const u=state.ui, q=state.cur.q; if(!u||!u.cats||u.step!==0||u.checked||u.ask!=="one"||!q||u.i>=q.rows.length) return;
  u.said[q.rows[u.i].cat]=yes; u.i++;
  if(u.i>=q.rows.length){ finishStep1(q.rows.filter(r=>u.said[r.cat]).map(r=>r.cat)); return; }
  renderKeepFocus();
}
function finishStep1(picked){
  const u=state.ui, q=state.cur.q;
  u.g1=gradePlace(q,picked);
  u.narrow=placeNarrow(state,q,Math.random);
  u.step=1;
  if(!u.narrow){ finishThing(null); return; }
  render(); top0(); focusFwd();
}
/** From the check of step 1 on to picking the most specific category. */
export function continueCategories(){
  const u=state.ui; if(!u||!u.cats||u.step!==1||u.checked) return;
  u.step=2; render(); top0();
  const first=document.querySelector(".catopt");     // the Continue button is gone: the focus goes to the first choice on a phone, and to the page on a wide screen, where Enter would pick it
  if(first&&!isWide()) /** @type {HTMLElement} */(first).focus({preventScroll:true}); else $("stage").focus({preventScroll:true});
}
/** The pick of step 2, one tap: the category the learner says is the most specific. */
export function pickCategory(cat){
  const u=state.ui; if(!u||!u.cats||u.step!==2||u.checked) return;
  const g=gradeNarrow(u.narrow,cat); if(!g) return;
  u.g2=g; finishThing(g.ok);
}

const docId=()=>"categories-"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
// The thing is done: both parts are graded (`s2` is null when step 2 was not asked), the result shows, the answer is kept, and a stage may be offered or taken off.
// `level` is a reference example's (a practice item is a plain thing, level 1, as earlier versions read it); `stage` is the thing's.
function finishThing(s2){
  const u=state.ui, q=state.cur.q, s1=u.g1.ok;
  u.grade=placeGrade(s1,s2); u.checked=true; if(u.step===2) u.step=3;
  const doc=/** @type {import("../types.ts").CategoriesDoc} */({pairId:docId(),mode:"categories",thing:q.thing.n,level:q.thing.ex?q.thing.ex.lv:1,stage:q.thing.st,
    rows:u.g1.rows.map(r=>({cat:r.cat,yes:r.answer,said:r.picked})),s1,grade:u.grade,ask:u.ask,at:new Date().toISOString()});
  if(u.narrow&&u.g2){ doc.narrow={options:u.narrow.options.map(r=>r.cat),right:u.narrow.cat,picked:u.g2.picked.cat}; doc.s2=s2===true; }
  gradeTerms(doc.rows.map(r=>({cat:r.cat,ok:r.yes===r.said})));     // each row grades its category's term (practice/stops.ts)
  stageStep("categories",q.thing.st,u.grade==="ok");     // the run towards an offer of the stages, and the offer when one is due (practice/stage-offer.ts)
  render(); top0(); focusFwd();
  if(!state.db) return;
  u.saveId=doc.pairId; u.doc=/** @type {any} */(doc);       // the stored shape of Categories is not a pair's (types.ts); persist() only reads its keys
  persist(u,"Your answer");
}

// ---- the stages: the offer on the result is the one every exercise makes (practice/stage-offer.ts); the classic page keeps its focus after the tap
/** "Add stage N" or "Switch off stage N". */
export function acceptOffer(){ acceptStageOffer(); focusFwd(); }
/** "Not now". */
export function declineOffer(){ declineStageOffer(); focusFwd(); }
