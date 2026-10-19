import { state } from "../state.js";
import { closeChat } from "./chat.js";
import { toggleOpts } from "./options.js";
import { toggleSess } from "./session.js";
import { setTab } from "./tabs.js";

/* ---------- the system Back (key, button, swipe) ---------- */
// The app has one address, so on a phone Back would leave it. Instead the page keeps one history entry (same address) for each level
// above Home that is open: an exercise or Review, then the tutor chat view, then Options or the settings of an exercise. Back takes one off and closes
// that level: the settings or Options, then the chat, then the exercise or Review (back to Home); Back on Home leaves the app. Moving between exercises and Review
// replaces the level instead of adding one. The page only sets the state (open a screen, close a panel); after each render the number
// of entries is brought in line with it (`navSync`). Each entry carries its depth, so a step forward onto an entry whose level is gone is
// told apart from a step back, and taken back. The Claude artifact's frame is left alone (its history is the host's), and where the
// browser refuses an entry nothing changes: every level still closes with its own button.
const MARK="riglamNav";
const canPush=()=>{ try{ return window.parent===window; }catch(e){ return false; } };
// how many levels are open above Home, from the state alone
const depth=()=>(state.tab!=="home"?1:0)+(state.view==="chat"?1:0)+(state.optsOpen?1:0)+(state.sessOpen?1:0);
function sync(){
  state.navQ=false;
  if(state.navSkip>0||!canPush()) return;
  const want=depth(), have=state.navDepth;
  try{
    if(want>have){ for(let d=have+1;d<=want;d++) history.pushState({[MARK]:d},""); state.navDepth=want; }
    else if(want<have){ state.navSkip++; state.navDepth=want; history.go(want-have); }
  }catch(e){ state.navSkip=0; state.navDepth=want; }
}
// Called after each render. Several renders of one action (close Options, open an exercise) are settled together, once.
export function navSync(){ if(!state.navQ){ state.navQ=true; queueMicrotask(sync); } }
// Back closes the top level: Options, then the chat view, then the exercise or Review.
function closeTop(){
  if(state.sessOpen) toggleSess(false); else if(state.optsOpen) toggleOpts(false); else if(state.view==="chat") closeChat(); else if(state.tab!=="home") setTab("home");
}
addEventListener("popstate",e=>{
  if(state.navSkip>0){ state.navSkip--; if(!state.navSkip) navSync(); return; }   // the end of a step back the page took itself
  const at=e.state&&e.state[MARK]||0;
  if(at<state.navDepth){
    state.navDepth=at;
    for(let n=depth();n>at;n--) closeTop();                                      // each close renders; navSync then finds nothing to do
  } else if(at>state.navDepth){ state.navSkip++; history.go(state.navDepth-at); } // forward onto an entry whose level is gone: step back again
});
// After a reload on such an entry the app is on Home again but the entry stays: it becomes an ordinary one.
try{ if(history.state&&history.state[MARK]) history.replaceState(null,""); }catch(e){}
