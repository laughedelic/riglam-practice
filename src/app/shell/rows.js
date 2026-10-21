import { el } from "../core/dom.js";
import { ico } from "../core/icons.js";

/* ---------- the rows of a settings list (Options, and the settings of an exercise) ---------- */
// one setting: its label (with an optional small icon), a note or a popover, and its control
export const settingRow=(label,ctl,note,icon,pop)=>el("div",{class:"orow"},el("span",{class:"tl"},icon?ico(icon):null,label),pop||null,el("div",{class:"octl"},ctl,note?(typeof note==="string"?el("p",{class:"onote",text:note}):note):null));
// a segmented choice: one button pressed
export const segOf=(label,rows,cur_,on)=>el("div",{class:"seg",role:"group","aria-label":label},
  rows.map(([k,l])=>el("button",{type:"button","aria-pressed":cur_===k?"true":"false",onclick:()=>on(k),text:l})));
// an on/off switch with its label and a word for its state
export const switchOf=(label,word,on,toggle)=>el("button",{type:"button",class:"sw",role:"switch","aria-checked":on?"true":"false",onclick:toggle},el("i",{class:"knob","aria-hidden":"true"}),el("span",{class:"swl",text:label}),el("span",{class:"swt",text:word}));
