import { state } from "../state.js";
import { $, el } from "../core/dom.js";
import { ORDER, REL } from "../core/rel.js";
import { chooseD, holdClock, releaseClock, sayQ, submitWhy, undoQ } from "../debate/flow.js";
import { Wd, termSing } from "../debate/text.js";
import { check } from "../practice/grading.js";
import { choose, fillable, missedCase, relRestore, relSnapshot } from "../practice/screen.js";
import { NOT } from "../../ai-shared/debate.ts";
import { plainWords, spokenCommand, spokenConfirm, spokenDirection, spokenDontKnow, spokenExample, spokenRelation, spokenReply, spokenYesNo } from "../../domain/spoken.ts";
import { canHear, canSpeak, listen, listenHeld, onVoices, speak, stopSpeaking } from "../../ui/speech";
import { CELL_FULL, render } from "./render.js";
import { refreshPath } from "../path/index.tsx";
import { iconSvg } from "../path/ui.tsx";
import { keepOwn } from "../practice/per-exercise.ts";
import { checkFind } from "../find/flow.js";
import { askedHere, heardHere, resultAsk } from "./asks.ts";
import { next } from "../practice/queue.js";
import { skipAskText, skipNow } from "../practice/skips.js";
import { cue } from "../sound/play.ts";
import { canAsk } from "../core/ask.js";
import { askTutor, needsKey } from "../path/parts.tsx";

/* ---------- voice: the questions read aloud, answers by voice ---------- */
// One switch in Settings (the Voice row, on trial: the kill switch), and the choices on the first page of the Practice options of Relations and Pervasions,
// each on its own: Read aloud says each question when it appears; Answer by voice makes the lower part of the screen a field (tap it, or hold it and talk;
// V on a keyboard), or listens by itself after each question (Hands-free). A strip along the top of the field says the question again (hold it to pause the reading
// for this visit). Both use the browser's own speech (src/ui/speech.ts). What was heard goes through the same steps as a tap or a typed answer
// (sayQ, choose, the cell's text), so the saved answers look as they always did; nothing of the voice is stored.
// What was heard is not applied at once: it waits on the screen it was said for, with what it was taken as, until it is
// confirmed (Yes, Enter, or saying "yes"; or after a short bar, in Hands-free or when Settings says so) or taken back (Change,
// Escape, "no"). Saying another answer replaces it. Once it has gone on, the step it took stays above the foot for a few seconds as a chip with Change,
// which puts the screen back as it was. While an answer waits, and while a question is read, the Sprint clock is stopped (holdFor, letGo).
// The page renders as a whole, so this module works from what the screen asks: after each render it compares the
// screen with the one it last spoke for, and a new one stops whatever the old one started.

// what the current screen asks: {key, kind, say, cell?, hint?, clock?}, or null when it asks nothing that can be spoken or answered. Relations, Pervasions and the examples of Find a pair
// are asked here; Syllogisms, Categories, the words of a pair and Find an instance in shell/asks.ts
const pairLine=p=>p.a+" and "+p.b+". ";
function questionLine(i){
  const w=Wd(), q=w.q[i].map(x=>x==="A"||x==="B"?termSing(x):x===NOT?"not":x).join("");
  return w.lead?w.lead.replace(/…$/,"")+" "+q[0].toLowerCase()+q.slice(1).replace(/\.$/,"?"):q;
}
/** @typedef {import("./asks.ts").AskAny} AskAny */
const CELL_ASK={both:(A,B)=>"Name something that is both "+A+" and "+B+".",anb:(A,B)=>"Name something that is "+A+", but not "+B+".",
  bna:(A,B)=>"Name something that is "+B+", but not "+A+".",nei:(A,B)=>"Name something that is neither "+A+" nor "+B+"."};
