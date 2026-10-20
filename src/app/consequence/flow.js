import { state } from "../state.js";
import { $ } from "../core/dom.js";
import { isCq } from "../core/util.js";
import { isWide } from "../core/viewport.js";
import { persist } from "../practice/answers.js";
import { freshUi } from "../practice/queue.js";
import { render, top0 } from "../shell/render.js";
import { REPLIES, drawConsequence, gradeConsequence, gradeExample } from "../../domain/consequence.ts";

/* ---------- Syllogisms: take a thing, the reason and the conclusion; accept it, deny the reason or deny the pervasion ---------- */
// The rules (what is drawn, what is right, what the learner mixed up) are in src/domain/consequence.ts; this is the page around them: the steps, the screen
// state and the saved answer. An answer is kept in the collection "answers" with `mode: "cq"`, so it is stored and synced like the others, and the lists that
// mean the Relations exercise leave it out (practice/universe.js, answerList). The state of the screen is the usual one with `step` 0 while the reply is
// to be given, 1 while a counter-example is asked for (after a right "there is no pervasion"), and `checked` once the result is shown.
const KEYS=["1","2","3"];
/** The answers to consequences, oldest first. They sit in the collection of the Relations answers, in a shape of their own (types.ts, ConsequenceDoc). */
export const cqList=()=>/** @type {import("../types.ts").ConsequenceDoc[]} */(/** @type {unknown} */(Object.values(state.answers).filter(isCq))).sort((x,y)=>(x.at||"").localeCompare(y.at||""));
export function freshCqUi(){
  return Object.assign(freshUi(),{cq:true, open:false, step:0, said:null, grade:null, ex:null, exText:"", exNote:""});
}
/** The consequence on screen. */
export const cqOf=()=>/** @type {import("../../domain/consequence.ts").Consequence} */(state.cur.c);
export const cqKey=reply=>KEYS[REPLIES.indexOf(reply)];
/** The reply a key stands for (1, 2, 3), or undefined. */
export const replyOfKey=k=>REPLIES[KEYS.indexOf(k)];

/** Draws the next consequence, from what the learner has answered so far. */
export function advanceCq(){
  const c=drawConsequence(state,{hist:cqList().slice(-40),recent:state.cqRecent,level:state.cqLevel});
  state.cur=/** @type {any} */({p:null,cq:true,c}); state.ui=freshCqUi(); state.mode="quiz";
}
/** Skip: another consequence, with nothing kept (there is no pair to set aside and bring back). */
export function skipCq(){ advanceCq(); render(); top0(); }

const focusEx=()=>{ const i=$("cqex"); if(i&&!("ontouchstart" in window)) i.focus({preventScroll:true}); };
/** The learner's reply. A right "there is no pervasion" goes on to the counter-example; every other reply shows the result at once. */
export function sayCq(reply){
  const u=state.ui; if(!u||!u.cq||u.checked||u.step!==0||state.mode!=="quiz") return;
  const c=cqOf(), g=gradeConsequence(c,reply);
  u.said=reply; u.grade=g;
  if(g.correct&&c.answer==="pervasion"){ u.step=1; render(); top0(); focusEx(); return; }
  finishCq();
}
/** The counter-example step is done: with what was typed, or with nothing. */
export function exampleCq(){
  const u=state.ui; if(!u||!u.cq||u.checked||u.step!==1) return;
  const t=(u.exText||"").trim(), g=t?gradeExample(state,cqOf(),t):null;
  if(g&&g.v==="self"){ u.exNote=g.line; render(); focusEx(); return; }      // the subject itself is no answer: ask again, nothing is graded
  u.ex=g?Object.assign({text:t},g):null;
  finishCq();
}
/** Back from the counter-example to the reply. */
export function backCq(){
  const u=state.ui; if(!u||!u.cq||u.checked||u.step!==1) return;
  u.step=0; u.said=null; u.grade=null; u.exText=""; u.exNote=""; render();
}
const docId=()=>"cq-"+Date.now().toString(36)+Math.random().toString(36).slice(2,6);
function finishCq(){
  const u=state.ui, c=cqOf(), g=u.grade;
  // a right reply with a counter-example that is not one is partly right; a reply with no example, or one the page could not place, stands
  u.overall=g.correct&&u.ex&&u.ex.v==="bad"?"part":g.grade;
  u.checked=true; u.step=2; render();
  top0();
  if(!isWide()){ const bs=document.querySelectorAll("#stage .actions .btn"); if(bs.length) /** @type {HTMLElement} */(bs[bs.length-1]).focus({preventScroll:true}); }
  else $("stage").focus({preventScroll:true});
  if(!state.db) return;
  u.saveId=docId();
  /** @type {import("../types.ts").ConsequenceDoc} */
  const doc={pairId:u.saveId,mode:"cq",id:c.id,subject:c.subject,reason:c.reason,predicate:c.predicate,catA:c.catR,catB:c.catP,situation:c.situation,answer:c.answer,said:g.said,
    correct:g.correct,grade:u.overall,pervasion:c.pervasion,level:c.level,links:c.links,wording:state.cqWording,at:new Date().toISOString()};
  if(g.missedPoint) doc.missedPoint=true;
  if(u.ex) doc.example={text:u.ex.text,verdict:u.ex.v};
  u.doc=/** @type {any} */(doc);       // the stored shape of Syllogisms is not a pair's (types.ts); persist() only reads its keys
  persist(u,"Your answer");
}
