import { state } from "../state.js";
import { canAsk } from "../core/ask.js";
import { $ } from "../core/dom.js";
import { render } from "./render.js";

// The conversation with Claude about a result is a page of its own (path/tutor.tsx), opened from the result; it waits until the pair is checked or a conversation has begun.
export function openChat(){
  if(!state.ui||!(state.ui.chat||state.ui.checked)||!canAsk()) return;
  const first=!(state.ui.chat||[]).some(t=>t.role==="user"&&!t.hidden);
  state.view="chat"; render();
  // a touch screen's keyboard stays down: it would come up over the answer and the way back
  const i=first&&!("ontouchstart" in window)&&$("ask-in"); if(i) i.focus({preventScroll:true});
}
export function closeChat(){ state.view=null; render(); }
