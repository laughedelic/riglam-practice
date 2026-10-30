import { state } from "../state.js";
import { $ } from "../core/dom.js";
import { isSyllogism } from "../core/util.js";
import { persist } from "../practice/answers.js";
import { explainByItself } from "../ai/tutor.js";
import { startQ, stopTimer } from "../debate/flow.js";
import { freshUi } from "../practice/queue.js";
import { catsStageNow, shareNow, stageStep } from "../practice/stage-offer.ts";
import { askedTerm, gradeTerms, openNow, unmetNow } from "../practice/stops.ts";
import { render, top0 } from "../shell/render.js";
import { REPLIES, drawSyllogism, gradeSyllogism, gradeTimeout, gradeExample } from "../../domain/syllogism.ts";

/* ---------- Syllogisms: take a thing, the reason and the conclusion; accept it, deny the reason or deny the pervasion ---------- */
// The rules (what is drawn, what is right, what the learner mixed up) are in src/domain/syllogism.ts; this is the page around them: the steps, the screen
// state and the saved answer. An answer is kept in the collection "answers" with `mode: "syllogism"`, so it is stored and synced like the others, and the lists that
// mean the Relations exercise leave it out (practice/universe.js, answerList). The state of the screen is the usual one with `step` 0 while the reply is
// to be given, 1 while a counter-example is asked for (after a right "there is no pervasion"), and `checked` once the result is shown. With Blitz on the reply has one
// countdown (the time of a syllogism, `state.sylMs`); time up counts as wrong and shows the result, and a right "there is no pervasion" goes straight to the result, with
// no counter-example. The clock is the one of the other exercises (debate/flow.js `startQ`, `stopTimer`): it stands still behind anything that covers the screen.
const KEYS=["1","2","3"];
/** The answers to syllogisms, oldest first. They sit in the collection of the Relations answers, in a shape of their own (types.ts, SyllogismDoc). */
export const syllogismList=()=>/** @type {import("../types.ts").SyllogismDoc[]} */(/** @type {unknown} */(Object.values(state.answers).filter(isSyllogism))).sort((x,y)=>(x.at||"").localeCompare(y.at||""));
export function freshSyllogismUi(){
  return Object.assign(freshUi(),{syllogism:true, open:false, step:0, said:null, grade:null, ex:null, exText:"", exNote:"", timeout:false, ms:null});
}
/** The syllogism on screen. */
export const shownSyllogism=()=>/** @type {import("../../domain/syllogism.ts").Syllogism} */(state.cur.c);
export const keyOfReply=reply=>KEYS[REPLIES.indexOf(reply)];
/** The reply a key stands for (1, 2, 3), or undefined. */
export const replyOfKey=k=>REPLIES[KEYS.indexOf(k)];

/** Whether the reply to a syllogism is being asked for: the one screen of Syllogisms that has a clock. */
export const syllogismAsking=()=>state.tab==="syllogism"&&!!state.ui&&!!state.ui.syllogism&&!state.ui.checked&&state.ui.step===0&&state.mode==="quiz";
/** Starts the countdown of the reply, with its full time; with Blitz off there is none. */
export function startSyllogismClock(){
  const u=state.ui, lim=state.blitz?state.sylMs:0;
  if(!lim) return;
  u.tq={t0:performance.now(),limit:lim}; u.tid=setTimeout(()=>expireSyllogism(u),lim);
}
// Time up: no reply, so wrong; the result shows the right one
function expireSyllogism(u){
  if(u!==state.ui||!syllogismAsking()) return;
  u.tid=null; u.timeout=true; u.ms=u.tq?u.tq.limit:null; u.tq=null; u.grade=gradeTimeout(shownSyllogism());
  if(document.activeElement&&/** @type {HTMLElement} */(document.activeElement).blur) /** @type {HTMLElement} */(document.activeElement).blur();
  finishSyllogism();
}

