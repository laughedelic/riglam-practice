import { state } from "../state.js";
import { accountControls } from "../../ui/account";
import { dataTransferControls } from "../../ui/data-transfer";
import { setQuorum } from "../ai/quorum.js";
import { MAGIC_KEY_NOTE } from "../../ui/magic-key-note.ts";
import { $, el } from "../core/dom.js";
import { asking, startQ, stopTimer } from "../debate/flow.js";
import { overHead } from "./chat.js";
import { render } from "./render.js";
import { settingRow as row, switchOf } from "./rows.js";

/* ---------- options: what belongs to the device and the account (the settings of an exercise are in session.js) ---------- */
// Options and the tutor chat are not tabs of the bar's three: Options is a place of it (the bar stays under it on a phone), the chat opens over the workspace (narrow screens only); both close with Back or Escape.
export function renderOptionsBtn(){
  for(const id of ["obtn","mopt"]){ const b=$(id); b.setAttribute("aria-expanded",state.optsOpen?"true":"false"); b.classList.toggle("open",state.optsOpen); }
}
// The Blitz clock does not run behind the panel: it stops when Options opens and starts again, with its full time, when it closes (as when you come back to an exercise).
export function toggleOpts(on){
  const was=state.optsOpen; state.optsOpen=on===undefined?!state.optsOpen:on;
  if(state.optsOpen&&!was) stopTimer();
  else if(!state.optsOpen&&was&&state.blitz&&asking()) startQ();
  render();
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
  const box=el("div",{class:"opts",id:"opts"});
  // "Magic Key" in the label of its rows is dotted and opens a note on the name
  const mkBtn=()=>el("button",{type:"button",class:"keyname","aria-expanded":state.mkNote?"true":"false",onclick:()=>{ state.mkNote=!state.mkNote; render(); }},"Magic Key");
  const mkPop=()=>state.mkNote?el("div",{class:"pop"},MAGIC_KEY_NOTE.map(t=>el("p",{text:t})),el("button",{type:"button",class:"popx",onclick:()=>{ state.mkNote=false; render(); }},"Hide")):null;
  box.append(...[
    state.quorumOffered&&state.db?row("Quorum",switchOf("Several models explain",state.quorum?"on":"off",state.quorum,()=>setQuorum(!state.quorum)),
      state.quorumOptIn
        ?"Optional: a deeper check, but slower. When the page could not check an example you wrote, three AI models (Haiku, Sonnet and Opus) each work it out and Opus rules where they differ, so the explanation is more reliable. An answer takes about a minute instead of a few seconds, and it counts against a daily limit of its own; when that is used up, one model answers as usual. The server keeps each such run (the pair with what you wrote, and the answers), so the models can be compared. With Quorum off, one model answers and nothing is kept."
        :"For testing, on this test server only. With Quorum on, the explanation of an answer with an example the page could not check comes from Haiku, Sonnet and Opus, each on its own; where they put an example in different cells, Opus reads their answers and writes the one you see. The Quorum chip under a result shows all of them. The server keeps each run (the pair with what you wrote, and the answers), so the models can be compared. When the page checked every example itself, and with Quorum off, one model answers as in the app and nothing is kept."):null,
    state.unlock?row(mkBtn(),el("button",{type:"button",class:"btn ghost",onclick:()=>{ toggleOpts(false); state.unlock.open(); }},"Enter the Magic Key"),
      "The definitions and the tutor (Explain) need the Magic Key from your study group's link. This device has none yet: open the link once on this device, or paste it here.","key",mkPop()):null,
    state.keyHeld?row(mkBtn(),keyControls(),
      state.keyAsk?"Forget the Magic Key on this device? The definitions and the tutor close again until a key is entered. Your answers and settings stay. An account that carries the key gives it back when you sign in."
        :"This device has the Magic Key, so the definitions and the tutor are open. If the study group changed the key, enter the new one; or forget the key on this device.","key",mkPop()):null,
    state.account&&state.db&&state.account.view().available?row("Account",accountControls(state.account,el,render,state.acct)):null,
    state.db?row("Your data",dataTransferControls(state.db,el,render,state.xfer),"Saves everything this device keeps (answers, debates, favorites, skipped pairs and these settings) in one file, as a backup or to move to another device. Importing adds what is missing and never deletes anything."):null,
    state.about?row("Version",aboutNode(state.about)):null,
    el("p",{class:"onote",text:"How an exercise looks and ticks (notation, wording of the questions, language of the definitions, Blitz times, the tutor\u2019s check) is set in the exercise: the sliders button."})].filter(Boolean));
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
