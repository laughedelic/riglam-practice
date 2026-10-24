import { state } from "../state.js";
import { $, el } from "../core/dom.js";
import { tbIcon } from "../core/icons.js";
import { isWide } from "../core/viewport.js";
import { asking, startQ, stopTimer } from "../debate/flow.js";
import { EXERCISES, parked, todayCount } from "./exercises.js";
import { toggleOpts } from "./options.js";
import { enter, leave } from "./motion.js";
import { render } from "./render.js";
import { setTab } from "./tabs.js";

/* ---------- the menu ---------- */
// Where you are and where else you can go: today's line (it opens Review), the exercises (a "continue" tag on one whose attempt waits), Review and Settings,
// a key button while this device has no Magic Key, and the version with the way to look for a newer one. On a narrow screen it slides over the exercise from
// the left (a modal: a scrim, Back or Escape closes it). On a wide screen it is a panel: pinned open beside the exercise by the menu button, or hidden, and then it
// peeks while the pointer rests on the left edge, so the exercise can have the whole width.
const store=(k,v)=>{ try{ localStorage.setItem(k,v); }catch(e){} };
export const menuVisible=()=>isWide()?state.menuPin||state.menuPeek:state.menuOpen;

// the logo figure, from the symbol in markup.html (an svg element has to be made in its own namespace)
function figure(){
  const svg=document.createElementNS("http://www.w3.org/2000/svg","svg"), use=document.createElementNS("http://www.w3.org/2000/svg","use");
  svg.setAttribute("class","fig"); svg.setAttribute("aria-hidden","true"); use.setAttribute("href","#riglam-figure"); svg.append(use);
  return svg;
}
function todayLine(){
  const t=todayCount();
  return el("button",{type:"button",class:"mtoday","data-go":"review"},
    el("b",{text:"Today"}),
    t.n?el("span",null,el("b",{text:String(t.n)}),t.n===1?" pair":" pairs"," · ",el("b",{text:String(t.ok)})," fully right"):el("span",{class:"faint",text:state.mode==="loading"?"Loading.":"Nothing practiced yet"}),
    el("i",{"aria-hidden":"true"},tbIcon("chev")));
}
function rows(){
  const list=EXERCISES.filter(e=>e.needs!=="examples"||state.EX), out=[], multi=new Set(list.map(e=>e.group)).size>1;
  let last=null;
  for(const e of list){
    if(!multi&&last===null) out.push(el("p",{class:"mgrp",text:"Exercises"}));
    if(multi&&e.group!==last) out.push(el("p",{class:"mgrp",text:e.group}));
    last=e.group;
    const here=state.tab===e.k && !state.optsOpen, go=parked(e.k);
    out.push(el("button",{type:"button",class:"mrow","data-go":e.k,"aria-current":here?"page":null,disabled:state.mode!=="quiz"},
      el("span",{class:"t"},el("b",{text:e.name}),el("small",{text:e.desc})),
      go?el("span",{class:"tag cont"},el("i",{"aria-hidden":"true"}),"continue"):null));
  }
  return out;
}
function keyButton(){
  if(!state.unlock) return null;
  return el("button",{type:"button",class:"ib keyb",title:"No Magic Key on this device: what is it?","aria-label":"No Magic Key on this device: what is it?",
    onclick:()=>{ state.unlock.open(); }},tbIcon("key"));
}
// the version, and where the look for a newer one stands (platform.about, platform.updates)
function versionLine(){
  const a=state.about, u=state.updates; if(!a) return null;
  const st=u?u.status():null, v="v"+a.version;
  const refresh=(label)=>el("button",{type:"button",class:"ib ver-refresh","aria-label":label,title:label,onclick:()=>u.check()},tbIcon("refresh"));
  if(st==="ready") return el("p",{class:"ver",role:"status"},v," · ",el("b",{text:"Update available"})," · ",el("button",{type:"button",class:"lnk",onclick:()=>u.apply()},"Install"));
  if(st==="downloading") return el("p",{class:"ver",role:"status"},v," · downloading an update");
  if(st==="checking") return el("p",{class:"ver",role:"status"},v," · checking",el("span",{class:"ib spin","aria-hidden":"true"},tbIcon("refresh")));
  if(st==="unknown") return el("p",{class:"ver",role:"status"},v," · could not check",refresh("Check for updates"));
  if(st==="current") return el("p",{class:"ver",role:"status"},v," · up to date",refresh("Check for updates"));
  return el("p",{class:"ver",role:"status",text:v+(a.latest==="newer"?" · a newer version is out":"")});
}
function pick(k){
  if(k==="settings"){ state.menuOpen=false; state.menuPeek=false; state.sessOpen=false; state.sessPage=null; state.skipAsk=false; toggleOpts(true); } // a screen shows itself, not a panel under it (as setTab does)
  else setTab(k);
}
function onClick(e){
  const b=/** @type {Element} */(e.target).closest("[data-go]"); if(b) pick(b.getAttribute("data-go"));
}

