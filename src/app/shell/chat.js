import { state } from "../state.js";
import { decorateAns } from "../ai/flags.js";
import { canAsk } from "../core/ask.js";
import { $, el } from "../core/dom.js";
import { tbIcon } from "../core/icons.js";
import { REL } from "../core/rel.js";
import { isWide } from "../core/viewport.js";
import { syllogismText } from "../../domain/syllogism.ts";
import { askRow, fillTurn } from "../practice/screen.js";
import { skipInto } from "../practice/skips.js";
import { enter, leave } from "./motion.js";
import { optionsInto } from "./options.js";
import { isEx, render } from "./render.js";
import { sessionInto } from "./session.js";

// The tutor's chat is the button at the right of the top bar, the mirror of the menu, and it is there to talk about a result: it waits until the pair is checked or
// a conversation has begun. On a narrow screen it opens the chat as a drawer from the right over the exercise; on a wide screen it opens and closes the panel at
// the right, which also opens by itself when an explanation is asked for.
export function openChat(){
  if(!state.ui||isWide()||!(state.ui.chat||state.ui.checked)||!canAsk()) return;
  const first=!(state.ui.chat||[]).some(t=>t.role==="user"&&!t.hidden);
  state.view="chat"; render();
  const i=first&&$("ask-in"); if(i) i.focus({preventScroll:true});
}
export function closeChat(){ state.view=null; render(); const b=$("mchat"); if(b&&!b.hidden) b.focus({preventScroll:true}); }
export function toggleCoach(on){ state.coachOpen=on===undefined?!state.coachOpen:on; render(); }
// The button itself: there whenever the tutor can answer, but pressable only once there is a result to talk about or a conversation, so it never opens an empty panel;
// a panel that is open can always be closed. A dot marks an answer of the tutor that is not on screen. Where the tutor cannot answer, a wide screen still has the panel
// with the recent answers and the keys, and the button for it does not show a chat: it is the "recent" one, and it is always pressable.
export function syncChatBtn(){
  const b=/** @type {HTMLButtonElement} */($("mchat")), w=isWide(), u=state.ui, ex=state.mode==="quiz"&&isEx()&&!!u, ai=canAsk();
  b.hidden=!ex||(!w&&!ai); if(b.hidden) return;
  const label=w?(ai?"Tutor’s chat and recent answers":"Recent answers"):"Discuss with AI";
  const waiting=!!u.chat&&u.chat.some(t=>t.role==="assistant"&&!t.pending&&t.content)&&(w?!state.coachOpen:state.view!=="chat");
  b.replaceChildren(w&&!ai?tbIcon("recent","tbi rc"):tbIcon("chat")); if(waiting) b.append(el("i",{class:"att","aria-hidden":"true"}));
  b.setAttribute("aria-label",label+(waiting?", an answer is waiting":"")); b.title=label;
  b.disabled=w&&!ai?false:!(u.checked||u.chat)&&!(w&&state.coachOpen);
  if(w){ b.setAttribute("aria-pressed",state.coachOpen?"true":"false"); b.classList.toggle("open",state.coachOpen); b.removeAttribute("aria-haspopup"); }
  else { b.removeAttribute("aria-pressed"); b.classList.remove("open"); b.setAttribute("aria-haspopup","dialog"); }
}
// the head of a full-height overlay (Settings): the back arrow, then the title
export function overHead(title,onBack,label){
  return el("div",{class:"oh"},el("button",{type:"button",class:"oc",onclick:onBack,"aria-label":label,title:label},tbIcon("back")),el("h2",{text:title}));
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
// The chat on a narrow screen is a drawer from the right, behind a scrim, the mirror of the menu: the title, and the close button where the chat button was.
// It keeps the field right under the heading, because the on-screen keyboard covers the lower third of the screen.
function chatInto(o){
  const p=state.cur.p, label="Close the chat", d=el("div",{class:"cdrawer"});
  o.append(el("button",{type:"button",class:"scrim",tabindex:"-1","aria-label":label,onclick:closeChat}),d);
  d.append(el("div",{class:"oh"},el("h2",{text:"Discuss with AI"}),el("button",{type:"button",class:"oc",onclick:closeChat,"aria-label":label,title:label},tbIcon("close"))));
  // Find a pair: the pair is what is judged, and a pair of the learner's own stays open until Claude has said whether it has the relation (the overall grade is "pend" then, too)
  const r=state.ui.checked&&state.ui.res, fd=!!state.ui.find;
  const v=!r?"":r.relOpen?(r.relUns?"pair not settled":"pair not judged yet"):{ok:"all right",part:(fd?"pair":"relation")+" right, not everything else",pend:(fd?"pair":"relation")+" and cells right",bad:"not quite"}[r.overall];
  // a syllogism has no pair: the sentence, and how the reply went
  d.append(state.ui.syllogism?el("p",{class:"ctx"},el("b",{text:syllogismText(state.cur.c,state.syllogismWording)}),el("small",{text:state.ui.timeout?"Time is up":state.ui.grade.correct?"Right":"Not quite"}))
    :el("p",{class:"ctx"},el("b",{text:p.a+" / "+p.b}),el("small",{text:(state.ui.find?"Asked for: "+REL[state.ui.rel].name:REL[p.relation].name)+(v?" · "+v:"")})));
  const dock=el("div",{class:"dock"});
  if(state.ui.ctl) dock.append(el("button",{class:"btn ghost",type:"button",onclick:()=>state.ui.ctl&&state.ui.ctl.abort(),text:"Stop"}));
  else if(canAsk()) dock.append(askRow("ask-in"));
  d.append(dock);
  const sc=el("div",{class:"chat",id:"chatscroll"}), box=el("div",{class:"tutor"});
  tutorTurns(box,true); sc.append(box); d.append(sc);
}
export function renderOver(){
  const o=$("over"), chat=state.view==="chat"&&!isWide()&&state.ui&&(state.ui.chat||state.ui.checked), ex=state.mode==="quiz"&&isEx();
  const sess=state.sessOpen&&ex, ask=state.skipAsk&&ex;
  const kind=state.optsOpen?"options":ask?"skip":sess?"session":"chat", show=state.optsOpen||ask||sess||!!chat, was=!o.hidden&&o.dataset.kind===kind;
  if(!o.hidden&&(!show||!was)) leave(o); // what was open goes the way it came (another one may come in its place)
  o.replaceChildren(); o.hidden=!show; o.dataset.kind=kind; o.setAttribute("aria-label",{options:"Settings",session:"Practice options",skip:"Skip this pair?",chat:"Discuss with AI"}[kind]);
  document.documentElement.classList.toggle("ov",show);
  // Whatever is open here (Settings, the question before a skip, the practice options, the phone's chat) covers the exercise and its bars, which cannot be reached by
  // the keyboard or a screen reader until it closes (Enter on a Check button hidden behind it would grade the pair). The menu is outside this column and stays:
  // moving to another screen from it closes the overlay like any other move (setTab).
  for(const n of /** @type {NodeListOf<HTMLElement>} */(document.querySelectorAll("#app > .col > :not(#over):not(.leaving)"))) n.inert=show; // (a copy playing a panel out stays inert)
  if(!show) return;
  enter(o,!was); // before the parts are made: they carry on from where the motion is
  if(kind==="options") optionsInto(o); else if(kind==="session") sessionInto(o); else if(kind==="skip") skipInto(o); else chatInto(o);
  const sc=$("chatscroll"); if(sc) sc.scrollTop=0;
  if(!was&&kind==="chat"&&!document.activeElement.matches("input")){ const b=o.querySelector(".oc"); if(b) b.focus({preventScroll:true}); }
  if(!was&&kind==="skip"){ const b=/** @type {HTMLElement|null} */(o.querySelector(".prim")); if(b) b.focus({preventScroll:true}); }
}
