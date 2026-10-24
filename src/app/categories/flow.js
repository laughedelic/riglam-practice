import { state } from "../state.js";
import { $ } from "../core/dom.js";
import { isCategories } from "../core/util.js";
import { isWide } from "../core/viewport.js";
import { persist } from "../practice/answers.js";
import { freshUi } from "../practice/queue.js";
import { render, renderKeepFocus, top0 } from "../shell/render.js";
import { setStages, stageName } from "../shell/stages.js";
import { drawPlace, gradeNarrow, gradePlace, placeGrade, placeNarrow, placeStageDown, placeStageUp } from "../../domain/place.ts";
import { exampleStage } from "../../domain/reference.ts";

/* ---------- Categories: a thing is shown; tick the categories it is in, then pick the most specific ---------- */
// The rules (which things and categories are asked, what is right and why, when another stage is offered) are in src/domain/place.ts; this is the page around them: the
// steps, the screen state and the saved answer. An answer is kept in the collection "answers" with `mode: "categories"`, so it is stored and synced like the others, and the lists
// that mean the Relations exercise leave it out (practice/universe.js, answerList). The state of the screen is the usual one with `step` 0 while step 1 is asked (all at once,
// or one category at a time: `i` is the one asked), 1 once step 1 is checked, 2 while the most specific category is picked, and `checked` once the thing is done and its result is shown.
const RECENT=12;
const RECENT_RUN=20;     // the things finished on this page that the run towards a stage offer looks back over (more than the streak and the stumble need)
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
  const o=state.ui&&state.ui.offer; if(o&&o.kind&&o.kind!=="done") spendRun();     // an offer passed over is Not now: it asks again after another run, not after every result
  const q=drawPlace(state,state.EX?state.EX.items:null,{stages:state.stages,rng:Math.random,avoid:new Set(state.catsRecent)});
  if(q) state.catsRecent=[...state.catsRecent,q.thing.n].slice(-RECENT);
  state.cur=/** @type {any} */({p:null,cats:true,q:q||undefined,tried:drawKey()}); state.ui=freshCategoriesUi(); state.mode="quiz";
}
/** What the last draw drew from: the stages, and whether the device held the reference examples. A draw that found nothing is tried again once this changes. */
export const drawKey=()=>state.stages.join(",")+(state.EX?"+ex":"");
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
/** Check: grades what was ticked. Needs a tick or "None of these". */
export function checkCategories(){
  const u=state.ui; if(!u||!u.cats||u.step!==0||u.checked||u.ask!=="all"||(!u.ticked.length&&!u.none)||!state.cur.q) return;
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
  state.catsSession=[...state.catsSession,doc].slice(-RECENT_RUN);
  u.offer=stageOffer();
  render(); top0(); focusFwd();
  if(!state.db) return;
  u.saveId=doc.pairId; u.doc=/** @type {any} */(doc);       // the stored shape of Categories is not a pair's (types.ts); persist() only reads its keys
  persist(u,"Your answer");
}

// ---- the stages: after a run of right answers at the highest stage that is on, the next one is offered; after a run of wrong ones, taking it off is
/** The latest results, oldest first, from after the last time an offer was answered: the saved things, and the ones finished on this page (they may not have come back from the database yet). */
function recentResults(){
  const since=state.catsOfferAt||"", byId=new Map();
  for(const d of [...categoriesList(),...state.catsSession]) byId.set(d.pairId,d);
  return [...byId.values()].filter(d=>(d.at||"")>since).sort((x,y)=>(x.at||"").localeCompare(y.at||"")).map(d=>({st:d.stage??exampleStage({lv:d.level}),ok:d.grade==="ok"}));     // an answer from before the stages: its level's stage
}
/** What to offer after this thing: `{kind:"up",stage}` adds a stage, `{kind:"down",stage}` takes the highest off; null when neither is due. */
function stageOffer(){
  const results=recentResults();
  const up=placeStageUp(results,state.stages); if(up) return {kind:"up",stage:up};
  const down=placeStageDown(results,state.stages); if(down) return {kind:"down",stage:down};
  return null;
}
/** The run that led to an offer is spent: the next one counts from now. */
function spendRun(){ state.catsOfferAt=new Date().toISOString(); store("rd-cats-offer",state.catsOfferAt); }
function answered(offer){ spendRun(); state.ui.offer=offer; }
/** "Add stage N" or "Switch off stage N": what the offer on the result says. Nothing is done without this tap. The stage applies to every exercise. */
export function acceptOffer(){
  const u=state.ui, o=u&&u.offer; if(!o||!o.kind||o.kind==="done") return;
  if(o.kind==="up"){
    answered({kind:"done",text:"Stage "+o.stage+", "+stageName(o.stage).toLowerCase()+", is on now in every exercise, next to the stages you had. Switch any of them off in the practice options."});
    setStages([...state.stages,o.stage].sort((a,b)=>a-b)); focusFwd();
  } else {
    const rest=state.stages.filter(n=>n!==o.stage), now=rest.length?rest:[o.stage-1];     // the only stage on: the one below takes its place
    answered({kind:"done",text:"Stage "+o.stage+" is off for now"+(rest.length?"":", stage "+(o.stage-1)+" is on instead")+". Switch stages on and off in the practice options."});
    setStages(now); focusFwd();
  }
}
/** "Not now": the stages stay as they are, and the next offer needs another run. */
export function declineOffer(){
  const u=state.ui, o=u&&u.offer; if(!o||!o.kind||o.kind==="done") return;
  answered({kind:"done",text:o.kind==="up"?"Stage "+(o.stage-1)+" stays the highest. It asks again after another five right in a row."
    :"Stage "+o.stage+" stays on. It asks again after another four wrong in a row."});
  render(); focusFwd();
}
