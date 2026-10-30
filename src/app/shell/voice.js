import { state } from "../state.js";
import { $, el } from "../core/dom.js";
import { ORDER, REL } from "../core/rel.js";
import { chooseD, holdClock, releaseClock, sayQ, submitWhy } from "../debate/flow.js";
import { Wd, termSing } from "../debate/text.js";
import { check } from "../practice/grading.js";
import { choose, fillable } from "../practice/screen.js";
import { NOT } from "../../ai-shared/debate.ts";
import { plainWords, spokenConfirm, spokenDirection, spokenDontKnow, spokenExample, spokenRelation, spokenReply } from "../../domain/spoken.ts";
import { canHear, canSpeak, listen, onVoices, speak, stopSpeaking } from "../../ui/speech";
import { CELL_FULL, render } from "./render.js";
import { refreshPath } from "../path/index.tsx";
import { keepOwn } from "../practice/per-exercise.ts";

/* ---------- voice: the questions read aloud, answers by voice ---------- */
// One switch in Settings (the Voice row, on trial: the kill switch), and the choices in the Practice options of Relations and Pervasions, each on its own:
// Read aloud says each question when it appears; Answer by voice puts a microphone in the top bar of the exercise
// (tap it, or press V), or listens by itself after each question (Hands-free). A switch in the top bar, next to Blitz, pauses and resumes the reading
// for this visit. Both use the browser's own speech (src/ui/speech.ts). What was heard goes through the same steps as a tap or a typed answer
// (sayQ, choose, the cell's text), so the saved answers look as they always did; nothing of the voice is stored.
// What was heard is not applied at once: it waits on the screen it was said for, with what it was taken as, until it is
// confirmed (the Confirm button, Enter, or saying "yes"; or after a short pause, if Settings says so) or taken back (Change,
// Escape, "no"). Saying another answer replaces it. While it waits, and while a question is read, the Blitz clock is stopped
// (holdFor, letGo).
// The page renders as a whole, so this module works from what the screen asks: after each render it compares the
// screen with the one it last spoke for, and a new one stops whatever the old one started.

// what the current screen asks: {key, kind, say, cell?}, or null when it asks nothing that can be spoken or answered
const pairLine=p=>p.a+" and "+p.b+". ";
function questionLine(i){
  const w=Wd(), q=w.q[i].map(x=>x==="A"||x==="B"?termSing(x):x===NOT?"not":x).join("");
  return w.lead?w.lead.replace(/…$/,"")+" "+q[0].toLowerCase()+q.slice(1).replace(/\.$/,"?"):q;
}
const CELL_ASK={both:(A,B)=>"Name something that is both "+A+" and "+B+".",anb:(A,B)=>"Name something that is "+A+", but not "+B+".",
  bna:(A,B)=>"Name something that is "+B+", but not "+A+".",nei:(A,B)=>"Name something that is neither "+A+" nor "+B+"."};
export function asked(){
  const u=state.ui, p=state.cur&&state.cur.p;
  if(state.mode!=="quiz"||!u||!p||u.checked||state.optsOpen||state.sessOpen||state.skipAsk||state.menuOpen||state.view) return null;
  const id=p.id||p.a+"|"+p.b;
  if(u.debate){
    if(state.tab!=="debate") return null;
    if(u.step<4) return u.pickWhy?{key:id+"/q"+u.step+"/ex",kind:"example",say:"Posit a counter-example."}
      :{key:id+"/q"+u.step,kind:"reply",say:(u.step===0?pairLine(p):"")+questionLine(u.step)};
    return u.rel?null:{key:id+"/rel",kind:"relation",say:"Which relation do your answers give?"};
  }
  if(state.tab!=="practice") return null;
  if(!u.rel||u.open) return {key:id+"/rel",kind:"relation",say:pairLine(p)+"What is the relation?"};
  const order=fillable(), c=order[Math.max(0,Math.min(u.ci||0,order.length-1))];
  return {key:id+"/c/"+c,kind:"cell",cell:c,say:CELL_ASK[c](termSing("A"),termSing("B"))};
}
// Voice is a feature on trial: until its switch in Settings is on (on by default in a Preview, off in the real app; app.js), none of this does anything.
const enabled=()=>state.voice.on;
const reading=()=>enabled()&&state.voice.read&&!state.voice.muted&&canSpeak();
const hearing=()=>enabled()&&state.voice.answer!=="off"&&canHear();
const handsFree=()=>enabled()&&state.voice.answer==="auto"&&canHear();

