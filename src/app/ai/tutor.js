import { state } from "../state.js";
import { $, el } from "../core/dom.js";
import { ERR_OFF, canAsk } from "../core/ask.js";
import { CELLS } from "../core/rel.js";
import { isWide } from "../core/viewport.js";
import { quorumBegin, quorumDropped, quorumEnd, quorumStep, quorumThings, quorumWanted } from "./quorum.js";
import { askShare } from "./share-notice.js";
import { persist } from "../practice/answers.js";
import { factNode, fillTurn, noteData, revealTutor } from "../practice/screen.js";
import { render, renderKeepFocus } from "../shell/render.js";
import { cardBody, explainAsk, tutorCard } from "../../ai-shared/card.ts";
import { topStage } from "../../domain/stages.ts";
import { noteCats } from "../../ai-shared/lookup.ts";
import { tutorTools } from "../../ai-shared/tools.ts";
import { askSyllogism } from "../syllogism/tutor.js";
import { VERDICT_RE, applyRelationVerdict, applyVerdicts, parseFactLine, parseRelationVerdict, parseVerdicts } from "../../domain/verdict.ts";

const TIER="default";

/* ---------- tutor: per-pair card plus two lookup tools ---------- */
// The card, the standing instructions, the explain request and the tools are built in src/ai-shared from the term data,
// so that the Worker tutor produces the same text; the page passes `state` as the data index.
function applyVerify(text,U,C){
  // a pair of the learner's own that Claude has not settled can be asked about again: the new answer then replaces what Claude said about the examples before
  let n=applyVerdicts(C.p,U.res,parseVerdicts(text,noteData(C.p)),!!(U.find&&C.p.own&&U.res.relOpen)); // the cells settle as the notes read
  // Find a pair, a pair of the learner's own: the tutor says whether it has the relation asked for, which settles that and the cells the relation leaves empty
  if(U.find&&C.p.own){ const v=parseRelationVerdict(text,U.rel); if(v&&applyRelationVerdict(C.p,U.res,v)) n++; }
  if(n) saveVerdicts(U,C);
  return n;
}
/** Writes the verdicts that settled since the check into the answer's document, with who settled each ("claude", or "course" for the reference examples). */
export function saveVerdicts(U,C){
  if(!state.db||!U.doc||!U.saveId) return;
  for(const c of CELLS){ U.doc.cells[c].verdict=U.res.cells[c].v; if(U.res.cells[c].by) U.doc.cells[c].by=U.res.cells[c].by; }
  if(U.doc.qs) for(const q of U.doc.qs){ const r=U.res.cells[q.c]; q.verdict=r.v; if(r.by) q.by=r.by; }
  U.doc.grade=U.res.overall; U.doc.verifiedAt=new Date().toISOString();
  if(U.find){ U.doc.correct=U.res.relOk; U.doc.key=C.p.relation; if(U.res.relOpen) U.doc.relOpen=true; else delete U.doc.relOpen; }
  persist(U,"The verification");
}
// The learner's examples the page could not check (verdict "cmp"), each with its cell: the server keeps what the explanation says of them where it is
// set to (docs/SERVER.md, "Learned facts"). Read before the verdicts arrive, so these are the examples the explanation is the check of. An example that
// one known side already failed (`half`, known.js) is named too: the explanation says its other side, which the server keeps.
function openExamples(U){
  if(!U||!U.res) return [];
  return quorumThings(U).filter(t=>t.text.length<=200).flatMap(t=>t.cells.filter(c=>U.res.cells[c]&&(U.res.cells[c].v==="cmp"||U.res.cells[c].half)).map(c=>({cell:c,text:t.text}))).slice(0,8);
}
// Whether this device shares its examples with the server, read where they are sent: another tab may have turned the switch off since this page started (`rd-share`),
// and the opt-out wins; it stays in memory too, in case the storage cannot be read again. The same for having been told (another tab may have asked).
function sharing(){
  try{ if(localStorage.getItem("rd-share")==="0") state.shareExamples=false; if(localStorage.getItem("rd-share-told")==="1") state.shareTold=true; }catch(e){}
  return state.shareExamples;
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
  if(state.ui&&state.ui.syllogism) return askSyllogism(text,kind,byItself);   // Syllogisms have their own card (syllogism/tutor.js)
  const U=state.ui, C=state.cur;                       // the pair this question belongs to, even if you switch tabs meanwhile
  if(!canAsk()||!U||U.ctl) return;
  // the examples known without the AI settle first (known.js), so the question is about the rest; if the learner left the answer meanwhile (Next, or another tab:
  // Next cannot stop a question that has not started), nothing is asked of it
  if(U.knowing){ await U.knowing; if(U!==state.ui||!canAsk()||U.ctl||(kind==="explain"&&U.explained)) return; }
  const p=C.p, direct=!!state.sample;                  // the host's own model call, or else the app's server
  const quorum=kind==="explain"&&quorumWanted(U);     // the explanation of a checked answer is asked of Quorum, where this server offers it, this device has it on and an example is left to check
  const body=kind==="explain"?explainAsk(U):text;
  // The server keeps the examples only with `share`, which a page sends where the server said it keeps learned facts and the learner has been told (share-notice.js). The
  // first question that would name examples waits for the learner's answer to the one-time dialog (the answer, yes or no, is kept on the device); a learner who left the
  // answer meanwhile (the dialog covers the page, but a shortcut or the browser's Back may still move the exercise on) is asked nothing for it, as after the lookup above.
  // Without an answer (a browser that could not open the dialog) no example is named.
  // a pair with a negated side names none: what the server keeps is said of the categories themselves
  let examples=!direct&&kind==="explain"&&!p.neg&&sharing()?openExamples(U):[];
  if(examples.length&&state.learns&&!state.shareTold){
    await askShare();
    if(U!==state.ui||!canAsk()||U.ctl||(kind==="explain"&&U.explained)) return;
    examples=state.shareTold&&sharing()?openExamples(U):[];
  }
  const share=examples.length>0&&state.learns&&state.shareTold;
  // The server holds the standing instructions and the notes itself, so what it gets as the first turn is the card alone.
  if(!U.chat){ U.stage=topStage(state.stages); U.chat=[{role:"user",content:(direct?tutorCard(state,p,U):cardBody(state,p,U))+"\n\n"+body, hidden:true, asked:kind?undefined:text}]; }   // `asked`: the question alone, for a flag on its answer
  else U.chat.push({role:"user",content:body,hidden:!!kind});
  // the answer comes to the panel at the right on a wide screen (it opens), and to the Why chip of the result on a narrow one
  if(kind==="explain"){ U.explained=true; U.rtab="tutor"; }
  if(isWide()&&U===state.ui) state.coachOpen=true;
  U.chat.push({role:"assistant",content:"",pending:true,kind});
  // an explanation that began by itself redraws the screen twice (it starts, it is in) with the learner's hands on the result: the focus stays on its button
  const draw=byItself?renderKeepFocus:render;
  U.chatErr=""; const ctl=U.ctl=new AbortController(); if(quorum) quorumBegin(U); draw(); if(U===state.ui&&!byItself) revealTutor();
  const turns=U.chat.filter(t=>!t.pending).map(t=>({role:t.role,content:t.content}));
  const slot=U.chat[U.chat.length-1];
  const onText=({text})=>{slot.content=text; if(U===state.ui){ const o=$("ans-live"); if(o){ fillTurn(o,{kind,pending:true,content:text},!o.closest("#chatscroll")); const sc=$("chatscroll"); if(sc) sc.scrollTop=0; } }};
  const opts={signal:ctl.signal,modelTier:TIER,cache:false,onText};
  if(state.DATA) opts.tools=tutorTools(state,state.EX);
  try{
    let r;
    if(direct){
      try{ r=await state.sample(turns,opts); }
      catch(e){ if(e&&e.code==="tools_unavailable"){ delete opts.tools; r=await state.sample(turns,opts); } else throw e; }
    }else{
      r=await state.tutor({kind:kind==="explain"?"explain":"chat",cats:noteCats(state,p),turns,...(quorum?{quorum:true}:{}),...(examples.length?{examples,...(share?{share:true}:{})}:{})},{signal:ctl.signal,onText,onStep:s=>quorumStep(U,s)});
    }
    slot.content=r.text+(r.truncated?"\n(Cut short.)":""); delete slot.pending;
    if(kind==="explain"){ if(U.doc) U.doc.explain=String(r.text||"").slice(0,3000); if(!((U.res.exOpen||U.res.relOpen)&&applyVerify(r.text,U,C))) saveExplain(U); }
    if(quorum) quorumEnd(U,r,C);                          // after the verdicts: the flags compare the models with the page's verdicts as they now stand
  }catch(e){
    if(e&&e.text){ slot.content=e.text; delete slot.pending; } else U.chat.pop();
    if(kind==="explain") U.explained=false;
    if(quorum) quorumDropped(U);
    if(U.chat.length===1) U.chat=null;
    U.chatErr=errCopy(e);
    if(e&&ERR_OFF.includes(e.code)){ state.sample=null; state.tutor=null; }
  }
  U.ctl=null;
  if(U===state.ui){ draw(); if(byItself) return; if(kind==="explain") revealTutor(); const i=$("ask-in"); if(i&&!("ontouchstart" in window)) i.focus(); }
}
// `ctx` ({p, accepted}) reads the fact lines against a stored pair instead of the exercise on screen (practice/screen.js, factNode)
export function fillAns(node,text,ctx){
  node.replaceChildren();
  const lines=(text||"").split("\n").map(s=>s.trim()).filter(Boolean);
  if(!lines.length){ node.append(el("p",{class:"status thinking"},"Thinking",el("span",{class:"dots","aria-hidden":"true"},el("i"),el("i"),el("i")))); return; }
  for(const ln0 of lines){
    const f=parseFactLine(ln0); if(f){ node.append(factNode(f,el("b",{text:f.label+":"}),undefined,ctx)); continue; }
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
/** What the learner is told when the tutor could not answer; `thing` is what the exercise calls what it asks (a pair, a syllogism). */
export function errCopy(e,thing="pair"){
  const c=e&&e.code;
  if(c==="cancelled") return "";
  if(c==="offline") return "No connection. The tutor needs the internet; try again when you are back online.";
  if(c==="rate_limited") return e.budget?budgetCopy(e):"Claude is busy or your usage limit is reached. Try again later.";
  if(c==="session_expired") return "Sign in to Claude again, then retry.";
  if(c==="prompt_too_large") return "This conversation is too long. Move to the next "+thing+".";
  if(ERR_OFF.includes(c)) return "Claude is not enabled for this page.";
  return "Claude could not answer just now. Try again.";
}
