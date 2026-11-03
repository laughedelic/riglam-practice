import { state } from "../state.js";
import { $, el } from "../core/dom.js";
import { ORDER, REL } from "../core/rel.js";
import { chooseD, holdClock, pairAheadDebate, releaseClock, sayQ, submitWhy, undoQ } from "../debate/flow.js";
import { Wd, singular, termSing } from "../debate/text.js";
import { check } from "../practice/grading.js";
import { choose, fillable, missedCase, relRestore, relSnapshot } from "../practice/screen.js";
import { NOT } from "../../ai-shared/debate.ts";
import { plainWords, spokenCommand, spokenConfirm, spokenDirection, spokenDontKnow, spokenExample, spokenRelation, spokenReply, spokenYesNo } from "../../domain/spoken.ts";
import { armSpeech, canHear, canSpeak, listen, listenHeld, onVoices, prefetchClips, speak, stopSpeaking } from "../../ui/speech";
import { CELL_FULL, render } from "./render.js";
import { refreshPath } from "../path/index.tsx";
import { iconSvg } from "../path/ui.tsx";
import { keepOwn } from "../practice/per-exercise.ts";
import { checkFind } from "../find/flow.js";
import { askedHere, heardHere, laterHere, resultAsk } from "./asks.ts";
import { next, pairAhead } from "../practice/queue.js";
import { skipAskText, skipNow } from "../practice/skips.js";
import { cue } from "../sound/play.ts";
import { canAsk } from "../core/ask.js";
import { askTutor, needsKey, pickThen } from "../path/parts.tsx";
import { moves } from "./motion.js";

/* ---------- voice: the questions read aloud, answers by voice ---------- */
// One switch in Settings for answering by voice (under Experiments, on trial; Read aloud needs none), and the choices on the first page of the Practice options of Relations and Pervasions,
// each on its own: Read aloud says each question when it appears; Answer by voice makes the lower part of the screen a field (tap it, or hold it and talk;
// V on a keyboard), or listens by itself after each question (Hands-free). A strip along the top of the field says the question again (hold it to pause the reading
// for this visit). Both use the browser's own speech (src/ui/speech.ts). What was heard goes through the same steps as a tap or a typed answer
// (sayQ, choose, the cell's text), so the saved answers look as they always did; nothing of the voice is stored.
// What was heard is not applied at once: it waits on the screen it was said for, with what it was taken as, until it is
// confirmed (Yes, Enter, or saying "yes"; or after a short bar, in Hands-free or when Settings says so) or taken back (Change,
// Escape, "no"). Saying another answer replaces it. Just after it has gone on, "back", "no" or Escape
// puts the screen back as it was, for a few seconds; past that the page's own controls change it. While an answer waits, and while a question is read, the Sprint clock is stopped (holdFor, letGo).
// The page renders as a whole, so this module works from what the screen asks: after each render it compares the
// screen with the one it last spoke for, and a new one stops whatever the old one started.

// what the current screen asks: {key, kind, say, cell?, hint?, clock?}, or null when it asks nothing that can be spoken or answered. Relations, Pervasions and the examples of Find a pair
// are asked here; Syllogisms, Categories, the words of a pair and Find an instance in shell/asks.ts
const pairLine=p=>p.a+" and "+p.b+". ";
const CALL_RELATION="Which relation do your answers give?", CALL_COUNTER="Posit a counter-example.";
function questionLine(i,p){
  const w=Wd(), sing=p?x=>singular(x==="A"?p.a:p.b):termSing, q=w.q[i].map(x=>x==="A"||x==="B"?sing(x):x===NOT?"not":x).join("");
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
    if(u.step<4) return u.pickWhy?{key:id+"/q"+u.step+"/ex",kind:"example",say:CALL_COUNTER}
      :{key:id+"/q"+u.step,kind:"reply",say:(u.step===0?pairLine(p):"")+questionLine(u.step)};
    return u.rel?null:{key:id+"/rel",kind:"relation",say:CALL_RELATION};
  }
  if(u.find){ if(state.tab!=="find"||u.open||u.step!==1) return null; }       // the examples of Find a pair are asked as those of Relations are
  else if(state.tab!=="practice") return null;
  else if(!u.rel||u.open) return {key:id+"/rel",kind:"relation",say:pairLine(p)+"What is the relation?"};
  const order=fillable(), c=order[Math.max(0,Math.min(u.ci||0,order.length-1))];
  return {key:id+"/c/"+c,kind:"cell",cell:c,say:CELL_ASK[c](termSing("A"),termSing("B"))};
}
// Read aloud is for everyone whose browser can speak. Answering by voice is on trial: until its switch in Settings, under Experiments, is on
// (on by default in a Preview, off in the real app; app.js), nothing listens.
const input=()=>state.voice.on;
const enabled=()=>canSpeak()||(input()&&canHear());
/**
 * What the screen will ask after the one it asks now, in the words it is read: the questions the pair on screen already fixes, so that a natural voice has their clips by the time they are asked
 * (`warmAhead`). Pervasions: the questions still to come, the counter-example and the relation. Relations (and the examples of Find a pair): all four cells while the relation is asked
 * (which of them is asked depends on it), then the cells still to come. Syllogisms and Categories are in shell/asks.ts.
 * @returns {string[]}
 */
function later(){
  const u=state.ui, p=state.cur&&state.cur.p;
  const here=u&&laterHere(u);
  if(here!==undefined) return here||[];
  if(!u||!p||u.checked) return [];
  if(u.debate){
    if(state.tab!=="debate"||u.step>=4) return [];
    const out=[];
    for(let i=u.step+1;i<4;i++) out.push(questionLine(i));
    out.push(CALL_COUNTER,CALL_RELATION);
    return out;
  }
  const A=termSing("A"), B=termSing("B");
  if(u.find){ if(state.tab!=="find"||u.open||u.step!==1) return []; }
  else if(state.tab!=="practice") return [];
  else if(!u.rel||u.open) return Object.keys(CELL_ASK).map(c=>CELL_ASK[c](A,B));
  const order=fillable();
  return order.slice(Math.max(0,Math.min(u.ci||0,order.length-1))+1).map(c=>CELL_ASK[c](A,B));
}
/**
 * The words of the pair `p`, when it is the one on screen, as they will be read: its first question and what follows it (see `later`). Pervasions and Relations, the pairs that
 * `pairAhead` draws ahead; the pair is not on screen yet, so its terms come from `p`.
 */
function wordsOf(p,debate){
  if(debate) return [pairLine(p)+questionLine(0,p),questionLine(1,p),questionLine(2,p),questionLine(3,p),CALL_COUNTER,CALL_RELATION];
  const A=singular(p.a), B=singular(p.b);
  return [pairLine(p)+"What is the relation?",...Object.keys(CELL_ASK).map(c=>CELL_ASK[c](A,B))];
}
/**
 * With a natural voice, at a result (or at the stop of a new term, which comes before the next question), the pair that comes next is drawn and its words are asked for, so that its first
 * question is read as it is shown and not after the time the server needs. What is drawn is held for the Next (practice/ahead.ts); the clips come from the server once and are kept (ui/speech.ts).
 */
