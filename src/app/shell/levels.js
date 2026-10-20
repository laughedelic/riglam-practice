import { state } from "../state.js";
import { LEVEL_INFO } from "../core/examples.js";
import { el } from "../core/dom.js";
import { levelCounts, toggleLevel } from "../../domain/reference.ts";
import { render } from "./render.js";

function setExLevels(levels){ state.exLevels=levels; try{ localStorage.setItem("rd-exlevels",levels.join(",")); }catch(e){} render(); }

/**
 * The switches of the levels of the reference examples (Options): one per level, with what the level is and how many examples it has.
 * Any mix can be on; the last one on stays on. Needs `state.EX`.
 */
export function levelSwitches(){
  const counts=levelCounts(state.EX.items), only=state.exLevels.length===1;
  return el("div",{class:"lvls"},
    Object.entries(LEVEL_INFO).map(([k,[name,text]])=>{
      const l=+k, on=state.exLevels.includes(l);
      return el("div",{class:"lvl"},
        el("button",{type:"button",class:"sw",role:"switch","aria-checked":on?"true":"false","aria-disabled":on&&only?"true":null,onclick:()=>setExLevels(toggleLevel(state.exLevels,l))},
          el("i",{class:"knob","aria-hidden":"true"}),el("span",{class:"swl",text:"Level "+l+" · "+name}),el("span",{class:"swt",text:counts[l]+(counts[l]===1?" example":" examples")})),
        el("p",{class:"onote",text}));
    }),
    only?el("p",{class:"onote",text:"At least one level stays on."}):null);
}
