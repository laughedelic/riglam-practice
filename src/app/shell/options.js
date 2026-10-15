import { state } from "../state.js";
import { dataTransferControls } from "../../ui/data-transfer";
import { setLab } from "../ai/lab.js";
import { $, el } from "../core/dom.js";
import { setTimer } from "../debate/flow.js";
import { WORDINGS } from "../debate/text.js";
import { overHead } from "./chat.js";
import { render } from "./render.js";
import { kindMs } from "./timers.js";
import { voiceRow } from "./voice.js";
import { saveFeatures, trialControls } from "../../ui/features";

/* ---------- debate: rendering ---------- */
/* ---------- options: notation, wording of the questions, blitz time ---------- */
// what the symbols of the chosen notation mean, for the options panel
const SYMS={
  codes:["Perdue's course book abbreviates the relations like this.",[["MI","mutually inclusive"],["MX","mutually exclusive"],["3P","three possibilities"],["4P","four possibilities"]]],
  sets:["Each term stands for the set of things it covers.",[["∩","intersection: what is both"],["∅","the empty set: nothing"],["≠ ∅","not empty"],["⊂","contained in"],["⊃","contains"],["=","the same set"]]],
  logic:["Each term stands for a statement: it is A, it is B.",[["⇒","follows: A ⇒ B, if A then B"],["⇐","follows from"],["⇔","each follows from the other"],["⇏","does not follow"],["¬","negation: not"]]]
};
function symsNode(){
  const [intro,rows]=SYMS[state.nota]||SYMS.codes;
  return el("span",{class:"symbox"},el("span",{class:"onote",text:intro}),
    el("span",{class:"syms"},rows.map(([k,t])=>el("span",{class:"sy"},el("b",{class:"math",text:k}),t))));
}
const segOf=(label,rows,cur_,on)=>el("div",{class:"seg",role:"group","aria-label":label},
  rows.map(([k,l])=>el("button",{type:"button","aria-pressed":cur_===k?"true":"false",onclick:()=>on(k),text:l})));
function setNota(k){ state.nota=k; try{ localStorage.setItem("rd-notation",k); }catch(e){} render(); }
export function setDefLang(k){ state.defLang=k==="enru"?"enru":"en"; try{ localStorage.setItem("rd-deflang",state.defLang); }catch(e){} render(); }
function setShow(key,on){ if(key==="ab") state.showAB=on; else state.fullPh=on; try{ localStorage.setItem("rd-"+key,on?"1":"0"); }catch(e){} render(); }
function setWording(k){ state.wording=k; try{ localStorage.setItem("rd-wording",k); }catch(e){} render(); }
// Options and the tutor chat are not tabs: they open over the workspace (the chat only on narrow screens) and close with Back or Escape.
export function renderOptionsBtn(){
  for(const id of ["obtn","mopt"]){ const b=$(id); b.setAttribute("aria-expanded",state.optsOpen?"true":"false"); b.classList.toggle("open",state.optsOpen); }
}
export function toggleOpts(on){
  state.optsOpen=on===undefined?!state.optsOpen:on; render();
  if(state.optsOpen){ const b=document.querySelector("#over .oc"); if(b) b.focus({preventScroll:true}); }
  else { const b=[$("obtn"),$("mopt")].find(x=>x.offsetParent); if(b) b.focus({preventScroll:true}); }
}
export function optionsInto(o){
  o.append(overHead("Options",()=>toggleOpts(false),"Close options"));
  const box=el("div",{class:"opts"});
  const row=(label,ctl,note)=>el("div",{class:"orow"},el("span",{class:"tl",text:label}),el("div",{class:"octl"},ctl,note?(typeof note==="string"?el("p",{class:"onote",text:note}):note):null));
  // one row per Blitz time: the relation's, and the one of an example (Relations) or a question (Pervasions); each sets only its own
  const timeRow=(kind,label,note)=>{
    const now=Math.round(kindMs(kind)/1000), preset=[5,10,15,30].includes(now);
    const inp=el("input",{type:"number",min:"2",max:"120",inputmode:"numeric",class:"tcustom",placeholder:"sec","aria-label":"Custom "+label.toLowerCase()+" in seconds",value:preset?"":String(now)});
    inp.addEventListener("change",e=>{ const v=Math.round(+e.target.value); if(v>=2&&v<=120) setTimer(v*1000,kind); else render(); });
    inp.addEventListener("keydown",e=>{ e.stopPropagation(); if(e.key==="Escape") toggleOpts(false); });
    return row(label,el("div",{class:"tset"},segOf(label,[[5,"5 s"],[10,"10 s"],[15,"15 s"],[30,"30 s"]],preset?now:-1,s=>setTimer(s*1000,kind)),inp),note);
  };
  box.append(...[
    row("Notation",segOf("Notation",[["codes","Shorthand"],["sets","Sets"],["logic","Logic"]],state.nota,setNota),
      symsNode()),
    row("Questions",segOf("Wording of the questions",Object.entries(WORDINGS).map(([k,w])=>[k,w.name]),state.wording,setWording),
      "How the statement of pervasion is worded in Pervasions: the four statements you accept or answer with Why?."),
    row("Definitions",segOf("Languages of the definitions",[["en","English"],["enru","English + Russian"]],state.defLang,setDefLang),
      "In the Terms panel. With Russian on, each entry also shows the Russian name of the term and, where the booklet translation has one, its Russian definition."),
    row("Show",el("div",{class:"octl"},
      el("button",{type:"button",class:"sw",role:"switch","aria-checked":state.showAB?"true":"false",onclick:()=>setShow("ab",!state.showAB)},el("i",{class:"knob","aria-hidden":"true"}),el("span",{class:"swl",text:"A/B markers"}),el("span",{class:"swt",text:"before the terms"})),
      el("button",{type:"button",class:"sw",role:"switch","aria-checked":state.fullPh?"true":"false",onclick:()=>setShow("full",!state.fullPh)},el("i",{class:"knob","aria-hidden":"true"}),el("span",{class:"swl",text:"Full phrases"}),el("span",{class:"swt",text:"spell out Why? answers"}))),
      "Applies to the statements and to your answers."),
    state.sample&&state.db?row("Check lab",el("button",{type:"button",class:"sw",role:"switch","aria-checked":state.lab?"true":"false",onclick:()=>setLab(!state.lab)},el("i",{class:"knob","aria-hidden":"true"}),el("span",{class:"swl",text:"Three models check every answer"}),el("span",{class:"swt",text:state.lab?"on":"off"})),
      "For development. After each check, Haiku, Sonnet and Opus classify your examples independently: three Claude calls from your own usage. Opus rules as judge only when they differ, and on about one answer in ten as a spot check; when all three agree, that is the verdict. Every run is stored so the models can be compared, and any box with Claude\u2019s text has a flag. Your page verdicts do not change."):null,
    voiceRow(row,segOf),
    state.features.length?row("On trial",trialControls(state.features,el,l=>{ state.features=l; saveFeatures(l); render(); }),
      "Features still in development, turned on for this device (with ?features=… in the address). Turning one off hides it again."):null,
    timeRow("rel","Relation time","The Blitz countdown for choosing the relation, in Relations and in Pervasions."),
    timeRow("ex","Example time","The Blitz countdown for each example in Relations (a table of three cells gets three times this) and for each question in Pervasions."),
    state.db?row("Your data",dataTransferControls(state.db,el,render,state.xfer),"Saves everything this device keeps (answers, debates, favorites, skipped pairs and these settings) in one file, as a backup or to move to another device. Importing adds what is missing and never deletes anything."):null].filter(Boolean));
  o.append(box);
}
