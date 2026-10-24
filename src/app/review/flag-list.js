import { state } from "../state.js";
import { flagEditorNode, flagId, openFlag, removeFlag, setFlagState } from "../ai/flags.js";
import { mname } from "../ai/quorum-panel.js";
import { fillAns } from "../ai/tutor.js";
import { el } from "../core/dom.js";
import { checkReplies, isSent } from "../ai/flag-reports.js";
import { dayOf } from "../core/util.js";
import { flagAnswerRef, flagStateText, flaggedPart } from "../../domain/flags.ts";
import { exerciseNode, noteContext } from "./exercise.js";

/* ---------- Review: your flags, each with the exercise it was made on ---------- */
// A flag is the learner's note on something Claude said (ai/flags.js). Here each one opens to show what Claude said,
// the note, and the stored answer of that pair: the relation, the four cells and the whole explanation.
const openFlags=new Set();
export const byNewest=(x,y)=>(y.updatedAt||y.at||"").localeCompare(x.updatedAt||x.at||"");
export const flagCount=()=>Object.keys(state.flags).length;
export function answerOf(f){
  const r=flagAnswerRef(f); if(!r) return null;
  return (r.col==="debates"?state.debates:state.answers)[r.id]||null;
}
// the flag as the case the editor works on (ai/flags.js), so that Edit changes this same document
export const caseOf=(f,what)=>({id:f.id,caseKey:f.caseKey,thing:f.thing,part:f.part,model:f.model,runId:f.runId,n:f.n,shown:f.shown,asked:f.asked,pair:f.pair,partLabel:what});
// The server's reply to a sent flag, as plain text. A reply can be flagged in turn: that is a flag of its own, on the same exercise, that the
// maintainer reads (the server does not review a reply again). It carries the reply as what Claude said and the learner's first note as the question.
export const replyCase=f=>({caseKey:f.caseKey,thing:"",part:"reply",model:"",runId:null,n:f.id,shown:f.review.reply,asked:f.note||undefined,pair:f.pair,partLabel:"The reply to a flag"});
export const REPLY_HEAD={maintainer:"Reply so far, until the maintainer decides",decided:"The maintainer’s reply"};
const editingAt=where=>!!(state.ui&&state.ui.flagEdit&&state.ui.flagEdit.where===where);
function replyNode(f){
  const r=f.review; if(!r) return null;
  if(!r.reply) return r.state==="maintainer"?el("p",{class:"empty-note",text:"The maintainer will decide on this."}):null;
  const c=replyCase(f), where="rr:"+f.id, had=state.flags[flagId(c)], editing=editingAt(where);
  return el("div",{class:"freply"},
    el("p",{class:"clh",text:REPLY_HEAD[r.state]||"Reply"}),
    el("p",{class:"rtext",text:r.reply}),
    flagEditorNode(where),
    state.ui&&!editing?el("div",{class:"actions left"},el("button",{type:"button",class:state.unlock?"btn ghost needs-key":"btn ghost",title:state.unlock?"Flagging needs the Magic Key":null,onclick:()=>{ openFlags.add(f.id); openFlag(c,where); },text:had?"Edit your follow-up":"Flag this reply"})):null);
}
function flagItem(f){
  // a flag the page raised by itself (Quorum, where the models are divided) has no note of the learner's: it can be marked reviewed or resolved, and it is not edited
  const auto=!!f.auto, doc=answerOf(f), what=auto?(f.thing?"“"+f.thing+"” · ":"")+"Quorum (automatic)":flaggedPart(f,mname), where="rv:"+f.id, editing=editingAt(where)||editingAt("rr:"+f.id);
  const marks=auto;
  const said=el("div",{class:"ans"}); fillAns(said,f.shown||"",doc?noteContext(doc):f.pair?{p:f.pair,accepted:()=>false}:undefined);
  const pair=f.pair?f.pair.a+" / "+f.pair.b:doc?doc.a+" / "+doc.b:"A flag";
  return el("li",{class:f.state},el("details",{open:openFlags.has(f.id)||editing,ontoggle:e=>{ if(e.target.open) openFlags.add(f.id); else openFlags.delete(f.id); }},
    el("summary",null,el("span",{class:"m","aria-hidden":"true"},el("span",{class:"flg"})),
      el("span",null,pair,el("span",{class:"sub",text:what+" · "+flagStateText(f.state,state.reports?isSent(f):undefined,f.review&&f.review.state)+" · "+dayOf(f.at)}))),
    el("div",{class:"fbody"},
      el("div",{class:"fsaid"},el("p",{class:"clh",text:what}),f.asked?el("p",{class:"q",text:f.asked}):null,said),
      f.note?el("p",{class:"note"},el("b",{text:"Your note: "}),f.note):null,
      f.suggest?el("p",{class:"note"},el("b",{text:"It should be: "}),f.suggest):null,
      replyNode(f),
      flagEditorNode(where),
      doc?exerciseNode(doc):el("p",{class:"empty-note",text:"The answer this flag was made on is not saved on this device."}),
      el("div",{class:"actions left"},
        marks&&f.state==="new"?el("button",{type:"button",class:"btn ghost",onclick:()=>setFlagState(f.id,"reviewed"),text:"Reviewed"}):null,
        marks&&f.state!=="resolved"?el("button",{type:"button",class:"btn ghost",onclick:()=>setFlagState(f.id,"resolved"),text:"Resolved"}):null,
        el("button",{type:"button",class:"btn ghost",onclick:()=>{ openFlags.delete(f.id); removeFlag(f.id); },text:"Delete"}),
        state.ui&&!editing&&!auto?el("button",{type:"button","data-fid":f.id,class:state.unlock?"btn ghost needs-key":"btn",title:state.unlock?"Flagging needs the Magic Key":null,onclick:()=>{ openFlags.add(f.id); openFlag(caseOf(f,what),where); },text:"Edit"}):null))));
}
export function flagSection(box){
  if(!state.db) return;
  checkReplies();     // asks the server about the sent flags (at most once a minute); the answer renders again
  const list=Object.values(state.flags).sort(byNewest), nNew=list.filter(f=>f.state==="new").length;
  const sec=el("div",{class:"section"},el("p",{class:"label"},"Flags",el("span",{class:"hint",text:list.length?list.length+" flagged"+(nNew&&nNew<list.length?", "+nNew+" not reviewed":""):"none yet"})));
  if(!list.length) sec.append(el("p",{class:"empty-note",text:"Tap the flag on anything Claude wrote to say what is wrong with it. Your flags stay here with the exercise they were made on"+(state.reports?", and each is sent to the app’s maintainer.":".")}));
  else sec.append(el("ul",{class:"favs flags"},list.map(flagItem)));
  if(state.flagErr) sec.append(el("p",{class:"status",text:state.flagErr}));
  box.append(sec);
}
