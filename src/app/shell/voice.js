import { state } from "../state.js";
import { $, el } from "../core/dom.js";
import { ORDER, REL } from "../core/rel.js";
import { isWide } from "../core/viewport.js";
import { chooseD, sayQ, startQ, stopTimer, submitWhy } from "../debate/flow.js";
import { Wd, termSing } from "../debate/text.js";
import { check } from "../practice/grading.js";
import { choose, fillable } from "../practice/screen.js";
import { NOT } from "../../ai-shared/debate.ts";
import { plainWords, spokenExample, spokenRelation, spokenReply } from "../../domain/spoken.ts";
import { canHear, canSpeak, listen, onVoices, speak, stopSpeaking, voiceList } from "../../ui/speech";
import { CELL_FULL, render } from "./render.js";
import { tbIcon } from "./timers.js";

/* ---------- voice: the questions read aloud, answers by voice ---------- */
// Two settings in Options, each on its own: Read aloud says each question when it appears; Answer by voice adds a microphone
// under the answer controls (tap it, or press V), or listens by itself after each question (Hands-free). Both use the
// browser's own speech (src/ui/speech.ts). What was heard goes through the same steps as a tap or a typed answer
// (sayQ, choose, the cell's text), so the saved answers look as they always did; nothing of the voice is stored.
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
  if(state.mode!=="quiz"||!u||!p||u.checked||state.optsOpen||state.view||state.timeEdit) return null;
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

