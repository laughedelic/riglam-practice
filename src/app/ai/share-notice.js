import { state } from "../state.js";
import { el } from "../core/dom.js";

/* ---------- the one-time notice before a device's examples are kept ---------- */
// Where the server keeps the examples the tutor checked (state.learns), a learner who opened the app from a Magic Key link has not been asked anything. So the first time an explain
// question would name their examples, the page tells them what is kept and lets them say no right there: a small card under the top bar (like the notice of a newer version).
// That first question goes out without the `share` marker, so the server keeps nothing of it. The marker is sent only once the learner has answered, here or with the switch in the
// practice options (`setShare`), and `rd-share-told` remembers that on this device. The card has no way to close it other than the two answers.

/** The learner's answer, from the notice or from the switch in the practice options: the examples are shared or not, and the learner has been told. */
export function setShare(on){
  state.shareExamples=on; state.shareTold=true;
  try{ localStorage.setItem("rd-share",on?"1":"0"); localStorage.setItem("rd-share-told","1"); }catch(e){}
  hideShareNotice();
}

export function hideShareNotice(){
  const n=document.getElementById("sharenote");
  if(n) n.remove();
}

export function showShareNotice(){
  if(document.getElementById("sharenote")) return;
  document.body.append(el("div",{id:"sharenote",role:"region","aria-label":"Sharing your examples"},
    el("p",{class:"sn-t",text:"Build knowledge together"}),
    el("p",{text:"When the AI tutor checks an example you wrote, its words are kept so that other learners get answers sooner and you all build knowledge together. Nothing about you is kept, and nothing else is done with it."}),
    el("p",{class:"sn-s",text:"You can change this any time in the practice options."}),
    el("div",{class:"sn-a"},
      el("button",{type:"button",class:"btn",onclick:()=>setShare(true)},"Share"),
      el("button",{type:"button",class:"btn ghost",onclick:()=>setShare(false)},"Don’t share"))));
}
