import { state } from "../state.js";
import { el } from "../core/dom.js";

/* ---------- the one-time dialog before a device's examples are kept ---------- */
// Where the server keeps the examples the tutor checked (state.learns), a learner who opened the app from a Magic Key link has not been asked anything. So the first time an
// explain question would name their examples, it waits for a dialog that tells them what is kept and has to be answered, Ok or Don't share: no way out of it but the two
// answers (Escape and a tap outside do nothing). The question then goes out with the learner's answer, so that first check is kept too if the answer is yes. The marker
// `share` is sent only for a learner who has answered, here or with the switch in Settings (`setShare`); `rd-share-told` remembers that on this device.

/** The learner's answer, from the dialog or from the switch in Settings: the examples are shared or not, and the learner has been told. Redraw after it. */
export function setShare(on){
  state.shareExamples=on; state.shareTold=true;
  try{ localStorage.setItem("rd-share",on?"1":"0"); localStorage.setItem("rd-share-told","1"); }catch(e){}
}

/** Opens the dialog and settles when the learner has answered it; a second call while it is open waits for the same answer. */
export function askShare(){
  if(state.shareAsk) return state.shareAsk;
  return state.shareAsk=new Promise(done=>{
    let answered=false;
    const answer=on=>{ answered=true; setShare(on); state.shareAsk=null; dlg.close(); dlg.remove(); done(); };
    const dlg=el("dialog",{class:"sharedlg","aria-labelledby":"sharedlg-h","aria-describedby":"sharedlg-t",tabindex:"-1"},
      el("h2",{id:"sharedlg-h",text:"Share your examples?"}),
      el("div",{id:"sharedlg-t"},
        el("p",{text:"When the AI tutor checks an example you wrote, its words can be kept, so that "+(state.known?"other learners get answers sooner and ":"")+"we all build knowledge together."}),
        el("p",{text:"Nothing else is done with them, and nothing about who you are is kept. Please leave names out of your examples."})),
      el("div",{class:"dact"},
        el("button",{type:"button",class:"btn",onclick:()=>answer(true)},"Ok"),
        el("button",{type:"button",class:"btn ghost",onclick:()=>answer(false)},"Don\u2019t share")),
      el("p",{class:"sn-s",text:"You can change this any time in Settings."}));
    // A key must never answer for the learner: Escape does nothing, and a browser that closes the dialog anyway (a second Escape) gets it opened again, with the focus
    // on the dialog and not on a button (opening it focuses the first button, and the Enter that follows would say Ok). A browser that cannot open a modal dialog at all
    // leaves the learner unasked, and nothing is named to the server for it (`state.shareTold` stays false).
    const open=()=>{ try{ dlg.showModal(); dlg.focus({preventScroll:true}); }catch(e){ answered=true; state.shareAsk=null; dlg.remove(); done(); } };
    dlg.addEventListener("keydown",e=>{ if(e.key==="Escape") e.preventDefault(); });
    dlg.addEventListener("cancel",e=>e.preventDefault());
    dlg.addEventListener("close",()=>{ if(!answered) open(); });
    document.body.append(dlg);
    open();
  });
}
