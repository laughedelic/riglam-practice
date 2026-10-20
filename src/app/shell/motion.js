import { state } from "../state.js";
import { $ } from "../core/dom.js";

/* ---------- motion ---------- */
// A panel that opens (the menu, the tutor's panel, the practice options, the chat) slides in from its own side while its shade fades in with it, on one curve over one
// time; when it closes it goes the same way back. The state never waits for the motion: the page is already in its new state, and a closing panel is a copy of
// itself (the class `leaving`) that plays the way out and is removed. The times and curves are in 28-menu.css (`--mo`); `MS` is the same time. Nothing moves
//  - under reduced motion,
//  - before the first screen has been drawn,
//  - when the browser animated the Back itself (the swipe from the edge, `hasUAVisualTransition`): it has just animated the screen away, a second motion on top of it would be two.
//    (A Back it did not animate, the button or the key, plays the panel's own motion like any other close.)
export const MS=200;
export const moves=()=>state.motion&&!state.navBack&&!matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Starts the way in of a panel that has just opened (its `enter` class, which 28-menu.css animates). A panel the page keeps (`persistent`: the menu, its scrim, the
 * tutor's panel) animates itself and keeps the class until the motion is over. The overlay is rebuilt from nothing by each render: its parts are made again with
 * the class on, and each carries on from where the motion is (`--ago` is the time gone, as a negative delay), so a render in the middle of a slide does not restart it.
 * @param {HTMLElement} node
 * @param {boolean} fresh the panel opened with this render
 * @param {{persistent?: boolean}} [how]
 */
export function enter(node,fresh,{persistent=false}={}){
  if(fresh){
    node.classList.remove("enter"); node.style.removeProperty("--ago"); delete node.dataset.at;
    if(!moves()) return;
    const at=String(Date.now());
    node.dataset.at=at; node.classList.add("enter");
    setTimeout(()=>{ if(node.dataset.at===at){ node.classList.remove("enter"); node.style.removeProperty("--ago"); delete node.dataset.at; } },MS+400); // (a late first frame must not find the class gone)
  }
  if(!persistent&&node.dataset.at) node.style.setProperty("--ago",-Math.min(Date.now()-(+node.dataset.at),MS)+"ms");
}

/**
 * Plays the way out of a panel that has just closed, from a copy that is put where it was and removed when it is over. The copy goes next to the original (the
 * overlay, which fills the column); with `placed` it goes over the same area of the app instead (a panel that is a flexible or grid item of the page, which would
 * take room as a copy). The copy cannot be reached or read: it has no ids, it is hidden from assistive technology and inert.
 * @param {HTMLElement} node
 * @param {boolean} [placed]
 */
export function leave(node,placed=false){
  if(!moves()||!node||!node.isConnected||node.hidden) return;
  const app=$("app"), from=node.getBoundingClientRect(), ghost=/** @type {HTMLElement} */(node.cloneNode(true));
  for(const a of ["id","hidden","role","aria-modal","aria-label","aria-expanded"]) ghost.removeAttribute(a);
  for(const n of ghost.querySelectorAll("[id]")) n.removeAttribute("id");
  ghost.classList.remove("enter"); ghost.classList.add("leaving"); ghost.setAttribute("aria-hidden","true"); ghost.inert=true; ghost.style.removeProperty("--ago");
  if(placed){
    const a=app.getBoundingClientRect(), cs=getComputedStyle(node);
    Object.assign(ghost.style,{position:"absolute",margin:"0",left:from.left-a.left+"px",top:from.top-a.top+"px",width:from.width+"px",height:from.height+"px",zIndex:cs.zIndex==="auto"?"5":cs.zIndex,boxShadow:cs.boxShadow});
    app.append(ghost);
  } else node.after(ghost);
  // a copy starts with every list at its top; the way out should show what was on screen
  const was=node.querySelectorAll("*"), now=ghost.querySelectorAll("*");
  was.forEach((n,i)=>{ if(n.scrollTop&&now[i]) now[i].scrollTop=n.scrollTop; });
  setTimeout(()=>ghost.remove(),MS+200); // (every way out ends invisible and stays so, so a late first frame still finds the copy)
}
