// The Path's root is as tall as the part of the screen that can be seen and starts where it starts (it takes --vvh and --vvt, styles/05-path-base.css;
// core/visible.ts says when). CSS's 100dvh alone is not enough on a phone: a keyboard covers part of the screen without changing it, and right after a
// reload (an update) a phone browser can lay the page out for a taller screen than the one it shows until something makes it measure again, which
// left the foot and the roadmap's version line below the edge. So the page measures the visible area itself: at once, whenever it changes or the
// page comes back, and a few times while the page settles after it loads.
import { visibleArea } from "./visible.ts";

const vv=window.visualViewport;
function syncVv(){
  const r=document.documentElement.style, a=visibleArea(vv,innerHeight);
  if(a){ r.setProperty("--vvh",a.height+"px"); r.setProperty("--vvt",a.top+"px"); }
  else { r.removeProperty("--vvh"); r.removeProperty("--vvt"); }
}
if(vv){
  vv.addEventListener("resize",syncVv); vv.addEventListener("scroll",syncVv);
  addEventListener("resize",syncVv); addEventListener("pageshow",syncVv); addEventListener("load",syncVv); addEventListener("orientationchange",syncVv);
  document.addEventListener("visibilitychange",()=>{ if(document.visibilityState==="visible") syncVv(); });
  syncVv(); requestAnimationFrame(syncVv); for(const ms of [300,1000,2500]) setTimeout(syncVv,ms);
}
export const typingEl=n=>!!n&&(n.tagName==="INPUT"||n.tagName==="TEXTAREA");
document.addEventListener("focusin",e=>{ if(typingEl(e.target)&&matchMedia("(pointer:coarse)").matches) document.documentElement.classList.add("typing"); });
document.addEventListener("focusout",()=>{ setTimeout(()=>{ if(!typingEl(document.activeElement)) document.documentElement.classList.remove("typing"); },80); });
