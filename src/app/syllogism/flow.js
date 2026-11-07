import { state } from "../state.js";
import { $ } from "../core/dom.js";
import { isSyllogism } from "../core/util.js";
import { persist } from "../practice/answers.js";
import { explainByItself } from "../ai/tutor.js";
import { stopTimer } from "../shell/timers.js";
import { freshUi, moveOn } from "../practice/queue.js";
import { guidance } from "../practice/guided.ts";
import { catsStageNow, shareNow, stageStep } from "../practice/stage-offer.ts";
import { askedTerm, gradeTerms, openNow, unmetNow } from "../practice/stops.ts";
import { render, top0 } from "../shell/render.js";
import { cue } from "../sound/play.ts";
import { DENIALS, REPLIES, THESIS_REPLIES, drawSyllogism, endedAtThesis, gradeSyllogism, gradeThesisWhy, gradeTimeout, gradeExample, syllogismCounts, syllogismText, thesisText } from "../../domain/syllogism.ts";
import { timeUpView } from "../../domain/sprint.ts";

/* ---------- Syllogisms: take a thing, the reason and the conclusion; accept it, deny the reason or deny the pervasion ---------- */
// The rules (what is drawn, what is right, what the learner mixed up) are in src/domain/syllogism.ts; this is the page around them: the steps, the screen
// state and the saved answer. An answer is kept in the collection "answers" with `mode: "syllogism"`, so it is stored and synced like the others, and the lists that
// mean the Relations exercise leave it out (practice/universe.js, answerList). The state of the screen is the usual one with `step` 0 while the reply is
// to be given, 1 while a counter-example is asked for (after a right "there is no pervasion"), and `checked` once the result is shown. With Blitz on the reply has one
// countdown (the time of a syllogism, `state.times.syl`); time up counts as wrong and shows the result, and a right "there is no pervasion" goes straight to the result, with
// no counter-example. The clock is the one of the other exercises (shell/timers.js): it stands still behind anything that covers the screen.
// Two practice options change the steps. Thesis first (`u.tf`, from state.syllogismThesis when the attempt is drawn) asks the thesis alone at step 0, I accept or Why? (`u.th`
// once given): I accept, and Why? to a true thesis, end the attempt there; after a right Why? the reason comes, still at step 0, answered with one of the two denials, and the
// attempt goes on as without the option. With Ask for a counter-example off (state.syllogismCounter), "there is no pervasion" goes straight to the result, and a right one
// offers the counter-example there (`u.late`): its field opens under the pervasion (`u.exOpen`), and what is written is checked as at step 1 and kept with the answer.
const KEYS=["1","2","3"];
/** The answers to syllogisms, oldest first. They sit in the collection of the Relations answers, in a shape of their own (types.ts, SyllogismDoc). */
export const syllogismList=()=>/** @type {import("../types.ts").SyllogismDoc[]} */(/** @type {unknown} */(Object.values(state.answers).filter(isSyllogism))).sort((x,y)=>(x.at||"").localeCompare(y.at||""));
export function freshSyllogismUi(){
  return Object.assign(freshUi(),{syllogism:true, open:false, step:0, tf:state.syllogismThesis, th:undefined, said:null, grade:null, ex:null, exText:"", exNote:"", late:false, exOpen:false, timeout:false, ms:null});
}
/** The replies the step on screen offers, in the order of the keys: the thesis replies, the two denials after Why?, or the three replies. */
export const choicesNow=(u=state.ui)=>u&&u.tf?(u.th===undefined?THESIS_REPLIES:DENIALS):REPLIES;
/** The syllogism on screen. */
export const shownSyllogism=()=>/** @type {import("../../domain/syllogism.ts").Syllogism} */(state.cur.c);
/** The attempt's sentence as the learner read it: the thesis alone when the attempt ended at the thesis (thesis first), else the whole syllogism. */
export const attemptText=(u=state.ui)=>u&&u.grade&&endedAtThesis(u.grade)?thesisText(shownSyllogism(),state.syllogismWording):syllogismText(shownSyllogism(),state.syllogismWording);
export const keyOfReply=reply=>KEYS[choicesNow().indexOf(reply)];
/** The reply a key stands for (1, 2, 3) on the step on screen, or undefined. */
export const replyOfKey=k=>choicesNow()[KEYS.indexOf(k)];