// Called at the start of every render (shell/render.js), before the clocks and the top bar: a screen that is not the one voice spoke
// for lets go of what was held for it, so that this render starts the countdown of the screen it shows and draws its bar.
export function voiceBeforeRender(){
  if(!enabled()) return;
  const v=state.voice, a=asked();
  if((a?a.key:"")===v.key) return;
  quiet(); dropPend(); letGo(v.rhold?"fresh":"moved");
}
// The Blitz clock of the attempt on screen stands still while a question is read and while an answer waits. `how` is as in releaseClock.
function holdFor(){
  const v=state.voice, u=state.ui;
  if(!u||u.hold) return;
  holdClock();
  if(u.hold) v.clockUi=u;
}
function letGo(how){
  const v=state.voice, u=v.clockUi;
  v.clockUi=null; v.rhold=false;
  if(u) releaseClock(how,u);
}
// the reading of a question ends or is cut off: the time of the question starts now
function endReading(){
  if(!state.voice.rhold) return;
  letGo("fresh"); refreshPath();
}

// Called at the end of every render (shell/render.js).
export function voiceAfterRender(){
  if(!enabled()) return;
  const v=state.voice, a=asked(), key=a?a.key:"";
  if(key===v.key) return;
  v.key=key; quiet();
  // The first question the app shows is neither read nor listened to: people look around first, and start by tapping the
  // speaker or the microphone, or by answering or moving on by hand (any tap or key before this question counts).
  const opening=!!a&&!v.began&&!v.seen;
  if(a) v.seen=true;
  v.held=opening;
  v.note=""; v.bad=false; v.tries=0; v.blocked=false; v.ask3=false;
  if(opening) paint();
  else if(a&&reading()) say(a,a.say,true);
  else if(a&&handsFree()) hear(a);
  else paint();
}
// stop speaking and listening; a callback of what was stopped finds its token gone and does nothing
function quiet(){
  const v=state.voice, h=v.stop;
  v.tok=null; v.stop=null; v.live="";
  if(h) h.abort();
  if(v.phase==="speaking") stopSpeaking();
  v.phase="idle";
}
// `first`: the reading that comes with a new screen; the clock of its question stands still until the reading ends
function say(a,text,first){
  const v=state.voice, tok={};
  quiet(); endReading();
  v.tok=tok; v.phase="speaking"; v.blocked=false; v.held=false;
  // a question and the relation have a countdown of their own; the countdown of the examples covers all the cells of a pair
  if(first&&(a.kind==="reply"||(a.kind==="relation"&&!state.ui.rel))){ holdFor(); v.rhold=!!v.clockUi; }
  paint();
  speak(text,{voice:v.voiceId,rate:v.rate,done:(ok,err)=>{
    if(v.tok!==tok) return;
    v.tok=null; v.phase="idle";
    endReading();
    // Chrome speaks only after the person has tapped or typed on the page once; the speaker button is that tap
    if(!ok&&err==="not-allowed"){ v.blocked=true; paint(); return; }
    // after speaking, the audio output needs a moment before the microphone opens (the Voice lab's finding)
    if(handsFree()) setTimeout(()=>{ if(v.key===a.key&&v.phase==="idle"&&!v.tok) hear(a); },350);
    else paint();
  }});
}
function hear(a,keepNote){
  const v=state.voice, tok={};
  quiet(); endReading();
  v.tok=tok; v.phase="listening"; if(!keepNote){ v.note=""; v.bad=false; } v.held=false; paint();
  const h=listen({
    interim:t=>{ if(v.tok!==tok) return; v.live=t; paintLive(); },
    done:res=>{
      if(v.tok!==tok) return;
      v.tok=null; v.stop=null; v.phase="idle"; v.live="";
      if(v.key!==a.key) return;
      if("error" in res) missed(a,res.error); else take(a,res.alts);
    }});
  if(v.tok===tok) v.stop=h;
}
const MISS={"not-allowed":"The microphone is not allowed for this page. Allow it in the browser (the icon by the address), then tap the microphone.",
  "service-not-allowed":"The browser does not let this page use its speech service.","no-speech":"Nothing was heard.","audio-capture":"No microphone was found.",
  "network":"The speech service could not be reached (the browser sends the audio there to turn it into text).","no-audio":"The microphone did not start. Tap the microphone to try again.","aborted":"","unsupported":"This browser has no speech recognition."};
