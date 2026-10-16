import { state } from "../state.js";
import { flagEditorNode, openFlag, removeFlag, setFlagState } from "../ai/flags.js";
import { mname } from "../ai/lab-panel.js";
import { fillAns } from "../ai/tutor.js";
import { el } from "../core/dom.js";
import { isSent } from "../ai/flag-reports.js";
import { dayOf } from "../core/util.js";
import { flagAnswerRef, flagStateText, flaggedPart } from "../../domain/flags.ts";
import { exerciseNode } from "./exercise.js";

/* ---------- Review: your flags, each with the exercise it was made on ---------- */
// A flag is the learner's note on something Claude said (ai/flags.js). Here each one opens to show what Claude said,
// the note, and the stored answer of that pair: the relation, the four cells and the whole explanation.
const openFlags=new Set();
const byNewest=(x,y)=>(y.updatedAt||y.at||"").localeCompare(x.updatedAt||x.at||"");
export const flagCount=()=>Object.keys(state.flags).length;
function answerOf(f){
  const r=flagAnswerRef(f); if(!r) return null;
  return (r.col==="debates"?state.debates:state.answers)[r.id]||null;
}
// the flag as the case the editor works on (ai/flags.js), so that Edit changes this same document
const caseOf=(f,what)=>({id:f.id,caseKey:f.caseKey,thing:f.thing,part:f.part,model:f.model,runId:f.runId,n:f.n,shown:f.shown,asked:f.asked,pair:f.pair,partLabel:what});
function flagItem(f){
  const doc=answerOf(f), what=flaggedPart(f,mname), where="rv:"+f.id, editing=!!(state.ui&&state.ui.flagEdit&&state.ui.flagEdit.where===where);
  const marks=!!(state.sample&&state.lab); // where the check lab runs (the artifact), its owner marks flags as reviewed and resolved
  const said=el("div",{class:"ans"}); fillAns(said,f.shown||"");
  const pair=f.pair?f.pair.a+" / "+f.pair.b:doc?doc.a+" / "+doc.b:"A flag";
  return el("li",{class:f.state},el("details",{open:openFlags.has(f.id)||editing,ontoggle:e=>{ if(e.target.open) openFlags.add(f.id); else openFlags.delete(f.id); }},
    el("summary",null,el("span",{class:"m","aria-hidden":"true"},el("span",{class:"flg"})),
      el("span",null,pair,el("span",{class:"sub",text:what+" · "+flagStateText(f.state,state.reports?isSent(f):undefined)+" · "+dayOf(f.at)}))),
    el("div",{class:"fbody"},
      el("div",{class:"fsaid"},el("p",{class:"clh",text:what}),f.asked?el("p",{class:"q",text:f.asked}):null,said),
      f.note?el("p",{class:"note"},el("b",{text:"Your note: "}),f.note):null,
      f.suggest?el("p",{class:"note"},el("b",{text:"It should be: "}),f.suggest):null,
      flagEditorNode(where),
      doc?exerciseNode(doc):el("p",{class:"empty-note",text:"The answer this flag was made on is not saved on this device."}),
      el("div",{class:"actions left"},
        marks&&f.state==="new"?el("button",{type:"button",class:"btn ghost",onclick:()=>setFlagState(f.id,"reviewed"),text:"Reviewed"}):null,
        marks&&f.state!=="resolved"?el("button",{type:"button",class:"btn ghost",onclick:()=>setFlagState(f.id,"resolved"),text:"Resolved"}):null,
        el("button",{type:"button",class:"btn ghost",onclick:()=>{ openFlags.delete(f.id); removeFlag(f.id); },text:"Delete"}),
        state.ui&&!editing?el("button",{type:"button",class:state.unlock?"btn ghost needs-key":"btn",title:state.unlock?"Flagging needs the Magic Key":null,onclick:()=>{ openFlags.add(f.id); openFlag(caseOf(f,what),where); },text:"Edit"}):null))));
}
export function flagSection(box){
  if(!state.db) return;
  const list=Object.values(state.flags).sort(byNewest), nNew=list.filter(f=>f.state==="new").length;
  const sec=el("div",{class:"section"},el("p",{class:"label"},"Flags",el("span",{class:"hint",text:list.length?list.length+" flagged"+(nNew&&nNew<list.length?", "+nNew+" not reviewed":""):"none yet"})));
  if(!list.length) sec.append(el("p",{class:"empty-note",text:"Tap the flag on anything Claude wrote to say what is wrong with it. Your flags stay here with the exercise they were made on"+(state.reports?", and each is sent to the app’s maintainer.":".")}));
  else sec.append(el("ul",{class:"favs flags"},list.map(flagItem)));
  if(state.flagErr) sec.append(el("p",{class:"status",text:state.flagErr}));
  box.append(sec);
}
