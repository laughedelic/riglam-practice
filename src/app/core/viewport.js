// A phone keyboard covers part of the screen. The app follows the visible area (the Path's root takes --vvh and --vvt, styles/33-path-base.css).
const vv=window.visualViewport;
function syncVv(){
  const r=document.documentElement.style;
  if(vv&&vv.height<innerHeight-120){ r.setProperty("--vvh",Math.round(vv.height)+"px"); r.setProperty("--vvt",Math.round(vv.offsetTop)+"px"); }
  else { r.removeProperty("--vvh"); r.removeProperty("--vvt"); }
}
if(vv){ vv.addEventListener("resize",syncVv); vv.addEventListener("scroll",syncVv); }
export const typingEl=n=>!!n&&(n.tagName==="INPUT"||n.tagName==="TEXTAREA");
document.addEventListener("focusin",e=>{ if(typingEl(e.target)&&matchMedia("(pointer:coarse)").matches) document.documentElement.classList.add("typing"); });
document.addEventListener("focusout",()=>{ setTimeout(()=>{ if(!typingEl(document.activeElement)) document.documentElement.classList.remove("typing"); },80); });
