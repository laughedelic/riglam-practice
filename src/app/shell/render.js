import { state } from "../state.js";
import { $, el } from "../core/dom.js";
import { dayOf, gradeOf, today } from "../core/util.js";
import { isWide } from "../core/viewport.js";
import { renderDebate } from "../debate/screen.js";
import { isFav } from "../practice/favorites.js";
import { placePops, renderQuiz } from "../practice/screen.js";
import { syncSkipBtn } from "../practice/skips.js";
import { renderReview } from "../review/review.js";
import { renderOver } from "./chat.js";
import { renderOptionsBtn } from "./options.js";
import { setTab } from "./tabs.js";
import { ensureRelTimer, syncBlitzBtn, tbIcon } from "./timers.js";

/* ---------- rendering ---------- */
// One layout state for every tab: wide screens show a rail, the workspace and a coach panel side by side;
// narrow screens show a top bar, one screen at a time (steps) and a tab bar. Both are built from the same parts.
const TABS=[["practice","Relations"],["debate","Pervasions"],["review","Review"]];
export const CELL_FULL={both:"Both A and B", anb:"A, not B", bna:"B, not A", nei:"Neither A nor B"};
export function top0(){ for(const id of ["stage","coach","over"]){ const n=$(id); if(n) n.scrollTop=0; } }
export function ago(iso){
  const m=Math.round((Date.now()-new Date(iso).getTime())/6e4); if(!(m>=0)) return "";
  if(m<1) return "now"; if(m<60) return m+" min";
  const h=Math.round(m/60); if(h<24) return h+" h";
  const d=Math.round(h/24); return d===1?"1 day":d+" days";
}
function renderTabs(){
  const rail=$("tabs"), bar=$("tabbar"); rail.replaceChildren(); bar.replaceChildren();
  for(const [k,l] of TABS){
    const sel=state.tab===k?"true":"false", go=()=>setTab(k);
    rail.append(el("button",{type:"button",role:"tab",class:"nv","aria-selected":sel,onclick:go},el("i",{"aria-hidden":"true"}),l));
    bar.append(el("button",{type:"button",role:"tab","aria-selected":sel,onclick:go},el("i",{"aria-hidden":"true"}),l));
  }
}
// the rail's "Today" block
export function renderSession(){
  const s=$("today"); s.replaceChildren();
  const list=Object.values(state.tab==="debate"?state.debates:state.answers).filter(a=>dayOf(a.at)===today());
  s.append(el("span",{text:"Today"}),el("b",{text:String(list.length)}),
    el("span",{text:list.length?(state.tab==="debate"?"debated":"answered")+", "+list.filter(a=>gradeOf(a)==="ok").length+" fully right":"nothing answered yet"}));
}
// the star in the narrow top bar (the wide layout has the Favorite button next to Check)
function syncFavBtn(){
  const b=$("mfav"), ok=!!(state.db&&state.mode==="quiz"&&state.cur&&state.cur.p&&state.tab!=="review");
  b.hidden=!ok; if(!ok) return;
  const on=isFav(state.cur.p), t=on?"Remove from favorites":"Add to favorites";
  b.replaceChildren(tbIcon("star")); b.setAttribute("aria-pressed",on?"true":"false"); b.setAttribute("aria-label",t); b.title=t+" (F)";
}
// the three steps of a narrow screen; go[i] makes step i a button
export function setSteps(labels,on,go){
  const st=$("steps"); st.replaceChildren(); st.hidden=false;
  labels.forEach((l,i)=>st.append(el("button",{type:"button",class:i<on?"done":i===on?"on":"","aria-current":i===on?"step":null,disabled:!(go&&go[i]),onclick:go&&go[i]?go[i]:null,text:(i+1)+" "+l})));
}
function focusKey(){
  const a=/** @type {HTMLInputElement} */(document.activeElement);
  return a&&(a.tagName==="INPUT"||a.tagName==="TEXTAREA")&&a.id?{id:a.id,s:a.selectionStart,e:a.selectionEnd}:null;
}
function restoreFocus(f){
  const n=f&&/** @type {HTMLInputElement} */($(f.id)); if(!n||n.disabled||document.activeElement===n) return;
  n.focus({preventScroll:true}); try{ n.setSelectionRange(f.s,f.e); }catch(e){}
}
export const focusCin=()=>{ const i=$("cin"); if(i) i.focus({preventScroll:true}); };
function screenSig(){
  const p=state.cur&&state.cur.p;
  return [state.tab,state.mode,state.view,state.optsOpen?1:0,isWide()?1:0,p?(p.id||p.a+"|"+p.b):"",state.ui?[state.ui.checked?1:0,state.ui.step||0,state.ui.ci||0,state.ui.rel?1:0,state.ui.open?1:0,state.ui.debate?1:0].join(""):""].join("/");
}
export function render(){
  const sig=screenSig(), keep=sig===state.lastSig?["stage","coach","over"].map(id=>{ const n=$(id); return /** @type {[string, number]} */([id,n?n.scrollTop:0]); }):null;
  state.lastSig=sig;
  renderNow();
  if(keep) for(const [id,y] of keep){ const n=$(id); if(n&&y&&!n.hidden) n.scrollTop=y; }
}
function renderNow(){
  ensureRelTimer();
  const w=isWide(); if(w&&state.view==="chat") state.view=null;
  const app=$("app"), s=$("stage"), c=$("coach"), f=focusKey();
  app.dataset.tab=state.tab; app.dataset.wide=w?"1":"0";
  renderOptionsBtn(); renderTabs(); renderSession(); syncFavBtn(); syncSkipBtn(); syncBlitzBtn();
  s.replaceChildren(); c.replaceChildren(); $("steps").replaceChildren(); $("steps").hidden=true;
  s.className="card"+(state.tab==="review"?" rv":"");
  if(state.mode==="nodb"){ s.append(el("p",{class:"status",text:"Open this page in Claude while signed in to save your answers."})); }
  if(state.mode==="loading"){ s.append(el("p",{class:"status",text:"Loading."})); renderOver(); return; }
  if(state.mode==="nodata"){ s.append(el("p",{class:"status",text:"The practice data could not be loaded. Reload the page to try again."})); renderOver(); return; }
  if(state.tab==="review") renderReview(s);
  else if(state.mode==="quiz"){ if(state.tab==="debate"&&state.ui&&state.ui.debate) renderDebate(s,c); else renderQuiz(s,c); }
  renderOver(); restoreFocus(f); placePops();
}

