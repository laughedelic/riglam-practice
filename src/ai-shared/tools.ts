// The two lookup tools the tutor can call while it answers: a term in the course data, and an example in the practice
// list (or, where the server has them, the course's reference examples). A tool works on a data index, so the page runs it
// on its own state and the Worker on an index it builds.
import { exampleFacts, examplesFor, matchExamples, upTo } from "./examples";
import type { ExampleIndex } from "./examples";
import { termFacts } from "./facts";
import { matchItem, spelled, upChain } from "./lookup";
import type { DataIndex } from "./lookup";

/** A tool in the shape the `sample` capability takes (and the Messages API: name, description, JSON schema). */
export interface TutorTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** the result is serialized for the model; an error is reported to it as the tool result */
  execute: (input: unknown) => unknown;
}

const ALIAS = " For words that name a list item only through an alias (matched_by_alias), only its Dudra type and chain: never its name, its other categories or its details.";
const CLASSIFY = "Check how the practice list classifies a concrete thing (e.g. 'a dog', 'the smell of coffee'). Returns its Dudra type and the practice categories it belongs to, or found:false if the list does not contain it." + ALIAS;
const CLASSIFY_REFERENCE = "Check how the practice list, or else the course's reference examples, classify a concrete thing (e.g. 'a dog', 'the smell of coffee'). From the list: its Dudra type and the practice categories it belongs to." + ALIAS + " From the reference examples (source: \"reference\"): the classes it is an instance of, each with its chain up to Existent, the classes it is not, its level (1 plain to 4), kind, how well the sources confirm it, and why it is a good example; when two examples share the name, both, marked ambiguous. found:false when neither has it.";

const EXAMPLES_OF = "Give examples of a Dudra term from the course's reference examples (e.g. 'External form', 'Color'): the instances of the term itself first, then those of its subclasses (`of` names the subclass), the plainest first. Each has its level (1 a plain thing to 4), kind, how well the sources confirm it (confirmed, textbook, commentator) and, for most, why it is a good example. `level` is the highest level to take (default 2; raise it for a learner who asks for harder ones), `count` at most 5 (default 3). Use it for 'give me an example of X' and to pick an example that fits the learner. found:false when the name is not a term of the course data; examples:[] when there are none up to that level (`harder` says whether higher levels have some).";

/** The term of the data a name means: its name, an alias or its Russian name, else a name that contains the words. */
function termByName(ix: DataIndex, q: string) {
  const ts = Object.values(ix.DATA.terms);
  return ts.find((t) => spelled(t.name) === q) || ts.find((t) => (t.aliases || []).some((a) => spelled(a) === q)) || ts.find((t) => spelled(t.ru) === q) || ts.find((t) => spelled(t.name).includes(q));
}

/** The tools on the data index; `examples`, the reference examples where the caller has them, is where classify_example looks after the practice list. */
export function tutorTools(ix: DataIndex, examples?: ExampleIndex | null): TutorTool[] {
  return [
    {name:"lookup_term", description:"Look up a Dudra term in the course booklet's term data. Returns its definition (English, Russian), chapter, place in the hierarchy, mutually inclusive and contradictory terms, the terms it is included in (three possibilities), the terms it has four possibilities with, and the knowledge base's note. Use it for any term not on the card.",
     inputSchema:{type:"object",properties:{name:{type:"string",description:"Term in English, e.g. 'Non-associated compositional factor', or in Russian"}},required:["name"]},
     execute:(input)=>{
       const q=spelled((input as {name?: unknown}|null|undefined)?.name); if(!q) throw new Error("empty name");
       const hit=termByName(ix,q);
       if(!hit) return {found:false, close:Object.values(ix.DATA.terms).filter(t=>spelled(t.name).split(" ").some(w=>q.includes(w)&&w.length>3)).slice(0,8).map(t=>t.name)};
       return Object.assign({found:true}, termFacts(ix,hit.name));
     }},
    {name:"classify_example", description:examples?CLASSIFY_REFERENCE:CLASSIFY,
     inputSchema:{type:"object",properties:{thing:{type:"string"}},required:["thing"]},
     execute:(input)=>{
       const thing=(input as {thing?: unknown}|null|undefined)?.thing;
       const it=matchItem(ix,thing), exact=!!it&&!!matchItem(ix,thing,true);
       if(it&&exact) return {found:true, item:it.n, existent:!it.ne, dudra_type:it.t, chain:(ix.DATA.chains[it.t]||[it.t]).join(" > "), categories:it.c.map(c=>ix.CAT[c].labels[0]),
         ...(it.may?.length?{name_leaves_open:it.may.map(c=>ix.CAT[c].labels[0])}:{})};
       const refs=examples?matchExamples(examples,thing):[];
       // Words that name a list item only through an alias ("an apple" for "a red apple") are shorter than the item: its type and chain hold,
       // its name and its other categories and details (color, shape, material, temperature) are not what was asked about, as in the card
       // (card.ts, listedAs). A reference example of that name comes first, as on the page (nameOf, src/domain/instance.ts).
       if(it&&!refs.length) return {found:true, matched_by_alias:true, existent:!it.ne, dudra_type:it.t, chain:(ix.DATA.chains[it.t]||[it.t]).join(" > "),
         note:"The words are an alias for an item in the practice list. Take only its type and chain from it, never its color, shape, material, temperature or other details: judge the words as written, and a quality they do not name is open."};
       if(!refs.length) return {found:false};
       if(refs.length===1) return {found:true, source:"reference", ...exampleFacts(ix,refs[0])};
       return {found:true, source:"reference", ambiguous:true, candidates:refs.slice(0,4).map(r=>exampleFacts(ix,r))};
     }},
    ...(examples?[{name:"examples_of", description:EXAMPLES_OF,
     inputSchema:{type:"object",properties:{term:{type:"string",description:"Term in English or Russian, e.g. 'External form'"},level:{type:"integer",minimum:1,maximum:4,description:"the highest level of example to take (default 2)"},count:{type:"integer",minimum:1,maximum:5,description:"how many (default 3)"}},required:["term"]},
     execute:(input)=>{
       const a=(input??{}) as {term?: unknown; level?: unknown; count?: unknown};
       const q=spelled(a.term); if(!q) throw new Error("empty term");
       const hit=termByName(ix,q);
       if(!hit) return {found:false};
       const num=(v:unknown,lo:number,hi:number,dflt:number)=>typeof v==="number"&&Number.isFinite(v)?Math.min(hi,Math.max(lo,Math.round(v))):dflt;
       const cap=num(a.level,1,4,2), count=num(a.count,1,5,3);
       const of=(cls:string[]|undefined)=>{ const c=(cls??[]).filter(x=>upChain(ix,x).includes(hit.name)); return c.includes(hit.name)?hit.name:c[0]; };
       const list=examplesFor(ix,examples.items,hit.name,count,upTo(cap));
       return {found:true, term:hit.name, level_cap:cap,
         examples:list.map(e=>({item:e.n, level:e.lv, ...(e.k?{kind:e.k}:{}), ...(e.cf?{confirmation:e.cf}:{}), of:of(e.cls), ...(e.gloss?{why:e.gloss}:{})})),
         harder:examplesFor(ix,examples.items,hit.name,1000).some(e=>e.lv>cap)};
     }} as TutorTool]:[]),
  ];
}
