import { state } from "../state.js";
import { setQuorum } from "../ai/quorum.js";
import { canAsk } from "../core/ask.js";
import { $, el } from "../core/dom.js";
import { tbIcon } from "../core/icons.js";
import { setCategoriesAsk } from "../categories/flow.js";
import { asking, setBlitz, setTimer, startQ, stopTimer } from "../debate/flow.js";
import { WORDINGS } from "../debate/text.js";
import { NOT } from "../../ai-shared/debate.ts";
import { exName } from "./exercises.js";
import { stageSwitches } from "./stages.js";
import { toggleOpts } from "./options.js";
import { isEx, render } from "./render.js";
import { segOf, settingRow as row, switchOf } from "./rows.js";
import { kindMs } from "./timers.js";
import { voiceListRows, voicePageBody, voiceShown } from "./voice.js";

/* ---------- the Practice options of an exercise ---------- */
// What changes how an exercise looks, ticks or is checked (notation, wording of the questions, Blitz (on or off, and its times), A/B markers, full phrases, the language of the
// definitions, the tutor's check) opens from the sliders button at the top of the exercise: a sheet from the bottom of a phone, a popover under the bar on a wide
// screen. Settings (options.js) keeps what belongs to the app, the device and the account. A setting is in one of the two, never both. The sheet shows only what the
// exercise on screen uses. Like Settings it pauses the Blitz clock; the clock starts again, with its full time, when the sheet closes.
// An option is a card: its name, its quick choice (chips) or a one-line summary, and a chevron into the option's own page, where there is room to say what each choice
// means. Plain switches are rows. Back or Escape goes from a page to the list, and from the list to the exercise.

// what the symbols of each notation mean
const SYMS={
  codes:["Shorthand","Perdue's course book abbreviates the relations like this.",[["MI","mutually inclusive"],["MX","mutually exclusive"],["3P","three possibilities"],["4P","four possibilities"]]],
  sets:["Sets","Each term stands for the set of things it covers.",[["∩","intersection: what is both"],["∅","the empty set: nothing"],["≠ ∅","not empty"],["⊂","contained in"],["⊃","contains"],["=","the same set"]]],
  logic:["Logic","Each term stands for a statement: it is A, it is B.",[["⇒","follows: A ⇒ B, if A then B"],["⇐","follows from"],["⇔","each follows from the other"],["⇏","does not follow"],["¬","negation: not"]]]
};
const PAGES={nota:"Notation",wording:"Questions",times:"Blitz",defs:"Definitions",stages:"Stages",voice:"Voice"};
const store=(key,v)=>{ try{ localStorage.setItem(key,v); }catch(e){} };
function setNota(k){ state.nota=k; store("rd-notation",k); render(); }
export function setDefLang(k){ state.defLang=k==="enru"?"enru":"en"; store("rd-deflang",state.defLang); render(); }
function setShow(key,on){ if(key==="ab") state.showAB=on; else state.fullPh=on; store("rd-"+key,on?"1":"0"); render(); }
function setAutoExplain(on){ state.autoExplain=on; store("rd-autoexplain",on?"1":"0"); render(); }
function setWording(k){ state.wording=k; store("rd-wording",k); render(); }
function setFindSuggest(on){ state.findSuggest=on; store("rd-findsuggest",on?"1":"0"); render(); }
function setSyllogismWording(k){ state.syllogismWording=k; store("rd-syllogism-wording",k); render(); }
function setSyllogismGuide(on){ state.syllogismGuide=on; store("rd-syllogism-guide",on?"1":"0"); render(); }
// Blitz off takes the stopwatch away from the top bar, and a running countdown with it
function setBlitzUse(on){ state.blitzUse=on; store("rd-blitzuse",on?"1":"0"); if(!on) setBlitz(false); else render(); }

export function toggleSess(on){
  const was=state.sessOpen; state.sessOpen=on===undefined?!was:on;
  if(!state.sessOpen) state.sessPage=null;
  if(state.sessOpen&&!was) stopTimer();
  else if(!state.sessOpen&&was&&state.blitz&&asking()) startQ();
  render();
  if(state.sessOpen){ const b=document.querySelector("#over .oc"); if(b) /** @type {HTMLElement} */(b).focus({preventScroll:true}); }
  else { const b=$("msess"); if(b.offsetParent) b.focus({preventScroll:true}); }
}
function openPage(id){ state.sessPage=id; render(); const b=document.querySelector("#over .ob"); if(b) /** @type {HTMLElement} */(b).focus({preventScroll:true}); }
/** The Stages page of the practice options: where the stages are switched, and what an offer of another stage points to. */
export function openStageOptions(){ if(!state.sessOpen) toggleSess(true); openPage("stages"); }
/** The Blitz page of the practice options: what holding the stopwatch in the top bar opens. */
export function openBlitzOptions(){ if(!state.sessOpen) toggleSess(true); openPage("times"); }
/** Back or Escape in the options: from a page to the list, from the list to the exercise. */
export function sessBack(){
  if(state.sessPage){ state.sessPage=null; render(); const b=document.querySelector("#over .go2"); if(b) /** @type {HTMLElement} */(b).focus({preventScroll:true}); }
  else toggleSess(false);
}
// the sliders button in the top bar
export function syncSessBtn(){
  const b=$("msess"), ok=state.mode==="quiz"&&isEx();
  b.hidden=!ok; if(!ok) return;
  const t="Practice options";
  b.replaceChildren(tbIcon("sliders")); b.setAttribute("aria-label",t); b.title=t;
  b.setAttribute("aria-expanded",state.sessOpen?"true":"false"); b.classList.toggle("open",state.sessOpen);
}

