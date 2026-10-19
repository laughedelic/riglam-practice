import { state } from "../state.js";
import { decorateAns } from "../ai/flags.js";
import { canAsk } from "../core/ask.js";
import { $, el } from "../core/dom.js";
import { REL } from "../core/rel.js";
import { isWide } from "../core/viewport.js";
import { askRow, fillTurn } from "../practice/screen.js";
import { overlayClosed, overlayOpened } from "./history.js";
import { optionsInto } from "./options.js";
import { render } from "./render.js";

export function openChat(){
  if(!state.ui||!state.ui.chat||isWide()) return;
  const first=!state.ui.chat.some(t=>t.role==="user"&&!t.hidden);
  if(state.view!=="chat") overlayOpened();
  state.view="chat"; render();
  const i=first&&$("ask-in"); if(i) i.focus({preventScroll:true});
}
export function closeChat(fromBack){ if(state.view==="chat"&&fromBack!==true) overlayClosed(); state.view=null; render(); const b=document.querySelector(".stage-chat"); if(b) b.focus({preventScroll:true}); }
export function overHead(title,onBack,label){
  return el("div",{class:"oh"},el("button",{type:"button",class:"oc",onclick:onBack,"aria-label":label,text:"‹ Back"}),el("h2",{text:title}));
}
// the conversation turns, shared by the coach panel (wide, in order) and the chat view (narrow, newest exchange first under the field).
// An exchange is a question and its answer in one block, with a hairline between exchanges, so an answer never reads as part of the next question.
// In the chat view the answer is above its question (the "Thinking" placeholder takes the answer's place at once), as the newest exchange is first.
export function tutorTurns(box,newestFirst,lean){
  const groups=[];
  (state.ui.chat||[]).forEach((t,idx)=>{
    if(t.hidden) return;
    if(t.role==="user") groups.push({q:el("p",{class:"q",text:t.content})});
    else {
      const a=el("div",{class:"ans",id:t.pending?"ans-live":null}); fillTurn(a,t,lean); decorateAns(a,t,idx,!!newestFirst);
      const g=groups[groups.length-1];
      if(g&&g.q&&!g.a) g.a=a; else groups.push({a});
    }
  });
  (newestFirst?groups.reverse():groups).forEach(g=>box.append(el("div",{class:"xch"},...(newestFirst?[g.a||null,g.q||null]:[g.q||null,g.a||null]))));
  if(state.ui.chatErr){ const e=el("p",{class:"status",text:state.ui.chatErr}); if(newestFirst) box.prepend(e); else box.append(e); }
}
// The chat view keeps the field right under the heading, because the on-screen keyboard covers the lower third of the screen.
function chatInto(o){
  const p=state.cur.p;
  o.append(overHead("Discuss with AI",closeChat,"Back to the result"));
  const v=state.ui.checked&&state.ui.res?{ok:"all right",part:"relation right, not everything else",pend:"relation and cells right",bad:"not quite"}[state.ui.res.overall]:"";
  o.append(el("p",{class:"ctx"},el("b",{text:p.a+" / "+p.b}),el("small",{text:(state.ui.find?"Asked for: "+REL[state.ui.rel].name:REL[p.relation].name)+(v?" · "+v:"")})));
  const dock=el("div",{class:"dock"});
  if(state.ui.ctl) dock.append(el("button",{class:"btn ghost",type:"button",onclick:()=>state.ui.ctl&&state.ui.ctl.abort(),text:"Stop"}));
  else if(canAsk()) dock.append(askRow("ask-in"));
  o.append(dock);
  const sc=el("div",{class:"chat",id:"chatscroll"}), box=el("div",{class:"tutor"});
  tutorTurns(box,true); sc.append(box); o.append(sc);
}
export function renderOver(){
  const o=$("over"), chat=state.view==="chat"&&!isWide()&&state.ui&&state.ui.chat, show=state.optsOpen||!!chat, was=!o.hidden;
  o.replaceChildren(); o.hidden=!show; o.dataset.kind=state.optsOpen?"options":"chat"; o.setAttribute("aria-label",state.optsOpen?"Options":"Discuss with AI");
  document.documentElement.classList.toggle("ov",show);
  if(!show) return;
  if(state.optsOpen) optionsInto(o); else chatInto(o);
  const sc=$("chatscroll"); if(sc) sc.scrollTop=0;
  if(!was&&!state.optsOpen&&!document.activeElement.matches("input")){ const b=o.querySelector(".oc"); if(b) b.focus({preventScroll:true}); }
}
