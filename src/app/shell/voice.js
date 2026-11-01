import { state } from "../state.js";
import { $, el } from "../core/dom.js";
import { ORDER, REL } from "../core/rel.js";
import { chooseD, holdClock, releaseClock, sayQ, submitWhy, undoQ } from "../debate/flow.js";
import { Wd, termSing } from "../debate/text.js";
import { check } from "../practice/grading.js";
import { choose, fillable, missedCase, relRestore, relSnapshot } from "../practice/screen.js";
import { NOT } from "../../ai-shared/debate.ts";
import { plainWords, spokenConfirm, spokenDirection, spokenDontKnow, spokenExample, spokenRelation, spokenReply } from "../../domain/spoken.ts";
import { canHear, canSpeak, listen, listenHeld, onVoices, speak, stopSpeaking } from "../../ui/speech";
import { CELL_FULL, render } from "./render.js";
import { refreshPath } from "../path/index.tsx";
import { iconSvg } from "../path/ui.tsx";
import { keepOwn } from "../practice/per-exercise.ts";

/* ---------- voice: the questions read aloud, answers by voice ---------- */
// One switch in Settings (the Voice row, on trial: the kill switch), and the choices on the first page of the Practice options of Relations and Pervasions,
// each on its own: Read aloud says each question when it appears; Answer by voice puts a microphone at the foot of the exercise (tap it, or hold it and talk;
// V on a keyboard), or listens by itself after each question (Hands-free). A speaker beside the microphone says the question again (hold it to pause the reading
// for this visit). Both use the browser's own speech (src/ui/speech.ts). What was heard goes through the same steps as a tap or a typed answer
// (sayQ, choose, the cell's text), so the saved answers look as they always did; nothing of the voice is stored.
// What was heard is not applied at once: it waits on the screen it was said for, with what it was taken as, until it is
// confirmed (Yes, Enter, or saying "yes"; or after a short bar, in Hands-free or when Settings says so) or taken back (Change,
// Escape, "no"). Saying another answer replaces it. Once it has gone on, the step it took stays above the foot for a few seconds as a chip with Change,
// which puts the screen back as it was. While an answer waits, and while a question is read, the Sprint clock is stopped (holdFor, letGo).
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
  const v=state.voice, a=asked(), key=a?a.key:"";
  if(key===v.key) return;
  if(v.chip&&key!==v.chip.next) dropChip();       // the step it took is behind: only the last one can be taken back
  quiet(); dropPend(); letGo(v.rhold?"fresh":"moved");
}
// The Sprint clock of the attempt on screen stands still while a question is read and while an answer waits. `how` is as in releaseClock.
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
  const opening=!!a&&!v.began&&!v.seen, back=v.noRead;
  v.noRead=false;
  if(a) v.seen=true;
  v.held=opening;
  v.note=""; v.bad=false; v.tries=0; v.blocked=false; v.ask3=false;
  if(opening) paint();
  else if(a&&back&&hearing()) hear(a);            // a step taken back: the question is not read again, the microphone opens at once
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
    // Chrome speaks only after the person has tapped or typed on the page once; the speaker is that tap
    if(!ok&&err==="not-allowed"){ v.blocked=true; paint(); return; }
    // after speaking, the audio output needs a moment before the microphone opens (the Voice lab's finding)
    if(handsFree()) setTimeout(()=>{ if(v.key===a.key&&v.phase==="idle"&&!v.tok) hear(a); },350);
    else paint();
  }});
}
// `held`: the microphone was pressed and may still be held down: it listens while it is held (src/ui/speech.ts, listenHeld), and a tap lets go of it to listen until a pause
function hear(a,keepNote,held){
  const v=state.voice, tok={};
  quiet(); endReading(); freezePend();
  v.tok=tok; v.phase="listening"; if(!keepNote){ v.note=""; v.bad=false; } v.held=false; paint();
  const opts={
    interim:t=>{ if(v.tok!==tok) return; v.live=t; paintLive(); },
    done:res=>{
      if(v.tok!==tok) return;
      v.tok=null; v.stop=null; v.phase="idle"; v.live="";
      if(v.key!==a.key) return;
      if("error" in res) missed(a,res.error); else take(a,res.alts);
    }};
  const h=held?listenHeld(opts):listen(opts);
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
// what was heard, as the tap or the typed answer it stands for, once it is confirmed. What `apply` returns, if it returns anything, takes the step back (the chip's Change)
function take(a,alts){
  const v=state.voice, w=Wd();
  if(spokenDontKnow(alts)) return nudge(a);
  const yn=v.pend||v.chip?spokenConfirm(alts):null;
  if(v.pend){
    if(yn==="yes") return confirm();
    if(yn==="no") return change();
  } else if(v.chip&&yn==="no") return undoTaken();      // after it went on: "no" or "back" takes the last step back
  if(a.kind==="reply"){
    const r=spokenReply(state,alts);
    if(!r) return again(a,alts[0],"Say “"+w.acc+"” or “"+w.why+"”.");
    const ex=r.say==="why"&&r.example?r.example.text:"", i=state.ui.step;
    return offer(a,r.heard,(r.say==="accept"?w.acc:w.why)+(ex?" "+ex:""),()=>{ sayQ(r.say,{example:ex}); return ()=>undoQ(i); });
  }
  if(a.kind==="example"){
    const r=spokenReply(state,alts), i=state.ui.step;
    // changed their mind: back from Why? and accept (as Back, then Accept, without showing the question again in between)
    if(r&&r.say==="accept"&&!r.example) return offer(a,r.heard,w.acc,()=>{ const u=state.ui; u.ans[u.step].say=null; u.pickWhy=false; u.exText=""; sayQ("accept",{}); return ()=>undoQ(i); });
    const x=r&&r.say==="why"&&r.example?r.example:spokenExample(state,alts);   // "why, a gold ring" said again is the example too
    if(!x||x.none) return again(a,alts[0],"Name the counter-example, or say “"+w.acc+"”.");
    return offer(a,x.heard,x.text,()=>{ state.ui.exText=x.text; submitWhy(); return ()=>undoQ(i); });
  }
  if(a.kind==="relation"){
    const t=terms(), order=/** @type {import("../../ai-shared/relations.ts").RelKey[]} */(ORDER);
    const k=(v.ask3&&spokenDirection(alts,t))||spokenRelation(alts,order,t);
    if(k==="3"){ if(v.pend){ dropPend(); letGo("resume"); refreshPath(); } v.ask3=true; return again(a,alts[0],"Three possibilities: which is inside the other, "+t.a+" or "+t.b+"?",true); }
    if(!k) return again(a,alts[0],v.ask3?"Say which is inside the other, "+t.a+" or "+t.b+".":"Say the relation, such as “four possibilities”, or what is written under it.");
    v.ask3=false;
    // Pervasions: the relation checks the pair, so it cannot be taken back; Relations: the relation list opens again
    return offer(a,alts[0],REL[k].name,()=>{ if(state.ui.debate){ chooseD(k); return; } const s=relSnapshot(); choose(k,true); return ()=>relRestore(s); });
  }
  const x=spokenExample(state,alts);
  if(!x) return again(a,alts[0],a.cell==="nei"?"Say an example, or “nothing”.":"Say an example.");
  if(x.none&&a.cell!=="nei") return again(a,alts[0],"The relation you chose needs an example here: only the neither case can be empty.");
  offer(a,x.heard,x.none?"nothing":x.text,()=>{
    const u=state.ui, s=relSnapshot(); u.cells[a.cell].t=x.none?"":x.text;
    const order=fillable(); let i=order.indexOf(a.cell);
    while(i<order.length-1&&missedCase(order[i+1])) i++;         // a case whose time ran out is not asked again
    if(i>=order.length-1){ if(document.activeElement instanceof HTMLElement) document.activeElement.blur(); check(); return; }     // the last case checks the pair
    u.ci=i+1; render();
    return ()=>relRestore(s);
  });
}

// "I don't know": no answer is taken; a friendly word instead (said too, with Read aloud), and the person tries again
const NUDGE="It's okay not to know. Make a guess, then learn from the review. Mistakes are how we learn.";
function nudge(a){
  const v=state.voice;
  v.note=NUDGE; v.bad=false; v.tries=0;
  if(reading()) say(a,NUDGE); else if(handsFree()) hear(a,true); else paint();   // Hands-free listens for the next guess, with the word still on the screen
}

/* ---------- an answer that waits for its confirmation, and the chip that stays after it went on ---------- */
// The answer goes on by itself after a short bar, when the mode is Hands-free (the default, "split") or Settings says so: 1.5 s, and 1 s in Sprint. Where the microphone is tapped
// (or held) the person is looking at the screen, and it waits for Yes. The Sprint clock is stopped while the answer waits (holdFor), so neither the bar nor Yes counts against
// the time. After it went on the step stays above the foot for a few seconds as a chip with Change: the screen it came from, with the answer cleared, and the microphone open.
const PAUSE_BLITZ=1000, PAUSE_CALM=1500, CHIP_MS=6000;
const autoOn=()=>{ const c=state.voice.confirm; return c==="auto"||(c==="split"&&handsFree()); };
function offer(a,heard,label,apply){
  const v=state.voice;
  dropPend(); dropChip(); holdFor();
  v.note=""; v.bad=false; v.tries=0;
  const h=String(heard).trim().replace(/[.!]+$/,"");
  const p=v.pend={key:a.key,said:same(h,label)?"Heard":"Heard “"+h+"”, taken as",label,apply,auto:null};
  if(autoOn()){ const ms=state.blitz?PAUSE_BLITZ:PAUSE_CALM; p.auto={ms,t0:performance.now(),tid:setTimeout(()=>{ if(v.pend===p) confirm(); },ms)}; }
  paint();
  if(!p.auto&&handsFree()) hear(a);     // listens for "yes", "no" or another answer
}
function dropPend(){
  const v=state.voice, p=v.pend;
  if(!p) return;
  if(p.auto) clearTimeout(p.auto.tid);
  v.pend=null;
}
// the microphone is pressed while the bar runs: it stops, and the answer waits for Yes (or is replaced by what is said now)
function freezePend(){
  const p=state.voice.pend;
  if(!p||!p.auto) return;
  clearTimeout(p.auto.tid); p.auto=null;
}
function confirm(){
  const v=state.voice, p=v.pend, a=asked();
  if(!p) return;
  dropPend(); quiet();
  if(!a||a.key!==p.key){ letGo("moved"); return; }
  letGo("resume");
  const undo=p.apply();
  if(typeof undo==="function") showChip(p,undo);
}
// take the answer back: the clock goes on, and the person says it again (the microphone opens by itself)
function change(){
  const v=state.voice, a=asked();
  if(!v.pend) return;
  dropPend(); quiet(); letGo("resume"); refreshPath();
  v.note=""; v.bad=false;
  if(a&&hearing()) hear(a); else paint();
}
function showChip(p,undo){
  const v=state.voice, a=asked();
  dropChip();
  if(!a) return;
  const c=v.chip={label:p.label,from:p.key,next:a.key,t0:performance.now(),undo,tid:null};
  c.tid=setTimeout(()=>{ if(v.chip===c){ v.chip=null; paint(); } },CHIP_MS);
  paint();
}
function dropChip(){
  const v=state.voice, c=v.chip;
  if(!c) return;
  clearTimeout(c.tid); v.chip=null;
}
// the chip's Change, or "no" after it went on: the screen it came from comes back as it was, and the microphone opens without the question being read again
function undoTaken(){
  const v=state.voice, c=v.chip;
  if(!c) return;
  dropChip(); quiet(); letGo("moved");
  v.noRead=true; c.undo(); v.noRead=false;
  paint();
}

/* ---------- the microphone and the speaker at the foot, and above them what was heard ---------- */
// The microphone is a diamond at the right of the foot (path/shell.tsx draws the dock; this module builds it and repaints it in place), lit and swelling while it listens. One control for two ways
// of talking: a tap listens until a pause; pressing and holding for longer than HOLD_MS listens while it is held and sends the moment it is let go. The speaker beside it says the question
// again (tap), stops the reading (tap while it reads) or pauses it for this visit (hold). Above them is the voice bar, which has something in it only while there is something to say: what is
// heard as it is said, a miss, an answer that waits for Yes, the chip of the step that went on, or a line on what the microphone does.
const HOLD_MS=350, MUTE_MS=500;
const HINT={reply:()=>"Say “"+Wd().acc+"” or “"+Wd().why+"”. After “"+Wd().why+"”, the counter-example.",example:()=>"Say the counter-example.",
  relation:()=>"Say the relation, such as “four possibilities”, or what is written under it.",cell:a=>CELL_FULL[a.cell]+": say an example, or “nothing”."};
function statusText(){
  const v=state.voice;
  if(v.phase==="listening") return v.live?"“"+v.live+"”":v.note||(v.hold?"Listening… let go to send":"Listening…");
  if(v.blocked) return "The browser reads aloud only after a tap on the page. Tap the speaker.";
  if(v.note) return v.note;
  if(v.pend||v.chip) return "";
  if(v.held&&reading()) return "Tap the speaker to hear the question"+(hearing()?", or the microphone to answer.":".");
  if(v.held&&handsFree()) return "Tap the microphone to start answering.";
  if(!v.tried&&hearing()) return "Tap the microphone and answer, or hold it and talk.";
  return "";
}
// the answer that waits: what was heard and what it was taken as, then Yes (or the running bar of the pause) and Change
function pendNode(){
  const p=state.voice.pend;
  if(!p) return null;
  const go=p.auto?el("button",{type:"button",class:"vrun",title:"Go on now (Enter)","aria-label":"Going on. Tap to go on now",onclick:confirm,
      style:"--d:"+p.auto.ms+"ms;--e:"+Math.max(0,Math.round(performance.now()-p.auto.t0))+"ms"},el("i",{"aria-hidden":"true"}),el("span",{text:"Going on"}))
    :el("button",{type:"button",class:"btn vok",title:"Yes (Enter)",onclick:confirm,text:"Yes"});
  return el("div",{class:"vtake",role:"group","aria-label":"Check what was heard"},
    el("div",{class:"vwhat",role:"status","aria-live":"polite"},el("small",{text:p.said}),el("b",{text:p.label})),
    el("div",{class:"vbtns"},el("button",{type:"button",class:"btn ghost vno",title:"Change it (Escape)",onclick:change,text:"Change"}),go));
}
// the step that went on, for a few seconds: what it was taken as, and Change
function chipNode(){
  const c=state.voice.chip;
  if(!c) return null;
  return el("div",{class:"vchip",role:"group","aria-label":"What was taken"},
    el("span",{class:"vcl"},el("small",{text:"Taken"}),el("b",{text:c.label})),
    el("button",{type:"button",class:"btn ghost vchg",title:"Change it (Escape, or say “no”)",onclick:undoTaken,text:"Change"}),
    el("i",{class:"vcrun","aria-hidden":"true",style:"--d:"+CHIP_MS+"ms;--e:"+Math.max(0,Math.round(performance.now()-c.t0))+"ms"}));
}
// what is heard as it is said is written large, as an answer is; a miss is red
const stClass=()=>{ const v=state.voice; return "vst"+(v.bad?" bad":"")+(v.phase==="listening"&&v.live?" live":""); };
export function voiceBar(){
  if(!readShown()&&!micShown()) return null;
  const text=statusText(), pend=pendNode(), chip=pend?null:chipNode();
  return el("div",{class:"vbar",id:"vbar",hidden:!(text||pend||chip)},
    chip,
    text?el("div",{class:"vrow"},el("span",{class:stClass(),id:"vlive",role:"status","aria-live":"polite",text})):null,
    pend);
}
/** The speaker is at the foot: Read aloud is chosen and the device can speak, on a screen that asks something. */
export const readShown=()=>!!asked()&&enabled()&&state.voice.read&&canSpeak();
/** The microphone is at the foot: Answer by voice is on, on a screen that asks something. */
export const micShown=()=>!!asked()&&hearing();
function micState(b){
  const v=state.voice, on=v.phase==="listening", a=asked();
  b.classList.toggle("on",on); b.classList.toggle("hold",v.hold); b.setAttribute("aria-pressed",on?"true":"false");
  b.title=on?"Stop listening (V)":"Tap, or hold to talk (V). "+(a?HINT[a.kind](a):"");
}
function earState(b){
  const v=state.voice, speaking=v.phase==="speaking", ic=v.muted?"speakoff":"speak";
  b.classList.toggle("off",v.muted); b.classList.toggle("on",speaking);
  b.setAttribute("aria-label",v.muted?"Reading is paused. Tap to hear the question":speaking?"Stop reading":"Hear the question again");
  b.title=v.muted?"Reading is paused for this visit. Tap to hear the question (R)":speaking?"Stop reading (R)":"Hear the question again (R). Hold to pause the reading for this visit.";
  if(b.dataset.ic!==ic){ b.dataset.ic=ic; b.replaceChildren(iconSvg(ic)); }
}
/** What the Path draws at the foot (path/shell.tsx, Foot): the speaker and the microphone, or nothing where the screen asks nothing. */
export function voiceDock(){
  const rd=readShown(), mic=micShown();
  if(!rd&&!mic) return null;
  const ear=rd?el("button",{type:"button",class:"vsp",id:"vhear",onpointerdown:earDown,onpointerup:earCancel,onpointerleave:earCancel,onpointercancel:earCancel,onclick:earClick,oncontextmenu:e=>e.preventDefault()}):null;
  const dm=mic?el("button",{type:"button",class:"vdm",id:"vmic","aria-label":"Answer by voice",onpointerdown:micDown,onclick:micClick,oncontextmenu:e=>e.preventDefault()},iconSvg("mic")):null;
  if(ear) earState(ear);
  if(dm) micState(dm);
  return el("div",{class:"vdock",id:"vdock"},ear,dm);
}
// the bar and the dock again, in place, without rendering the screen (which would rebuild the fields and move the focus)
function paint(){
  const mic=$("vmic"), ear=$("vhear"), old=$("vbar");
  if(mic) micState(mic);
  if(ear) earState(ear);
  if(!old) return;
  const had=old.contains(document.activeElement), nb=voiceBar();
  if(!nb){ old.remove(); return; }
  old.replaceWith(nb);
  // focus goes to Yes, so that Enter confirms (a focused button would otherwise take the Enter for itself); with the bar running
  // it goes nowhere, and Enter and Escape reach the page
  if(had){ const b=state.voice.pend?nb.querySelector(".vok"):nb.querySelector("button"); if(b) b.focus({preventScroll:true}); }
}
function paintLive(){ const s=$("vlive"); if(s){ s.textContent=statusText(); s.className=stClass(); } }
/* the microphone: a press starts listening at once (so that no word said as the finger lands is lost); a quick lift keeps it listening until a pause, and a lift after HOLD_MS sends what was said */
function micDown(ev){
  if(ev.button) return;
  const v=state.voice, a=asked();
  if(!a||!hearing()) return;
  ev.preventDefault();
  v.began=true; markTried();
  if(v.press) clearTimeout(v.press.tid);
  const p=v.press={t0:performance.now(),was:v.phase==="listening",long:/** @type {boolean} */(false),tid:null};
  if(!p.was) hear(a,false,true);
  p.tid=setTimeout(()=>{ if(v.press===p){ p.long=true; v.hold=!p.was; paint(); } },HOLD_MS);
  document.addEventListener("pointerup",micUp,true); document.addEventListener("pointercancel",micUp,true);
}
function micUp(){
  const v=state.voice, p=v.press;
  document.removeEventListener("pointerup",micUp,true); document.removeEventListener("pointercancel",micUp,true);
  v.press=null; v.hold=false;
  if(!p) return;
  clearTimeout(p.tid);
  const h=v.stop;
  if(p.was){ if(h) h.stop(); }                              // it was listening: a press stops it
  else if(h&&h.release){ if(p.long) h.stop(); else h.release(); }
  paint();
}
// the keyboard presses the microphone with a click that has no position (a click that follows a pointer was dealt with above)
function micClick(ev){ if(ev.detail===0) toggleListen(); }
function markTried(){
  const v=state.voice;
  if(v.tried) return;
  v.tried=true; try{ localStorage.setItem("rd-voice-tried","1"); }catch(e){}
}
export function toggleListen(){
  const v=state.voice, a=asked();
  if(!a||!hearing()) return false;
  markTried();
  if(v.phase==="listening"&&v.stop) v.stop.stop(); else hear(a);
  return true;
}
/* the speaker: a tap says the question again, or stops the reading, or (when it is paused) takes the pause away and reads; holding it pauses the reading for this visit */
function earDown(ev){
  if(ev.button) return;
  const v=state.voice;
  if(v.spress) clearTimeout(v.spress.tid);
  const p=v.spress={long:/** @type {boolean} */(false),tid:null};
  p.tid=setTimeout(()=>{ if(v.spress===p){ p.long=true; muteToggle(); } },MUTE_MS);
}
function earCancel(){ const p=state.voice.spress; if(p) clearTimeout(p.tid); }
function earClick(){
  const v=state.voice, p=v.spress;
  v.spress=null;
  if(p&&p.long) return;                      // the hold already paused or resumed the reading
  repeat(true);
}
// `toggle`: the speaker's tap stops a reading that is going on (the R key says it again from the start)
function repeat(toggle){
  const v=state.voice, a=asked();
  if(!a||!enabled()) return false;
  if(v.muted){ v.muted=false; }
  else if(toggle&&v.phase==="speaking"){ quiet(); endReading(); paint(); if(handsFree()) hear(a); return true; }    // stopped: in Hands-free the reading was only the way to the answer
  if(!reading()) return false;
  say(a,a.say,v.held);
  return true;
}
function muteToggle(){
  const v=state.voice, speaking=v.phase==="speaking";
  v.muted=!v.muted;
  if(v.muted&&speaking){ quiet(); endReading(); }
  paint();
  const a=asked();
  if(!a) return;
  if(v.muted){ v.note="Reading is paused for this visit. Tap the speaker to hear the question."; v.bad=false; if(speaking&&handsFree()) hear(a,true); else paint(); }
  else if(reading()) say(a,a.say,v.held);
}
// the keys: V listens (or stops), R reads the question again; Enter confirms the answer that waits, Escape changes it (or the step that just went on). True when the key was taken
export function voiceKey(k){
  const a=asked(); if(!a) return false;
  const v=state.voice;
  if(v.pend){
    if(k==="Enter"){ confirm(); return true; }
    if(k==="Escape"){ change(); return true; }
  } else if(v.chip&&k==="Escape"){ undoTaken(); return true; }
  if(k==="v") return toggleListen();
  if(k==="r"&&reading()) return repeat();
  return false;
}
for(const t of ["pointerdown","keydown"]) document.addEventListener(t,()=>{ state.voice.began=true; },{capture:true,once:true});
document.addEventListener("visibilitychange",()=>{ if(document.hidden&&enabled()){ if(state.voice.press) micUp(); quiet(); endReading(); paint(); } });

/* ---------- the Voice choices of the Practice options (drawn by the Path: path/options.tsx) and the Voice row of Settings (path/settings.tsx) ---------- */
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
  if(!on){ quiet(); dropPend(); dropChip(); letGo("moved"); v.key=""; v.muted=false; }
  render();
}
/** What the Voice switch of Settings does (the Path draws the same row). */
export const voiceNote=()=>"Reads the questions aloud and lets you answer by voice, with your browser’s own speech. "+(canHear()?"In Chrome, what you say is sent to Google to be turned into text. ":"")+"Once it is on, its choices are in the Practice options of Relations and Pervasions.";
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
// the words of the Voice choices and of the Voice page
export const VOICE_LEAD="Read aloud says each question when it appears, and Answer by voice puts a microphone at the foot of the exercise. The speaker beside it says the question again. Both use your device’s own speech, so the voices, and how well it hears you, depend on the device and the browser.";
export const READ_NOTE="The speaker at the foot says it again; hold the speaker to pause the reading for this visit.";
export const ANSWER_PICKS=[["off","Off","No microphone."],
  ["tap","Tap or hold","Tap the microphone at the foot, or press V, and say the answer; or hold it and talk, and let go to send."],
  ["auto","Hands-free","Listens by itself after each question is read, and goes on by itself after a short bar."]];
export const CONFIRM_PICKS=[["split","Wait in tap mode, go on in Hands-free","Tapping the mic waits for Yes. Hands-free goes on by itself after a bar of 1.5 seconds (1 in Sprint)."],
  ["wait","Always wait for Yes","Yes, Enter or “yes”; Change takes it back (Escape or “no”)."],
  ["auto","Always go on by itself","After the bar. The chip above the foot, or “no”, takes it back for a few seconds."]];
export const VOICE_SAY="Say Accept or Why? (with the example), the relation by name or as written under the option, or an example; “nothing” leaves a cell empty. "+
  "The Sprint clock stops while a question is read and while an answer waits. Chrome sends the audio to Google to turn it into text; the app records nothing and keeps only the answer, as if typed.";