const card=(title,quick,page)=>el("div",{class:"ocard"},
  el("div",{class:"om"},el("b",{text:title}),quick),
  el("button",{type:"button",class:"go2","aria-label":title+": details",title:"Details",onclick:()=>openPage(page)},tbIcon("chev")));
const group=t=>el("p",{class:"grp",text:t});
const sw=(label,word,on,toggle,note)=>el("div",{class:"orow"},switchOf(label,word,on,toggle),note?el("p",{class:"onote",text:note}):null);
const chips=(label,rows,cur,on)=>segOf(label,rows,cur,on);
const secs=kind=>Math.round(kindMs(kind)/1000);
// the stages that are on, in a line: runs joined ("Stages 1–3, 5")
const stagesLine=()=>{
  const runs=[]; for(const n of state.stages){ const r=runs[runs.length-1]; if(r&&r[1]===n-1) r[1]=n; else runs.push([n,n]); }
  return el("small",{class:"sum1",text:(state.stages.length===1?"Stage ":"Stages ")+runs.map(([a,b])=>a===b?a:a+"–"+b).join(", ")});
};
// the Blitz times in a line (the card says Off instead when Blitz is switched off)
const timesLine=()=>el("small",{class:"sum1",text:state.tab==="syllogism"?"Syllogism "+secs("syl")+" s":"Relation "+secs("rel")+" s · Example "+secs("ex")+" s"});

// one Blitz time: presets and a custom number of seconds; each sets only its own
function timeBlock(kind,label,note){
  const now=secs(kind), preset=[5,10,15,30].includes(now);
  const inp=el("input",{type:"number",min:"2",max:"120",inputmode:"numeric",class:"tcustom",placeholder:"sec","aria-label":"Custom "+label.toLowerCase()+" in seconds",value:preset?"":String(now)});
  let cancelled=false; // Escape drops what was typed: leaving the field must not store it
  inp.addEventListener("change",e=>{ if(cancelled) return; const v=Math.round(+/** @type {HTMLInputElement} */(e.target).value); if(v>=2&&v<=120) setTimer(v*1000,kind); else render(); });
  inp.addEventListener("keydown",e=>{ e.stopPropagation(); if(e.key==="Escape"){ cancelled=true; inp.value=preset?"":String(now); sessBack(); } });
  return row(label,el("div",{class:"tset"},segOf(label,[[5,"5 s"],[10,"10 s"],[15,"15 s"],[30,"30 s"]],preset?now:-1,s=>setTimer(s*1000,kind)),inp),note);
}
// a page's choices: one pressed, each with a word on what it does
const picks=(label,items,cur,on)=>el("div",{class:"picks",role:"group","aria-label":label},items.map(([k,name,desc,extra])=>
  el("button",{type:"button",class:"pick","aria-pressed":cur===k?"true":"false",onclick:()=>on(k)},
    el("span",{class:"t"},el("b",{text:name}),desc?el("small",{text:desc}):null,extra||null))));
const symbols=rows=>el("span",{class:"syms"},rows.map(([k,t])=>el("span",{class:"sy"},el("b",{class:"math",text:k}),t)));
// the first question of a wording, with the letters A and B, as an example of how it reads
const sample=w=>(w.lead?w.lead+" ":"")+w.q[1].map(x=>x===NOT?"not":x).join("");