/** @returns {AskAny|null} */
export function asked(){
  const u=state.ui;
  if(state.mode!=="quiz"||!u||state.optsOpen||state.sessOpen||state.skipAsk||state.menuOpen||state.view) return null;
  if(u.checked) return handsFree()?resultAsk(u):null;       // a result asks only in Hands-free: to be left (shell/asks.ts)
  const here=askedHere(u);
  if(here!==undefined) return here;
  const p=state.cur&&state.cur.p;
  if(!p) return null;
  const id=p.id||p.a+"|"+p.b;
  if(u.debate){
    if(state.tab!=="debate") return null;
    if(u.step<4) return u.pickWhy?{key:id+"/q"+u.step+"/ex",kind:"example",say:"Posit a counter-example."}
      :{key:id+"/q"+u.step,kind:"reply",say:(u.step===0?pairLine(p):"")+questionLine(u.step)};
    return u.rel?null:{key:id+"/rel",kind:"relation",say:"Which relation do your answers give?"};
  }
  if(u.find){ if(state.tab!=="find"||u.open||u.step!==1) return null; }       // the examples of Find a pair are asked as those of Relations are
  else if(state.tab!=="practice") return null;
  else if(!u.rel||u.open) return {key:id+"/rel",kind:"relation",say:pairLine(p)+"What is the relation?"};
  const order=fillable(), c=order[Math.max(0,Math.min(u.ci||0,order.length-1))];
  return {key:id+"/c/"+c,kind:"cell",cell:c,say:CELL_ASK[c](termSing("A"),termSing("B"))};
}
// Voice is a feature on trial: until its switch in Settings is on (on by default in a Preview, off in the real app; app.js), none of this does anything.
const enabled=()=>state.voice.on;
const reading=()=>enabled()&&state.voice.read&&!state.voice.muted&&canSpeak();
const hearing=()=>enabled()&&state.voice.answer!=="off"&&canHear();
const handsFree=()=>enabled()&&state.voice.answer==="auto"&&canHear();
// Hands-free opens the microphone by itself, unless the run is paused
const ongoing=()=>handsFree()&&!state.voice.paused;

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
  if(v.paused&&!handsFree()) v.paused=false;       // a pause belongs to Hands-free: another exercise with its own Answer setting does not inherit it
  // The first question the app shows is neither read nor listened to: people look around first, and start by tapping the
  // speaker or the microphone, or by answering or moving on by hand (any tap or key before this question counts).
  const opening=!!a&&!v.began&&!v.seen, back=v.noRead;
  v.noRead=false;
  if(a) v.seen=true;
  v.held=opening;
  v.note=""; v.bad=false; v.tries=0; v.blocked=false; v.ask3=false;
  if(v.paused&&a){ holdFor(); v.note=PAUSED; paint(); return; }       // a paused run: the new screen waits, and its clock stands still
  if(opening) paint();
  else if(a&&a.kind==="result") startResult(a);
  else if(a&&back&&hearing()) hear(a);            // a step taken back: the question is not read again, the microphone opens at once
  else if(a&&reading()) say(a,a.say,true);
  else if(a&&ongoing()) listenAuto(a);
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
  if(first&&(a.clock||a.kind==="reply"||(a.kind==="relation"&&!state.ui.rel))){ holdFor(); v.rhold=!!v.clockUi; }
  paint();
  speak(text,{voice:v.voiceId,rate:v.rate,done:(ok,err)=>{
    if(v.tok!==tok) return;
    v.tok=null; v.phase="idle";
    endReading();
    // Chrome speaks only after the person has tapped or typed on the page once; the speaker is that tap
    if(!ok&&err==="not-allowed"){ v.blocked=true; paint(); return; }
    // after speaking, the audio output needs a moment before the microphone opens (the Voice lab's finding)
    if(ongoing()) listenAuto(a,false,350);
    else paint();
  }});
}
// `held`: the microphone was pressed and may still be held down: it listens while it is held (src/ui/speech.ts, listenHeld), and a tap lets go of it to listen until a pause
function hear(a,keepNote,held,keepBar){
  const v=state.voice, tok={};
  quiet(); endReading(); if(!keepBar) freezePend();
  v.tok=tok; v.phase="listening"; if(!keepNote){ v.note=""; v.bad=false; } v.held=false; paint();
  const opts={
    interim:t=>{ if(v.tok!==tok) return; v.live=t; if(v.pend&&v.pend.result&&v.pend.auto){ freezePend(); paint(); } else paintLive(); },       // words at a result hold its bar: they may be "explain" or "stop"
    done:res=>{
      if(v.tok!==tok) return;
      v.tok=null; v.stop=null; v.phase="idle"; v.live="";
      if(v.key!==a.key) return;
      if("error" in res) missed(a,res.error); else { v.early=!!res.early; take(a,res.alts); }
    }};
  const h=held?listenHeld(opts):listen(opts);
  if(v.tok===tok) v.stop=h;
}
// Hands-free opens the microphone by itself: a soft tick says so, and the microphone follows it (the tick would be heard otherwise). `delay`: the audio output needs a moment after the reading
const TICK_GAP=160;
function listenAuto(a,keepBar,delay=0){
  const v=state.voice, go=()=>{ if(v.key===a.key&&v.phase==="idle"&&!v.tok&&!v.paused&&handsFree()) hear(a,false,false,keepBar); };
  setTimeout(()=>{
    if(v.key!==a.key||v.phase!=="idle"||v.tok||v.paused||!handsFree()) return;
    if(state.sounds){ cue("knock",{soft:true}); setTimeout(go,TICK_GAP); } else go();
  },delay);
}
const MISS={"not-allowed":"The microphone is not allowed for this page. Allow it in the browser (the icon by the address), then tap the field below.",
  "service-not-allowed":"The browser does not let this page use its speech service.","no-speech":"Nothing was heard.","audio-capture":"No microphone was found.",
  "network":"The speech service could not be reached (the browser sends the audio there to turn it into text).","no-audio":"The microphone did not start. Tap the field to try again.","aborted":"","unsupported":"This browser has no speech recognition."};
