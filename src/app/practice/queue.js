import { state } from "../state.js";
import { pairsOf } from "../core/util.js";
import { advanceSyllogism } from "../syllogism/flow.js";
import { advanceDebate } from "../debate/flow.js";
import { advanceFind } from "../find/flow.js";
import { isSkipped } from "./skips.js";
import { nextGenerated } from "./universe.js";
import { render, top0 } from "../shell/render.js";

export function freshUi(){return {rel:null, open:true, cells:{both:{t:"",none:false},anb:{t:"",none:false},bna:{t:"",none:false},nei:{t:"",none:false}}, checked:false, res:null, chat:null, chatErr:"", q:"", ci:0, seen:0, review:false, rtab:"auto", pop:null, tq:null, tid:null, tph:null, late:false, exLate:false};}

/* ---------- queue: retry run, then older prepared pairs not yet answered, then generated ---------- */
function nextPair(){
  if(state.retryQ.length) return {p:state.retryQ.shift(), retry:true, tag:state.retryTag};
  for(const b of state.batches){ const q=pairsOf(b).find(p=>!state.answers[p.id]&&!isSkipped(p)); if(q) return {p:q, legacy:true}; }
  return {p:nextGenerated()};
}
export function advance(){ state.cur=nextPair(); state.ui=freshUi(); state.mode="quiz"; }
export function next(){ if(state.ui&&state.ui.ctl) state.ui.ctl.abort(); if(state.ui&&state.ui.debate) advanceDebate(); else if(state.ui&&state.ui.find) advanceFind(); else if(state.ui&&state.ui.syllogism) advanceSyllogism(); else advance(); render(); top0(); }
