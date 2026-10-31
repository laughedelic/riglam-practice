import { state } from "../state.js";
import { render } from "./render.js";
import { switchTo } from "./tabs.js";

/* ---------- the roadmap ---------- */
// The roadmap (path/roadmap.tsx) lies under the exercise and is open while `menuOpen` is set: where you are and where else you can go. The Sprint clock stands still behind it and
// goes on from where it stood when it closes (shell/timers.js).
export function toggleMenu(on){
  const was=state.menuOpen; state.menuOpen=on===undefined?!was:on;
  render();
}
/** The way back to the roadmap (the top bar's chevron, and Back from Review opened from the roadmap): what is open over the exercise closes on the way (the
 *  practice options, Settings, Review), and the exercise waits under the roadmap as it was. */
export function toRoad(){
  state.fromRoad=false;
  if(state.sessOpen){ state.sessOpen=false; state.sessPage=null; state.resetAsk=""; }
  state.optsOpen=false;
  if(state.tab==="review") switchTo(state.own);
  toggleMenu(true);
}
