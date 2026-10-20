import { state } from "../state.js";
import { canAsk } from "../core/ask.js";
import { $, el } from "../core/dom.js";
import { isWide, syncVv, wideMq } from "../core/viewport.js";
import { renderCq } from "../consequence/screen.js";
import { asking, startQ } from "../debate/flow.js";
import { renderDebate } from "../debate/screen.js";
import { renderFind } from "../find/screen.js";
import { placePops, renderQuiz } from "../practice/screen.js";
import { dropStaleDef } from "../practice/terms.js";
import { renderReview } from "../review/review.js";
import { renderOver } from "./chat.js";
import { navSync } from "./history.js";
import { renderMenu } from "./menu.js";
import { ensureRelTimer } from "./timers.js";
import { renderBar } from "./topbar.js";

/* ---------- rendering ---------- */
// One layout for every screen: a top bar over a workspace. Narrow screens show one step at a time (steps) with the menu as a drawer over it;
// wide screens show the menu beside the workspace (pinned, or from the left edge) and the tutor's panel at its right when it is open.
export const CELL_FULL={both:"Both A and B", anb:"A, not B", bna:"B, not A", nei:"Neither A nor B"};
export function top0(){ for(const id of ["stage","coach","over"]){ const n=$(id); if(n) n.scrollTop=0; } }
export function ago(iso){
  const m=Math.round((Date.now()-new Date(iso).getTime())/6e4); if(!(m>=0)) return "";
  if(m<1) return "now"; if(m<60) return m+" min";
  const h=Math.round(m/60); if(h<24) return h+" h";
  const d=Math.round(h/24); return d===1?"1 day":d+" days";
}
export const isEx=()=>state.tab==="practice"||state.tab==="debate"||state.tab==="find"||state.tab==="cq";
// the three steps of a narrow screen; go[i] makes step i a button
export function setSteps(labels,on,go){
  const st=$("steps"); st.replaceChildren(); st.hidden=false;
  labels.forEach((l,i)=>st.append(el("button",{type:"button",class:i<on?"done":i===on?"on":"","aria-current":i===on?"step":null,disabled:!(go&&go[i]),onclick:go&&go[i]?go[i]:null,text:(i+1)+" "+l})));
}
// What has the focus, so that a redraw can give it back: a text field by its id and selection; in the menu, Settings and the practice options any control by its place among the controls
// (Settings is redrawn when the account's sync status changes, the menu when an update arrives, and a focused button or switch would otherwise be lost).
const KEEP_BOXES=["over","menu"];
const OVER_CONTROLS="button,input,textarea,select,[tabindex]";
function focusKey(){
  const a=/** @type {HTMLInputElement} */(document.activeElement);
  if(!a) return null;
  if((a.tagName==="INPUT"||a.tagName==="TEXTAREA")&&a.id) return {id:a.id,s:a.selectionStart,e:a.selectionEnd};
  for(const box of KEEP_BOXES){
    const n=$(box);
    if(n&&n.contains(a)){ const i=[...n.querySelectorAll(OVER_CONTROLS)].indexOf(a); if(i>=0) return {box,i,s:a.selectionStart,e:a.selectionEnd}; }
  }
  return null;
}
function restoreFocus(f){
  if(!f) return;
  const n=/** @type {HTMLInputElement|null} */(f.id!==undefined?$(f.id):(()=>{ const box=$(f.box); return box?box.querySelectorAll(OVER_CONTROLS)[f.i]||null:null; })());
  if(!n||n.disabled||document.activeElement===n) return;
  n.focus({preventScroll:true}); try{ n.setSelectionRange(f.s,f.e); }catch(e){}
}
// A redraw that the learner did not ask for (a run finished, an explanation began by itself) keeps the keyboard focus where it was: on the same button,
// found again by its label. The renderer itself gives back only text fields and the controls of the Options panel and the settings sheet.
function btnSig(){
  const a=/** @type {HTMLButtonElement} */(document.activeElement); if(!a||a.tagName!=="BUTTON") return null;
  const box=a.closest("#stage,#coach"); if(!box) return null;
  const k=b=>b.textContent+"|"+(b.getAttribute("aria-label")||"")+"|"+(b.getAttribute("data-fid")||""), same=[...box.querySelectorAll("button")].filter(b=>k(b)===k(a));
  return {box:box.id,k:k(a),i:same.indexOf(a)};
}
function btnBack(f){
  if(!f) return; const box=$(f.box); if(!box) return;
  const k=b=>b.textContent+"|"+(b.getAttribute("aria-label")||"")+"|"+(b.getAttribute("data-fid")||""), same=[...box.querySelectorAll("button")].filter(b=>k(b)===f.k), n=same[f.i]||same[0];
  if(n&&document.activeElement!==n) n.focus({preventScroll:true});
}
export function renderKeepFocus(){ const f=btnSig(); render(); btnBack(f); }
export const focusCin=()=>{ const i=$("cin"); if(i) i.focus({preventScroll:true}); };
function screenSig(){
  const p=state.cur&&state.cur.p;
  return [state.tab,state.mode,state.view,state.optsOpen?1:0,state.sessOpen?1:0,state.sessPage||"",state.skipAsk?1:0,state.coachOpen?1:0,isWide()?1:0,p?(p.id||p.a+"|"+p.b):state.cur&&state.cur.c?state.cur.c.id:"",state.ui?[state.ui.checked?1:0,state.ui.step||0,state.ui.ci||0,state.ui.rel?1:0,state.ui.open?1:0,state.ui.debate?1:0,state.ui.find?1:0].join(""):""].join("/");
}
export function render(){
  const sig=screenSig(), keep=sig===state.lastSig?["stage","coach","over","opts"].map(id=>{ const n=$(id); return /** @type {[string, number]} */([id,n?n.scrollTop:0]); }):null;
  state.lastSig=sig;
  renderNow();
  if(keep) for(const [id,y] of keep){ const n=$(id); if(n&&y&&!n.hidden) n.scrollTop=y; }
  navSync();
}
function renderNow(){
  const w=isWide(); if(w&&state.view==="chat") state.view=null;
  const drawerGone=w&&state.menuOpen;
  if(w) state.menuOpen=false; else state.menuPeek=false;
  // the phone's drawer stopped the question's clock; when the window turns wide with it open there is no drawer to wait for, and the clock runs again
  if(drawerGone&&state.blitz&&asking()&&!state.ui.tq) startQ();
  ensureRelTimer();
  // the tutor's panel closes with the pair it was opened for
  if(state.lastUi!==state.ui){ if(state.lastUi&&state.lastUi.chat) state.coachOpen=false; state.lastUi=state.ui; }
  const app=$("app"), s=$("stage"), c=$("coach"), f=focusKey(), coach=w&&state.mode==="quiz"&&isEx()&&state.coachOpen;
  app.dataset.tab=state.tab; app.dataset.wide=w?"1":"0"; app.dataset.coach=coach?"1":"0"; c.hidden=!coach;
  renderBar(); renderMenu();
  s.replaceChildren(); c.replaceChildren(); $("steps").replaceChildren(); $("steps").hidden=true;
  s.className="card"+(state.tab==="review"?" rv":"");
  if(state.mode==="nodb"){ s.append(el("p",{class:"status",text:"Open this page in Claude while signed in to save your answers."})); }
  if(state.mode==="loading"){ s.append(el("p",{class:"status",text:"Loading."})); renderOver(); return; }
  if(state.mode==="nodata"){ s.append(el("p",{class:"status",text:"The practice data could not be loaded. Reload the page to try again."})); renderOver(); return; }
  if(state.tab==="review") renderReview(s);
  else if(state.mode==="quiz"){
    if(state.tab==="debate"&&state.ui&&state.ui.debate) renderDebate(s,c);
    else if(state.tab==="find"&&state.ui&&state.ui.find) renderFind(s,c);
    else if(state.tab==="cq"&&state.ui&&state.ui.cq) renderCq(s,c);
    else renderQuiz(s,c);
  }
  renderOver(); restoreFocus(f&&f.id!==undefined&&state.skipAsk?null:f); placePops(); dropStaleDef(); // the question before a skip has the focus, not the field under it
}
/** After a check the result is shown from its top. A phone puts the focus on the forward button (Next pair); a wide screen on Explain, or on the screen itself when
 *  the answer is explained by itself or already is, so that no key press moves on by mistake (Next pair is the N key). */
export function focusAfterCheck(){
  top0();
  if(!isWide()){ const bs=document.querySelectorAll("#stage .actions .btn"); if(bs.length) bs[bs.length-1].focus({preventScroll:true}); return; }
  const x=state.autoExplain&&canAsk()?null:/** @type {HTMLElement|null} */(document.querySelector("#stage .verdict .xpl"));
  (x||$("stage")).focus({preventScroll:true});
  // the result sits under the table: bring its foot into view above the pair bar, or its head when it is taller than the room there is
  const v=document.querySelector("#stage .verdict");
  if(v){ v.scrollIntoView({block:"end"}); if(v.getBoundingClientRect().top<$("stage").getBoundingClientRect().top) v.scrollIntoView({block:"start"}); }
}

wideMq.addEventListener("change",()=>{ syncVv(); if(state.mode!=="loading") render(); });

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