/** Whether the reply to a syllogism is being asked for: the one screen of Syllogisms that has a clock. */
export const syllogismAsking=()=>state.tab==="syllogism"&&!!state.ui&&!!state.ui.syllogism&&!state.ui.checked&&state.ui.step===0&&state.mode==="quiz";
// Time up: no reply, so wrong; the result shows the right one, with as much of the checks as the guidance gives (path/syllogism.tsx), and at None there is no result: the
// answer is kept as wrong and the next syllogism comes (domain/sprint.ts, timeUpView). The clock of the reply is Sprint's (shell/timers.js).
export function expireSyllogism(u){
  if(u!==state.ui||!syllogismAsking()) return;
  cue("timeup");
  if(u.tf&&u.th===undefined) u.th=null;      // thesis first: the time ran out on the thesis, which ends the attempt there
  u.tid=null; u.timeout=true; u.ms=u.tq?(u.ms||0)+u.tq.limit:u.ms; u.tq=null; u.grade=gradeTimeout(shownSyllogism(),u.tf?u.th:undefined);
  if(document.activeElement&&/** @type {HTMLElement} */(document.activeElement).blur) /** @type {HTMLElement} */(document.activeElement).blur();
  const skip=timeUpView(guidance("syllogism"))==="skip";
  if(skip) u.passOn=true;
  finishSyllogism();
  if(skip) moveOn();
}

/** Draws the next syllogism, from what the learner has answered so far and the stages that are on (everyday ones up to stage 4, except for the terms of the stage that are not right yet). */
export function advanceSyllogism(){
  const c=drawSyllogism(state,{hist:syllogismList().slice(-40),recent:state.syllogismRecent,stages:state.stages,unmet:unmetNow(),open:openNow(),newShare:shareNow(),thesisFirst:state.syllogismThesis,...(state.syllogismEveryday?{level:1}:{})});
  state.cur=/** @type {any} */({p:null,syllogism:true,c}); state.ui=freshSyllogismUi(); state.mode="quiz";
}
/** Skip: another syllogism, with nothing kept (there is no pair to set aside and bring back). */
export function skipSyllogism(){ advanceSyllogism(); render(); top0(); }

const focusEx=()=>{ const i=$("sylex"); if(i&&!("ontouchstart" in window)) i.focus({preventScroll:true}); };
/** The time the reply took is added to what the attempt already took (the thesis, with thesis first); none without a clock. */
const tookTime=u=>{ if(u.tq) u.ms=(u.ms||0)+Math.round(performance.now()-u.tq.t0); stopTimer(); };
/**
 * The learner's reply. Every "there is no pervasion", right or wrong, goes on to the counter-example, unless Blitz is on or the counter-example is not asked; the verdict
 * waits until the counter-example is given or left out. Every other reply shows the result at once. With thesis first the reply to the thesis comes here as well (sayThesis).
 */
