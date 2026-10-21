import { state } from "../state.js";
import { $, el } from "../core/dom.js";
import { ORDER, REL } from "../core/rel.js";
import { isWide } from "../core/viewport.js";
import { chooseD, holdClock, releaseClock, sayQ, submitWhy } from "../debate/flow.js";
import { Wd, termSing } from "../debate/text.js";
import { check } from "../practice/grading.js";
import { choose, fillable } from "../practice/screen.js";
import { NOT } from "../../ai-shared/debate.ts";
import { plainWords, spokenConfirm, spokenDirection, spokenDontKnow, spokenExample, spokenRelation, spokenReply } from "../../domain/spoken.ts";
import { saveFeatures, withFeature } from "../../ui/features";
import { canHear, canSpeak, listen, onVoices, speak, stopSpeaking, voiceList } from "../../ui/speech";
import { CELL_FULL, render } from "./render.js";
import { renderBar } from "./topbar.js";
import { tbIcon } from "../core/icons.js";

/* ---------- voice: the questions read aloud, answers by voice ---------- */
// Two settings in Settings, each on its own: Read aloud says each question when it appears; Answer by voice adds a microphone
// under the answer controls (tap it, or press V), or listens by itself after each question (Hands-free). Both use the
// browser's own speech (src/ui/speech.ts). What was heard goes through the same steps as a tap or a typed answer
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
  if(state.mode!=="quiz"||!u||!p||u.checked||state.optsOpen||state.sessOpen||state.skipAsk||(state.menuOpen&&!isWide())||state.view) return null;
  const id=p.id||p.a+"|"+p.b;
  if(u.debate){
    if(state.tab!=="debate") return null;
    if(u.step<4) return u.pickWhy?{key:id+"/q"+u.step+"/ex",kind:"example",say:"Posit a counter-example."}
      :{key:id+"/q"+u.step,kind:"reply",say:(u.step===0?pairLine(p):"")+questionLine(u.step)};
    return u.rel?null:{key:id+"/rel",kind:"relation",say:"Which relation do your answers give?"};
  }
  if(state.tab!=="practice") return null;
  if(!u.rel||(u.open&&!isWide())) return {key:id+"/rel",kind:"relation",say:pairLine(p)+"What is the relation?"};
  const order=fillable(), c=order[Math.max(0,Math.min(u.ci||0,order.length-1))];
  return {key:id+"/c/"+c,kind:"cell",cell:c,say:CELL_ASK[c](termSing("A"),termSing("B"))};
}
// Voice is a feature on trial (src/ui/features.ts): until it is turned on for the device, none of this does anything.
const enabled=()=>state.features.includes("voice");
const reading=()=>enabled()&&state.voice.read&&canSpeak();
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
  letGo("fresh"); renderBar();
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
  if(first&&(a.kind==="reply"||a.kind==="relation")){ holdFor(); v.rhold=!!v.clockUi; }
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
function hear(a){
  const v=state.voice, tok={};
  quiet(); endReading();
  v.tok=tok; v.phase="listening"; v.note=""; v.bad=false; v.held=false; paint();
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
    if(k==="3"){ if(v.pend){ dropPend(); letGo("resume"); renderBar(); } v.ask3=true; return again(a,alts[0],"Three possibilities: which is inside the other, "+t.a+" or "+t.b+"?",true); }
    if(!k) return again(a,alts[0],v.ask3?"Say which is inside the other, "+t.a+" or "+t.b+".":"Say the relation, such as “four possibilities”, or what is written under it.");
    v.ask3=false;
    return offer(a,alts[0],REL[k].name,()=>{ if(state.ui.debate) chooseD(k); else choose(k,true); });
  }
  const x=spokenExample(state,alts);
  if(!x) return again(a,alts[0],"Say an example, or “nothing”.");
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
  if(reading()) say(a,NUDGE); else paint();
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
  dropPend(); quiet(); letGo("resume"); renderBar();
  v.note=""; v.bad=false;
  if(a&&hearing()) hear(a); else paint();
}

/* ---------- the voice bar: under the answer controls of a screen that asks something ---------- */
const HINT={reply:()=>"Say “"+Wd().acc+"” or “"+Wd().why+"”. After “"+Wd().why+"”, the counter-example.",example:()=>"Say the counter-example.",
  relation:()=>"Say the relation, such as “four possibilities”, or what is written under it.",cell:a=>CELL_FULL[a.cell]+": say an example, or “nothing”."};