function missed(a,err){
  const v=state.voice;
  // the result waits for a word for as long as it is on screen: the microphone opens again, twice, and then rests (the field says what to say)
  if(a.kind==="result"){ if(err==="no-speech"&&ongoing()&&v.tries<2){ v.tries++; hear(a,false,false,true); return; } v.note=err==="no-speech"||err==="aborted"?"":MISS[err]!=null?MISS[err]:"Could not listen ("+err+")."; v.bad=err!=="no-speech"&&err!=="aborted"; paint(); return; }
  if(err==="no-speech"&&ongoing()&&v.tries<1){ v.tries++; hear(a); return; }
  v.note=MISS[err]!=null?MISS[err]:"Could not listen ("+err+").";
  v.bad=err!=="aborted"; paint();
}
// heard, but not an answer to this screen: say what would be, and in Hands-free listen again (twice at most).
// `ask`: the hint is a question the answer goes on from, not a correction.
// words heard that began while the microphone opened: what was heard may lack its start, and a new try is open
const MISSED_START="I may have missed the start. Say it again.";
function again(a,heard,hint,ask){
  const v=state.voice;
  if(v.pend) hint="Say “yes” to go on with "+v.pend.label+", or say the answer again.";
  if(v.early&&!ask) hint=MISSED_START;
  v.note=ask||v.early?hint:"Heard “"+heard+"”. "+hint; v.bad=!ask;
  if(!ongoing()||v.tries>=2){ paint(); return; }
  v.tries++;
  if(reading()) say(a,hint); else hear(a,true);       // listens again with the words still on the screen
}
const same=(x,y)=>plainWords(x)===plainWords(y);
const terms=()=>({a:state.cur.p.a,b:state.cur.p.b});
const ownKinds=new Set(["syl","counter","cats","yesno","pair","instance"]);
// "no" after a step went on takes it back, except where "no" is itself an answer: Pervasions' Accept or Why?, the yes or no of one category at a time, and "no" (or "nope")
// at the counter-example question, which leaves the counter-example out ("back" and "undo" still take the step back there)
const answersNo=(a,alts)=>((a.kind==="reply"||a.kind==="example")&&!!spokenReply(state,alts))||(a.kind==="yesno"&&spokenYesNo(alts)==="no")||(a.kind==="counter"&&alts.some((h)=>/^(?:no|nope)$/.test(plainWords(h))));
// what was heard, as the tap or the typed answer it stands for, once it is confirmed. What `apply` returns, if it returns anything, takes the step back (the chip's Change)
function take(a,alts){
  const v=state.voice, w=Wd();
  if(a.kind==="result") return takeResult(a,alts);
  if(spokenDontKnow(alts)) return nudge(a);
  // the commands of the run, said on their own: the question again, the pair set aside, the run paused. Where "skip" is an answer (the counter-example), only naming the thing is the command
  const c=spokenCommand(alts,{bareSkip:a.kind!=="counter",looseSkip:a.kind!=="counter"});
  if(c==="pause"&&handsFree()){ tick(); return pause(); }       // "stop" is also a "no" to a waiting answer or a step that just went on: pausing is what it means
  const yn=v.pend||v.chip?spokenConfirm(alts):null;
  if(v.pend){
    if(yn==="yes") return confirm();
    if(yn==="no"&&c!=="repeat") return change();       // ("again" alone is the question again)
  // after it went on: "no" or "back" takes the last step back, except where "no" is itself an answer (Pervasions: Accept or Why?), or where it is "again": the question again
  } else if(v.chip&&yn==="no"&&c!=="repeat"&&!answersNo(a,alts)) return undoTaken();
  if(c==="repeat") return commandRepeat(a);
  if(c==="skip") return commandSkip(a);
  if(ownKinds.has(a.kind)){
    const o=heardHere(a,alts);
    if(typeof o==="string") return again(a,alts[0],o);
    return offer(a,o.heard,o.label,o.apply,o.quick);
  }
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
    if(i>=order.length-1){ if(document.activeElement instanceof HTMLElement) document.activeElement.blur(); if(u.find) checkFind(); else check(); return; }     // the last case checks the pair
    u.ci=i+1; render();
    return ()=>relRestore(s);
  });
}

