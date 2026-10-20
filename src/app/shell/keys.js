import { state } from "../state.js";
import { ORDER } from "../core/rel.js";
import { isWide } from "../core/viewport.js";
import { backSyllogism, replyOfKey, saySyllogism } from "../syllogism/flow.js";
import { checkDebate, chooseD, sayQ } from "../debate/flow.js";
import { favTarget, toggleFav } from "../practice/favorites.js";
import { next } from "../practice/queue.js";
import { choose } from "../practice/screen.js";
import { closeSkipAsk, skipPair } from "../practice/skips.js";
import { closeDef } from "../practice/terms.js";
import { closeChat } from "./chat.js";
import { closeMenu, menuVisible } from "./menu.js";
import { toggleOpts } from "./options.js";
import { isEx, render } from "./render.js";
import { sessBack } from "./session.js";

// a tap outside a note closes it, and a tap outside a term's definition closes that (a tap on a term stops before this)
document.addEventListener("click",e=>{
  const u=state.ui, t=/** @type {Element} */(e.target), at=s=>!!(t.closest&&t.closest(s)); if(!u) return;
  const d=!!u.dterm&&!at(".ddef"), p=!!u.pop&&!at(".pop,.why"); if(d) u.dterm=null; if(p) u.pop=null; if(d||p) render();
});
document.addEventListener("keydown",e=>{
  // a native dialog (the Magic Key prompt) closes itself on Escape and takes the keys it needs: the menu or Settings under it keep their level
  if(/** @type {Element|null} */(e.target)?.closest?.("dialog[open]")) return;
  if(e.key==="Escape"){ if(state.skipAsk){ closeSkipAsk(); return; } if(state.sessOpen){ sessBack(); return; } if(state.optsOpen){ toggleOpts(false); return; } if(state.view==="chat"){ closeChat(); return; } if(menuVisible()&&(!isWide()||state.menuPeek)){ closeMenu(); return; } if(state.ui&&state.ui.dterm){ closeDef(); return; } if(state.ui&&state.ui.pop){ state.ui.pop=null; render(); return; } if(state.ui&&state.ui.find&&state.ui.open&&!state.ui.checked){ state.ui.open=false; render(); return; } if(state.tab==="syllogism"&&state.ui&&state.ui.syllogism&&state.ui.step===1&&!state.ui.checked){ backSyllogism(); return; } }
  if(state.mode!=="quiz"||!state.ui||state.optsOpen||state.sessOpen||state.skipAsk||state.view||state.tab==="review"||(state.menuOpen&&!isWide())||e.metaKey||e.ctrlKey||e.altKey) return;
  const t=e.target&&/** @type {Element} */(e.target).tagName;
  if((e.key==="f"||e.key==="F")&&!e.shiftKey&&t!=="INPUT"&&t!=="TEXTAREA"&&state.db&&favTarget()&&!favTarget().own&&isEx()){ e.preventDefault(); toggleFav(favTarget()); return; }
  if(state.tab==="practice"&&!state.ui.debate){
    if(!state.ui.checked&&t!=="INPUT"&&/^[1-5]$/.test(e.key)&&(isWide()||!state.ui.rel||state.ui.open)){ e.preventDefault(); choose(ORDER[+e.key-1]); }
    else if(!state.ui.checked&&t!=="INPUT"&&t!=="TEXTAREA"&&(e.key==="s"||e.key==="S")&&!e.shiftKey){ e.preventDefault(); skipPair(); }
    else if(state.ui.checked&&(e.key==="n"||e.key==="N")&&!e.shiftKey&&t!=="INPUT"&&t!=="TEXTAREA"){ e.preventDefault(); next(); }
  } else if(state.tab==="find"&&state.ui.find){
    if(!state.ui.checked&&t!=="INPUT"&&t!=="TEXTAREA"&&(e.key==="s"||e.key==="S")&&!e.shiftKey){ e.preventDefault(); skipPair(); }
    else if(state.ui.checked&&(e.key==="n"||e.key==="N")&&!e.shiftKey&&t!=="INPUT"&&t!=="TEXTAREA"){ e.preventDefault(); next(); }
  } else if(state.tab==="syllogism"&&state.ui.syllogism){
    if(t==="INPUT"||t==="TEXTAREA"||e.shiftKey) return;
    const k=e.key.toLowerCase();
    if(!state.ui.checked&&state.ui.step===0&&replyOfKey(k)){ e.preventDefault(); saySyllogism(replyOfKey(k)); }
    else if(!state.ui.checked&&k==="s"){ e.preventDefault(); skipPair(); }
    else if(state.ui.checked&&k==="n"){ e.preventDefault(); next(); }
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
    } else if(k==="n"&&!e.shiftKey){ e.preventDefault(); next(); }
  }
});
