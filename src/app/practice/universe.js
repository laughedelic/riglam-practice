import { state } from "../state.js";
import { catKey, hiddenKeys } from "./skips.js";
import { catByLabel as byLabel, makeIndex, matchItem as itemFor, norm, pairCats as catsOf } from "../../ai-shared/lookup.ts";
import { buildPool as poolOf, nextPair } from "../../domain/universe.ts";

/* ---------- the practice universe ---------- */
// The lookup tables and the matching of words to items and categories are in src/ai-shared, where the tutor code
// shares them; the pool of category pairs and the draw of the next pair are in src/domain. Both are functions of the
// term data, and the page passes `state` as the index (it holds DATA, CAT, ITEMIDX, ALIASIDX and LABELIDX).
export { norm };
export function indexData(){ Object.assign(state,makeIndex(state.DATA)); }
export function catByLabel(l){ return byLabel(state,l); }
export function pairCats(p){ return catsOf(state,p); }
export function matchItem(text,exactOnly){ return itemFor(state,text,exactOnly); }
export function buildPool(){ state.POOL=poolOf(state); }
export function answerList(){ return Object.values(state.answers).sort((x,y)=>(x.at||"").localeCompare(y.at||"")); }
/** @returns {import("../types.ts").Pair} */
export function nextGenerated(hist){
  const hide=hiddenKeys();                // pairs skipped lately stay out, unless nothing else of the relation is left
  return nextPair(state,state.POOL,{hist:hist||answerList(), recent:state.recent, isHidden:c=>hide.has(catKey(c.a,c.b))});
}
