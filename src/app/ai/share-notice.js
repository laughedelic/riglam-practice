import { state } from "../state.js";
import { $, el } from "../core/dom.js";
import { render } from "../shell/render.js";

/* ---------- the one-time notice before a device's examples are kept ---------- */
// Where the server keeps the examples the tutor checked (state.learns), a learner who opened the app from a Magic Key link has not been asked anything. So the first time an explain
// question would name their examples, the page tells them what is kept and lets them say no right there: a card at the head of the tutor's answer (the coach panel on a wide screen,
// the Why chip on a narrow one), in the flow of the page, so it covers neither the answer nor the practice options it points to. That first question goes out without the `share`
// marker, so the server keeps nothing of it. The marker is sent only once the learner has answered, here or with the switch in the practice options (`setShare`), and
// `rd-share-told` remembers that on this device. The card has no way to close it other than the two answers.

/** The learner's answer, from the notice or from the switch in the practice options: the examples are shared or not, and the learner has been told. Redraw after it. */
export function setShare(on){
  state.shareExamples=on; state.shareTold=true;
  try{ localStorage.setItem("rd-share",on?"1":"0"); localStorage.setItem("rd-share-told","1"); }catch(e){}
}

// the card is gone from the screen, so the keyboard goes back to the follow-up field (or to the page, where there is none)
function answer(on){
  setShare(on); render();
  const i=$("ask-in"); if(i&&!("ontouchstart" in window)) i.focus({preventScroll:true}); else $("stage").focus({preventScroll:true});
}

/** The card at the head of an answer that came with the first question to name examples, until the learner has answered it (here, in the practice options or in another tab); null otherwise. */
export function shareNotice(){
  if(!state.ui||!state.ui.shareAsk||state.shareTold) return null;
  return el("div",{class:"sharenote",role:"status"},
    el("p",{class:"sn-t",text:"Share your examples?"}),
    el("p",{text:"When the AI tutor checks an example you wrote, its words can be kept so that "+(state.known?"other learners get answers sooner and ":"")+"we all build knowledge together. Nothing else is done with them, and nothing that says who you are is kept, so please leave names out of your examples."}),
    el("div",{class:"sn-a"},
      el("button",{type:"button",class:"btn",onclick:()=>answer(true)},"Share"),
      el("button",{type:"button",class:"btn ghost",onclick:()=>answer(false)},"Don’t share")),
    el("p",{class:"sn-s",text:"You can change this any time in the practice options."}));
}
