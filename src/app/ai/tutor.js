import { state } from "../state.js";
import { $, el } from "../core/dom.js";
import { canAsk } from "../core/ask.js";
import { CELLS } from "../core/rel.js";
import { persist } from "../practice/answers.js";
import { fillTurn, revealTutor } from "../practice/screen.js";
import { render } from "../shell/render.js";
import { cardBody, explainAsk, tutorCard } from "../../ai-shared/card.ts";
import { pairCats } from "../../ai-shared/lookup.ts";
import { tutorTools } from "../../ai-shared/tools.ts";
import { VERDICT_RE, applyVerdicts, parseVerdicts } from "../../domain/verdict.ts";

export const ERR_OFF=["not_granted","sampling_disabled","not_declared","capability_disabled","capability_removed"];
const TIER="default";

/* ---------- tutor: per-pair card plus two lookup tools ---------- */
// The card, the standing instructions, the explain request and the tools are built in src/ai-shared from the term data,
// so that the Worker tutor produces the same text; the page passes `state` as the data index.
function applyVerify(text,U,C){
  const n=applyVerdicts(C.p,U.res,parseVerdicts(text));
  if(n&&state.db&&U.doc&&U.saveId){
    for(const c of CELLS){ U.doc.cells[c].verdict=U.res.cells[c].v; if(U.res.cells[c].by) U.doc.cells[c].by="claude"; }
    if(U.doc.qs) for(const q of U.doc.qs){ const r=U.res.cells[q.c]; q.verdict=r.v; if(r.by) q.by="claude"; }
    U.doc.grade=U.res.overall; U.doc.verifiedAt=new Date().toISOString();
    persist(U,"The verification");
  }
  return n;
}
// The explanation is kept with the answer (applyVerify saves it along with the verdicts), so verdicts can be audited later.
function saveExplain(U){ persist(U,U.debate?"Your debate":"Your answer"); }
// With "Check every answer with AI" on (Options), a checked answer asks for the explanation the Explain button would ask for, with no tap. It asks once per
// answer, only where the tutor can answer (a device without the Magic Key still gets the grayed button), and it leaves the screen and the focus where they are.
export function explainByItself(U){
  if(!state.autoExplain||U!==state.ui||!U.checked||U.explained||U.ctl||!canAsk()) return;
  ask(null,"explain",true);
}
export async function ask(text,kind,byItself){
  const U=state.ui, C=state.cur;                       // the pair this question belongs to, even if you switch tabs meanwhile
  if(!canAsk()||!U||U.ctl) return;
  const p=C.p, direct=!!state.sample;                  // the host's own model call, or else the app's server
  const body=kind==="explain"?explainAsk(U):text;
  // The server holds the standing instructions and the notes itself, so what it gets as the first turn is the card alone.
  if(!U.chat) U.chat=[{role:"user",content:(direct?tutorCard(state,p,U):cardBody(state,p,U))+"\n\n"+body, hidden:true}];
  else U.chat.push({role:"user",content:body,hidden:!!kind});
  if(kind==="explain"){ U.explained=true; U.rtab="tutor"; }
  U.chat.push({role:"assistant",content:"",pending:true,kind});
  U.chatErr=""; const ctl=U.ctl=new AbortController(); render(); if(U===state.ui&&!byItself) revealTutor();
  const turns=U.chat.filter(t=>!t.pending).map(t=>({role:t.role,content:t.content}));
  const slot=U.chat[U.chat.length-1];
  const onText=({text})=>{slot.content=text; if(U===state.ui){ const o=$("ans-live"); if(o){ fillTurn(o,{kind,pending:true,content:text},!o.closest("#chatscroll")); const sc=$("chatscroll"); if(sc) sc.scrollTop=0; } }};
  const opts={signal:ctl.signal,modelTier:TIER,cache:false,onText};
  if(state.DATA) opts.tools=tutorTools(state);
  try{
    let r;
    if(direct){
      try{ r=await state.sample(turns,opts); }
      catch(e){ if(e&&e.code==="tools_unavailable"){ delete opts.tools; r=await state.sample(turns,opts); } else throw e; }
    }else r=await state.tutor({kind:kind==="explain"?"explain":"chat",cats:pairCats(state,p).filter(Boolean),turns},{signal:ctl.signal,onText});
    slot.content=r.text+(r.truncated?"\n(Cut short.)":""); delete slot.pending;
    if(kind==="explain"){ if(U.doc) U.doc.explain=String(r.text||"").slice(0,3000); if(!(U.res.exOpen&&applyVerify(r.text,U,C))) saveExplain(U); }
  }catch(e){
    if(e&&e.text){ slot.content=e.text; delete slot.pending; } else U.chat.pop();
    if(kind==="explain") U.explained=false;
    if(U.chat.length===1) U.chat=null;
    U.chatErr=errCopy(e);
    if(e&&ERR_OFF.includes(e.code)){ state.sample=null; state.tutor=null; }
  }
  U.ctl=null;
  if(U===state.ui){ render(); if(byItself) return; if(kind==="explain") revealTutor(); const i=$("ask-in"); if(i&&!("ontouchstart" in window)) i.focus(); }
}
export function fillAns(node,text){
  node.replaceChildren();
  const lines=(text||"").split("\n").map(s=>s.trim()).filter(Boolean);
  if(!lines.length){ node.append(el("p",{class:"status thinking"},"Thinking",el("span",{class:"dots","aria-hidden":"true"},el("i"),el("i"),el("i")))); return; }
  for(const ln0 of lines){
    const ln=ln0.replace(VERDICT_RE,"");
    const m=ln.replace(/^[-•]\s*/,"").match(/^([A-Za-z][A-Za-z0-9 ,'’-]{0,28}):\s+(.*)$/);
    node.append(m?el("p",null,el("b",{text:m[1]+": "}),m[2]):el("p",{text:ln.replace(/^[-•]\s*/,"")}));
  }
}
/** A used-up daily budget: whose it is, when the tutor opens again (in the person's own time), and that the rest keeps working. */
function budgetCopy(e){
  const lead=e.scope==="device"?"You have used your share of the tutor for today.":e.scope==="global"?"The tutor has reached its limit for today for everybody.":e.scope==="caller"?"The tutor is paused for this connection: too many wrong Magic Keys were tried from it.":"The tutor's limit for today is used up.";
  const at=e.resetsAt?new Date(e.resetsAt):null;
  let when=" Try again tomorrow.";
  if(at&&!isNaN(at.getTime())){
    const time=at.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"});
    when=at.toDateString()===new Date().toDateString()?` It is available again at ${time}.`:` It is available again tomorrow at ${time}.`;
  }
  return lead+when+" Everything else in the app keeps working.";
}
function errCopy(e){
  const c=e&&e.code;
  if(c==="cancelled") return "";
  if(c==="offline") return "No connection. The tutor needs the internet; try again when you are back online.";
  if(c==="rate_limited") return e.budget?budgetCopy(e):"Claude is busy or your usage limit is reached. Try again later.";
  if(c==="session_expired") return "Sign in to Claude again, then retry.";
  if(c==="prompt_too_large") return "This conversation is too long. Move to the next pair.";
  if(ERR_OFF.includes(c)) return "Claude is not enabled for this page.";
  return "Claude could not answer just now. Try again.";
}