// Called at the end of every render (shell/render.js).
export function voiceAfterRender(){
  if(!enabled()) return;
  const v=state.voice, a=asked(), key=a?a.key:"";
  if(key===v.key) return;
  v.key=key; quiet(); v.note=v.carry; v.bad=false; v.carry=""; v.tries=0; v.blocked=false;
  if(a&&reading()) say(a,a.say,true);
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
// `first`: the reading that comes with a new screen; when it ends, the clock of the question starts again
function say(a,text,first){
  const v=state.voice, tok={};
  quiet(); v.tok=tok; v.phase="speaking"; v.blocked=false; paint();
  speak(text,{voice:v.voiceId,rate:v.rate,done:(ok,err)=>{
    if(v.tok!==tok) return;
    v.tok=null; v.phase="idle";
    // Chrome speaks only after the person has tapped or typed on the page once; the speaker button is that tap
    if(!ok&&err==="not-allowed"){ v.blocked=true; paint(); return; }
    if(ok&&first) clockFrom(a);
    // after speaking, the audio output needs a moment before the microphone opens (the Voice lab's finding)
    if(handsFree()) setTimeout(()=>{ if(v.key===a.key&&v.phase==="idle"&&!v.tok) hear(a); },350);
    else paint();
  }});
}
// The Blitz countdown and a question's response time count from the end of the reading, not from when the question appeared.
// Only a question and the relation start again; the countdown of the examples covers all the cells of a pair.
function clockFrom(a){
  const u=state.ui;
  if(!u||u.checked) return;
  if(a.kind==="reply"){ startQ(); render(); }
  else if(a.kind==="relation"&&u.tq){ stopTimer(); render(); }
}
function hear(a){
  const v=state.voice, tok={};
  quiet(); v.tok=tok; v.phase="listening"; v.note=""; v.bad=false; paint();
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
  "network":"The speech service could not be reached (the browser sends the audio there to turn it into text).","aborted":"","unsupported":"This browser has no speech recognition."};
function missed(a,err){
  const v=state.voice;
  if(err==="no-speech"&&handsFree()&&v.tries<1){ v.tries++; hear(a); return; }
  v.note=MISS[err]!=null?MISS[err]:"Could not listen ("+err+").";
  v.bad=err!=="aborted"; paint();
}
// heard, but not an answer to this screen: say what would be, and in Hands-free listen again (twice at most)
function again(a,heard,hint){
  const v=state.voice;
  v.note="Heard “"+heard+"”. "+hint; v.bad=true;
  if(!handsFree()||v.tries>=2){ paint(); return; }
  v.tries++;
  if(reading()) say(a,hint); else hear(a);
}
const same=(x,y)=>plainWords(x)===plainWords(y);
const heardLine=(heard,took)=>{ const h=String(heard).trim().replace(/[.!]+$/,""); return "Heard “"+h+"”"+(same(h,took)?".":", taken as “"+took+"”."); };
// what was heard, applied as the tap or the typed answer it stands for; the note goes with it to the next screen
function take(a,alts){
  const v=state.voice, u=state.ui, w=Wd();
  if(a.kind==="reply"){
    const r=spokenReply(state,alts);
    if(!r) return again(a,alts[0],"Say “"+w.acc+"” or “"+w.why+"”.");
    const ex=r.say==="why"&&r.example?r.example.text:"";
    v.carry=heardLine(r.heard,(r.say==="accept"?w.acc:w.why)+(ex?" "+ex:""));
    sayQ(r.say,{example:ex});
    return;
  }
  if(a.kind==="example"){
    const r=spokenReply(state,alts);
    // changed their mind: back from Why? and accept (as Back, then Accept, without showing the question again in between)
    if(r&&r.say==="accept"&&!r.example){ v.carry=heardLine(r.heard,w.acc); u.ans[u.step].say=null; u.pickWhy=false; u.exText=""; sayQ("accept",{}); return; }
    const x=r&&r.say==="why"&&r.example?r.example:spokenExample(state,alts);   // "why, a gold ring" said again is the example too
    if(!x||x.none) return again(a,alts[0],"Name the counter-example, or say “"+w.acc+"”.");
    v.carry=heardLine(x.heard,x.text); u.exText=x.text; submitWhy();
    return;
  }
  if(a.kind==="relation"){
    const k=spokenRelation(alts,/** @type {import("../../ai-shared/relations.ts").RelKey[]} */(ORDER));
    if(k==="3") return again(a,alts[0],"Three possibilities: which way? Say “A in B” or “B in A”.");
    if(!k) return again(a,alts[0],"Say the relation, such as “four possibilities”.");
    v.carry=heardLine(alts[0],REL[k].name);
    if(u.debate) chooseD(k); else choose(k,true);
    return;
  }
  const x=spokenExample(state,alts);
  if(!x) return again(a,alts[0],"Say an example, or “nothing”.");
  u.cells[a.cell].t=x.none?"":x.text;
  v.carry=heardLine(x.heard,x.none?"nothing":x.text);
  const order=fillable(), i=order.indexOf(a.cell);
  if(i>=order.length-1){ if(document.activeElement instanceof HTMLElement) document.activeElement.blur(); check(); }
  else { u.ci=i+1; render(); }
}

/* ---------- the voice bar: under the answer controls of a screen that asks something ---------- */
const HINT={reply:()=>"Say “"+Wd().acc+"” or “"+Wd().why+"”. After “"+Wd().why+"”, the counter-example.",example:()=>"Say the counter-example.",
  relation:()=>"Say the relation, such as “four possibilities”.",cell:a=>CELL_FULL[a.cell]+": say an example, or “nothing”."};
function statusText(a){
  const v=state.voice;
  if(v.phase==="listening") return v.live?"“"+v.live+"”":"Listening…";
  if(v.blocked) return "The browser lets the page speak after a tap: tap the speaker.";
  // the table on a wide screen has four fields, so the note says which cell is next
  if(v.note&&!v.bad&&a.kind==="cell"&&hearing()) return v.note+" Next: "+CELL_FULL[a.cell]+".";
  return v.note||(hearing()?HINT[a.kind](a):"");
}
export function voiceBar(){
  const v=state.voice, a=asked();
  if(!a||(!reading()&&!hearing())) return null;
  const on=v.phase==="listening", kids=[];
  if(reading()) kids.push(el("button",{type:"button",class:"ib vrd"+(v.blocked?" hot":""),title:"Read the question again (R)","aria-label":"Read the question again",onclick:()=>say(a,a.say)},tbIcon("speak")));
  if(hearing()) kids.push(el("button",{type:"button",class:"btn ghost vmic"+(on?" on":""),"aria-pressed":on?"true":"false",title:on?"Stop listening (V)":"Answer by voice (V)",onclick:toggleListen},
    tbIcon("mic"),el("span",{text:on?"Listening":"Speak"})));
  kids.push(el("span",{class:"vst"+(v.bad?" bad":""),id:"vlive",role:"status","aria-live":"polite",text:statusText(a)}));
  return el("div",{class:"vbar",id:"vbar"},kids);
}
// the bar again, in place, without rendering the screen (which would rebuild the fields and move the focus)
function paint(){
  const old=$("vbar"); if(!old) return;
  const had=old.contains(document.activeElement), nb=voiceBar();
  if(!nb){ old.remove(); return; }
  old.replaceWith(nb);
  if(had){ const b=nb.querySelector(".vmic")||nb.querySelector("button"); if(b) b.focus({preventScroll:true}); }
}
function paintLive(){ const s=$("vlive"), a=asked(); if(s&&a) s.textContent=statusText(a); }
export function toggleListen(){
  const v=state.voice, a=asked();
  if(!a||!hearing()) return false;
  if(v.phase==="listening"&&v.stop) v.stop.stop(); else hear(a);
  return true;
}
// the keys: V listens (or stops), R reads the question again; true when the key was taken
export function voiceKey(k){
  const a=asked(); if(!a) return false;
  if(k==="v") return toggleListen();
  if(k==="r"&&reading()){ say(a,a.say); return true; }
  return false;
}
document.addEventListener("visibilitychange",()=>{ if(document.hidden&&enabled()){ quiet(); paint(); } });

/* ---------- the Options row ---------- */
const SAMPLE="Do you accept that if it is a product, it follows it is a functional thing?";
const RATES=[[0.85,"Slow"],[1,"Normal"],[1.25,"Fast"]];
function setVoice(k,val){
  const v=state.voice;
  v[k]=val;
  try{ localStorage.setItem({read:"rd-voice-read",answer:"rd-voice-answer",voiceId:"rd-voice-name",rate:"rd-voice-rate"}[k],k==="read"?(val?"1":"0"):String(val)); }catch(e){}
  render();
  if((k==="read"&&val)||k==="voiceId"||k==="rate") speak(SAMPLE,{voice:v.voiceId,rate:v.rate});
}
export function voiceRow(row,segOf){
  if(!enabled()||(!canSpeak()&&!canHear())) return null;
  const v=state.voice, box=el("div",{class:"vopts"});
  if(!v.hooked){ v.hooked=true; onVoices(()=>{ if(state.optsOpen) render(); }); }
  if(canSpeak()){
    box.append(el("button",{type:"button",class:"sw",role:"switch","aria-checked":v.read?"true":"false",onclick:()=>setVoice("read",!v.read)},
      el("i",{class:"knob","aria-hidden":"true"}),el("span",{class:"swl",text:"Read aloud"}),el("span",{class:"swt",text:"each question"})));
    if(v.read){
      const list=voiceList(), sel=el("select",{class:"vsel","aria-label":"Voice"},
        el("option",{value:"",text:"Best on this device"+(list[0]?" ("+list[0].name+")":"")}),
        list.map(x=>el("option",{value:x.id,text:x.name+" · "+x.lang+(x.local?"":" · online"),selected:x.id===v.voiceId})));
      sel.addEventListener("change",e=>setVoice("voiceId",/** @type {HTMLSelectElement} */(e.target).value));
      box.append(el("div",{class:"vline"},sel,el("button",{type:"button",class:"btn ghost vtry",onclick:()=>speak(SAMPLE,{voice:v.voiceId,rate:v.rate}),text:"Try"})),
        segOf("Speed of reading",RATES,v.rate,r=>setVoice("rate",r)));
    }
  }
  if(canHear()) box.append(el("div",{class:"vline"},el("span",{class:"swl",text:"Answer by voice"}),
    segOf("Answer by voice",[["off","Off"],["tap","Tap the mic"],["auto","Hands-free"]],v.answer,k=>setVoice("answer",k))));
  return row("Voice",box,"Reading uses this device's voices. Answering uses the browser's speech recognition, which in Chrome sends the audio to Google to turn it into text; "+
    "the app records nothing and keeps only the answer, as if typed. Tap the mic (or press V) to answer; Hands-free listens after each question. "+
    "Say Accept or Why? (with the example), the relation by name, or an example; “nothing” leaves a cell empty.");
}
