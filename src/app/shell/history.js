import { state } from "../state.js";
import { closeChat } from "./chat.js";
import { toggleOpts } from "./options.js";

/* ---------- the system Back (key, button, swipe) ---------- */
// Options and the tutor chat open over the page without a new address, so on a phone Back would leave the app. Each one that opens adds one history
// entry (same address), and Back takes it off again and closes the overlay. Closing from the page (its own Back button, Escape) closes at once and
// then takes the entry off, so the page never waits for the browser. The Claude artifact's frame is left alone (its history is the host's), and where
// the browser refuses an entry nothing changes: the overlay then closes with its own button only.
const MARK="riglamOverlay";
const canPush=()=>{ try{ return window.parent===window; }catch(e){ return false; } };
function back(){ state.ovPending++; try{ history.back(); }catch(e){ state.ovPending--; } }
export function overlayOpened(){
  if(!canPush()) return;
  try{ history.pushState({[MARK]:true},""); state.ovPushed++; }catch(e){}
}
export function overlayClosed(){
  if(state.ovPushed<1) return;
  state.ovPushed--; back();
}
addEventListener("popstate",e=>{
  if(state.ovPending>0){ state.ovPending--; return; }                       // the end of a step back the page took itself
  if(state.ovPushed>0){
    state.ovPushed--;
    if(state.optsOpen) toggleOpts(false,true); else if(state.view==="chat") closeChat(true);
    return;
  }
  if(e.state&&e.state[MARK]) back();                                          // forward onto an entry whose overlay is gone: step back again
});
// After a reload on such an entry the overlay is gone but the entry stays: it becomes an ordinary one.
try{ if(history.state&&history.state[MARK]) history.replaceState(null,""); }catch(e){}
