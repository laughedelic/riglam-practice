import { state } from "../state.js";
import { asking, startQ, stopTimer } from "../debate/flow.js";
import { render } from "./render.js";

/* ---------- Settings: what belongs to the app, the device and the account (how an exercise looks and ticks is in its Practice options, session.js) ---------- */
// Sharing the learner's examples is here, not in the practice options: it is set once and forgotten (the dialog of ai/share-notice.js asks the first time, and points here).
// Settings opens from the roadmap over the exercise, with a back arrow; Back or Escape closes it. (In the code it is still `optsOpen`; path/settings.tsx draws it.)
// The Blitz clock does not run behind the panel: it stops when Settings opens and starts again, with its full time, when it closes (as when you come back to an exercise).
export function toggleOpts(on){
  const was=state.optsOpen; state.optsOpen=on===undefined?!state.optsOpen:on;
  if(!state.optsOpen){ state.optsPage=null; state.newsDirect=false; }
  // opened from the roadmap, Settings goes back to it, not to the exercise under it (shell/history.js)
  const road=!state.optsOpen&&was&&state.fromRoad; if(road){ state.fromRoad=false; state.menuOpen=true; }
  if(state.optsOpen&&!was) stopTimer();
  else if(!state.optsOpen&&was&&!road&&state.blitz&&asking()) startQ();
  render();
  if(state.optsOpen&&state.updates) state.updates.check(60000); // the Version row is about to be read: look for a newer one unless a look is younger than a minute
}
// which build this is, and where the update stands: the commit tells a staging build from the one before it. With `state.updates` the app
// updates in place (the button reloads it); without, the page only says whether the server has a newer build.
/** The Version row's words and its one step: `act` is "update", "check" or null. */
export function aboutInfo(a){
  const when=(()=>{ const d=new Date(a.builtAt); return isNaN(d.getTime())?"":d.toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"}); })();
  const u=state.updates, st=u?u.status():null;
  const status=u?{ready:"A newer version is ready.",downloading:"Downloading a newer version.",checking:"Checking for a newer version.",
      unknown:"Could not check for a newer version (no connection?).",current:"This is the newest version."}[st]
    :a.latest==="newer"?"A newer version is out. Close the app completely and open it again to use it."
    :a.latest==="current"?"This is the newest version.":"Could not check for a newer version (no connection?).";
  return {line:"Version "+a.version+" · build "+a.commit+(when?" · "+when:""),from:a.branches?"Built from: "+a.branches.join(", "):"",status,bad:!u&&a.latest==="newer",
    act:!u?null:st==="ready"?"update":st==="current"||st==="unknown"?"check":null};
}
/** What sharing the examples means, for its row in Settings. */
export function shareNote(){
  const known=!!state.known, quorum=!!(state.quorumOffered&&state.db);
  return "When Claude checks an example the page could not, this app\u2019s server keeps the words of the example (not who wrote it, which pair it was for, or where you put it)"
      +(known?", so that the same example can be checked later without Claude.":", to build a shared reference of examples with other learners.")
      +(known?" Your checks are answered from what it learned this way, from your examples and from other people\u2019s.":"")
      +" Turn this off to keep your examples out of it: checks work as before"+(known?", and you still get answers learned from other people\u2019s examples":"")+"."
      +(quorum?" Quorum, in the practice options, is separate: it keeps its own runs, whatever this says.":"");
}
/** The Magic Key row's sentence: the device has none yet (`held` false), has it, or is asked whether to forget it. */
export const keyNote=held=>!held?"The definitions and Claude (Explain) need the Magic Key from your study group's link. This device has none yet: open the link once on this device, or paste it here."
  :state.keyAsk?"Forget the Magic Key on this device? The definitions and Claude close again until a key is entered. Your answers and settings stay. An account that carries the key gives it back when you sign in."
  :"This device has the Magic Key, so the definitions and Claude are open. If the study group changed the key, enter the new one; or forget the key on this device.";