function warmNext(){
  const u=state.ui, r=remoteVoice();
  if(!u||!r||!reading()||state.mode!=="quiz"||!(u.checked||u.stop)||u.find||u.cats||u.inst||u.syllogism) return;
  if(u.debate?state.tab!=="debate":state.tab!=="practice") return;
  const p=u.debate?pairAheadDebate():pairAhead();
  if(p) prefetchClips(wordsOf(p,!!u.debate),r);
}
/** The clips of what comes next are asked for as the screen comes, behind the one that is read now, while the question is answered. */
function warmAhead(key){
  const v=state.voice, r=remoteVoice();
  if(v.key!==key||!r||!reading()) return;
  const texts=later();
  if(texts.length) prefetchClips(texts,r);
}
const SERVER="server:";
/**
 * The server's voice that reads now, or null when the device's does: the voice chosen if it is one of the server's, or the first one while none was chosen ("" is the default); not while
 * the server's limit for the day is used up or it failed lately (`remoteUntil`: it is not asked again for a few minutes, so that each question does not wait for a server that cannot answer).
 */
function remoteVoice(){
  const v=state.voice, r=v.remote;
  if(!r||!r.voices.length||Date.now()<v.remoteUntil) return null;
  if(v.voiceId&&!v.voiceId.startsWith(SERVER)) return null;
  const id=v.voiceId.slice(SERVER.length), voice=(r.voices.find(x=>x.id===id)||r.voices[0]).id;
  return {key:voice,clip:(text,signal)=>r.clip(text,voice,{signal}),failed:why=>{
    const until=why&&why.code==="rate_limited"&&why.resetsAt?Date.parse(why.resetsAt):NaN;
    v.remoteUntil=Date.now()+(why&&why.code==="rate_limited"?(until>Date.now()?Math.min(until-Date.now(),6*3600e3):3600e3):why&&why.code==="not_granted"?3600e3:3*60e3);
    v.remoteWhy=why&&why.code==="rate_limited"?"limit":why&&why.code==="not_granted"?"key":"away";
    if(state.sessOpen&&state.sessPage==="read") render();      // the Read aloud page says so at once
  }};
}
/** While the server's voice rests (see `remoteUntil`), why the device's voice reads instead, in plain words for the Read aloud page; "" otherwise. */
export function remoteRests(){
  const v=state.voice;
  if(!v.remote||Date.now()>=v.remoteUntil) return "";
  return v.remoteWhy==="limit"?"The natural voices have reached today’s limit, so your device’s voice reads until it starts again tomorrow."
    :v.remoteWhy==="key"?"The server did not accept this device’s Magic Key for the natural voices, so your device’s voice reads."
    :"The natural voices could not be reached just now, so your device’s voice reads. The app tries them again in a few minutes.";
}
/** Reads `text` as the voice choices say: with the server's voice where one is chosen and it answers, else with the device's. `done` is as for `speak`. */
export const readOut=(text,done)=>speak(text,{voice:state.voice.voiceId,rate:state.voice.rate,remote:remoteVoice()||undefined,done});
/** A reading from the server's voice may come after the tap that asked for it: the audio element is started inside the first tap (ui/speech.ts), once the device has a voice of the server and Read aloud is on. */
export const armVoice=()=>{ const v=state.voice; if(v.read&&v.remote) armSpeech(); };
const reading=()=>enabled()&&!state.voice.hush&&state.voice.read&&!state.voice.muted&&canSpeak();
const hearing=()=>input()&&!state.voice.hush&&state.voice.answer!=="off"&&canHear();
const handsFree=()=>input()&&!state.voice.hush&&state.voice.answer==="auto"&&canHear();
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
  syncSoon(); snapSync();
  armVoice();                   // an exercise may have its own Read aloud switch (per-exercise.ts): the first tap starts the player whichever one it was
  setTimeout(warmNext,0);       // the pair after a result or a stop: drawn and asked for early (after this screen's own reading has asked for its clip)
  const v=state.voice, a=asked(), key=a?a.key:"";
  if(key===v.key){ explainWatch(a); return; }
  v.key=key; quiet();
  if(a) setTimeout(()=>warmAhead(key),0);       // after this screen's own reading has asked for its clip, which goes first
  if(v.paused&&!handsFree()) v.paused=false;       // a pause belongs to Hands-free: another exercise with its own Answer setting does not inherit it
  // The first question the app shows is neither read nor listened to: people look around first, and start by tapping the
  // speaker or the microphone, or by answering or moving on by hand (any tap or key before this question counts).
  const opening=!!a&&!v.began&&!v.seen, back=v.noRead;
  v.noRead=false;
  if(a) v.seen=true;
  v.held=opening;
  v.note=""; v.bad=false; v.tries=0; v.blocked=false; v.ask3=false; v.explWait=false;
  if(v.paused&&a){ holdFor(); v.note=PAUSED; paint(); return; }       // a paused run: the new screen waits, and its clock stands still
  if(opening) paint();
  else if(a&&a.kind==="result") startResult(a);
  else if(a&&back&&hearing()) hear(a);            // a step taken back: the question is not read again, the microphone opens at once
  else if(a&&reading()) say(a,a.say,true);
  else if(a&&ongoing()) listenAuto(a);
  else paint();
}
// While Claude writes an explanation of the result on screen the microphone is closed (what is said meanwhile would be read against a screen that is about to change);
// once the explanation is there it opens again, for its two stretches, so that "next" can be said after reading.
function explainWatch(a){
  const v=state.voice, u=state.ui;
  if(!a||a.kind!=="result"||!u){ v.explWait=false; return; }
  if(u.ctl){ if(!v.explWait){ v.explWait=true; if(v.phase==="listening"){ quiet(); paint(); } } return; }
  if(!v.explWait) return;
  v.explWait=false; v.tries=0; v.note="";
  if(ongoing()&&listensAtResult()) listenAuto(a,true,RESULT_OPEN); else paint();
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
  readOut(text,(ok,err)=>{
    if(v.tok!==tok) return;
    v.tok=null; v.phase="idle";
    endReading();
    // Chrome speaks only after the person has tapped or typed on the page once; the speaker is that tap
    if(!ok&&err==="not-allowed"){ v.blocked=true; paint(); return; }
    // after speaking, the audio output needs a moment before the microphone opens (the Voice lab's finding)
    if(ongoing()) listenAuto(a,false,350);
    else paint();
  });
}
// `held`: the microphone was pressed and may still be held down: it listens while it is held (src/ui/speech.ts, listenHeld), and a tap lets go of it to listen until a pause
function hear(a,keepNote,held,keepBar){
  const v=state.voice, tok={};
  quiet(); endReading(); if(!keepBar) freezePend();
  v.tok=tok; v.phase="listening"; if(!keepNote){ v.note=""; v.bad=false; } v.held=false; paint();
  const opts={
    interim:t=>{ if(v.tok!==tok) return; v.live=t; if(v.pend&&v.pend.auto){ if(!v.pend.result) v.retry=true; freezePend(); paint(); } else paintLive(); },       // words over a bar hold it: they may be "explain", "stop", "no" or another answer
    done:res=>{
      if(v.tok!==tok) return;
      v.tok=null; v.stop=null; v.phase="idle"; v.live=""; v.retry=false;
      if(v.key!==a.key) return;
      if("error" in res) missed(a,res.error); else { v.early=!!res.early; take(a,res.alts); }
    }};
  const h=held?listenHeld(opts):listen(opts);
  if(v.tok===tok) v.stop=h;
}
// Hands-free opens the microphone by itself: a soft tick says so, and the microphone follows it (the tick would be heard otherwise). `delay`: the audio output needs a moment after the reading
const TICK_GAP=160;
// (not while Claude writes an explanation of the result: explainWatch opens it once the explanation is there)
const writing=(a)=>{ if(a.kind!=="result"||!state.ui||!state.ui.ctl) return false; state.voice.explWait=true; return true; };       // (marked, so that explainWatch opens it when the explanation lands)
function listenAuto(a,keepBar,delay=0){
  const v=state.voice, go=()=>{ if(v.key===a.key&&v.phase==="idle"&&!v.tok&&!v.paused&&handsFree()&&!writing(a)) hear(a,false,false,keepBar); };
  setTimeout(()=>{
    if(v.key!==a.key||v.phase!=="idle"||v.tok||v.paused||!handsFree()||writing(a)) return;
    if(state.sounds){ cue("knock",{soft:true}); setTimeout(go,TICK_GAP); } else go();
  },delay);
}
const MISS={"not-allowed":"The microphone is not allowed for this page. Allow it in the browser (the icon by the address), then tap the field below.",
  "service-not-allowed":"The browser does not let this page use its speech service.","no-speech":"Didn’t catch that.","audio-capture":"No microphone was found.",
  "network":"The speech service could not be reached (the browser sends the audio there to turn it into text).","no-audio":"The microphone did not start. Tap the field to try again.","aborted":"","unsupported":"This browser has no speech recognition."};
