import { state } from "../state.js";
import { el } from "../core/dom.js";
import { tbIcon } from "../core/icons.js";
import { dayOf } from "../core/util.js";
import { skipCategories } from "../categories/flow.js";
import { skipSyllogism } from "../syllogism/flow.js";
import { advanceDebate, asking, freshDebateUi, startQ, stopTimer } from "../debate/flow.js";
import { advanceFind, anotherRelation, resumeFind } from "../find/flow.js";
import { REL } from "../core/rel.js";
import { put } from "./answers.js";
import { favKey, favSafe } from "./favorites.js";
import { advance, freshUi } from "./queue.js";
import { catByLabel, norm } from "./universe.js";
import { render, top0 } from "../shell/render.js";
import { begun, switchTo } from "../shell/tabs.js";

/* ---------- skipped pairs ---------- */
// A pair that is too hard or too easy can be skipped. The skip is recorded (collection "skips", one document per pair of categories, like a favorite),
// the pair stays out of the drill for SKIP_DAYS days, Review lists it under Skipped, and answering the pair clears the record.
export const SKIP_DAYS=7;
const UNDO_MS=6000;                    // how long the note with Undo stays in the pair bar
const skipQ={};
export const skipActive=s=>!!(s&&s.at&&Date.now()-Date.parse(s.at)<SKIP_DAYS*864e5);
// the key of a pair of categories, also when both labels belong to one category (minds / consciousnesses): that pair is then one candidate of the pool
export const catKey=(a,b)=>"c_"+favSafe([a,b].sort().join("__"));
export const skipCats=p=>[p.catA||catByLabel(p.a), p.catB||catByLabel(p.b)];
// Find a pair keeps its skips in the same collection under keys of its own. The pair is the learner's words, which may name no category, and the same pair asked for
// under another relation is another exercise, so the key is the relation asked for and the pair in the order given (A first). A short hash of the words stands for
// them, because a key keeps only letters, digits and "_" and words in Russian or Tibetan would all become the same "_".
const wordHash=s=>{ let h=2166136261; for(const ch of s){ h^=ch.codePointAt(0); h=Math.imul(h,16777619)>>>0; } return h.toString(36); };
export const findSkipKey=(p,rel)=>{ const [a,b]=skipCats(p), w=a&&b?a+"|"+b:norm(p.a)+"|"+norm(p.b); return "f_"+rel+"_"+wordHash(w)+"_"+favSafe(w).slice(0,40); };
const skipKey=(p,rel)=>{ if(rel) return findSkipKey(p,rel); const [a,b]=skipCats(p); return a&&b?catKey(a,b):favKey(p); };
export const isSkipped=p=>skipActive(state.skips[skipKey(p)]);
export const hiddenKeys=()=>new Set(Object.values(state.skips).filter(skipActive).map(s=>s.key));
function skipWrite(k,fn,undo){
  state.skipErr="";
  skipQ[k]=(skipQ[k]||Promise.resolve()).catch(()=>{}).then(fn).catch(e=>{
    undo(); const c=(e&&e.code)||"error";
    state.skipErr="The skip could not be saved ("+c+"), so it was undone."; render();
  });
}
// Skip: a pair with something entered in it asks first (the question in `skipAsk`); one that was only drawn is set aside at once, with the note and its Undo in the pair bar.
export function skipPair(){
  if(!state.ui||state.mode!=="quiz"||state.ui.checked||!state.cur) return;
  if(state.ui.find?state.ui.step>0:begun(state.ui)){ stopTimer(); state.skipAsk=true; render(); return; }
  skipNow();
}
/** The answer "Keep going" to the question before a skip. */
export function closeSkipAsk(){
  state.skipAsk=false;
  if(state.blitz&&asking()) startQ();
  render(); const b=document.querySelector("#stage .skipw"); if(b) /** @type {HTMLElement} */(b).focus({preventScroll:true});
}
/** Skips the pair on screen with no question. */
export function skipNow(){
  state.skipAsk=false;
  if(!state.ui||state.mode!=="quiz"||state.ui.checked||!state.cur) return;
  if(state.ui.find) return skipFind();
  if(state.ui.cats) return skipCategories();                           // Categories: another example, nothing kept
  if(state.ui.syllogism) return skipSyllogism();                      // Syllogisms: another one, nothing kept
  if(!state.cur.p||(state.tab!=="practice"&&state.tab!=="debate")) return;
  stopTimer(); dropSkipNote();
  const p=state.cur.p, k=skipKey(p), had=state.skips[k], [ca,cb]=skipCats(p), wasDebate=!!state.ui.debate, prev={cur: state.cur,rq:state.retryQ.slice(),rt:state.retryTag};
  /** @type {import("../types.ts").SkipDoc} */
  const draft={key:k,a:p.a,b:p.b,catA:ca,catB:cb,relation:p.relation,pair:p,from:wasDebate?"debate":"practice",n:(had&&had.n||0)+1,at:new Date().toISOString()};
  const doc=JSON.parse(JSON.stringify(draft));          // without the undefined fields
  state.skips[k]=doc;
  if(state.db) skipWrite(k,()=>put("skips",k,doc),()=>{ if(had) state.skips[k]=had; else delete state.skips[k]; });
  if(wasDebate) advanceDebate(); else advance();
  const n=state.skipNote={p,key:k,had,debate:wasDebate,ui: state.ui,prev,tid:0};
  n.tid=setTimeout(()=>{ if(state.skipNote===n){ state.skipNote=null; render(); } },UNDO_MS);
  render(); top0();
}
// Find a pair. Before the pair is named there is nothing to set aside, so Skip asks for another relation (unless the learner picked one, which then stays).
// Once the pair is named, Skip sets it aside with the relation asked for, however far the examples are: it is kept in Review > Skipped, where it can be opened again
// at the examples, and Undo gives back the screen as it was.
function skipFind(){
  const u=state.ui, p=state.cur.p;
  if(u.step===0){ if(!state.findRel) anotherRelation(); return; }
  if(!p) return;
  dropSkipNote();
  const k=findSkipKey(p,u.rel), had=state.skips[k], [ca,cb]=skipCats(p), prev={cur: state.cur,rq: state.retryQ.slice(),rt: state.retryTag,ui: u,fa: state.findAsked.slice()};
  /** @type {import("../types.ts").SkipDoc} */
  const draft={key:k,a:p.a,b:p.b,catA:ca||null,catB:cb||null,relation:p.relation,pair:p,from:"find",asked:u.rel,n:(had&&had.n||0)+1,at:new Date().toISOString()};
  const doc=JSON.parse(JSON.stringify(draft));
  state.skips[k]=doc;
  if(state.db) skipWrite(k,()=>put("skips",k,doc),()=>{ if(had) state.skips[k]=had; else delete state.skips[k]; });
  advanceFind();
  const n=state.skipNote={p,key:k,had,debate:false,find:true,ui: state.ui,prev,tid:0};
  n.tid=setTimeout(()=>{ if(state.skipNote===n){ state.skipNote=null; render(); } },UNDO_MS);
  render(); top0();
}
function dropSkipNote(){ if(state.skipNote&&state.skipNote.tid) clearTimeout(state.skipNote.tid); state.skipNote=null; }
// answering a pair puts it back among the ordinary ones
export function clearSkip(p,rel){
  const k=skipKey(p,rel), had=state.skips[k]; if(!had) return;
  delete state.skips[k]; if(state.skipNote&&state.skipNote.key===k) dropSkipNote();
  if(state.db) skipWrite(k,()=>state.db.collection("skips").doc(k).delete(),()=>{ state.skips[k]=had; });
}
// the note under which a skip can be taken back, on the pair that replaced it, until something is answered there
export function undoSkip(){
  const n=state.skipNote; if(!n) return;
  dropSkipNote();
  if(n.had){ state.skips[n.key]=n.had; if(state.db) skipWrite(n.key,()=>put("skips",n.key,n.had),()=>{}); }
  else { delete state.skips[n.key]; if(state.db) skipWrite(n.key,()=>state.db.collection("skips").doc(n.key).delete(),()=>{}); }
  if(n.find){ state.cur=n.prev.cur; state.ui=n.prev.ui||null; state.findAsked=n.prev.fa||state.findAsked; state.mode="quiz"; render(); top0(); return; }
  state.retryQ=n.prev.rq; state.retryTag=n.prev.rt; state.cur=n.prev.cur; state.mode="quiz";
  if(n.debate){ state.ui=freshDebateUi(); startQ(); } else state.ui=freshUi();
  render(); top0();
}
// The note is live while the pair that replaced the skipped one is untouched (no relation picked, no question answered) and for UNDO_MS.
function skipNoteLive(){
  const n=state.skipNote; if(!n||!state.ui||n.ui!==state.ui||state.ui.checked) return null;
  const u=state.ui;
  if(u.find?(u.step>0||!!u.wordA||!!u.wordB):u.debate?u.step>0:u.rel) return null;
  return n;
}
// "Skipped a / b", cut with an ellipsis when it does not fit, so the line never grows
const skipMsg=n=>el("span",{class:"skipmsg"},"Skipped ",el("b",{text:n.p.a+" / "+n.p.b}));
const undoBtn=()=>el("button",{type:"button",class:"skipundo",title:"Take the skip back",onclick:undoSkip,text:"Undo"});
// Find a pair, pair not named yet, relation picked by the learner: there is no pair to skip and the relation is the one they want
const nothingToSkip=()=>!!state.ui&&!!state.ui.find&&state.ui.step===0&&!!state.findRel;
/** The note under which a skip can be taken back: a line above the buttons of the pair bar, there until something is answered on the pair that replaced the skipped one. */
export function skipNoteNode(){
  const n=skipNoteLive(); if(!n) return null;
  return el("div",{class:"pnote",role:"status"},skipMsg(n),undoBtn());
}
/** The Skip button of the pair bar: dimmed once the pair is checked, and where there is nothing to skip. */
export function skipBtn(){
  const u=state.ui, fd=!!u.find, none=nothingToSkip();
  const t=none?"Nothing to skip: you picked this relation":fd&&u.step===0?"Another relation":u.syllogism?"Skip this syllogism":u.cats?"Skip this example":"Skip this pair";
  return el("button",{type:"button",class:"btn ghost skipw",disabled:none||u.checked,title:t+(none||u.checked?"":" (S)"),"aria-label":t,onclick:()=>skipPair()},tbIcon("skip"),el("span",{text:"Skip"}));
}
// The line under the diamond: the relation (or what to do).
// spec: {text, cls, disabled, onclick, why}
export function subRowNode(spec){
  return el("div",{class:"subrow"},
    spec.text?el("button",{type:"button",class:"subt"+(spec.cls||""),disabled:!!spec.disabled,tabindex:"-1",onclick:spec.onclick||null,text:spec.text}):null,
    spec.why||null);
}
/** The question before a pair with something entered in it is set aside: a dialog over the exercise, "Keep going" first. */
export function skipInto(o){
  const fd=!!(state.ui&&state.ui.find), cats=!!(state.ui&&state.ui.cats), syllogism=!!(state.ui&&state.ui.syllogism);
  o.append(el("button",{type:"button",class:"scrim",tabindex:"-1","aria-label":"Keep going",onclick:closeSkipAsk}));
  o.append(el("div",{class:"dlg",role:"alertdialog","aria-labelledby":"skq","aria-describedby":"skd"},
    el("h2",{id:"skq",text:syllogism?"Skip this syllogism?":cats?"Skip this example?":"Skip this pair?"}),
    el("p",{id:"skd",text:(syllogism?"What you entered is lost, and the syllogism is not kept anywhere. Another one comes up.":cats?"What you entered is lost, and the example is not kept anywhere. Another one comes up.":fd?"It stays out of the drill for "+SKIP_DAYS+" days and is kept in Review, under Skipped. Undo, right after, gives back the screen as it is now."
      :"What you entered for this pair is lost. It stays out of the drill for "+SKIP_DAYS+" days and waits in Review, under Skipped.")}),
    el("div",{class:"dact"},
      el("button",{type:"button",class:"btn prim",onclick:closeSkipAsk,text:"Keep going"}),
      el("button",{type:"button",class:"btn ghost",onclick:skipNow,text:"Skip anyway"}))));
}
// a pair skipped in Questions is practiced in Questions, one skipped in Relations in Relations, one skipped in Find a pair in Find a pair
export function startSkipped(f){
  const p=f.pair||{a:f.a,b:f.b,relation:f.relation,ex:{},why:{}};
  if(f.from==="find"){ resumeFind(p,f.asked); return; }
  if(f.from==="debate"){ switchTo("debate"); state.cur={p,debate:true}; state.ui=freshDebateUi(); state.mode="quiz"; startQ(); }
  else { switchTo("practice"); state.retryQ=[p]; state.retryTag="Skipped"; advance(); }
  render(); top0();
}
export function unskipKey(k){
  const had=state.skips[k]; if(!had) return;
  delete state.skips[k]; render();
  if(state.db) skipWrite(k,()=>state.db.collection("skips").doc(k).delete(),()=>{ state.skips[k]=had; });
}
export function skipSection(s){
  const list=Object.values(state.skips).sort((x,y)=>(y.at||"").localeCompare(x.at||""));
  const sec=el("div",{class:"section"},el("p",{class:"label"},"Skipped",el("span",{class:"hint",text:list.length?list.length+" set aside":"nothing skipped"})));
  if(!list.length){ sec.append(el("p",{class:"empty-note",text:"Skip a pair that is too hard or too easy. It stays out of the drill for "+SKIP_DAYS+" days and is kept here, apart from your mistakes."})); s.append(sec); return; }
  sec.append(el("p",{class:"note faint",text:"Skipped pairs stay out of the drill for "+SKIP_DAYS+" days. Practice one from here when you want it. A pair you answer leaves this list."+(list.some(f=>f.from==="find")?" A pair skipped in Find a pair is only kept here.":"")}));
  sec.append(el("ul",{class:"sum skips"},list.map(f=>{
    const p=f.pair||{a:f.a,b:f.b,relation:f.relation,ex:{},why:{}}, until=new Date(Date.parse(f.at)+SKIP_DAYS*864e5).toISOString();
    // a pair of Find a pair was never in a drill (the learner names it): it is kept with the relation that was asked for
    const sub="skipped "+dayOf(f.at)+(f.n>1?", "+f.n+" times":"")+" · "+(f.from==="find"?"Find a pair, "+(REL[f.asked||f.relation]?REL[f.asked||f.relation].name:"")
      :skipActive(f)?"back in the drill after "+dayOf(until):"back in the drill");
    return el("li",null,el("span",{class:"m skip","aria-hidden":"true",text:"»"}),
      el("span",null,p.a+" / "+p.b,el("span",{class:"sub",text:sub}),
        el("span",{class:"skact"},
          el("button",{type:"button",class:"btn",onclick:()=>startSkipped(f),text:"Practice"}),
          el("button",{type:"button",class:"btn ghost",onclick:()=>unskipKey(f.key),text:"Remove"}))));
  })));
  if(state.skipErr) sec.append(el("p",{class:"status",text:state.skipErr}));
  s.append(sec);
}
