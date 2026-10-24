import { state } from "../state.js";
import { mname } from "./quorum-panel.js";
import { flagTurn, flushFlags, sendFlags, withdrawFlag } from "./flag-reports.js";
import { $, el } from "../core/dom.js";
import { fromSixth } from "../core/rel.js";
import { flagAsked } from "../../domain/flags.ts";
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
const flagOf=c=>state.flags[flagId(c)];
// a render that keeps the chat view where it is scrolled (the overlay is rebuilt and would start at the top again)
function renderKeep(){ const sc=$("chatscroll"), y=sc?sc.scrollTop:0; render(); const n=$("chatscroll"); if(n&&y) n.scrollTop=y; }
// a write of one flag, in turn with its others (flagTurn, ai/flag-reports.js); one that fails is undone and says so
function flagWrite(k,fn,undo){
  state.flagErr="";
  return flagTurn(k,fn,e=>{ undo(); state.flagErr="The flag could not be saved ("+((e&&e.code)||"error")+"), so it was undone."; renderKeep(); });
}
// A device without the Magic Key cannot flag (flags go to the app's maintainer, and only the study group's devices may write to it): it gets the same prompt as Explain
export function openFlag(c,where){
  if(state.unlock){ state.unlock.open(); return; }
  const had=flagOf(c); state.ui.flagEdit={c,where,note:had?had.note||"":"",suggest:had?had.suggest||"":""}; renderKeep();
  requestAnimationFrame(()=>{ const t=$("flag-note"); if(t){ t.focus({preventScroll:true}); const e=t.closest(".flagedit"); (e||t).scrollIntoView({block:"nearest"}); } });
}
export function saveFlag(){
  const F=state.ui.flagEdit; if(!F) return;
  const id=flagId(F.c), had=state.flags[id], now=new Date().toISOString();
  /** @type {import("../types.ts").FlagDoc} */
  const draft={id,caseKey:F.c.caseKey,thing:F.c.thing||"",part:F.c.part,model:F.c.model||"",runId:F.c.runId||null,n:F.c.n||null,shown:String(F.c.shown||"").slice(0,SHOWN_MAX),
    asked:F.c.asked?String(F.c.asked).slice(0,600):undefined,note:F.note.trim().slice(0,800),suggest:F.suggest.trim().slice(0,300),pair:F.c.pair||null,at:had?had.at:now,updatedAt:now,state:had?had.state:"new"};
  const doc=JSON.parse(JSON.stringify(draft)); // without the undefined fields
  state.flags[id]=doc; state.ui.flagEdit=null; renderKeep(); refocusFlag(id);
  if(state.db){
    const written=flagWrite(id,()=>put("flags",id,doc),()=>{ if(had) state.flags[id]=had; else delete state.flags[id]; });
    if(state.reports) written.then(()=>sendFlags([id]));
  }
}
function refocusFlag(id){ requestAnimationFrame(()=>{ const b=document.querySelector('[data-fid="'+id+'"]'); if(b) b.focus({preventScroll:true}); }); }
function cancelFlag(){ const F=state.ui.flagEdit; state.ui.flagEdit=null; renderKeep(); if(F) refocusFlag(flagId(F.c)); }
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
  const had=state.flags[id]; if(!had) return; delete state.flags[id]; if(state.ui) state.ui.flagEdit=null; renderKeep(); refocusFlag(id);
  // the report is taken back once the local flag is gone; a deletion that fails is undone, and then the server keeps the report it has of the flag that is back
  if(state.db) flagWrite(id,async()=>{ await state.db.collection("flags").doc(id).delete(); withdrawFlag(id); },()=>{ state.flags[id]=had; });
  else withdrawFlag(id);
}
export function setFlagState(id,to){
  const had=state.flags[id]; if(!had) return; const doc=Object.assign({},had,{state:to,updatedAt:new Date().toISOString()}); state.flags[id]=doc; renderKeep();
  if(state.db) flagWrite(id,()=>put("flags",id,doc),()=>{ state.flags[id]=had; });
}
export function flagEditorNode(where){
  const F=state.ui&&state.ui.flagEdit; if(!F||F.where!==where) return null;
  const had=flagOf(F.c), nm=(F.c.model?mname(F.c.model)+": ":"")+(F.c.partLabel||F.c.part);
  const note=el("textarea",{id:"flag-note",rows:"2",placeholder:"What is wrong, or why it is right",value:F.note,"aria-label":"Note"}); note.value=F.note;
  const esc=e=>{ if(e.key==="Escape"){ e.preventDefault(); e.stopPropagation(); cancelFlag(); } };
  note.addEventListener("input",e=>{ F.note=e.target.value; }); note.addEventListener("keydown",esc);
  const sug=el("input",{type:"text",id:"flag-sug",placeholder:"I think it should be … (optional)",value:F.suggest,"aria-label":"It should be",autocomplete:"off"});
  sug.addEventListener("input",e=>{ F.suggest=e.target.value; });
  sug.addEventListener("keydown",e=>{ if(e.key==="Enter"){ e.preventDefault(); saveFlag(); } else esc(e); });
  return el("div",{class:"flagedit",role:"group","aria-label":"Flag"},
    el("p",{class:"fh"},el("span",{class:"flg","aria-hidden":"true"}),el("b",{text:had?"Flagged: ":"Flag: "}),el("span",{class:"fv",text:nm})),
    note,sug,
    state.reports?el("p",{class:"fnote",text:"Submit sends this flag and the exercise it is on to the app’s maintainer."}):null,
    el("div",{class:"fa"},el("button",{type:"button",class:"btn",onclick:saveFlag,text:"Submit"}),
      el("button",{type:"button",class:"btn ghost",onclick:cancelFlag,text:"Cancel"}),
      had?el("button",{type:"button",class:"back",onclick:()=>removeFlag(flagId(F.c)),text:"Remove flag"}):null));
}
// a small flag control: a value that can be flagged; flagged ones show the flag
export function flagPart(c,where,text,cls){
  const on=!!flagOf(c), F=state.ui.flagEdit, active=F&&flagId(F.c)===flagId(c);
  return el("button",{type:"button","data-fid":flagId(c),class:"lp"+(cls?" "+cls:"")+(on?" flagged":"")+(active?" active":""),"aria-pressed":on?"true":"false","aria-label":"Flag "+(c.partLabel||c.part)+": "+text+(on?" (flagged)":""),title:on?"Flagged. Tap to change":"Tap to flag",onclick:e=>{ e.stopPropagation(); openFlag(c,where); }},
    on?el("span",{class:"flg","aria-hidden":"true"}):null,text);
}
/* ---------- a flag on every box that shows text written by Claude (v59) ---------- */
// A small flag in the top-right corner of the box, never beside Close: the Why panel and the chat show the word with it, the small ? notes only the icon.
// The editor opens inside the same box. A flag is the same document whichever box it was made in (the note on a cell is one flag in the ? note and in the question row).
// the key of the answer's flags: the collection and id it is saved under (an answer that is not saved gets a key of its own)
export const flagKeyOf=U=>(U.col||"answers")+"_"+(U.saveId||U.fkey||(U.fkey="t"+Date.now().toString(36)));
const flagKey=()=>flagKeyOf(state.ui);
// `thing`: the learner's example, for a note on a cell that a fact the server learned settled (practice/screen.js, learnedThing): the server then disputes the fact
export function aiCase(part,partLabel,shown,n,asked,thing){
  return {caseKey:flagKey(),part,partLabel,shown:String(shown||"").slice(0,SHOWN_MAX),n:n==null?null:String(n),asked:asked||undefined,thing:thing||undefined,pair:{a:state.cur.p.a,b:state.cur.p.b,relation:state.cur.p.relation,tab:state.ui.debate?"debate":"practice"}};
}
export function aiFlag(c,where,word){
  if(!state.db||!state.ui||!state.cur||!state.cur.p) return null;
  const on=!!flagOf(c), F=state.ui.flagEdit, active=!!(F&&flagId(F.c)===flagId(c));
  return el("button",{type:"button","data-fid":flagId(c),class:"aiflag"+(word?" wd":"")+(on?" flagged":"")+(active?" active":""),"aria-pressed":on?"true":"false",
    "aria-label":(on?"Flagged: ":"Flag ")+c.partLabel,title:state.unlock?"Flagging needs the Magic Key":on?"Flagged. Tap to change":"Flag "+c.partLabel,onclick:e=>{ e.stopPropagation(); openFlag(c,where); }},
    el("span",{class:"flg","aria-hidden":"true"}),word?el("span",{class:"fw",text:on?"Flagged":"Flag"}):null);
}
// one answer of Claude in the Why panel (explain turn) or the chat: the flag first, so it floats to the top-right, and the editor last
export function decorateAns(a,t,idx,over){
  if(!state.ui||state.ui.syllogism||t.pending||!t.content||a.childNodes.length===1&&a.firstChild.classList&&a.firstChild.classList.contains("status")) return;
  const where=(over?"o":"i")+idx, expl=t.kind==="explain", q=!expl&&state.ui.chat?state.ui.chat[idx-1]:null;
  const fl=aiFlag(aiCase(expl?"explain":"chat",expl?"Claude’s explanation":"Claude’s answer",t.content,expl?null:idx,flagAsked(q)),where,true);
  if(fl){ a.prepend(fl); a.classList.add("hasflag"); }
  const ed=flagEditorNode(where); if(ed) a.append(ed);
}