/* ---------- the beat of Hands-free: the result, the commands, the pause ---------- */
// One beat for every step: the question is read, a soft tick says the microphone is open, the answer is said, a second tick says it was heard, a short bar, the next step. Hands-free adds
// what comes after the check: the result stays on screen and the microphone listens for "next", "explain" and "stop". "Next" waits like an answer waits (a tap, Enter or "next" go on); in Sprint it
// goes on by itself after a bar of 3 s (shell/asks.ts, resultAsk), unless something on the result has to be read. "Stop" pauses the run: nothing is read or listened to by itself, the clock of a question
// stands still, and a tap on the field goes on. The ticks are the Courtyard's knock, softly (src/app/sound), and only in Hands-free.
const RESULT_BAR=3000, RESULT_OPEN=600;
/** The soft tick that says a word was heard, in Hands-free. */
const tick=()=>{ if(handsFree()) cue("knock",{soft:true}); };
const PAUSED="Paused. Tap the field to go on.";
function startResult(a){
  offerNext(a,!!a.auto);
  listenAuto(a,true,RESULT_OPEN);        // after the sound of the result is over; the bar goes on while the microphone listens
}
/** The result waits to be left, as an answer waits for Yes; `auto`: it goes on after a bar. */
function offerNext(a,auto){
  const v=state.voice;
  dropPend(); dropChip();
  const p=v.pend={key:a.key,said:"The result is on screen",label:"Next",apply:()=>{ next(); },auto:null,result:true};
  // what is on the result may have changed since the bar began (Explain tapped, a definition opened): it then waits
  if(auto) p.auto={ms:RESULT_BAR,t0:performance.now(),tid:setTimeout(()=>{ if(v.pend!==p) return; const r=state.ui&&resultAsk(state.ui); if(r&&r.auto) confirm(); else { freezePend(); paint(); } },RESULT_BAR)};
  paint();
}
// listens again at a result, as a result does: for as long as it is on screen, in two stretches
function resultAgain(a){
  const v=state.voice;
  v.note=""; v.bad=false;
  if(ongoing()&&v.phase==="idle") hear(a,false,false,true); else paint();
}
// at a result only these are "yes": a passing "right" or "good" while the verdict is read does not go on
const RESULT_YES=/^(?:yes|yeah|yep|yup|ok|okay|sure|do it)$/;
function takeResult(a,alts){
  const v=state.voice, c=spokenCommand(alts), yn=spokenConfirm(alts), yes=alts.some((h)=>RESULT_YES.test(plainWords(h)));
  if(c==="pause"){ tick(); return pause(); }
  if(c==="explain"){
    tick();
    if(/\/(?:stop|stage)$/.test(a.key)){ freezePend(); v.note="There is nothing to explain here. Say “next” to go on."; v.bad=false; v.tries=0; if(ongoing()&&v.phase==="idle") hear(a,true,false,true); else paint(); return; }
    return explainNow(a);
  }
  // where an offer on the result is answered by a tap, "yes" is not "next": it would leave the offer
  const now=asked();       // (the offer may have been taken by a tap since the result began)
  if(yes&&!c&&now&&now.choice){ tick(); freezePend(); v.note="Tap the offer to take it, or say “next” to leave it."; v.bad=false; v.tries=0; if(ongoing()&&v.phase==="idle") hear(a,true,false,true); else paint(); return; }
  if(c==="next"||yes){ tick(); if(!v.pend) offerNext(a,false); return confirm(); }
  if(yn==="no"){ tick(); if(v.pend) freezePend(); v.tries=0; return resultAgain(a); }       // "no", "wait": it stays
  v.note="Heard “"+alts[0]+"”. Say “next”, “explain” or “stop”."; v.bad=false;
  if(v.tries>=2){ paint(); return; }
  v.tries++;
  if(ongoing()) hear(a,true,false,true); else paint();
}
// Claude is asked to explain the result on screen; the bar stops, so that the result stays until it is left
function explainNow(a){
  const v=state.voice;
  freezePend(); v.tries=0;
  if(!canAsk()&&!needsKey()){ v.note="Claude is not available here."; v.bad=false; if(ongoing()) hear(a,true,false,true); else paint(); return; }
  v.note=""; v.bad=false;
  askTutor();
  paint();
  if(ongoing()) hear(a,false,false,true);
}
// "repeat" or "again": the question is read once more (with Read aloud on)
function commandRepeat(a){
  const v=state.voice;
  tick();
  if(!reading()){ v.note=state.voice.read?"Reading is paused for this visit, so there is nothing to say again.":"Read aloud is off, so there is nothing to say again."; v.bad=false; if(ongoing()) hear(a,true); else paint(); return; }
  repeat();
}
// "skip" sets the pair aside, as the answer that waits for Yes (or goes on after the bar), like any other
function commandSkip(a){
  const q=skipAskText().q.replace(/\?$/,"");
  offer(a,"skip",q,()=>{ skipNow(); });
}
// "stop": nothing is read or listened to by itself until the field is tapped; the clock of a question stands still
function pause(){
  const v=state.voice;
  v.paused=true; quiet(); endReading(); freezePend();
  if(!state.ui||!state.ui.checked) holdFor();
  v.note=PAUSED; v.bad=false; v.tries=0; v.held=false;
  paint();
}
function resume(){
  const v=state.voice, a=asked();
  v.paused=false; v.note=""; v.bad=false; v.tries=0;
  if(!v.pend) letGo("fresh");          // the question has its whole time again; an answer that waits has its clock held already
  if(!a){ paint(); return; }
  if(v.pend){ if(handsFree()) listenAuto(a,true); paint(); return; }       // an answer that waits keeps waiting, and the microphone listens for "yes" (a result, for "next") again
  if(a.kind==="result") startResult(a);
  else if(reading()) say(a,a.say,true);
  else if(handsFree()) listenAuto(a);
  else paint();
}

// "I don't know": no answer is taken; a friendly word instead (said too, with Read aloud), and the person tries again
const NUDGE="It's okay not to know. Make a guess, then learn from the review. Mistakes are how we learn.";
function nudge(a){
  const v=state.voice;
  v.note=NUDGE; v.bad=false; v.tries=0;
  if(reading()) say(a,NUDGE); else if(ongoing()) hear(a,true); else paint();   // Hands-free listens for the next guess, with the word still on the screen
}

