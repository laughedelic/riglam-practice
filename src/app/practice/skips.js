import { state } from "../state.js";
import { skipCategories } from "../categories/flow.js";
import { skipInstance } from "../instance/flow.ts";
import { skipSyllogism } from "../syllogism/flow.js";
import { advanceDebate, freshDebateUi } from "../debate/flow.js";
import { stopTimer } from "../shell/timers.js";
import { advanceFind, anotherRelation, resumeFind } from "../find/flow.js";
import { put } from "./answers.js";
import { favKey, favSafe } from "./favorites.js";
import { advance } from "./queue.js";
import { catByLabel, norm } from "./universe.js";
import { render, top0 } from "../shell/render.js";
import { begun, switchTo } from "../shell/tabs.js";

/* ---------- skipped pairs ---------- */
// A pair that is too hard or too easy can be skipped. The skip is recorded (collection "skips", one document per pair of categories, like a favorite),
// the pair stays out of the drill for SKIP_DAYS days, Review lists it under Skipped, and answering the pair clears the record.
export const SKIP_DAYS=7;
const skipQ={};
export const skipActive=s=>!!(s&&s.at&&Date.now()-Date.parse(s.at)<SKIP_DAYS*864e5);
// the key of a pair of categories, also when both labels belong to one category (minds / consciousnesses): that pair is then one candidate of the pool
export const catKey=(a,b)=>"c_"+favSafe([a,b].sort().join("__"));
export const skipCats=p=>[p.catA||catByLabel(p.a), p.catB||catByLabel(p.b)];
// Find a pair keeps its skips in the same collection under keys of its own. The pair is the learner's words, which may name no category, and the same pair asked for
// under another relation is another exercise, so the key is the relation asked for and the pair in the order given (A first). A short hash of the words stands for
// them, because a key keeps only letters, digits and "_" and words in Russian or Tibetan would all become the same "_". A negated side is another pair of the same categories.
const wordHash=s=>{ let h=2166136261; for(const ch of s){ h^=ch.codePointAt(0); h=Math.imul(h,16777619)>>>0; } return h.toString(36); };
export const findSkipKey=(p,rel)=>{ const [a,b]=skipCats(p), w=a&&b?a+"|"+b+(p.neg?"|non-"+p.neg:""):norm(p.a)+"|"+norm(p.b); return "f_"+rel+"_"+wordHash(w)+"_"+favSafe(w).slice(0,40); };
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
// Skip: a pair with something entered in it asks first (the question in `skipAsk`); one that was only drawn is set aside at once.
export function skipPair(){
  if(!state.ui||state.mode!=="quiz"||state.ui.checked||!state.cur) return;
  if(skipAsks()){ state.skipAsk=true; render(); return; }       // the clock stands still behind the question (shell/timers.js)
  skipNow();
}
/** Whether Skip asks before it sets the pair on screen aside: something is entered in it (the Path turns its page aside only for a skip that goes through). */
export function skipAsks(){
  const u=state.ui; if(!u||state.mode!=="quiz"||u.checked||!state.cur) return false;
  return !!(u.find?u.step>0:begun(u));
}
/** The answer "Keep going" to the question before a skip. */
export function closeSkipAsk(){
  state.skipAsk=false;
  render();
}
/** Skips the pair on screen with no question. */
export function skipNow(){
  state.skipAsk=false;
  if(!state.ui||state.mode!=="quiz"||state.ui.checked||!state.cur) return;
  if(state.ui.find) return skipFind();
  if(state.ui.cats) return skipCategories();                           // Categories: another example, nothing kept
  if(state.ui.inst) return skipInstance();                             // Find an instance: other categories, nothing kept
  if(state.ui.syllogism) return skipSyllogism();                      // Syllogisms: another one, nothing kept
  if(!state.cur.p||(state.tab!=="practice"&&state.tab!=="debate")) return;
  stopTimer();
  const p=state.cur.p, k=skipKey(p), had=state.skips[k], [ca,cb]=skipCats(p), wasDebate=!!state.ui.debate;
  /** @type {import("../types.ts").SkipDoc} */
  const draft={key:k,a:p.a,b:p.b,catA:ca,catB:cb,relation:p.relation,pair:p,from:wasDebate?"debate":"practice",n:(had&&had.n||0)+1,at:new Date().toISOString()};
  const doc=JSON.parse(JSON.stringify(draft));          // without the undefined fields
  state.skips[k]=doc;
  if(state.db) skipWrite(k,()=>put("skips",k,doc),()=>{ if(had) state.skips[k]=had; else delete state.skips[k]; });
  if(wasDebate) advanceDebate(); else advance();
  render(); top0();
}
// Find a pair. Before the pair is named there is nothing to set aside, so Skip asks for another relation (unless the learner picked one, which then stays).
// Once the pair is named, Skip sets it aside with the relation asked for, however far the examples are: it is kept in Review > Skipped, where it can be opened again
// at the examples.
function skipFind(){
  const u=state.ui, p=state.cur.p;
  if(u.step===0){ if(!state.findRel) anotherRelation(); return; }
  if(!p) return;
  const k=findSkipKey(p,u.rel), had=state.skips[k], [ca,cb]=skipCats(p);
  /** @type {import("../types.ts").SkipDoc} */
  const draft={key:k,a:p.a,b:p.b,catA:ca||null,catB:cb||null,relation:p.relation,pair:p,from:"find",asked:u.rel,n:(had&&had.n||0)+1,at:new Date().toISOString()};
  const doc=JSON.parse(JSON.stringify(draft));
  state.skips[k]=doc;
  if(state.db) skipWrite(k,()=>put("skips",k,doc),()=>{ if(had) state.skips[k]=had; else delete state.skips[k]; });
  advanceFind();
  render(); top0();
}
// answering a pair puts it back among the ordinary ones
export function clearSkip(p,rel){
  const k=skipKey(p,rel), had=state.skips[k]; if(!had) return;
  delete state.skips[k];
  if(state.db) skipWrite(k,()=>state.db.collection("skips").doc(k).delete(),()=>{ state.skips[k]=had; });
}
/** The words of the question before a pair with something entered in it is set aside (the Path draws the dialog: path/app.tsx). */
export function skipAskText(){
  const fd=!!(state.ui&&state.ui.find), cats=!!(state.ui&&state.ui.cats), inst=!!(state.ui&&state.ui.inst), syllogism=!!(state.ui&&state.ui.syllogism);
  return {
    q:syllogism?"Skip this syllogism?":cats?"Skip this example?":inst?"Skip these categories?":"Skip this pair?",
    d:syllogism?"Your inputs will be lost, and the syllogism is not kept anywhere. Another one comes up.":cats?"Your inputs will be lost, and the example is not kept anywhere. Another one comes up.":inst?"Your inputs will be lost, and nothing is kept. Other categories come up.":fd?"It stays out of the drill for "+SKIP_DAYS+" days and is kept in Review, under Skipped."
      :"Your inputs will be lost. It stays out of the drill for "+SKIP_DAYS+" days and waits in Review, under Skipped."};
}
// a pair skipped in Questions is practiced in Questions, one skipped in Relations in Relations, one skipped in Find a pair in Find a pair
export function startSkipped(f){
  const p=f.pair||{a:f.a,b:f.b,relation:f.relation,ex:{},why:{}};
  if(f.from==="find"){ resumeFind(p,f.asked); return; }
  if(f.from==="debate"){ debateAgain(p); return; }
  switchTo("practice"); state.retryQ=[p]; state.retryTag="Skipped"; advance();
  render(); top0();
}
/** A pair of Pervasions taken again there (a skipped one, or one from Review on the Path). */
export function debateAgain(p){ switchTo("debate"); state.cur={p,debate:true}; state.ui=freshDebateUi(); state.mode="quiz"; render(); top0(); }
export function unskipKey(k){
  const had=state.skips[k]; if(!had) return;
  delete state.skips[k]; render();
  if(state.db) skipWrite(k,()=>state.db.collection("skips").doc(k).delete(),()=>{ state.skips[k]=had; });
}