function missed(a,err){
  const v=state.voice;
  if(v.pend&&!v.pend.result&&v.pend.auto&&(err==="no-speech"||err==="aborted")){ paint(); return; }       // nothing said over the bar: it runs on
  // the result waits for a word for as long as it is on screen: the microphone opens again, twice, and then rests (the field says what to say)
  if(a.kind==="result"){ if(err==="no-speech"&&ongoing()&&v.tries<2&&!writing(a)){ v.tries++; hear(a,false,false,true); return; } v.note=err==="no-speech"||err==="aborted"?"":MISS[err]!=null?MISS[err]:"Could not listen ("+err+")."; v.bad=err!=="no-speech"&&err!=="aborted"; paint(); return; }
  if(err==="no-speech"&&ongoing()&&v.tries<1){ v.tries++; hear(a); return; }
  v.note=MISS[err]!=null?MISS[err]:"Could not listen ("+err+").";
  v.bad=err!=="aborted"&&err!=="no-speech"; paint();       // red only where the microphone itself failed (voice lab round 7)
}
// heard, but not an answer to this screen: say what would be, and in Hands-free listen again (twice at most).
// `ask`: the hint is a question the answer goes on from, not a correction.
// words heard that began while the microphone opened: what was heard may lack its start, and a new try is open
const MISSED_START="I may have missed the start. Say it again.";
function again(a,heard,hint,ask){
  const v=state.voice;
  if(v.pend) hint="Say “yes” to go on with "+v.pend.label+", or say the answer again.";
  if(v.early&&!ask) hint=MISSED_START;
  v.note=ask||v.early?hint:"Heard “"+heard+"”. "+hint; v.bad=false;
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
// what was heard, as the tap or the typed answer it stands for, once it is confirmed. What `apply` returns, if it returns anything, takes the step back ("back", "no" or Escape just after it went on)
function take(a,alts){
  const v=state.voice, w=Wd();
  if(a.kind==="result") return takeResult(a,alts);
  if(spokenDontKnow(alts)) return nudge(a);
  // the commands of the run, said on their own: the question again, the pair set aside, the run paused. Where "skip" is an answer (the counter-example), only naming the thing is the command
  const c=spokenCommand(alts,{bareSkip:a.kind!=="counter",looseSkip:a.kind!=="counter"});
  if(c==="pause"&&v.pend&&!v.pend.result) return change();       // over an answer that waits or goes on, "stop" (or "wait") takes it back and listens again
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
    return offer(a,o.heard,o.label,o.apply,o.now?"now":o.quick,o.row);
  }
  if(a.kind==="reply"){
    const r=spokenReply(state,alts);
    if(!r) return again(a,alts[0],"Say “"+w.acc+"” or “"+w.why+"”.");
    const ex=r.say==="why"&&r.example?r.example.text:"", i=state.ui.step;
    return offer(a,r.heard,(r.say==="accept"?w.acc:w.why)+(ex?" "+ex:""),()=>{ sayQ(r.say,{example:ex}); return ()=>undoQ(i); },false,r.say);
  }
  if(a.kind==="example"){
    const r=spokenReply(state,alts), i=state.ui.step;
    // changed their mind: back from Why? and accept (as Back, then Accept, without showing the question again in between)
    if(r&&r.say==="accept"&&!r.example) return offer(a,r.heard,w.acc,()=>{ const u=state.ui; u.ans[u.step].say=null; u.pickWhy=false; u.exText=""; sayQ("accept",{}); return ()=>undoQ(i); });
    const x=r&&r.say==="why"&&r.example?r.example:spokenExample(state,alts);   // "why, a gold ring" said again is the example too
    if(!x||x.none) return again(a,alts[0],"Name the counter-example, or say “"+w.acc+"”.");
    return offer(a,x.heard,x.text,()=>{ state.ui.exText=x.text; submitWhy(); return ()=>undoQ(i); },false,{field:"dex",text:x.text});
  }
  if(a.kind==="relation"){
    const t=terms(), order=/** @type {import("../../ai-shared/relations.ts").RelKey[]} */(ORDER);
    const k=(v.ask3&&spokenDirection(alts,t))||spokenRelation(alts,order,t);
    if(k==="3"){ if(v.pend){ dropPend(); letGo("resume"); refreshPath(); } v.ask3=true; return again(a,alts[0],"Three possibilities: which is inside the other, "+t.a+" or "+t.b+"?",true); }
    if(!k) return again(a,alts[0],v.ask3?"Say which is inside the other, "+t.a+" or "+t.b+".":"Say the relation, such as “four possibilities”, or what is written under it.");
    v.ask3=false;
    // Pervasions: the relation checks the pair, so it cannot be taken back; Relations: the relation list opens again
    return offer(a,alts[0],REL[k].name,()=>{ if(state.ui.debate){ chooseD(k); return; } const s=relSnapshot(); choose(k,true); return ()=>relRestore(s); },false,k);
  }
  const x=spokenExample(state,alts);
  if(!x) return again(a,alts[0],a.cell==="nei"?"Say an example, or “nothing”.":"Say an example.");
  if(x.none&&a.cell!=="nei") return again(a,alts[0],"The relation you chose needs an example here: only the neither case can be empty.");
  offer(a,x.heard,x.none?"nothing":x.text,()=>{
    const u=state.ui, s=relSnapshot(); u.cells[a.cell].t=x.none?"":x.text;
    const order=fillable(); let i=order.indexOf(a.cell);
    while(i<order.length-1&&missedCase(order[i+1])) i++;         // a case whose time ran out is not asked again
    if(i>=order.length-1){ if(document.activeElement instanceof HTMLElement) document.activeElement.blur(); render(); if(!tapStation("chk")){ if(u.find) checkFind(); else check(); } return; }     // the last case checks the pair, by its Check station as a tap takes it (with the scan)
    u.ci=i+1; render();
    return ()=>relRestore(s);
  },false,{field:"cin",text:x.none?"":x.text});
}

