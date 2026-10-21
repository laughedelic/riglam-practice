export { cap, gradeOf, isMiss, pick } from "../../domain/util.ts";
export const pairsOf=b=>Array.isArray(b&&b.pairs)?b.pairs:[];
export const dayOf=iso=>(iso||"").slice(0,10);
export const today=()=>new Date().toISOString().slice(0,10);
// an answer of the pair-finding exercise (src/app/find): kept in the collection "answers" like the Relations answers, and told apart by its mode
export const isFind=a=>!!a&&a.mode==="find";
// an answer of the Syllogisms exercise (src/app/syllogism): kept in "answers" with its own mode, and left out of the Relations lists like Find a pair's
/** @type {(a: any) => a is import("../types.ts").SyllogismDoc} */
export const isSyllogism=a=>!!a&&a.mode==="syllogism";
// an answer of the Categories exercise (src/app/categories): kept in "answers" with its own mode, and left out of the Relations lists like Find a pair's
/** @type {(a: any) => a is import("../types.ts").CategoriesDoc} */
export const isCategories=a=>!!a&&a.mode==="categories";
