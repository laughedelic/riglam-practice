import { state } from "../state.js";
// The Path (src/app/path) is one column on every screen for now (its wide layout is still to be designed), so the exercises take the narrow way there.
export const wideMq=window.matchMedia("(min-width:1100px)"), isWide=()=>wideMq.matches&&state.design!=="path";
// A phone keyboard covers part of the screen. The app follows the visible area; the tab bar stays and shrinks while a field is in use.
const vv=window.visualViewport;
export function syncVv(){
  const r=document.documentElement.style;
  if(vv&&!isWide()&&vv.height<innerHeight-120){ r.setProperty("--vvh",Math.round(vv.height)+"px"); r.setProperty("--vvt",Math.round(vv.offsetTop)+"px"); }
  else { r.removeProperty("--vvh"); r.removeProperty("--vvt"); }
}
if(vv){ vv.addEventListener("resize",syncVv); vv.addEventListener("scroll",syncVv); }
export const typingEl=n=>!!n&&(n.tagName==="INPUT"||n.tagName==="TEXTAREA");
document.addEventListener("focusin",e=>{ if(typingEl(e.target)&&matchMedia("(pointer:coarse)").matches) document.documentElement.classList.add("typing"); });
document.addEventListener("focusout",()=>{ setTimeout(()=>{ if(!typingEl(document.activeElement)) document.documentElement.classList.remove("typing"); },80); });