/* ---------- the beat of Hands-free: the result, the commands, the pause ---------- */
// One beat for every step: the question is read, a soft tick says the microphone is open, the answer is said, a second tick says it was heard, a short bar, the next step. Hands-free adds
// what comes after the check: the result stays on screen and the microphone listens for "next", "explain" and "stop". "Next" waits like an answer waits (a tap, Enter or "next" go on); in Sprint it
// goes on by itself after a bar of 3 s (shell/asks.ts, resultAsk), unless something on the result has to be read. "Stop" pauses the run: nothing is read or listened to by itself, the clock of a question
// stands still, and a tap on the field goes on. The ticks are the Courtyard's knock, softly (src/app/sound), and only in Hands-free.
const RESULT_BAR=3000, RESULT_OPEN=600;
/** What may be said at a result: "explain" only where there is something to explain (not on a term's page or a stage page). */
const resultWords=(a)=>a&&/\/(?:stop|stage)$/.test(a.key)?"Say “next” or “stop”":"Say “next”, “explain” or “stop”";
// the same, as the first line of the stop: the words to say, plainly
const resultShort=(a)=>a&&/\/(?:stop|stage)$/.test(a.key)?"Next or stop":"Next, explain or stop";
/** The soft tick that says a word was heard, in Hands-free. */
const tick=()=>{ if(handsFree()) cue("knock",{soft:true}); };
const PAUSED="Paused. Tap the field to go on.";
function startResult(a){
  offerNext(a,!!a.auto);
  if(listensAtResult()) listenAuto(a,true,RESULT_OPEN);        // after the sound of the result is over; the bar goes on while the microphone listens
  else paint();
}
/** Hands-free listens at a result only where "Listen at the result" is on (off by default: the result is read, and a tap goes on). */
const listensAtResult=()=>!!state.voice.atResult;
/** The result waits to be left, as an answer waits for Yes; `auto`: it goes on after a bar. */
function offerNext(a,auto){
  const v=state.voice;
  dropPend(); dropChip();
  const p=v.pend={key:a.key,said:"",label:"Next",apply:()=>{ if(!tapStation()) next(); },auto:null,result:true};
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
  if(c==="explain"||alts.some((h)=>/^check(?: it| this| that)?$/.test(plainWords(h)))){
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
  askTutor();       // the microphone stays closed while Claude writes, and opens again once the explanation is there (voiceAfterRender)
  paint();
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

/* ---------- an answer that waits for its confirmation, and the step that can still be taken back just after it went on ---------- */
// The answer goes on by itself after a short bar, when the mode is Hands-free (the default, "split") or Settings says so: 2.5 s, and 1.5 s in Sprint. Where the microphone is tapped
// (or held) the person is looking at the screen, and it waits for Yes. The Sprint clock is stopped while the answer waits (holdFor), so neither the bar nor Yes counts against
// the time. Just after it went on, "back", "no" or Escape takes the step back for a few seconds (nothing is drawn for it: the next screen is not cluttered with the last answer).
const PAUSE_BLITZ=1500, PAUSE_CALM=2500, CHIP_MS=6000;
const autoOn=()=>{ const c=state.voice.confirm; return c==="auto"||(c==="split"&&handsFree()); };
// `quick`: a yes or no to a question goes on at once (a second Yes would only repeat the first), unless Settings says to always wait; "back" or Escape takes it back for a few seconds
function offer(a,heard,label,apply,quick,row){
  const v=state.voice;
  dropPend(); dropChip();
  v.note=""; v.bad=false; v.tries=0;
  if(quick==="now"||(quick&&v.confirm!=="wait")){
    quiet(); letGo("resume");
    played(row,apply,(undo)=>{
      if(typeof undo==="function") showChip({label,key:a.key},undo); else paint();
      // the same question is still asked (categories ticked, more may be said): in Hands-free the microphone opens again for the rest
      const b=asked(); if(!b||b.key!==a.key) return;
      if(a.kind==="cats"){ v.note="Ticked "+label+". Say more, or “check”."; paint(); }
      if(handsFree()&&v.phase==="idle") hear(b,true);
    });
    return;
  }
  holdFor();
  const h=String(heard).trim().replace(/[.!]+$/,"");
  const p=v.pend={key:a.key,said:same(h,label)?"Heard":"Heard “"+h+"”, taken as",label,apply,auto:null,row};
  if(autoOn()){ const ms=state.blitz?PAUSE_BLITZ:PAUSE_CALM; p.auto={ms,t0:performance.now(),tid:setTimeout(()=>{ if(v.pend===p) confirm(); },ms)}; }
  paint();
  tick();
  if(!p.auto&&ongoing()) hear(a);     // listens for "yes", "no" or another answer
  else if(p.auto&&hearing()) hear(a,false,false,true);     // and over the bar for a correction: "no", "wait", "wrong", "stop", "cancel", or another answer
}
function dropPend(){
  const v=state.voice, p=v.pend;
  if(!p) return;
  if(p.auto) clearTimeout(p.auto.tid);
  v.pend=null; v.retry=false;
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
  // the slow signal of Hands-free has reached what was said: the step goes on from there, with no second climb
  const climbed=!!(p.auto&&p.row&&performance.now()-p.auto.t0>=p.auto.ms-60);
  dropPend(); quiet();
  if(!a||a.key!==p.key){ letGo("moved"); return; }
  // the clock stays held while the choice slides, so the answer's time is the time it took to say it; then it goes on (a new step starts its own)
  played(p.row,p.apply,(undo)=>{
    letGo("moved");
    if(typeof undo==="function") showChip(p,undo);
    else if(typeof undo==="string") stayAt(p,undo);
  },climbed);
}
// An answer said is taken as a tap takes it, with the same motion, after a signal that runs up the thread from the stop to it (voice lab round 4, "the fuse"): `row` is
// the choice it stands for, which then slides onto the path (path/parts.tsx, pickThen; it is lit for a moment where the choices do not slide), or a field ({field, text}),
// into which the words are then typed. Then `apply`, whose return goes to `done`. Taken at once under reduced motion, before the first screen is drawn, where a Sprint clock
// was running, or with nothing to climb to on the screen. `climbed`: the slow signal of Hands-free is already there.
function played(row,apply,done,climbed){
  const u=state.ui, t=aimOf(row);
  if(!t||!u||u.pk||(u.hold&&u.hold.run)||!moves()){ done(apply()); return; }
  // the signal stays (faded) until the step has gone on, so that nothing else is taken meanwhile
  const tok=String(performance.now()), mine=()=>{ const f=$("vfuse"); return !!f&&f.dataset.kind==="quick"&&f.dataset.tok===tok; };
  const fin=()=>{ if(mine()) dropFuse(); done(apply()); };
  setTimeout(()=>{ if(mine()) dropFuse(); },4000);     // a step the page dropped meanwhile (it went elsewhere) leaves no signal behind
  signal(t,climbed?0:FUSE_MS,()=>{
    if(t.row){ if(state.ui===u&&!u.pk) pickThen(t.row,fin); else fin(); }
    else typeIn(t.el,t.text,fin);
  },tok);
}

/* ---------- the signal on the thread: from the stop up to what was said ---------- */
const FUSE_MS=450, TICK_MS=120, TYPE_MS=34, TYPE_MAX=700;
// what an answer climbs to: the row of a choice (its mark) or a field, while it is on the screen
function aimOf(row){
  if(!row) return null;
  if(typeof row==="string"){ const r=document.querySelector("#path .chs .crow[data-k=\""+row+"\"]"); return r?{row,el:r,mark:r.querySelector(".mc")||r}:null; }
  const f=document.getElementById(row.field);
  return f&&f.closest("#path")?{el:f,mark:f,text:row.text||""}:null;
}
// where it runs: up the thread from the middle of the stop to the level of the mark (no higher than the top of the path's scroll), and across to it
function fuseGeom(t){
  const g=document.querySelector("#vmic .vg"); if(!g||!t||!t.el.isConnected) return null;
  const a=g.getBoundingClientRect(), m=t.mark.getBoundingClientRect(), sc=document.querySelector("#path .pscroll"), top=sc?sc.getBoundingClientRect().top:0;
  const pa=g.closest(".pa"), cs=pa?getComputedStyle(pa):null, lw=cs&&parseFloat(cs.getPropertyValue("--lw"))||2;
  // on the thread, wherever the stop is in its snap: the row's first column is the margin up to the thread
  const row=$("vmic"), x=row?row.getBoundingClientRect().left+(cs&&parseFloat(cs.getPropertyValue("--m"))||50):a.left+a.width/2;
  const y0=a.top+a.height/2, my=m.top+m.height/2, y1=Math.max(top,Math.min(y0,my));
  return {x,y0,y1,mx:m.left,my,lw,color:cs&&cs.getPropertyValue("--blue").trim()||"#2f4f9e"};
}
function fuseEl(gm,kind){
  let f=$("vfuse");
  if(!f){ f=document.createElement("i"); f.id="vfuse"; f.className="vfuse"; f.setAttribute("aria-hidden","true"); document.body.appendChild(f); }
  f.dataset.kind=kind;
  Object.assign(f.style,{left:(gm.x-gm.lw/2)+"px",top:gm.y1+"px",width:gm.lw+"px",height:Math.max(0,gm.y0-gm.y1)+"px",background:gm.color,color:gm.color});
  return f;
}
// the mark on what an answer stands for: how far its figure is from the thread, for the branch drawn to it (11-path-bridge.css)
function markAim(t){
  t.el.classList.add("vaim");
  if(!t.row) return;
  const pa=t.el.closest(".pa"), m=pa&&parseFloat(getComputedStyle(pa).getPropertyValue("--m"))||0, fig=t.mark.querySelector("svg,.d")||t.mark;
  t.el.style.setProperty("--vgx",Math.round(fig.getBoundingClientRect().left-t.el.getBoundingClientRect().left-m)+"px");
}
function dropFuse(){ const f=$("vfuse"); if(f) f.remove(); for(const e of document.querySelectorAll("#path .vaim")) e.classList.remove("vaim"); }
// how far the signal has climbed (0 to 1)
const climbOf=(f)=>{ const m=getComputedStyle(f).transform; const k=/^matrix\(([^)]+)\)$/.exec(m); return k?Math.max(0,Math.min(1,parseFloat(k[1].split(",")[3]))):(f.getAnimations().length?0:1); };
// the quick signal of a spoken answer: it climbs in `ms` (from where a slow one had got to), a tick reaches across to the mark, and `then`; the signal fades as the step goes on
function signal(t,ms,then,tok=""){
  const gm=fuseGeom(t);
  if(!gm){ then(); return; }
  const was=$("vfuse"), from=was&&was.dataset.kind==="slow"?climbOf(was):0;
  const f=fuseEl(gm,"quick");
  f.dataset.tok=tok;
  f.getAnimations().forEach((x)=>x.cancel());
  markAim(t);
  const done=()=>{ const k=tickEl(gm); const end=()=>{ k.remove(); then(); f.animate([{opacity:1},{opacity:0}],{duration:260,fill:"forwards"}); };
    k.animate([{transform:"scaleX(0)"},{transform:"scaleX(1)"}],{duration:TICK_MS,easing:"ease-out",fill:"forwards"}).finished.then(end,end); };
  const d=Math.round(ms*(1-from));
  if(d<20){ f.style.transform="scaleY(1)"; done(); return; }
  f.animate([{transform:"scaleY("+from+")"},{transform:"scaleY(1)"}],{duration:d,easing:"cubic-bezier(.5,0,.3,1)",fill:"forwards"}).finished.then(done,done);
}
function tickEl(gm){
  const k=document.createElement("i"); k.className="vtick"; k.setAttribute("aria-hidden","true");
  Object.assign(k.style,{left:gm.x+"px",top:(gm.my-gm.lw/2)+"px",height:gm.lw+"px",width:Math.max(0,gm.mx-gm.x)+"px",background:gm.color});
  document.body.appendChild(k);
  return k;
}
// the words go into the field as if typed, letter by letter (no longer than TYPE_MAX in all)
function typeIn(el,text,then){
  if(!(el instanceof HTMLInputElement||el instanceof HTMLTextAreaElement)||!text){ then(); return; }
  // the field is the page's (a controlled input that the next case may reuse): what it held comes back just before the step, which then writes the words where they belong
  const step=Math.min(TYPE_MS,TYPE_MAX/text.length), was=el.value; let i=0;
  el.value="";
  const go=()=>{ if(!el.isConnected){ then(); return; } i++; el.value=text.slice(0,i); if(i<text.length) setTimeout(go,step); else setTimeout(()=>{ el.value=was; then(); },140); };
  go();
}
// Hands-free: the answer that waits climbs slowly, for the whole pause, to the choice or the field it stands for, which is marked so that it is plain where it goes;
// a touch holds it (the climb goes, the mark stays until the answer goes or is changed). Drawn again after each paint and as the page scrolls.
function syncAim(){
  const p=state.voice.pend, t=p&&!p.result?aimOf(p.row):null, f=$("vfuse"), quick=!!f&&f.dataset.kind==="quick";
  if(quick) return;                  // a step is going on: its own signal ends it
  for(const e of document.querySelectorAll("#path .vaim")) if(!t||e!==t.el) e.classList.remove("vaim");
  if(!t){ if(f) f.remove(); return; }
  markAim(t);
  if(!p.auto||!moves()){ if(f) f.remove(); return; }
  const gm=fuseGeom(t); if(!gm) return;
  const n=fuseEl(gm,"slow");
  if(!n.getAnimations().length) n.animate([{transform:"scaleY(0)"},{transform:"scaleY(1)"}],{duration:p.auto.ms,delay:-Math.max(0,performance.now()-p.auto.t0),easing:"linear",fill:"forwards"});
}

// the station at the foot is taken as a tap takes it, with its ride or its scan (path/shell.tsx, Station: a click no pointer made); `kind`: only a station of that kind
// (the Check). False when there is none to take, and the caller takes the step itself.
function tapStation(kind){
  const s=document.getElementById("stn");
  if(!s||(kind&&!s.classList.contains("stk-"+kind))) return false;
  s.click();
  return true;
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
// "back" or "no" just after it went on, or Escape: the screen it came from comes back as it was, and the microphone opens without the question being read again
function undoTaken(){
  const v=state.voice, c=v.chip;
  if(!c) return;
  dropChip(); quiet(); letGo("moved");
  v.noRead=true; c.undo(); v.noRead=false;
  paint();
}

/* ---------- the field above the foot ---------- */
// Above the foot the thread passes a stop that is the microphone (path/shell.tsx, VoiceField; this module builds it and repaints it in place): the row beside it, from the thread to the edge, is the touch area.
// One touch area for two ways of talking: a tap listens until a pause; pressing and holding for longer than HOLD_MS listens while it is held and sends the moment it is let go. With an answer
// waiting, a tap is Yes and a hold says it again; a touch while the app reads cuts the reading off and listens at once. Above it a quiet line says the question again (tap), stops the reading
// (tap while it reads) or pauses it for this visit (hold, or the M key). The stop is there only where the screen
// asks something; nothing in it crosses the thread or boxes the ground.
const HOLD_MS=350, MUTE_MS=500;
const HINT={reply:()=>"Say “"+Wd().acc+"” or “"+Wd().why+"”. After “"+Wd().why+"”, the counter-example.",example:()=>"Say the counter-example.",
  relation:()=>"Say the relation, such as “four possibilities”, or what is written under it.",cell:a=>CELL_FULL[a.cell]+": say an example, or “nothing”."};
// what is said in the field besides its fixed words: what is heard as it is said, a miss, a word on the first question
function statusText(){
  const v=state.voice;
  if(v.phase==="listening"){ const a=asked(); return v.live?v.live:v.note||(v.pend&&!v.pend.result?"":a&&a.kind==="result"?resultShort(a):"Listening…"); }       // (an answer that waits keeps its words; it listens for "yes" beneath them)
  if(v.blocked) return "The browser reads aloud only after a tap on the page. Tap the speaker to hear the question.";
  if(v.note) return v.note;
  if(v.pend||v.chip) return "";
  if(v.held&&reading()) return "Tap the speaker to hear the question"+(hearing()?", or here to answer.":".");
  if(v.held&&handsFree()) return "Tap here to start answering.";
  return "";
}
/** The strip that says the question again is shown: Read aloud is chosen and the device can speak, on a screen that asks something. */
export const readShown=()=>{ const a=asked(); return enabled()&&!state.voice.hush&&!!a&&!a.quiet&&state.voice.read&&canSpeak(); };
/** The soft keyboard is not to rise over the field: a touch screen with the microphone field on it (shell/render.js, focusCin: a case that ran out of time). */
export const keysStayDown=()=>micShown()&&typeof matchMedia==="function"&&matchMedia("(pointer: coarse)").matches;
/** The microphone field is shown: Answer by voice is on, on a screen that asks something. */
export const micShown=()=>{ const a=asked(); return enabled()&&!!a&&hearing()&&!(a.kind==="result"&&!listensAtResult()&&!a.auto); };       // (a result that goes on by itself keeps the stop for its bar)
// what the field shows: it listens, it is reading, an answer waits for Yes, an answer is going on by itself, or it is at rest
const fieldState=()=>{ const v=state.voice, p=v.pend&&!v.pend.result?v.pend:null; return p&&p.auto?"going":v.phase==="listening"?"listen":p?"heard":v.phase==="speaking"?"read":"idle"; };       // (over the bar the microphone listens for a correction; the bar is what shows)
// the speaker at the right end of the stop's row, which says the question again
function topNode(){
  const v=state.voice;
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
  // at a result nothing waits for a tap: the station at the foot goes on, the stop listens as on any screen; where it goes on by itself the thread under the stop fills
  const res=!!(p&&p.result), w=res||(v.retry&&st==="listen")?null:p;       // a retry listens as anywhere: the answer it may replace waits out of sight
  // the pause before an answer goes on by itself: where it climbs to a choice or a field the signal on the thread shows it (syncAim); elsewhere a line draws itself around the stop
  const ring=!!(p&&p.auto&&(st!=="listen"||res)&&(res||!aimOf(p.row)));
  // the icon says what a tap does now (voice lab round 7, P): the microphone, a stop square while it listens, a check where an answer waits for Yes (nothing while it goes on by itself)
  const yes=!!w&&!w.auto&&!(v.hold&&st==="listen");       // a tap is Yes (in Hands-free the microphone may listen for "yes" meanwhile)
  const icon=yes?iconSvg("check","vok"):st==="listen"?el("span",{class:"vsq"}):w?null:iconSvg("mic");
  kids.push(el("div",{class:"vg"},icon,ring?ringSvg(p.auto):null));
  // two lines that keep their place in every state: the first says what is (the prompt, then the words as they are heard), the second names a gesture only where it is new or in use
  const hint=yes?"tap to confirm":st==="going"?"tap to retry":st==="listen"?(v.hold?"‹ slide to cancel":""):!w&&!v.tried?"tap, or hold to talk":"";
  const line1=w?el("div",{class:"vwhat",role:"status","aria-live":"polite"},el("b",{text:w.label}))
    :text?el("div",{class:stClass(),id:"vlive",role:"status","aria-live":"polite",text})
    :el("div",{class:"vlab",text:res?resultShort(a):"Say your answer"});
  // a note while an answer waits (heard something else) takes the place of the hint
  const line2=w&&text?el("div",{class:stClass(),id:"vlive",role:"status","aria-live":"polite",text})
    :el("div",{class:"vsub"},hint?el("span",{class:"vhint",text:hint}):null);
  kids.push(el("div",{class:"vtx"+(w?" vtake":"")},line1,line2));
  const label=res?(st==="listen"?"Listening. "+resultWords(a)+". Tap to finish.":"Answer by voice. "+resultWords(a)+". Tap, or hold to talk."):st==="heard"?"Yes, go on with "+p.label+". Hold to say it again.":st==="going"?"Going on with "+p.label+". Tap to say it again.":st==="listen"?(v.hold?"Listening while you hold. Let go to send.":"Listening. Tap to finish."):"Answer by voice. Tap, or hold to talk.";
  const n=el("div",{class:"vmic"+(w?" pend":""),id:"vmic",role:"button",tabindex:"0","data-quiet":"1","aria-label":label,"aria-pressed":st==="listen"?"true":"false",title:st==="idle"&&a?(a.hint||HINT[a.kind](a)):null,
    onpointerdown:micDown,onclick:micClick,onkeydown:micKey,oncontextmenu:e=>e.preventDefault()},kids);
  return n;
}
function ringSvg(auto){
  const NS="http://www.w3.org/2000/svg", s=document.createElementNS(NS,"svg"), path=document.createElementNS(NS,"path");
  s.setAttribute("class","vring"); s.setAttribute("viewBox","0 0 40 40"); s.setAttribute("aria-hidden","true");
  path.setAttribute("d","M20 1.5 L38.5 20 L20 38.5 L1.5 20 Z"); path.setAttribute("pathLength","100");
  s.style.setProperty("--d",auto.ms+"ms"); s.style.setProperty("--e",Math.max(0,Math.round(performance.now()-auto.t0))+"ms");
  s.appendChild(path);
  return s;
}
/** What the Path draws above the foot (path/shell.tsx, VoiceField): the field, or nothing where the screen asks nothing. */
export function voiceField(){
  const rd=readShown(), mic=micShown();
  if(!rd&&!mic) return null;
  const v=state.voice, st=fieldState(), top=topNode();
  const more=el("button",{type:"button",class:"vmorebtn","data-quiet":"1",onclick:scrollMore},el("span",{text:"More below"}),iconSvg("down"));
  // at a result Hands-free keeps listening (in stretches, with short gaps between them): the stop stays on the thread until it has rested or the run is paused
  const on=st==="listen"||(mic&&!!v.pend&&v.pend.result&&ongoing()&&listensAtResult()&&!v.explWait&&v.tries<2);
  return el("div",{class:"vfield"+(mic?"":" nomic")+(on?" on":"")+(st==="listen"&&v.live?" speech":"")+(v.hold?" hold":"")+(moreBelow()?" more":""),id:"vfield","data-s":st},
    el("div",{class:"vtopc"},top),mic?micNode():null,more,el("div",{class:"vsr",role:"status","aria-live":"polite",text:srText()}));
}
// what a screen reader is told: the children of a button are not read, so the answer that waits and a miss are said from here (not what is heard as it is said)
function srText(){
  const v=state.voice, p=v.pend;
  if(p&&p.result) return "The result is on screen. "+resultWords(asked())+", or take the station to go on.";
  if(p) return p.said+" "+p.label+(p.auto?". Going on.":". Tap the field for Yes, or hold it to say it again.");
  if(v.phase==="listening") return "Listening.";
  return v.note||"";
}
// the field again, in place, without rendering the screen (which would rebuild the fields and move the focus). The touch area stays the same node, so that a finger on it keeps its target
function paint(){ paintField(); syncAim(); moreSync(); snapSync(); }
// The stop snaps onto the thread when it starts to listen and back into the margin when it stops. The Path draws the field anew on many of its draws (path/ui.tsx, Bridge),
// and a node drawn anew has no "before" to move from, so the move is played here, from where the stop was to where it is now, whichever node shows it.
const SNAP={duration:220,easing:"cubic-bezier(.3,1.55,.55,1)"};
function snapSync(){
  const v=state.voice, g=/** @type {HTMLElement|null} */(document.querySelector("#vmic .vg"));
  if(!g){ v.snapOn=null; return; }
  const f=$("vfield"), on=!!f&&(f.classList.contains("on")||!!g.closest(".pend"));
  if(v.snapOn!=null&&on!==v.snapOn&&moves()&&typeof g.animate==="function"&&!g.classList.contains("drag")){
    const rest="calc(22px - var(--m)) 0", there="0px 0";
    g.animate([{translate:on?rest:there},{translate:on?there:rest}],SNAP);
  }
  v.snapOn=on;
}
function paintField(){
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
    // the stop stays the same node, so that it moves (snaps onto the thread, or back to the margin) instead of being drawn anew in its place
    const og=om.querySelector(".vg"), ng=nm.querySelector(".vg");
    if(og&&ng){ og.className=ng.className+(og.classList.contains("drag")?" drag":""); og.replaceChildren(...ng.childNodes); ng.replaceWith(og); }
    om.replaceChildren(...nm.childNodes);
  }
}
// more of the screen below the field: the path's scroll is not at its end
const scrollOf=()=>{ const f=$("vfield"), pa=f&&f.closest(".pa"); return pa?pa.querySelector(".pscroll"):null; };
function moreBelow(){ const sc=scrollOf(); return !!sc&&sc.scrollHeight-sc.scrollTop-sc.clientHeight>24; }
function moreSync(){ const f=$("vfield"); if(f) f.classList.toggle("more",moreBelow()); }
function scrollMore(){ const sc=scrollOf(); if(sc) sc.scrollBy({top:Math.round(sc.clientHeight*0.7),behavior:moves()?"smooth":"auto"}); }
// as the page scrolls or is resized: "More below", and where the slow signal runs
const syncSoon=()=>{ const v=state.voice; if(v.syncTid||!enabled()) return; v.syncTid=requestAnimationFrame(()=>{ v.syncTid=0; if($("vfield")){ moreSync(); syncAim(); } }); };
document.addEventListener("scroll",syncSoon,{capture:true,passive:true});
addEventListener("resize",syncSoon);
function paintLive(){ const s=$("vlive"); if(!s){ paint(); return; } if(s){ s.textContent=statusText(); s.className=stClass(); } const f=$("vfield"); if(f) f.classList.toggle("speech",state.voice.phase==="listening"&&!!state.voice.live); }
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
  if(v.pend&&v.pend.result) freezePend();      // at a result a touch listens, as anywhere: the station goes on (a bar that runs stops, the result stays)
  const waits=!!v.pend&&!v.pend.result, wasAuto=waits&&!!v.pend.auto;
  if(waits&&v.phase==="listening") quiet();             // the mic that listens for "yes" gives way to the tap (Hands-free, waiting for Yes)
  // where the answer goes on by itself a touch is a retry: the bar stops and the microphone listens for another answer (what was heard waits for Yes until one is taken)
  const p=v.press={t0:performance.now(),was:!waits&&v.phase==="listening",long:/** @type {boolean} */(false),tid:null,pid:ev.pointerId,yes:waits&&!wasAuto,auto:wasAuto,x0:ev.clientX,dx:0};
  if(p.yes) freezePend();                    // where an answer waits for Yes a tap is Yes, and a hold says another
  else if(!p.was||wasAuto){ if(wasAuto) v.retry=true; hear(a,false,true); }
  p.tid=setTimeout(()=>{ if(v.press!==p) return; p.long=true; if(p.yes){ p.yes=false; hear(a,false,true); } v.hold=!p.was; paint(); },HOLD_MS);
  paint();
  document.addEventListener("pointerup",micUp,true); document.addEventListener("pointercancel",micUp,true); document.addEventListener("pointermove",micMove,true);
}
// a finger that slides toward the margin takes the stop with it (not an answer that waits); past half the way it is off the thread and the listening stops when it lets go
const OFF_PX=28;
function micMove(ev){
  const p=state.voice.press; if(!p||ev.pointerId!==p.pid) return;
  spotAt(ev);
  if(p.yes) return;
  p.dx=Math.min(0,Math.max(-OFF_PX,ev.clientX-p.x0));
  const g=document.querySelector("#vmic .vg"); if(!g) return;
  if(p.dx<-4){ g.classList.add("drag"); g.style.setProperty("--vdx",p.dx+"px"); }
  else{ g.classList.remove("drag"); g.style.removeProperty("--vdx"); }
}
function letStop(){ const g=document.querySelector("#vmic .vg"); if(g){ g.classList.remove("drag"); g.style.removeProperty("--vdx"); } }
function micUp(ev){
  const v=state.voice, p=v.press;
  if(p&&ev&&ev.pointerId!==p.pid) return;                   // another finger lifting is not this press
  document.removeEventListener("pointerup",micUp,true); document.removeEventListener("pointercancel",micUp,true); document.removeEventListener("pointermove",micMove,true);
  v.press=null; v.hold=false;
  if(!p) return;
  clearTimeout(p.tid);
  letStop();
  const h=v.stop;
  if(!p.yes&&p.dx<=-OFF_PX/2){ quiet(); v.note=""; paint(); return; }     // slid back off the thread: nothing is sent
  if(p.was){ if(h) h.stop(); }                              // it was listening: a press stops it
  else if(p.yes){ if(!ev||ev.type==="pointercancel"){ paint(); return; } if(!p.auto){ confirm(); return; } }    // a tap is Yes; where it was going on by itself the touch only held it
  else if(h&&h.release){ if(p.long) h.stop(); else h.release(); }
  paint();
}
// a click that no touch or key made (a screen reader's "activate"): it does what a tap does
function micClick(ev){
  if(ev.detail!==0) return;
  ev.preventDefault();
  if(state.voice.pend&&!state.voice.pend.result){ confirm(); return; }
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
  if(v.muted){ v.note="Reading is paused for this visit. Tap the speaker to hear the question."; v.bad=false; if(speaking&&ongoing()) hear(a,true); else paint(); }
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
// a field of the page takes the focus (a tap on an example to correct it, on a phone): typing takes over, and the microphone stops listening for the question it was asked;
// an answer that waited is dropped. A tap on the stop listens again (Hands-free goes on by itself at the next step).
// Only a focus that follows the learner's own tap counts: the page also focuses the next field itself when a step goes on (by voice too), and a tap on the stop, a station or a choice is not a turn to the keyboard.
document.addEventListener("pointerdown",(e)=>{
  const t=e.target;
  state.voice.tapAt=t instanceof Element&&t.closest("#path")&&!t.closest("#vfield, #stn, .crow")?Date.now():0;
},true);
document.addEventListener("focusin",(e)=>{
  const t=e.target;
  if(!enabled()||!(t instanceof HTMLElement)||!t.classList.contains("pfield")||!t.closest("#path")||Date.now()-state.voice.tapAt>1000) return;
  const v=state.voice;
  if(v.phase!=="listening"&&!v.pend) return;
  if(v.press) micUp();
  if(v.pend&&!v.pend.result){ dropPend(); letGo("resume"); }
  quiet(); v.note=""; paint();
});
document.addEventListener("visibilitychange",()=>{ if(document.hidden&&enabled()){ if(state.voice.press) micUp(); quiet(); endReading(); paint(); } });

/* ---------- the Voice choices of the Practice options (drawn by the Path: path/options.tsx) and the Voice row of Settings (path/settings.tsx) ---------- */
export const SAMPLE="Do you accept that if it is a product, it follows it is a functional thing?";
export const RATES=[[0.85,"Slow"],[1,"Normal"],[1.25,"Fast"]];
const KEYS={read:"rd-voice-read",answer:"rd-voice-answer",confirm:"rd-voice-confirm",atResult:"rd-voice-result",voiceId:"rd-voice-name",rate:"rd-voice-rate"};
export function setVoice(k,val){
  const v=state.voice;
  v[k]=val;
  if(k==="read"&&val) v.muted=false;
  if(k==="answer"&&v.paused){ v.paused=false; if(!v.pend) letGo("fresh"); }
  try{ localStorage.setItem(KEYS[k],k==="read"||k==="atResult"?(val?"1":"0"):String(val)); }catch(e){}
  if(k==="read"||k==="answer") keepOwn(k,val);   // each exercise keeps its own (practice/per-exercise.ts)
  render();
  if(k==="read"&&val) armVoice();
  if((k==="read"&&val)||k==="voiceId"||k==="rate") readOut(SAMPLE);
}
// The Answer by voice switch of Experiments: the choice is kept on the device, whatever the default of the build was
export function setOn(on){
  const v=state.voice;
  v.on=on; try{ localStorage.setItem("rd-voice",on?"1":"0"); }catch(e){}
  if(on) armVoice();
  if(!on){ quiet(); dropPend(); dropChip(); letGo("moved"); v.key=""; v.muted=false; v.paused=false; }
  render();
}
/** The top bar's Voice switch, beside Sprint's: there where this exercise reads aloud or answers by voice. Off, nothing is read or listened to and the field is gone,
 *  on every exercise, until it is switched on again; the choices of the Practice options stay as they were. */
export const voiceSwitchShown=()=>voiceShown()&&(state.voice.read&&canSpeak()||state.voice.answer!=="off"&&input()&&canHear());
export function setHush(hush){
  const v=state.voice;
  if(hush){ if(v.press) micUp(); quiet(); endReading(); dropPend(); dropChip(); letGo("moved"); v.key=""; v.note=""; v.paused=false; }
  v.hush=hush; try{ localStorage.setItem("rd-voice-hush",hush?"1":"0"); }catch(e){}
  if(!hush) v.key="";                // the question on screen is read or listened to again, as when it first came
  render();
}
/** What the Answer by voice switch of Settings does (the Path draws the same row). */
export const voiceNote=()=>"Lets you answer by voice, with your browser’s own speech recognition. In Chrome, what you say is sent to Google to be turned into text. Once it is on, its choices are in the Practice options, under Voice.";
/** Whether this browser can listen, so that Experiments has an Answer by voice row; and whether it is on. */
export const voiceAvailable=()=>canHear();
export const voiceOn=()=>input();
/** Whether the Practice options offer Answer by voice. */
export const answerShown=()=>input()&&canHear();
/** An answer waits for Yes: Escape takes it back, wherever the focus is (shell/keys.js). */
export const voicePending=()=>enabled()&&!!state.voice.pend&&!(state.voice.pend.result&&state.ui&&(state.ui.dterm||state.ui.pop));       // (Escape closes a definition or a note opened from a result first)
/** The ids the voice list gives the server's voices, and the choice "best on this device" (a device voice is chosen by its own id; "" is the default, which is the server's first voice where it has some). */
export const serverId=id=>SERVER+id;
export const BEST="best";
/** The words about the natural voices on the Voice page, when the server has some. */
export const REMOTE_NOTE="The natural voices are made by Google\u2019s text-to-speech from the words of each question, which this app\u2019s server sends there and does not keep. When there is no connection, or the day\u2019s limit for them is used up, your device\u2019s voice reads instead.";
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
export function hookVoices(){ const v=state.voice; if(!v.hooked){ v.hooked=true; onVoices(()=>{ if(state.sessOpen&&state.sessPage==="read") render(); }); } }
// the words of the Voice choices and of the Voice page
export const READ_LEAD="Read aloud says each question when it appears. It uses your device’s own speech, so the voices depend on the device and the browser.";
export const ANSWER_LEAD="Answer by voice makes the lower part of the screen a field to tap or hold. It uses your device’s own speech recognition, so how well it hears you depends on the device and the browser.";
export const READ_NOTE="The speaker line above the bottom says the question again (or press R); hold it, or press M, to pause the reading for this visit.";
export const ANSWER_PICKS=[["off","Off","No microphone."],
  ["tap","Tap or hold","Tap the lower part of the screen, or press V, and say the answer; or hold it and talk, and let go to send."],
  ["auto","Hands-free","Listens by itself after each question is read, and goes on by itself after a short bar. The result stays until you go on (in Sprint it goes on after 3 seconds); with Listen at the result, say “next”, “explain” or “stop” there. “Repeat” and “skip” work too."]];
export const CONFIRM_PICKS=[["split","Wait in tap mode, go on in Hands-free","Tapping the field waits for Yes (tap it again). Hands-free goes on by itself after a bar of 2.5 seconds (1.5 in Sprint)."],
  ["wait","Always wait for Yes","Tap, Enter or “yes”; hold to say it again (or Escape, or “no”)."],
  ["auto","Always go on by itself","After the bar. Saying “back” or “no”, or Escape, takes it back for a few seconds."]];
export const RESULT_PICKS=[["off","Leave the result to taps","The microphone rests at the result: read it, then tap the station to go on. In Sprint the result still goes on by itself after its bar."],
  ["on","Listen at the result","The microphone stays open at the result for “next”, “explain” or “stop”; after an explanation it opens again once the explanation is there."]];
export const VOICE_SAY="Say Accept or Why? (with the example), the relation by name or as written under the option, or an example; “nothing” leaves a cell empty. In Syllogisms say “I accept”, “the reason is not established” or “there is no pervasion”, then a counter-example or “skip”; in Categories the categories the thing is in (“a color and a shape”, or their numbers, or “none of these”), or yes or no to each; in Find a pair two phenomena (“wood and fire”); in Find an instance a thing, or “nothing”. "+
  "In Hands-free also say “next”, “explain”, “repeat”, “skip this pair” or “stop”. The Sprint clock stops while a question is read and while an answer waits. Chrome sends the audio to Google to turn it into text; the app records nothing and keeps only the answer, as if typed.";
