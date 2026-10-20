import { state } from "../state.js";
import { ORDER } from "../core/rel.js";
import { isWide } from "../core/viewport.js";
import { checkDebate, chooseD, sayQ } from "../debate/flow.js";
import { toggleFav } from "../practice/favorites.js";
import { next } from "../practice/queue.js";
import { choose } from "../practice/screen.js";
import { skipPair } from "../practice/skips.js";
import { closeDef } from "../practice/terms.js";
import { closeChat } from "./chat.js";
import { toggleOpts } from "./options.js";
import { render } from "./render.js";

// a tap outside a note closes it, and a tap outside a term's definition closes that (a tap on a term stops before this)
document.addEventListener("click",e=>{
  const u=state.ui, t=/** @type {Element} */(e.target), at=s=>!!(t.closest&&t.closest(s)); if(!u) return;
  const d=!!u.dterm&&!at(".ddef"), p=!!u.pop&&!at(".pop,.why"); if(d) u.dterm=null; if(p) u.pop=null; if(d||p) render();
});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){ if(state.optsOpen){ toggleOpts(false); return; } if(state.view==="chat"){ closeChat(); return; } if(state.ui&&state.ui.dterm){ closeDef(); return; } if(state.ui&&state.ui.pop){ state.ui.pop=null; render(); return; } if(state.ui&&state.ui.find&&state.ui.open&&!state.ui.checked){ state.ui.open=false; render(); return; } }
  if(state.mode!=="quiz"||!state.ui||state.optsOpen||state.view||e.metaKey||e.ctrlKey||e.altKey) return;
  const t=e.target&&/** @type {Element} */(e.target).tagName;
  if((e.key==="f"||e.key==="F")&&!e.shiftKey&&t!=="INPUT"&&t!=="TEXTAREA"&&state.db&&state.cur&&state.cur.p&&!state.cur.p.own&&state.tab!=="review"){ e.preventDefault(); toggleFav(state.cur.p); return; }
  if(state.tab==="practice"&&!state.ui.debate){
    if(!state.ui.checked&&t!=="INPUT"&&/^[1-5]$/.test(e.key)&&(isWide()||!state.ui.rel||state.ui.open)){ e.preventDefault(); choose(ORDER[+e.key-1]); }
    else if(!state.ui.checked&&t!=="INPUT"&&t!=="TEXTAREA"&&(e.key==="s"||e.key==="S")&&!e.shiftKey){ e.preventDefault(); skipPair(); }
    else if(state.ui.checked&&e.key==="Enter"&&t!=="BUTTON"&&t!=="INPUT"&&t!=="TEXTAREA"){ e.preventDefault(); next(); }
  } else if(state.tab==="find"&&state.ui.find){
    if(!state.ui.checked&&t!=="INPUT"&&t!=="TEXTAREA"&&(e.key==="s"||e.key==="S")&&!e.shiftKey){ e.preventDefault(); skipPair(); }
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
