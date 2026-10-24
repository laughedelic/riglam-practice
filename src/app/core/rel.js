import { state } from "../state.js";
import { REL, CELLS, refOf, cellLabel } from "../../ai-shared/relations.ts";

// The relations, the grid cells and the helpers the tutor card shares are in src/ai-shared; the page only adds its notations.
export { REL, CELLS, refOf, cellLabel };
export const lcRel=s=>s.replace(/^[A-Z]/,c=>c.toLowerCase());
export const ORDER=["mi","3ab","3ba","4","con"];
/** An answer, favorite, skip or flag saved on a preview that had a sixth relation, four possibilities without neither: it counts as four possibilities, its cells as they were. */
export const fromSixth=d=>{
  if(!d||typeof d!=="object") return d;
  const o={...d};
  for(const k of ["chosen","key","implied","relation","asked"]) if(o[k]==="4n") o[k]="4";
  if(o.pair&&o.pair.relation==="4n") o.pair={...o.pair,relation:"4"};
  return o;
};
const fmtN=n=>("A "+n[0]+" "+n[1]+"B"+(n[2]?" "+n[2]:"")).replace(/\s+/g," ");
export const notaParts=k=>REL[k]?(state.nota==="sets"?REL[k].sets:state.nota==="logic"?REL[k].logic:[REL[k].code,"",""]):null;
export const notaOf=k=>{const n=notaParts(k); return n?(state.nota==="codes"?n[0]:fmtN(n)):"";};