export function saySyllogism(reply){
  const u=state.ui; if(!u||!u.syllogism||u.checked||u.step!==0||state.mode!=="quiz") return;
  if(u.tf&&u.th===undefined){ sayThesis(reply); return; }
  if(u.tf&&!DENIALS.includes(reply)) return;                  // after Why? only the two denials are offered
  const c=shownSyllogism(), g=gradeSyllogism(c,reply,u.tf?u.th:undefined);
  tookTime(u);
  u.said=reply; u.grade=g;
  if(reply==="pervasion"&&!state.blitz){
    if(state.syllogismCounter){ u.step=1; render(); top0(); focusEx(); return; }
    u.late=g.correct;                                         // not asked: a right one is offered on the result
  }
  finishSyllogism();
}
/** Thesis first: the reply to the thesis alone. I accept ends the attempt, right when the thesis is true; Why? to a true thesis ends it too, wrong; after a right Why? the reason comes. */
export function sayThesis(reply){
  const u=state.ui; if(!u||!u.syllogism||u.checked||u.step!==0||state.mode!=="quiz"||!u.tf||u.th!==undefined||!THESIS_REPLIES.includes(reply)) return;
  const c=shownSyllogism();
  tookTime(u);
  u.th=reply;
  if(reply==="accept"){ u.said="accept"; u.grade=gradeSyllogism(c,"accept","accept"); finishSyllogism(); return; }
  if(c.checks.t.ok){ u.grade=gradeThesisWhy(c); finishSyllogism(); return; }
  render(); top0();                                           // the reason comes, with its own clock in Sprint (shell/timers.js)
}
/** The counter-example field on the result, where the counter-example was not asked (`u.late`): open, or closed with nothing written. */
export function openLateExample(on=true){
  const u=state.ui; if(!u||!u.syllogism||!u.checked||!u.late||u.ex) return;
  u.exOpen=on; u.exNote=""; if(!on) u.exText="";
  render(); if(on) focusEx();
}
/** The counter-example written on the result: checked as the step would check it, kept with the answer, and a right reply with one that is not one is partly right. */
export function lateExample(){
  const u=state.ui; if(!u||!u.syllogism||!u.checked||!u.late||!u.exOpen||u.ex) return;
  const t=counterText(u);
  if(!t){ openLateExample(false); return; }
  const g=gradeExample(state,shownSyllogism(),t);
  if(g.v==="self"){ u.exNote=g.line; render(); focusEx(); return; }
  u.ex=Object.assign({text:t},g); u.exOpen=false; u.exNote="";
  u.overall=u.grade.correct&&g.v==="bad"?"part":u.grade.grade;
  const doc=/** @type {import("../types.ts").SyllogismDoc|undefined} */(/** @type {unknown} */(u.doc));
  if(doc){ doc.example={text:t,verdict:/** @type {"ok"|"bad"|"cmp"} */(g.v)}; doc.grade=u.overall; persist(u,"Your answer"); }
  render();
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
  render();
}
const docId=()=>"syllogism-"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
function finishSyllogism(){
  const u=state.ui, c=shownSyllogism(), g=u.grade;
  // a right reply with a counter-example that is not one is partly right; a reply with no example, or one the page could not place, stands
  u.overall=g.correct&&u.ex&&u.ex.v==="bad"?"part":g.grade;
  u.checked=true; u.step=2;
  // what the attempt counts for (src/domain/syllogism.ts, syllogismCounts): a whole syllogism grades both terms, and a wrong reply, often about the form, marks neither red;
  // a right I accept (thesis first) counts for nothing, and a wrong thesis reply is a miss on the predicate's term. "matter" grades matter (practice/stops.ts).
  const k=syllogismCounts(g);
  gradeTerms(k.parts.map((p)=>({cat:p==="reason"?askedTerm(c.catR,c.reason):askedTerm(c.catP,c.predicate),ok:k.ok})),k.misses);
  if(k.run) stageStep("syllogism",catsStageNow(endedAtThesis(g)?[c.catP]:[c.catR,c.catP]),g.correct);     // the run towards the next stage; a miss here is about the form, it changes nothing (practice/stage-offer.ts)
  render();
  top0();
  explainByItself(u);                             // with Explanations by Claude on Every answer, the explanation comes by itself
  if(!state.db) return;
  u.saveId=docId();
  /** @type {import("../types.ts").SyllogismDoc} */
  const doc={pairId:u.saveId,mode:"syllogism",id:c.id,subject:c.subject,reason:c.reason,predicate:c.predicate,catA:c.catR,catB:c.catP,situation:c.situation,answer:g.expected,said:g.said,
    correct:g.correct,grade:u.overall,pervasion:c.pervasion,level:c.level,links:c.links,wording:state.syllogismWording,at:new Date().toISOString()};
  if(g.missedPoint) doc.missedPoint=true;
  if(u.timeout) doc.timeout=true;
  if(u.ms!=null) doc.ms=u.ms;
  if(u.ex) doc.example={text:u.ex.text,verdict:u.ex.v};
  if(u.tf) doc.thesis=u.th===undefined?null:u.th;
  u.doc=/** @type {any} */(doc);       // the stored shape of Syllogisms is not a pair's (types.ts); persist() only reads its keys
  persist(u,"Your answer");
}
