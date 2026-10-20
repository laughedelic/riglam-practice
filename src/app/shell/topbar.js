import { state } from "../state.js";
import { $ } from "../core/dom.js";
import { tbIcon } from "../core/icons.js";
import { isWide } from "../core/viewport.js";
import { setBlitz } from "../debate/flow.js";
import { openChat, syncChatBtn, toggleCoach } from "./chat.js";
import { exName } from "./exercises.js";
import { isEx } from "./render.js";
import { syncSessBtn, toggleSess } from "./session.js";
import { setTab } from "./tabs.js";
import { syncBlitzBtn } from "./timers.js";

/* ---------- the top bar: the mode of practice ---------- */
// Left, the menu (in Review, the back arrow to the exercise under it); then the name of the screen; at the right what applies to this exercise as a whole:
// the Blitz switch, the practice options, and the tutor's chat as the right-most button, the mirror of the menu. The bar keeps these places whatever the step of the
// pair, so nothing shifts when a result appears. What belongs to this pair (Skip, the star, the forward button) is in the bar below (shell/pbar.js).
export function renderBar(){
  const rv=state.tab==="review";
  $("mback").hidden=!rv; $("menubtn").hidden=rv&&!isWide();
  $("mttl").textContent=rv?"Review":isEx()?exName(state.tab):"";
  syncBlitzBtn(); syncSessBtn(); syncChatBtn();
}
$("mback").append(tbIcon("back"));
$("mback").addEventListener("click",()=>setTab(state.own));
$("mbz").addEventListener("click",()=>setBlitz(!state.blitz));
$("msess").addEventListener("click",()=>toggleSess(true));
$("mchat").addEventListener("click",()=>{ if(isWide()) toggleCoach(); else openChat(); });
