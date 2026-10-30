import { state } from "../state.js";
import { asking, startQ, stopTimer } from "../debate/flow.js";
import { render } from "./render.js";
import { switchTo } from "./tabs.js";

/* ---------- the roadmap ---------- */
// The roadmap (path/roadmap.tsx) lies under the exercise and is open while `menuOpen` is set: where you are and where else you can go. The Blitz clock stands still behind it and
// starts again, with its full time, when it closes.
export function toggleMenu(on){
  const was=state.menuOpen; state.menuOpen=on===undefined?!was:on;
  if(state.menuOpen&&!was) stopTimer();
  else if(!state.menuOpen&&was&&state.blitz&&asking()) startQ();
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