function statusText(a){
  const v=state.voice;
  if(v.phase==="listening") return v.live?"“"+v.live+"”":"Listening…";
  if(v.blocked) return "The browser lets the page speak after a tap: tap the speaker.";
  if(v.held&&!v.pend){
    if(reading()) return "Tap the speaker to hear the question"+(handsFree()?", then answer when it stops.":hearing()?", or the microphone to answer.":".");
    if(handsFree()) return "Tap the microphone to start answering.";
  }
  if(v.pend) return v.note||(hearing()&&!v.pend.auto?"Say “yes” to go on, “no” to change it, or say another answer.":"");
  return v.note||(hearing()?HINT[a.kind](a):"");
}
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
  const on=v.phase==="listening", kids=[];
  if(reading()) kids.push(el("button",{type:"button",class:"ib vrd"+(v.blocked?" hot":""),title:"Read the question again (R)","aria-label":"Read the question again",onclick:()=>say(a,a.say,v.held)},tbIcon("speak")));
  if(hearing()) kids.push(el("button",{type:"button",class:"btn ghost vmic"+(on?" on":""),"aria-pressed":on?"true":"false",title:on?"Stop listening (V)":"Answer by voice (V)",onclick:toggleListen},
    tbIcon("mic"),el("span",{text:on?"Listening":"Speak"})));
  kids.push(el("span",{class:"vst"+(v.bad?" bad":""),id:"vlive",role:"status","aria-live":"polite",text:statusText(a)}));
  return el("div",{class:"vbar",id:"vbar"},el("div",{class:"vrow"},kids),pendNode());
}
// the bar again, in place, without rendering the screen (which would rebuild the fields and move the focus)
function paint(){
  const old=$("vbar"); if(!old) return;
  const had=old.contains(document.activeElement), nb=voiceBar();
  if(!nb){ old.remove(); return; }
  old.replaceWith(nb);
  // focus goes to Confirm, so that Enter confirms (a focused button would otherwise take the Enter for itself); with the pause
  // running it goes nowhere, and Enter and Escape reach the page
  if(had){ const b=state.voice.pend?nb.querySelector(".vok"):nb.querySelector(".vmic")||nb.querySelector("button"); if(b) b.focus({preventScroll:true}); }
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

/* ---------- the Voice row of Settings ---------- */
const SAMPLE="Do you accept that if it is a product, it follows it is a functional thing?";
const RATES=[[0.85,"Slow"],[1,"Normal"],[1.25,"Fast"]];
const KEYS={read:"rd-voice-read",answer:"rd-voice-answer",confirm:"rd-voice-confirm",voiceId:"rd-voice-name",rate:"rd-voice-rate"};
function setVoice(k,val){
  const v=state.voice;
  v[k]=val;
  try{ localStorage.setItem(KEYS[k],k==="read"?(val?"1":"0"):String(val)); }catch(e){}
  render();
  if((k==="read"&&val)||k==="voiceId"||k==="rate") speak(SAMPLE,{voice:v.voiceId,rate:v.rate});
}
// Voice is a feature on trial: its switch is the first control of its row, on or off (src/ui/features.ts keeps the choice on the device)
function setEnabled(on){
  state.features=withFeature(state.features,"voice",on); saveFeatures(state.features);
  if(!on){ quiet(); dropPend(); letGo("moved"); state.voice.key=""; }
  render();
}
// the voices by accent, American and British first
function voiceOptions(list,cur){
  const groups=[];
  for(const x of list){ let g=groups.find(y=>y.accent===x.accent); if(!g) groups.push(g={accent:x.accent,voices:[]}); g.voices.push(x); }
  const first=g=>g.accent==="American"?0:g.accent==="British"?1:2;
  groups.sort((x,y)=>first(x)-first(y));
  return groups.map(g=>el("optgroup",{label:g.accent},g.voices.map(x=>el("option",{value:x.id,text:x.name+" · "+x.lang+(x.local?"":" · online"),selected:x.id===cur}))));
}
export function voiceRow(row,segOf){
  if(!canSpeak()&&!canHear()) return null;
  const v=state.voice, on=enabled(), box=el("div",{class:"vopts"});
  box.append(el("button",{type:"button",class:"sw",role:"switch","aria-checked":on?"true":"false",onclick:()=>setEnabled(!on)},
    el("i",{class:"knob","aria-hidden":"true"}),el("span",{class:"swl",text:"Voice"}),el("span",{class:"swt",text:on?"on":"off"})));
  if(!on) return row("Voice",box,"On trial: the questions read aloud, and answers by voice. It is off until you turn it on here, on this device.");
  if(!v.hooked){ v.hooked=true; onVoices(()=>{ if(state.optsOpen) render(); }); }
  if(canSpeak()){
    box.append(el("button",{type:"button",class:"sw",role:"switch","aria-checked":v.read?"true":"false",onclick:()=>setVoice("read",!v.read)},
      el("i",{class:"knob","aria-hidden":"true"}),el("span",{class:"swl",text:"Read aloud"}),el("span",{class:"swt",text:"each question"})));
    if(v.read){
      const list=voiceList(), sel=el("select",{class:"vsel","aria-label":"Voice"},
        el("option",{value:"",text:"Best on this device"+(list[0]?" ("+list[0].name+")":"")}),voiceOptions(list,v.voiceId));
      sel.addEventListener("change",e=>setVoice("voiceId",/** @type {HTMLSelectElement} */(e.target).value));
      box.append(el("div",{class:"vline"},sel,el("button",{type:"button",class:"btn ghost vtry",onclick:()=>speak(SAMPLE,{voice:v.voiceId,rate:v.rate}),text:"Try"})),
        segOf("Speed of reading",RATES,v.rate,r=>setVoice("rate",r)));
    }
  }
  if(canHear()){
    box.append(el("div",{class:"vline"},el("span",{class:"swl",text:"Answer by voice"}),
      segOf("Answer by voice",[["off","Off"],["tap","Tap the mic"],["auto","Hands-free"]],v.answer,k=>setVoice("answer",k))));
    if(v.answer!=="off") box.append(el("div",{class:"vline"},el("span",{class:"swl",text:"After an answer is heard"}),
      segOf("After an answer is heard",[["tap","Wait for Confirm"],["auto","Go on by itself"]],v.confirm,k=>setVoice("confirm",k))));
  }
  return row("Voice",box,"Reading uses this device's voices, listed by accent. Answering uses the browser's speech recognition, which in Chrome sends the audio to Google to turn it into text; "+
    "the app records nothing and keeps only the answer, as if typed. Tap the mic (or press V) to answer; Hands-free listens after each question. "+
    "Say Accept or Why? (with the example), the relation by name or as it is written under the option, or an example; “nothing” leaves a cell empty. "+
    "An answer waits for Confirm (or “yes”, or Enter) and Change (or “no”, or Escape) takes it back; “Go on by itself” confirms it after 2 seconds in Blitz and 4 otherwise. "+
    "The Blitz clock is stopped while an answer waits.");
}
