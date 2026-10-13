export { cap, gradeOf, isMiss, pick } from "../../domain/util.ts";
export const pairsOf=b=>Array.isArray(b&&b.pairs)?b.pairs:[];
export const dayOf=iso=>(iso||"").slice(0,10);
export const today=()=>new Date().toISOString().slice(0,10);