function pageBody(id){
  if(id==="nota") return [el("p",{class:"capl",text:"How the relation between two terms is written, in the statements and in your answers."}),
    picks("Notation",Object.entries(SYMS).map(([k,[name,desc,rows]])=>[k,name,desc,symbols(rows)]),state.nota,setNota)];
  if(id==="wording") return [el("p",{class:"capl",text:"How the statement of pervasion is worded in Pervasions: the four statements you accept or answer with Why?."}),
    picks("Wording of the questions",Object.entries(WORDINGS).map(([k,w])=>[k,w.name,sample(w)]),state.wording,setWording)];
  if(id==="times") return [
    el("p",{class:"capl",text:state.tab==="syllogism"
      ?"Blitz is a countdown for the reply to each syllogism, switched on and off with the stopwatch in the top bar. When the time is up the reply counts as wrong and the result shows the right one; a right “there is no pervasion” goes straight to the result, with no counter-example. Hold the stopwatch to come back to this page."
      :"Blitz is a countdown for each step of a pair, switched on and off with the stopwatch in the top bar. Hold the stopwatch to come back to this page."}),
    sw("Use Blitz",state.blitzUse?"on":"off",state.blitzUse,()=>setBlitzUse(!state.blitzUse),"Off takes the stopwatch out of the top bar. The times stay as they are for when it is on again."),
    ...(!state.blitzUse?[]:state.tab==="syllogism"?[timeBlock("syl","Syllogism time","The Blitz countdown for the reply to each syllogism, in Syllogisms.")]
      :[timeBlock("rel","Relation time","The Blitz countdown for choosing the relation, in Relations and in Pervasions."),
        timeBlock("ex","Example time","The Blitz countdown for each example in Relations (a table of three cells gets three times this) and for each question in Pervasions.")])];
  if(id==="stages") return [el("p",{class:"capl",text:"Every exercise asks about the stages that are on, in any mix. A category opens at its stage and stays open above it, and the things come from the stages that are on. About half of the pairs are new at the highest stage, the rest review the ones below. Stage 1 is the start: Categories offers the next stage after five right in a row, and you can switch stages on and off here at any time. People and what does not exist meet the physical categories from stage 4. Examples that are relations or negations join from stage 7. A definition card shows examples of every stage, the plainest first."}),
    stageSwitches()];
  if(id==="voice") return [...voicePageBody(picks),
    el("p",{class:"capl"},"Voice itself is switched on and off in ",el("button",{type:"button",class:"lnk",onclick:()=>{ toggleSess(false); toggleOpts(true); }},"Settings"),".")];
  return [el("p",{class:"capl",text:"Shown when you open a term’s definition, in the Terms panel and in the tutor’s notes."}),
    picks("Languages of the definitions",[["en","English","The definition in English."],["enru","English + Russian","Each entry also shows the Russian name of the term and, where there is one, its Russian definition."]],state.defLang,setDefLang)];
}
// Categories has no pair, notation or Blitz, so it shows only what it uses
function categoriesBody(){
  return [
    row("Ask",chips("How step 1 asks",[["all","All at once"],["one","One by one"]],state.catsAsk,setCategoriesAsk),
      "All at once: the categories come together and you tick the ones the thing is in. One by one: a question for each category, answered with yes or no. It applies at once to a thing you have not started, and from the next one otherwise."),
    card("Stages",stagesLine(),"stages"),
    el("p",{class:"capl"},"The Magic Key, your account, data and the version are in ",el("button",{type:"button",class:"lnk",onclick:()=>{ toggleSess(false); toggleOpts(true); }},"Settings"),".")
  ];
}
// Syllogisms has no terms to read and no notation, so it shows only what it uses (and the tutor's switch, where the tutor can answer)
function syllogismBody(){
  return [
    row("Wording",chips("Wording of the syllogism",[["take","Take X"],["formal","Formal"]],state.syllogismWording,setSyllogismWording),
      "Take X: “Take a tomato. It follows it is food because it is red.” Formal: “It follows that the subject, a tomato, is food because of being red.”"),
    card("Stages",stagesLine(),"stages"),
    sw("Show the structure",state.syllogismGuide?"on":"off",state.syllogismGuide,()=>setSyllogismGuide(!state.syllogismGuide),
      "For when the structure is new: under the sentence, S is the subject, P the predicate and R the reason, and each reply says in them what it means."),
    card("Blitz",state.blitzUse?timesLine():el("small",{class:"sum1",text:"Off"}),"times"),
    ...(canAsk()?[group("AI tutor"),sw("Check every answer with AI",state.autoExplain?"on":"off",state.autoExplain,()=>setAutoExplain(!state.autoExplain),
      "Right after you check an answer, the AI tutor explains it. Off, the Explain button waits for you.")]:[]),
    el("p",{class:"capl"},"The Magic Key, your account, data and the version are in ",el("button",{type:"button",class:"lnk",onclick:()=>{ toggleSess(false); toggleOpts(true); }},"Settings"),".")
  ];
}
function listBody(){
  if(state.tab==="categories") return categoriesBody();
  if(state.tab==="syllogism") return syllogismBody();
  const perv=state.tab==="debate", find=state.tab==="find", timed=state.tab==="practice"||perv;
  // the Quorum row and the Share my examples row (Settings, options.js) each say what the server keeps; each says the other is separate
  const apart=state.learns?" The words of an example are kept, or not, as \u201cShare my examples\u201d in Settings says, with or without Quorum.":"";
  const quorumNote=state.quorumOptIn
    ?"Optional: a deeper check, but slower. When the page could not check an example you wrote, three AI models (Haiku, Sonnet and Opus) each work it out and Opus rules where they differ, so the explanation is more reliable. An answer takes about a minute instead of a few seconds, and it counts against a daily limit of its own; when that is used up, one model answers as usual. The server keeps each such run (the pair with what you wrote, and the answers), so the models can be compared. With Quorum off, one model answers and no run is kept."+apart
    :"For testing, on this test server only. With Quorum on, the explanation of an answer with an example the page could not check comes from Haiku, Sonnet and Opus, each on its own; where they put an example in different cells, Opus reads their answers and writes the one you see. The Quorum chip under a result shows all of them. The server keeps each run (the pair with what you wrote, and the answers), so the models can be compared. When the page checked every example itself, and with Quorum off, one model answers as in the app and no run is kept."+apart;
  const tutor=canAsk(), quorum=state.quorumOffered&&state.db;
  // what only this exercise has comes first, under its name; what every exercise has follows
  const own=[
    perv?card("Wording of the questions",chips("Wording of the questions",Object.entries(WORDINGS).map(([k,w])=>[k,w.name]),state.wording,setWording),"wording"):null,
    perv?sw("Full phrases","spell out Why? answers",state.fullPh,()=>setShow("full",!state.fullPh)):null,
    find?sw("Suggest terms",state.findSuggest?"on":"off",state.findSuggest,()=>setFindSuggest(!state.findSuggest),
      "While you name a pair, the field offers terms from the course as you type, so you can pick one. This is a gentle way in when the terms are new. Turn it off to type whatever comes to mind, without the list steering you; words that match a course term are still recognized."):null
  ].filter(Boolean);
  return [
    own.length?group(exName(state.tab)):null,
    ...own,
    own.length?group("Every exercise"):null,
    card("Notation",chips("Notation",Object.entries(SYMS).map(([k,v])=>[k,v[0]]),state.nota,setNota),"nota"),
    timed?card("Blitz",state.blitzUse?timesLine():el("small",{class:"sum1",text:"Off"}),"times"):null,
    sw("A/B markers","before the terms",state.showAB,()=>setShow("ab",!state.showAB)),
    card("Definitions",chips("Languages of the definitions",[["en","English"],["enru","English + Russian"]],state.defLang,setDefLang),"defs"),
    card("Stages",stagesLine(),"stages"),
    voiceShown()?group("Voice"):null,
    ...(voiceShown()?voiceListRows(sw,card,chips):[]),
    tutor||quorum?group("AI tutor"):null,
    tutor?sw("Check every answer with AI",state.autoExplain?"on":"off",state.autoExplain,()=>setAutoExplain(!state.autoExplain),
      "Right after you check an answer, the AI tutor explains it and checks the examples the page could not. Off, the Explain button waits for you."):null,
    quorum?sw("Several models explain",state.quorum?"on":"off",state.quorum,()=>setQuorum(!state.quorum),quorumNote):null,
    el("p",{class:"capl"},"The Magic Key, your account, data"+(tutor&&state.learns?", sharing your examples":"")+" and the version are in ",el("button",{type:"button",class:"lnk",onclick:()=>{ toggleSess(false); toggleOpts(true); }},"Settings"),".")
  ];
}
// the sheet: a scrim that closes it, and the panel
export function sessionInto(o){
  o.append(el("button",{type:"button",class:"scrim",tabindex:"-1","aria-label":"Close the practice options",onclick:()=>toggleSess(false)}));
  const page=state.sessPage&&PAGES[state.sessPage]&&(state.sessPage!=="voice"||voiceShown())?state.sessPage:null;
  const sheet=el("div",{class:"sheet"});
  sheet.append(el("div",{class:"shh"},
    page?el("button",{type:"button",class:"ob",onclick:sessBack,"aria-label":"Back to the options",title:"Back"},tbIcon("back")):null,
    el("div",{class:"ttl2"},el("h2",{text:page?PAGES[page]:"Practice options"}),page?el("small",{text:"Practice options"}):null),
    el("span",{class:"sp"}),
    el("button",{type:"button",class:"oc",onclick:()=>toggleSess(false),"aria-label":"Close the practice options",title:"Close"},tbIcon("close"))));
  sheet.append(el("div",{class:"opts",id:"opts"},...(page?pageBody(page):listBody()).filter(Boolean)));
  o.append(sheet);
}