const CONTROLS="button,[tabindex]";
export function renderMenu(){
  const m=$("menu"), w=isWide(), shown=menuVisible();
  // the phone's drawer is a modal: the exercise behind it cannot be reached by the keyboard or a screen reader until it closes
  const col=/** @type {HTMLElement|null} */(document.querySelector("#app > .col")); if(col) col.inert=!w&&shown;
  if(!w&&shown){ m.setAttribute("role","dialog"); m.setAttribute("aria-modal","true"); } else { m.removeAttribute("role"); m.removeAttribute("aria-modal"); }
  // opening and closing: the panel and the shade behind it (the phone's) come and go together, on one curve (motion.js)
  const was=!m.hidden, sc=$("menuscrim"), shade=!w&&shown, shaded=!sc.hidden;
  if(was&&!shown) leave(m,true);
  if(shaded&&!shade) leave(sc,true);
  $("app").dataset.menu=w?(state.menuPin?"pinned":shown?"peek":"closed"):(shown?"open":"closed");
  sc.hidden=!shade; $("menuedge").hidden=!(w&&!shown);
  if(!shaded&&shade) enter(sc,true,{persistent:true});
  const mb=$("menubtn"); mb.setAttribute("aria-expanded",shown?"true":"false"); mb.classList.toggle("open",shown);
  m.hidden=!shown;
  if(!shown){ m.replaceChildren(); return; }
  m.classList.toggle("peek",w&&!state.menuPin);
  if(!was) enter(m,true,{persistent:true});
  // a redraw of the menu alone (an update's status, today's numbers) keeps the keyboard focus on the same control, or on the last one when that one is gone
  const at=m.contains(document.activeElement)?[...m.querySelectorAll(CONTROLS)].indexOf(/** @type {Element} */(document.activeElement)):-1;
  m.replaceChildren(
    // the close button is where the menu button was, so the same place opens and closes the menu; pinned beside the exercise the menu button (which is not covered) closes it, and a second button would do the same
    el("div",{class:"mh"},
      w&&state.menuPin?null:el("button",{type:"button",class:"ib mclose","aria-label":"Close the menu",title:"Close the menu",onclick:closeMenu},tbIcon("close")),
      figure(),
      el("span",{class:"brand lock"},el("span",{class:"nm",text:"Riglam"})," ",el("span",{class:"pr",text:"practice"}))),
    el("div",{class:"mbody"},todayLine(),...rows()),
    el("div",{class:"mfoot"},
      el("div",{class:"mfr"},
        el("button",{type:"button",class:"fbtn","data-go":"review","aria-current":state.tab==="review"&&!state.optsOpen?"page":null},tbIcon("review"),"Review"),
        el("button",{type:"button",class:"fbtn","data-go":"settings","aria-current":state.optsOpen?"page":null},tbIcon("gear"),"Settings"),
        keyButton()),
      versionLine()));
  m.onclick=onClick;
  if(at>=0){ const cs=m.querySelectorAll(CONTROLS), n=/** @type {HTMLElement|undefined} */(cs[Math.min(at,cs.length-1)]); if(n) n.focus({preventScroll:true}); }
}
// the narrow drawer
// The Blitz clock stands still behind it and starts again, with its full time, when it closes.
export function toggleMenu(on){
  const was=state.menuOpen; state.menuOpen=on===undefined?!was:on;
  if(state.menuOpen&&!was) stopTimer();
  else if(!state.menuOpen&&was&&state.blitz&&asking()) startQ();
  render();
  if(state.menuOpen&&!was){ const b=document.querySelector("#menu .mrow[aria-current], #menu .mrow, #menu .mclose"); if(b) /** @type {HTMLElement} */(b).focus({preventScroll:true}); }
  else if(!state.menuOpen&&was) $("menubtn").focus({preventScroll:true});
}
export function closeMenu(){
  if(isWide()){ state.menuPin=false; state.menuPeek=false; store("rd-menu","0"); render(); $("menubtn").focus({preventScroll:true}); }
  else toggleMenu(false);
}
// the menu button: the drawer on a narrow screen, the pin on a wide one
function menuButton(){
  if(!isWide()){ toggleMenu(); return; }
  state.menuPin=!state.menuPin; state.menuPeek=false; store("rd-menu",state.menuPin?"1":"0"); render();
}
$("menubtn").append(tbIcon("menu"));
$("menubtn").addEventListener("click",menuButton);
$("menuscrim").addEventListener("click",()=>toggleMenu(false));
// the strip at the left edge of a wide screen: resting on it shows the menu, a click pins it
$("menuedge").addEventListener("mouseenter",()=>{ state.menuPeek=true; render(); });
$("menuedge").addEventListener("click",()=>{ state.menuPin=true; state.menuPeek=false; store("rd-menu","1"); render(); });
const unpeek=()=>{ if(state.menuPeek&&!state.menuPin&&!$("menu").contains(document.activeElement)){ state.menuPeek=false; render(); } };
$("menu").addEventListener("mouseleave",unpeek);
// a render that rebuilds the menu under the pointer leaves the browser no node to send "mouseleave" from: the pointer over anything else closes the peek too
document.addEventListener("mouseover",(e)=>{ if(state.menuPeek&&!$("menu").contains(/** @type {Node} */(e.target))&&e.target!==$("menuedge")) unpeek(); });
