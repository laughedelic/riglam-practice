import { state } from "../state.js";
import { el } from "../core/dom.js";
import { stageCounts } from "../../domain/reference.ts";
import { STAGES, itemStage, toggleStage, topStage } from "../../domain/stages.ts";
import { render } from "./render.js";

/** How many pairs lean to three possibilities after the highest stage goes up (`fresh` of the draw, practice/universe.js). */
const LEAN=5;
const store=(key,v)=>{ try{ localStorage.setItem(key,v); }catch(e){} };

/** Sets the stages every exercise draws from. When the highest one goes up, its first pairs lean to three possibilities. */
export function setStages(stages){
  const up=topStage(stages)>topStage(state.stages);
  state.stages=stages; store("rd-stages",stages.join(","));
  if(up){ state.stageLean=LEAN; store("rd-stage-lean",String(LEAN)); }
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

/**
 * The switches of the stages (practice options, Stages): one per stage, with its name, what it adds, and how many things this device has of it
 * (the practice items, and the reference examples where the device holds them). Any mix can be on; the last one on stays on.
 */
export function stageSwitches(){
  const ex=state.EX?stageCounts(state.EX.items):{}, items={}, only=state.stages.length===1;
  for(const it of state.DATA?state.DATA.items:[]) if(!it.nosubject) items[itemStage(it)]=(items[itemStage(it)]||0)+1;
  return el("div",{class:"lvls"},
    STAGES.map(({n,name,adds})=>{
      const on=state.stages.includes(n), count=(items[n]||0)+(ex[n]||0);
      return el("div",{class:"lvl"},
        el("button",{type:"button",class:"sw",role:"switch","aria-checked":on?"true":"false","aria-disabled":on&&only?"true":null,onclick:()=>setStages(toggleStage(state.stages,n))},
          el("i",{class:"knob","aria-hidden":"true"}),el("span",{class:"swl",text:"Stage "+n+" · "+name}),el("span",{class:"swt",text:count+(count===1?" thing":" things")})),
        el("p",{class:"onote",text:adds}));
    }),
    only?el("p",{class:"onote",text:"At least one stage stays on."}):null);
}
