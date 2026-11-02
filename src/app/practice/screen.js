import { state } from "../state.js";
import { NAME_CELL, VERDICT_RE, noteParts, parseFactLine, partsText } from "../../domain/verdict.ts";
import { CELLS, REL } from "../core/rel.js";
import { stopTimer } from "../debate/flow.js";
import { QCELL, singular } from "../debate/text.js";
import { next } from "./queue.js";
import { focusCin, render } from "../shell/render.js";

/* ---------- practice: what the Path's exercises share (path/relations.tsx and the others draw them) ---------- */
// Claude's explanation split by where it belongs: a line per cell (or Q1 to Q4) goes to that cell, the lines on the common locus,
// the pervasion and the relation to the "?" beside the relation. Anything else (the explanation, the misconception) belongs to the Why panel.
const REL_LABEL=/^(common locus|pervasion|relation)$/i;
// A note opens under the heading "Why?", so the "Why?" the tutor starts a debate line with would be said twice.
const WHY_LEAD=/^why\?\s+(?=\S)/i;
// A fact line's note (src/domain/verdict.ts) in the debate's form; in the debate it depends on whether the learner accepted that question.
const acceptedQ=f=>{ const u=state.ui, a=u&&u.debate&&u.ans&&u.ans[QCELL.indexOf(f.cell)]; return !!a&&a.say!=="why"; };
// the term data's steps (src/domain/ladder.ts) need the data, the pair and its terms as the note writes them
export const noteData=(p=state.cur.p)=>({ix:state,p,terms:{a:singular(p.a),b:singular(p.b)}});
// `ctx` ({p, accepted}) is given where a stored note is shown away from the exercise on screen (Review): its pair and what was accepted, not the live ones
const partsOf=(f,ctx)=>noteParts(f,ctx?ctx.accepted(f):acceptedQ(f),noteData(ctx?ctx.p:undefined));
export const factText=f=>partsText(partsOf(f),noteData().terms);
// the same as the steps a page draws itself (the Path writes them as a list), not as text
export const factParts=f=>partsOf(f);
// the same for a stored note, read against its own pair and answers (`ctx`, review/exercise.js noteContext)
export const factTextIn=(f,ctx)=>partsText(partsOf(f,ctx),noteData(ctx.p).terms);
// the newest explanation (a pair of one's own that Claude left unsettled can be asked again): the notes and the Why panel show that one, earlier turns stay in the chat
function latestExplain(ok=/** @type {(t:any)=>boolean} */(()=>true)){
  const chat=(state.ui&&state.ui.chat)||[];
  for(let i=chat.length-1;i>=0;i--){ const t=chat[i]; if(t.role==="assistant"&&t.kind==="explain"&&ok(t)) return t; }
  return null;
}
export function explainParts(){
  const out={cells:{},facts:{},rest:[]};
  const a=latestExplain(t=>!t.pending&&t.content);
  if(!a) return out;
  for(const ln0 of a.content.split("\n")){
    const f=parseFactLine(ln0); if(f){ out.cells[f.cell]=factText(f); out.facts[f.cell]=f; continue; }
    const ln=ln0.replace(/^[-•*\s]+/,"").replace(/\*\*/g,"").replace(VERDICT_RE,"").trim(); if(!ln) continue;
    const m=ln.match(/^(both|a not b|b not a|neither|q[1-4])\s*:\s*(.+)$/i);
    if(m){ out.cells[NAME_CELL[m[1].toLowerCase()]]=m[2].replace(WHY_LEAD,""); continue; }
    const g=ln.match(/^([A-Za-z][A-Za-z0-9 ,'’-]{0,28}):\s+(.*)$/);
    if(g&&REL_LABEL.test(g[1])) out.rest.push([g[1],g[2]]);
  }
  return out;
}
// The example a cell holds when a fact the app's server learned settled its verdict ("from an earlier check", ai/known.js); a flag on the cell's note names it, and the server
// disputes what it learned of it (docs/SERVER.md, "Learned facts"). undefined for any other cell.
export function learnedThing(c){
  const U=state.ui, r=U&&U.res&&U.res.cells[c]; if(!r||!r.learned) return undefined;
  const t=U.debate?(U.ans[QCELL.indexOf(c)]||{}).text:(U.cells[c]||{}).t;
  return String(t||"").trim().slice(0,200)||undefined;
}
/** The forward button of a checked pair (path/foot.ts). */
export const nextFwd=()=>({label:state.cur.retry&&!state.retryQ.length?"Back to new pairs":"Next pair",hint:"N",onclick:()=>next()});
export const fillable=()=>CELLS.filter(k=>!REL[state.ui.rel].empty.includes(k));
/** Only the "neither" case may say that nothing exists: the other cases are asked because the relation chosen needs them, so their examples justify the choice. */
export const mayBeEmpty=c=>c==="nei";
/** Whether the case `c` of the attempt `u` has an example (or says that nothing exists). */
export const filled=(c,u=state.ui)=>{ const x=u.cells[c]; return !!(x.t||"").trim()||(mayBeEmpty(c)&&!!x.none); };
/** Whether the time of the case `c` ran out (Sprint): it stands answered with nothing, and is not opened again (shell/timers.js). */
export const missedCase=(c,u=state.ui)=>!!(u.missed&&u.missed[c]);
/** Whether the case `c` is done: it has an example, or its time ran out. */
export const settled=(c,u=state.ui)=>filled(c,u)||missedCase(c,u);
// `voiced` when the relation was spoken (shell/voice.js): no field takes the focus, so a phone keeps its keyboard down
export function choose(k,voiced){
  if(state.ui.checked||state.ui.late) return;
  if(!state.ui.rel) stopTimer();
  state.ui.rel=k; state.ui.open=false; state.ui.ci=0; state.ui.seen=0; state.ui.review=false; state.ui.missed={}; for(const c of REL[k].empty){ state.ui.cells[c].t=""; state.ui.cells[c].none=false; }
  render();
  if(!voiced) focusCin();
}
// in a lineage the terms are joined by "is a" (short for "is a kind of"), small and italic; the sign > would read as "greater than"
export const isA=n=>/^[aeiou]/i.test(n)?"is\u00a0an":"is\u00a0a";
