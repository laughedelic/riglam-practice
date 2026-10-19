import { state } from "../state.js";
import { explainByItself } from "../ai/tutor.js";
import { $ } from "../core/dom.js";
import { CELLS, REL } from "../core/rel.js";
import { isFind } from "../core/util.js";
import { isWide } from "../core/viewport.js";
import { persist } from "../practice/answers.js";
import { freshUi } from "../practice/queue.js";
import { focusCin, render, top0 } from "../shell/render.js";
import { drawRelation, findPair, gradeFind, nameThing, sameThing } from "../../domain/find.ts";

/* ---------- Find a pair: the usual exercise the other way round ---------- */
// The learner is given a relation and names two phenomena that stand in it, then writes an example for each cell the relation leaves possible, as in Relations.
// The rules (which relations are asked, how a named pair is made and graded, how the tutor's verdict on the relation is read) are in src/domain/find.ts and
// verdict.ts; this is the page around them: the steps, the screen state and the saved answer. An answer is kept in the collection "answers" with `mode: "find"`,
// so it is stored and synced like the others, and the lists that mean the Relations exercise leave it out (practice/universe.js, answerList).
// The state of the screen is the usual one (`rel` is the relation asked for, `cells` the examples) with `step` 0 while the pair is named, 1 for the examples, and the words typed.
const SIX=6;
export const findList=()=>Object.values(state.answers).filter(isFind).sort((x,y)=>(x.at||"").localeCompare(y.at||""));
export function freshFindUi(rel){
  return Object.assign(freshUi(),{find:true, rel, open:false, step:0, wordA:"", wordB:"", pairErr:"", own:false, focusA:true});
}
const asked=rel=>{ state.findAsked=[...state.findAsked,rel].slice(-SIX); return rel; };
/** The next relation to ask for, with no pair named yet. */
export function advanceFind(){
  state.cur=/** @type {any} */({p:null,find:true}); state.ui=freshFindUi(asked(drawRelation(state.findAsked))); state.mode="quiz";
}
/** Asks for another relation instead, while no examples are written; the words typed stay. */
export function anotherRelation(){
  const u=state.ui; if(!u||!u.find||u.checked||u.step!==0) return;
  u.rel=asked(drawRelation(state.findAsked,Math.random,u.rel)); u.pairErr="";
  Object.assign(u,{cells:freshUi().cells, ci:0, seen:0, pop:null});
  render();
}
const focusWord=k=>{ const i=$("fw-"+k); if(i) i.focus({preventScroll:true}); };
/** The pair is named: on to the examples. The same words as before keep the examples written; other words start a new pair. */
export function usePair(){
  const u=state.ui; if(!u||!u.find||u.checked||u.step!==0) return;
  const a=nameThing(state,u.wordA), b=nameThing(state,u.wordB);
  if(!a.label||!b.label){ u.pairErr="Name both phenomena."; render(); focusWord(a.label?"b":"a"); return; }
  if(sameThing(a,b)){ u.pairErr="Name two different phenomena."; render(); focusWord("b"); return; }
  const had=state.cur.p;
  if(had&&had.a===a.label&&had.b===b.label){ if(had.own) had.relation=u.rel; }
  else {
    state.cur=/** @type {any} */({p:findPair(state,u.rel,a,b),find:true});
    Object.assign(u,{cells:freshUi().cells, ci:0, seen:0, pop:null});
  }
  u.own=!!state.cur.p.own; u.pairErr=""; u.step=1;
  render(); top0();
  if(!isWide()){ focusCin(); return; }
  const first=CELLS.find(c=>!REL[u.rel].empty.includes(c)), i=first&&$("in-"+first);
  if(i&&!("ontouchstart" in window)) i.focus();
}
/** Back to the words of the pair, to change them. */
export function editPair(){
  const u=state.ui; if(!u||!u.find||u.checked||u.step!==1) return;
  u.step=0; u.pop=null; render(); top0();
  if(!("ontouchstart" in window)) focusWord("a");
}
/** Checks the examples. A pair the data knows is graded here; one of the learner's own waits for the tutor (domain/find.ts, gradeFind). */
export function checkFind(){
  const u=state.ui; if(!u||!u.find||u.checked||u.step!==1||!state.cur.p) return;
  const p=state.cur.p;
  u.res=gradeFind(state,p,u); u.checked=true; u.open=false; render();
  top0(); const bs=document.querySelectorAll("#stage .actions .btn"); if(bs.length) bs[bs.length-1].focus({preventScroll:true});
  explainByItself(u);
  if(!state.db) return;
  const cells=/** @type {import("../types.ts").AnswerDoc["cells"]} */({});
  for(const c of CELLS) cells[c]={text:(u.cells[c].t||"").trim(), none:REL[u.rel].empty.includes(c)||u.cells[c].none, verdict:u.res.cells[c].v};
  u.saveId=p.id;
  u.doc={pairId:p.id,mode:"find",a:p.a,b:p.b,catA:p.catA||null,catB:p.catB||null,chosen:u.rel,key:p.relation,correct:u.res.relOk,grade:u.res.overall,cells,at:new Date().toISOString(),pair:p};
  if(u.res.relOpen) u.doc.relOpen=true;
  persist(u,"Your answer");
}
