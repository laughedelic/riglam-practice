export { cap, gradeOf, isMiss, pick } from "../../domain/util.ts";
export const pairsOf=b=>Array.isArray(b&&b.pairs)?b.pairs:[];
export const dayOf=iso=>(iso||"").slice(0,10);
export const today=()=>new Date().toISOString().slice(0,10);
// an answer of the pair-finding exercise (src/app/find): kept in the collection "answers" like the Relations answers, and told apart by its mode
export const isFind=a=>!!a&&a.mode==="find";
