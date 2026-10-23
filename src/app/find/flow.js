import { state } from "../state.js";
import { afterCheck } from "../ai/known.js";
import { $ } from "../core/dom.js";
import { moreRefs } from "../core/examples.js";
import { CELLS, REL } from "../core/rel.js";
import { isFind } from "../core/util.js";
import { isWide } from "../core/viewport.js";
import { persist } from "../practice/answers.js";
import { freshUi } from "../practice/queue.js";
import { clearSkip } from "../practice/skips.js";
import { focusAfterCheck, focusCin, render, top0 } from "../shell/render.js";
import { switchTo } from "../shell/tabs.js";
import { drawRelation, findId, findPair, gradeFind, nameThing, sameThing } from "../../domain/find.ts";

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
// the relation is now `k`: the examples written stay, except those in a cell it leaves empty (as in Relations)
function useRel(u,k){
  u.rel=k; u.ci=0; u.seen=0; u.pop=null;
  for(const c of REL[k].empty){ u.cells[c].t=""; u.cells[c].none=false; }
}
/** The next relation to ask for, with no pair named yet: the one the learner picked, else a draw that leaves out `not` (by default the one asked last, so a draw is never the same twice running). */
export function advanceFind(not=state.findAsked[state.findAsked.length-1]){
  state.cur=/** @type {any} */({p:null,find:true}); state.ui=freshFindUi(asked(state.findRel||drawRelation(state.findAsked,Math.random,not))); state.mode="quiz";
}
/** Asks for another, drawn relation instead, while no examples are being written; the words and the examples already written stay (those in a cell the new relation leaves empty go). */
export function anotherRelation(){
  const u=state.ui; if(!u||!u.find||u.checked||u.step!==0) return;
  u.pairErr="";
  useRel(u,asked(drawRelation(state.findAsked,Math.random,u.rel)));
  if(state.cur.p&&state.cur.p.own) state.cur.p.relation=u.rel;
  render();
}
/**
 * The learner picks the relation to practice, or null for a different one each time. A pick stays for the next pairs until Random is picked, and also
 * applies to the pair on screen: the words stay, and so do the examples written, except those in a cell the new relation leaves empty (as in Relations).
 * Random on a screen with no pair named yet asks for another relation at once; with a pair named the pair keeps the relation it has.
 */
export function chooseRel(k){
  const u=state.ui; if(!u||!u.find||u.checked) return;
  state.findRel=k; try{ if(k) localStorage.setItem("rd-findrel",k); else localStorage.removeItem("rd-findrel"); }catch(e){}
  u.open=false; u.pairErr="";
  if(!k){ if(u.step===0) anotherRelation(); else render(); return; }
  if(k!==u.rel){
    useRel(u,asked(k));
    if(state.cur.p&&state.cur.p.own) state.cur.p.relation=k;
  }
  render();
  if(u.step===1) focusFirstCell();
}
const focusWord=k=>{ const i=$("fw-"+k); if(i) i.focus({preventScroll:true}); };
// the first example field, where there is a keyboard to type with
function focusFirstCell(){
  if(!isWide()){ focusCin(); return; }
  const first=CELLS.find(c=>!REL[state.ui.rel].empty.includes(c)), i=first&&$("in-"+first);
  if(i&&!("ontouchstart" in window)) i.focus();
}
/** The pair is named: on to the examples. The same words as before keep the examples written; other words start a new pair. */
export function usePair(){
  const u=state.ui; if(!u||!u.find||u.checked||u.step!==0) return;
  const a=nameThing(state,u.wordA,state.negBrackets), b=nameThing(state,u.wordB,state.negBrackets);
  if(!a.label||!b.label){ u.pairErr="Name both phenomena."; render(); focusWord(a.label?"b":"a"); return; }
  if(sameThing(a,b)){ u.pairErr="Name two different phenomena."; render(); focusWord("b"); return; }
  const had=state.cur.p;
  if(had&&had.a===a.label&&had.b===b.label){ if(had.own) had.relation=u.rel; }
  else {
    state.cur=/** @type {any} */({p:findPair(state,u.rel,a,b,undefined,undefined,moreRefs(),state.stages,state.negBrackets),find:true});
    Object.assign(u,{cells:freshUi().cells, ci:0, seen:0, pop:null});
  }
  u.own=!!state.cur.p.own; u.pairErr=""; u.step=1;
  render(); top0();
  focusFirstCell();
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
  clearSkip(p,u.rel);
  u.res=gradeFind(state,p,u); u.checked=true; u.open=false; render();
  focusAfterCheck();
  afterCheck(u);
  if(!state.db) return;
  const cells=/** @type {import("../types.ts").AnswerDoc["cells"]} */({});
  for(const c of CELLS) cells[c]={text:(u.cells[c].t||"").trim(), none:REL[u.rel].empty.includes(c)||u.cells[c].none, verdict:u.res.cells[c].v};
  u.saveId=p.id;
  u.doc={pairId:p.id,mode:"find",a:p.a,b:p.b,catA:p.catA||null,catB:p.catB||null,chosen:u.rel,key:p.relation,correct:u.res.relOk,grade:u.res.overall,cells,at:new Date().toISOString(),pair:p};
  if(u.res.relOpen) u.doc.relOpen=true;
  persist(u,"Your answer");
}
/** Opens a pair that was skipped (Review, Skipped) at its examples, for the relation that was asked for then (it counts as asked, so the draw after it leaves it out). The relation the learner has picked is not changed. The attempt has an id of its own, as it is the id of the answer: another relation chosen here leaves the skip on the list, and answering that later must not replace this answer. */
export function resumeFind(pair,rel){
  switchTo("find");
  const p=JSON.parse(JSON.stringify(pair));       // a copy: the skipped pair stays as it was kept
  p.id=findId();
  state.cur=/** @type {any} */({p,find:true});
  state.ui=Object.assign(freshFindUi(asked(rel||p.relation)),{step:1, wordA:p.a, wordB:p.b, own:!!p.own, focusA:false});
  state.mode="quiz"; render(); top0();
}