/* ---------- an answer that waits for its confirmation, and the chip that stays after it went on ---------- */
// The answer goes on by itself after a short bar, when the mode is Hands-free (the default, "split") or Settings says so: 1.5 s, and 1 s in Sprint. Where the microphone is tapped
// (or held) the person is looking at the screen, and it waits for Yes. The Sprint clock is stopped while the answer waits (holdFor), so neither the bar nor Yes counts against
// the time. After it went on the step stays above the foot for a few seconds as a chip with Change: the screen it came from, with the answer cleared, and the microphone open.
const PAUSE_BLITZ=1000, PAUSE_CALM=1500, CHIP_MS=6000;
const autoOn=()=>{ const c=state.voice.confirm; return c==="auto"||(c==="split"&&handsFree()); };
// `quick`: a yes or no to a question goes on at once (a second Yes would only repeat the first), unless Settings says to always wait; the chip takes it back for a few seconds
function offer(a,heard,label,apply,quick){
  const v=state.voice;
  dropPend(); dropChip();
  v.note=""; v.bad=false; v.tries=0;
  if(quick&&v.confirm!=="wait"){
    quiet(); letGo("resume");
    const undo=apply();
    if(typeof undo==="function") showChip({label,key:a.key},undo); else paint();
    return;
  }
  holdFor();
  const h=String(heard).trim().replace(/[.!]+$/,"");
  const p=v.pend={key:a.key,said:same(h,label)?"Heard":"Heard “"+h+"”, taken as",label,apply,auto:null};
  if(autoOn()){ const ms=state.blitz?PAUSE_BLITZ:PAUSE_CALM; p.auto={ms,t0:performance.now(),tid:setTimeout(()=>{ if(v.pend===p) confirm(); },ms)}; }
  paint();
  tick();
  if(!p.auto&&ongoing()) hear(a);     // listens for "yes", "no" or another answer
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
  else if(typeof undo==="string") stayAt(p,undo);
}
// the step was not taken and the screen asks again (the subject itself is no counter-example): its words are said, and the microphone opens again in Hands-free
function stayAt(p,text){
  const v=state.voice, a=asked();
  refreshPath();                     // the field the step cleared is drawn empty
  v.note=text; v.bad=false; v.tries=0;
  if(!a||a.key!==p.key){ paint(); return; }
  if(reading()) say(a,text); else if(handsFree()) hear(a,true); else paint();
}
// take the answer back: the clock goes on, and the person says it again (the microphone opens by itself)
function change(){
  const v=state.voice, a=asked();
  if(!v.pend) return;
  if(v.pend.result){ freezePend(); paint(); if(a&&ongoing()&&v.phase!=="listening") hear(a,false,false,true); return; }       // the result stays
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

/* ---------- the field above the foot ---------- */
// The lower part of the screen is the microphone (path/shell.tsx, VoiceField; this module builds it and repaints it in place), a field and not a button: where a thumb rests is for it to find.
// One touch area for two ways of talking: a tap listens until a pause; pressing and holding for longer than HOLD_MS listens while it is held and sends the moment it is let go. With an answer
// waiting, a tap is Yes and a hold says it again; a touch while the app reads cuts the reading off and listens at once. Along its top is a strip that says the question again (tap), stops the reading
// (tap while it reads) or pauses it for this visit (hold, or the M key); while a step that went on can still be taken back, the chip is there instead. The field has something in it only where the screen
// asks something, and there are no boxes in it: words, a hairline, and a thin diamond.
const HOLD_MS=350, MUTE_MS=500;
const HINT={reply:()=>"Say “"+Wd().acc+"” or “"+Wd().why+"”. After “"+Wd().why+"”, the counter-example.",example:()=>"Say the counter-example.",
  relation:()=>"Say the relation, such as “four possibilities”, or what is written under it.",cell:a=>CELL_FULL[a.cell]+": say an example, or “nothing”."};
// what is said in the field besides its fixed words: what is heard as it is said, a miss, a word on the first question
function statusText(){
  const v=state.voice;
  if(v.phase==="listening"){ const a=asked(); return v.live?"“"+v.live+"”":v.note||(v.hold?"Listening… let go to send":a&&a.kind==="result"?"Say “next”, “explain” or “stop”":"Listening…"); }
  if(v.blocked) return "The browser reads aloud only after a tap on the page. Tap above to hear the question.";
  if(v.note) return v.note;
  if(v.pend||v.chip) return "";
  if(v.held&&reading()) return "Tap above to hear the question"+(hearing()?", or here to answer.":".");
  if(v.held&&handsFree()) return "Tap here to start answering.";
  return "";
}
/** The strip that says the question again is shown: Read aloud is chosen and the device can speak, on a screen that asks something. */
export const readShown=()=>{ const a=asked(); return enabled()&&!!a&&!a.quiet&&state.voice.read&&canSpeak(); };
/** The soft keyboard is not to rise over the field: a touch screen with the microphone field on it (shell/render.js, focusCin: a case that ran out of time). */
export const keysStayDown=()=>micShown()&&typeof matchMedia==="function"&&matchMedia("(pointer: coarse)").matches;
/** The microphone field is shown: Answer by voice is on, on a screen that asks something. */
export const micShown=()=>enabled()&&!!asked()&&hearing();
// what the field shows: it listens, it is reading, an answer waits for Yes, an answer is going on by itself, or it is at rest
const fieldState=()=>{ const v=state.voice; return v.phase==="listening"?"listen":v.pend?(v.pend.auto?"going":"heard"):v.phase==="speaking"?"read":"idle"; };
// the step that went on, for a few seconds: what it was taken as, and Change, with a thin line running out under the words
function chipNode(){
  const c=state.voice.chip;
  return el("div",{class:"vchip",role:"group","aria-label":"What was taken"},
    el("i",{class:"vcd","aria-hidden":"true"}),
    el("span",{class:"vcl"},el("small",{text:"Last"}),el("b",{text:c.label})),
    el("button",{type:"button",class:"vchg","data-quiet":"1",title:"Change it (Escape, or say “no”)",onclick:undoTaken,text:"Change"}),
    el("i",{class:"vcrun","aria-hidden":"true",style:"--d:"+CHIP_MS+"ms;--e:"+Math.max(0,Math.round(performance.now()-c.t0))+"ms"}));
}
// the row along the top of the field: the chip, or the strip that hears the question again
function topNode(){
  const v=state.voice;
  if(v.chip&&!v.pend) return chipNode();
  if(!readShown()||v.pend) return null;
  const speaking=v.phase==="speaking", label=v.hold?"Release to send":v.muted?"Reading is paused · tap to hear it":speaking?"Reading… tap to stop":"Hear the question again";
  const b=el("button",{type:"button","data-quiet":"1",class:"vtop"+(v.hold?" say":"")+(v.muted?" off":"")+(speaking?" on":""),id:"vhear",onpointerdown:earDown,onpointerup:earCancel,onpointerleave:earCancel,onpointercancel:earCancel,onclick:earClick,oncontextmenu:e=>e.preventDefault()},
    v.hold?null:iconSvg(v.muted?"speakoff":"speak"),el("span",{text:label}));
  b.setAttribute("aria-label",v.muted?"Reading is paused. Tap to hear the question":speaking?"Stop reading":"Hear the question again");
  b.title=v.muted?"Reading is paused for this visit. Tap to hear the question (R)":speaking?"Stop reading (R)":"Hear the question again (R). Hold it, or press M, to pause the reading for this visit.";
  return b;
}
// what is heard as it is said is written large, as an answer is; a miss is red
const stClass=()=>{ const v=state.voice; return "vst"+(v.bad?" bad":"")+(v.phase==="listening"&&v.live?" live":""); };
// the touch area: the thin diamond with the microphone, or the answer that waits; and the words that go with it
function micNode(){
  const v=state.voice, a=asked(), p=v.pend, st=fieldState(), text=statusText(), kids=[];
  if(p){
    if(p.auto&&(st!=="listen"||p.result)) kids.push(el("i",{class:"vrunl","aria-hidden":"true",style:"--d:"+p.auto.ms+"ms;--e:"+Math.max(0,Math.round(performance.now()-p.auto.t0))+"ms"}));
    kids.push(el("div",{class:"vtake"},el("div",{class:"vwhat",role:"status","aria-live":"polite"},el("small",{text:p.said}),el("b",{text:p.label}))));
    kids.push(p.result&&!v.hold?(p.auto?el("div",{class:"vgo soft",text:"Going on · tap to go now"}):el("div",{class:"vgo"},el("i",{"aria-hidden":"true"}),"Tap to go on"))
      :st==="going"?el("div",{class:"vgo soft",text:"Going on…"}):st==="heard"||(st==="listen"&&!v.hold)?el("div",{class:"vgo"},el("i",{"aria-hidden":"true"}),"Tap for Yes"):el("div",{class:"vgo"}));
  } else kids.push(el("div",{class:"vg"},iconSvg("mic")));
  if(text) kids.push(el("div",{class:stClass(),id:"vlive",role:"status","aria-live":"polite",text}));
  else kids.push(el("div",{class:"vhint",text:p&&p.result?(p.auto?"Say “stop” to stay · “explain” to ask Claude":"Hold and say “explain” or “stop”"):st==="heard"?"Hold to say it again":st==="going"?"Touch to hold it · Escape to change":st==="read"?"Touch to cut in and answer":"Tap, or hold to talk"}));
  const label=p&&p.result?(p.auto?"Going on to the next one. Tap to go now.":"Tap to go on to the next one. Hold to say explain."):st==="heard"?"Yes, go on with "+p.label+". Hold to say it again.":st==="going"?"Going on with "+p.label+". Touch to hold it.":st==="listen"?(v.hold?"Listening while you hold. Let go to send.":"Listening. Tap to finish."):"Answer by voice. Tap, or hold to talk.";
  const n=el("div",{class:"vmic"+(p?" pend":""),id:"vmic",role:"button",tabindex:"0","data-quiet":"1","aria-label":label,"aria-pressed":st==="listen"?"true":"false",title:st==="idle"&&a?(a.hint||HINT[a.kind](a)):null,
    onpointerdown:micDown,onclick:micClick,onkeydown:micKey,oncontextmenu:e=>e.preventDefault()},kids);
  return n;
}
/** What the Path draws above the foot (path/shell.tsx, VoiceField): the field, or nothing where the screen asks nothing. */
export function voiceField(){
  const rd=readShown(), mic=micShown();
  if(!rd&&!mic) return null;
  const v=state.voice, st=fieldState(), top=topNode();
  return el("div",{class:"vfield"+(mic?"":" nomic")+(st==="listen"?" on":"")+(v.hold?" hold":""),id:"vfield","data-s":st},
    el("div",{class:"vtopc"},top),mic?micNode():null,el("div",{class:"vsr",role:"status","aria-live":"polite",text:srText()}));
}
// what a screen reader is told: the children of a button are not read, so the answer that waits and a miss are said from here (not what is heard as it is said)
function srText(){
  const v=state.voice, p=v.pend;
  if(p&&p.result) return "The result is on screen. Say next, explain or stop, or tap the field to go on.";
  if(p) return p.said+" "+p.label+(p.auto?". Going on.":". Tap the field for Yes, or hold it to say it again.");
  if(v.phase==="listening") return "Listening.";
  if(v.chip) return "Taken as "+v.chip.label+". Change is above the field.";
  return v.note||"";
}
// the field again, in place, without rendering the screen (which would rebuild the fields and move the focus). The touch area stays the same node, so that a finger on it keeps its target
function paint(){
  const old=$("vfield"); if(!old) return;
  const nf=voiceField();
  if(!nf){ old.remove(); return; }
  const om=$("vmic"), nm=nf.querySelector("#vmic");
  if(!om!==!nm){ old.replaceWith(nf); return; }
  const topc=old.querySelector(".vtopc"), had=topc.contains(document.activeElement);
  old.className=nf.className; old.setAttribute("data-s",nf.getAttribute("data-s")||"");
  const sr=old.querySelector(".vsr"), ns=nf.querySelector(".vsr");
  if(sr&&ns&&sr.textContent!==ns.textContent) sr.textContent=ns.textContent;
  topc.replaceWith(nf.querySelector(".vtopc"));
  if(had){ const b=old.querySelector(".vtopc button"); if(b) b.focus({preventScroll:true}); }
  if(om&&nm){
    for(const at of [...om.attributes]) if(at.name!=="style"&&!nm.hasAttribute(at.name)) om.removeAttribute(at.name);
    for(const at of nm.attributes) om.setAttribute(at.name,at.value);
    om.replaceChildren(...nm.childNodes);
  }
}
function paintLive(){ const s=$("vlive"); if(s){ s.textContent=statusText(); s.className=stClass(); } }
// where the thumb is, for the soft spot under it (the field's own coordinates)
function spotAt(ev){
  const f=$("vfield"); if(!f) return;
  const r=f.getBoundingClientRect();
  f.style.setProperty("--tx",Math.round(ev.clientX-r.left)+"px"); f.style.setProperty("--ty",Math.round(ev.clientY-r.top)+"px");
}
/* the field: a press starts listening at once (so that no word said as the finger lands is lost); a quick lift keeps it listening until a pause, and a lift after HOLD_MS sends what was said.
   Where an answer waits and nothing listens, a quick lift is Yes, and holding listens for another. */
function micDown(ev){
  if(ev.button) return;
  const v=state.voice, a=asked();
  if(!a||!hearing()) return;
  ev.preventDefault();
  v.began=true; markTried();
  if(v.paused){ resume(); return; }          // a tap on a paused run goes on
  spotAt(ev);
  const fm=$("vmic"); if(fm&&document.activeElement!==fm) fm.focus({preventScroll:true});     // the keys then go on from the field (Enter confirms what waits)
  if(v.press) clearTimeout(v.press.tid);
  const waits=!!v.pend, wasAuto=waits&&!!v.pend.auto;
  if(waits&&v.phase==="listening") quiet();             // the mic that listens for "yes" gives way to the tap (Hands-free, waiting for Yes)
  const p=v.press={t0:performance.now(),was:!waits&&v.phase==="listening",long:/** @type {boolean} */(false),tid:null,pid:ev.pointerId,yes:waits,auto:wasAuto};
  if(waits) freezePend();                    // a touch holds the bar that runs; the answer then waits for Yes
  else if(!p.was) hear(a,false,true);
  p.tid=setTimeout(()=>{ if(v.press!==p) return; p.long=true; if(p.yes){ p.yes=false; hear(a,false,true); } v.hold=!p.was; paint(); },HOLD_MS);
  paint();
  document.addEventListener("pointerup",micUp,true); document.addEventListener("pointercancel",micUp,true); document.addEventListener("pointermove",micMove,true);
}
function micMove(ev){ const p=state.voice.press; if(p&&ev.pointerId===p.pid) spotAt(ev); }
function micUp(ev){
  const v=state.voice, p=v.press;
  if(p&&ev&&ev.pointerId!==p.pid) return;                   // another finger lifting is not this press
  document.removeEventListener("pointerup",micUp,true); document.removeEventListener("pointercancel",micUp,true); document.removeEventListener("pointermove",micMove,true);
  v.press=null; v.hold=false;
  if(!p) return;
  clearTimeout(p.tid);
  const h=v.stop;
  if(p.was){ if(h) h.stop(); }                              // it was listening: a press stops it
  else if(p.yes){ if(!ev||ev.type==="pointercancel") { const a=asked(); if(ev&&!document.hidden&&v.pend&&v.pend.result&&a&&ongoing()) listenAuto(a,true); paint(); return; } if(!p.auto||(v.pend&&v.pend.result)){ confirm(); return; } }    // a tap is Yes; where it was going on by itself the touch only held it
  else if(h&&h.release){ if(p.long) h.stop(); else h.release(); }
  paint();
}
// a click that no touch or key made (a screen reader's "activate"): it does what a tap does
function micClick(ev){
  if(ev.detail!==0) return;
  ev.preventDefault();
  if(state.voice.pend){ confirm(); return; }
  toggleListen();
}
// the keyboard presses the field with Space or Enter (Enter confirms an answer that waits, as it does anywhere on the page)
function micKey(ev){
  if(ev.key!==" "&&ev.key!=="Enter") return;
  ev.preventDefault(); ev.stopPropagation();
  if(ev.repeat) return;
  const v=state.voice;
  if(v.pend){ confirm(); return; }
  toggleListen();
}
function markTried(){
  const v=state.voice;
  if(v.tried) return;
  v.tried=true; try{ localStorage.setItem("rd-voice-tried","1"); }catch(e){}
}
export function toggleListen(){
  const v=state.voice, a=asked();
  if(!a||!hearing()) return false;
  markTried();
  if(v.paused){ resume(); return true; }
  if(v.phase==="listening"&&v.stop) v.stop.stop(); else hear(a);
  return true;
}
/* the strip: a tap says the question again, or stops the reading, or (when it is paused) takes the pause away and reads; holding it pauses the reading for this visit */
function earDown(ev){
  if(ev.button) return;
  const v=state.voice;
  if(v.spress) clearTimeout(v.spress.tid);
  const p=v.spress={long:/** @type {boolean} */(false),tid:null};
  p.tid=setTimeout(()=>{ if(v.spress===p){ p.long=true; muteToggle(); } },MUTE_MS);
}
function earCancel(){ const p=state.voice.spress; if(p) clearTimeout(p.tid); }
function earClick(ev){
  const v=state.voice, p=v.spress;
  v.spress=null;
  if(p&&p.long&&ev.detail!==0) return;                      // the hold already paused or resumed the reading
  repeat(true);
}
// `toggle`: the speaker's tap stops a reading that is going on (the R key says it again from the start)
function repeat(toggle){
  const v=state.voice, a=asked();
  if(!a||!enabled()||a.quiet) return false;       // (a result has no question to say again)
  if(v.muted){ v.muted=false; }
  else if(toggle&&v.phase==="speaking"){ quiet(); endReading(); paint(); if(ongoing()) hear(a); return true; }    // stopped: in Hands-free the reading was only the way to the answer
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
  if(v.muted){ v.note="Reading is paused for this visit. Tap the strip above to hear the question."; v.bad=false; if(speaking&&ongoing()) hear(a,true); else paint(); }
  else if(reading()) say(a,a.say,v.held);
}
// the keys: V listens (or stops), R reads the question again, M pauses the reading for the visit (or takes the pause away); Enter confirms the answer that waits, Escape changes it (or the step that just went on). True when the key was taken
export function voiceKey(k){
  const a=asked(); if(!a) return false;
  const v=state.voice;
  if(v.pend){
    if(k==="Enter"){ confirm(); return true; }
    if(k==="Escape"){ change(); return true; }
  } else if(v.chip&&k==="Escape"){ undoTaken(); return true; }
  if(k==="v") return toggleListen();
  if(k==="r"&&reading()) return repeat();
  if(k==="m"&&!a.quiet&&enabled()&&state.voice.read&&canSpeak()){ muteToggle(); return true; }
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
  if(k==="answer"&&v.paused){ v.paused=false; if(!v.pend) letGo("fresh"); }
  try{ localStorage.setItem(KEYS[k],k==="read"?(val?"1":"0"):String(val)); }catch(e){}
  if(k==="read"||k==="answer") keepOwn(k,val);   // each exercise keeps its own (practice/per-exercise.ts)
  render();
  if((k==="read"&&val)||k==="voiceId"||k==="rate") speak(SAMPLE,{voice:v.voiceId,rate:v.rate});
}
// The Voice switch is the kill switch of the feature: the choice is kept on the device, whatever the default of the build was
export function setOn(on){
  const v=state.voice;
  v.on=on; try{ localStorage.setItem("rd-voice",on?"1":"0"); }catch(e){}
  if(!on){ quiet(); dropPend(); dropChip(); letGo("moved"); v.key=""; v.muted=false; v.paused=false; }
  render();
}
/** What the Voice switch of Settings does (the Path draws the same row). */
export const voiceNote=()=>"Reads the questions aloud and lets you answer by voice, with your browser’s own speech. "+(canHear()?"In Chrome, what you say is sent to Google to be turned into text. ":"")+"Once it is on, its choices are in the Practice options of Relations and Pervasions.";
/** Whether this browser has any speech, so that Settings has a Voice row; and whether Voice is on. */
export const voiceAvailable=()=>canSpeak()||canHear();
export const voiceOn=()=>enabled();
/** An answer waits for Yes: Escape takes it back, wherever the focus is (shell/keys.js). */
export const voicePending=()=>enabled()&&!!state.voice.pend&&!(state.voice.pend.result&&state.ui&&(state.ui.dterm||state.ui.pop));       // (Escape closes a definition or a note opened from a result first)
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
export const voiceShown=()=>enabled()&&(canSpeak()||canHear())&&["practice","debate","syllogism","categories","find","instance"].includes(state.tab);
/** The Voice page draws again when the device's voices arrive (they come late in some browsers). */
export function hookVoices(){ const v=state.voice; if(!v.hooked){ v.hooked=true; onVoices(()=>{ if(state.sessOpen&&state.sessPage==="voice") render(); }); } }
// the words of the Voice choices and of the Voice page
export const VOICE_LEAD="Read aloud says each question when it appears, and Answer by voice makes the lower part of the screen a field to tap or hold. A strip along its top says the question again. Both use your device’s own speech, so the voices, and how well it hears you, depend on the device and the browser.";
export const READ_NOTE="The strip above the answer field says it again; hold the strip, or press M, to pause the reading for this visit.";
export const ANSWER_PICKS=[["off","Off","No microphone."],
  ["tap","Tap or hold","Tap the lower part of the screen, or press V, and say the answer; or hold it and talk, and let go to send."],
  ["auto","Hands-free","Listens by itself after each question is read, and goes on by itself after a short bar. The result stays until you say “next” (in Sprint it goes on after 3 seconds); “explain”, “repeat”, “skip” and “stop” work too."]];
export const CONFIRM_PICKS=[["split","Wait in tap mode, go on in Hands-free","Tapping the field waits for Yes (tap it again). Hands-free goes on by itself after a bar of 1.5 seconds (1 in Sprint)."],
  ["wait","Always wait for Yes","Tap, Enter or “yes”; hold to say it again (or Escape, or “no”)."],
  ["auto","Always go on by itself","After the bar. The row at the top of the field, or “no”, takes it back for a few seconds."]];
export const VOICE_SAY="Say Accept or Why? (with the example), the relation by name or as written under the option, or an example; “nothing” leaves a cell empty. In Syllogisms say “I accept”, “the reason is not established” or “there is no pervasion”, then a counter-example or “skip”; in Categories the categories the thing is in (“a color and a shape”, or their numbers, or “none of these”), or yes or no to each; in Find a pair two phenomena (“wood and fire”); in Find an instance a thing, or “nothing”. "+
  "In Hands-free also say “next”, “explain”, “repeat”, “skip this pair” or “stop”. The Sprint clock stops while a question is read and while an answer waits. Chrome sends the audio to Google to turn it into text; the app records nothing and keeps only the answer, as if typed.";