/** Draws the next syllogism, from what the learner has answered so far and the stages that are on (everyday ones up to stage 4, except for the terms of the stage that are not right yet). */
export function advanceSyllogism(){
  const c=drawSyllogism(state,{hist:syllogismList().slice(-40),recent:state.syllogismRecent,stages:state.stages,unmet:unmetNow(),open:openNow(),newShare:shareNow(),...(state.syllogismEveryday?{level:1}:{})});
  state.cur=/** @type {any} */({p:null,syllogism:true,c}); state.ui=freshSyllogismUi(); state.mode="quiz";
  if(state.blitz&&syllogismAsking()) startQ();         // not yet on this screen when the exercise is opened from another: setTab starts it then
}
/** Skip: another syllogism, with nothing kept (there is no pair to set aside and bring back). */
export function skipSyllogism(){ advanceSyllogism(); render(); top0(); }

const focusEx=()=>{ const i=$("sylex"); if(i&&!("ontouchstart" in window)) i.focus({preventScroll:true}); };
/** The learner's reply. Every "there is no pervasion", right or wrong, goes on to the counter-example, unless Blitz is on; the verdict waits until the counter-example is given or left out. Every other reply shows the result at once. */
export function saySyllogism(reply){
  const u=state.ui; if(!u||!u.syllogism||u.checked||u.step!==0||state.mode!=="quiz") return;
  const c=shownSyllogism(), g=gradeSyllogism(c,reply);
  u.ms=u.tq?Math.round(performance.now()-u.tq.t0):null; stopTimer();
  u.said=reply; u.grade=g;
  if(reply==="pervasion"&&!state.blitz){ u.step=1; render(); top0(); focusEx(); return; }
  finishSyllogism();
}
/** The counter-example step is done: with what was typed, or with nothing. */
/** The counter-example as the check reads it: what is written, without the closing stops ("" when there is none). */
export const counterText=u=>(u.exText||"").trim().replace(/[\s.!?,;:]+$/,"");
export function exampleSyllogism(){
  const u=state.ui; if(!u||!u.syllogism||u.checked||u.step!==1) return;
  const t=counterText(u), g=t?gradeExample(state,shownSyllogism(),t):null;
  if(g&&g.v==="self"){ u.exNote=g.line; render(); focusEx(); return; }      // the subject itself is no answer: ask again, nothing is graded
  u.ex=g?Object.assign({text:t},g):null;
  finishSyllogism();
}
/** Back from the counter-example to the reply. */
export function backSyllogism(){
  const u=state.ui; if(!u||!u.syllogism||u.checked||u.step!==1) return;
  u.step=0; u.said=null; u.grade=null; u.exText=""; u.exNote="";
  if(state.blitz) startQ();                       // Blitz was switched on at the counter-example: the reply has its clock again
  render();
}
const docId=()=>"syllogism-"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
function finishSyllogism(){
  const u=state.ui, c=shownSyllogism(), g=u.grade;
  // a right reply with a counter-example that is not one is partly right; a reply with no example, or one the page could not place, stands
  u.overall=g.correct&&u.ex&&u.ex.v==="bad"?"part":g.grade;
  u.checked=true; u.step=2;
  gradeTerms([{cat:askedTerm(c.catR,c.reason),ok:g.correct},{cat:askedTerm(c.catP,c.predicate),ok:g.correct}],false);     // a wrong reply is often about the form: only a right one counts; "matter" grades matter (practice/stops.ts)
  stageStep("syllogism",catsStageNow([c.catR,c.catP]),g.correct);     // the run towards the next stage; a miss here is about the form, it changes nothing (practice/stage-offer.ts)
  render();
  top0();
  explainByItself(u);                             // with "Check every answer with Claude" on, the explanation comes by itself
  if(!state.db) return;
  u.saveId=docId();
  /** @type {import("../types.ts").SyllogismDoc} */
  const doc={pairId:u.saveId,mode:"syllogism",id:c.id,subject:c.subject,reason:c.reason,predicate:c.predicate,catA:c.catR,catB:c.catP,situation:c.situation,answer:c.answer,said:g.said,
    correct:g.correct,grade:u.overall,pervasion:c.pervasion,level:c.level,links:c.links,wording:state.syllogismWording,at:new Date().toISOString()};
  if(g.missedPoint) doc.missedPoint=true;
  if(u.timeout) doc.timeout=true;
  if(u.ms!=null) doc.ms=u.ms;
  if(u.ex) doc.example={text:u.ex.text,verdict:u.ex.v};
  u.doc=/** @type {any} */(doc);       // the stored shape of Syllogisms is not a pair's (types.ts); persist() only reads its keys
  persist(u,"Your answer");
}
