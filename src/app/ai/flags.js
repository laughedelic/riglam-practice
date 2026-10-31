import { state } from "../state.js";
import { flagTurn, flushFlags, sendFlags, withdrawFlag } from "./flag-reports.js";
import { fromSixth } from "../core/rel.js";
import { typingEl } from "../core/viewport.js";
import { put } from "../practice/answers.js";
import { favSafe } from "../practice/favorites.js";
import { render } from "../shell/render.js";

/* ---------- flags: any part of any AI answer ---------- */
// a flag is one document per part: {caseKey, thing, part, model, shown, asked, note, suggest, state}; it can be changed or removed, and it is the labeled data for the model comparison.
// It keeps what Claude said in full (up to SHOWN_MAX), and for an answer in the chat the question it answered, so Review can show the flag with its whole exchange.
const SHOWN_MAX=2000;
export const hash36=s=>{ let h=5381; s=String(s); for(let i=0;i<s.length;i++) h=((h<<5)+h+s.charCodeAt(i))|0; return (h>>>0).toString(36); };
// the flags of the database, kept up to date; a flag write in flight keeps the snapshot from replacing what the page just changed
export function flagsSubscribe(){
  try{
    state.db.collection("flags").orderBy("updatedAt","desc").limit(300).onSnapshot(snap=>{
      if(state.flagPending) return;
      /** @type {Record<string, any>} */ const m={}; snap.docs.forEach(d=>{m[d.id]=fromSixth(d.data());}); const same=JSON.stringify(Object.keys(m).sort().map(k=>[k,m[k].state,m[k].updatedAt,m[k].sentAt||null,m[k].review||null]))===JSON.stringify(Object.keys(state.flags).sort().map(k=>[k,state.flags[k].state,state.flags[k].updatedAt,state.flags[k].sentAt||null,state.flags[k].review||null]));
      state.flags=m; if(!same&&state.tab==="review"&&state.mode!=="loading"&&!typingEl(document.activeElement)) render();
      flushFlags();                    // flags that were not sent yet (this device had no way, or none that worked) go now
    },()=>{});
  }catch(e){}          // flags are optional: a failing subscription must never stop the page from starting
}
// a case opened from Review carries the id of the flag it edits; a new one gets its id from what it is on
export const flagId=c=>c.id||"fl_"+favSafe(c.caseKey).slice(0,60)+"_"+hash36([c.caseKey,c.thing||"",c.part,c.model||"",c.n||""].join("|"));
export const flagOf=c=>state.flags[flagId(c)];
// a write of one flag, in turn with its others (flagTurn, ai/flag-reports.js); one that fails is undone and says so
function flagWrite(k,fn,undo){
  state.flagErr="";
  return flagTurn(k,fn,e=>{ undo(); state.flagErr="The flag could not be saved ("+((e&&e.code)||"error")+"), so it was undone."; render(); });
}
// A device without the Magic Key cannot flag (flags go to the app's maintainer, and only the study group's devices may write to it): it gets the same prompt as Explain
export function openFlag(c,where){
  if(state.unlock){ state.unlock.open(); return; }
  const had=flagOf(c); state.ui.flagEdit={c,where,note:had?had.note||"":"",suggest:had?had.suggest||"":""}; render();
  requestAnimationFrame(()=>{ const t=document.getElementById("flag-note"); if(t){ t.focus({preventScroll:true}); t.scrollIntoView({block:"nearest"}); } });
}
export function saveFlag(){
  const F=state.ui.flagEdit; if(!F) return;
  const id=flagId(F.c), had=state.flags[id], now=new Date().toISOString();
  /** @type {import("../types.ts").FlagDoc} */
  const draft={id,caseKey:F.c.caseKey,thing:F.c.thing||"",part:F.c.part,model:F.c.model||"",runId:F.c.runId||null,n:F.c.n||null,shown:String(F.c.shown||"").slice(0,SHOWN_MAX),
    asked:F.c.asked?String(F.c.asked).slice(0,600):undefined,note:F.note.trim().slice(0,800),suggest:F.suggest.trim().slice(0,300),pair:F.c.pair||null,at:had?had.at:now,updatedAt:now,state:had?had.state:"new"};
  const doc=JSON.parse(JSON.stringify(draft)); // without the undefined fields
  state.flags[id]=doc; state.ui.flagEdit=null; render(); refocusFlag(id);
  if(state.db){
    const written=flagWrite(id,()=>put("flags",id,doc),()=>{ if(had) state.flags[id]=had; else delete state.flags[id]; });
    if(state.reports) written.then(()=>sendFlags([id]));
  }
}
function refocusFlag(id){ requestAnimationFrame(()=>{ const b=document.querySelector('[data-fid="'+id+'"]'); if(b) b.focus({preventScroll:true}); }); }
export function cancelFlag(){ const F=state.ui.flagEdit; state.ui.flagEdit=null; render(); if(F) refocusFlag(flagId(F.c)); }
// A flag the page writes by itself where Quorum is divided about an example (src/domain/quorum.ts): one document per example, `part` "quorum", `auto` "quorum",
// the cells in `shown`, `runId` the record of the run on the server, and no note. A later run on the same answer rewrites a flag that is still new; one that was reviewed or resolved stays as it is,
// and a deleted one comes back only if the answer is explained again.
export function autoFlags(kase,found){
  if(!state.db||!found.length) return;
  const now=new Date().toISOString();
  for(const {thing,shown,runId} of found){
    const c={caseKey:kase.key,thing,part:"quorum",model:"",n:null}, id=flagId(c), had=state.flags[id];
    if(had&&(had.auto!=="quorum"||had.state!=="new"||(had.shown===shown&&(had.runId||null)===(runId||null)))) continue;   // same words from the same run: nothing to write
    /** @type {import("../types.ts").FlagDoc} */
    const draft={id,caseKey:kase.key,thing,part:"quorum",model:"",runId:runId||null,n:null,shown,note:"",suggest:"",pair:{a:kase.a,b:kase.b,relation:kase.relation,tab:kase.tab},auto:"quorum",at:had?had.at:now,updatedAt:now,state:"new"};
    const doc=JSON.parse(JSON.stringify(draft));
    state.flags[id]=doc;
    flagWrite(id,()=>put("flags",id,doc),()=>{ if(had) state.flags[id]=had; else delete state.flags[id]; });
  }
}
export function removeFlag(id){
  const had=state.flags[id]; if(!had) return; delete state.flags[id]; if(state.ui) state.ui.flagEdit=null; render(); refocusFlag(id);
  // the report is taken back once the local flag is gone; a deletion that fails is undone, and then the server keeps the report it has of the flag that is back
  if(state.db) flagWrite(id,async()=>{ await state.db.collection("flags").doc(id).delete(); withdrawFlag(id); },()=>{ state.flags[id]=had; });
  else withdrawFlag(id);
}
export function setFlagState(id,to){
  const had=state.flags[id]; if(!had) return; const doc=Object.assign({},had,{state:to,updatedAt:new Date().toISOString()}); state.flags[id]=doc; render();
  if(state.db) flagWrite(id,()=>put("flags",id,doc),()=>{ state.flags[id]=had; });
}
/* ---------- a flag on every box that shows text written by Claude (v59) ---------- */
// A flag is the same document whichever box it was made in (the note on a cell is one flag in the ? note and in the question row); the Path draws the controls (path/flags.tsx).
// the key of the answer's flags: the collection and id it is saved under (an answer that is not saved gets a key of its own)
export const flagKeyOf=U=>(U.col||"answers")+"_"+(U.saveId||U.fkey||(U.fkey="t"+Date.now().toString(36)));
const flagKey=()=>flagKeyOf(state.ui);
// `thing`: the learner's example, for a note on a cell that a fact the server learned settled (practice/screen.js, learnedThing): the server then disputes the fact
export function aiCase(part,partLabel,shown,n,asked,thing){
  return {caseKey:flagKey(),part,partLabel,shown:String(shown||"").slice(0,SHOWN_MAX),n:n==null?null:String(n),asked:asked||undefined,thing:thing||undefined,pair:{a:state.cur.p.a,b:state.cur.p.b,relation:state.cur.p.relation,tab:state.ui.debate?"debate":"practice"}};
}