function missed(a,err){
  const v=state.voice;
  if(err==="no-speech"&&handsFree()&&v.tries<1){ v.tries++; hear(a); return; }
  v.note=MISS[err]!=null?MISS[err]:"Could not listen ("+err+").";
  v.bad=err!=="aborted"; paint();
}
// heard, but not an answer to this screen: say what would be, and in Hands-free listen again (twice at most).
// `ask`: the hint is a question the answer goes on from, not a correction.
function again(a,heard,hint,ask){
  const v=state.voice;
  if(v.pend) hint="Say “yes” to go on with "+v.pend.label+", or say the answer again.";
  v.note=ask?hint:"Heard “"+heard+"”. "+hint; v.bad=!ask;
  if(!handsFree()||v.tries>=2){ paint(); return; }
  v.tries++;
  if(reading()) say(a,hint); else hear(a);
}
const same=(x,y)=>plainWords(x)===plainWords(y);
const terms=()=>({a:state.cur.p.a,b:state.cur.p.b});
// what was heard, as the tap or the typed answer it stands for, once it is confirmed
function take(a,alts){
  const v=state.voice, w=Wd();
  if(spokenDontKnow(alts)) return nudge(a);
  if(v.pend){
    const yn=spokenConfirm(alts);
    if(yn==="yes") return confirm();
    if(yn==="no") return change();
  }
  if(a.kind==="reply"){
    const r=spokenReply(state,alts);
    if(!r) return again(a,alts[0],"Say “"+w.acc+"” or “"+w.why+"”.");
    const ex=r.say==="why"&&r.example?r.example.text:"";
    return offer(a,r.heard,(r.say==="accept"?w.acc:w.why)+(ex?" "+ex:""),()=>sayQ(r.say,{example:ex}));
  }
  if(a.kind==="example"){
    const r=spokenReply(state,alts);
    // changed their mind: back from Why? and accept (as Back, then Accept, without showing the question again in between)
    if(r&&r.say==="accept"&&!r.example) return offer(a,r.heard,w.acc,()=>{ const u=state.ui; u.ans[u.step].say=null; u.pickWhy=false; u.exText=""; sayQ("accept",{}); });
    const x=r&&r.say==="why"&&r.example?r.example:spokenExample(state,alts);   // "why, a gold ring" said again is the example too
    if(!x||x.none) return again(a,alts[0],"Name the counter-example, or say “"+w.acc+"”.");
    return offer(a,x.heard,x.text,()=>{ state.ui.exText=x.text; submitWhy(); });
  }
  if(a.kind==="relation"){
    const t=terms(), order=/** @type {import("../../ai-shared/relations.ts").RelKey[]} */(ORDER);
    const k=(v.ask3&&spokenDirection(alts,t))||spokenRelation(alts,order,t);
    if(k==="3"){ if(v.pend){ dropPend(); letGo("resume"); refreshPath(); } v.ask3=true; return again(a,alts[0],"Three possibilities: which is inside the other, "+t.a+" or "+t.b+"?",true); }
    if(!k) return again(a,alts[0],v.ask3?"Say which is inside the other, "+t.a+" or "+t.b+".":"Say the relation, such as “four possibilities”, or what is written under it.");
    v.ask3=false;
    return offer(a,alts[0],REL[k].name,()=>{ if(state.ui.debate) chooseD(k); else choose(k,true); });
  }
  const x=spokenExample(state,alts);
  if(!x) return again(a,alts[0],a.cell==="nei"?"Say an example, or “nothing”.":"Say an example.");
  if(x.none&&a.cell!=="nei") return again(a,alts[0],"The relation you chose needs an example here: only the neither case can be empty.");
  offer(a,x.heard,x.none?"nothing":x.text,()=>{
    const u=state.ui; u.cells[a.cell].t=x.none?"":x.text;
    const order=fillable(), i=order.indexOf(a.cell);
    if(i>=order.length-1){ if(document.activeElement instanceof HTMLElement) document.activeElement.blur(); check(); }
    else { u.ci=i+1; render(); }
  });
}

