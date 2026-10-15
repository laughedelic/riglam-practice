import { state } from "../state.js";
import { ORDER } from "../core/rel.js";
import { isWide } from "../core/viewport.js";
import { checkDebate, chooseD, sayQ } from "../debate/flow.js";
import { toggleFav } from "../practice/favorites.js";
import { next } from "../practice/queue.js";
import { choose } from "../practice/screen.js";
import { skipPair } from "../practice/skips.js";
import { closeChat } from "./chat.js";
import { toggleOpts } from "./options.js";
import { render } from "./render.js";
import { voiceKey } from "./voice.js";

document.addEventListener("click",e=>{ if(state.ui&&state.ui.pop&&!(/** @type {Element} */(e.target).closest&&/** @type {Element} */(e.target).closest(".pop,.why"))){ state.ui.pop=null; render(); } });
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){ if(state.optsOpen){ toggleOpts(false); return; } if(state.view==="chat"){ closeChat(); return; } if(state.ui&&state.ui.pop){ state.ui.pop=null; render(); return; } }
  if(state.mode!=="quiz"||!state.ui||state.optsOpen||state.view||e.metaKey||e.ctrlKey||e.altKey) return;
  const t=e.target&&/** @type {Element} */(e.target).tagName;
  if((e.key==="v"||e.key==="r"||e.key==="Enter"||e.key==="Escape")&&!e.shiftKey&&t!=="INPUT"&&t!=="TEXTAREA"&&t!=="SELECT"&&(t!=="BUTTON"||e.key!=="Enter")&&voiceKey(e.key)){ e.preventDefault(); return; }
  if((e.key==="f"||e.key==="F")&&!e.shiftKey&&t!=="INPUT"&&t!=="TEXTAREA"&&state.db&&state.cur&&state.cur.p&&state.tab!=="review"){ e.preventDefault(); toggleFav(state.cur.p); return; }
  if(state.tab==="practice"&&!state.ui.debate){
    if(!state.ui.checked&&t!=="INPUT"&&/^[1-5]$/.test(e.key)&&(isWide()||!state.ui.rel||state.ui.open)){ e.preventDefault(); choose(ORDER[+e.key-1]); }
    else if(!state.ui.checked&&t!=="INPUT"&&t!=="TEXTAREA"&&(e.key==="s"||e.key==="S")&&!e.shiftKey){ e.preventDefault(); skipPair(); }
    else if(state.ui.checked&&e.key==="Enter"&&t!=="BUTTON"&&t!=="INPUT"&&t!=="TEXTAREA"){ e.preventDefault(); next(); }
  } else if(state.tab==="debate"&&state.ui.debate){
    if(t==="INPUT"||t==="TEXTAREA") return;
    const k=e.key.toLowerCase();
    if(!state.ui.checked&&state.ui.step<4){
      if(state.ui.pickWhy) return;
      if(k==="a"||k==="y"){ e.preventDefault(); sayQ("accept"); } else if(k==="w"||k==="n"||k==="?"){ e.preventDefault(); sayQ("why"); } else if(k==="s"&&!e.shiftKey){ e.preventDefault(); skipPair(); }
    } else if(!state.ui.checked){
      if(/^[1-5]$/.test(k)&&(isWide()||state.ui.open)){ e.preventDefault(); chooseD(ORDER[+k-1]); }
      else if(k==="enter"&&state.ui.rel&&!state.ui.open&&t!=="BUTTON"){ e.preventDefault(); checkDebate(); }
      else if(k==="s"&&!e.shiftKey){ e.preventDefault(); skipPair(); }
    } else if(k==="enter"&&t!=="BUTTON"){ e.preventDefault(); next(); }
  }
});
