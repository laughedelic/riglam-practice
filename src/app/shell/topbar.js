import { state } from "../state.js";
import { $ } from "../core/dom.js";
import { tbIcon } from "../core/icons.js";
import { isWide } from "../core/viewport.js";
import { setBlitz } from "../debate/flow.js";
import { openChat, syncChatBtn, toggleCoach } from "./chat.js";
import { exName } from "./exercises.js";
import { isEx } from "./render.js";
import { openBlitzOptions, syncSessBtn, toggleSess } from "./session.js";
import { setTab } from "./tabs.js";
import { syncBlitzBtn, timerBar } from "./timers.js";

/* ---------- the top bar: the mode of practice ---------- */
// Left, the menu (in Review, the back arrow to the exercise under it); then the name of the screen; at the right what applies to this exercise as a whole:
// the Blitz switch, the practice options, and the tutor's chat as the right-most button, the mirror of the menu. The bar keeps these places whatever the step of the
// pair, so nothing shifts when a result appears. What belongs to this pair (Skip, the star, the forward button) is in the bar below (shell/pbar.js). The Blitz countdown
// runs along the lower edge of this bar, over its line, so it is at the top of every exercise, in the eye's way, and nothing moves when Blitz is switched.
export function renderBar(){
  const rv=state.tab==="review";
  $("mback").hidden=!rv; $("menubtn").hidden=rv&&!isWide();
  $("mttl").textContent=rv?"Review":isEx()?exName(state.tab):"";
  syncBlitzBtn(); syncSessBtn(); syncChatBtn();
  const bar=$("mbar"), tb=timerBar(); bar.querySelector(".mbt")?.remove();
  if(tb){ tb.classList.add("mbt"); bar.append(tb); }
}
$("mback").append(tbIcon("back"));
$("mback").addEventListener("click",()=>setTab(state.own));
// A press switches Blitz; holding the stopwatch opens the Blitz page of the practice options instead (the page is also under the sliders button, for a keyboard or a
// pointer that does not hold). The click that ends a hold is not a press, so it is taken before it reaches anything (the sheet that has opened under the pointer
// would take it as a click on its scrim), and the browser's own menu for a long touch is kept away.
const HOLD_MS=500;
function eatNextClick(){
  const eat=e=>{ e.stopPropagation(); e.preventDefault(); };
  const done=()=>setTimeout(()=>document.removeEventListener("click",eat,true),0);
  document.addEventListener("click",eat,{capture:true,once:true});
  document.addEventListener("pointerup",done,{capture:true,once:true});
  document.addEventListener("pointercancel",done,{capture:true,once:true});
}
const mbz=$("mbz");
mbz.addEventListener("pointerdown",e=>{ if(e.button) return; clearTimeout(state.bzHold); state.bzHold=window.setTimeout(()=>{ eatNextClick(); openBlitzOptions(); },HOLD_MS); });
for(const t of ["pointerup","pointerleave","pointercancel"]) mbz.addEventListener(t,()=>clearTimeout(state.bzHold));
mbz.addEventListener("contextmenu",e=>e.preventDefault());
mbz.addEventListener("click",()=>setBlitz(!state.blitz));
$("msess").addEventListener("click",()=>toggleSess(true));
$("mchat").addEventListener("click",()=>{ if(isWide()) toggleCoach(); else openChat(); });
