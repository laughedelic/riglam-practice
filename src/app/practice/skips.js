import { state } from "../state.js";
import { $, el } from "../core/dom.js";
import { dayOf } from "../core/util.js";
import { isWide } from "../core/viewport.js";
import { advanceDebate, freshDebateUi, startQ, stopTimer } from "../debate/flow.js";
import { advanceFind, anotherRelation, resumeFind } from "../find/flow.js";
import { REL } from "../core/rel.js";
import { put } from "./answers.js";
import { favKey, favSafe } from "./favorites.js";
import { advance, freshUi } from "./queue.js";
import { catByLabel, norm } from "./universe.js";
import { render, top0 } from "../shell/render.js";
import { switchTo } from "../shell/tabs.js";

/* ---------- skipped pairs ---------- */
// A pair that is too hard or too easy can be skipped. The skip is recorded (collection "skips", one document per pair of categories, like a favorite),
// the pair stays out of the drill for SKIP_DAYS days, Review lists it under Skipped, and answering the pair clears the record.
export const SKIP_DAYS=7;
const UNDO_MS=6000;                    // how long the hint (narrow) or the note (wide) with Undo stays
const skipQ={};
const skipActive=s=>!!(s&&s.at&&Date.now()-Date.parse(s.at)<SKIP_DAYS*864e5);
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
export function skipPair(){
  if(!state.ui||state.mode!=="quiz"||state.ui.checked||!state.cur) return;
  if(state.ui.find) return skipFind();
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
  n.tid=setTimeout(()=>{ if(state.skipNote===n){ state.skipNote=null; hideSkipHint(); if(isWide()) render(); } },UNDO_MS);
  render(); top0(); showSkipHint();
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
  advanceFind(state.findRel?undefined:u.rel);
  const n=state.skipNote={p,key:k,had,debate:false,find:true,ui: state.ui,prev,tid:0};
  n.tid=setTimeout(()=>{ if(state.skipNote===n){ state.skipNote=null; hideSkipHint(); if(isWide()) render(); } },UNDO_MS);
  render(); top0(); showSkipHint();
}
function dropSkipNote(){ if(state.skipNote&&state.skipNote.tid) clearTimeout(state.skipNote.tid); state.skipNote=null; hideSkipHint(); }
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
const skipMsg=(n,cls)=>el("span",{class:"skipmsg"+(cls?" "+cls:"")},"Skipped ",el("b",{text:n.p.a+" / "+n.p.b}));
const undoBtn=()=>el("button",{type:"button",class:"skipundo",title:"Take the skip back",onclick:undoSkip,text:"Undo"});
// The skip icon of the narrow top bar (next to the star): there while a pair is open, dimmed once it is checked.
export function syncSkipBtn(){
  const b=/** @type {HTMLButtonElement} */($("mskip")), fd=state.tab==="find"&&!!state.ui&&!!state.ui.find;
  const ok=state.mode==="quiz"&&(fd?!!state.cur:(state.tab==="practice"||state.tab==="debate")&&!!state.cur&&!!state.cur.p);
  b.hidden=!ok; if(!ok) return;
  b.disabled=!state.ui||!!state.ui.checked||(fd&&nothingToSkip()); b.classList.toggle("hot",!!state.hintOff);
  const t=fd&&state.ui.step===0?(state.findRel?"Nothing to skip: you picked this relation":"Another relation"):"Skip this pair";
  b.title=t+(nothingToSkip()?"":" (S)"); b.setAttribute("aria-label",t);
}
// Find a pair, pair not named yet, relation picked by the learner: there is no pair to skip and the relation is the one they want
const nothingToSkip=()=>!!state.ui&&!!state.ui.find&&state.ui.step===0&&!!state.findRel;
function showSkipHint(){
  hideSkipHint(); const n=state.skipNote; if(!n||isWide()) return;
  const h=$("skiphint"), bar=document.querySelector(".mbar").getBoundingClientRect(), b=$("mskip").getBoundingClientRect();
  h.replaceChildren(skipMsg(n),undoBtn()); h.hidden=false;
  h.style.top=Math.round(bar.bottom+8)+"px"; h.style.right=Math.round(innerWidth-bar.right+12)+"px";
  h.style.setProperty("--nx",Math.round(bar.right-12-(b.left+b.width/2))+"px");
  const born=performance.now(), close=()=>{ dropSkipNote(); };
  const onDown=e=>{ if(!h.contains(e.target)) close(); };
  const onKey=e=>{ if(performance.now()-born<80||e.key==="Tab"||e.key==="Shift"||(h.contains(e.target)&&(e.key==="Enter"||e.key===" "))) return; close(); };
  const onScroll=e=>{ if(performance.now()-born>300&&!h.contains(e.target)) close(); };
  document.addEventListener("pointerdown",onDown,true); document.addEventListener("keydown",onKey,true);
  document.addEventListener("scroll",onScroll,true); document.addEventListener("wheel",onScroll,{capture:true,passive:true});
  state.hintOff=()=>{ document.removeEventListener("pointerdown",onDown,true); document.removeEventListener("keydown",onKey,true);
    document.removeEventListener("scroll",onScroll,true); document.removeEventListener("wheel",onScroll,{capture:true}); };
  $("mskip").classList.add("hot");
}
function hideSkipHint(){
  if(state.hintOff){ state.hintOff(); state.hintOff=null; }
  const h=$("skiphint"); if(h){ h.hidden=true; h.replaceChildren(); }
  const b=$("mskip"); if(b) b.classList.remove("hot");
}
// The line under the diamond on a phone: the relation (or what to do).
// spec: {text, cls, disabled, onclick, why}
export function subRowNode(spec){
  return el("div",{class:"subrow"},
    spec.text?el("button",{type:"button",class:"subt"+(spec.cls||""),disabled:!!spec.disabled,tabindex:"-1",onclick:spec.onclick||null,text:spec.text}):null,
    spec.why||null);
}
// the action row of a wide screen: the quiet Skip button, and after a skip the note with Undo before it
export function skipActs(spacerText){
  const n=skipNoteLive();
  if(n) return [el("span",{class:"kbd spacer skipmsg",role:"status"},"Skipped ",el("b",{text:n.p.a+" / "+n.p.b})),el("button",{type:"button",class:"btn ghost skipw",title:"Take the skip back",onclick:undoSkip,text:"Undo"}),skipBtn()];
  return [spacerText!=null?el("span",{class:"kbd spacer",text:spacerText}):null,skipBtn()];
}
const skipBtn=()=>{
  const fd=!!state.ui&&!!state.ui.find, none=nothingToSkip();
  return el("button",{type:"button",class:"btn ghost skipw",disabled:none,title:none?"Nothing to skip: you picked this relation":fd&&state.ui.step===0?"Another relation (S)":"Skip this pair (S)",onclick:skipPair,text:"Skip"});
};
// a pair skipped in Questions is practiced in Questions, one skipped in Relations in Relations, one skipped in Find a pair in Find a pair
function startSkipped(f){
  const p=f.pair||{a:f.a,b:f.b,relation:f.relation,ex:{},why:{}};
  if(f.from==="find"){ resumeFind(p,f.asked); return; }
  if(f.from==="debate"){ switchTo("debate"); state.cur={p,debate:true}; state.ui=freshDebateUi(); state.mode="quiz"; startQ(); }
  else { switchTo("practice"); state.retryQ=[p]; state.retryTag="Skipped"; advance(); }
  render(); top0();
}
function unskipKey(k){
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
