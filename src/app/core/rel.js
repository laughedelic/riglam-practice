import { state } from "../state.js";
import { REL, CELLS, refOf, cellLabel } from "../../ai-shared/relations.ts";

// The relations, the grid cells and the helpers the tutor card shares are in src/ai-shared; the page only adds its notations.
export { REL, CELLS, refOf, cellLabel };
export const lcRel=s=>s.replace(/^[A-Z]/,c=>c.toLowerCase());
export const ORDER=["mi","3ab","3ba","4","con"];
/** The relations offered for a pair: a pair with a negated side also has four possibilities without neither, as key 6. */
export const orderOf=p=>p&&p.neg?[...ORDER,"4n"]:ORDER;
const fmtN=n=>("A "+n[0]+" "+n[1]+"B"+(n[2]?" "+n[2]:"")).replace(/\s+/g," ");
export const notaParts=k=>REL[k]?(state.nota==="sets"?REL[k].sets:state.nota==="logic"?REL[k].logic:[REL[k].code,"",""]):null;
export const notaOf=k=>{const n=notaParts(k); return n?(state.nota==="codes"?n[0]:fmtN(n)):"";};
