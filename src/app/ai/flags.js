import { state } from "../state.js";
import { mname } from "./lab-panel.js";
import { flagQ, hash36 } from "./lab.js";
import { $, el } from "../core/dom.js";
import { put } from "../practice/answers.js";
import { favSafe } from "../practice/favorites.js";
import { render } from "../shell/render.js";

/* ---------- flags: any part of any AI answer ---------- */
// a flag is one document per part: {caseKey, thing, part, model, shown, note, suggest, state}; it can be changed or removed, and it is the labelled data for the model comparison
export const flagId=c=>"fl_"+favSafe(c.caseKey).slice(0,60)+"_"+hash36([c.caseKey,c.thing||"",c.part,c.model||"",c.n||""].join("|"));
const flagOf=c=>state.flags[flagId(c)];
// a render that keeps the chat view where it is scrolled (the overlay is rebuilt and would start at the top again)
function renderKeep(){ const sc=$("chatscroll"), y=sc?sc.scrollTop:0; render(); const n=$("chatscroll"); if(n&&y) n.scrollTop=y; }
function flagWrite(k,fn,undo){
  state.flagErr=""; state.flagPending++;
  flagQ[k]=(flagQ[k]||Promise.resolve()).catch(()=>{}).then(fn).catch(e=>{ undo(); state.flagErr="The flag could not be saved ("+((e&&e.code)||"error")+"), so it was undone."; renderKeep(); }).finally(()=>{ state.flagPending--; });
}
export function openFlag(c,where){
  const had=flagOf(c); state.ui.flagEdit={c,where,note:had?had.note||"":"",suggest:had?had.suggest||"":""}; renderKeep();
  requestAnimationFrame(()=>{ const t=$("flag-note"); if(t){ t.focus({preventScroll:true}); const e=t.closest(".flagedit"); (e||t).scrollIntoView({block:"nearest"}); } });
}
export function saveFlag(){
  const F=state.ui.flagEdit; if(!F) return;
  const id=flagId(F.c), had=state.flags[id], now=new Date().toISOString();
  /** @type {import("../types.ts").FlagDoc} */
  const draft={id,caseKey:F.c.caseKey,thing:F.c.thing||"",part:F.c.part,model:F.c.model||"",runId:F.c.runId||null,n:F.c.n||null,shown:String(F.c.shown||"").slice(0,600),
    note:F.note.trim().slice(0,800),suggest:F.suggest.trim().slice(0,300),pair:F.c.pair||null,at:had?had.at:now,updatedAt:now,state:had?had.state:"new"};
  const doc=JSON.parse(JSON.stringify(draft)); // without the undefined fields
  state.flags[id]=doc; state.ui.flagEdit=null; renderKeep(); refocusFlag(id);
  if(state.db) flagWrite(id,()=>put("flags",id,doc),()=>{ if(had) state.flags[id]=had; else delete state.flags[id]; });
}
function refocusFlag(id){ requestAnimationFrame(()=>{ const b=document.querySelector('[data-fid="'+id+'"]'); if(b) b.focus({preventScroll:true}); }); }
function cancelFlag(){ const F=state.ui.flagEdit; state.ui.flagEdit=null; renderKeep(); if(F) refocusFlag(flagId(F.c)); }
export function removeFlag(id){
  const had=state.flags[id]; if(!had) return; delete state.flags[id]; if(state.ui) state.ui.flagEdit=null; renderKeep(); refocusFlag(id);
  if(state.db) flagWrite(id,()=>state.db.collection("flags").doc(id).delete(),()=>{ state.flags[id]=had; });
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
const flagKey=()=>state.ui.lab&&state.ui.lab.kase?state.ui.lab.kase.key:(state.ui.col||"answers")+"_"+(state.ui.saveId||state.ui.fkey||(state.ui.fkey="t"+Date.now().toString(36)));
export function aiCase(part,partLabel,shown,n){
  return {caseKey:flagKey(),part,partLabel,shown:String(shown||"").slice(0,400),n:n==null?null:String(n),pair:{a:state.cur.p.a,b:state.cur.p.b,relation:state.cur.p.relation,tab:state.ui.debate?"debate":"practice"}};
}
export function aiFlag(c,where,word){
  if(!state.db||!state.ui||!state.cur||!state.cur.p) return null;
  const on=!!flagOf(c), F=state.ui.flagEdit, active=!!(F&&flagId(F.c)===flagId(c));
  return el("button",{type:"button","data-fid":flagId(c),class:"aiflag"+(word?" wd":"")+(on?" flagged":"")+(active?" active":""),"aria-pressed":on?"true":"false",
    "aria-label":(on?"Flagged: ":"Flag ")+c.partLabel,title:on?"Flagged. Tap to change":"Flag "+c.partLabel,onclick:e=>{ e.stopPropagation(); openFlag(c,where); }},
    el("span",{class:"flg","aria-hidden":"true"}),word?el("span",{class:"fw",text:on?"Flagged":"Flag"}):null);
}
// one answer of Claude in the Why panel (explain turn) or the chat: the flag first, so it floats to the top-right, and the editor last
export function decorateAns(a,t,idx,over){
  if(!state.ui||t.pending||!t.content||a.childNodes.length===1&&a.firstChild.classList&&a.firstChild.classList.contains("status")) return;
  const where=(over?"o":"i")+idx, expl=t.kind==="explain";
  const fl=aiFlag(aiCase(expl?"explain":"chat",expl?"Claude’s explanation":"Claude’s answer",t.content,expl?null:idx),where,true);
  if(fl){ a.prepend(fl); a.classList.add("hasflag"); }
  const ed=flagEditorNode(where); if(ed) a.append(ed);
}
