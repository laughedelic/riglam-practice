import { state } from "../state.js";
import { autoFlags, flagKeyOf } from "./flags.js";
import { CELLS, REL } from "../core/rel.js";
import { QCELL } from "../debate/text.js";
import { cellFor, disputeText, quorumDisputes, readings } from "../../domain/quorum.ts";
import { norm } from "../practice/universe.js";
import { render, renderKeepFocus } from "../shell/render.js";

/* ---------- Quorum: the tutor's mode of several models and a judge (Preview servers, docs/SERVER.md) ---------- */
// With Quorum on, the explanation of a checked answer (Explain, or "Check every answer with AI") is asked of the app's server with `quorum: true`. The server has Haiku,
// Sonnet and Opus answer it on their own; where they put an example in different cells, Opus reads their answers and writes the one that is shown. The text you read and
// the verdicts the page takes from it (tutor.js, applyVerify) are that one answer. The server keeps every run; the page keeps nothing of it but the flags it raises
// (collection "flags") where the models are divided, and shows the run to the maintainer in the Quorum chip (quorum-panel.js). With Quorum off, one model answers as ever.
export const setQuorum=on=>{ state.quorumChoice=!!on; state.quorum=!!on; try{ localStorage.setItem("rd-quorum",on?"1":"0"); }catch(e){} render(); };
// what the server offers this device (platform.quorum: false, "on" or "optin"). Without a choice of its own the device follows the server: on for "on" (a Preview), off for "optin".
export function setQuorumOffer(offer){
  state.quorumOffered=!!offer; state.quorumOptIn=offer==="optin";
  state.quorum=!!offer&&(state.quorumChoice===null?offer==="on":state.quorumChoice);
}
// whether this device uses Quorum for an explain question: the server offers it, this device has it on, and the question goes to the server (the artifact asks its host's model instead)
export const quorumOn=()=>!!(state.quorumOffered&&state.quorum&&state.tutor&&!state.sample);
// Quorum has something to decide only where the page could not check an example (verdict "cmp"): the tutor's lines are then the check, and the models can put it in different
// cells. When every cell has a verdict, the tutor only explains what the page computed, and three models would explain it three times.
export const quorumNeeded=U=>!!(U&&U.res&&U.res.exOpen>0);
// whether the explain question of this answer goes to Quorum
export const quorumWanted=U=>quorumOn()&&quorumNeeded(U);
// whether the Quorum chip belongs on a checked answer; Review shows the flags wherever there is a tutor to flag, or flags to look at
export const quorumChip=()=>!!(state.quorumOffered&&state.quorum&&state.db);
export const quorumShown=()=>!!(state.db&&(state.quorumOffered||state.sample||Object.keys(state.flags).length));

export function quorumBegin(U){ U.quorum={busy:true,steps:[],record:null}; }
export function quorumStep(U,step){ const q=U.quorum; if(!q) return; q.steps.push(step); if(U===state.ui&&U.rtab==="quorum") renderKeepFocus(); }
export function quorumDropped(U){ delete U.quorum; }
// the answer is in: keep the record, and flag the examples the models are divided about
// `C` is the pair the question was asked about: the learner may have gone to another pair while the models worked, and the flags belong to the one answered.
export function quorumEnd(U,r,C){
  const q=U.quorum; if(!q) return;
  q.busy=false; q.record=r.quorum||null; if(r.single) q.single=r.single;
  quorumFlagDisputes(U,C);
}

// the things the learner wrote in this answer, each with the cell(s) it stood in and the page's verdict there
export function quorumThings(U){
  const out=[], seen={};
  const add=(text,c)=>{ const t=String(text||"").trim(), k=norm(t); if(!k) return; let o=seen[k]; if(!o){ o=seen[k]={text:t.slice(0,1000),cells:[],page:{}}; out.push(o); } if(!o.cells.includes(c)){ o.cells.push(c); o.page[c]=U.res.cells[c].v; } };
  if(U.debate) QCELL.forEach((c,i)=>{ if(U.ans[i].say==="why") add(U.ans[i].text,c); });
  else CELLS.forEach(c=>{ if(!REL[U.rel].empty.includes(c)&&!U.cells[c].none) add(U.cells[c].t,c); });
  return out.slice(0,6);
}
// what one call of the run says of an example: its cell (null: unsure or not mentioned), and the reading itself when there is one
export function runReading(run,text){
  if(!run||!run.ok) return null;
  const k=norm(text), all=readings(run.text).filter(r=>norm(r.example)===k);
  return all.find(r=>r.cell)||all[0]||null;
}
// Where Quorum is divided about an example, the page flags it by itself (see autoFlags). The page's verdict is read now, so a verdict Claude gave since the check counts.
function quorumFlagDisputes(U,C){
  try{
    const rec=U.quorum&&U.quorum.record; if(!rec||!U.res||!C) return;
    const things=quorumThings(U).map(t=>({text:t.text,cells:t.cells,page:Object.fromEntries(t.cells.map(c=>[c,U.res.cells[c]?U.res.cells[c].v:t.page[c]]))}));
    const read=run=>things.map(t=>cellFor(readings(run.text),t.text));
    const models=rec.models.filter(m=>m.ok).map(m=>({name:m.name,cells:read(m)}));
    const judge=rec.judge&&rec.judge.ok?read(rec.judge):null;
    const p=C.p, kase={key:flagKeyOf(U),a:p.a,b:p.b,relation:p.relation,tab:U.debate?"debate":"practice"};
    autoFlags(kase,quorumDisputes(things,models,judge).map(d=>({thing:things[d.index].text,shown:disputeText(d,things[d.index]),runId:rec.id})));
  }catch(e){}          // Quorum is optional: a failing flag must never break the page
}