// Fit the terms around the fixed chips and diamond. The diamond stays in the middle and each term has
// its half: a term too long for one line there first tries text up to 15% smaller, then wraps in its half.
// A single word too long for its half first tries text up to 20% smaller; failing that it moves the diamond over, just enough
// for that word; if the other term's words then do not fit, the text shrinks to 13px, and below that long words break.
// The relation name under the diamond follows it when it moves off center.
export function fitPair(){
  const pr=document.querySelector(".pair"); if(!pr) return;
  const [a,b]=pr.querySelectorAll(".tx"), ch=pr.querySelectorAll(".L");
  pr.style.removeProperty("--tsz"); pr.style.removeProperty("grid-template-columns");
  const gap=parseFloat(getComputedStyle(pr).columnGap)||0;
  const W=Math.floor(pr.clientWidth-(ch[1].getBoundingClientRect().right-ch[0].getBoundingClientRect().left)-2*gap), h=Math.floor(W/2);
  const size=(t,k)=>{ t.style.width=k; t.style.hyphens="manual"; const w=Math.ceil(t.getBoundingClientRect().width); t.style.width=t.style.hyphens=""; return w; };
  const f0=parseFloat(getComputedStyle(a).fontSize); let f=f0, wa, wb;
  /** @type {{xa: number, xb: number, na: number, nb: number}} */
  let z;
  const font=g=>{ f=g; pr.style.setProperty("--tsz",g+"px"); };
  const meas=()=>{ z={xa:size(a,"max-content"),xb:size(b,"max-content"),na:size(a,"min-content"),nb:size(b,"min-content")}; };
  const line=()=>z.xa<=h&&z.xb<=h, words=()=>z.na<=h&&z.nb<=h;
  // smaller text (by at most k), if that makes ok() hold; otherwise back to full size
  const shrink=(need,ok,k)=>{ const g=Math.floor(f0*(h-1)/need*10)/10; if(g<Math.max(13,f0*(1-k))) return false; font(g); meas(); if(ok()) return true; font(f0); meas(); return false; };
  meas();
  if(!line()&&!shrink(Math.max(z.xa,z.xb),line,.15)&&!words()&&!shrink(Math.max(z.na,z.nb),words,.2)){
    for(;;){
      if(words()) break;
      if(f<=13){ if(z.na<=h){ wa=z.na; wb=W-z.na; } else if(z.nb<=h){ wb=z.nb; wa=W-z.nb; } else { wa=wb=h; } break; }
      font(Math.max(13,f-1)); meas();
    }
  }
  if(wa!=null) pr.style.gridTemplateColumns=Math.floor(wa)+"px auto auto auto "+Math.floor(wb)+"px";
  const sub=pr.parentElement.querySelector(".subrow,.subt"); if(!sub) return;
  sub.style.translate="";
  const hd=pr.parentElement.getBoundingClientRect(), m=pr.querySelector(".mid").getBoundingClientRect(), sw=sub.getBoundingClientRect().width;
  const room=Math.max(0,(hd.width-sw)/2), dx=m.left+m.width/2-(hd.left+hd.width/2);
  sub.style.translate=Math.round(Math.max(-room,Math.min(room,dx)))+"px 0";
}
const refit=()=>{ cancelAnimationFrame(state.fitQ); state.fitQ=requestAnimationFrame(fitPair); };
addEventListener("resize",refit);
// The first fit can run before EB Garamond has loaded and measure the fallback font, so fit again once it is in.
if(document.fonts){
  document.fonts.ready.then(refit);
  document.fonts.addEventListener("loadingdone",refit);
  document.fonts.load('500 20px "EB Garamond"').then(refit,()=>{});
}
