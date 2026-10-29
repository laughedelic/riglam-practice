import { state } from "../state.js";
import { isWide } from "../core/viewport.js";
import { closeSkipAsk } from "../practice/skips.js";
import { closeChat } from "./chat.js";
import { toggleMenu } from "./menu.js";
import { toggleOpts } from "./options.js";
import { sessBack } from "./session.js";
import { setTab } from "./tabs.js";

/* ---------- the system Back (key, button, swipe) ---------- */
// The app has one address, so on a phone Back would leave it. Instead the page keeps one history entry (same address) for each level that is open. On a phone the
// menu is the root: the exercise is the first level above it, then Review, the tutor chat view, Settings, the practice options and one of their pages, the question
// before a skip. Back takes one off and closes that level: the question, the page or the sheet, Settings, the chat, Review (back to the exercise); Back on the exercise
// opens the menu, and Back on the menu leaves the app. A wide screen has no such root (its menu is a panel beside the exercise), so Back there leaves the app from the
// exercise. Moving between exercises replaces the level instead of adding one. The page only sets the state (open a screen, close a panel); after each render the number
// of entries is brought in line with it (`navSync`). Each entry carries its depth, so a step forward onto an entry whose level is gone is
// told apart from a step back, and taken back. The Claude artifact's frame is left alone (its history is the host's), and where the
// browser refuses an entry nothing changes: every level still closes with its own button.
const MARK="riglamNav";
const canPush=()=>{ try{ return window.parent===window; }catch(e){ return false; } };
// how many levels are open, from the state alone
const depth=()=>(isWide()?0:state.menuOpen?0:1)+(state.tab==="review"?1:0)+(state.view==="chat"?1:0)+(state.optsOpen?1:0)+(state.sessOpen?1:0)+(state.sessPage&&state.sessPage!=="progress"?1:0)+(state.skipAsk?1:0);
function sync(){
  state.navQ=false;
  if(state.navSkip>0||!canPush()) return;
  const want=depth(), have=state.navDepth;
  try{
    if(want>have){ for(let d=have+1;d<=want;d++) history.pushState({[MARK]:d},""); state.navDepth=want; }
    else if(want<have){ state.navSkip++; state.navDepth=want; history.go(want-have); }
  }catch(e){ state.navSkip=0; state.navDepth=want; }
}
// Called after each render. Several renders of one action (close Settings, open an exercise) are settled together, once.
export function navSync(){ if(!state.navQ){ state.navQ=true; queueMicrotask(sync); } }
// Back closes the top level, each close taking exactly one level off: the question before a skip, a page of the options or the sheet, Settings, the chat view, Review, and on a phone the exercise (the menu opens).
function closeTop(){
  if(state.skipAsk) closeSkipAsk();
  else if(state.sessOpen) sessBack();
  else if(state.optsOpen) toggleOpts(false);
  else if(state.view==="chat") closeChat();
  else if(state.tab==="review") setTab(state.own);
  else if(!isWide()&&!state.menuOpen) toggleMenu(true);
}
// Did the browser animate the Back itself? A swipe from the edge shows the page sliding away over the one before it, and `hasUAVisualTransition` of the popstate
// event says so. Then the panels the Back closes do not move as well. When it did not (the Back key or button, a keyboard), they move like any other close, the menu
// sliding in over the exercise. A browser that cannot say is taken to have animated it: better one motion missing than two.
addEventListener("popstate",e=>{
  if(state.navSkip>0){ state.navSkip--; if(!state.navSkip) navSync(); return; }   // the end of a step back the page took itself
  const at=e.state&&e.state[MARK]||0;
  if(at<state.navDepth){
    state.navDepth=at;
    state.navBack=e.hasUAVisualTransition!==false;                               // the browser has moved the screen away itself: the panels it closes do not move as well
    try{ for(let n=depth();n>at;n--) closeTop(); } finally{ state.navBack=false; } // each close renders; navSync then finds nothing to do
  } else if(at>state.navDepth){ state.navSkip++; history.go(state.navDepth-at); } // forward onto an entry whose level is gone: step back again
});
// After a reload on such an entry the app is on its first screen again and the entry stays: it becomes that screen's own (level 1 on a phone, 0 on a wide screen),
// so a reload adds no entry. (Entries behind it that the page had pushed before the reload belong to a page that is gone; stepping back onto one reloads the app.)
try{ if(history.state&&history.state[MARK]){ state.navDepth=depth(); history.replaceState({[MARK]:state.navDepth},""); } }catch(e){}
