import { state } from "../state.js";
import { STAGES, topStage } from "../../domain/stages.ts";
import { render } from "./render.js";
import { stopsStageUp } from "../practice/stops.ts";
import { saveProgress } from "../practice/progress.ts";

/** How many pairs lean to three possibilities after the highest stage goes up (`fresh` of the draw, practice/universe.js). */
const LEAN=5;
const store=(key,v)=>{ try{ localStorage.setItem(key,v); }catch(e){} };

/**
 * Sets the stages every exercise draws from. When the highest one goes up, its first pairs lean to three possibilities. What a device kept from
 * before the ladder (the even draw, everyday syllogisms) gives way to the stages the learner now picks.
 */
export function setStages(stages){
  const up=topStage(stages)>topStage(state.stages);
  state.stages=stages; store("rd-stages",stages.join(","));
  if(state.stagesKept||state.syllogismEveryday){ state.stagesKept=state.syllogismEveryday=false; try{ localStorage.removeItem("rd-stages-kept"); localStorage.removeItem("rd-syllogism-level"); }catch(e){} }
  if(up){ state.stageLean=LEAN; store("rd-stage-lean",String(LEAN)); stopsStageUp(); }     // and its first term comes at the next pull (practice/stops.ts)
  saveProgress();
  render();
}
/** One pair of the lean is spent; true while the lean lasts. */
export function spendLean(){
  if(state.stageLean<=0) return false;
  state.stageLean--; store("rd-stage-lean",String(state.stageLean));
  return true;
}

/** The name of a stage, for the offers and the lines that say what changed. */
export const stageName=n=>(STAGES.find(s=>s.n===n)||{name:""}).name;