// "I don't know": no answer is taken; a friendly word instead (said too, with Read aloud), and the person tries again
const NUDGE="It's okay not to know. Make a guess, then learn from the review. Mistakes are how we learn.";
function nudge(a){
  const v=state.voice;
  v.note=NUDGE; v.bad=false; v.tries=0;
  if(reading()) say(a,NUDGE); else if(handsFree()) hear(a,true); else paint();   // Hands-free listens for the next guess, with the word still on the screen
}

/* ---------- an answer that waits for its confirmation ---------- */
// After a short pause the answer goes on by itself, if Settings says so: 2 s in Blitz, 4 s otherwise, so that the practice without
// a clock is not hurried. The Blitz clock is stopped while the answer waits (holdFor), so neither the pause nor the Confirm
// counts against the time.
const PAUSE_BLITZ=2000, PAUSE_CALM=4000;
function offer(a,heard,label,apply){
  const v=state.voice;
  dropPend(); holdFor();
  v.note=""; v.bad=false; v.tries=0;
  const h=String(heard).trim().replace(/[.!]+$/,"");
  const p=v.pend={key:a.key,said:same(h,label)?"Heard":"Heard “"+h+"”, taken as",label,apply,auto:null};
  if(v.confirm==="auto"){ const ms=state.blitz?PAUSE_BLITZ:PAUSE_CALM; p.auto={ms,t0:performance.now(),tid:setTimeout(()=>{ if(v.pend===p) confirm(); },ms)}; }
  paint();
  if(!p.auto&&handsFree()) hear(a);     // listens for "yes", "no" or another answer
}
function dropPend(){
  const v=state.voice, p=v.pend;
  if(!p) return;
  if(p.auto) clearTimeout(p.auto.tid);
  v.pend=null;
}
function confirm(){
  const v=state.voice, p=v.pend, a=asked();
  if(!p) return;
  dropPend(); quiet();
  if(!a||a.key!==p.key){ letGo("moved"); return; }
  letGo("resume");
  p.apply();
}
// take the answer back: the clock goes on, and the person says it again (the microphone opens by itself)
function change(){
  const v=state.voice, a=asked();
  if(!v.pend) return;
  dropPend(); quiet(); letGo("resume"); refreshPath();
  v.note=""; v.bad=false;
  if(a&&hearing()) hear(a); else paint();
}

/* ---------- the microphone in the top bar, and under the answer controls what was heard ---------- */
// The microphone is a button of the Path's top bar (path/shell.tsx): a plain icon, lit and pulsing while it listens. What it would take is in its tooltip.
// Under the answer controls of a screen that asks something is the voice bar, which has something in it only while there is something to say: what is
// heard as it is said, a miss, an answer that waits for Confirm, or, when the first question was held back or the browser wants a tap, the way to hear it.
const HINT={reply:()=>"Say “"+Wd().acc+"” or “"+Wd().why+"”. After “"+Wd().why+"”, the counter-example.",example:()=>"Say the counter-example.",
  relation:()=>"Say the relation, such as “four possibilities”, or what is written under it.",cell:a=>CELL_FULL[a.cell]+": say an example, or “nothing”."};
