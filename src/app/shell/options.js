import { state } from "../state.js";
import { accountControls } from "../../ui/account";
import { dataTransferControls } from "../../ui/data-transfer";
import { setQuorum } from "../ai/quorum.js";
import { canAsk } from "../core/ask.js";
import { ico } from "../core/icons.js";
import { MAGIC_KEY_NOTE } from "../../ui/magic-key-note.ts";
import { $, el } from "../core/dom.js";
import { setTimer } from "../debate/flow.js";
import { WORDINGS } from "../debate/text.js";
import { overHead } from "./chat.js";
import { render } from "./render.js";
import { kindMs } from "./timers.js";

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
function setAutoExplain(on){ state.autoExplain=on; try{ localStorage.setItem("rd-autoexplain",on?"1":"0"); }catch(e){} render(); }
function setWording(k){ state.wording=k; try{ localStorage.setItem("rd-wording",k); }catch(e){} render(); }
// Options and the tutor chat are not tabs: they open over the workspace (the chat only on narrow screens) and close with Back or Escape.
export function renderOptionsBtn(){
  for(const id of ["obtn","mopt"]){ const b=$(id); b.setAttribute("aria-expanded",state.optsOpen?"true":"false"); b.classList.toggle("open",state.optsOpen); }
}
export function toggleOpts(on){
  state.optsOpen=on===undefined?!state.optsOpen:on; render();
  if(state.optsOpen&&state.updates) state.updates.check(60000); // the Version row is about to be read: look for a newer one unless a look is younger than a minute
  if(state.optsOpen){ const b=document.querySelector("#over .oc"); if(b) b.focus({preventScroll:true}); }
  else { const b=[$("obtn"),$("mopt")].find(x=>x.offsetParent); if(b) b.focus({preventScroll:true}); }
}
// which build this is, and where the update stands: the commit tells a staging build from the one before it. With `state.updates` the app
// updates in place (the button reloads it); without, the page only says whether the server has a newer build.
function aboutNode(a){
  const when=(()=>{ const d=new Date(a.builtAt); return isNaN(d.getTime())?"":d.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"}); })();
  const u=state.updates, st=u?u.status():null;
  const status=u?{ready:"A newer version is ready.",downloading:"Downloading a newer version.",checking:"Checking for a newer version.",
      unknown:"Could not check for a newer version (no connection?).",current:"This is the newest version."}[st]
    :a.latest==="newer"?"A newer version is out. Close the app completely and open it again to use it."
    :a.latest==="current"?"This is the newest version.":"Could not check for a newer version (no connection?).";
  const btn=!u?null:st==="ready"?el("button",{type:"button",class:"btn",onclick:()=>u.apply()},"Update now")
    :st==="current"||st==="unknown"?el("button",{type:"button",class:"btn ghost",onclick:()=>u.check()},"Check for updates"):null;
  return el("div",{class:"about"},
    el("p",{class:"onote",text:"Version "+a.version+" · build "+a.commit+(when?" · "+when:"")}),
    a.branches?el("p",{class:"onote",text:"Built from: "+a.branches.join(", ")}):null,
    el("p",{class:"onote"+(!u&&a.latest==="newer"?" bad":""),role:"status",text:status}),
    btn);
}
export function optionsInto(o){
  o.append(overHead("Options",()=>toggleOpts(false),"Close options"));
  const box=el("div",{class:"opts"});
  // "Magic Key" in the label of its rows is dotted and opens a note on the name
  const mkBtn=()=>el("button",{type:"button",class:"keyname","aria-expanded":state.mkNote?"true":"false",onclick:()=>{ state.mkNote=!state.mkNote; render(); }},"Magic Key");
  const mkPop=()=>state.mkNote?el("div",{class:"pop"},MAGIC_KEY_NOTE.map(t=>el("p",{text:t})),el("button",{type:"button",class:"popx",onclick:()=>{ state.mkNote=false; render(); }},"Hide")):null;
  const row=(label,ctl,note,icon,pop)=>el("div",{class:"orow"},el("span",{class:"tl"},icon?ico(icon):null,label),pop||null,el("div",{class:"octl"},ctl,note?(typeof note==="string"?el("p",{class:"onote",text:note}):note):null));
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
      "Shown when you open a term\u2019s definition, in the Terms panel and in the tutor\u2019s notes. With Russian on, each entry also shows the Russian name of the term and, where there is one, its Russian definition."),
    row("Show",el("div",{class:"octl"},
      el("button",{type:"button",class:"sw",role:"switch","aria-checked":state.showAB?"true":"false",onclick:()=>setShow("ab",!state.showAB)},el("i",{class:"knob","aria-hidden":"true"}),el("span",{class:"swl",text:"A/B markers"}),el("span",{class:"swt",text:"before the terms"})),
      el("button",{type:"button",class:"sw",role:"switch","aria-checked":state.fullPh?"true":"false",onclick:()=>setShow("full",!state.fullPh)},el("i",{class:"knob","aria-hidden":"true"}),el("span",{class:"swl",text:"Full phrases"}),el("span",{class:"swt",text:"spell out Why? answers"}))),
      "Applies to the statements and to your answers."),
    canAsk()?row("AI tutor",el("button",{type:"button",class:"sw",role:"switch","aria-checked":state.autoExplain?"true":"false",onclick:()=>setAutoExplain(!state.autoExplain)},el("i",{class:"knob","aria-hidden":"true"}),el("span",{class:"swl",text:"Check every answer with AI"}),el("span",{class:"swt",text:state.autoExplain?"on":"off"})),
      "Right after you check an answer, the AI tutor explains it and checks the examples the page could not. Off, the Explain button waits for you."):null,
    state.quorumOffered&&state.db?row("Quorum",el("button",{type:"button",class:"sw",role:"switch","aria-checked":state.quorum?"true":"false",onclick:()=>setQuorum(!state.quorum)},el("i",{class:"knob","aria-hidden":"true"}),el("span",{class:"swl",text:"Several models explain"}),el("span",{class:"swt",text:state.quorum?"on":"off"})),
      (state.quorumOptIn?"Optional, and slower. ":"For testing, on this test server only. ")+"With Quorum on, the explanation of a checked answer comes from Haiku, Sonnet and Opus, each on its own; where they put an example in different cells, Opus reads their answers and writes the one you see. The Quorum chip under a result shows all of them. The server keeps each run (the pair with what you wrote, and the answers), so the models can be compared; with Quorum off nothing is kept and one model answers, as in the app."):null,
    timeRow("rel","Relation time","The Blitz countdown for choosing the relation, in Relations and in Pervasions."),
    timeRow("ex","Example time","The Blitz countdown for each example in Relations (a table of three cells gets three times this) and for each question in Pervasions."),
    state.unlock?row(mkBtn(),el("button",{type:"button",class:"btn ghost",onclick:()=>{ toggleOpts(false); state.unlock.open(); }},"Enter the Magic Key"),
      "The definitions and the tutor (Explain) need the Magic Key from your study group's link. This device has none yet: open the link once on this device, or paste it here.","key",mkPop()):null,
    state.keyHeld?row(mkBtn(),keyControls(),
      state.keyAsk?"Forget the Magic Key on this device? The definitions and the tutor close again until a key is entered. Your answers and settings stay. An account that carries the key gives it back when you sign in."
        :"This device has the Magic Key, so the definitions and the tutor are open. If the study group changed the key, enter the new one; or forget the key on this device.","key",mkPop()):null,
    state.account&&state.db&&state.account.view().available?row("Account",accountControls(state.account,el,render,state.acct)):null,
    state.db?row("Your data",dataTransferControls(state.db,el,render,state.xfer),"Saves everything this device keeps (answers, debates, favorites, skipped pairs and these settings) in one file, as a backup or to move to another device. Importing adds what is missing and never deletes anything."):null,
    state.about?row("Version",aboutNode(state.about)):null].filter(Boolean));
  o.append(box);
}

// The Magic Key row while this device has the key: take another one, or forget it (after a question, since the definitions close with it).
function keyControls(){
  const k=state.keyHeld;
  if(state.keyAsk) return el("div",{class:"octl"},
    el("button",{type:"button",class:"btn",onclick:()=>k.forget()},"Forget the key"),
    el("button",{type:"button",class:"btn ghost",onclick:()=>{ state.keyAsk=false; render(); }},"Keep it"));
  return el("div",{class:"octl"},
    el("button",{type:"button",class:"btn ghost",onclick:()=>{ toggleOpts(false); k.change(); }},"Enter another key"),
    el("button",{type:"button",class:"btn ghost",onclick:()=>{ state.keyAsk=true; render(); }},"Forget the key"));
}
