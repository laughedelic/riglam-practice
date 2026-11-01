import { state } from "../state.js";
import { pairsOf } from "../core/util.js";
import { advanceCategories } from "../categories/flow.js";
import { advanceInstance } from "../instance/flow.ts";
import { advanceSyllogism } from "../syllogism/flow.js";
import { advanceDebate } from "../debate/flow.js";
import { advanceFind } from "../find/flow.js";
import { passNegOffer } from "./negations.ts";
import { isSkipped } from "./skips.js";
import { closeStageUp, passStageOffer, takeStageUp } from "./stage-offer.ts";
import { takeStop } from "./stops.ts";
import { nextGenerated } from "./universe.js";
import { cue } from "../sound/play.ts";
import { render, top0 } from "../shell/render.js";

export function freshUi(){return {rel:null, open:true, cells:{both:{t:"",none:false},anb:{t:"",none:false},bna:{t:"",none:false},nei:{t:"",none:false}}, checked:false, res:null, chat:null, chatErr:"", q:"", ci:0, seen:0, review:false, rtab:"auto", pop:null, tq:null, tid:null, tph:null, late:false, exLate:false, missed:{}};}

/* ---------- queue: retry run, then older prepared pairs not yet answered, then generated ---------- */
function nextPair(){
  if(state.retryQ.length) return {p:state.retryQ.shift(), retry:true, tag:state.retryTag};
  for(const b of state.batches){ const q=pairsOf(b).find(p=>!state.answers[p.id]&&!isSkipped(p)); if(q) return {p:q, legacy:true}; }
  return {p:nextGenerated(undefined,true)};
}
export function advance(){ passNegOffer(); state.cur=nextPair(); state.ui=freshUi(); state.mode="quiz"; }
// Next: a course term's stop comes first when one is due (practice/stops.ts); from the stop, Next goes on to the question. `sound`: false when a sound was just played (moveOn).
export function next(sound=true){ if(state.ui&&state.ui.ctl) state.ui.ctl.abort(); passStageOffer(); if(takeStageUp()){ render(); top0(); cue("stage"); return; } closeStageUp(); if(takeStop()){ render(); top0(); cue("definition",{soft:state.ui.stop.why!=="new"}); return; } if(state.ui&&state.ui.debate) advanceDebate(); else if(state.ui&&state.ui.find) advanceFind(); else if(state.ui&&state.ui.cats) advanceCategories(); else if(state.ui&&state.ui.inst) advanceInstance(); else if(state.ui&&state.ui.syllogism) advanceSyllogism(); else advance(); takeCarry(); render(); top0(); if(sound) cue("next"); }
/** What a result that was not shown left due (moveOn) goes on the next attempt drawn, to show on its result. */
function takeCarry(){ const k=state.carry, u=state.ui; state.carry=null; if(!k||!u) return; if(k.offer&&!u.offer) u.offer=k.offer; if(k.guideDown&&!u.guideDown) u.guideDown=k.guideDown; }
/**
 * A time-up with nothing answered at None (domain/sprint.ts, timeUpView): the answer is kept as Sprint counts it, and the next question comes with no result in between
 * (the time-up sound was played). A stage offer or a step of the guidance that this answer made due waits for the result of the next question drawn (`state.carry`), past
 * a course term's stop or a stage's station that comes first; an offer of a negation step is not spent, so the run offers it again.
 */
export function moveOn(){
  const u=state.ui; if(!u) return;
  if(u.offer||u.guideDown) state.carry={offer:u.offer||null, guideDown:u.guideDown||null};
  u.offer=null; u.guideDown=null; u.negOffer=null; u.passOn=true;
  next(false);
}