function statusText(a){
  const v=state.voice;
  if(v.phase==="listening") return v.live?"“"+v.live+"”":v.note||"Listening…";
  if(v.blocked) return "The browser reads aloud only after a tap on the page.";
  if(v.held&&!v.pend&&handsFree()&&!reading()) return "Tap the microphone to start answering.";
  if(v.pend) return v.note;
  return v.note;
}
// the first question is held back, or the browser wants a tap before it speaks: a button to read the question
const needsTap=()=>{ const v=state.voice; return !v.pend&&v.phase!=="listening"&&(v.blocked||(v.held&&reading())); };
// the answer that waits: what was heard and what it was taken as, then Confirm (or the running bar of the pause) and Change
function pendNode(){
  const p=state.voice.pend;
  if(!p) return null;
  const bar=p.auto?el("span",{class:"vrun","aria-hidden":"true",style:"--d:"+p.auto.ms+"ms;--e:"+Math.max(0,Math.round(performance.now()-p.auto.t0))+"ms"},el("i")):null;
  return el("div",{class:"vtake",role:"group","aria-label":"Check what was heard"},
    el("div",{class:"vwhat",role:"status","aria-live":"polite"},el("small",{text:p.said}),el("b",{text:p.label})),
    bar||el("button",{type:"button",class:"btn vok",title:"Confirm (Enter)",onclick:confirm,text:"Confirm"}),
    el("button",{type:"button",class:"btn ghost vno",title:"Change it (Escape)",onclick:change,text:"Change"}));
}
export function voiceBar(){
  const v=state.voice, a=asked();
  if(!a||(!reading()&&!hearing())) return null;
  const text=statusText(a), tap=needsTap(), pend=pendNode();
  return el("div",{class:"vbar",id:"vbar",hidden:!(text||tap||pend)},
    text||tap?el("div",{class:"vrow"},
      el("span",{class:"vst"+(v.bad?" bad":""),id:"vlive",role:"status","aria-live":"polite",text}),
      tap?el("button",{type:"button",class:"btn ghost vhear",onclick:()=>say(a,a.say,v.held),text:"Hear the question"}):null):null,
    pend);
}
/** The Path draws its own microphone (in its top bar) where this says so: the screen asks something and Answer by voice is on. */
export const micShown=()=>!!asked()&&hearing();
function micState(b,a){
  const on=state.voice.phase==="listening";
  b.classList.toggle("on",on); b.setAttribute("aria-pressed",on?"true":"false");
  b.setAttribute("aria-label","Answer by voice"); b.title=on?"Stop listening (V)":"Answer by voice (V). "+HINT[a.kind](a);
}
// the bar and the microphone again, in place, without rendering the screen (which would rebuild the fields and move the focus)
function paint(){
  const a=asked(), mic=$("vmic"), old=$("vbar");
  if(mic&&a) micState(mic,a);
  if(!old) return;
  const had=old.contains(document.activeElement)||document.activeElement===mic, nb=voiceBar();
  if(!nb){ old.remove(); return; }
  old.replaceWith(nb);
  // focus goes to Confirm, so that Enter confirms (a focused button would otherwise take the Enter for itself); with the pause
  // running it goes nowhere, and Enter and Escape reach the page
  if(had){ const b=state.voice.pend?nb.querySelector(".vok"):nb.querySelector("button"); if(b) b.focus({preventScroll:true}); }
}
function paintLive(){ const s=$("vlive"), a=asked(); if(s&&a) s.textContent=statusText(a); }
export function toggleListen(){
  const v=state.voice, a=asked();
  if(!a||!hearing()) return false;
  if(v.phase==="listening"&&v.stop) v.stop.stop(); else hear(a);
  return true;
}
// the keys: V listens (or stops), R reads the question again; Enter confirms the answer that waits and Escape changes it. True when the key was taken
export function voiceKey(k){
  const a=asked(); if(!a) return false;
  if(state.voice.pend){
    if(k==="Enter"){ confirm(); return true; }
    if(k==="Escape"){ change(); return true; }
  }
  if(k==="v") return toggleListen();
  if(k==="r"&&reading()){ say(a,a.say,state.voice.held); return true; }
  return false;
}
for(const t of ["pointerdown","keydown"]) document.addEventListener(t,()=>{ state.voice.began=true; },{capture:true,once:true});
document.addEventListener("visibilitychange",()=>{ if(document.hidden&&enabled()){ quiet(); endReading(); paint(); } });

/* ---------- the switch in the top bar: pausing the reading ---------- */
// Next to the Blitz switch while Voice is on and Read aloud is chosen: pauses the reading and resumes it, without opening the options. It is for this visit
// only (Read aloud itself is kept in the Practice options). Pausing cuts off what is being read; resuming reads the question on the screen.
/** The Read aloud switch of the top bar is there: Voice is on, Read aloud is chosen and the device can speak, in Relations or Pervasions. */
export const readShown=()=>enabled()&&state.voice.read&&canSpeak()&&state.mode==="quiz"&&(state.tab==="practice"||state.tab==="debate");
export function toggleReadAloud(){
  const v=state.voice, speaking=v.phase==="speaking";
  v.muted=!v.muted;
  if(v.muted&&speaking){ quiet(); endReading(); }
  render();    // the top bar's switch, and the bar under the answers (which Read aloud alone may have been showing)
  const a=asked();
  if(!a) return;
  if(!v.muted&&reading()) say(a,a.say,v.held);
  else if(v.muted&&speaking&&handsFree()) hear(a);      // the reading was only the way to the answer
}

