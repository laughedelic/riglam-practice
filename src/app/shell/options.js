import { state } from "../state.js";
import { accountControls } from "../../ui/account";
import { dataTransferControls } from "../../ui/data-transfer";
import { MAGIC_KEY_NOTE } from "../../ui/magic-key-note.ts";
import { setShare } from "../ai/share-notice.js";
import { canAsk } from "../core/ask.js";
import { $, el } from "../core/dom.js";
import { asking, startQ, stopTimer } from "../debate/flow.js";
import { overHead } from "./chat.js";
import { render } from "./render.js";
import { settingRow as row, switchOf } from "./rows.js";
import { voiceRow } from "./voice.js";

/* ---------- Settings: what belongs to the app, the device and the account (how an exercise looks and ticks is in its Practice options, session.js) ---------- */
// Sharing the learner's examples is here, not in the practice options: it is set once and forgotten (the dialog of ai/share-notice.js asks the first time, and points here).
// Settings opens from the menu over the exercise, with a back arrow; Back or Escape closes it. (In the code it is still `optsOpen`.)
// The Blitz clock does not run behind the panel: it stops when Settings opens and starts again, with its full time, when it closes (as when you come back to an exercise).
export function toggleOpts(on){
  const was=state.optsOpen; state.optsOpen=on===undefined?!state.optsOpen:on;
  if(state.optsOpen&&!was) stopTimer();
  else if(!state.optsOpen&&was&&state.blitz&&asking()) startQ();
  render();
  if(state.optsOpen&&state.updates) state.updates.check(60000); // the Version row is about to be read: look for a newer one unless a look is younger than a minute
  if(state.optsOpen){ const b=document.querySelector("#over .oc"); if(b) b.focus({preventScroll:true}); }
  else { const b=[$("menubtn"),$("mback")].find(x=>x.offsetParent); if(b) b.focus({preventScroll:true}); }
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
// Where the app's server keeps the examples the tutor checked (`state.learns`): the device's say in it. Using the switch counts as having been told.
function shareRow(){
  const on=state.shareExamples, known=!!state.known, quorum=!!(state.quorumOffered&&state.db);
  return el("div",{class:"orow"},switchOf("Share my examples",on?"on":"off",on,()=>{ setShare(!on); render(); }),
    el("p",{class:"onote",text:"When the AI tutor checks an example the page could not, this app\u2019s server keeps the words of the example (not who wrote it, which pair it was for, or where you put it)"
      +(known?", so that the same example can be checked later without the AI.":", to build a shared reference of examples with other learners.")
      +(known?" Your checks are answered from what it learned this way, from your examples and from other people\u2019s.":"")
      +" Turn this off to keep your examples out of it: checks work as before"+(known?", and you still get answers learned from other people\u2019s examples":"")+"."
      +(quorum?" Quorum, in the practice options, is separate: it keeps its own runs, whatever this says.":"")}));
}
export function optionsInto(o){
  o.append(overHead("Settings",()=>toggleOpts(false),"Back to the exercise"));
  const box=el("div",{class:"opts",id:"opts"});
  // "Magic Key" in the label of its rows is dotted and opens a note on the name
  const mkBtn=()=>el("button",{type:"button",class:"keyname","aria-expanded":state.mkNote?"true":"false",onclick:()=>{ state.mkNote=!state.mkNote; render(); }},"Magic Key");
  const mkPop=()=>state.mkNote?el("div",{class:"pop"},MAGIC_KEY_NOTE.map(t=>el("p",{text:t})),el("button",{type:"button",class:"popx",onclick:()=>{ state.mkNote=false; render(); }},"Hide")):null;
  box.append(...[
    state.unlock?row(mkBtn(),el("button",{type:"button",class:"btn ghost",onclick:()=>{ toggleOpts(false); state.unlock.open(); }},"Enter the Magic Key"),
      "The definitions and the tutor (Explain) need the Magic Key from your study group's link. This device has none yet: open the link once on this device, or paste it here.","key",mkPop()):null,
    state.keyHeld?row(mkBtn(),keyControls(),
      state.keyAsk?"Forget the Magic Key on this device? The definitions and the tutor close again until a key is entered. Your answers and settings stay. An account that carries the key gives it back when you sign in."
        :"This device has the Magic Key, so the definitions and the tutor are open. If the study group changed the key, enter the new one; or forget the key on this device.","key",mkPop()):null,
    canAsk()&&state.learns?shareRow():null,
    state.account&&state.db&&state.account.view().available?row("Account",accountControls(state.account,el,render,state.acct)):null,
    voiceRow(),
    state.db?row("Your data",dataTransferControls(state.db,el,render,state.xfer),"Saves everything this device keeps (answers, debates, favorites, skipped pairs and these settings) in one file, as a backup or to move to another device. Importing adds what is missing and never deletes anything."):null,
    state.about?row("Version and updates",aboutNode(state.about)):null,
    el("p",{class:"onote",text:"How an exercise looks, ticks and is checked (notation, wording, Blitz times, definitions, the tutor\u2019s check) is set in its Practice options: the sliders button at the top of the exercise."})].filter(Boolean));
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
