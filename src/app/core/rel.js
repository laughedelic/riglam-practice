import { state } from "../state.js";

export const lcRel=s=>s.replace(/^[A-Z]/,c=>c.toLowerCase());
export const REL = {
  mi:   {code:"MI", name:"Mutually inclusive", gloss:(a,b)=>"All "+a+" are "+b+", and all "+b+" are "+a, sets:["=","",""], logic:["⇔","",""], empty:["anb","bna"]},
  con:  {code:"MX", name:"Mutually exclusive", gloss:()=>"Nothing is both", sets:["∩","","= ∅"], logic:["⇒","¬",""], empty:["both"]},
  "3ab":{code:"3P", name:"Three possibilities, A in B", gloss:(a,b)=>"All "+a+" are "+b+", not the reverse", sets:["⊂","",""], logic:["⇒","",""], empty:["anb"]},
  "3ba":{code:"3P", name:"Three possibilities, B in A", gloss:(a,b)=>"All "+b+" are "+a+", not the reverse", sets:["⊃","",""], logic:["⇐","",""], empty:["bna"]},
  "4":  {code:"4P", name:"Four possibilities", gloss:()=>"They overlap; neither contains the other", sets:["∩","","≠ ∅"], logic:["⇏","¬",""], empty:[]}
};
export const ORDER=["mi","3ab","3ba","4","con"];
export const CELLS=["both","anb","bna","nei"];
const fmtN=n=>("A "+n[0]+" "+n[1]+"B"+(n[2]?" "+n[2]:"")).replace(/\s+/g," ");
export const notaParts=k=>REL[k]?(state.nota==="sets"?REL[k].sets:state.nota==="logic"?REL[k].logic:[REL[k].code,"",""]):null;
export const notaOf=k=>{const n=notaParts(k); return n?(state.nota==="codes"?n[0]:fmtN(n)):"";};
// A non-existent (the horn of a rabbit) is a possibility in the "neither" cell, as the class takes it, so that cell
// always has a reference even for old saved pairs that stored none. Perdue 1992:393 and 2014:1026.
const RABBIT="the horn of a rabbit";
export function refOf(p,c){ const k=p.ex&&p.ex[c]; return k||(c==="nei"?RABBIT:null); }
export function cellLabel(c,p){return {both:"both", anb:p.a+", not "+p.b, bna:p.b+", not "+p.a, nei:"neither"}[c];}