/* ---------- the Voice row of Settings, and the choices in the Practice options (drawn by the Path: path/settings.tsx, path/options.tsx) ---------- */
export const SAMPLE="Do you accept that if it is a product, it follows it is a functional thing?";
export const RATES=[[0.85,"Slow"],[1,"Normal"],[1.25,"Fast"]];
const KEYS={read:"rd-voice-read",answer:"rd-voice-answer",confirm:"rd-voice-confirm",voiceId:"rd-voice-name",rate:"rd-voice-rate"};
export function setVoice(k,val){
  const v=state.voice;
  v[k]=val;
  if(k==="read"&&val) v.muted=false;
  try{ localStorage.setItem(KEYS[k],k==="read"?(val?"1":"0"):String(val)); }catch(e){}
  if(k==="read"||k==="answer") keepOwn(k,val);   // each exercise keeps its own (practice/per-exercise.ts)
  render();
  if((k==="read"&&val)||k==="voiceId"||k==="rate") speak(SAMPLE,{voice:v.voiceId,rate:v.rate});
}
// The Voice switch is the kill switch of the feature: the choice is kept on the device, whatever the default of the build was
export function setOn(on){
  const v=state.voice;
  v.on=on; try{ localStorage.setItem("rd-voice",on?"1":"0"); }catch(e){}
  if(!on){ quiet(); dropPend(); letGo("moved"); v.key=""; v.muted=false; }
  render();
}
/** What the Voice switch of Settings does (the Path draws the same row). */
export const voiceNote=()=>"Reads the questions aloud and lets you answer by voice, with your browser\u2019s own speech. "+(canHear()?"In Chrome, what you say is sent to Google to be turned into text. ":"")+"Once it is on, its choices are in the Practice options of Relations and Pervasions.";
/** Whether this browser has any speech, so that Settings has a Voice row; and whether Voice is on. */
export const voiceAvailable=()=>canSpeak()||canHear();
export const voiceOn=()=>enabled();
/** The voices by accent, American and British first. */
export function voiceGroups(list){
  const groups=[];
  for(const x of list){ let g=groups.find(y=>y.accent===x.accent); if(!g) groups.push(g={accent:x.accent,voices:[]}); g.voices.push(x); }
  const first=g=>g.accent==="American"?0:g.accent==="British"?1:2;
  return groups.sort((x,y)=>first(x)-first(y));
}
// where what is said goes: the browser's recognizer is not the app's
export const WHERE="In Chrome, what you say is sent to Google to be turned into text (other browsers use their own service). The app records nothing.";
/** Whether the Practice options have a Voice section: Voice is on, the browser has some speech, and the exercise is one that reads and listens. */
export const voiceShown=()=>enabled()&&(canSpeak()||canHear())&&(state.tab==="practice"||state.tab==="debate");
/** The Voice page draws again when the device's voices arrive (they come late in some browsers). */
export function hookVoices(){ const v=state.voice; if(!v.hooked){ v.hooked=true; onVoices(()=>{ if(state.sessOpen&&state.sessPage==="voice") render(); }); } }
// the Voice page's words
export const VOICE_LEAD="Read aloud says each question when it appears, and Answer by voice puts a microphone in the middle of the bar at the foot of the exercise. Both use your device\u2019s own speech, so the voices, and how well it hears you, depend on the device and the browser.";
export const READ_NOTE="The switch at the top of the exercise, next to Blitz, pauses and resumes it.";
export const ANSWER_PICKS=[["off","Off","No microphone."],
  ["tap","Tap the mic","Tap the microphone (or press V), then say the answer."],
  ["auto","Hands-free","Listens by itself after each question is read, and again for \u201cyes\u201d or another answer."]];
export const CONFIRM_PICKS=[["tap","Wait for Confirm","Confirm with the button, Enter or \u201cyes\u201d; Change takes it back (Escape or \u201cno\u201d)."],
  ["auto","Go on by itself","Goes on after 2 seconds in Blitz and 4 otherwise; Change stops it."]];
export const VOICE_SAY="Say Accept or Why? (with the example), the relation by name or as it is written under the option, or an example; \u201cnothing\u201d leaves a cell empty. "+
  "The Blitz clock stops while a question is read and while an answer waits. Chrome sends the audio to Google to turn it into text; the app records nothing and keeps only the answer, as if typed.";
