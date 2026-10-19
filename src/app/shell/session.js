import { state } from "../state.js";
import { canAsk } from "../core/ask.js";
import { $, el } from "../core/dom.js";
import { tbIcon } from "../core/icons.js";
import { isWide } from "../core/viewport.js";
import { asking, setTimer, startQ, stopTimer } from "../debate/flow.js";
import { WORDINGS } from "../debate/text.js";
import { exName } from "./home.js";
import { toggleOpts } from "./options.js";
import { isEx, render } from "./render.js";
import { segOf, settingRow as row, switchOf } from "./rows.js";
import { kindMs } from "./timers.js";

/* ---------- the settings of an exercise ---------- */
// What changes how an exercise looks or ticks (notation, wording of the questions, the language of the definitions, A/B markers, full
// phrases, the tutor's check, the Blitz times) opens from the exercise: a sheet from the bottom of a phone, a panel at the right of a wide
// screen. Options keeps what belongs to the device and the account. A setting is in one of the two, never both. The sheet shows only what
// the exercise on screen uses; like Options it pauses the Blitz clock and the clock starts again, with its full time, when the sheet closes.

// what the symbols of the chosen notation mean
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
const store=(key,v)=>{ try{ localStorage.setItem(key,v); }catch(e){} };
function setNota(k){ state.nota=k; store("rd-notation",k); render(); }
export function setDefLang(k){ state.defLang=k==="enru"?"enru":"en"; store("rd-deflang",state.defLang); render(); }
function setShow(key,on){ if(key==="ab") state.showAB=on; else state.fullPh=on; store("rd-"+key,on?"1":"0"); render(); }
function setAutoExplain(on){ state.autoExplain=on; store("rd-autoexplain",on?"1":"0"); render(); }
function setWording(k){ state.wording=k; store("rd-wording",k); render(); }

export function toggleSess(on){
  const was=state.sessOpen; state.sessOpen=on===undefined?!was:on;
  if(state.sessOpen&&!was) stopTimer();
  else if(!state.sessOpen&&was&&state.blitz&&asking()) startQ();
  render();
  if(state.sessOpen){ const b=document.querySelector("#over .oc"); if(b) b.focus({preventScroll:true}); }
  else { const b=/** @type {HTMLElement[]} */([$("msess"),document.querySelector(".sessb")]).find(x=>x&&x.offsetParent); if(b) b.focus({preventScroll:true}); }
}
// the button in the narrow top bar (the wide layout has it in the action row, `sessBtn`)
export function syncSessBtn(){
  const b=$("msess"), ok=state.mode==="quiz"&&isEx();
  b.hidden=!ok; if(!ok) return;
  const t="Settings for "+exName(state.tab);
  b.replaceChildren(tbIcon("sliders")); b.setAttribute("aria-label",t); b.title=t;
  b.setAttribute("aria-expanded",state.sessOpen?"true":"false"); b.classList.toggle("open",state.sessOpen);
}
// the button in the action row (wide screens)
export function sessBtn(){
  if(!isWide()) return null;
  const t="Settings for "+exName(state.tab);
  return el("button",{type:"button",class:"bz sessb","aria-haspopup":"dialog","aria-expanded":state.sessOpen?"true":"false","aria-label":t,title:t,onclick:()=>toggleSess(true)},tbIcon("sliders"));
}

// one row per Blitz time: the relation's, and the one of an example (Relations) or a question (Pervasions); each sets only its own
function timeRow(kind,label,note){
  const now=Math.round(kindMs(kind)/1000), preset=[5,10,15,30].includes(now);
  const inp=el("input",{type:"number",min:"2",max:"120",inputmode:"numeric",class:"tcustom",placeholder:"sec","aria-label":"Custom "+label.toLowerCase()+" in seconds",value:preset?"":String(now)});
  inp.addEventListener("change",e=>{ const v=Math.round(+/** @type {HTMLInputElement} */(e.target).value); if(v>=2&&v<=120) setTimer(v*1000,kind); else render(); });
  inp.addEventListener("keydown",e=>{ e.stopPropagation(); if(e.key==="Escape") toggleSess(false); });
  return row(label,el("div",{class:"tset"},segOf(label,[[5,"5 s"],[10,"10 s"],[15,"15 s"],[30,"30 s"]],preset?now:-1,s=>setTimer(s*1000,kind)),inp),note);
}

// the sheet: a scrim that closes it, and the panel
export function sessionInto(o){
  o.append(el("button",{type:"button",class:"scrim",tabindex:"-1","aria-label":"Close the settings",onclick:()=>toggleSess(false)}));
  const sheet=el("div",{class:"sheet"});
  sheet.append(el("div",{class:"oh"},el("h2",{text:exName(state.tab)+" settings"}),el("span",{class:"sp"}),el("button",{type:"button",class:"oc",onclick:()=>toggleSess(false),"aria-label":"Close the settings",text:"Done"})));
  const box=el("div",{class:"opts",id:"opts"}), perv=state.tab==="debate", timed=state.tab==="practice"||perv;
  box.append(...[
    row("Notation",segOf("Notation",[["codes","Shorthand"],["sets","Sets"],["logic","Logic"]],state.nota,setNota),symsNode()),
    perv?row("Questions",segOf("Wording of the questions",Object.entries(WORDINGS).map(([k,w])=>[k,w.name]),state.wording,setWording),
      "How the statement of pervasion is worded in Pervasions: the four statements you accept or answer with Why?."):null,
    row("Definitions",segOf("Languages of the definitions",[["en","English"],["enru","English + Russian"]],state.defLang,setDefLang),
      "Shown when you open a term’s definition, in the Terms panel and in the tutor’s notes. With Russian on, each entry also shows the Russian name of the term and, where there is one, its Russian definition."),
    row("Show",el("div",{class:"octl"},
      switchOf("A/B markers","before the terms",state.showAB,()=>setShow("ab",!state.showAB)),
      switchOf("Full phrases","spell out Why? answers",state.fullPh,()=>setShow("full",!state.fullPh))),
      "Applies to the statements and to your answers."),
    canAsk()?row("AI tutor",switchOf("Check every answer with AI",state.autoExplain?"on":"off",state.autoExplain,()=>setAutoExplain(!state.autoExplain)),
      "Right after you check an answer, the AI tutor explains it and checks the examples the page could not. Off, the Explain button waits for you."):null,
    timed?timeRow("rel","Relation time","The Blitz countdown for choosing the relation, in Relations and in Pervasions. The bolt switches Blitz on and off."):null,
    timed?timeRow("ex","Example time","The Blitz countdown for each example in Relations (a table of three cells gets three times this) and for each question in Pervasions."):null,
    row("More",el("button",{type:"button",class:"btn ghost",onclick:()=>{ toggleSess(false); toggleOpts(true); }},"Options"),
      "The Magic Key, your account and data, and the version.")].filter(Boolean));
  sheet.append(box); o.append(sheet);
}
