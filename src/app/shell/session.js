import { state } from "../state.js";
import { normLangs } from "../../domain/languages.ts";
import { asking, setBlitz, startQ, stopTimer } from "../debate/flow.js";
import { saveProgress } from "../practice/progress.ts";
import { render } from "./render.js";
import { keepOwn } from "../practice/per-exercise.ts";

/* ---------- the Practice options of an exercise: what they set and which sheet is open ---------- */
// What changes how an exercise looks, ticks or is checked (notation, wording of the questions, Blitz (on or off, and its times), A/B markers, full phrases, the language of the
// definitions, the tutor's check) opens from the sliders button at the top of the exercise (the sheet is drawn by path/options.tsx). Settings (options.js) keeps what belongs to the
// app, the device and the account. A setting is in one of the two, never both. Like Settings the sheet pauses the Blitz clock; the clock starts again, with its full time, when the sheet closes.

// what the symbols of each notation mean
export const SYMS={
  codes:["Shorthand","Perdue's course book abbreviates the relations like this.",[["MI","mutually inclusive"],["MX","mutually exclusive"],["3P","three possibilities"],["4P","four possibilities"]]],
  sets:["Sets","Each term stands for the set of things it covers.",[["∩","intersection: what is both"],["∅","the empty set: nothing"],["≠ ∅","not empty"],["⊂","contained in"],["⊃","contains"],["=","the same set"]]],
  logic:["Logic","Each term stands for a statement: it is A, it is B.",[["⇒","follows: A ⇒ B, if A then B"],["⇐","follows from"],["⇔","each follows from the other"],["⇏","does not follow"],["¬","negation: not"]]]
};
export const PAGES={nota:"Notation",wording:"Questions",times:"Blitz",defs:"Definitions",stages:"Stages",voice:"Voice",tutor:"Claude",progress:"Progression"};
const store=(key,v)=>{ try{ localStorage.setItem(key,v); }catch(e){} };
export function setNota(k){ state.nota=k; store("rd-notation",k); render(); }
export function setDefLang(k){ state.defLang=k==="enru"?"enru":"en"; store("rd-deflang",state.defLang); render(); }
/** Shows or hides a language beside the terms (Settings > Languages): Russian is the definitions' language, the others are names. */
export function setLang(id,on){
  if(id==="ru") return setDefLang(on?"enru":"en");
  state.langs=normLangs(on?[...state.langs,id]:state.langs.filter(x=>x!==id)); store("rd-langs",JSON.stringify(state.langs)); render();
}
export function setShow(key,on){ state.showAB=on; store("rd-"+key,on?"1":"0"); render(); }
export function setAutoExplain(on){ state.autoExplain=on; store("rd-autoexplain",on?"1":"0"); keepOwn("autoExplain",on); render(); }
export function setWording(k){ state.wording=k; store("rd-wording",k); render(); }
export function setNegation(k){ state.negation=k; store("rd-negation",k); saveProgress(); render(); }
export function setNegBrackets(on){ state.negBrackets=on; store("rd-neg-brackets",on?"1":"0"); render(); }
export function setSyllogismWording(k){ state.syllogismWording=k; store("rd-syllogism-wording",k); render(); }
// Blitz off takes the stopwatch away from the top bar, and a running countdown with it
export function setBlitzUse(on){ state.blitzUse=on; store("rd-blitzuse",on?"1":"0"); keepOwn("blitzUse",on); if(!on) setBlitz(false); else render(); }

export function toggleSess(on){
  const was=state.sessOpen; state.sessOpen=on===undefined?!was:on;
  if(!state.sessOpen){ state.sessPage=null; state.resetAsk=""; }
  if(state.sessOpen&&!was) stopTimer();
  else if(!state.sessOpen&&was&&state.blitz&&asking()) startQ();
  render();
}
export function openPage(id){ state.sessPage=id; state.resetAsk=""; render(); }
/** The Blitz page of the practice options: what holding the stopwatch in the top bar opens. */
export function openBlitzOptions(){ if(!state.sessOpen) toggleSess(true); openPage("times"); }
/** The Progression page, which the ring in the top bar opens (and closes, while it is open): a sheet of its own, with no list under it. */
export function openProgress(){ if(state.sessOpen&&state.sessPage==="progress"){ toggleSess(false); return; } if(!state.sessOpen) toggleSess(true); openPage("progress"); }
/** Back or Escape in the options: from a page to the list, from the list to the exercise; the Progression page has no list under it, it closes the sheet. */
export function sessBack(){
  if(state.sessPage==="progress") toggleSess(false);
  else if(state.sessPage){ state.sessPage=null; render(); }
  else toggleSess(false);
}
// the Quorum row and the Sharing examples row (Settings, options.js) each say what the server keeps; each says the other is separate
/** What the Quorum switch of the practice options says it does. */
export function quorumNote(){
  const apart=state.learns?" The words of an example are kept, or not, as \u201cSharing examples\u201d in Settings says, with or without Quorum.":"";
  return state.quorumOptIn
    ?"Optional: a deeper check, but slower. When the page could not check an example you wrote, three Claude models (Haiku, Sonnet and Opus) each work it out and Opus rules where they differ, so the explanation is more reliable. An answer takes about a minute instead of a few seconds, and it counts against a daily limit of its own; when that is used up, one model answers as usual. The server keeps each such run (the pair with what you wrote, and the answers), so the models can be compared. With Quorum off, one model answers and no run is kept."+apart
    :"For testing, on this test server only. With Quorum on, the explanation of an answer with an example the page could not check comes from Haiku, Sonnet and Opus, each on its own; where they put an example in different cells, Opus reads their answers and writes the one you see. The Quorum panel under a result shows all of them. The server keeps each run (the pair with what you wrote, and the answers), so the models can be compared. When the page checked every example itself, and with Quorum off, one model answers as in the app and no run is kept."+apart;
}
